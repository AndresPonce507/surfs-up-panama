// The weighing room's declared laws (src/learning/weights.ts,
// 06-learning-layer.md section 6, research 09 sections 13.4 and 13.5).
//
// Port-to-port at domain scope: each exported function's signature IS its
// port. No store, no clock, no mocks -- the weighing room is a pure
// transformation from a key's residual samples to the samples the estimator
// is allowed to weigh.
//
// Test paradigm, per this slice's design notes: the collapse is a fast-check
// PROPERTY, because "one session counts once" is a claim about every possible
// multiset of repeats, not about one fixture. The oracle is a
// simpler-but-obviously-correct median computed in the test.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import {
  collapseSessionsToMedian,
  concordanceWeightByReporter,
  winsorizeAtDayFence,
} from "../../src/learning/weights";
import { CONCORDANCE_TAU, SIGMA_EFF } from "../../src/learning/constants";
import type { ResidualSample } from "../../src/learning/residuals";

const PROPERTY_RUNS = 50;

const value = fc.double({ min: -5, max: 5, noNaN: true });
const weight = fc.double({ min: 0.1, max: 5, noNaN: true });
/** The reported band's width, or nothing at all for the open top band and the score lane. */
const bandWidth = fc.constantFrom(0.3, 0.5, 0.8, null);

/** One residual sample, in the shape the weighing room reads it. */
const sample = (
  day: fc.Arbitrary<string | null>,
  device: fc.Arbitrary<string>,
): fc.Arbitrary<ResidualSample> =>
  fc.record({
    value,
    weight,
    device_id: device,
    day,
    bandWidthM: bandWidth,
  }).map((sample) => ({
    ...sample,
    reporter_key: sample.device_id,
    sigmaEff: SIGMA_EFF.height.value,
  }));

/** Every sample from one device in one session: same day, same device. */
const oneSession = fc.array(
  sample(fc.constant("2026-07-04"), fc.constant("d_one")),
  { minLength: 1, maxLength: 9 },
);

/** A free mixture of sessions, some of which cannot say which day they came from. */
const manySessions = fc.array(
  sample(
    fc.constantFrom("2026-07-04", "2026-07-05", "2026-07-06", null),
    fc.constantFrom("d_a", "d_b", "d_c"),
  ),
  { maxLength: 24 },
);

/**
 * The median SAMPLE of a list, the way a collapse that may not invent a value
 * has to read it: sort by value, take the lower of the two middles when the
 * count is even. Deliberately a second, simpler implementation rather than a
 * call into the module under test.
 */
function medianValueOf(samples: readonly ResidualSample[]): number {
  const sorted = [...samples].sort((left, right) => left.value - right.value);
  return sorted[Math.floor((sorted.length - 1) / 2)]!.value;
}

function sessionKeyOf(sample: ResidualSample, index: number): string {
  return sample.day === null ? `unknown-${index}` : `${sample.day} ${sample.device_id}`;
}

