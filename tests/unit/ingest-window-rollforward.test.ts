// Production defect, observed live on 2026-08-12/13 by driving `runIngestOnce`
// twice against real Open-Meteo data:
//
//   FIRST  = prediction_created:   predictions/v1/dt=2026-08-12/.../cyc=18Z/all.jsonl.gz
//   SECOND = prediction_duplicate: predictions/v1/dt=2026-08-12/.../cyc=18Z/all.jsonl.gz
//   STORED_VALID_TS = ["2026-08-12T18:00Z","2026-08-13T18:00Z"]
//
// The archive key was derived from `member.run_ts` alone (adr-prediction-log-
// format.md decision 1). The provider asks for whole forecast DAYS in UTC
// (`forecast_days` in open-meteo-source.ts), so the rolling window advances at
// UTC midnight while the attributed cycle stays put until the next 6-hourly
// cycle clears its publication latency. Between those two instants a fetch
// carries NEW forecast hours under the SAME run stamp. It hashed to the same
// key, the conditional PUT answered already-exists, and the newly arrived
// later-day rows were silently discarded. The build then never saw tomorrow
// and refused with "missing complete today or tomorrow ranking" every hour.
//
// The law these tests pin, and the reason the fix is delicate: a repeated run
// must NEVER rewrite history (HANDOFF section 3, domain-model.md section 5,
// "insert-only; no UPDATE, no DELETE, no exceptions"). Appending forecast
// hours the same run emitted later is not rewriting history. Restating an
// already-archived hour with a different wave forecast IS, and must be
// refused rather than filed under a fresh key.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { runBuildOnce } from '../../src/pipeline/build';
import { runIngestOnce } from '../../src/pipeline/ingest';
import { ARCHIVE_REWRITE_REFUSED_EVENT, deriveIngestLogLines } from '../../src/pipeline/lambda/log-events';
import type {
  BuildStore,
  Clock,
  ForecastSource,
  IngestStore,
  IngestOutcome,
  MemberSeries,
  RawArchiveRecord,
  ReceivedSourcePayload,
  SourceResult,
  TideHour,
  WindHour,
} from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const SPOT_ID = 'playa-venao';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const PREDICTION_PREFIX = 'predictions/v1/';

/** The live sequence: cycle 18Z on Aug 12, fetched either side of UTC midnight. */
const RUN_TS = '2026-08-12T18:00Z';
const BEFORE_MIDNIGHT = '2026-08-12T23:10:00Z';
const AFTER_MIDNIGHT = '2026-08-13T01:10:00Z';
const DAY_ONE = '2026-08-12';
const DAY_TWO = '2026-08-13';
const DAY_THREE = '2026-08-14';
/** 09:22 in Panama on 2026-08-13: the morning the live builds were refusing. */
const BUILD_INSTANT = '2026-08-13T14:22:00Z';

type Swell = { readonly h_m: number; readonly t_s: number; readonly dir_deg: number };

/**
 * The forecast for an hour is a function of the hour, never of which fetch
 * saw it: one model cycle predicting one hour states one thing. Consecutive
 * days always land on different entries, so today and tomorrow can never
 * collapse into the build's "tomorrow duplicates today" refusal.
 */
const SWELLS: readonly Swell[] = [
  { h_m: 2.1, t_s: 16, dir_deg: 180 },
  { h_m: 1.5, t_s: 15, dir_deg: 180 },
  { h_m: 0.6, t_s: 12, dir_deg: 180 },
];

function swellFor(date: string): Swell {
  return SWELLS[Number(date.slice(8, 10)) % SWELLS.length]!;
}

type PredictionRow = {
  readonly spot_id: string;
  readonly source: string;
  readonly run_ts: string;
  readonly valid_ts: string;
  readonly swell_h_m: number;
  readonly swell_t_s: number;
  readonly swell_dir_deg: number;
  readonly wind_speed_kt: number | null;
  readonly fetched_ts: string;
};

class InMemoryStore implements IngestStore, BuildStore {
  readonly objects = new Map<string, string>();

  /** S3 If-None-Match:* semantics: the first write wins and is never overwritten. */
  private putIfAbsent(key: string, body: string): 'created' | 'already-exists' {
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }

