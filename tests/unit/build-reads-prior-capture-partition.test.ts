// Production defect, observed live on 2026-08-13: every build since the
// Panama midnight rollover refused with "no usable wave members" while the
// bucket held a perfectly good captured file.
//
// The archive partitions by MODEL RUN date, not by forecast date:
// `predictions/v1/dt=<run_date>/src=<source>/cyc=<HH>Z/...`
// (adr-prediction-log-format.md decision 1, written by ingest.ts's
// `addMemberRows` from `member.run_ts`). One captured file holds rows whose
// `valid_ts` spans roughly the next two days. Live, the bucket held only
// `dt=2026-08-12/` with rows covering Aug 12 AND Aug 13.
//
// `runBuildOnce` listed `dt=<today>/` and `dt=<tomorrow>/` -- the FORECAST
// dates -- so at the civil-date rollover it looked for partitions no cycle
// had ever written, found nothing, and refused. The fetch had succeeded every
// hour; the site simply could not publish.
//
// The rule these tests pin is already written down. domain-model.md section 6:
// "the builder uses the latest run per source with run_ts <= build time
// (freshest opinion wins; older runs stay in the prediction log for the
// lead-time skill curve)". build.ts's own header claims to do this. It never
// did: it read two forecast-dated partitions and deduped members with a Map
// whose winner was decided by key iteration order.
//
// The `valid_ts` filter in `callsForSpot` is, and stays, the correctness
// guarantee: only hours belonging to today or tomorrow are ever scored. That
// is why reading an older partition cannot leak a stale forecast hour onto
// the surface, and why the honest refusal still fires when nothing covers
// today.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { runBuildOnce } from '../../src/pipeline/build';
import type { BuildStore, Clock } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

/** 09:22 in Panama on 2026-08-13, the morning the live builds were refusing. */
const BUILD_INSTANT = '2026-08-13T14:22:00Z';
const TODAY = '2026-08-13';
const TOMORROW = '2026-08-14';
const YESTERDAY = '2026-08-12';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const SPOT_ID = 'playa-venao';

/** Materially different days, so the "tomorrow duplicates today" refusal never fires. */
const TODAY_SWELL = { h_m: 1.5, t_s: 15, dir_deg: 180 } as const;
const TOMORROW_SWELL = { h_m: 0.6, t_s: 12, dir_deg: 180 } as const;

type Swell = { readonly h_m: number; readonly t_s: number; readonly dir_deg: number };

class RecordingStore implements BuildStore {
  readonly objects = new Map<string, string>();

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
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }

  async putBundle(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
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

function hoursBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 3_600_000);
}

function row(source: string, runTs: string, validTs: string, swell: Swell): string {
  return JSON.stringify({
    spot_id: SPOT_ID,
    source,
    run_ts: runTs,
    valid_ts: validTs,
    lead_h: hoursBetween(runTs, validTs),
    swell_h_m: swell.h_m,
    swell_t_s: swell.t_s,
    swell_dir_deg: swell.dir_deg,
    wind_speed_kt: 6,
    wind_dir_deg: 40,
    tide_m: null,
    tide_day_low_m: null,
    tide_day_high_m: null,
    land_masked: false,
  });
}

/**
 * One real capture: four files under a single `dt=<run_date>/`, one per wave
 * model, each holding that model's rows for both forecast days. This is the
 * exact shape the live bucket held on 2026-08-12.
 */
function capture(
  store: RecordingStore,
  captureDate: string,
  cycleHour: string,
  hours: readonly { readonly validTs: string; readonly swell: Swell }[],
): void {
  const runTs = `${captureDate}T${cycleHour}:00Z`;
  for (const source of MEMBER_SOURCES) {
    store.objects.set(
      `predictions/v1/dt=${captureDate}/src=${source}/cyc=${cycleHour}Z/all.jsonl`,
      hours.map((hour) => row(source, runTs, hour.validTs, hour.swell)).join('\n'),
    );
  }
}

/** The two forecast days a normal capture covers. */
function bothDays(): readonly { readonly validTs: string; readonly swell: Swell }[] {
  return [
    { validTs: `${TODAY}T18:00Z`, swell: TODAY_SWELL },
    { validTs: `${TOMORROW}T18:00Z`, swell: TOMORROW_SWELL },
  ];
}

async function build(store: RecordingStore) {
  const clock: Clock = { now: () => new Date(BUILD_INSTANT) };
  return runBuildOnce({ store, clock, region_id: 'pa-pacific', spots: [seed()] });
}

type SurfaceCallShape = { spot_id: string; score_q: number; size_band: string; conf_level: string };
type CallReceiptShape = SurfaceCallShape & { valid_ts: string; conf_value: number };
type ForecastProjection = Omit<SurfaceCallShape, 'conf_level'>;