/** The sample sitting at the middle of a day, by the same lower-middle rule the collapse uses. */
function medianSampleOf(samples: readonly ResidualSample[]): ResidualSample {
  const sorted = [...samples].sort((left, right) => left.value - right.value);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/** Every sample reported on one morning, each by a different device, which is what the fence reads. */
const oneWatchedMorning = (minLength: number, maxLength: number) =>
  fc
    .array(sample(fc.constant("2026-07-04"), fc.constant("d_any")), {
      minLength,
      maxLength,
    })
    .map((samples) =>
      samples.map((sample, index) => ({ ...sample, device_id: `d_${index}` })),
    );

describe("the weighing room collapses a session to one sample (06 section 6.2 step 1)", () => {
  it("leaves one median sample however many times the session was submitted", () => {
    fc.assert(
      fc.property(oneSession, (samples) => {
        const collapsed = collapseSessionsToMedian(samples);

        assert.equal(
          collapsed.length,
          1,
          `one device reporting ${samples.length} times in one session left ${collapsed.length} samples in the fit`,
        );
        assert.equal(
          collapsed[0]!.value,
          medianValueOf(samples),
          "the surviving sample must be the session's median, not its mean, its first or its loudest",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("never merges two sessions and never invents a sample", () => {
    fc.assert(
      fc.property(manySessions, (samples) => {
        const collapsed = collapseSessionsToMedian(samples);
        const sessions = new Set(samples.map(sessionKeyOf));

        assert.equal(
          collapsed.length,
          sessions.size,
          `${samples.length} samples across ${sessions.size} sessions collapsed to ${collapsed.length}`,
        );
        for (const survivor of collapsed) {
          assert.ok(
            samples.includes(survivor),
            "a collapsed sample must be one somebody actually reported, never a manufactured average",
          );
        }
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("changes nothing the second time it runs", () => {
    fc.assert(
      fc.property(manySessions, (samples) => {
        const once = collapseSessionsToMedian(samples);
        assert.deepEqual(
          collapseSessionsToMedian(once),
          once,
          "collapsing an already-collapsed list must be the identity, or the fit's order of operations would matter",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

describe("the weighing room fences a well-watched morning (06 section 6.2 step 2)", () => {
  it("lets no residual past two widths of the day median's own band", () => {
    fc.assert(
      fc.property(oneWatchedMorning(3, 9), (morning) => {
        const fenced = winsorizeAtDayFence(morning);
        const middle = medianSampleOf(morning);

        assert.equal(
          fenced.length,
          morning.length,
          "fencing a morning must never drop a report",
        );
        fenced.forEach((sample, index) => {
          const reported = morning[index]!;
          assert.equal(sample.weight, reported.weight, "a fence clips a claim, never its precision");
          assert.equal(sample.device_id, reported.device_id, "a fence must not move a claim to another person");
          assert.equal(sample.day, reported.day, "a fence must not move a claim to another morning");

          if (middle.bandWidthM === null) {
            assert.equal(
              sample.value,
              reported.value,
              "a morning whose middle report named no band width has no fence to measure, so nothing may be clipped",
            );
            return;
          }
          const reach = 2 * middle.bandWidthM;
          assert.ok(
            sample.value >= middle.value - reach - 1e-12 &&
              sample.value <= middle.value + reach + 1e-12,
            `a residual of ${sample.value} sits outside the ${middle.value} +/- ${reach} the day's fence allows`,
          );
          assert.ok(
            Math.abs(sample.value - middle.value) <= Math.abs(reported.value - middle.value) + 1e-12,
            "a fence may only pull a claim toward the morning's middle, never push it away",
          );
        });
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("leaves a morning nobody else watched exactly as it was reported", () => {
    fc.assert(
      fc.property(oneWatchedMorning(1, 2), (morning) => {
        assert.deepEqual(
          winsorizeAtDayFence(morning),
          [...morning],
          "below three device-samples there is nothing to be robust against, so no same-day robustification may apply",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("changes nothing the second time it runs", () => {
    fc.assert(
      fc.property(manySessions, (samples) => {
        const once = winsorizeAtDayFence(samples);
        assert.deepEqual(
          winsorizeAtDayFence(once),
          once,
          "fencing an already-fenced list must be the identity, or the fence would walk inward on every pass",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

// ---------- concordance, 06 section 6.2 step 3 ----------

const HEIGHT_SIGMA_EFF = SIGMA_EFF.height.value;

/**
 * 06 section 6.2 step 3, verbatim: `w_r = clip(tau_w / (tau_w + D_r), 0.2,
 * 1.0)`. WRITTEN OUT HERE AS NUMBERS RATHER THAN IMPORTED. The floor's whole
 * purpose is that it is not zero, and a property that reads the same constant
 * the code reads cannot say so: lowering the constant to zero lowers the
 * assertion with it and the property passes a shadow ban. Found by mutation.
 */
const FLOOR_STATED_IN_06 = 0.2;
const CEILING_STATED_IN_06 = 1.0;

/** One residual sample as the concordance stage reads it: who, which morning, how far off. */
function reported(
  reporter: string,
  day: string | null,
  value: number,
): ResidualSample {
  return {
    value,
    weight: 4,
    device_id: reporter,
    reporter_key: reporter,
    day,
    bandWidthM: 0.5,
    sigmaEff: HEIGHT_SIGMA_EFF,
  };
}

/**
 * A world where two people agree on every morning and one person is off by
 * `disagreement` sigma on each of them. `co_observed` is how many mornings the
 * odd one out was actually seen alongside anybody.
 */
function worldWhereOnePersonDisagrees(
  disagreementSigma: number,
  coObservedMornings: number,
): ResidualSample[][] {
  const samples: ResidualSample[] = [];
  for (let morning = 0; morning < coObservedMornings; morning += 1) {
    const day = `2026-07-${String(morning + 1).padStart(2, "0")}`;
    samples.push(reported("d_agrees_a", day, 0));
    samples.push(reported("d_agrees_b", day, 0));
    samples.push(reported("d_odd", day, disagreementSigma * HEIGHT_SIGMA_EFF));
  }
  return [samples];
}

describe("the weighing room down-weights chronic disagreement, never bans it (06 section 6.2 step 3)", () => {
  it("keeps every reporter inside the floor and the ceiling, however wildly they disagree", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(fc.double({ min: 0, max: 6, noNaN: true }), fc.integer({ min: 1, max: 9 })),
          // Deliberately drawn, not hoped for: only a disagreement this
          // enormous reaches the floor, and a free generator lands on it too
          // rarely to be evidence that the floor holds.
          fc.tuple(fc.double({ min: 50, max: 5000, noNaN: true }), fc.integer({ min: 1, max: 9 })),
        ),
        ([disagreementSigma, mornings]) => {
          const weights = concordanceWeightByReporter(
            worldWhereOnePersonDisagrees(disagreementSigma, mornings),
          );
          for (const [reporter, weight] of weights) {
            assert.ok(
              weight >= FLOOR_STATED_IN_06,
              `${reporter} was weighed at ${weight}, under the ${FLOOR_STATED_IN_06} floor 06 section 6.2 states: any weight below it is a shadow ban, which decision 24 forbids`,
            );
            assert.ok(
              weight <= CEILING_STATED_IN_06,
              `${reporter} was weighed at ${weight}, over the ${CEILING_STATED_IN_06} ceiling: agreeing cannot buy more than a full voice`,
            );
          }
          assert.ok(
            weights.get("d_agrees_a")! >= weights.get("d_odd")!,
            `somebody who agreed with the consensus every morning was weighed at ${weights.get("d_agrees_a")}, below the ${weights.get("d_odd")} the morning's odd one out got`,
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("gives a reporter nobody has ever co-observed exactly a full voice", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 40, noNaN: true }),
        fc.integer({ min: 1, max: 6 }),
        (disagreementSigma, ownMornings) => {
          // A community that disagrees with itself, so the population mean
          // disagreement is high: if the newcomer were handed that mean
          // instead of a full voice, this property would catch it.
          const world = worldWhereOnePersonDisagrees(disagreementSigma, 5);
          const alone: ResidualSample[] = [];
          for (let morning = 0; morning < ownMornings; morning += 1) {
            alone.push(reported("d_stranger", `2026-08-${String(morning + 1).padStart(2, "0")}`, 3));
          }

          const weights = concordanceWeightByReporter([...world, alone]);
          assert.equal(
            weights.get("d_stranger"),
            CEILING_STATED_IN_06,
            "a reporter no one has ever reported alongside has no measured disagreement, so 06 section 6.2 step 4 gives them a full voice, not the population's",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("never pays a reporter more for disagreeing more", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true }),
        fc.integer({ min: 1, max: 9 }),
        (nearer, extra, mornings) => {
          const closer = concordanceWeightByReporter(
            worldWhereOnePersonDisagrees(nearer, mornings),
          ).get("d_odd")!;
          const further = concordanceWeightByReporter(
            worldWhereOnePersonDisagrees(nearer + extra, mornings),
          ).get("d_odd")!;

          assert.ok(
            further <= closer + 1e-12,
            `disagreeing by ${nearer + extra} sigma bought a weight of ${further}, above the ${closer} that disagreeing by ${nearer} sigma buys`,
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("cannot decide which of two people who saw a morning differently was the wrong one", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 20, noNaN: true }), (disagreementSigma) => {
        const day = "2026-07-04";
        const apart = disagreementSigma * HEIGHT_SIGMA_EFF;
        const weights = concordanceWeightByReporter([
          [reported("d_said_small", day, 0), reported("d_said_big", day, apart)],
        ]);

        assert.equal(
          weights.get("d_said_small"),
          weights.get("d_said_big"),
          "on a morning only two people saw, each is exactly as far from the other as the other is from them, so nothing in the record can say which one was wrong -- measuring against a median that includes the reporter themselves would hand one of them a free pass",
        );
      }),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("weighs a disagreement of exactly tau_w sigma-squared at half a voice, before the shrink", () => {
    // The one example that pins the formula's units. D_r is in units of
    // sigma_eff^2, so a reporter off by sqrt(tau_w) sigma on every one of a
    // great many mornings has D_r = tau_w and w_r = tau_w / (tau_w + tau_w).
    // Many mornings, so the shrink toward the population mean has faded.
    const weights = concordanceWeightByReporter(
      worldWhereOnePersonDisagrees(Math.sqrt(CONCORDANCE_TAU), 400),
    );
    const odd = weights.get("d_odd")!;
    assert.ok(
      Math.abs(odd - 0.5) < 0.02,
      `a reporter off by sqrt(tau_w) sigma every morning was weighed at ${odd}, not the half voice tau_w / (tau_w + D_r) gives at D_r = tau_w: the disagreement is not being measured in units of sigma_eff squared`,
    );

    // And the shrink's own strength, pinned where it bites hardest. With ONE
    // co-observed morning a reporter is half their own record and half the
    // population's, so a 2-sigma miss on that single morning reads as
    // 0.5 * 4 + 0.5 * (4 / 3) = 8/3, and 4 / (4 + 8/3) is exactly 0.6.
    const afterOneMorning = concordanceWeightByReporter(
      worldWhereOnePersonDisagrees(2, 1),
    ).get("d_odd")!;
    assert.ok(
      Math.abs(afterOneMorning - 0.6) < 1e-9,
      `one co-observed morning two sigma out was weighed at ${afterOneMorning}, not the 0.6 that counting the population mean as exactly one prior morning gives`,
    );
  });
});