  async putRawIfAbsent(record: RawArchiveRecord): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(record.key, record.verbatim);
  }

  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(key, body);
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(): Promise<string | null> {
    return null;
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    return this.putIfAbsent(key, body);
  }

  async putBundle(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  predictionKeys(): string[] {
    return [...this.objects.keys()].filter((key) => key.startsWith(PREDICTION_PREFIX)).sort();
  }

  archivedRows(): PredictionRow[] {
    return this.predictionKeys().flatMap((key) => (this.objects.get(key) ?? '')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as PredictionRow));
  }

  /** The archive's exact bytes, so a later run can be proved to have left them alone. */
  archiveSnapshot(): Map<string, string> {
    return new Map(this.predictionKeys().map((key) => [key, this.objects.get(key)!]));
  }
}

/**
 * One provider cycle seen through a stated forecast window. `runTs` is the
 * attributed model cycle; `days` is the window that cycle's response covered
 * at the moment of THIS fetch. The two move independently, which is the whole
 * defect.
 */
class WindowedSource implements ForecastSource {
  constructor(
    private readonly runTs: string,
    private readonly days: readonly string[],
    private readonly windKt: number = 6,
    private readonly swellOverrides: Readonly<Record<string, Swell>> = {},
  ) {}

  private hourOf(date: string): string {
    return `${date}T18:00Z`;
  }

  async fetchWavePayload(): Promise<ReceivedSourcePayload> {
    return { ok: true, verbatim: JSON.stringify({ provider: 'open-meteo-marine', run_ts: this.runTs, days: this.days }) };
  }

  parseWaveMembers(): SourceResult<MemberSeries[]> {
    return {
      ok: true,
      data: MEMBER_SOURCES.map((source): MemberSeries => ({
        source,
        run_ts: this.runTs,
        hours: this.days.map((date) => ({
          valid_ts: this.hourOf(date),
          swell: this.swellOverrides[date] ?? swellFor(date),
          swell2: null,
          land_masked: false,
        })),
      })),
    };
  }

  async fetchWindPayload(): Promise<ReceivedSourcePayload> {
    return { ok: true, verbatim: JSON.stringify({ provider: 'open-meteo-wind', days: this.days }) };
  }

  parseWind(): SourceResult<WindHour[]> {
    return { ok: true, data: this.days.map((date): WindHour => ({ valid_ts: this.hourOf(date), wind: { speed_kt: this.windKt, dir_deg: 40 } })) };
  }

  async fetchTidePayload(): Promise<ReceivedSourcePayload> {
    return { ok: true, verbatim: JSON.stringify({ provider: 'coops', days: this.days }) };
  }

  parseTide(): SourceResult<TideHour[]> {
    return { ok: true, data: [] };
  }
}

function seed(): SpotSeed {
  return {
    spot_id: SPOT_ID,
    name: 'Playa Venao',
    region_id: 'pa-pacific',
    timezone: 'America/Panama',
    shore_normal_deg: 175,
    swell_window_deg: [150, 210],
    h_ref_m: 1.3,
    s_size: 0.5,
    wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
    tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
  };
}

async function ingest(store: InMemoryStore, source: ForecastSource, at: string): Promise<IngestOutcome> {
  const clock: Clock = { now: () => new Date(at) };
  return runIngestOnce({ source, store, clock, spots: [seed()], execution_id: `evt-${at.replace(/[^a-z0-9]/gi, '').toLowerCase()}` });
}

