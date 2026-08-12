// Accepted roadmap 03-02: "Cold start rides parents; the corridor stays law".
//
// Cold start is not a special case anywhere in this lane. It is the n -> 0
// limit of the one shrinkage equation (research 09 section 5.4), and these two
// examples are how a reader sees that: a spot with two mornings is carried by
// its neighbours, and a spot with ONE loud morning moves only a sliver of
// itself. Both drive the real nightly-fit port; the oracle each is measured
// against is computed from the fixture's own mornings, never read back out of
// the record under test.
//
// The bound in the second example is stated at TAU_FLOOR, not at today's
// hand-set prior. A law written at the prior would be rewritten the moment
// 03-04 estimates tau from data; a law written at the floor holds for every
// tau the ladder can ever reach, which is what makes it a rail rather than a
// snapshot.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { TAU_FLOOR } from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const TOLERANCE = 1e-9;

const ESTABLISHED_HIGH = "playa-venao";
const ESTABLISHED_LOW = "playa-teta";
const BRAND_NEW = "playa-recien-abierta";

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

/** Every spot on one coast in one region, so the ladder above the spot is the collapsed launch shape. */
const SEEDS: readonly SpotSeed[] = [
  { spot_id: ESTABLISHED_HIGH, region_id: "pa-pacific", coast: "pacific", break_type: "point" },
  { spot_id: ESTABLISHED_LOW, region_id: "pa-pacific", coast: "pacific", break_type: "beach" },
  { spot_id: BRAND_NEW, region_id: "pa-pacific", coast: "pacific", break_type: "beach" },
];

type SpotMornings = {
  readonly spotId: string;
  readonly mornings: number;
  readonly reporters: number;
  readonly forecastRanBigByM: number;
};

/**
 * Two established neighbours that agree the forecast runs big here, sitting
 * either side of 0.8 m and reporting equally often, so the neighbourhood's own
 * estimate is 0.8 by construction. Deliberately nowhere near zero: a
 * neighbourhood centred on zero would let a parent quietly hardcoded to zero
 * pass every comparison below, which is the one failure src/learning/
 * correction-file.ts's header calls out by name.
 */
const ESTABLISHED: readonly SpotMornings[] = [
  { spotId: ESTABLISHED_HIGH, mornings: 12, reporters: 6, forecastRanBigByM: 0.9 },
  { spotId: ESTABLISHED_LOW, mornings: 12, reporters: 6, forecastRanBigByM: 0.7 },
];
const NEIGHBOURHOOD_ESTIMATE = 0.8;

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

async function storedHeightKeys(
  spots: readonly SpotMornings[],
): Promise<Map<string, StoredHeightKey>> {
  const store = new MemoryLearningStore();
  const logs = logsFor(spots);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock(), spots: SEEDS });

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

/**
 * The parent the ladder builds at the launch shape: the morning-count-weighted
 * mean of every examined spot's own difference, the newcomer included. Written
 * out here from the fixture's own numbers so nothing below is measured against
 * the code it is testing.
 */
function parentAcross(spots: readonly SpotMornings[]): number {
  const totalMornings = spots.reduce((sum, spot) => sum + spot.mornings, 0);
  return (
    spots.reduce((sum, spot) => sum + spot.forecastRanBigByM * spot.mornings, 0) /
    totalMornings
  );
}

describe("03-02 acceptance: a brand-new spot rides its parents instead of inventing its own number", () => {
  it("stores a two-morning spot's difference nearer its neighbours' estimate than its own two mornings", async () => {
    // Its own two mornings said the forecast was spot on. Every neighbour says
    // the forecast runs big here. Two mornings do not overturn a neighbourhood.
    const newcomer: SpotMornings = {
      spotId: BRAND_NEW,
      mornings: 2,
      reporters: 2,
      forecastRanBigByM: 0,
    };
    const keys = await storedHeightKeys([...ESTABLISHED, newcomer]);

    const stored = keys.get(BRAND_NEW)!;
    const ownMornings = newcomer.forecastRanBigByM;

    assert.equal(stored.n, 2, "the newcomer must be stored with the two mornings it actually has");
    assert.equal(
      stored.applied,
      false,
      "two mornings can never clear G1, so this number is carried but never published",
    );
    assert.ok(
      Math.abs(stored.b - NEIGHBOURHOOD_ESTIMATE) < Math.abs(stored.b - ownMornings),
      `a two-morning spot's stored difference ${stored.b} must sit nearer its neighbours' estimate ${NEIGHBOURHOOD_ESTIMATE} than its own two mornings ${ownMornings}`,
    );

    // Anti-vacuity: the neighbours must really have disagreed with the
    // newcomer, or "nearer its neighbours" is a claim about two equal numbers.
    assert.ok(
      Math.abs(ownMornings - NEIGHBOURHOOD_ESTIMATE) > 0.5,
      "the fixture must put the newcomer well away from its neighbourhood, or this example proves nothing",
    );
  });

  it("lets one loud morning move a brand-new spot by only a sliver of itself", async () => {
    // One morning, and it shouts the opposite of everything around it.
    const newcomer: SpotMornings = {
      spotId: BRAND_NEW,
      mornings: 1,
      reporters: 1,
      forecastRanBigByM: -1.2,
    };
    const spots = [...ESTABLISHED, newcomer];
    const keys = await storedHeightKeys(spots);

    const stored = keys.get(BRAND_NEW)!;
    const parent = parentAcross(spots);
    const claim = Math.abs(newcomer.forecastRanBigByM - parent);
    const moved = Math.abs(stored.b - parent);
    const mostItMayEverMove = claim / (1 + TAU_FLOOR);

    assert.equal(stored.n, 1, "the loud spot must be stored with the single morning it has");
    assert.ok(
      moved <= mostItMayEverMove + TOLERANCE,
      `one loud morning moved the stored difference ${moved} away from its parents, past the ${mostItMayEverMove} a tau at its permanent floor allows`,
    );
    // Anti-vacuity, both directions. The morning must be loud enough that
    // storing it unshrunk would break the bound outright, and the spot's own
    // morning must still count for SOMETHING -- a number pinned flat to its
    // parent would satisfy any "no further than" bound while learning nothing.
    assert.ok(
      claim > 1,
      `the fixture's loud morning must be genuinely loud, and ${claim} is not`,
    );
    assert.ok(
      moved > 0,
      "the newcomer's own morning must move its stored difference off its parents at all, or the bound above is satisfied by a number that never learned anything",
    );
  });
});
