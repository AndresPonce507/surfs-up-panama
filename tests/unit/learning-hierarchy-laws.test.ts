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
import { PARENT_MAX_EFFECTIVE_SAMPLES_PER_REGION } from "../../src/learning/constants";

const PROPERTY_RUNS = 50;

/** One spot's own evidence, with every sample from a different reporter unless a test says otherwise. */
function evidence(spotId: string, b: number, n: number): SpotEvidence {
  return { spotId, b, n, samplesPerReporter: Array.from({ length: n }, () => 1) };
}

function seed(spotId: string, coast: string, regionId: string): SpotSeed {
  return { spot_id: spotId, region_id: regionId, coast, break_type: "beach" };
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
    };
    const spread: SpotEvidence = {
      spotId: "spread-spot",
      b: 0,
      n: 10,
      samplesPerReporter: [2, 2, 2, 2, 2],
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

/** b_hat = (n/(n+tau)) * own + (tau/(n+tau)) * parent, restated here rather than imported, so the law has its own oracle. */
function shrunkTowardBasin(own: number, n: number, basin: number): number {
  const tau = 6;
  const weight = n / (n + tau);
  return weight * own + (1 - weight) * basin;
}
