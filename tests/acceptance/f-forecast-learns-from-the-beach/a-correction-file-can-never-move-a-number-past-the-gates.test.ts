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

import { leadBucketOf } from '../../../src/learning/constants';
import {
  buildCorrectionRecords,
  currentCorrectionKey,
  type GatedKey,
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

/**
 * Which bucket that lead time falls in, asked of the shipped table rather
 * than typed here. A test that spells its own bucket name keeps passing after
 * someone moves a bucket edge, while measuring a key the build no longer reads.
 */
const LEAD_BUCKET = leadBucketOf(LEAD_H);

/** A second build of the same civil day, three hours after the first. Both land inside 2026-08-09 in Panama. */
const LATER_BUILD_INSTANT = '2026-08-09T15:22:00Z';

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

/**
 * One hour of one spot's four declared members, as the prediction log stores
 * them.
 *
 * `liftM` raises the CORRECTED spot's forecast by that many metres and leaves
 * its neighbour alone. It exists for one purpose, used only by 02-04: to build
 * a control universe in which the forecast itself already reads what a
 * correction would have made it read, so the claim "a correction of x metres
 * publishes what forecasting x metres differently publishes" can be measured
 * against a real second build instead of against a formula restated in the
 * test. Default 0, so every other example is untouched by it.
 */
function predictionLines(spot_id: string, date: string, utcHour: string, liftM: number): string {
  const height_m = (FORECAST_HEIGHT_M[date]?.[spot_id] ?? 0) + (spot_id === CORRECTED_SPOT ? liftM : 0);
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

function seedPredictionLog(store: MemoryBuildStore, liftM: number): void {
  for (const date of [TODAY, TOMORROW]) {
    store.objects.set(
      `predictions/v1/dt=${date}/all.jsonl`,
      [CORRECTED_SPOT, UNCORRECTED_SPOT]
        .flatMap((spot_id) => SCORED_UTC_HOURS.map((utcHour) => predictionLines(spot_id, date, utcHour, liftM)))
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
 * The archived PublishedCall rows one build left behind, as raw bytes. A
 * build is keyed by its own hour, so two builds of the same morning archive
 * side by side and neither can silently overwrite the other's record.
 */
function archivedBody(store: MemoryBuildStore, at: string): string | undefined {
  const hour = new Date(at).toISOString().slice(11, 13);
  return store.objects.get(`log/calls/v1/dt=${TODAY}/build=${hour}Z/${REGION_ID}.jsonl.gz`);
}

/**
 * One build against a store carrying the given correction files, at the given
 * instant. `store` is accepted so a test can run two builds against the SAME
 * durable universe when the claim is about what the first build left behind.
 */
async function publishOnce(input: {
  corrections?: Readonly<Record<string, StoredCorrection>>;
  at?: string;
  store?: MemoryBuildStore;
  forecastLiftM?: number;
} = {}): Promise<PublishedBuild> {
  const store = input.store ?? new MemoryBuildStore();
  if (input.store === undefined) seedPredictionLog(store, input.forecastLiftM ?? 0);
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
  const callsBody = archivedBody(store, input.at ?? BUILD_INSTANT);
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

// ---------- 02-04 ----------

/**
 * The mornings that produce a record every rung lets through. Measured, not
 * chosen: at 18 paired mornings from 6 people with one reported band and one
 * shown score, the emitter writes a height key of -0.18 m and a score key of
 * 9.0 display points, both on a standard error of the physical floor alone,
 * and both clear their own ladder by better than double. -0.18 m means the
 * models ran SMALL against what people saw, so a corrected member goes UP.
 *
 * The height move is deliberately well inside the forty percent G5 allows on
 * a 1.2 m member (0.48 m). This step's claim is that the number MOVES by what
 * the record ordered; whether a bigger order is bounded is 02-05's claim, and
 * a fixture that saturated here would prove that one instead of this one.
 */
const MORNINGS_THAT_CLEAR_EVERY_RUNG = {
  count: 18,
  reporters: 6,
  pairedMornings: 18,
  shownScoreQ: 79,
  forecastHeightM: 1.17,
} as const;

/** The one height key this fixture's mornings produce, at the model and lead bucket the build reads. */
function heightKeyOf(record: StoredCorrection): GatedKey {
  const key = record.bias.swell_h_m.per_source[MEMBER_SOURCES[0]]?.[LEAD_BUCKET];
  assert.ok(key, `test bug: the emitter wrote no height key at ${MEMBER_SOURCES[0]} ${LEAD_BUCKET}`);
  return key;
}

function scoreKeyOf(record: StoredCorrection): GatedKey & { units: 'display_points' } {
  const key = record.score_delta;
  assert.ok(key, 'test bug: the emitter wrote no score move, so there is no applied delta to measure');
  return key;
}

/** A key's own stated evidence clears the whole ladder, and orders a move worth watching. */
function assertKeyEarnsItsMove(key: GatedKey, what: string): void {
  assert.ok(
    key.n >= 10 && key.reporters >= 5 && Math.abs(key.b) > 2 * key.se && key.b !== 0,
    `test bug: this example only watches a number move if the ${what} key's OWN evidence clears every rung and orders a non-zero move; it states ${JSON.stringify(key)}`,
  );
}

describe('02-04 acceptance: a stored correction that passed every gate finally moves the number a surfer reads', () => {
  it('publishes exactly what forecasting the corrected metres would have published, and moves the score by the applied delta', async () => {
    const passing = emittedRecord(MORNINGS_THAT_CLEAR_EVERY_RUNG);
    const heightKey = heightKeyOf(passing);
    const scoreKey = scoreKeyOf(passing);
    assertKeyEarnsItsMove(heightKey, 'height');
    assertKeyEarnsItsMove(scoreKey, 'score');

    // 06 section 4: residual and bias are forecast minus observed, so a
    // corrected member is raw MINUS the stored difference. The metres the
    // forecast has to be lifted by to arrive at the same place are therefore
    // minus b.
    const orderedLiftM = -heightKey.b;
    const smallestMemberHeightM = FORECAST_HEIGHT_M[TODAY]?.[CORRECTED_SPOT] ?? 0;
    assert.ok(
      Math.abs(heightKey.b) < passing.clamp.max_abs_h_frac * smallestMemberHeightM,
      `test bug: this example measures an UNBOUNDED move, so the record must order less than the ${passing.clamp.max_abs_h_frac} of ${smallestMemberHeightM} m it is allowed; it ordered ${heightKey.b} m`,
    );

    const dayZero = await publishOnce();
    const withFile = await publishOnce({ corrections: { [CORRECTED_SPOT]: passing } });
    // The same day, forecast from the start at the height the correction
    // orders, and no correction file anywhere. If the learning layer is
    // honest, a surfer cannot tell this build and the corrected one apart by
    // the wave they are shown.
    const asIfForecast = await publishOnce({ forecastLiftM: orderedLiftM });

    const zeroCall = rankedCall(dayZero, CORRECTED_SPOT);
    const correctedCall = rankedCall(withFile, CORRECTED_SPOT);
    const asIfCall = rankedCall(asIfForecast, CORRECTED_SPOT);

    assert.notEqual(
      asIfCall.h_eff_m,
      zeroCall.h_eff_m,
      'test bug: the control build must genuinely forecast a different wave, or matching it proves nothing',
    );

    // Float noise, not slack: the two heights are the same metres reached by
    // two different orders of operation -- lift then average, against average
    // then lift -- so they agree to about 1e-15 rather than bit for bit.
    assert.ok(
      Math.abs(correctedCall.h_eff_m - asIfCall.h_eff_m) < 1e-9,
      `a correction of ${orderedLiftM} m must publish the wave a forecast ${orderedLiftM} m different publishes: it published ${correctedCall.h_eff_m} m against ${asIfCall.h_eff_m} m`,
    );
    assert.ok(
      correctedCall.h_eff_m > zeroCall.h_eff_m,
      `the models ran small against what people saw, so the published wave must RISE off day zero: it went from ${zeroCall.h_eff_m} m to ${correctedCall.h_eff_m} m`,
    );
    assert.equal(
      correctedCall.size_band,
      asIfCall.size_band,
      'the band a surfer actually reads must follow the corrected metres, not the raw ones',
    );

    // The score lane, isolated: the control build differs from the corrected
    // one ONLY by the applied delta, since both publish the same wave. 06
    // section 4's sign again -- the stored points are forecast minus observed,
    // so a positive stored difference LOWERS the score.
    const orderedPoints = Math.round(scoreKey.b);
    assert.equal(
      correctedCall.score_q,
      asIfCall.score_q - orderedPoints,
      `the published score must fall by the ${orderedPoints} display points the record earned, and by nothing else: the same wave scored ${asIfCall.score_q} with no file and ${correctedCall.score_q} with one`,
    );

    assert.equal(correctedCall.bias_gate, 'applied', 'a record that cleared every rung must archive that it was applied');
    assert.equal(
      correctedCall.bias_applied,
      -scoreKey.b / 100,
      'the archived bias must be MINUS the record\'s stored points over 100, so an operator can read the exact move off the row',
    );

    assert.deepEqual(
      rankedCall(withFile, UNCORRECTED_SPOT),
      rankedCall(dayZero, UNCORRECTED_SPOT),
      'one spot\'s correction must move no number at the spot beside it',
    );
  });

  it('leaves the earlier build\'s archived rows untouched and appends its own', async () => {
    const passing = emittedRecord(MORNINGS_THAT_CLEAR_EVERY_RUNG);

    const dayZero = await publishOnce();
    const earlierArchive = archivedBody(dayZero.store, BUILD_INSTANT);
    assert.ok(earlierArchive, 'test bug: the day-zero build must have archived something to leave untouched');

    // The SAME durable universe, three hours later, with the file now on it.
    dayZero.store.objects.set(currentCorrectionKey(CORRECTED_SPOT), JSON.stringify(passing));
    const later = await publishOnce({ store: dayZero.store, at: LATER_BUILD_INSTANT });

    assert.equal(
      archivedBody(dayZero.store, BUILD_INSTANT),
      earlierArchive,
      'the morning a surfer already read must stay exactly as it was archived: a later build may add rows, never rewrite the record of an earlier call',
    );
    assert.notEqual(
      archivedBody(dayZero.store, LATER_BUILD_INSTANT),
      undefined,
      'the later build must archive its own rows under its own build hour',
    );
    assert.equal(rankedCall(later, CORRECTED_SPOT).bias_gate, 'applied', 'the later build must be the one that applied the correction');
    assert.notEqual(
      rankedCall(later, CORRECTED_SPOT).score_q,
      rankedCall(dayZero, CORRECTED_SPOT).score_q,
      'test bug: the later build must genuinely have moved the number, or "the earlier rows are untouched" is a claim about two identical things',
    );
  });
});

// ---------- 02-05 ----------

/**
 * A record that clears every rung and then orders a 2.0 m height move, which
 * is more than any member in this fixture is 1.2 m tall enough to give.
 * Measured: at a forecast 2.0 m above the reported band's midpoint the emitter
 * writes a height key of b 2.0 m on the same physical-floor error as every
 * other fixture here, so it clears its ladder and asks for an absurd wave.
 */
const MORNINGS_ORDERING_A_TWO_METRE_MOVE = {
  count: 18,
  reporters: 6,
  pairedMornings: 18,
  shownScoreQ: 79,
  forecastHeightM: 3.35,
} as const;

/**
 * A record that clears every rung and orders a 30 display point score move.
 * Its forecast sits exactly on the reported band's midpoint, so its height key
 * states a difference of zero and is refused on its own significance rung: the
 * published wave does not move at all, and the score move is therefore the ONLY
 * thing that can move the published score. That isolation is what makes "at
 * most twelve points" a statement about the clamp rather than about the sum of
 * two lanes.
 */
const MORNINGS_ORDERING_A_THIRTY_POINT_MOVE = {
  count: 18,
  reporters: 6,
  pairedMornings: 18,
  shownScoreQ: 100,
  forecastHeightM: 1.35,
} as const;

/** The bytes sitting at a spot's correction key right now. The apply side may read these; it may never write them. */
function storedBytes(published: PublishedBuild, spot_id: string): string | undefined {
  return published.store.objects.get(currentCorrectionKey(spot_id));
}

describe('02-05 acceptance: however big the stored move, the clamps bind where the number is published', () => {
  it('never moves the published height past forty percent of the forecast, however many metres the record orders', async () => {
    const overreaching = emittedRecord(MORNINGS_ORDERING_A_TWO_METRE_MOVE);
    const heightKey = heightKeyOf(overreaching);
    assertKeyEarnsItsMove(heightKey, 'height');

    // The tallest member of the published morning. If the order does not
    // exceed even THAT member's own bound, no clamp binds anywhere and the
    // example would pass without ever reaching the rule under test.
    const tallestMemberHeightM = (FORECAST_HEIGHT_M[TODAY]?.[CORRECTED_SPOT] ?? 0) + 3 * 0.02;
    const allowedFraction = overreaching.clamp.max_abs_h_frac;
    assert.ok(
      Math.abs(heightKey.b) > allowedFraction * tallestMemberHeightM,
      `test bug: this example only watches the clamp bind if the record orders more than the ${allowedFraction} of ${tallestMemberHeightM} m its tallest member allows; it ordered ${heightKey.b} m`,
    );

    const dayZero = await publishOnce();
    const withFile = await publishOnce({ corrections: { [CORRECTED_SPOT]: overreaching } });

    const forecastHeightM = rankedCall(dayZero, CORRECTED_SPOT).h_eff_m;
    const publishedHeightM = rankedCall(withFile, CORRECTED_SPOT).h_eff_m;
    // Every member is bounded at the same fraction of its OWN height, and the
    // published effective height is a fixed positive multiple of the blended
    // raw height while the period is unchanged. So the fraction that bounds
    // each member bounds what a surfer reads.
    const movedM = Math.abs(publishedHeightM - forecastHeightM);
    const allowedM = allowedFraction * forecastHeightM;

    assert.ok(
      movedM <= allowedM + 1e-12,
      `a record ordering ${heightKey.b} m must still move the published wave by at most ${allowedFraction} of the ${forecastHeightM} m forecast, which is ${allowedM} m: it moved ${movedM} m`,
    );
    assert.ok(
      movedM > allowedM - 1e-9,
      `test bug or regression: an order this far past the bound must move the wave all the way TO the bound, or the clamp is not what stopped it; it moved ${movedM} m of an allowed ${allowedM} m`,
    );
    assert.ok(
      publishedHeightM < forecastHeightM,
      `the models ran big against what people saw, so the published wave must fall: it went from ${forecastHeightM} m to ${publishedHeightM} m`,
    );
    assert.equal(
      storedBytes(withFile, CORRECTED_SPOT),
      JSON.stringify(overreaching),
      'the clamp binds where the number is published, never by rewriting the file: the stored record must survive the build byte for byte',
    );
  });

  it('never moves the published score past twelve display points, however many the record orders', async () => {
    const overreaching = emittedRecord(MORNINGS_ORDERING_A_THIRTY_POINT_MOVE);
    const scoreKey = scoreKeyOf(overreaching);
    assertKeyEarnsItsMove(scoreKey, 'score');

    const allowedPoints = overreaching.clamp.max_abs_score;
    assert.ok(
      Math.abs(scoreKey.b) > allowedPoints,
      `test bug: this example only watches the clamp bind if the record orders more than the ${allowedPoints} points it is allowed; it ordered ${scoreKey.b}`,
    );

    const dayZero = await publishOnce();
    const withFile = await publishOnce({ corrections: { [CORRECTED_SPOT]: overreaching } });

    const forecastScore = rankedCall(dayZero, CORRECTED_SPOT).score_q;
    const publishedScore = rankedCall(withFile, CORRECTED_SPOT).score_q;

    assert.equal(
      rankedCall(withFile, CORRECTED_SPOT).h_eff_m,
      rankedCall(dayZero, CORRECTED_SPOT).h_eff_m,
      'test bug: this fixture only isolates the score clamp if its height key moves nothing, so the published wave must be untouched',
    );
    assert.ok(
      forecastScore > allowedPoints,
      `test bug: the day-zero score must have room to fall the whole ${allowedPoints} points, or the floor at zero would stop the move instead of the clamp; it was ${forecastScore}`,
    );

    assert.ok(
      forecastScore - publishedScore <= allowedPoints,
      `a record ordering ${scoreKey.b} display points must still move the published score by at most ${allowedPoints}: it fell from ${forecastScore} to ${publishedScore}`,
    );
    assert.equal(
      forecastScore - publishedScore,
      allowedPoints,
      `test bug or regression: an order this far past the limit must move the score all the way TO the limit, or the clamp is not what stopped it; it fell ${forecastScore - publishedScore} points`,
    );
    assert.equal(
      rankedCall(withFile, CORRECTED_SPOT).bias_applied,
      -allowedPoints / 100,
      'the archived bias must be the CLAMPED move, so an operator reads what was actually applied rather than what was asked for',
    );
    assert.equal(
      storedBytes(withFile, CORRECTED_SPOT),
      JSON.stringify(overreaching),
      'the clamp binds where the number is published, never by rewriting the file: the stored record must survive the build byte for byte',
    );
  });
});
