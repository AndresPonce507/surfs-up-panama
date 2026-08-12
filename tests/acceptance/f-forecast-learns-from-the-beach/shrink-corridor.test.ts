// Accepted roadmap 01-13: “Stored difference stays inside the shrink corridor”.
// Each generated fixture is driven through the real nightly-fit port into an
// isolated store. The raw difference is computed from the mornings actually
// written, not recreated from the production implementation.
//
// AMENDED 2026-08-12 BY 04-05, cross-slice by explicit authorisation (see that
// step's contract). This file belongs to 01-13. It is edited here only because
// 01-13 is the slice that shipped the `mid - u_hat` seam as a constant zero,
// and this is the step that finally put a measurement in it.
//
// WHAT THE OLD PROPERTY ASSUMED. It measured the corridor against
// `rawDifference`, the plain mean of the residuals THIS FIXTURE WROTE, and
// asserted the stored difference never exceeds it in size.
//
// WHY THAT WAS WRONG, and it is worth being precise because the failure is not
// a rounding one. The fit's estimate is the mean of the mornings as IT reads
// them -- 06 section 5.1's r_height = H_eff_pred - (mid - u_hat), each
// reporter's own habit taken out first. Those two means are the same number
// only while u_hat is zero everywhere, which is what 01-13 shipped and what
// nothing in the tree could contradict at the time. They come apart whenever a
// fixture's reporters are unevenly exposed to its spread: this generator hands
// mornings out round-robin and alternates the deviation, so an ODD morning
// count leaves some reporters carrying one more morning on their own side than
// the other. Their habits then do not cancel over the key and the corrected
// mean sits FURTHER from zero than the reported one. Measured across the
// generator's own range the overshoot reaches 3.7e-3 at count 11 with seven or
// nine reporters -- three thousand times the 1e-12 tolerance, and structural,
// not floating point. The property failed intermittently rather than always
// precisely because it depends on the generated shape.
//
// WHAT THE CORRIDOR NOW MEASURES AGAINST. The estimate the fit actually forms,
// derived here by a reference that is not the shipped path (see
// `differenceOnceEachHabitIsOut`). The claim is unchanged and unweakened: the
// stored difference stays between that estimate and zero and never flips its
// sign. Two walls are ADDED rather than removed, because the wall that was
// lost -- "no bigger than the mean of the mornings as reported" -- was doing
// real work and something true has to take its place:
//
//   * the stored difference may never leave the range of the residuals the
//     fixture wrote. The offset stage moves weight between reporters inside a
//     key; it may not manufacture a difference no morning supports.
//   * where every reporter IS balanced, the offsets are exactly zero and the
//     stored difference is exactly the reported mean, to 1e-12. That is the
//     old assertion, kept where it is still true, and it now says something it
//     never said before: the new stage is dormant exactly when the design says
//     it should be.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import { BACKFIT_PASSES, REPORTER_OFFSET_TAU } from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const PROPERTY_RUNS = 20;
const CORRIDOR_TOLERANCE = 1e-12;

class FixedClock {
  now(): Date {
    return new Date("2026-08-09T07:00:00.000Z");
  }
}

class MemoryLearningStore {
  private readonly values = new Map<string, string>();

