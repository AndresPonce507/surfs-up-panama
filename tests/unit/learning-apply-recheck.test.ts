// Declared-law tests for the apply side of the correction file
// (applyCorrection in src/scoring/engine.ts), roadmap 02-02.
//
// WHY-NEW-FILE: tests/unit/learning-apply-recheck.test.ts
//   CLOSEST-EXISTING: tests/unit/scoring-laws.test.ts
//   EXTENSION-COST: scoring-laws.test.ts owns the laws declared in
//     05-scoring-engine.md and drives the pure scoring functions with no
//     knowledge of the learning lane's stored file format; folding these in
//     would make it import the correction record's gate vocabulary, and would
//     put the PRESERVE fence (its no-file identity law) in the same file as
//     the tests that change the very function that fence guards.
//   PARALLEL-RATIONALE: the accepted roadmap names this exact path as 02-02's
//     own owned test file, and it is deliberately on the far side of that
//     fence -- scoring-laws.test.ts must stay byte-identical through this
//     step so its no-file identity law keeps its value as an independent
//     check on the change made here.
//
// WHY THESE ARE PROPERTIES. The claim under test is not "this one record
// behaves", it is "no record whatsoever can move a published number past the
// gates". A correction file is written by one process and read by another a
// day later, so the reader's only evidence about a record is the record's own
// stated fields - and one of those fields is the writer's own verdict. A
// reader that believed that verdict would hand anyone who can write the file
// a published number. So the laws below quantify over generated records, with
// the stored `applied` booleans generated INDEPENDENTLY of the evidence
// beside them, which is exactly the shape a forged or a stale file has.
//
// SIGN SSOT is 06-learning-layer.md section 4: residual and bias are forecast
// minus observed. A corrected member is raw MINUS the stored height
// difference, and the score delta is MINUS the stored score difference over
// 100. 05 section 5's delta_q line omits that minus and is stale.
//
// THE HEIGHT LANE, AND WHY IT SHIPS NOW. G5's clamp bounds a member's move at
// forty percent of that member's OWN height, so it can only be taken where
// that height is known. Until this step memberHBias was handed a model and a
// lead time and nothing else, so the fraction had nowhere to bind, and the
// lane was deliberately INERT: exactly zero metres, whatever a record stated.
// That was a stated refusal recorded in the 02-02 contract, not a gap, and its
// stated condition was that the metres and their clamp land in the SAME change
// -- the one that teaches this port the member's height. This is that change.
// memberHBias now takes the member's height as a required third argument, so
// the bound travels with the move and a body cannot subtract stored metres
// without one. A REQUIRED parameter rather than an optional one, deliberately:
// an optional height has no honest default, and a call site that forgot to
// pass it would silently revert the whole lane to inert with every test still
// green. The two laws below are the pair -- saturation, then exactness -- and
// the saturation law carries a counter that fails it outright unless the
// generated space really did contain keys whose stored metres EXCEED their own
// bound, because a clamp law that never saw an oversized move proves nothing.
// The SCORE clamp needs no member height, travels inside the record as
// clamp.max_abs_score, and is claimed by the second describe block below.
//
// Layer: unit, pure functions only. applyCorrection reads nothing but its two
// arguments; no store, no clock, no ambient world.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import type { GatedKey, StoredCorrection } from "../../src/learning/correction-file";
import { G1_MIN_MORNINGS, SIGMA_EFF, leadBucketOf } from "../../src/learning/constants";
import { gateStandardError } from "../../src/learning/estimate";
import { G2_MIN_REPORTERS, G3_SIGNIFICANCE_MULTIPLE } from "../../src/learning/gates";
import { applyCorrection, type SpotSeed } from "../../src/scoring/engine";

const SPOT_ID = "playa-venao";
/** Two models, so a law about per-source keying is not vacuous on one key. */
const SOURCE_A = "ncep_gfswave016";
const SOURCE_B = "ecmwf_wam";
/** Two lead times landing in two different buckets (06 section 8). */
const LEAD_H_NEAR = 6;
const LEAD_H_FAR = 36;
/** A model and a lead the generated records below never state. */
const UNSTATED_SOURCE = "a_model_no_record_here_mentions";

