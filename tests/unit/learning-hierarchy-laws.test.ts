// The pooling ladder's declared laws (src/learning/hierarchy.ts,
// 06-learning-layer.md section 5.3, research 09 sections 5.4 and 17).
//
// Test paradigm, per this slice's design notes: the wall between basins is a
// fast-check PROPERTY over generated two-basin worlds, because "no Pacific
// morning reached this Caribbean number" is a claim about every possible
// world, not about one fixture. The two influence caps are example-shaped:
// each is a single arithmetic threshold with a stated value, and a property
// over it would only restate the same equation.
//
// Port-to-port at domain scope: the ladder's exported function signature IS
// its port. No store, no clock, no mocks -- it is a pure function of the
// evidence and the seed roster handed to it.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import {
  parentEstimateBySpot,
  SHIPPED_POOLING_CAPS,
  type SpotEvidence,
  type SpotSeed,
} from "../../src/learning/hierarchy";
import {
  PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION,
  SIMILARITY_GROUP_MIN_GATED_SPOTS,
  TAU_FLOOR,
} from "../../src/learning/constants";
import { shrinkTowardParent } from "../../src/learning/shrink";

const PROPERTY_RUNS = 50;

/**
 * One spot's own evidence: every sample from a different reporter, and nothing
 * proven at the gates, unless a test says otherwise.
 */
function evidence(
  spotId: string,
  b: number,
  n: number,
  gated = false,
): SpotEvidence {
  return {
    spotId,
    b,
    n,
    samplesPerReporter: Array.from({ length: n }, () => 1),
    gated,
  };
}

function seed(spotId: string, coast: string, regionId: string): SpotSeed {
  return { spot_id: spotId, region_id: regionId, coast, break_type: "beach" };
}

/** One coast, one region, so the only level that can move a spot is its break-type family. */
function familySeed(spotId: string, breakType: string): SpotSeed {
  return {
    spot_id: spotId,
    region_id: "pa-pacific",
    coast: "pacific",
    break_type: breakType,
  };
}

// ---------- the wall ----------

/** A generated world: some spots on one coast, some on another, each in one of two regions of its coast. */
const worldArbitrary = fc.record({
  pacific: fc.array(
    fc.record({
      region: fc.constantFrom("pa-pacific", "pa-pacific-west"),
      b: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
      n: fc.integer({ min: 1, max: 60 }),
    }),
    { minLength: 1, maxLength: 5 },
  ),
  caribbean: fc.array(
    fc.record({
      region: fc.constantFrom("pa-caribe-norte", "pa-caribe-sur"),
      b: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
      n: fc.integer({ min: 1, max: 60 }),
    }),
    { minLength: 1, maxLength: 5 },
  ),
});