  async list(prefix: string): Promise<string[]> {
    return [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort();
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, body: string): Promise<void> {
    this.values.set(key, body);
  }
}

function variedMornings(
  count: number,
  reporters: number,
  rawMagnitude: number,
  spread: number,
): {
  observations: string;
  predictions: string;
  rawDifference: number;
  residuals: number[];
  reporters: string[];
} {
  const observations: object[] = [];
  const predictions: object[] = [];
  const residuals: number[] = [];
  const reportedBy: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const observedAt = new Date("2026-07-01T18:41:00Z");
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);
    // Negative residuals follow the product's forecast-minus-observed sign.
    // An odd final morning takes the same sign as the raw difference, so the
    // generated spread cannot make the fixture's raw mean cross zero.
    const deviation = index % 2 === 0 ? -spread : spread;
    const residual = -rawMagnitude + deviation;
    residuals.push(residual);
    reportedBy.push(`d_corridor_${index % reporters}`);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_corridor_${index % reporters}`,
      observed_at: observedAt.toISOString(),
      size_band: "chest_head",
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.35 + residual,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
    rawDifference: meanOf(residuals),
    residuals,
    reporters: reportedBy,
  };
}

function meanOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * The difference the fit actually forms at this key: the mean of the mornings
 * once every reporter's own habit has been taken out of them.
 *
 * A REFERENCE, NOT THE SHIPPED PATH. 06 section 5.2's pseudocode, written out
 * for one key and equal weights -- three alternating passes, the key's mean
 * against the shifted values, each reporter's habit against their unshifted
 * ones, shrunk toward zero at tau_u. The shipped fit runs the same alternation
 * around the WHOLE pooling ladder, its two gate passes, its basin walls and
 * its per-key taus; this is twelve lines with none of that. It is exact here
 * for one reason only, and the reason is a property of the fixture rather than
 * a hope: every generated fixture has exactly ONE spot, so the pooling ladder
 * has nothing to pool with, every key's parent is its own estimate and
 * shrinkTowardParent is the identity. Add a second spot to this generator and
 * this reference stops being valid with it.
 *
 * Every morning names the same band, so precision weights are equal and a
 * weighted mean is a plain one; and one morning per day per device means each
 * morning is its own report, so n_r is simply how many mornings a reporter has.
 */
function differenceOnceEachHabitIsOut(
  residuals: readonly number[],
  reporters: readonly string[],
): number {
  const mornings = new Map<string, number[]>();
  reporters.forEach((reporter, index) => {
    mornings.set(reporter, [...(mornings.get(reporter) ?? []), residuals[index]!]);
  });

  let habits = new Map<string, number>();
  const differenceWith = (measured: ReadonlyMap<string, number>): number =>
    meanOf(residuals.map((residual, index) => residual + (measured.get(reporters[index]!) ?? 0)));

  for (let pass = 0; pass < BACKFIT_PASSES; pass += 1) {
    const difference = differenceWith(habits);
    const measured = new Map<string, number>();
    for (const [reporter, own] of mornings) {
      const reportCount = own.length;
      measured.set(
        reporter,
        (reportCount / (reportCount + REPORTER_OFFSET_TAU)) * (difference - meanOf(own)),
      );
    }
    habits = measured;
  }
  return differenceWith(habits);
}

/** Whether every reporter's own mornings average to the key's own mean, so nobody has a habit to measure. */
function everyReporterIsBalanced(
  residuals: readonly number[],
  reporters: readonly string[],
): boolean {
  const keyMean = meanOf(residuals);
  const mornings = new Map<string, number[]>();
  reporters.forEach((reporter, index) => {
    mornings.set(reporter, [...(mornings.get(reporter) ?? []), residuals[index]!]);
  });
  return [...mornings.values()].every(
    (own) => Math.abs(meanOf(own) - keyMean) <= CORRIDOR_TOLERANCE,
  );
}

type StoredHeightKey = { b: number; n: number; reporters: number };

/** What the corridor is measured between, all of it read off the mornings the fixture wrote. */
type Corridor = {
  /** The difference the fit forms: the mornings once each reporter's habit is out. */
  readonly estimate: number;
  /** The plain mean of the residuals as they were reported, before any habit came out. */
  readonly asReported: number;
  readonly lowestMorning: number;
  readonly highestMorning: number;
  readonly nobodyHasAHabit: boolean;
};

function corridorFor(fixture: {
  residuals: number[];
  reporters: string[];
  rawDifference: number;
}): Corridor {
  return {
    estimate: differenceOnceEachHabitIsOut(fixture.residuals, fixture.reporters),
    asReported: fixture.rawDifference,
    lowestMorning: Math.min(...fixture.residuals),
    highestMorning: Math.max(...fixture.residuals),
    nobodyHasAHabit: everyReporterIsBalanced(fixture.residuals, fixture.reporters),
  };
}

function assertShrinkCorridor(
  key: StoredHeightKey,
  corridor: Corridor,
  count: number,
  reporters: number,
): void {
  assert.equal(key.n, count);
  assert.equal(key.reporters, reporters);
  assert.ok(
    Math.abs(key.b) <= Math.abs(corridor.estimate) + CORRIDOR_TOLERANCE,
    `stored difference ${key.b} must not exceed the ${corridor.estimate} these mornings support once each reporter's habit is out of them`,
  );
  assert.ok(
    key.b * corridor.estimate >= 0,
    `stored difference ${key.b} must not flip the sign of the ${corridor.estimate} these mornings support`,
  );
  assert.ok(
    key.b * corridor.asReported >= 0,
    `stored difference ${key.b} must not flip the sign ${corridor.asReported} the mornings were reported with: taking a habit out may move a difference, never invert the direction every surfer pointed`,
  );
  // Only where the habits moved the difference at all. Below the tolerance the
  // two numbers are the same number and the direction between them is the
  // direction of a rounding step, which says nothing about anybody's habit.
  const habitsMovedItBy = corridor.estimate - corridor.asReported;
  if (Math.abs(habitsMovedItBy) > CORRIDOR_TOLERANCE) {
    assert.ok(
      (key.b - corridor.asReported) * habitsMovedItBy >= 0,
      `stored difference ${key.b} moved off the reported ${corridor.asReported} the OPPOSITE way from the ${corridor.estimate} these mornings support: taking each reporter's habit out has to move the difference the way their habits point, and a stored value that moved the other way is adding the habit back rather than subtracting it. A one-sided corridor cannot see this on its own -- the wall it would need is the one the offsets themselves moved.`,
    );
  }
  assert.ok(
    key.b >= corridor.lowestMorning - CORRIDOR_TOLERANCE &&
      key.b <= corridor.highestMorning + CORRIDOR_TOLERANCE,
    `stored difference ${key.b} left the range of the mornings themselves, [${corridor.lowestMorning}, ${corridor.highestMorning}]: the offset moves weight between reporters inside a key, and may never manufacture a difference no morning supports`,
  );
  if (corridor.nobodyHasAHabit) {
    assert.ok(
      Math.abs(key.b - corridor.asReported) <= CORRIDOR_TOLERANCE,
      `every reporter's own mornings average to this key's own mean, so nobody has a habit to measure and every offset must be exactly zero -- yet the stored ${key.b} is not the reported ${corridor.asReported}`,
    );
  }
}

