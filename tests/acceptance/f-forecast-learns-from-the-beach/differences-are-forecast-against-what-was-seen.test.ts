// Accepted roadmap 01-18: “Every difference is forecast against what someone
// saw”. The pre-authored scenario translated to the repository's Vitest
// acceptance harness, as three generated laws over the stored difference.
//
// WHY THIS STEP IS NOT BLOCKED HERE, stated plainly because the accepted
// roadmap records it as blocked and not plannable to green.
//
// The recorded blocker is a property of ONE FIXTURE BUILDER, the cucumber
// support helper syntheticMornings on the recover/learning-build branch. That
// helper computes forecastEffectiveHeightM = bandMid(band) - biggerThanForecastM
// + deviation, so switching the reported band moves the FORECAST by the same
// amount it moves the reported midpoint. The declared residual
// r_height = H_eff_pred - mid(band_i) then cancels the band exactly, and the
// "a bigger reported size lowers the stored difference" law compares a number
// to itself. The roadmap names the fix itself: "syntheticMornings must
// decouple the forecast from the reported band."
//
// That helper does not exist on this branch. Every committed acceptance step
// of this feature here builds its own fixture, and this one builds the
// decoupled shape the roadmap asked for: the prediction row is held FIXED
// while only the reported band moves. Nothing in the assertion is weakened,
// no feature file or shared fixture is edited, and no band-sensitive residual
// is implemented -- a band-sensitive residual would contradict 06 section 5.1
// and would red the sealed 01-08 and 01-13 raw-difference oracles.
//
// The third law needs 01-15's determinism discipline: u_hat is exactly 0 this
// slice, so samples must NOT be grouped by reporter before averaging.
// Grouping would change nothing mathematically and would still change
// floating-point summation order, and therefore the stored bytes.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import { sizeBands, type SizeBandToken } from "../../../src/data/size-bands";
import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const PROPERTY_RUNS = 20;
const TOLERANCE = 1e-9;

const SMALLER_BAND: SizeBandToken = "chest_head";
const BIGGER_BAND: SizeBandToken = "head_overhead";
/** The forecast is held fixed, so a bigger reported size must lower the difference by exactly this. */
const BAND_MIDPOINT_RISE = midpointOf(BIGGER_BAND) - midpointOf(SMALLER_BAND);

function midpointOf(band: SizeBandToken): number {
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined) throw new Error(`test bug: unknown band ${band}`);
  return (row.lo_m + row.hi_m) / 2;
}

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

type MorningSpec = {
  count: number;
  reporters: number;
  /** Added to every prediction row's swell height, leaving the reports untouched. */
  forecastLiftM: number;
  /** What the reporters said they saw. The forecast never follows it. */
  reportedBand: SizeBandToken;
  /** Rotates which person reported which morning, over the same set of people. */
  reporterShift: number;
};

function syntheticMornings(spec: MorningSpec): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < spec.count; index += 1) {
    const observedAt = new Date("2026-07-01T18:41:00Z");
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);

    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_seen_${(index + spec.reporterShift) % spec.reporters}`,
      observed_at: observedAt.toISOString(),
      size_band: spec.reportedBand,
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      // A FIXED reference height plus a spread that does not depend on the
      // reported band. This is the decoupling the roadmap asked for: the
      // forecast never moves because someone reported a bigger wave.
      swell_h_m: 1.2 + (index % 3) * 0.05 + spec.forecastLiftM,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

async function storedRecordFor(spec: MorningSpec): Promise<string> {
  const store = new MemoryLearningStore();
  const fixture = syntheticMornings(spec);
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
  assert.ok(stored, "the fit must persist the difference it measured");
  return stored;
}

function storedDifferenceIn(body: string): number {
  const record = JSON.parse(body) as {
    bias: {
      swell_h_m: { per_source: Record<string, Record<string, { b: number }>> };
    };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the difference must stay keyed to the model and its lead time");
  return key.b;
}

function assertRaisingTheForecastRaisesTheDifference(
  baseline: string,
  raised: string,
  forecastLiftM: number,
): void {
  const before = storedDifferenceIn(baseline);
  const after = storedDifferenceIn(raised);
  assert.ok(
    after > before,
    `raising every forecast must raise the stored difference, because the difference is forecast minus observed: ${after} did not exceed ${before}`,
  );
  assert.ok(
    Math.abs(after - before - forecastLiftM) < TOLERANCE,
    `the stored difference must rise by exactly the forecast lift ${forecastLiftM}; it rose by ${after - before}`,
  );
}

function assertReportingABiggerSizeLowersTheDifference(
  smallerBand: string,
  biggerBand: string,
): void {
  const atSmallerBand = storedDifferenceIn(smallerBand);
  const atBiggerBand = storedDifferenceIn(biggerBand);
  assert.ok(
    atBiggerBand < atSmallerBand,
    `reporting a bigger size must lower the stored difference: ${atBiggerBand} was not below ${atSmallerBand}`,
  );
  assert.ok(
    Math.abs(atSmallerBand - atBiggerBand - BAND_MIDPOINT_RISE) < TOLERANCE,
    `the drop must be exactly the rise in reported midpoint ${BAND_MIDPOINT_RISE}; it was ${atSmallerBand - atBiggerBand}`,
  );
}

function assertShufflingWhoReportedChangesNothing(
  baseline: string,
  shuffled: string,
): void {
  assert.equal(
    shuffled,
    baseline,
    "shuffling which person reported which morning must change nothing stored, because nobody has any reporting history yet",
  );
}

describe("01-18 acceptance property: every difference the fit measures is the forecast against what a person actually saw", () => {
  it("rises with the forecast, falls with the reported size, and ignores who reported which morning", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 5, max: 7 }),
        fc.double({
          min: 0.05,
          max: 0.5,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.integer({ min: 1, max: 6 }),
        async (count, reporters, forecastLiftM, reporterShift) => {
          const base: MorningSpec = {
            count,
            reporters,
            forecastLiftM: 0,
            reportedBand: SMALLER_BAND,
            reporterShift: 0,
          };

          const baseline = await storedRecordFor(base);
          const forecastRaised = await storedRecordFor({
            ...base,
            forecastLiftM,
          });
          const biggerSizeReported = await storedRecordFor({
            ...base,
            reportedBand: BIGGER_BAND,
          });
          const reportersShuffled = await storedRecordFor({
            ...base,
            reporterShift,
          });

          assertRaisingTheForecastRaisesTheDifference(
            baseline,
            forecastRaised,
            forecastLiftM,
          );
          assertReportingABiggerSizeLowersTheDifference(
            baseline,
            biggerSizeReported,
          );
          assertShufflingWhoReportedChangesNothing(baseline, reportersShuffled);

          assert.throws(
            () =>
              assertRaisingTheForecastRaisesTheDifference(
                forecastRaised,
                baseline,
                forecastLiftM,
              ),
            /must raise the stored difference/,
            "the oracle must reject a stored difference that moved against the forecast",
          );
          assert.throws(
            () =>
              assertReportingABiggerSizeLowersTheDifference(
                baseline,
                baseline,
              ),
            /must lower the stored difference/,
            "the oracle must reject a stored difference the reported band could not move, which is the fixture defect the accepted roadmap recorded",
          );
          assert.throws(
            () =>
              assertShufflingWhoReportedChangesNothing(
                baseline,
                forecastRaised,
              ),
            /must change nothing stored/,
            "the oracle must reject any stored change attributed to a reporter shuffle",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
