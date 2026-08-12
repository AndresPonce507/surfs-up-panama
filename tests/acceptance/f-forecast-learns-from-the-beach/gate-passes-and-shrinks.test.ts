// Accepted roadmap 01-08: “The gate watched passing, pulled toward its parent”.
// Non-visual acceptance evidence through the nightly-fit driving port. The
// in-memory store is the driven port surface; its published shelf is part of
// the observable universe because this fit must not alter a surfer's reading.
//
// AMENDED 2026-08-12 BY 04-05, cross-slice by explicit authorisation (see that
// step's contract). This file is 01-08's, not 04-05's, and is edited here only
// because the per-reporter offset it was written before could not be tested
// against when its oracle was set.
//
// WHAT THE OLD ORACLE ASSUMED AND WHY IT WAS WRONG. It computed the standard
// error from the residuals this fixture WRITES and asserted the fit would
// store exactly that. That silently assumed the fit reads a morning's residual
// at face value. It never has: 06 section 5.1 forms r_height = H_eff_pred -
// (mid - u_hat), the reporter's own measured habit taken out first. The
// assumption was invisible while u_hat was the constant zero 01-13 shipped,
// which is the whole reason it went unnoticed -- there was no per-reporter
// correction in the tree to test it against.
//
// WHAT MOVED AND WHAT DID NOT. Seven devices take twenty-two alternating
// mornings in turn, so `d_learn_0` draws four (indices 0, 7, 14, 21) and lands
// two either side of the middle, while the other six draw three each and come
// out one morning ahead on their own side -- 0.14 m from the key's own mean,
// three leaning each way.
//
//   The DIFFERENCE does not move. Three lean each way, so the six offsets
//   cancel exactly over the key and `b` is still the fixture's own raw mean,
//   -0.22, to the last bit. That is asserted below, and it is the sharpest
//   thing this fixture can say about the new stage: the offset enters as a
//   per-reporter shift on the residuals, never as a re-centring of the key or
//   a rescale of it.
//
//   The ERROR does move, and has to. It is the spread of the SHIFTED values,
//   and pulling each reporter toward the middle by their own habit leaves less
//   spread than they reported: 0.0868 against 0.0895, three per cent tighter.
//   A stored error that had not moved would mean the habits were measured and
//   then not subtracted from anything.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { REPORTER_OFFSET_TAU } from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;
const HEIGHT_NOISE_FLOOR_M = 0.48;
const ERROR_TOLERANCE = 1e-12;

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

  publishedShelf(): Map<string, string> {
    return new Map(
      [...this.values].filter(([key]) => key.startsWith("pub/v1/")),
    );
  }
}

function reportedMornings(): {
  observations: string;
  predictions: string;
  heightResiduals: number[];
  reporters: string[];
} {
  const observations: object[] = [];
  const predictions: object[] = [];
  const heightResiduals: number[] = [];
  const reporters: string[] = [];

  for (let index = 0; index < 22; index += 1) {
    const observedDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const deviation = index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M;
    const residual = RAW_DIFFERENCE_M + deviation;
    heightResiduals.push(residual);
    reporters.push(`d_learn_${index % 7}`);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_learn_${index % 7}`,
      observed_at: `${observedDate}T18:41:00Z`,
      size_band: "chest_head",
      quality: "good",
      predicted: { score_q: index % 2 === 0 ? 82 : 76 },
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      // The residual convention is forecast minus observed. This alternating
      // fixture has a -0.22 m raw mean and an honest 0.42 m spread.
      swell_h_m: 1.35 + residual,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
    heightResiduals,
    reporters,
  };
}

function meanOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * The same mornings as the fit finally reads them: each reporter's own habit
 * taken out, 06 section 5.1's `mid(band) - u_hat`.
 *
 * A REFERENCE, NOT A COPY OF THE SHIPPED PATH. The fit runs three alternating
 * passes over the whole pooling ladder, its gates and its basin walls. This is
 * one closed-form step -- every reporter's distance from the key's own mean,
 * trusted at 06 section 5.2's `n_r / (n_r + tau_u)` -- and it is exact HERE
 * only because this fixture's six leaning reporters cancel, so the key mean
 * the offsets are read against never moves from one pass to the next. The
 * cancellation is not assumed; the `b` assertion below is what proves it, and
 * if it ever stopped holding this reference would stop being valid with it.
 *
 * Every morning names the same band, so the precision weights are equal and a
 * weighted mean is a plain one.
 */
function residualsAsTheFitReadsThem(
  residuals: readonly number[],
  reporters: readonly string[],
): number[] {
  const keyMean = meanOf(residuals);
  const own = new Map<string, number[]>();
  reporters.forEach((reporter, index) => {
    own.set(reporter, [...(own.get(reporter) ?? []), residuals[index]!]);
  });

  const habitOf = new Map<string, number>();
  for (const [reporter, mornings] of own) {
    const reportCount = mornings.length;
    habitOf.set(
      reporter,
      (reportCount / (reportCount + REPORTER_OFFSET_TAU)) * (keyMean - meanOf(mornings)),
    );
  }
  return residuals.map((residual, index) => residual + habitOf.get(reporters[index]!)!);
}

function sampleStandardErrorFromFixture(residuals: readonly number[]): number {
  const mean =
    residuals.reduce((total, residual) => total + residual, 0) /
    residuals.length;
  const populationVariance =
    residuals.reduce((total, residual) => total + (residual - mean) ** 2, 0) /
    residuals.length;
  return Math.sqrt(populationVariance) / Math.sqrt(residuals.length);
}

function assertOwnSpreadError(
  storedError: number,
  expectedError: number,
  asReportedError: number,
  physicalFloor: number,
): void {
  assert.ok(
    Math.abs(storedError - expectedError) <= ERROR_TOLERANCE,
    `stored error ${storedError} must equal the spread of the fixture's own mornings once each reporter's habit is taken out, ${expectedError}`,
  );
  assert.ok(
    storedError < asReportedError,
    `stored error ${storedError} is not below the ${asReportedError} these mornings were REPORTED with: taking each reporter's own habit out can only remove between-reporter spread, never add any, so an error that did not tighten means the habits were measured and then subtracted from nothing`,
  );
  assert.ok(
    storedError > physicalFloor,
    `stored error ${storedError} must remain above the ${physicalFloor} m physical floor for this spread fixture`,
  );
}