describe("hierarchy: the basin is a hard partition, at any weight (09 section 17.4 guardrail 1)", () => {
  it("gives every Caribbean spot the same parent whether or not the Pacific exists at all", () => {
    fc.assert(
      fc.property(worldArbitrary, (world) => {
        const caribbeanSpots = world.caribbean.map((spot, index) => ({
          ...spot,
          spotId: `caribbean-${index}`,
        }));
        const pacificSpots = world.pacific.map((spot, index) => ({
          ...spot,
          spotId: `pacific-${index}`,
        }));

        const seeds = [
          ...pacificSpots.map((spot) => seed(spot.spotId, "pacific", spot.region)),
          ...caribbeanSpots.map((spot) => seed(spot.spotId, "caribbean", spot.region)),
        ];
        const caribbeanEvidence = caribbeanSpots.map((spot) =>
          evidence(spot.spotId, spot.b, spot.n),
        );
        const wholeWorld = [
          ...pacificSpots.map((spot) => evidence(spot.spotId, spot.b, spot.n)),
          ...caribbeanEvidence,
        ];

        const withPacific = parentEstimateBySpot(wholeWorld, seeds, SHIPPED_POOLING_CAPS);
        const withoutPacific = parentEstimateBySpot(
          caribbeanEvidence,
          seeds,
          SHIPPED_POOLING_CAPS,
        );

        for (const spot of caribbeanSpots) {
          assert.equal(
            withPacific.get(spot.spotId),
            withoutPacific.get(spot.spotId),
            `${spot.spotId} borrowed from the Pacific: its parent moved when the other basin was removed`,
          );
        }
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

// ---------- the launch shape ----------

describe("hierarchy: with no seed roster every spot shares one parent, the launch two-level shape", () => {
  it("hands every spot the sample-count-weighted mean of every spot's own estimate", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            b: fc.double({ min: -1.5, max: 1.5, noNaN: true, noDefaultInfinity: true }),
            n: fc.integer({ min: 1, max: 60 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (spots) => {
          const given = spots.map((spot, index) => evidence(`spot-${index}`, spot.b, spot.n));
          const parents = parentEstimateBySpot(given, [], SHIPPED_POOLING_CAPS);

          const totalSamples = spots.reduce((sum, spot) => sum + spot.n, 0);
          const flatMean =
            spots.reduce((sum, spot) => sum + spot.b * spot.n, 0) / totalSamples;

          for (const spot of given) {
            const parent = parents.get(spot.spotId);
            assert.ok(parent !== undefined, `${spot.spotId} must be given a parent`);
            assert.ok(
              Math.abs(parent - flatMean) <= 1e-12,
              `unseeded spot ${spot.spotId} got parent ${parent}, not the flat weighted mean ${flatMean}`,
            );
          }
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

// ---------- the influence caps (09 section 17.5) ----------

describe("hierarchy: one region can never become the basin's prior (09 section 17.5 item 2)", () => {
  it("weighs a region at its cap however many mornings it collected", () => {
    const loud = PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION + 100;
    const quiet = 10;
    const parents = parentEstimateBySpot(
      [evidence("loud-spot", 1, loud), evidence("quiet-spot", 0, quiet)],
      [seed("loud-spot", "pacific", "region-loud"), seed("quiet-spot", "pacific", "region-quiet")],
      SHIPPED_POOLING_CAPS,
    );

    // The quiet region is one spot, so its own estimate is exactly 0 and the
    // basin below is the only thing its parent can differ by.
    const cappedBasin =
      (PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION * 1 + quiet * 0) /
      (PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION + quiet);
    const uncappedBasin = (loud * 1 + quiet * 0) / (loud + quiet);

    const quietParent = parents.get("quiet-spot");
    assert.ok(quietParent !== undefined);
    assert.ok(
      Math.abs(quietParent - shrunkTowardBasin(0, quiet, cappedBasin)) <= 1e-12,
      `the quiet region's parent ${quietParent} must be built from a basin capped at ${PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION} samples`,
    );
    assert.ok(
      Math.abs(cappedBasin - uncappedBasin) > 1e-6,
      "the fixture must put the cap somewhere it actually bites, or this example proves nothing",
    );
  });
});

describe("hierarchy: one person can never become their region's prior (09 section 17.5 item 2)", () => {
  it("counts a dominant reporter's mornings only up to the injected cap", () => {
    const cap = 5;
    const dominated: SpotEvidence = {
      spotId: "dominated-spot",
      b: 1,
      n: 40,
      samplesPerReporter: [36, 1, 1, 1, 1],
      gated: false,
    };
    const spread: SpotEvidence = {
      spotId: "spread-spot",
      b: 0,
      n: 10,
      samplesPerReporter: [2, 2, 2, 2, 2],
      gated: false,
    };
    const seeds = [
      seed("dominated-spot", "pacific", "one-region"),
      seed("spread-spot", "pacific", "one-region"),
    ];

    const uncapped = parentEstimateBySpot([dominated, spread], seeds, SHIPPED_POOLING_CAPS);
    const capped = parentEstimateBySpot([dominated, spread], seeds, {
      ...SHIPPED_POOLING_CAPS,
      max_effective_samples_per_reporter: cap,
    });

    // Uncapped the loud spot carries 40 of the region's 50 samples; capped it
    // carries 5 + 1 + 1 + 1 + 1 = 9 against the spread spot's whole 10.
    assert.ok(
      Math.abs(uncapped.get("spread-spot")! - 40 / 50) <= 1e-12,
      `uncapped, the region's mean must count all 40 of the loud spot's mornings against the other spot's 10, not ${uncapped.get("spread-spot")}`,
    );
    assert.ok(
      Math.abs(capped.get("spread-spot")! - 9 / 19) <= 1e-12,
      `capped at ${cap}, the loud spot must weigh 9 rather than 40, making the region's mean 9/19 and not ${capped.get("spread-spot")}`,
    );
    assert.ok(
      capped.get("spread-spot")! < uncapped.get("spread-spot")!,
      "capping one person's influence must pull the region's estimate back toward the spot they do not dominate",
    );
  });

  it("counts every morning when no reporter cap is configured, which is the shipped launch state", () => {
    assert.equal(SHIPPED_POOLING_CAPS.max_effective_samples_per_reporter, Number.POSITIVE_INFINITY);
  });
});

// ---------- the similarity family (06 section 5.3) ----------

describe("hierarchy: a break-type family forms at three proven spots and not one earlier", () => {
  it("keeps a family's spots on their region until the threshold, then pools them among themselves", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.double({ min: -1.2, max: -0.4, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.4, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        (proven, beachEstimate, reefEstimate) => {
          const mornings = 12;
          const beaches = Array.from({ length: 5 }, (_, index) =>
            evidence(`beach-${index}`, beachEstimate, mornings, index < proven),
          );
          const reefs = Array.from({ length: 3 }, (_, index) =>
            evidence(`reef-${index}`, reefEstimate, mornings, true),
          );
          const seeds = [
            ...beaches.map((spot) => familySeed(spot.spotId, "beach")),
            ...reefs.map((spot) => familySeed(spot.spotId, "reef")),
          ];

          const parents = parentEstimateBySpot(
            [...beaches, ...reefs],
            seeds,
            SHIPPED_POOLING_CAPS,
          );
          // The last beach spot is never among the proven ones, so it is always
          // the newcomer the family either carries or does not.
          const newcomerParent = parents.get("beach-4")!;
          const regionWide =
            (beaches.length * mornings * beachEstimate +
              reefs.length * mornings * reefEstimate) /
            ((beaches.length + reefs.length) * mornings);

          if (proven < SIMILARITY_GROUP_MIN_GATED_SPOTS) {
            assert.ok(
              Math.abs(newcomerParent - regionWide) <= 1e-12,
              `with only ${proven} proven beach spots the region-wide estimate ${regionWide} must carry the newcomer, not ${newcomerParent}`,
            );
            return;
          }

          const family = shrunkTowardBasin(
            beachEstimate,
            beaches.length * mornings,
            regionWide,
          );
          assert.ok(
            Math.abs(newcomerParent - family) <= 1e-12,
            `with ${proven} proven beach spots the family's own estimate ${family} must carry the newcomer, not ${newcomerParent}`,
          );
          assert.ok(
            Math.abs(newcomerParent - beachEstimate) <
              Math.abs(regionWide - beachEstimate),
            "an active family must pull its newcomer nearer what the family reads than the region-wide mean does",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

// ---------- cold start (research 09 section 5.4) ----------

/**
 * Both laws below are quantified over every tau at or above the permanent
 * floor, deliberately. A law written at today's hand-set prior would have to
 * be rewritten the moment 03-04 estimates tau from data; a law written at the
 * floor is a rail the switchover has to stay inside.
 */
const tauAtOrAboveTheFloor = fc.double({
  min: TAU_FLOOR,
  max: 40,
  noNaN: true,
  noDefaultInfinity: true,
});
const anyEstimate = fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true });

describe("hierarchy: cold start is the n = 0 limit of the same equation, never a special case", () => {
  it("hands a spot with no mornings of its own exactly what its parents say", () => {
    fc.assert(
      fc.property(anyEstimate, anyEstimate, tauAtOrAboveTheFloor, (raw, parent, tau) => {
        assert.equal(
          shrinkTowardParent(raw, 0, tau, parent),
          parent,
          "a spot with zero mornings must inherit its parents' estimate exactly, with no trace of a raw value it never earned",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("never lets a spot travel further than n/(n + floor) of the way from its parents toward its own claim", () => {
    fc.assert(
      fc.property(
        anyEstimate,
        anyEstimate,
        fc.integer({ min: 0, max: 60 }),
        tauAtOrAboveTheFloor,
        (raw, parent, n, tau) => {
          const stored = shrinkTowardParent(raw, n, tau, parent);
          const claim = Math.abs(raw - parent);
          const travelled = Math.abs(stored - parent);
          const furthestAllowed = (n / (n + TAU_FLOOR)) * claim;

          assert.ok(
            travelled <= furthestAllowed + 1e-12,
            `at ${n} mornings the stored difference travelled ${travelled} from its parents, past the ${furthestAllowed} a tau at its floor allows`,
          );
          assert.ok(
            stored >= Math.min(raw, parent) - 1e-12 && stored <= Math.max(raw, parent) + 1e-12,
            `the stored difference ${stored} left the corridor between its own claim ${raw} and its parents ${parent}`,
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

/** b_hat = (n/(n+tau)) * own + (tau/(n+tau)) * parent, restated here rather than imported, so the law has its own oracle. */
function shrunkTowardBasin(own: number, n: number, basin: number): number {
  const tau = 6;
  const weight = n / (n + tau);
  return weight * own + (1 - weight) * basin;
}
