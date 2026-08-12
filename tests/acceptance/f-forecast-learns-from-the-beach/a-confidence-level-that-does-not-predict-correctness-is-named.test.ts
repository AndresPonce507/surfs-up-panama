// Accepted roadmap 05-04: "Calibration can remove a failing confidence term".
// JIT-DISTILLED 2026-08-12 under wave-decisions.md D-2026-08-12-1/2; parked
// describe.skip until its step's crafter activates it.
//
// Non-visual: a named term inside an operator-only JSON; the port and the
// stored bytes are the observable universe. No user surface carries
// confidence changes until the scoring lane acts.
//
// The confidence kill switch (06 s10; 09 s3.6 consequence 3): Brier and
// hit-rate are binned by each report's own captured conf_level, against
// quality in Good or Epic as the event, score_q/100 the naive v1
// probability. A month where high-confidence mornings hit LESS often than
// low-confidence ones names calibration.offending_term "c_spread" -- the
// spread term is the first candidate to die, the side 06 s13 takes on
// research 09's own contradiction. The file NAMES the removal; performing it
// is the scoring lane's edit, routed not performed. And a detector only ever
// seen firing proves nothing, so a control month where confidence DOES
// predict correctness must name nothing at all.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  assertWritesConfinedToMetrics,
  driveMonthlyEvaluationOnce,
  metricAt,
} from "./support/monthly-port";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const CHEST_HEAD_MID_M = 1.35;
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;
const METRICS_KEY = "learned/metrics/v1/dt=2026-08/metrics.json";
const MORNINGS = 30;
/** Half the mornings spoke with high confidence, half with low. */
const MORNINGS_PER_LEVEL = MORNINGS / 2;

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

  snapshotAll(): Map<string, string> {
    return new Map(this.values);
  }
}

/**
 * Alternating mornings: the even-index ones spoke with HIGH confidence at a
 * high score, the odd ones with LOW confidence at a low score. `confidenceWasRight`
 * decides whether the confident mornings were the ones that hit (quality
 * good, the event) or the ones that missed (quality bad).
 */
function alternatingMonth(confidenceWasRight: boolean): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];
  for (let index = 0; index < MORNINGS; index += 1) {
    const date = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const confident = index % 2 === 0;
    const hit = confidenceWasRight ? confident : !confident;
    const residual =
      RAW_DIFFERENCE_M + (index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_learn_${index % 7}`,
      observed_at: `${date}T18:41:00Z`,
      size_band: "chest_head",
      quality: hit ? "good" : "bad",
      predicted: {
        score_q: confident ? 85 : 40,
        conf_level: confident ? "high" : "low",
      },
      trigger: "organic",
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${date}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: CHEST_HEAD_MID_M + residual,
      swell_t_s: 10,
      land_masked: false,
    });
  }
  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

async function monthlyMetricsOver(confidenceWasRight: boolean): Promise<{
  metrics: Record<string, unknown>;
}> {
  const store = new MemoryLearningStore();
  const fixture = alternatingMonth(confidenceWasRight);
  await store.put(
    "log/observations/v1/dt=2026-07-01/reports.jsonl",
    fixture.observations,
  );
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    fixture.predictions,
  );
  const before = store.snapshotAll();

  await driveMonthlyEvaluationOnce({ store, clock: new FixedClock() });
  const after = store.snapshotAll();

  const newKeys = assertWritesConfinedToMetrics(before, after);
  assert.deepEqual(
    newKeys,
    [METRICS_KEY],
    "one run writes exactly one metrics file, keyed to the injected clock's own month",
  );
  const body = after.get(METRICS_KEY);
  assert.ok(body, "the metrics file must hold bytes");
  return { metrics: JSON.parse(body) as Record<string, unknown> };
}

type CalibrationBin = {
  conf_level?: unknown;
  reports?: unknown;
  hits?: unknown;
  hit_rate?: unknown;
  brier?: unknown;
};

function binFor(bins: unknown, confLevel: string): CalibrationBin {
  assert.ok(
    Array.isArray(bins) && bins.length > 0,
    "the calibration check must bin by confidence level, or removal power is an assertion with no evidence",
  );
  const row = (bins as CalibrationBin[]).find(
    (candidate) => candidate.conf_level === confLevel,
  );
  assert.ok(
    row,
    `every spoken confidence level needs its bin; none found for "${confLevel}": ${JSON.stringify(bins)}`,
  );
  return row;
}

describe.skip("05-04 acceptance: a confidence level that does not predict correctness is named for removal", () => {
  it("names c_spread when high-confidence mornings hit less often than low-confidence ones", async () => {
    const { metrics } = await monthlyMetricsOver(false);

    assert.equal(
      metricAt(metrics, "calibration.offending_term"),
      "c_spread",
      "when high-confidence mornings are not more often right, the offending confidence term is named for removal, and the spread term is first in line (09 s3.6 consequence 3). The file routes the removal; the scoring lane performs it",
    );

    const bins = metricAt(metrics, "calibration.bins");
    const high = binFor(bins, "high");
    const low = binFor(bins, "low");
    for (const [level, bin] of [
      ["high", high],
      ["low", low],
    ] as const) {
      assert.equal(
        bin.reports,
        MORNINGS_PER_LEVEL,
        `the ${level}-confidence bin must count its ${MORNINGS_PER_LEVEL} mornings: ${JSON.stringify(bin)}`,
      );
      assert.equal(
        typeof bin.brier,
        "number",
        `each bin carries its Brier score, the proper scoring rule beside the hit rate: ${JSON.stringify(bin)}`,
      );
    }
    // Quality in {good, epic} is the event: every confident morning was bad,
    // every hesitant one good, so the hit rates are exact by construction.
    assert.equal(
      high.hits,
      0,
      `not one high-confidence morning hit this month: ${JSON.stringify(high)}`,
    );
    assert.equal(
      high.hit_rate,
      0,
      `the high-confidence hit rate is zero by construction: ${JSON.stringify(high)}`,
    );
    assert.equal(
      low.hits,
      MORNINGS_PER_LEVEL,
      `every low-confidence morning hit this month: ${JSON.stringify(low)}`,
    );
    assert.equal(
      low.hit_rate,
      1,
      `the low-confidence hit rate is one by construction: ${JSON.stringify(low)}`,
    );
  });

  it("names nothing when high-confidence mornings do hit more often", async () => {
    const { metrics } = await monthlyMetricsOver(true);

    assert.equal(
      metricAt(metrics, "calibration.offending_term"),
      null,
      "a month where confidence predicted correctness must name no term: a detector only ever seen firing proves nothing about its judgment",
    );
  });
});