const seed: SpotSeed = {
  spot_id: SPOT_ID,
  name: "Playa Venao",
  region_id: "pa-pacific",
  timezone: "America/Panama",
  shore_normal_deg: 200,
  swell_window_deg: [160, 260],
  h_ref_m: 1.5,
  s_size: 0.6,
  wind_optimum: { u_star_kt: 6, k_on_kt: 8, k_off_kt: 18, k_cross_kt: 12 },
  tide: { optimum: "mid_rising", sigma: "wide", range_class: "meso" },
};

// ---------- generators ----------

/**
 * A stored magnitude at the two decimals the emitter actually writes, drawn
 * evenly across its whole range.
 *
 * NOT fc.double, and the difference is load bearing rather than stylistic.
 * fc.double samples uniformly over the REPRESENTABLE doubles of a range, and
 * representable doubles crowd around zero: the overwhelming majority of draws
 * from `fc.double({min: -1.5, max: 1.5})` land within a rounding error of 0,
 * so a stored height difference essentially never reaches the region where
 * its own ladder can clear. Measured on this file's own generators: with
 * fc.double, 300 runs produced ZERO keys whose evidence cleared the height
 * ladder, which silently emptied every law below of the cases it exists to
 * cover. Scaled integers put the draws where the gates actually live.
 */
function someStoredMagnitude(limit: number): fc.Arbitrary<number> {
  const hundredths = Math.round(limit * 100);
  return fc.integer({ min: -hundredths, max: hundredths }).map((value) => value / 100);
}

/** A stated standard error: never negative, same two decimals. */
function someStoredStandardError(limit: number): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: Math.round(limit * 100) }).map((value) => value / 100);
}

/**
 * One stated key. `applied` is generated independently of everything beside
 * it on purpose: a record whose verdict agrees with its evidence and a record
 * whose verdict was forged are the same shape, and the reader must not be
 * able to tell them apart by trusting the field.
 */
function someGatedKey(bLimit: number, seLimit: number): fc.Arbitrary<GatedKey> {
  return fc.record({
    b: someStoredMagnitude(bLimit),
    se: someStoredStandardError(seLimit),
    n: fc.integer({ min: 0, max: 60 }),
    reporters: fc.integer({ min: 0, max: 12 }),
    applied: fc.boolean(),
    shrunk_from_global: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  });
}

type RecordShape = {
  readonly scoreDelta: GatedKey | null;
  readonly nearA: GatedKey;
  readonly farA: GatedKey;
  readonly farB: GatedKey;
  readonly maxAbsScore: number;
  readonly maxAbsHeightFraction: number;
  readonly memberHeightM: number;
};

/** Display points, against a score error the emitter states on the same scale. */
const someScoreKey = someGatedKey(40, 5);
/** Metres, against a height error on the metre scale rather than the score's. */
const someHeightKey = someGatedKey(1.5, 1.5);

/**
 * A member's own forecast height in metres, at the scale this coast actually
 * produces. Drawn well BELOW the height keys' stored magnitudes on purpose:
 * the bound is a fraction of this number, so a small member is what forces the
 * clamp to bind, and a law that only ever saw big members would never watch it
 * saturate.
 */
const someMemberHeight = fc.integer({ min: 0, max: 300 }).map((value) => value / 100);

const someRecordShape: fc.Arbitrary<RecordShape> = fc.record({
  // Sometimes no score move at all: the emitter omits it for a spot whose
  // reports never carried the score a build had shown them.
  scoreDelta: fc.option(someScoreKey, { nil: null }),
  nearA: someHeightKey,
  farA: someHeightKey,
  farB: someHeightKey,
  // Generated rather than pinned to the shipped constant, so a body that
  // hardcoded 12 instead of reading the record's own limit is caught.
  maxAbsScore: fc.double({ min: 1, max: 30, noNaN: true, noDefaultInfinity: true }),
  // Same reason, for G5's twin: a body that hardcoded 0.40 instead of reading
  // the fraction the record itself carries is caught by the generated value.
  maxAbsHeightFraction: fc.integer({ min: 5, max: 80 }).map((value) => value / 100),
  memberHeightM: someMemberHeight,
});

