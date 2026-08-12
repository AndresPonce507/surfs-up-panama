// The per-reporter offset's declared laws (src/learning/estimate.ts and
// src/learning/weights.ts, 06-learning-layer.md section 5.2,
// adr-per-reporter-offset-estimator, research 09 section 13.2).
//
// Port-to-port at domain scope: each exported function's signature IS its
// port. The backfit takes the estimator it alternates with AS A PARAMETER,
// which is what lets this file drive it with a plain weighted mean and check
// arithmetic that can be worked out by hand, while the shipped fit hands it
// the whole pooling ladder.
//
// Two things here are examples rather than properties, deliberately. The
// SIGN of an offset is directional, and a symmetric property passes whichever
// way round it is wired. The NUMBER OF PASSES is likewise invisible to any
// property that only bounds the answer: three passes and one pass both land
// inside every corridor worth stating, so the count is pinned by arithmetic
// worked out in the test's own comment.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import { REPORTER_OFFSET_TAU, SIGMA_EFF } from "../../src/learning/constants";
import { shrinkTowardZero } from "../../src/learning/estimate";
import { backfitReporterOffsets, type BackfitKey } from "../../src/learning/weights";
import type { ResidualSample } from "../../src/learning/residuals";

const PROPERTY_RUNS = 50;

function reported(reporter: string, value: number): ResidualSample {
  return { ...reportedOn(reporter, value, "2026-07-01"), day: null };
}

/** The same, on a morning that can be read, which is what makes two samples one report or two. */
function reportedOn(reporter: string, value: number, day: string): ResidualSample {
  return {
    value,
    weight: 1,
    device_id: reporter,
    reporter_key: reporter,
    day,
    bandWidthM: 0.5,
    sigmaEff: SIGMA_EFF.height.value,
    solicited: false,
  };
}

/**
 * A key, with the place its mornings were reported from. Two keys at one beach
 * -- the same mornings paired against two forecast models -- share a scope;
 * two beaches do not.
 */
function keyAt(reportScope: string, samples: readonly ResidualSample[]): BackfitKey {
  return { reportScope, samples };
}

/** Every key at its own beach, which is the shape most of these laws want. */
function separateBeaches(keys: readonly (readonly ResidualSample[])[]): BackfitKey[] {
  return keys.map((samples, index) => keyAt(`beach-${index}`, samples));
}

/** The plain weighted mean of a key's residuals, which is what the shipped fit wraps in a pooling ladder. */
function plainKeyDifferences(
  keys: readonly BackfitKey[],
): (offsets: ReadonlyMap<string, number>) => number[] {
  return (offsets) =>
    keys.map(({ samples }) => {
      const total = samples.reduce(
        (sum, sample) => sum + sample.weight * (sample.value + (offsets.get(sample.reporter_key) ?? 0)),
        0,
      );
      const weight = samples.reduce((sum, sample) => sum + sample.weight, 0);
      return weight === 0 ? 0 : total / weight;
    });
}

