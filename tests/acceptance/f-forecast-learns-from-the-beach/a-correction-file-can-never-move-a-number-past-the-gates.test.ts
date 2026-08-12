// The builder's end of the correction file. Accepted roadmap steps 02-03
// through 02-06, all four of which drive the SAME port -- runBuildOnce -- and
// read the same two observables: the published bundle a surfer's page is
// rendered from, and the archived PublishedCall row that says why the number
// is what it is.
//
// WHY-NEW-FILE: tests/acceptance/f-forecast-learns-from-the-beach/a-correction-file-can-never-move-a-number-past-the-gates.test.ts
//   CLOSEST-EXISTING: tests/acceptance/f-forecast-learns-from-the-beach/forged-correction-is-stopped-by-the-gates.test.ts
//   EXTENSION-COST: that file drives applyCorrection directly -- a pure
//     function, two arguments, no store and no clock -- and its header states
//     that the builder's own end of the claim belongs to a separate file.
//     Folding a builder harness into it would give one file two layers and put
//     a store, a prediction log and a build instant next to a pure-function
//     oracle that deliberately has none.
//   PARALLEL-RATIONALE: this file's entry point is a different driving port
//     (runBuildOnce, async, store-driven) at a different layer, and the
//     accepted roadmap names one .feature file for all four of these steps --
//     this is that file, in the Vitest shape this branch proves its acceptance
//     claims with.
//
// ONE FILE FOR FOUR STEPS, deliberately. 02-03 through 02-06 each need the
// same rig: two spots, two civil days, four declared members per hour, a
// prediction log the build can read, and a correction record the real emitter
// wrote. Four copies of that rig is four places for a fixture to drift. Each
// step owns its own describe block and was added by its own commit.
//
// EVERY CORRECTION FIXTURE COMES FROM THE REAL EMITTER. buildCorrectionRecords
// is the function the nightly fit calls, and its output is serialized and put
// at the key the build reads. Nothing here hand-types a gated key: the height
// ladder runs at SIGMA_EFF.height and the score ladder at SIGMA_EFF.score, and
// a hand-typed key that looks like it clears "|b| > 2 se" is easy to get wrong
// in either direction. Measuring the claim against what the writer on the
// other side of the file actually writes is the whole point.
//
// SIGN SSOT is 06-learning-layer.md section 4: residual and bias are forecast
// minus observed, so a corrected member is raw MINUS the stored difference and
// the score delta is MINUS the stored points over 100.

import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
  buildCorrectionRecords,
  currentCorrectionKey,
  type SpotInputs,
  type StoredCorrection,
} from '../../../src/learning/correction-file';
import type { ObservationRow, PredictionRow } from '../../../src/learning/inputs';
import { runBuildOnce } from '../../../src/pipeline/build';
import type { BuildStore, Clock } from '../../../src/pipeline/ports';
import type { SpotSeed } from '../../../src/scoring/engine';

// ---------- the published day the whole file is built around ----------

const REGION_ID = 'pa-pacific';
const BUILD_INSTANT = '2026-08-09T12:22:00Z';
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const RANKING_HOUR_UTC = '18';

/** The four members build.ts declares. A correction the emitter wrote keys every one of them. */
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;

/** The spot whose file is under test, and the spot beside it that never has one. */
const CORRECTED_SPOT = 'playa-venao';
const UNCORRECTED_SPOT = 'playa-cambutal';

/** 12 h lands in lead_12_24, the bucket both the build fixture and the emitter fixture key on. */
const LEAD_H = 12;
const SWELL_PERIOD_S = 15.5;

/** Day-zero forecast heights. Today and tomorrow genuinely differ, so the build's clone guard cannot mask a bug. */
const FORECAST_HEIGHT_M: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  [TODAY]: { [CORRECTED_SPOT]: 1.2, [UNCORRECTED_SPOT]: 0.7 },
  [TOMORROW]: { [CORRECTED_SPOT]: 0.5, [UNCORRECTED_SPOT]: 1.4 },
};

// ---------- the driven port double ----------

/**
 * The build's whole durable universe, in memory, with the real conditional-PUT
 * semantics the call log rides on. It also records every correction key the
 * build asked for, because "the builder reads the file on every build" is a
 * claim about a call that either happened or did not.
 */
class MemoryBuildStore implements BuildStore {
  readonly objects = new Map<string, string>();
  readonly correctionKeysRead: string[] = [];

