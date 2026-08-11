// Accepted roadmap 01-14: “A morning without a forecast skips the score”.
// The two generated universes drive the real fit port. They share an ordered
// scored prefix; the second appends only predicted:null mornings, which must
// alter height evidence but be omitted from score evidence exactly.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
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

type Fixture = { observations: string; predictions: string };

function scoredMornings(
  baseCount: number,
  extraForecastlessCount: number,
  reporters: number,
): Fixture {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < baseCount + extraForecastlessCount; index += 1) {
    const observedAt = new Date("2026-07-01T18:41:00Z");
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);
    const isForecastlessExtra = index >= baseCount;
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_skip_${index % reporters}`,
      observed_at: observedAt.toISOString(),
      size_band: "chest_head",
      quality: "good",
      predicted: isForecastlessExtra
        ? null
        : { score_q: index % 2 === 0 ? 82 : 76 },
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.13,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

type StoredCorrection = {
  score_delta?: { b: number; n: number };
  bias: { swell_h_m: { per_source: Record<string, Record<string, { n: number }>> } };
};

async function runFixture(fixture: Fixture): Promise<StoredCorrection> {
  const store = new MemoryLearningStore();
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", fixture.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    fixture.predictions,
  );
  await runLearningFitOnce({ store, clock: new FixedClock() });
  const stored = await store.get(`learned/corrections/v1/current/${SPOT_ID}.json`);
  assert.ok(stored, "each universe must persist the correction it examined");
  return JSON.parse(stored) as StoredCorrection;
}

function assertForecastlessInvariant(
  baseline: StoredCorrection,
  withForecastless: StoredCorrection,
  extraCount: number,
): void {
  assert.ok(baseline.score_delta, "the scored baseline must have a score delta");
  assert.ok(withForecastless.score_delta, "forecast-less extras must not erase existing score evidence");
  assert.equal(
    withForecastless.score_delta.b,
    baseline.score_delta.b,
    "forecast-less mornings must leave the score delta exactly unchanged",
  );
  assert.equal(
    withForecastless.score_delta.n,
    baseline.score_delta.n,
    "forecast-less mornings must leave the score sample count unchanged",
  );
  const baselineHeight = baseline.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  const extendedHeight = withForecastless.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(baselineHeight && extendedHeight, "both universes must retain their height key");
  assert.equal(
    extendedHeight.n,
    baselineHeight.n + extraCount,
    "every forecast-less morning must still add one height sample",
  );
}

describe("01-14 acceptance property: forecast-less mornings skip score and keep height", () => {
  it("omits every generated predicted:null morning from score evidence exactly", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 5, max: 9 }),
        async (baseCount, extraCount, reporters) => {
          const baseline = await runFixture(scoredMornings(baseCount, 0, reporters));
          const withForecastless = await runFixture(
            scoredMornings(baseCount, extraCount, reporters),
          );

          assertForecastlessInvariant(baseline, withForecastless, extraCount);
          assert.throws(
            () =>
              assertForecastlessInvariant(
                baseline,
                {
                  ...withForecastless,
                  score_delta: {
                    ...withForecastless.score_delta!,
                    b: withForecastless.score_delta!.b + 1,
                  },
                },
                extraCount,
              ),
            /score delta exactly unchanged/,
            "the property oracle must reject a controlled score contribution from forecast-less mornings",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
