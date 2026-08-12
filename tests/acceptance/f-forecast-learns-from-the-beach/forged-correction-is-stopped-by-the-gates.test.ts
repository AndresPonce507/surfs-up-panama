// Accepted roadmap 02-02: “Real apply body honours gates and clamps”.
// Scenario “A hand-forged file claiming to be applied on six mornings is
// stopped by the builder's own gates”, plus the roadmap's additional scenario
// “A hand-forged file whose difference is buried in its own noise is stopped
// the same way”.
//
// WHERE THIS STEP'S SCENARIO ENTERS, and why it is not blocked here. The
// accepted roadmap records this step's acceptance as unable to go green until
// Pre-requisite 1 lands, because on recover/learning-build the cucumber world
// can only reach the apply seam THROUGH the builder, and the builder still
// passes a literal null. That is a property of that harness, not of the
// claim. applyCorrection is a pure function whose signature IS its driving
// port, so on this branch the scenario enters where the claim lives: at the
// apply seam itself. The builder's own end of it - that a forged file changes
// no published byte - is 02-03's step and its own acceptance file.
//
// THE CLAIM. A correction file is data. It carries a gate verdict its writer
// computed, and a reader that trusted that verdict would let anyone who can
// write the file move a published number. So the apply body re-runs the whole
// ladder from the record's OWN stated evidence - n, distinct reporters, and
// the stored standard error - and the record's `applied` boolean has no power
// whatsoever. Both forgeries below say they were applied. Neither moves
// anything.
//
// SIGN SSOT is 06 section 4: residual and bias are forecast minus observed,
// so a corrected member is raw MINUS b and the score delta is MINUS
// b_score/100. 05 section 5's delta_q line omits that minus and is stale;
// the oracles here assert the 06 sign in both lanes.
//
// THE HEIGHT LANE SHIPS HERE, WITH ITS CLAMP, IN ONE CHANGE. The roadmap's
// height criterion has two halves: the metres subtracted per (source, lead
// bucket), and the clamp of that move to forty percent of the member's own
// height. 02-02 shipped the lane INERT and recorded why: memberHBias was
// handed a model and a lead time and never the member's height, so the
// fractional bound had nowhere to bind, and the metres could not honestly ship
// ahead of it. That was a stated refusal with a stated condition -- the two
// halves land together, in the change that teaches this port the member's
// height -- and this is that change. memberHBias now takes the member's height
// as a REQUIRED third argument, so no call site can subtract stored metres
// without also handing over the number that bounds them. The two examples
// below are the pair: one where the stored move fits inside its bound and is
// subtracted whole, one where it does not and saturates. The SCORE clamp needs
// no member height, travels inside the record as clamp.max_abs_score, and is
// claimed here and by this step's unit law exactly as before.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  buildCorrectionRecords,
  type SpotInputs,
  type StoredCorrection,
} from "../../../src/learning/correction-file";
import type { ObservationRow, PredictionRow } from "../../../src/learning/inputs";
import {
  applyCorrection,
  type CorrectionOutcome,
  type SpotSeed,
} from "../../../src/scoring/engine";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
/** 36 h lands in lead_24_48, the bucket the fixture's predictions are keyed to. */
const LEAD_H = 36;
const MEMBER_HEIGHT_M = 1.9;

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

class FixedClock {
  now(): Date {
    return new Date("2026-08-09T07:00:00.000Z");
  }
}

