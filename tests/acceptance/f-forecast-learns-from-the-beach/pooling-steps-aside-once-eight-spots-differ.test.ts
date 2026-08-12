// Accepted roadmap 03-04: "Tau estimated at eight gated spots, floored
// forever".
//
// Research 09 section 17.4 says never hand-set tau: estimate it, and a
// correctly fitted hierarchy then degrades gracefully to no pooling when spots
// genuinely differ. 06 section 5.3 answers honestly that at one region with a
// handful of gated spots sigma_between is unidentifiable, so the launch tau is
// a hand-set prior WITH a floor and a stated switchover: method of moments,
// adopted once eight spots have passed the gates, tau never below 2.
//
// The oracle is a CORRIDOR, computed by hand from the two declared constants
// and the fixture's own mornings. Each stored difference must sit strictly
// nearer its own mornings than the prior of 6 leaves it -- pooling really did
// step aside -- and strictly further from them than the floor of 2 would
// allow. The second half is the one that matters: without it, an
// implementation that skipped the estimator entirely and clamped to the floor
// at eight spots would pass, and the estimator would be decoration.
//
// The mornings at each spot deliberately disagree with each other. Identical
// residuals would drive se_sample to zero, the physical noise floor would bind
// on every key, and the estimated within-spot variance would be an artifact of
// that floor rather than a measurement.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { TAU_FLOOR, TAU_SPOT_PRIOR } from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const TOLERANCE = 1e-6;

const MORNINGS = 12;
const REPORTERS = 6;

/**
 * Eight spots that all read the forecast running big, by wildly different
 * amounts. Centred well away from zero so every one of them clears the
 * significance gate, and spread far enough apart that the between-spot
 * variance is large against the within-spot noise -- which is the condition
 * under which a fitted tau is supposed to stop pooling.
 */
const CENTRE_M = 0.7;
const OFFSETS_M = [-0.36, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.36];
/** How far each spot's own mornings disagree with each other, alternating either side. */
const WITHIN_SPOT_SPREAD_M = 0.45;

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

type Spot = {
  readonly spotId: string;
  readonly ownDifference: number;
  readonly reporters: number;
};

function eightSpots(reportersAtTheLastSpot = REPORTERS): Spot[] {
  return OFFSETS_M.map((offset, index) => ({
    spotId: `spot-${index}`,
    ownDifference: CENTRE_M + offset,
    reporters: index === OFFSETS_M.length - 1 ? reportersAtTheLastSpot : REPORTERS,
  }));
}

function seedsFor(spots: readonly Spot[]): SpotSeed[] {
  return spots.map((spot) => ({
    spot_id: spot.spotId,
    region_id: "pa-pacific",
    coast: "pacific",
    break_type: "beach",
  }));
}

function dayOf(index: number): string {
  const day = new Date("2026-07-01T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + index);
  return day.toISOString().slice(0, 10);
}

function logsFor(spots: readonly Spot[]): { observations: string; predictions: string } {
  const observations: string[] = [];
  const predictions: string[] = [];
  for (const spot of spots) {
    for (let index = 0; index < MORNINGS; index += 1) {
      const day = dayOf(index);
      const deviation = index % 2 === 0 ? -WITHIN_SPOT_SPREAD_M : WITHIN_SPOT_SPREAD_M;
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
          swell_h_m: CHEST_HEAD_MID_M + spot.ownDifference + deviation,
          swell_t_s: 10,
          land_masked: false,
        }),
      );
    }
  }
  return { observations: observations.join("\n"), predictions: predictions.join("\n") };
}

type StoredHeightKey = { b: number; n: number; reporters: number; applied: boolean };

async function runOver(spots: readonly Spot[]): Promise<Map<string, StoredHeightKey>> {
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

/** The parent every spot is shrunk toward, from the fixture's own mornings. */
function parentAcross(spots: readonly Spot[]): number {
  return spots.reduce((sum, spot) => sum + spot.ownDifference, 0) / spots.length;
}

/** How far a stored difference sits from its own mornings at a given pooling strength. */
function distanceFromOwnMorningsAt(tau: number, ownDifference: number, parent: number): number {
  return (tau / (MORNINGS + tau)) * Math.abs(ownDifference - parent);
}

describe("03-04 acceptance: once eight spots have proven themselves different, pooling steps aside on its own", () => {
  it("moves every stored difference nearer its own mornings than the prior allows, and never all the way", async () => {
    const spots = eightSpots();
    const stored = await runOver(spots);
    const parent = parentAcross(spots);

    for (const spot of spots) {
      const key = stored.get(spot.spotId)!;
      assert.equal(
        key.applied,
        true,
        `${spot.spotId} must pass the gates, or there are not eight proven spots and the estimator never runs`,
      );

      const distance = Math.abs(key.b - spot.ownDifference);
      const thePriorWouldLeaveIt = distanceFromOwnMorningsAt(
        TAU_SPOT_PRIOR,
        spot.ownDifference,
        parent,
      );
      const theFloorWouldAllow = distanceFromOwnMorningsAt(
        TAU_FLOOR,
        spot.ownDifference,
        parent,
      );

      assert.ok(
        distance < thePriorWouldLeaveIt - TOLERANCE,
        `${spot.spotId}'s stored difference sits ${distance} from its own mornings, no nearer than the prior's ${thePriorWouldLeaveIt}: pooling did not step aside`,
      );
      assert.ok(
        distance > theFloorWouldAllow + TOLERANCE,
        `${spot.spotId}'s stored difference sits ${distance} from its own mornings, at or past the ${theFloorWouldAllow} the permanent floor allows: tau was clamped to its floor rather than estimated`,
      );
      assert.notEqual(
        key.b,
        spot.ownDifference,
        `${spot.spotId} reached its own mornings exactly, which no floored tau can ever permit`,
      );
    }
  });

  it("leaves the hand-set prior standing while only seven spots have proven themselves", async () => {
    const spots = eightSpots(4);
    const stored = await runOver(spots);
    const parent = parentAcross(spots);
    const oneShort = spots[spots.length - 1]!;

    assert.equal(
      stored.get(oneShort.spotId)!.applied,
      false,
      "four reporters must leave the eighth spot below G2, or this run still has eight proven spots",
    );

    for (const spot of spots) {
      const key = stored.get(spot.spotId)!;
      const distance = Math.abs(key.b - spot.ownDifference);
      const thePriorLeavesIt = distanceFromOwnMorningsAt(
        TAU_SPOT_PRIOR,
        spot.ownDifference,
        parent,
      );
      assert.ok(
        Math.abs(distance - thePriorLeavesIt) < TOLERANCE,
        `with only seven proven spots ${spot.spotId} must be pooled at the hand-set prior (${thePriorLeavesIt} from its own mornings), not at ${distance}`,
      );
    }
  });
});