  async getPrediction(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(key: string): Promise<string | null> {
    this.correctionKeysRead.push(key);
    return this.objects.get(key) ?? null;
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

// ---------- the launch seeds and the prediction log ----------

function seedFor(spot_id: string, name: string): SpotSeed {
  return {
    spot_id,
    name,
    region_id: REGION_ID,
    timezone: 'America/Panama',
    shore_normal_deg: 175,
    swell_window_deg: [150, 210],
    h_ref_m: 1.3,
    s_size: 0.5,
    wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
    tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
  };
}

const SEEDS: readonly SpotSeed[] = [
  seedFor(CORRECTED_SPOT, 'Playa Venao'),
  seedFor(UNCORRECTED_SPOT, 'Playa Cambutal'),
];

/** One hour of one spot's four declared members, as the prediction log stores them. */
function predictionLines(spot_id: string, date: string, utcHour: string): string {
  const height_m = FORECAST_HEIGHT_M[date]?.[spot_id] ?? 0;
  return MEMBER_SOURCES
    .map((source, index) => JSON.stringify({
      spot_id,
      source,
      run_ts: `${date}T06:00Z`,
      valid_ts: `${date}T${utcHour}:00Z`,
      lead_h: LEAD_H,
      swell_h_m: height_m + index * 0.02,
      swell_t_s: SWELL_PERIOD_S,
      swell_dir_deg: 204 + index,
      wind_speed_kt: 7,
      wind_dir_deg: 40,
      tide_m: 2.31,
      tide_day_low_m: 0.9,
      tide_day_high_m: 4.3,
      land_masked: false,
    }))
    .join('\n');
}

/** UTC hours that all land inside their own Panama civil day; 18:00Z is the ranking hour. */
const SCORED_UTC_HOURS = ['12', '15', RANKING_HOUR_UTC, '21'] as const;

function seedPredictionLog(store: MemoryBuildStore): void {
  for (const date of [TODAY, TOMORROW]) {
    store.objects.set(
      `predictions/v1/dt=${date}/all.jsonl`,
      [CORRECTED_SPOT, UNCORRECTED_SPOT]
        .flatMap((spot_id) => SCORED_UTC_HOURS.map((utcHour) => predictionLines(spot_id, date, utcHour)))
        .join('\n'),
    );
  }
}

// ---------- the correction fixtures, written by the real emitter ----------

class FixedFitClock {
  now(): Date {
    return new Date('2026-08-09T07:00:00.000Z');
  }
}

/**
 * `count` reported mornings from `reporters` distinct people, of which
 * `pairedMornings` also have a prediction row to pair against.
 *
 * The two counts are separate on purpose, and it is not a contrivance: a score
 * residual needs only the score a build had shown the reporter, while a height
 * residual needs a prediction row at the reported hour. A spot whose reports
 * outnumber its retained prediction rows therefore emits a record whose score
 * key clears the ladder and whose height keys do not, which is the shape that
 * lets a test watch the score lane move on its own.
 */
function reportedMornings(input: {
  count: number;
  reporters: number;
  pairedMornings: number;
  shownScoreQ: number;
  forecastHeightM: number;
}): SpotInputs {
  const observations: ObservationRow[] = [];
  const predictions: PredictionRow[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const observedAt = new Date('2026-07-01T18:41:00Z');
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);

    observations.push({
      spot_id: CORRECTED_SPOT,
      device_id: `d_seen_${index % input.reporters}`,
      observed_at: observedAt.toISOString(),
      size_band: 'chest_head',
      quality: 'good',
      predicted: { score_q: input.shownScoreQ },
    });
    if (index >= input.pairedMornings) continue;
    for (const source of MEMBER_SOURCES) {
      predictions.push({
        spot_id: CORRECTED_SPOT,
        source,
        valid_ts: `${observedDate}T18:00:00Z`,
        lead_h: LEAD_H,
        swell_h_m: input.forecastHeightM,
        swell_t_s: 10,
        land_masked: false,
      });
    }
  }

  return { spotId: CORRECTED_SPOT, observations, predictions };
}

/** What the shipped nightly fit would actually write for those mornings and people. */
function emittedRecord(input: Parameters<typeof reportedMornings>[0]): StoredCorrection {
  const record = buildCorrectionRecords([reportedMornings(input)], new FixedFitClock()).get(CORRECTED_SPOT);
  assert.ok(record, 'test bug: the emitter wrote no record for the fixture spot');
  return record;
}

/**
 * A record every one of whose gate verdicts has been flipped to a claim of
 * having been applied, and nothing else touched: exactly what someone with
 * write access to the bucket, or a corrupted writer, would leave behind.
 */
function forgedAsApplied(record: StoredCorrection): StoredCorrection {
  const claimed = true;
  const per_source = Object.fromEntries(
    Object.entries(record.bias.swell_h_m.per_source).map(([source, byLead]) => [
      source,
      Object.fromEntries(Object.entries(byLead).map(([lead, key]) => [lead, { ...key, applied: claimed }])),
    ]),
  );
  const forged: StoredCorrection = { ...record, bias: { swell_h_m: { per_source } } };
  if (record.score_delta !== undefined) {
    forged.score_delta = { ...record.score_delta, applied: claimed };
  }
  return forged;
}

// ---------- driving the build ----------

/** One archived PublishedCall row, narrowed to the fields these steps read. */
type ArchivedCall = {
  readonly spot_id: string;
  readonly valid_ts: string;
  readonly score_q: number;
  readonly h_eff_m: number;
  readonly size_band: string;
  readonly bias_applied: number;
  readonly bias_gate: string;
};

type PublishedBuild = {
  readonly bundleBody: string;
  readonly bundle: Record<string, unknown>;
  readonly calls: readonly ArchivedCall[];
  readonly correctionKeysRead: readonly string[];
  readonly store: MemoryBuildStore;
};

/**
 * One build against a store carrying the given correction files, at the given
 * instant. `store` is accepted so a test can run two builds against the SAME
 * durable universe when the claim is about what the first build left behind.
 */
async function publishOnce(input: {
  corrections?: Readonly<Record<string, StoredCorrection>>;
  at?: string;
  store?: MemoryBuildStore;
} = {}): Promise<PublishedBuild> {
  const store = input.store ?? new MemoryBuildStore();
  if (input.store === undefined) seedPredictionLog(store);
  for (const [spot_id, record] of Object.entries(input.corrections ?? {})) {
    store.objects.set(currentCorrectionKey(spot_id), JSON.stringify(record));
  }
  const clock: Clock = { now: () => new Date(input.at ?? BUILD_INSTANT) };
  const readMark = store.correctionKeysRead.length;

  const outcome = await runBuildOnce({ store, clock, region_id: REGION_ID, spots: [...SEEDS] });
  assert.equal(
    outcome.published,
    true,
    `the fixture must publish before anything about it can be read; got ${JSON.stringify(outcome)}`,
  );

  const bundleBody = store.objects.get(`pub/v1/regions/${REGION_ID}/bundle.json`);
  assert.ok(bundleBody, 'the build must publish the region bundle; the reading surface has no other input');
  const hour = new Date(input.at ?? BUILD_INSTANT).toISOString().slice(11, 13);
  const callsBody = store.objects.get(`log/calls/v1/dt=${TODAY}/build=${hour}Z/${REGION_ID}.jsonl.gz`);
  assert.ok(callsBody, 'the build must archive its PublishedCall rows; they are the only witness of why a number moved');

  return {
    bundleBody,
    bundle: JSON.parse(bundleBody) as Record<string, unknown>,
    calls: callsBody.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as ArchivedCall),
    correctionKeysRead: store.correctionKeysRead.slice(readMark),
    store,
  };
}

/** The archived row for one spot at the ranking hour of the published day. */
function rankedCall(published: PublishedBuild, spot_id: string): ArchivedCall {
  const call = published.calls.find(
    (row) => row.spot_id === spot_id && row.valid_ts === `${TODAY}T${RANKING_HOUR_UTC}:00Z`,
  );
  assert.ok(call, `test bug: the build archived no ${spot_id} row at the ranking hour`);
  return call;
}

// ---------- oracles ----------

/**
 * The whole claim of a carried refusal: not one published byte moved, and the
 * archive still says which rung stopped the file.
 */
function assertCarriedInSilence(input: {
  withFile: PublishedBuild;
  withoutFile: PublishedBuild;
  expectedGate: string;
}): void {
  assert.equal(
    input.withFile.bundleBody,
    input.withoutFile.bundleBody,
    'a correction the gates refused must leave the published bundle byte-identical to the build that never had a file at all',
  );
  const corrected = rankedCall(input.withFile, CORRECTED_SPOT);
  assert.equal(
    corrected.bias_gate,
    input.expectedGate,
    `the archived call must name the rung that stopped the file, or an operator cannot tell a refusal from an absence; it said ${corrected.bias_gate}`,
  );
  assert.equal(
    corrected.bias_applied,
    0,
    'a refused file must archive exactly zero applied bias, whatever the file claims about itself',
  );
}

// ---------- 02-03 ----------

describe('02-03 acceptance: the builder consumes the file, and a correction the gates refused is carried in silence', () => {
  it('asks the store for every spot\'s own correction key on every build', async () => {
    const refused = emittedRecord({
      count: 6,
      reporters: 6,
      pairedMornings: 6,
      shownScoreQ: 79,
      forecastHeightM: 1.17,
    });

    const published = await publishOnce({ corrections: { [CORRECTED_SPOT]: refused } });

    assert.deepEqual(
      [...published.correctionKeysRead].sort(),
      [currentCorrectionKey(CORRECTED_SPOT), currentCorrectionKey(UNCORRECTED_SPOT)].sort(),
      'every published spot must be looked up at its own current/<spot_id>.json on every build: a spot the builder never asks about can never learn anything',
    );
  });

  it('changes no published byte when the record\'s own evidence is too thin, and names the rung that stopped it', async () => {
    // Six mornings. The record the emitter writes for them states its own
    // n = 6, which the morning gate refuses on the first rung.
    const refused = emittedRecord({
      count: 6,
      reporters: 6,
      pairedMornings: 6,
      shownScoreQ: 79,
      forecastHeightM: 1.17,
    });
    assert.ok(
      refused.score_delta !== undefined && refused.score_delta.n < 10,
      'test bug: this fixture only exercises the morning gate if the record states fewer mornings than the gate allows',
    );

    const withFile = await publishOnce({ corrections: { [CORRECTED_SPOT]: refused } });
    const withoutFile = await publishOnce();

    assertCarriedInSilence({ withFile, withoutFile, expectedGate: 'n_lt_10' });
    assert.equal(
      rankedCall(withoutFile, CORRECTED_SPOT).bias_gate,
      'no_file',
      'test bug: the comparison build must genuinely have had no file, or byte-identity proves nothing',
    );
    assert.equal(
      rankedCall(withFile, UNCORRECTED_SPOT).bias_gate,
      'no_file',
      'a spot with no file of its own must still archive no_file while its neighbour archives a refusal: one file belongs to one spot',
    );
    assert.throws(
      () => assertCarriedInSilence({ withFile, withoutFile, expectedGate: 'not_significant' }),
      /name the rung that stopped the file/,
      'the oracle must reject an archive that names the wrong gate',
    );
  });

  it('changes no published byte when a hand-forged file claims it was applied, and names the rung that stopped it', async () => {
    // Eighteen mornings from six people: enough evidence to clear G1 and G2.
    // The forgery buries the score difference inside a rewritten standard
    // error and flips every stored verdict to a claim of application, so the
    // ONLY thing that can stop it is the builder re-running G3 at read time.
    const honest = emittedRecord({
      count: 18,
      reporters: 6,
      pairedMornings: 18,
      shownScoreQ: 79,
      forecastHeightM: 1.17,
    });
    const scoreDelta = honest.score_delta;
    assert.ok(scoreDelta, 'test bug: the fixture must state a score move for the forgery to bury');
    const forged = forgedAsApplied({ ...honest, score_delta: { ...scoreDelta, se: 100 } });

    assert.equal(
      forged.score_delta?.applied,
      true,
      'test bug: the forgery must actually claim to have been applied',
    );
    assert.ok(
      forged.score_delta !== undefined
        && forged.score_delta.n >= 10
        && forged.score_delta.reporters >= 5
        && Math.abs(forged.score_delta.b) <= 2 * forged.score_delta.se,
      'test bug: the forgery must clear the morning and reporter rungs and fail only on significance, or it never reaches the rung under test',
    );

    const withFile = await publishOnce({ corrections: { [CORRECTED_SPOT]: forged } });
    const withoutFile = await publishOnce();

    assertCarriedInSilence({ withFile, withoutFile, expectedGate: 'not_significant' });
  });
});