/** `count` paired mornings from `reporters` distinct people, the shape 06 section 5.1 pairs on. */
function pairedMornings(count: number, reporters: number): SpotInputs {
  const observations: ObservationRow[] = [];
  const predictions: PredictionRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const observedAt = new Date("2026-07-01T18:41:00Z");
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);

    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_seen_${index % reporters}`,
      observed_at: observedAt.toISOString(),
      size_band: "chest_head",
      quality: "good",
      predicted: { score_q: 82 },
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: LEAD_H,
      swell_h_m: MEMBER_HEIGHT_M + (index % 3) * 0.05,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return { spotId: SPOT_ID, observations, predictions };
}

/** What the shipped nightly fit would actually write for this many mornings and people. */
function emittedRecord(count: number, reporters: number): StoredCorrection {
  const record = buildCorrectionRecords(
    [pairedMornings(count, reporters)],
    new FixedClock(),
  ).get(SPOT_ID);
  assert.ok(record, "test bug: the emitter wrote no record for the fixture spot");
  assert.ok(record.score_delta, "test bug: the fixture must produce a score move");
  return record;
}

/**
 * The forgery: every gate verdict in the record flipped to a claim of having
 * been applied, and nothing else touched. This is exactly what someone with
 * write access to the bucket, or a corrupted writer, would produce.
 */
function forgedAsApplied(record: StoredCorrection): StoredCorrection {
  const claimed = true;
  const perSource = Object.fromEntries(
    Object.entries(record.bias.swell_h_m.per_source).map(([source, byLead]) => [
      source,
      Object.fromEntries(
        Object.entries(byLead).map(([lead, key]) => [
          lead,
          { ...key, applied: claimed },
        ]),
      ),
    ]),
  );
  const forged: StoredCorrection = {
    ...record,
    bias: { swell_h_m: { per_source: perSource } },
  };
  if (record.score_delta !== undefined) {
    forged.score_delta = { ...record.score_delta, applied: claimed };
  }
  return forged;
}

function heightBiasApplied(
  outcome: CorrectionOutcome,
  memberHeightM: number = MEMBER_HEIGHT_M,
): number {
  return outcome.memberHBias(SOURCE, LEAD_H, memberHeightM);
}

// ---------- oracles ----------

function assertStoppedByTheGates(
  outcome: CorrectionOutcome,
  expectedGate: string,
): void {
  assert.equal(
    outcome.gate,
    expectedGate,
    `the apply body must name the gate that stopped the file, so the archive explains itself; it said ${outcome.gate}`,
  );
  assert.equal(
    outcome.delta_q,
    0,
    "a file the gates refused must move the score by exactly zero, whatever the file claims about itself",
  );
  assert.equal(
    heightBiasApplied(outcome),
    0,
    "a file the gates refused must move the member height by exactly zero, whatever the file claims about itself",
  );
}

/** The stored height key at the one (model, lead bucket) every fixture here is built around. */
function storedHeightKeyOf(record: StoredCorrection) {
  const stored = record.bias.swell_h_m.per_source[SOURCE]?.["lead_24_48"];
  assert.ok(stored, "test bug: the record states no height difference at the fixture key");
  return stored;
}

function assertMovesTheScoreAndTheHeight(
  outcome: CorrectionOutcome,
  record: StoredCorrection,
  memberHeightM: number,
): void {
  const scoreDelta = record.score_delta;
  assert.ok(scoreDelta, "test bug: the record under test states no score move");
  assert.equal(
    outcome.gate,
    "applied",
    "a record that clears every gate on its own stated evidence must be applied",
  );
  assert.ok(
    Math.abs(outcome.delta_q - -scoreDelta.b / 100) < 1e-12,
    `the score delta must be MINUS the stored score difference over 100 (06 section 4); the stored difference was ${scoreDelta.b} and the delta was ${outcome.delta_q}`,
  );
  const storedHeight = storedHeightKeyOf(record);
  // The bound is read off the record's OWN stated fraction and the member's
  // OWN height, never off the shipped constant: a body that hardcoded 0.40
  // would pass an oracle that hardcoded it too.
  const bound = record.clamp.max_abs_h_frac * memberHeightM;
  const expected = Math.max(-bound, Math.min(bound, storedHeight.b));
  const moved = heightBiasApplied(outcome, memberHeightM);
  assert.ok(
    Math.abs(moved - expected) < 1e-12,
    `a corrected member is raw MINUS the stored difference, bounded by G5 at ${record.clamp.max_abs_h_frac} of the member's own ${memberHeightM} m (${bound} m): this record orders ${storedHeight.b} m at ${SOURCE} lead_24_48, so the apply body must subtract ${expected} m, not ${moved}`,
  );
}

