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
  winsorizeAtDayFence,
} from "../../src/learning/weights";
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
  });

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
