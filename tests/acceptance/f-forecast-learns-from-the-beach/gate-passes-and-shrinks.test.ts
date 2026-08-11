// Accepted roadmap 01-08: “The gate watched passing, pulled toward its parent”.
// Non-visual acceptance evidence through the nightly-fit driving port. The
// in-memory store is the driven port surface; its published shelf is part of
// the observable universe because this fit must not alter a surfer's reading.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

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
} {
  const observations: object[] = [];
  const predictions: object[] = [];
  const heightResiduals: number[] = [];

  for (let index = 0; index < 22; index += 1) {
    const observedDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const deviation = index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M;
    const residual = RAW_DIFFERENCE_M + deviation;
    heightResiduals.push(residual);
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
  };
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
  physicalFloor: number,
): void {
  assert.ok(
    Math.abs(storedError - expectedError) <= ERROR_TOLERANCE,
    `stored error ${storedError} must equal the fixture's own standard error ${expectedError}`,
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
    const expectedError = sampleStandardErrorFromFixture(
      fixture.heightResiduals,
    );
    const physicalFloor = (0.5 * HEIGHT_NOISE_FLOOR_M) / Math.sqrt(key.n);
    assertOwnSpreadError(key.se, expectedError, physicalFloor);
    assert.throws(
      () => assertOwnSpreadError(0, expectedError, physicalFloor),
      /must equal the fixture's own standard error/,
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