describe("01-08 acceptance: the gate watches earned evidence pass", () => {
  it("stores an applied, sign-preserving correction while leaving the published shelf byte-identical", async () => {
    const store = new MemoryLearningStore();
    const fixture = reportedMornings();
    await store.put(
      "log/observations/v1/dt=2026-07-01/reports.jsonl",
      fixture.observations,
    );
    await store.put(
      "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
      fixture.predictions,
    );
    await store.put("pub/v1/2026-08-09.json", '{"surfer":"unchanged"}');
    const publishedBefore = store.publishedShelf();

    const outcome = await runLearningFitOnce({
      store,
      clock: new FixedClock(),
    });
    const stored = await store.get(
      `learned/corrections/v1/current/${SPOT_ID}.json`,
    );
    assert.ok(
      stored,
      "earned evidence must write an auditable correction record",
    );
    const record = JSON.parse(stored) as {
      bias: {
        swell_h_m: {
          per_source: Record<
            string,
            Record<
              string,
              {
                b: number;
                se: number;
                n: number;
                reporters: number;
                applied: boolean;
              }
            >
          >;
        };
      };
    };
    const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(
      key,
      "the applied height correction must stay keyed to its model and lead bucket",
    );

    assert.equal(outcome.completed, true);
    assert.equal(outcome.corrections_written, 1);
    assert.equal(key.n, 22);
    assert.equal(key.reporters, 7);
    // The difference is untouched by the offsets: three reporters lean each
    // way, so their habits cancel exactly over this key. This is the assertion
    // the reference below rests on, so it comes first.
    assert.ok(
      Math.abs(key.b - meanOf(fixture.heightResiduals)) <= ERROR_TOLERANCE,
      `stored difference ${key.b} must still be the fixture's own raw mean ${meanOf(fixture.heightResiduals)}: this fixture's reporters lean three each way, so their measured habits cancel over the key, and a difference that moved would mean the offset is re-centring the key rather than shifting each reporter`,
    );

    const expectedError = sampleStandardErrorFromFixture(
      residualsAsTheFitReadsThem(fixture.heightResiduals, fixture.reporters),
    );
    const asReportedError = sampleStandardErrorFromFixture(
      fixture.heightResiduals,
    );
    const physicalFloor = (0.5 * HEIGHT_NOISE_FLOOR_M) / Math.sqrt(key.n);
    assertOwnSpreadError(key.se, expectedError, asReportedError, physicalFloor);
    assert.throws(
      () => assertOwnSpreadError(0, expectedError, asReportedError, physicalFloor),
      /must equal the spread of the fixture's own mornings/,
      "the acceptance oracle must reject a controlled zero-error mutation",
    );
    assert.equal(
      key.applied,
      true,
      "the gate must be observed admitting sufficient evidence",
    );
    assert.ok(
      Math.abs(key.b) > 2 * key.se,
      "the stored correction must clear twice its stored error",
    );
    assert.ok(
      Math.abs(key.b) <= Math.abs(RAW_DIFFERENCE_M),
      "shrinkage must not exceed the raw difference",
    );
    assert.ok(
      key.b * RAW_DIFFERENCE_M > 0,
      "shrinkage must not flip the raw difference sign",
    );
    assert.deepEqual(
      store.publishedShelf(),
      publishedBefore,
      "the nightly fit must not alter any published reading",
    );
  });
});