describe("01-13 acceptance property: stored difference stays inside the shrink corridor", () => {
  it("keeps every generated stored height difference between its raw value and zero", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 40 }),
        fc.integer({ min: 5, max: 9 }),
        fc.double({
          min: 0.05,
          max: 1.2,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.double({ min: 0, max: 0.3, noNaN: true, noDefaultInfinity: true }),
        async (count, reporters, rawMagnitude, spread) => {
          const store = new MemoryLearningStore();
          const fixture = variedMornings(
            count,
            reporters,
            rawMagnitude,
            spread,
          );
          await store.put(
            "log/observations/v1/dt=2026-07-01/reports.jsonl",
            fixture.observations,
          );
          await store.put(
            "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
            fixture.predictions,
          );

          await runLearningFitOnce({ store, clock: new FixedClock() });
          const stored = await store.get(
            `learned/corrections/v1/current/${SPOT_ID}.json`,
          );
          assert.ok(
            stored,
            "the fit must persist the shrunken value it asks a later reader to apply",
          );
          const record = JSON.parse(stored) as {
            bias: {
              swell_h_m: {
                per_source: Record<string, Record<string, StoredHeightKey>>;
              };
            };
          };
          const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
          assert.ok(
            key,
            "the stored difference must remain keyed to its source and lead bucket",
          );

          const corridor = corridorFor(fixture);
          assertShrinkCorridor(key, corridor, count, reporters);
          assert.throws(
            () => assertShrinkCorridor({ ...key, b: -key.b }, corridor, count, reporters),
            /must not flip the sign/,
            "the property oracle must reject a controlled sign-flip mutation",
          );
          assert.throws(
            () =>
              assertShrinkCorridor(
                { ...key, b: 2 * corridor.estimate },
                corridor,
                count,
                reporters,
              ),
            /must not exceed the/,
            "the property oracle must reject a controlled magnitude-expansion mutation",
          );
          // No in-test mutation is written for the range wall. Every value far
          // enough outside the mornings to trip it is also outside the
          // magnitude corridor, so the mutation would prove the wrong
          // assertion. Its falsifiability is proven from the other side
          // instead, by breaking the production code -- see this repair's
          // commit body.
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
