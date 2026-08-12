// Accepted roadmap 03-03: "Similarity groups activate at three gated spots".
//
// The similarity level ships COLLAPSED into the region and activates per group
// once three spots of that break type pass the correction gates
// (06-learning-layer.md section 5.3, adr-pooling-hierarchy-activation decision
// 3). Data-driven: no code change, no configuration flip.
//
// So the two runs below differ in ONE thing, and it is deliberately not the
// data the estimate is built from: the third beach spot's mornings are
// reported by six people in one run and by four in the other. Same mornings,
// same residuals, same counts, same weighted means, therefore the same
// region-wide estimate in both runs -- only the number of GATED beach spots
// moves, from three to two. If the newcomer's stored number changes, only
// activation can have changed it.
//
// The reefs are the control. Three of them pass the gates in both runs, so
// their family is active in both, and their stored numbers must barely move. A
// run where the reefs moved as much as the newcomer would mean something other
// than beach-family activation had shifted underneath.
//
// AMENDED 2026-08-12 BY 04-05, cross-slice by explicit authorisation (see that
// step's contract). This file belongs to 03-03.
//
// WHAT THE OLD CONTROL ASSUMED: that a reef's stored difference is byte-
// identical across the two runs, because nothing a beach does can reach a
// reef whose own family is active in both.
//
// WHY IT WAS WRONG: 06 section 5.2 measures a reporter's habit against the
// key's SHRUNK estimate. So pooling now feeds back into raw estimates, and a
// change in pooling anywhere in the run reaches everywhere the ladder connects.
// The newcomer is two of this fixture's seventy-four mornings and sits in the
// same region as the reefs; when beach-family activation changes what carries
// the newcomer, the newcomer's own estimate moves, the region-wide mean moves
// with it, and the reefs are pooled toward a parent that is no longer the same
// number. There is no path by which the reefs could have stayed identical, and
// the old assertion was only ever true because raw estimates did not depend on
// pooling before this stage existed.
//
// WHAT THE CONTROL NOW SAYS, and it is the same control. The reef must move by
// at least two orders of magnitude LESS than the newcomer: 0.0013 against
// 0.178, a ratio of 142. That keeps the whole force of the original -- if the
// reefs moved comparably, the comparison below would be measuring general
// drift rather than beach-family activation -- while stating something that is
// true of the system as designed. The ratio is asserted rather than the reef's
// absolute move, because the absolute move is a consequence of this fixture's
// proportions and the ratio is the thing the control is actually about.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const TOLERANCE = 1e-6;
/**
 * How much less a reef may move than the newcomer across the two runs. Two
 * orders of magnitude, against the 142 times measured, so the control states a
 * separation of scale rather than pinning this fixture's exact proportions.
 */
const A_REEF_MOVES_THIS_MUCH_LESS = 100;

const NEWCOMER = "playa-recien-abierta";
const THIRD_BEACH = "beach-tres";
const A_REEF = "reef-uno";

class FixedClock {
  now(): Date {
    return new Date(CLOCK_ISO);
  }
}

class MemoryLearningStore {
  private readonly values = new Map<string, string>();

  async list(prefix: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, body: string): Promise<void> {
    this.values.set(key, body);
  }
}

type SpotMornings = {
  readonly spotId: string;
  readonly breakType: string;
  readonly mornings: number;
  readonly reporters: number;
  readonly forecastRanBigByM: number;
};

/** The beach family reads the forecast running small; the reefs read it running big. */
const BEACH_RAW = -0.3;
const REEF_RAW = 0.25;
const NEWCOMER_RAW = 0.6;

function fixtureWithThirdBeachReportedBy(reporters: number): SpotMornings[] {
  return [
    { spotId: "beach-uno", breakType: "beach", mornings: 12, reporters: 6, forecastRanBigByM: BEACH_RAW },
    { spotId: "beach-dos", breakType: "beach", mornings: 12, reporters: 6, forecastRanBigByM: BEACH_RAW },
    { spotId: THIRD_BEACH, breakType: "beach", mornings: 12, reporters, forecastRanBigByM: BEACH_RAW },
    { spotId: A_REEF, breakType: "reef", mornings: 12, reporters: 6, forecastRanBigByM: REEF_RAW },
    { spotId: "reef-dos", breakType: "reef", mornings: 12, reporters: 6, forecastRanBigByM: REEF_RAW },
    { spotId: "reef-tres", breakType: "reef", mornings: 12, reporters: 6, forecastRanBigByM: REEF_RAW },
    { spotId: NEWCOMER, breakType: "beach", mornings: 2, reporters: 2, forecastRanBigByM: NEWCOMER_RAW },
  ];
}

