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
// their family is active in both, and their stored numbers must come out
// byte-identical. A run where the reefs moved too would mean something other
// than beach-family activation had shifted underneath.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const TOLERANCE = 1e-6;

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

type StoredHeightKey = { b: number; n: number; reporters: number; applied: boolean };

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

    // The control: the reefs are three-gated in both runs, so their family is
    // active in both and their stored numbers must not move at all.
    assert.equal(
      withFamily.get(A_REEF)!.b,
      withoutFamily.get(A_REEF)!.b,
      "a reef's stored difference must be identical across the two runs, or something other than beach-family activation moved underneath this comparison",
    );

    const newcomerWithFamily = withFamily.get(NEWCOMER)!.b;
    const newcomerWithoutFamily = withoutFamily.get(NEWCOMER)!.b;
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

    // Two beach spots are not yet a family: the region-wide parent carries the
    // newcomer, pinned exactly rather than compared loosely.
    const carriedByTheRegion = (2 / (2 + 6)) * NEWCOMER_RAW + (6 / (2 + 6)) * regionWide;
    assert.ok(
      Math.abs(newcomerWithoutFamily - carriedByTheRegion) < TOLERANCE,
      `with only two proven beach spots the newcomer must be carried by the region-wide parent (${carriedByTheRegion}), not by ${newcomerWithoutFamily}`,
    );

    // Anti-vacuity: the family and the region must actually say different
    // things, or "which one carried it" is a distinction without a difference.
    assert.ok(
      Math.abs(family - regionWide) > 0.2,
      "the fixture must put the beach family well away from the region-wide mean, or this example proves nothing",
    );
  });
});