function recordOf(shape: RecordShape): StoredCorrection {
  const record: StoredCorrection = {
    spot_id: SPOT_ID,
    schema: "spot-correction/1",
    computed_at: "2026-08-09T07:00:00.000Z",
    bias: {
      swell_h_m: {
        per_source: {
          [SOURCE_A]: {
            [leadBucketOf(LEAD_H_NEAR)]: shape.nearA,
            [leadBucketOf(LEAD_H_FAR)]: shape.farA,
          },
          [SOURCE_B]: {
            [leadBucketOf(LEAD_H_FAR)]: shape.farB,
          },
        },
      },
    },
    clamp: { max_abs_h_frac: shape.maxAbsHeightFraction, max_abs_score: shape.maxAbsScore },
  };
  if (shape.scoreDelta !== null) {
    record.score_delta = { ...shape.scoreDelta, units: "display_points" };
  }
  return record;
}

/** The same record with every stored verdict rewritten to `claim`. Nothing else moves. */
function withEveryVerdictClaiming(record: StoredCorrection, claim: boolean): StoredCorrection {
  const perSource = Object.fromEntries(
    Object.entries(record.bias.swell_h_m.per_source).map(([source, byLead]) => [
      source,
      Object.fromEntries(
        Object.entries(byLead).map(([lead, key]) => [lead, { ...key, applied: claim }]),
      ),
    ]),
  );
  const rewritten: StoredCorrection = {
    ...record,
    bias: { swell_h_m: { per_source: perSource } },
  };
  if (record.score_delta !== undefined) {
    rewritten.score_delta = { ...record.score_delta, applied: claim };
  }
  return rewritten;
}

// ---------- the oracle the laws share ----------

/** What the ladder says about a key read from the record's OWN stated fields (06 section 7). */
function statedEvidenceClearsTheLadder(key: GatedKey | undefined, sigmaEff: number): boolean {
  if (key === undefined) return false;
  const se = gateStandardError(key.se, sigmaEff, key.n);
  return (
    key.n >= G1_MIN_MORNINGS
    && key.reporters >= G2_MIN_REPORTERS
    && Math.abs(key.b) > G3_SIGNIFICANCE_MULTIPLE * se
  );
}

/**
 * G5's bound, 06 section 7: the metres a member may move, at most, taken from
 * the fraction the RECORD carries and the member's OWN height. Never a
 * constant, so a body that hardcoded 0.40 is caught.
 */
function boundedMoveFor(record: StoredCorrection, memberHeightM: number): number {
  return Math.abs(record.clamp.max_abs_h_frac * memberHeightM);
}

/** The three (source, lead) pairs every generated record states a key at. */
const STATED_MEMBER_KEYS = [
  [SOURCE_A, LEAD_H_NEAR],
  [SOURCE_A, LEAD_H_FAR],
  [SOURCE_B, LEAD_H_FAR],
] as const;

/** Every observable of one outcome, flattened so two outcomes can be compared whole. */
function observablesOf(record: StoredCorrection, memberHeightM: number): {
  gate: string;
  delta_q: number;
  biases: number[];
} {
  const outcome = applyCorrection(seed, record);
  return {
    gate: outcome.gate,
    delta_q: outcome.delta_q,
    biases: [
      outcome.memberHBias(SOURCE_A, LEAD_H_NEAR, memberHeightM),
      outcome.memberHBias(SOURCE_A, LEAD_H_FAR, memberHeightM),
      outcome.memberHBias(SOURCE_B, LEAD_H_FAR, memberHeightM),
      outcome.memberHBias(UNSTATED_SOURCE, LEAD_H_FAR, memberHeightM),
    ],
  };
}

// ---------- the laws ----------