function hoursHeldFor(store: InMemoryStore, source: string): string[] {
  return [...new Set(store.archivedRows().filter((row) => row.source === source).map((row) => row.valid_ts))].sort();
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

describe('a forecast window that rolls forward under an unchanged model cycle', () => {
  it('Property: every forecast hour the same cycle emits survives the archive, whenever the window widens', async () => {
    // The law: the archive loses nothing a run genuinely fetched. The second
    // fetch carries a later day the first never saw; that day must be in the
    // log afterwards, whatever hour the cycle was stamped with. Pre-fix, the
    // second fetch hashes to the first fetch's key, the conditional PUT
    // answers already-exists, and the later day is dropped on the floor.
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('00', '06', '12', '18'), fc.integer({ min: 0, max: 2 }), async (cycleHour, dayOffset) => {
        const day1 = shiftDate(DAY_ONE, dayOffset);
        const day2 = shiftDate(day1, 1);
        const day3 = shiftDate(day1, 2);
        const runTs = `${day1}T${cycleHour}:00Z`;
        const firstAt = new Date(Date.parse(runTs) + 3_600_000).toISOString();
        const secondAt = new Date(Date.parse(runTs) + 8 * 3_600_000).toISOString();

        const store = new InMemoryStore();
        const first = await ingest(store, new WindowedSource(runTs, [day1, day2]), firstAt);
        const second = await ingest(store, new WindowedSource(runTs, [day2, day3]), secondAt);

        for (const source of MEMBER_SOURCES) {
          assert.deepEqual(
            hoursHeldFor(store, source),
            [`${day1}T18:00Z`, `${day2}T18:00Z`, `${day3}T18:00Z`],
            `The archive must hold every hour cycle ${runTs} emitted across both fetches for ${source}. `
            + `Held ${JSON.stringify(hoursHeldFor(store, source))}. `
            + `First run events ${JSON.stringify(first.events.map((event) => event.type))}, `
            + `second run events ${JSON.stringify(second.events.map((event) => event.type))}.`,
          );
        }
      }),
      { numRuns: 12 },
    );
  });

  it('lets the site publish today and tomorrow after the window rolled across UTC midnight', async () => {
    // The consequence the surfer feels. This is the live outage end to end:
    // two fetches of cycle 18Z either side of UTC midnight, then the 09:22
    // Panama build. Pre-fix the build refuses with "missing complete today or
    // tomorrow ranking" because Aug 14 never reached the archive.
    const store = new InMemoryStore();
    await ingest(store, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO]), BEFORE_MIDNIGHT);
    await ingest(store, new WindowedSource(RUN_TS, [DAY_TWO, DAY_THREE]), AFTER_MIDNIGHT);

    const outcome = await runBuildOnce({
      store,
      clock: { now: () => new Date(BUILD_INSTANT) },
      region_id: 'pa-pacific',
      spots: [seed()],
    });

    assert.equal(outcome.published, true, `The build must publish once the archive holds both days. Got ${JSON.stringify(outcome)}.`);

    const bundle = store.objects.get('pub/v1/regions/pa-pacific/bundle.json');
    assert.ok(bundle, 'A published build writes the region bundle.');
    const days = (JSON.parse(bundle) as { publish_surface: { days: { date: string }[] } }).publish_surface.days.map((day) => day.date);
    assert.deepEqual(days, [DAY_TWO, DAY_THREE], 'The published surface must carry the Panama civil day and the one after it.');
  });

  it('files a widened window as its own object and never rewrites the first receipt', async () => {
    // Write-once is the invariant the whole product rests on. The rollforward
    // must ADD an object, never touch the bytes of one already filed.
    const store = new InMemoryStore();
    await ingest(store, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO]), BEFORE_MIDNIGHT);
    const firstReceipt = store.archiveSnapshot();

    await ingest(store, new WindowedSource(RUN_TS, [DAY_TWO, DAY_THREE]), AFTER_MIDNIGHT);

    for (const [key, body] of firstReceipt) {
      assert.equal(store.objects.get(key), body, `The first receipt at ${key} must be byte-identical after a later run.`);
    }
    assert.ok(
      store.predictionKeys().length > firstReceipt.size,
      `The widened window must be filed as a new object. Keys: ${JSON.stringify(store.predictionKeys())}.`,
    );
    for (const key of store.predictionKeys()) {
      assert.match(key, /^predictions\/v1\/dt=2026-08-12\/src=[a-z0-9_]+\/cyc=18Z\/[^/]+\.jsonl\.gz$/, 'Every object stays inside its own run partition, at the layout depth the archive already uses.');
    }
  });

  it('refuses to file a restated hour that contradicts an already-archived forecast', async () => {
    // The other half of the invariant. A new key must not become a back door
    // for rewriting history: the same cycle restating an hour it already
    // filed, with a different wave forecast, is refused outright rather than
    // archived twice with two answers.
    const store = new InMemoryStore();
    await ingest(store, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO]), BEFORE_MIDNIGHT);
    const firstReceipt = store.archiveSnapshot();

    const contradiction = { h_m: 9.9, t_s: 20, dir_deg: 180 };
    const outcome = await ingest(
      store,
      new WindowedSource(RUN_TS, [DAY_TWO, DAY_THREE], 6, { [DAY_TWO]: contradiction }),
      AFTER_MIDNIGHT,
    );

    for (const [key, body] of firstReceipt) {
      assert.equal(store.objects.get(key), body, `The archived receipt at ${key} must survive a contradicting run untouched.`);
    }
    const restated = store.archivedRows().filter((row) => row.valid_ts === `${DAY_TWO}T18:00Z` && row.swell_h_m === contradiction.h_m);
    assert.deepEqual(restated, [], 'A contradicted hour must not reach the archive under any key.');
    assert.ok(
      outcome.events.some((event) => event.type === 'prediction_rewrite_refused'),
      `The refusal must be stated, not silent. Events: ${JSON.stringify(outcome.events)}.`,
    );
    // The health line the operator reads. Asserted against the exported
    // constant so the two spellings can never drift apart silently.
    assert.ok(
      deriveIngestLogLines(outcome).some((line) => line.event === ARCHIVE_REWRITE_REFUSED_EVENT),
      `The refusal must reach the structured log. Lines: ${JSON.stringify(deriveIngestLogLines(outcome))}.`,
    );
  });

  it('does not mistake a fresh observation of wind or a new fetch stamp for a contradiction', async () => {
    // Falsifiability guard for the guard. `fetched_ts` is audit metadata
    // (domain-model.md section 5.1) and wind is a contemporaneous join from a
    // provider with its own cycle: both legitimately differ between two looks
    // at the same wave cycle. If either counted as rewriting history, every
    // real rollforward would be refused and this fix would restore the bug it
    // was written to close.
    const store = new InMemoryStore();
    await ingest(store, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO], 6), BEFORE_MIDNIGHT);
    const outcome = await ingest(store, new WindowedSource(RUN_TS, [DAY_TWO, DAY_THREE], 14), AFTER_MIDNIGHT);

    assert.deepEqual(
      outcome.events.filter((event) => event.type === 'prediction_rewrite_refused'),
      [],
      'A re-observed wind speed and a later fetch stamp are not a changed forecast.',
    );
    for (const source of MEMBER_SOURCES) {
      assert.ok(
        hoursHeldFor(store, source).includes(`${DAY_THREE}T18:00Z`),
        `The rollforward must still land for ${source}. Held ${JSON.stringify(hoursHeldFor(store, source))}.`,
      );
    }
  });

  it('Property: the same covered hours always produce the same object, named and byte for byte', async () => {
    // What makes conditional PUT meaningful after this change: the NAME is a
    // pure function of the covered hours and the BYTES are a pure function of
    // the fetch. If the name were canonical while the body was not, two
    // payloads differing only in hour order would share a key, disagree on
    // content, and the loser's bytes would be dropped -- the same silent loss
    // this whole change exists to end.
    const reference = new InMemoryStore();
    await ingest(reference, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO]), BEFORE_MIDNIGHT);
    const expected = reference.archiveSnapshot();

    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray([DAY_ONE, DAY_TWO], { minLength: 2, maxLength: 2 }),
        fc.boolean(),
        async (shuffled, repeatFirst) => {
          const days = repeatFirst ? [...shuffled, shuffled[0]!] : shuffled;
          const store = new InMemoryStore();
          await ingest(store, new WindowedSource(RUN_TS, days), BEFORE_MIDNIGHT);
          assert.deepEqual(
            store.archiveSnapshot(),
            expected,
            `Covering ${JSON.stringify(days)} states the same forecast for the same hours; the object must not depend on the order they arrived in.`,
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it('Property: an unchanged window under an unchanged cycle stays exactly one receipt', async () => {
    // Idempotency is not traded away for the fix. The object's name is a pure
    // function of the cycle and the window it covered, so repeating the same
    // fetch any number of times can only land on the same key.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (runs) => {
        const store = new InMemoryStore();
        await ingest(store, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO]), BEFORE_MIDNIGHT);
        const afterFirst = store.archiveSnapshot();

        for (let run = 1; run < runs; run += 1) {
          const outcome = await ingest(store, new WindowedSource(RUN_TS, [DAY_ONE, DAY_TWO]), AFTER_MIDNIGHT);
          assert.deepEqual(
            outcome.events.filter((event) => event.type === 'prediction_rewrite_refused'),
            [],
            'Repeating a fetch verbatim is never a rewrite.',
          );
        }

        assert.deepEqual(
          store.archiveSnapshot(),
          afterFirst,
          `${runs} identical fetches must leave exactly the first receipt. Keys: ${JSON.stringify(store.predictionKeys())}.`,
        );
      }),
      { numRuns: 6 },
    );
  });
});