describe("02-02 acceptance: a hand-forged correction file is stopped by the gates that wrote it", () => {
  it("stops a file claiming to be applied on six mornings, and names the morning gate", () => {
    const forged = forgedAsApplied(emittedRecord(6, 6));

    assert.equal(
      forged.score_delta?.applied,
      true,
      "test bug: the forgery must actually claim to have been applied",
    );
    assert.ok(
      forged.score_delta !== undefined && forged.score_delta.n < 10,
      "test bug: the forgery must state fewer mornings than the morning gate allows",
    );

    const outcome = applyCorrection(seed, forged);

    assertStoppedByTheGates(outcome, "n_lt_10");
    assert.throws(
      () => assertStoppedByTheGates({ ...outcome, delta_q: 0.05 }, "n_lt_10"),
      /move the score by exactly zero/,
      "the oracle must reject an apply body that let a forged verdict move the score",
    );
  });

  it("stops a file whose difference is buried in its own stated noise, and names the significance gate", () => {
    const honest = emittedRecord(18, 6);
    const scoreDelta = honest.score_delta;
    assert.ok(scoreDelta, "test bug: the fixture must state a score move");
    const buried = forgedAsApplied({
      ...honest,
      score_delta: { ...scoreDelta, se: 100 },
    });

    assert.ok(
      Math.abs(scoreDelta.b) <= 2 * 100,
      "test bug: the fixture must actually bury its difference inside twice its stated error",
    );

    const outcome = applyCorrection(seed, buried);

    assertStoppedByTheGates(outcome, "not_significant");
    assert.throws(
      () =>
        assertStoppedByTheGates({ ...outcome, gate: "applied" }, "not_significant"),
      /must name the gate that stopped the file/,
      "the oracle must reject an apply body that archives a refusal as an application",
    );
  });

  it("moves the score and subtracts the stored metres whole when they fit inside the member's own bound", () => {
    const honest = emittedRecord(18, 6);

    // Guard against a vacuous pass. The fixture's height key must clear every
    // rung on its own stated evidence and order a genuinely non-zero move, or
    // the claim below is satisfied by a record that asked for nothing.
    const fixtureHeight = storedHeightKeyOf(honest);
    assert.ok(
      fixtureHeight.n >= 10 && fixtureHeight.reporters >= 5
        && Math.abs(fixtureHeight.b) > 2 * fixtureHeight.se
        && fixtureHeight.b !== 0,
      `test bug: the fixture's height key must clear the ladder on its own stated evidence and order a non-zero move; it states n=${fixtureHeight.n}, reporters=${fixtureHeight.reporters}, b=${fixtureHeight.b}, se=${fixtureHeight.se}`,
    );
    // This example is the PASS-THROUGH half of the pair, so the stored metres
    // must genuinely fit inside the bound. If they did not, this example would
    // silently become a second saturation test and nothing would ever check
    // that an in-bound move is subtracted whole.
    assert.ok(
      Math.abs(fixtureHeight.b) < honest.clamp.max_abs_h_frac * MEMBER_HEIGHT_M,
      `test bug: this example only proves pass-through if the stored ${fixtureHeight.b} m fits inside the ${honest.clamp.max_abs_h_frac * MEMBER_HEIGHT_M} m bound a ${MEMBER_HEIGHT_M} m member allows`,
    );

    const outcome = applyCorrection(seed, honest);

    assertMovesTheScoreAndTheHeight(outcome, honest, MEMBER_HEIGHT_M);
    assert.throws(
      () =>
        assertMovesTheScoreAndTheHeight(
          { ...outcome, delta_q: -outcome.delta_q },
          honest,
          MEMBER_HEIGHT_M,
        ),
      /MINUS the stored score difference/,
      "the oracle must reject a score delta applied with the wrong sign",
    );
    assert.throws(
      () =>
        assertMovesTheScoreAndTheHeight(
          { ...outcome, memberHBias: () => 0 },
          honest,
          MEMBER_HEIGHT_M,
        ),
      /the apply body must subtract/,
      "the oracle must reject an apply body that leaves an earned height move at day zero",
    );
  });

  it("saturates the stored metres at the fraction of its own height a small member can carry", () => {
    const honest = emittedRecord(18, 6);
    const fixtureHeight = storedHeightKeyOf(honest);
    // A member barely a metre high. The record is the same one the example
    // above drives, so the ONLY thing that changed is the member the correction
    // is being applied to -- which is exactly what G5 says the bound depends on.
    const smallMemberM = 1.0;
    const bound = honest.clamp.max_abs_h_frac * smallMemberM;

    // Guard against a vacuous pass: this example proves nothing unless the
    // stored move genuinely exceeds what this member can carry.
    assert.ok(
      Math.abs(fixtureHeight.b) > bound,
      `test bug: the clamp cannot be watched binding unless the stored ${fixtureHeight.b} m exceeds the ${bound} m a ${smallMemberM} m member allows`,
    );

    const outcome = applyCorrection(seed, honest);
    const moved = heightBiasApplied(outcome, smallMemberM);

    assert.ok(
      Math.abs(moved - bound) < 1e-12,
      `a stored ${fixtureHeight.b} m move on a ${smallMemberM} m member must reach that member as ${bound} m and no more, because G5 bounds the worst public error at ${honest.clamp.max_abs_h_frac} of the member's own height; it moved ${moved}`,
    );
    assert.ok(
      moved < Math.abs(fixtureHeight.b),
      "test bug: the clamp must have actually reduced the stored move, or this example watched nothing bind",
    );
  });

  it("keeps the launch state exactly as it shipped when there is no file at all", () => {
    const outcome = applyCorrection(seed, null);

    assert.equal(outcome.gate, "no_file", "no file is still no file");
    assert.equal(outcome.delta_q, 0, "no file still contributes no score delta");
    assert.equal(
      heightBiasApplied(outcome),
      0,
      "no file still contributes no member height bias",
    );
  });
});