/** Today's published call, the thing a surfer actually reads. */
function todaysPublishedCall(store: RecordingStore): SurfaceCallShape {
  const body = store.objects.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(body, 'The build must publish the region bundle; the reading lanes have no other input.');
  const bundle = JSON.parse(body) as { publish_surface: { days: { date: string; spots: SurfaceCallShape[] }[] } };
  const today = bundle.publish_surface.days.find((day) => day.date === TODAY);
  assert.ok(today, `The published surface must carry ${TODAY}.`);
  const call = today.spots.find((spot) => spot.spot_id === SPOT_ID);
  assert.ok(call, `The published surface must carry ${SPOT_ID}.`);
  return call;
}

function forecastProjection(call: SurfaceCallShape): ForecastProjection {
  const { conf_level: _confidenceLevel, ...forecast } = call;
  return forecast;
}

/** The receipt preserves the continuous confidence value, which the reading
 * surface deliberately projects down to a three-word level. */
function todaysPublishedReceipt(store: RecordingStore): CallReceiptShape {
  const key = [...store.objects.keys()].find((candidate) => candidate.startsWith('log/calls/v1/'));
  assert.ok(key, 'A published build must write its call receipt before the bundle, or the confidence history is lost.');
  const body = store.objects.get(key);
  assert.ok(body, 'The call receipt key must resolve to bytes.');
  const receipt = body.split('\n').map((line) => JSON.parse(line) as CallReceiptShape).find((row) => row.spot_id === SPOT_ID && row.valid_ts.startsWith(TODAY));
  assert.ok(receipt, `The call receipt must preserve ${SPOT_ID}'s ${TODAY} confidence.`);
  return receipt;
}

