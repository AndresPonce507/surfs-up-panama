// Accepted roadmap 01-13: “Stored difference stays inside the shrink corridor”.
// Each generated fixture is driven through the real nightly-fit port into an
// isolated store. The raw difference is computed from the mornings actually
// written, not recreated from the production implementation.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

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
): { observations: string; predictions: string; rawDifference: number } {
  const observations: object[] = [];
  const predictions: object[] = [];
  const residuals: number[] = [];

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
    rawDifference:
      residuals.reduce((sum, residual) => sum + residual, 0) / residuals.length,
  };
}

type StoredHeightKey = { b: number; n: number; reporters: number };

function assertShrinkCorridor(
  key: StoredHeightKey,
  rawDifference: number,
  count: number,
  reporters: number,
): void {
  assert.equal(key.n, count);
  assert.equal(key.reporters, reporters);
  assert.ok(
    Math.abs(key.b) <= Math.abs(rawDifference) + CORRIDOR_TOLERANCE,
    `stored difference ${key.b} must not exceed the fixture raw difference ${rawDifference} in size`,
  );
  assert.ok(
    key.b * rawDifference >= 0,
    `stored difference ${key.b} must not flip the fixture raw difference sign ${rawDifference}`,
  );
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

          assertShrinkCorridor(key, fixture.rawDifference, count, reporters);
          assert.throws(
            () =>
              assertShrinkCorridor(
                { ...key, b: -key.b },
                fixture.rawDifference,
                count,
                reporters,
              ),
            /must not flip the fixture raw difference sign/,
            "the property oracle must reject a controlled sign-flip mutation",
          );
          assert.throws(
            () =>
              assertShrinkCorridor(
                { ...key, b: 2 * fixture.rawDifference },
                fixture.rawDifference,
                count,
                reporters,
              ),
            /must not exceed the fixture raw difference/,
            "the property oracle must reject a controlled magnitude-expansion mutation",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
