// Accepted roadmap 01-09: “Correction states its score move in display points”.
// This is the pre-authored scenario translated to the repository's Vitest
// acceptance harness. It drives the real nightly-fit port and observes only
// the correction file written through the in-memory store port.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const EXPECTED_SCORE_MOVE = 9;
const SCORE_TOLERANCE = 1e-12;

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

function scoreFixture(): { observations: string; predictions: string } {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < 22; index += 1) {
    const observedDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_score_${index % 7}`,
      observed_at: `${observedDate}T18:41:00Z`,
      size_band: "chest_head",
      quality: "good",
      // The report vocabulary's "good" anchor is 70, so these alternating
      // shown scores form score residuals 12 and 6, with mean 9 points.
      predicted: { score_q: index % 2 === 0 ? 82 : 76 },
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

type StoredScoreRecord = {
  schema: string;
  score_delta?: { b: number; n: number; reporters: number; units: string };
  clamp: { max_abs_h_frac: number; max_abs_score: number };
};

function assertDisplayPointContract(
  record: StoredScoreRecord,
  expectedScoreMove: number,
): void {
  assert.equal(record.schema, "spot-correction/1");
  assert.ok(
    record.score_delta,
    "the stored correction must carry a score move",
  );
  assert.equal(
    record.score_delta.units,
    "display_points",
    "the score move must use the only legal display-points unit",
  );
  assert.ok(
    Math.abs(record.score_delta.b - expectedScoreMove) <= SCORE_TOLERANCE,
    `the score move ${record.score_delta.b} must equal shown score minus the report vocabulary's observed-quality anchor ${expectedScoreMove}`,
  );
  assert.equal(record.score_delta.n, 22);
  assert.equal(record.score_delta.reporters, 7);
  assert.equal(record.clamp.max_abs_h_frac, 0.4);
  assert.equal(record.clamp.max_abs_score, 12);
}

describe("01-09 acceptance: a correction states its score move in display points", () => {
  it("writes the score move and its reader limits through the nightly-fit port", async () => {
    const store = new MemoryLearningStore();
    const fixture = scoreFixture();
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
      "the fit must write the correction it asks a reader to interpret",
    );
    const record = JSON.parse(stored) as StoredScoreRecord;

    assertDisplayPointContract(record, EXPECTED_SCORE_MOVE);
    assert.throws(
      () =>
        assertDisplayPointContract(
          {
            ...record,
            score_delta: { ...record.score_delta!, units: "fraction" },
          },
          EXPECTED_SCORE_MOVE,
        ),
      /only legal display-points unit/,
      "the acceptance oracle must reject a controlled non-display-points mutation",
    );
  });
});
