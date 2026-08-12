// Accepted roadmap 01-14: “A morning without a forecast skips the score”.
// The pre-authored scenario translated to the repository's Vitest acceptance
// harness. It drives the real nightly-fit port twice over the same store shape
// and observes only the correction file written through the store port.
//
// The whole scenario is an asymmetry. A morning nobody had a forecast for has
// no score difference to contribute, so it is OMITTED from the score fit --
// never entered as a zero sample, which would move a mean. The same morning is
// still a height difference, because the size someone reported is still a
// difference against what the model said. So the score key must come back
// byte-identical while the height count rises one for one.

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

type Morning = { observation: object; prediction: object };

/**
 * One paired morning. `withForecast` decides only whether the report carries
 * the `predicted` block a build showed it; everything the height residual
 * needs is present either way, which is what makes the asymmetry observable.
 */
function morningAt(
  dayOffset: number,
  reporterIndex: number,
  withForecast: boolean,
): Morning {
  const observedAt = new Date("2026-07-01T18:41:00Z");
  observedAt.setUTCDate(observedAt.getUTCDate() + dayOffset);
  const observedDate = observedAt.toISOString().slice(0, 10);

  return {
    observation: {
      spot_id: SPOT_ID,
      device_id: `d_skip_${reporterIndex}`,
      observed_at: observedAt.toISOString(),
      size_band: "chest_head",
      quality: "good",
      // The forecast-less morning still names a quality it saw. Only the
      // `predicted` block a build showed is missing, so this fixture isolates
      // exactly the rule under test and nothing adjacent to it.
      predicted: withForecast ? { score_q: 82 } : null,
    },
    prediction: {
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.13,
      swell_t_s: 10,
      land_masked: false,
    },
  };
}

function asJsonLines(rows: readonly object[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

type GatedKey = {
  b: number;
  se: number;
  n: number;
  reporters: number;
  applied: boolean;
  shrunk_from_global: number;
};

type StoredRecord = {
  score_delta?: GatedKey & { units: string };
  bias: { swell_h_m: { per_source: Record<string, Record<string, GatedKey>> } };
};

async function fitOver(mornings: readonly Morning[]): Promise<StoredRecord> {
  const store = new MemoryLearningStore();
  await store.put(
    "log/observations/v1/dt=2026-07-01/reports.jsonl",
    asJsonLines(mornings.map((morning) => morning.observation)),
  );
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    asJsonLines(mornings.map((morning) => morning.prediction)),
  );

  await runLearningFitOnce({ store, clock: new FixedClock() });
  const stored = await store.get(
    `learned/corrections/v1/current/${SPOT_ID}.json`,
  );
  assert.ok(stored, "the fit must persist the correction it examined");
  return JSON.parse(stored) as StoredRecord;
}

function heightKeyOf(record: StoredRecord): GatedKey {
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the height difference must stay keyed to source and lead");
  return key;
}

function assertForecastLessMorningsSkipTheScore(
  withoutExtras: StoredRecord,
  withExtras: StoredRecord,
  extraCount: number,
): void {
  assert.ok(
    withoutExtras.score_delta && withExtras.score_delta,
    "both runs must state a score move, or there is no skip to observe",
  );
  assert.equal(
    withExtras.score_delta.n,
    withoutExtras.score_delta.n,
    "mornings with no captured forecast must not be counted behind the score move",
  );
  // Strict, not close. A forecast-less morning entered as a zero sample would
  // move the mean, so anything short of byte-identity is the defect.
  assert.equal(
    JSON.stringify(withExtras.score_delta),
    JSON.stringify(withoutExtras.score_delta),
    "mornings with no captured forecast must leave the score move exactly as it was",
  );
  assert.equal(
    heightKeyOf(withExtras).n,
    heightKeyOf(withoutExtras).n + extraCount,
    "those same mornings must still count toward the height difference, one for one",
  );
}

describe("01-14 acceptance property: a morning without a forecast skips the score", () => {
  it("leaves the score move and its count untouched while the height count rises one for one", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 25 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 5, max: 7 }),
        async (baseCount, extraCount, reporters) => {
          const base = Array.from({ length: baseCount }, (_unused, index) =>
            morningAt(index, index % reporters, true),
          );
          // Offset well past the base range so the two sets never share a
          // morning: every extra is genuinely additional, never a replacement.
          const extras = Array.from({ length: extraCount }, (_unused, index) =>
            morningAt(60 + index, index % reporters, false),
          );

          const withoutExtras = await fitOver(base);
          const withExtras = await fitOver([...base, ...extras]);

          assertForecastLessMorningsSkipTheScore(
            withoutExtras,
            withExtras,
            extraCount,
          );

          const scoreDelta = withExtras.score_delta!;
          assert.throws(
            () =>
              assertForecastLessMorningsSkipTheScore(
                withoutExtras,
                {
                  ...withExtras,
                  score_delta: {
                    ...scoreDelta,
                    n: scoreDelta.n + extraCount,
                  },
                },
                extraCount,
              ),
            /not be counted behind the score move/,
            "the oracle must reject a controlled mutation that counts forecast-less mornings",
          );
          assert.throws(
            () =>
              assertForecastLessMorningsSkipTheScore(
                withoutExtras,
                {
                  ...withExtras,
                  score_delta: {
                    ...scoreDelta,
                    b: scoreDelta.b + 1e-12,
                  },
                },
                extraCount,
              ),
            /exactly as it was/,
            "the oracle must reject a controlled mutation that merely comes close",
          );
          assert.throws(
            () =>
              assertForecastLessMorningsSkipTheScore(
                withoutExtras,
                withoutExtras,
                extraCount,
              ),
            /one for one/,
            "the oracle must reject a run whose height count did not absorb the extra mornings",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
