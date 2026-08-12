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
// THE HEIGHT LANE SHIPS INERT, AND THAT IS A CLAIM, NOT A GAP. The roadmap's
// height criterion has two halves: the metres subtracted per (source, lead
// bucket), and the clamp of that move to forty percent of the member's own
// height. The two may only ship together. memberHBias is handed a model and a
// lead time, never the member's height, so the fractional clamp can only bind
// at the one call site that knows that height - src/pipeline/build.ts line
// 218 - which this lane must not touch while a concurrent lane owns it.
// Shipping the metres without their clamp would leave a window in which a
// corrupt or forged file could order an absurd wave height the moment 02-03
// wires the record in, and G5 (06 section 7) exists precisely to make that
// impossible. So until the clamp can land in the same change, every member is
// corrected by EXACTLY ZERO metres, and the last test below proves it against
// a record whose height key clears its own ladder by a wide margin. Zero is
// the day-zero forecast, which is never a lie; an unclamped move would be one.
// The SCORE clamp needs no member height, travels inside the record as
// clamp.max_abs_score, and IS claimed here and by this step's unit law.

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

function heightBiasApplied(outcome: CorrectionOutcome): number {
  return outcome.memberHBias(SOURCE, LEAD_H);
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

function assertMovesTheScoreAndLeavesEveryHeightAtDayZero(
  outcome: CorrectionOutcome,
  record: StoredCorrection,
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
  const storedHeight = record.bias.swell_h_m.per_source[SOURCE]?.["lead_24_48"];
  assert.ok(storedHeight, "test bug: the record states no height difference at the fixture key");
  assert.equal(
    heightBiasApplied(outcome),
    0,
    `no member height may move until the forty-percent clamp can move with it: this record orders ${storedHeight.b} m at ${SOURCE} lead_24_48 and the apply body must subtract exactly zero, not ${heightBiasApplied(outcome)}`,
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

  it("moves the score when the record's own stated evidence clears every gate, and still moves no wave height at all", () => {
    const honest = emittedRecord(18, 6);

    // Guard against a vacuous pass, and it is this guard that gives the height
    // half of this example its whole force. The fixture's height key clears
    // every rung on its own stated evidence and orders a move of well over half
    // a metre, so a body that shipped the metres without their clamp WOULD move
    // this member. Zero here is therefore the apply body's deliberate refusal,
    // never a record that asked for nothing.
    const fixtureHeight = honest.bias.swell_h_m.per_source[SOURCE]?.["lead_24_48"];
    assert.ok(fixtureHeight, "test bug: the fixture states no height difference at the key under test");
    assert.ok(
      fixtureHeight.n >= 10 && fixtureHeight.reporters >= 5
        && Math.abs(fixtureHeight.b) > 2 * fixtureHeight.se
        && fixtureHeight.b !== 0,
      `test bug: the fixture's height key must clear the ladder on its own stated evidence and order a non-zero move, or the inert claim below proves nothing; it states n=${fixtureHeight.n}, reporters=${fixtureHeight.reporters}, b=${fixtureHeight.b}, se=${fixtureHeight.se}`,
    );

    const outcome = applyCorrection(seed, honest);

    assertMovesTheScoreAndLeavesEveryHeightAtDayZero(outcome, honest);
    assert.throws(
      () =>
        assertMovesTheScoreAndLeavesEveryHeightAtDayZero(
          { ...outcome, delta_q: -outcome.delta_q },
          honest,
        ),
      /MINUS the stored score difference/,
      "the oracle must reject a score delta applied with the wrong sign",
    );
    assert.throws(
      () =>
        assertMovesTheScoreAndLeavesEveryHeightAtDayZero(
          { ...outcome, memberHBias: () => fixtureHeight.b },
          honest,
        ),
      /must subtract exactly zero/,
      "the oracle must reject an apply body that subtracts the stored metres with no clamp on them",
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