function seedsFor(spots: readonly SpotMornings[]): SpotSeed[] {
  return spots.map((spot) => ({
    spot_id: spot.spotId,
    region_id: "pa-pacific",
    coast: "pacific",
    break_type: spot.breakType,
  }));
}

function dayOf(index: number): string {
  const day = new Date("2026-07-01T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + index);
  return day.toISOString().slice(0, 10);
}

function logsFor(spots: readonly SpotMornings[]): {
  observations: string;
  predictions: string;
} {
  const observations: string[] = [];
  const predictions: string[] = [];
  for (const spot of spots) {
    for (let index = 0; index < spot.mornings; index += 1) {
      const day = dayOf(index);
      observations.push(
        JSON.stringify({
          spot_id: spot.spotId,
          device_id: `d_${spot.spotId}_${index % spot.reporters}`,
          observed_at: `${day}T18:41:00Z`,
          size_band: "chest_head",
        }),
      );
      predictions.push(
        JSON.stringify({
          spot_id: spot.spotId,
          source: SOURCE,
          valid_ts: `${day}T18:00:00Z`,
          lead_h: 36,
          swell_h_m: CHEST_HEAD_MID_M + spot.forecastRanBigByM,
          swell_t_s: 10,
          land_masked: false,
        }),
      );
    }
  }
  return { observations: observations.join("\n"), predictions: predictions.join("\n") };
}

type StoredHeightKey = {
  b: number;
  n: number;
  reporters: number;
  applied: boolean;
  /** tau / (n + tau): how much of this spot's stored number came from its parent rather than its own mornings. */
  shrunk_from_global: number;
};

/** The prior at a two-morning spot: 6 / (2 + 6). A newcomer is three quarters carried. */
const A_NEWCOMER_IS_CARRIED_THIS_MUCH = 0.75;

async function runOver(spots: readonly SpotMornings[]): Promise<Map<string, StoredHeightKey>> {
  const store = new MemoryLearningStore();
  const logs = logsFor(spots);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock(), spots: seedsFor(spots) });

  const keys = new Map<string, StoredHeightKey>();
  for (const spot of spots) {
    const body = await store.get(`learned/corrections/v1/current/${spot.spotId}.json`);
    assert.ok(body, `the run must have stored a correction file for ${spot.spotId}`);
    const record = JSON.parse(body) as {
      bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
    };
    const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(key, `${spot.spotId}'s difference must stay keyed to its source and lead bucket`);
    keys.set(spot.spotId, key);
  }
  return keys;
}

/** The region-wide estimate, from the fixture's own mornings. Identical in both runs by construction. */
function regionWideEstimate(spots: readonly SpotMornings[]): number {
  const totalMornings = spots.reduce((sum, spot) => sum + spot.mornings, 0);
  return (
    spots.reduce((sum, spot) => sum + spot.forecastRanBigByM * spot.mornings, 0) / totalMornings
  );
}

/** The beach family's own estimate, from the fixture's own mornings. */
function beachFamilyEstimate(spots: readonly SpotMornings[]): number {
  const beaches = spots.filter((spot) => spot.breakType === "beach");
  const totalMornings = beaches.reduce((sum, spot) => sum + spot.mornings, 0);
  return (
    beaches.reduce((sum, spot) => sum + spot.forecastRanBigByM * spot.mornings, 0) / totalMornings
  );
}