describe('the build reads the capture partition, not a forecast-dated one', () => {
  it('publishes from a capture filed under any recent prior run date, exactly as if it were filed today', async () => {
    // The law: `dt=` is an archive address, not a forecast input. The same
    // rows produce the same scored forecast no matter which recent run-date
    // partition holds them. Confidence is intentionally excluded: model-run
    // age is evidence, so a prior partition must earn a lower confidence.
    // On the pre-fix code the offset-0 baseline published and every prior
    // offset refused, which IS the live outage.
    const reference = new RecordingStore();
    capture(reference, TODAY, '06', bothDays());
    const referenceOutcome = await build(reference);
    assert.equal(referenceOutcome.published, true, `The same-day baseline must publish. Got ${JSON.stringify(referenceOutcome)}.`);
    const expected = forecastProjection(todaysPublishedCall(reference));

    // One and two days back: the contracted lookback. A captured cycle covers
    // roughly two forecast days and the fetch skips an unchanged upstream
    // cycle, so the newest run covering this morning is routinely yesterday's
    // and occasionally the day before's.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2 }),
        fc.constantFrom('00', '06', '12', '18'),
        async (daysBack, cycleHour) => {
          const captureDate = new Date(`${TODAY}T12:00:00Z`);
          captureDate.setUTCDate(captureDate.getUTCDate() - daysBack);
          const store = new RecordingStore();
          capture(store, captureDate.toISOString().slice(0, 10), cycleHour, bothDays());

          const outcome = await build(store);
          assert.equal(
            outcome.published,
            true,
            `A capture filed ${daysBack} day(s) back at cycle ${cycleHour}Z still covers today; the build must publish it. Got ${JSON.stringify(outcome)}.`,
          );
          assert.deepEqual(
            forecastProjection(todaysPublishedCall(store)),
            expected,
            'Where the archive filed the rows must not change the published forecast.',
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it('refuses rather than scoring a capture older than the lookback window', async () => {
    // The lookback is bounded on purpose. Past it the build refuses, which is
    // the honest outcome and not a second bug: an upstream that has published
    // nothing new for three days is a real outage, and the previous artifacts
    // keep serving with their own published timestamp on them. Pinned so the
    // window is a decision someone made, not an accident of a loop bound.
    const store = new RecordingStore();
    const tooOld = new Date(`${TODAY}T12:00:00Z`);
    tooOld.setUTCDate(tooOld.getUTCDate() - 3);
    capture(store, tooOld.toISOString().slice(0, 10), '06', bothDays());

    const outcome = await build(store);
    assert.deepEqual(
      outcome,
      { published: false, reason: 'no usable wave members' },
      'A capture beyond the lookback is not read, so there is nothing to score and the build must say so.',
    );
  });

  it('still refuses when the only rows on hand forecast hours that have already passed', async () => {
    // The honest-refusal guarantee the widening must not weaken. A prior
    // partition whose rows are entirely in the past covers nothing today, so
    // there is no call to make and the previous artifacts keep serving.
    const store = new RecordingStore();
    capture(store, YESTERDAY, '06', [
      { validTs: `${YESTERDAY}T12:00Z`, swell: TODAY_SWELL },
      { validTs: `${YESTERDAY}T18:00Z`, swell: TOMORROW_SWELL },
    ]);

    const outcome = await build(store);
    assert.deepEqual(
      outcome,
      { published: false, reason: 'no usable wave members' },
      'Rows that forecast only past hours are not a forecast for today, and inventing one would be the lie this product refuses to tell.',
    );
    assert.equal(
      store.objects.has('pub/v1/manifest.json'),
      false,
      'A refused build must not advance the manifest stamp.',
    );
  });

  it('prefers the freshest run when two capture partitions cover the same forecast hour', async () => {
    // domain-model.md section 6: "the latest run per source with
    // run_ts <= build time". Once the build reads more than one partition,
    // the winner can no longer be whichever key happened to sort last.
    const store = new RecordingStore();
    capture(store, YESTERDAY, '18', bothDays());
    capture(store, TODAY, '06', [
      { validTs: `${TODAY}T18:00Z`, swell: { h_m: 2.4, t_s: 16, dir_deg: 180 } },
      { validTs: `${TOMORROW}T18:00Z`, swell: TOMORROW_SWELL },
    ]);

    const outcome = await build(store);
    assert.equal(outcome.published, true, `The fresh capture must publish. Got ${JSON.stringify(outcome)}.`);

    const stale = new RecordingStore();
    capture(stale, YESTERDAY, '18', bothDays());
    const staleOutcome = await build(stale);
    assert.equal(staleOutcome.published, true, `The stale-only fixture must publish. Got ${JSON.stringify(staleOutcome)}.`);

    const fresh = new RecordingStore();
    capture(fresh, TODAY, '06', [
      { validTs: `${TODAY}T18:00Z`, swell: { h_m: 2.4, t_s: 16, dir_deg: 180 } },
      { validTs: `${TOMORROW}T18:00Z`, swell: TOMORROW_SWELL },
    ]);
    const freshOutcome = await build(fresh);
    assert.equal(freshOutcome.published, true, `The fresh-only fixture must publish. Got ${JSON.stringify(freshOutcome)}.`);

    // The two runs genuinely disagree, so this assertion can tell them apart.
    assert.notDeepEqual(
      todaysPublishedCall(stale),
      todaysPublishedCall(fresh),
      'The fixture is only meaningful if the older and newer runs publish different calls.',
    );
    assert.deepEqual(
      todaysPublishedCall(store),
      todaysPublishedCall(fresh),
      'With both partitions on hand the newer model run must win; a superseded run must never outrank the run that replaced it.',
    );
  });

  it('lowers confidence when the newest usable model run is two days old', async () => {
    // The archived run can still forecast today's hour, so the build must
    // publish it. But agreement among an old set of models cannot earn the
    // same certainty as identical numbers from this afternoon's update.
    const fresh = new RecordingStore();
    capture(fresh, TODAY, '12', bothDays());
    const freshOutcome = await build(fresh);
    assert.equal(freshOutcome.published, true, `The fresh fixture must publish. Got ${JSON.stringify(freshOutcome)}.`);

    const stale = new RecordingStore();
    capture(stale, '2026-08-11', '12', bothDays());
    const staleOutcome = await build(stale);
    assert.equal(staleOutcome.published, true, `The two-day-old fixture must still publish its usable forecast. Got ${JSON.stringify(staleOutcome)}.`);

    const freshReceipt = todaysPublishedReceipt(fresh);
    const staleReceipt = todaysPublishedReceipt(stale);
    assert.equal(staleReceipt.score_q, freshReceipt.score_q, 'The fixture changes only model-run age, not the scored forecast.');
    assert.ok(
      staleReceipt.conf_value < freshReceipt.conf_value,
      `A two-day-old model run must earn less confidence than a current run. Fresh=${freshReceipt.conf_value}, stale=${staleReceipt.conf_value}.`,
    );
    assert.equal(staleReceipt.conf_level, 'low', 'The conservative freshness floor must keep a two-day-old forecast from reading above baja.');
  });

});

// NOT pinned here, deliberately: the other half of domain-model.md section 6's
// sentence, "run_ts <= build time". A row stamped after the build instant
// currently outranks the legitimate current run -- reproduced on the pre-fix
// code, where a future-stamped 2.9 m run published "Doble o más" at score 30
// in place of the real run's "Cabeza a un metro más" at 83. It is LATENT, not
// live: `cyclesChangedSinceFrozen` (ingest.ts:84) refuses any incoming member
// whose run_ts is ahead of now, so no such partition can be written today.
// Enforcing the clause means retiring the future-dated `run_ts` that five
// existing fixtures rely on, including a SHA256-pinned bundle, which is well
// outside this defect. Flagged for Andres, not fixed here. Behaviour on that
// path is unchanged by this commit.
