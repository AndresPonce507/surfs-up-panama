// Accepted roadmap 01-12: “Nothing under the floor is ever applied”.
// Every generated case drives the real nightly-fit port into an isolated
// in-memory store, so neither an example special case nor leaked state can
// satisfy this anti-coordination law.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const HEIGHT_SIGMA_EFF_M = 0.48;
const PROPERTY_RUNS = 20;

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

function agreeingMornings(
  count: number,
  reporters: number,
  difference: number,
): { observations: string; predictions: string } {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < count; index += 1) {
    const observedAt = new Date("2026-07-01T18:41:00Z");
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_floor_${index % reporters}`,
      observed_at: `${observedDate}T18:41:00Z`,
      size_band: "chest_head",
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.35 + difference,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

type StoredHeightKey = {
  n: number;
  reporters: number;
  se: number;
  applied: boolean;
};

function assertSubFloorRefusal(
  key: StoredHeightKey,
  expectedCount: number,
  expectedReporters: number,
): void {
  assert.equal(
    key.n,
    expectedCount,
    "a refusal must still record every morning it examined",
  );
  assert.equal(
    key.reporters,
    expectedReporters,
    "a refusal must still record every reporter it examined",
  );
  assert.equal(
    key.applied,
    false,
    "a difference under the physical floor must never be applied",
  );
  const physicalFloor = (0.5 * HEIGHT_SIGMA_EFF_M) / Math.sqrt(expectedCount);
  assert.ok(
    Math.abs(key.se - physicalFloor) <= 1e-12,
    "a zero-spread case must store the physical floor rather than manufactured precision",
  );
}

describe("01-12 acceptance property: no amount of agreement makes a small difference publishable", () => {
  it("refuses every generated sub-floor zero-spread set and records it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 40 }),
        fc.integer({ min: 5, max: 9 }),
        fc.double({
          min: 0.01,
          max: 0.95,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        async (count, reporters, fractionOfSignificanceBar) => {
          const difference =
            -(fractionOfSignificanceBar * HEIGHT_SIGMA_EFF_M) /
            Math.sqrt(count);
          const store = new MemoryLearningStore();
          const fixture = agreeingMornings(count, reporters, difference);
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
            "refusing a correction must not mean writing nothing",
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
            "the stored refusal must remain keyed to its source and lead bucket",
          );

          assertSubFloorRefusal(key, count, reporters);
          assert.throws(
            () =>
              assertSubFloorRefusal(
                { ...key, applied: true },
                count,
                reporters,
              ),
            /must never be applied/,
            "the property oracle must reject a controlled under-floor publication mutation",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