describe("03-03 acceptance: three proven spots of one break type start pooling among themselves", () => {
  it("hands a new beach spot the beach family's estimate once three beach spots have passed the gates, and the region's until then", async () => {
    const familyProven = fixtureWithThirdBeachReportedBy(6);
    const familyOneShort = fixtureWithThirdBeachReportedBy(4);

    const withFamily = await runOver(familyProven);
    const withoutFamily = await runOver(familyOneShort);

    // The single difference between the runs, stated as an assertion rather
    // than left as a comment: the third beach spot passes the gates in one and
    // not the other, and nothing else about it moved.
    assert.equal(
      withFamily.get(THIRD_BEACH)!.applied,
      true,
      "six reporters must carry the third beach spot through the gates, or no family can form",
    );
    assert.equal(
      withoutFamily.get(THIRD_BEACH)!.applied,
      false,
      "four reporters must leave the third beach spot below G2, or both runs have three gated beach spots and nothing is being compared",
    );
    assert.equal(
      withFamily.get(THIRD_BEACH)!.n,
      withoutFamily.get(THIRD_BEACH)!.n,
      "the third beach spot must report the same mornings in both runs; only who reported them changes",
    );

    const newcomerWithFamily = withFamily.get(NEWCOMER)!.b;
    const newcomerWithoutFamily = withoutFamily.get(NEWCOMER)!.b;

    // The control: the reefs are three-gated in both runs, so their own family
    // is active in both. They still move a little, because the offset stage
    // measures habits against pooled estimates and the newcomer shares their
    // region -- but they must move so much less than the newcomer that nothing
    // below could be general drift wearing activation's name.
    const theReefMoved = Math.abs(withFamily.get(A_REEF)!.b - withoutFamily.get(A_REEF)!.b);
    const theNewcomerMoved = Math.abs(newcomerWithFamily - newcomerWithoutFamily);
    assert.ok(
      theNewcomerMoved > theReefMoved * A_REEF_MOVES_THIS_MUCH_LESS,
      `the newcomer moved ${theNewcomerMoved} between the two runs and a reef moved ${theReefMoved}, under ${A_REEF_MOVES_THIS_MUCH_LESS} times as much. The reefs are three-gated in both runs, so beach-family activation may only reach them the long way round, through the newcomer's own estimate and the region-wide mean. A reef moving comparably means something else shifted underneath and this example is measuring drift.`,
    );
    assert.ok(
      withFamily.get(A_REEF)!.b > 0 && withoutFamily.get(A_REEF)!.b > 0,
      "a reef must go on reading the forecast as running big in both runs: the control has to stay the same kind of number, not merely a nearby one",
    );
    const family = beachFamilyEstimate(familyProven);
    const regionWide = regionWideEstimate(familyProven);

    assert.notEqual(
      newcomerWithFamily,
      newcomerWithoutFamily,
      "one more proven beach spot must change what carries the newcomer, with no code change and no configuration flip",
    );
    assert.ok(
      Math.abs(newcomerWithFamily - family) < Math.abs(newcomerWithoutFamily - family),
      `once the family exists the newcomer's stored difference ${newcomerWithFamily} must sit nearer the beach family's estimate ${family} than it did without one (${newcomerWithoutFamily})`,
    );

    // WHAT ACTIVATION CHANGES IS WHICH PARENT, NEVER HOW HARD. Pinned exactly
    // rather than compared loosely, and read off the record rather than
    // recomputed: the newcomer is three quarters carried by its parent in BOTH
    // runs, because it has two mornings against a tau of six either way. The
    // old form of this assertion recomputed the carried value by hand from
    // NEWCOMER_RAW and the region-wide mean, and both of those moved once the
    // offset stage began measuring habits against pooled estimates -- the
    // newcomer's own estimate is no longer its raw 0.6, and the region-wide
    // mean is no longer the plain morning-weighted mean of the fixture's
    // numbers. The WEIGHT never moved, and it is the thing this assertion was
    // always about.
    for (const [label, keys] of [["with a family", withFamily], ["without one", withoutFamily]] as const) {
      assert.ok(
        Math.abs(keys.get(NEWCOMER)!.shrunk_from_global - A_NEWCOMER_IS_CARRIED_THIS_MUCH) < TOLERANCE,
        `${label} the newcomer was carried ${keys.get(NEWCOMER)!.shrunk_from_global} by its parent, not the ${A_NEWCOMER_IS_CARRIED_THIS_MUCH} two mornings against a tau of six give it: a similarity family forming must change WHICH parent carries a newcomer and never how hard it is carried`,
      );
    }

    // And which parent it was. Two beach spots are not yet a family, so the
    // region carries the newcomer and its stored number sits on the region's
    // side of the gap between the two candidate parents.
    assert.ok(
      Math.abs(newcomerWithoutFamily - regionWide) < Math.abs(newcomerWithoutFamily - family),
      `with only two proven beach spots the newcomer's stored ${newcomerWithoutFamily} sits nearer the beach family's ${family} than the region-wide ${regionWide}: a family that has not formed may not carry anybody`,
    );

    // Anti-vacuity: the family and the region must actually say different
    // things, or "which one carried it" is a distinction without a difference.
    assert.ok(
      Math.abs(family - regionWide) > 0.2,
      "the fixture must put the beach family well away from the region-wide mean, or this example proves nothing",
    );
  });
});