describe("an offset is shrunk toward zero, never toward anybody's average (06 section 5.2)", () => {
  it("is exactly zero for a reporter with no reports at all", () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (measured) => {
        assert.equal(
          shrinkTowardZero(measured, 0, REPORTER_OFFSET_TAU),
          0,
          "a reporter with no reports has no measured habit, so 06 section 5.2's n_r = 0 row must be exactly zero and their report enters at face value",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("never trusts a habit further than it was measured, and never flips it", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.integer({ min: 0, max: 500 }),
        (measured, reports) => {
          const trusted = shrinkTowardZero(measured, reports, REPORTER_OFFSET_TAU);
          assert.ok(
            Math.abs(trusted) <= Math.abs(measured),
            `a habit measured at ${measured} was trusted at ${trusted}, which is further than it was ever measured`,
          );
          assert.ok(
            trusted * measured >= 0,
            `a habit measured at ${measured} was trusted at ${trusted}, on the other side of zero: shrinking toward zero may never turn a big-caller into a small-caller`,
          );
          if (Math.abs(measured) > 1e-6) {
            assert.ok(
              Math.abs(trusted) < Math.abs(measured),
              `a habit measured at ${measured} was trusted at ${trusted}, its whole measured size: no finite number of reports may buy that`,
            );
          }
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("halves a habit at four reports and keeps two thirds of it at eight, per the 06 section 5.2 table", () => {
    assert.equal(shrinkTowardZero(1, 4, REPORTER_OFFSET_TAU), 0.5);
    assert.equal(shrinkTowardZero(1, 8, REPORTER_OFFSET_TAU), 8 / 12);
    assert.equal(shrinkTowardZero(1, 16, REPORTER_OFFSET_TAU), 16 / 20);
  });
});

describe("backfitting measures the habit itself (06 section 5.2)", () => {
  it("reads somebody who calls it bigger than the rest as a positive habit, and the reverse as negative", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.05, max: 3, noNaN: true }), (habit) => {
        // Four reporters who agree, and one whose residual sits BELOW theirs
        // every time -- which is what calling the wave bigger than it was
        // looks like once the residual is forecast minus observed.
        const key = [
          reported("d_a", 0),
          reported("d_b", 0),
          reported("d_c", 0),
          reported("d_d", 0),
          reported("d_calls_it_big", -habit),
          reported("d_calls_it_small", habit),
        ];
        const keys = separateBeaches([key]);
        const offsets = backfitReporterOffsets(keys, plainKeyDifferences(keys), 3);

        assert.ok(
          offsets.get("d_calls_it_big")! > 0,
          `somebody who called every morning ${habit} bigger than everyone else was measured at ${offsets.get("d_calls_it_big")}, which is not a positive habit: the sign is wired backwards and their reports are being pushed further from the truth`,
        );
        assert.ok(
          offsets.get("d_calls_it_small")! < 0,
          `somebody who called every morning ${habit} smaller was measured at ${offsets.get("d_calls_it_small")}`,
        );
        assert.ok(
          Math.abs(offsets.get("d_a") ?? 0) < 1e-12,
          "somebody who agreed with the key's own mean every morning has no habit to measure",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("takes exactly three alternating passes, no more and no fewer", () => {
    // Four honest mornings at 0, one reporter each, and four from one reporter
    // at -H, all at equal weight. EVERY reporter gets an offset, the four
    // honest ones included: the model is report = truth + u_r + eps for
    // everybody, and there is no such thing as a reporter the fit has decided
    // in advance has no habit. Their n_r = 1 shrinks theirs to a fifth, which
    // is what keeps the shared component in the beach's own difference rather
    // than letting it drain into the people (06 section 5.2's identifiability
    // note). Writing the passes out with that included:
    //
    //   pass 1: b = -H/2        u_honest = -H/10      u_habit = H/4
    //   pass 2: b = -17H/40     u_honest = -17H/200   u_habit = 23H/80
    //   pass 3: b = -319H/800                         u_habit = 481H/1600
    //
    // One pass would stop at H/4 = 0.25 H and two at 23H/80 = 0.2875 H, against
    // three passes' 481H/1600 = 0.300625 H. Nothing that merely bounds the
    // answer can tell those three apart, which is why this is an example.
    const habit = 0.8;
    const key = [
      reported("d_a", 0),
      reported("d_b", 0),
      reported("d_c", 0),
      reported("d_d", 0),
      reported("d_habit", -habit),
      reported("d_habit", -habit),
      reported("d_habit", -habit),
      reported("d_habit", -habit),
    ];

    const keys = separateBeaches([key]);
    const afterThree = backfitReporterOffsets(keys, plainKeyDifferences(keys), 3);
    assert.ok(
      Math.abs(afterThree.get("d_habit")! - (481 * habit) / 1600) < 1e-12,
      `three alternating passes measured the habit at ${afterThree.get("d_habit")}, not the ${(481 * habit) / 1600} the arithmetic above gives`,
    );
    assert.ok(
      afterThree.get("d_a")! < 0 && Math.abs(afterThree.get("d_a")!) < Math.abs(afterThree.get("d_habit")!),
      `the four honest reporters were measured at ${afterThree.get("d_a")}: they must carry a small offset of their own, and a much smaller one than the habitual reporter, or the shared component is draining out of the beach and into the people`,
    );
  });

  it("carries a habit measured at one beach across to the other, which is what makes it identifiable", () => {
    // The same reporter on two keys. Their offset is one number read from both
    // beaches at once, not one number per beach -- 06 section 5.2's
    // identifiability rider, where a reporter whose samples span two spots
    // identifies their offset directly instead of it being confounded with the
    // spot.
    const habit = 0.5;
    const pacific = [reported("d_a", 0), reported("d_b", 0), reported("d_habit", -habit)];
    const caribbean = [reported("d_c", 0), reported("d_d", 0), reported("d_habit", -habit)];
    const bothBeaches = separateBeaches([pacific, caribbean]);
    const together = backfitReporterOffsets(bothBeaches, plainKeyDifferences(bothBeaches), 3);
    const justPacific = separateBeaches([pacific]);
    const oneBeachOnly = backfitReporterOffsets(justPacific, plainKeyDifferences(justPacific), 3);

    assert.ok(
      together.get("d_habit")! > oneBeachOnly.get("d_habit")!,
      `a habit seen at two beaches was measured at ${together.get("d_habit")}, no larger than the ${oneBeachOnly.get("d_habit")} one beach alone reads: at a single spot the habit is confounded with the spot's own bias and the shrink pushes it into the beach instead`,
    );
  });

  it("counts one morning at two beaches as two reports, and one morning against two models as one", () => {
    // n_r IS A COUNT OF REPORTS, and a report is one person, one morning, ONE
    // BEACH -- an observation row, 06 section 4. The two things it must tell
    // apart are the two ways one person's samples multiply:
    //
    //   two beaches, same morning  -> two mornings of evidence about them
    //   one beach, two models      -> ONE morning, counted once (06 section
    //                                 5.2's table is stated per report, and
    //                                 se(u_raw) ~ 0.48/sqrt(n_r) is per-report
    //                                 noise; how many forecast models happened
    //                                 to cover a beach says nothing about how
    //                                 well anybody's habit is known)
    //
    // Both arrangements below hold the SAME samples with the SAME values, so
    // u_raw is identical and the only thing that can move the answer is the
    // report count: four against two, hence shrink 4/8 against 2/6.
    const habit = 0.5;
    const morningsOf = (reporter: string): ResidualSample[] => [
      reportedOn(reporter, -habit, "2026-07-01"),
      reportedOn(reporter, -habit, "2026-07-02"),
    ];
    const honest = [reportedOn("d_a", 0, "2026-07-01"), reportedOn("d_b", 0, "2026-07-02")];
    const oneKeysWorth = [...honest, ...morningsOf("d_habit")];

    const twoBeaches = [keyAt("pacific", oneKeysWorth), keyAt("caribbean", oneKeysWorth)];
    const twoModelsOneBeach = [keyAt("pacific", oneKeysWorth), keyAt("pacific", oneKeysWorth)];

    const spanningTheCoast = backfitReporterOffsets(
      twoBeaches,
      plainKeyDifferences(twoBeaches),
      3,
    );
    const seenTwice = backfitReporterOffsets(
      twoModelsOneBeach,
      plainKeyDifferences(twoModelsOneBeach),
      3,
    );

    assert.ok(
      spanningTheCoast.get("d_habit")! > seenTwice.get("d_habit")!,
      `two mornings at two beaches measured the habit at ${spanningTheCoast.get("d_habit")}, no more than the ${seenTwice.get("d_habit")} the same two mornings read against two models: the report count is merging one person's beaches, so somebody who reports everywhere is trusted no further than somebody who reports once where two models happen to look`,
    );
  });
});