describe("applyCorrection: the point -- a stored verdict has no power, the ladder is re-run from the record's own evidence", () => {
  it("returns the same gate, the same score move and the same member biases whatever every stored verdict claims", () => {
    fc.assert(
      fc.property(someRecordShape, (shape) => {
        const record = recordOf(shape);
        const asApplied = observablesOf(withEveryVerdictClaiming(record, true), shape.memberHeightM);
        const asRefused = observablesOf(withEveryVerdictClaiming(record, false), shape.memberHeightM);

        assert.deepEqual(
          asApplied,
          asRefused,
          "a record that claims every key was applied and the same record claiming none was must produce byte-identical outcomes, or whoever can write the file can move a published number",
        );
      }),
      { numRuns: 200 },
    );
  });

  it("moves no number at all unless the stated evidence behind that very number cleared the ladder", () => {
    fc.assert(
      fc.property(someRecordShape, (shape) => {
        const record = recordOf(shape);
        const outcome = applyCorrection(seed, record);

        if (outcome.delta_q !== 0) {
          assert.ok(
            statedEvidenceClearsTheLadder(record.score_delta, SIGMA_EFF.score.value),
            `the score moved by ${outcome.delta_q} on evidence the ladder refuses: ${JSON.stringify(record.score_delta)}`,
          );
        }

        // The height half of this law, which the inert lane could not carry
        // because a lane that moves nothing can never violate it. It is real
        // again now that metres move, and it is the per-key half of the claim:
        // a member moving at all requires BOTH that the file's own score
        // verdict cleared and that the very key behind that member cleared on
        // its own stated evidence, at the HEIGHT noise floor rather than the
        // score's.
        for (const [source, leadH] of STATED_MEMBER_KEYS) {
          const moved = outcome.memberHBias(source, leadH, shape.memberHeightM);
          if (moved === 0) continue;
          const stated = record.bias.swell_h_m.per_source[source]?.[leadBucketOf(leadH)];
          assert.ok(
            statedEvidenceClearsTheLadder(record.score_delta, SIGMA_EFF.score.value),
            `${source} moved by ${moved} m out of a file whose own score verdict the ladder refuses: ${JSON.stringify(record.score_delta)}`,
          );
          assert.ok(
            statedEvidenceClearsTheLadder(stated, SIGMA_EFF.height.value),
            `${source} at ${leadBucketOf(leadH)} moved by ${moved} m on key evidence the ladder refuses: ${JSON.stringify(stated)}`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("applyCorrection: the score move carries 06 section 4's sign and saturates at the record's own limit", () => {
  it("moves the score by minus the stored difference over 100, never past the limit the record itself states", () => {
    fc.assert(
      fc.property(someRecordShape, (shape) => {
        const record = recordOf(shape);
        const outcome = applyCorrection(seed, record);
        const limit = record.clamp.max_abs_score / 100;

        assert.ok(
          Math.abs(outcome.delta_q) <= limit + 1e-12,
          `the score move (${outcome.delta_q}) must never pass the limit the record itself states (${limit}); a corrupt file must not be able to order an absurd number`,
        );

        const scoreDelta = record.score_delta;
        if (scoreDelta === undefined) return;
        if (!statedEvidenceClearsTheLadder(scoreDelta, SIGMA_EFF.score.value)) return;

        const bounded = Math.max(
          -record.clamp.max_abs_score,
          Math.min(record.clamp.max_abs_score, scoreDelta.b),
        );
        assert.ok(
          Math.abs(outcome.delta_q - -bounded / 100) < 1e-12,
          `a stored difference of ${scoreDelta.b} display points must move the score by ${-bounded / 100}, minus its own bounded value over 100 (06 section 4); it moved ${outcome.delta_q}`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it("holds a thirty-point stored move to the twelve published points the emitter's own clamp allows", () => {
    const record = recordOf({
      scoreDelta: { b: 30, se: 1, n: 30, reporters: 9, applied: false, shrunk_from_global: 0 },
      nearA: { b: 0, se: 0, n: 0, reporters: 0, applied: true, shrunk_from_global: 0 },
      farA: { b: 0, se: 0, n: 0, reporters: 0, applied: true, shrunk_from_global: 0 },
      farB: { b: 0, se: 0, n: 0, reporters: 0, applied: true, shrunk_from_global: 0 },
      maxAbsScore: 12,
      maxAbsHeightFraction: 0.4,
      memberHeightM: 1.5,
    });

    const outcome = applyCorrection(seed, record);

    assert.equal(
      outcome.gate,
      "applied",
      "the oversized record must still clear every rung on its own evidence; it is the clamp that bounds it, not a gate",
    );
    assert.equal(
      outcome.delta_q,
      -0.12,
      "a stored thirty-point move must reach the published score as twelve points and no more, in the direction 06 section 4 fixes",
    );
  });
});

describe("applyCorrection: a member's move saturates at the fraction of its own height the record allows", () => {
  it("never moves any member past max_abs_h_frac of that member's own forecast height, whatever the record orders", () => {
    // The counter is what stops this law being a tautology, and it is aimed at
    // the clamp rather than at the move. A generated space in which no stored
    // difference ever EXCEEDED its own bound would satisfy every assertion
    // below while never once watching the clamp bind -- the same shape of
    // vacuity the fc.double generator defect produced at 02-02, caught then by
    // measuring rather than assuming. So the runs where the stored metres are
    // genuinely bigger than the member can carry are counted, and the law
    // fails outright if the generators never produced one.
    let keysWhoseStoredMetresExceedTheirOwnBound = 0;

    fc.assert(
      fc.property(someRecordShape, (shape) => {
        const record = recordOf(shape);
        const outcome = applyCorrection(seed, record);
        const bound = boundedMoveFor(record, shape.memberHeightM);

        assert.equal(
          outcome.memberHBias(UNSTATED_SOURCE, LEAD_H_FAR, shape.memberHeightM),
          0,
          "a model the record says nothing about must be corrected by exactly zero, never by another model's difference",
        );

        for (const [source, leadH] of STATED_MEMBER_KEYS) {
          const stated = record.bias.swell_h_m.per_source[source]?.[leadBucketOf(leadH)];
          assert.ok(stated, "test bug: the generated record states no key here");
          if (
            Math.abs(stated.b) > bound
            && statedEvidenceClearsTheLadder(record.score_delta, SIGMA_EFF.score.value)
            && statedEvidenceClearsTheLadder(stated, SIGMA_EFF.height.value)
          ) {
            keysWhoseStoredMetresExceedTheirOwnBound += 1;
          }
          assert.ok(
            Math.abs(outcome.memberHBias(source, leadH, shape.memberHeightM)) <= bound + 1e-12,
            `${source} at ${leadBucketOf(leadH)} moved ${outcome.memberHBias(source, leadH, shape.memberHeightM)} m on a member ${shape.memberHeightM} m high, past the ${bound} m G5 allows it (${record.clamp.max_abs_h_frac} of its own height); a corrupt file must never be able to order an absurd wave`,
          );
        }
      }),
      { numRuns: 300 },
    );

    assert.ok(
      keysWhoseStoredMetresExceedTheirOwnBound > 0,
      "this law is vacuous unless the generated records contain at least one key whose stored metres exceed their own bound, because only those runs watch the clamp bind at all; none did, so the generators, not the apply body, are what passed",
    );
  });

  it("subtracts the stored metres exactly, bounded, at every key whose own evidence clears the ladder, and exactly zero at every key it does not", () => {
    let keysThatMoved = 0;

    fc.assert(
      fc.property(someRecordShape, (shape) => {
        const record = recordOf(shape);
        const outcome = applyCorrection(seed, record);
        const bound = boundedMoveFor(record, shape.memberHeightM);
        const fileClears = statedEvidenceClearsTheLadder(
          record.score_delta,
          SIGMA_EFF.score.value,
        );

        for (const [source, leadH] of STATED_MEMBER_KEYS) {
          const stated = record.bias.swell_h_m.per_source[source]?.[leadBucketOf(leadH)];
          assert.ok(stated, "test bug: the generated record states no key here");
          const keyClears = statedEvidenceClearsTheLadder(stated, SIGMA_EFF.height.value);
          const moved = outcome.memberHBias(source, leadH, shape.memberHeightM);

          if (!fileClears || !keyClears) {
            assert.equal(
              moved,
              0,
              `${source} at ${leadBucketOf(leadH)} must be corrected by exactly zero metres when ${fileClears ? "its own key's" : "the file's"} stated evidence does not clear the ladder; it moved ${moved}`,
            );
            continue;
          }

          const expected = Math.max(-bound, Math.min(bound, stated.b));
          if (expected !== 0) keysThatMoved += 1;
          assert.ok(
            Math.abs(moved - expected) < 1e-12,
            `${source} at ${leadBucketOf(leadH)} states ${stated.b} m against a ${bound} m bound, so a corrected member is raw MINUS ${expected} m (06 section 4); the apply body returned ${moved}`,
          );
        }
      }),
      { numRuns: 300 },
    );

    assert.ok(
      keysThatMoved > 0,
      "this law is vacuous unless the generated records contain at least one key that actually moves a member; none did, so the generators, not the apply body, are what passed",
    );
  });
});
