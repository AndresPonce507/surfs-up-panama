// Accepted roadmap 05-01: "Monthly port reports its outcome and writes the metrics file".
// JIT-DISTILLED 2026-08-12 under wave-decisions.md D-2026-08-12-1/2; parked
// describe.skip until its step's crafter activates it.
//
// Non-visual: a monthly JSON for the operator has no pixels; the port and the
// stored bytes are the observable universe. The operator is the file's only
// reader at launch, so this test reads it exactly the way he will.
//
// Every morning below is invented and nothing here claims the forecast
// learned anything. What is pinned is the watching itself: one run, one
// outcome object (never a bare void), exactly one metrics file keyed to the
// injected clock's own month, every section 06 section 10 names present with
// the field names the oracles pin (selection.per_decile,
// selection.solicited_share, pairwise.pairs, pairwise.target_pairs,
// mae.baselines.climatology, mae.baselines.persistence,
// sigma_human.co_observer_pairs, calibration, shrinkage[], cv.verdict) --
// and, per D-2026-08-12-1, not one byte anywhere else.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  assertWritesConfinedToMetrics,
  driveMonthlyEvaluationOnce,
  metricAt,
  VERDICT_VOCABULARY,
} from "./support/monthly-port";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const CHEST_HEAD_MID_M = 1.35;
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;
/** The injected clock names the month; the metrics key must follow it, never the wall clock. */
const METRICS_KEY = "learned/metrics/v1/dt=2026-08/metrics.json";

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

function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** A July of reported mornings, every third one asked for by a push rather than volunteered. */
function aMonthOfMornings(): { observations: string; predictions: string } {
  const observations: object[] = [];
  const predictions: object[] = [];
  for (let index = 0; index < 30; index += 1) {
    const date = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const residual =
      RAW_DIFFERENCE_M + (index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_learn_${index % 7}`,
      observed_at: `${date}T18:41:00Z`,
      size_band: "chest_head",
      quality: index % 2 === 0 ? "good" : "ok",
      predicted: { score_q: index % 2 === 0 ? 82 : 76, conf_level: "medium" },
      trigger: index % 3 === 0 ? "push_solicited" : "organic",
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

/** Ninety days of published calls whose scores cycle every decile, the imbalance histogram's denominator. */
function ninetyDaysOfPublishedCalls(): [string, string][] {
  return Array.from({ length: 90 }, (_unused, index) => {
    const date = addDays("2026-05-11", index);
    return [
      `log/calls/v1/dt=${date}/build=11Z/pa-pacific.jsonl.gz`,
      JSON.stringify({
        spot_id: SPOT_ID,
        build_id: `b_${date}T11Z`,
        valid_ts: `${date}T18:00Z`,
        score_q: (index % 10) * 10 + 5,
      }),
    ] as [string, string];
  });
}

describe("05-01 acceptance: the monthly file watches every hazard the design names", () => {
  it("reports its outcome, writes exactly one metrics file for the clock's own month, and touches nothing else", async () => {
    const store = new MemoryLearningStore();
    const fixture = aMonthOfMornings();
    await store.put(
      "log/observations/v1/dt=2026-07-01/reports.jsonl",
      fixture.observations,
    );
    await store.put(
      "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
      fixture.predictions,
    );
    for (const [key, body] of ninetyDaysOfPublishedCalls()) {
      await store.put(key, body);
    }
    const before = store.snapshotAll();

    const outcome = await driveMonthlyEvaluationOnce({
      store,
      clock: new FixedClock(),
    });
    const after = store.snapshotAll();

    assert.equal(
      outcome.completed,
      true,
      "the evaluation must finish and say so; a judge that dies silently looks exactly like one that found nothing to judge",
    );
    assert.ok(
      (VERDICT_VOCABULARY as readonly string[]).includes(outcome.verdict),
      `the outcome's verdict must be one of ${VERDICT_VOCABULARY.join(" | ")}, not ${JSON.stringify(outcome.verdict)}`,
    );
    assert.ok(
      Array.isArray(outcome.events),
      "the outcome must carry its events; a run that cannot say what it did cannot be audited",
    );

    const newKeys = assertWritesConfinedToMetrics(before, after);
    assert.deepEqual(
      newKeys,
      [METRICS_KEY],
      "one run writes exactly one metrics file, keyed to the injected clock's own month",
    );
    assert.equal(
      outcome.metrics_key,
      METRICS_KEY,
      "the outcome must name the one file it wrote, so the operator never hunts for it",
    );

    const body = after.get(METRICS_KEY);
    assert.ok(body, "the metrics file must hold bytes");
    const metrics = JSON.parse(body) as Record<string, unknown>;

    const perDecile = metricAt(metrics, "selection.per_decile");
    assert.ok(
      Array.isArray(perDecile) && perDecile.length > 0,
      "the selection-imbalance histogram is hazard (a)'s tripwire and must not be empty",
    );
    for (const row of perDecile as Record<string, unknown>[]) {
      assert.equal(
        typeof row.decile,
        "number",
        `a per-decile row must name its decile: ${JSON.stringify(row)}`,
      );
      assert.equal(
        typeof row.calls,
        "number",
        `a per-decile row must count the published calls at that kind of day: ${JSON.stringify(row)}`,
      );
      assert.equal(
        typeof row.reported_days,
        "number",
        `a per-decile row must count the days actually heard from: ${JSON.stringify(row)}`,
      );
    }
    assert.equal(
      typeof metricAt(metrics, "selection.solicited_share"),
      "number",
      "the solicited-versus-volunteered split must be a number",
    );

    assert.equal(
      typeof metricAt(metrics, "pairwise.pairs"),
      "number",
      "the pair count is the progress meter toward the product-level claim",
    );
    assert.equal(
      metricAt(metrics, "pairwise.target_pairs"),
      400,
      "the target is the ~400 same-day pairs of 09 section 10.2, stated in the file",
    );

    const baselines = metricAt(metrics, "mae.baselines");
    assert.ok(
      typeof baselines === "object" &&
        baselines !== null &&
        "climatology" in baselines &&
        "persistence" in baselines,
      "the height error means nothing without B0 climatology and B2 persistence beside it, and it is never the headline",
    );

    assert.equal(
      typeof metricAt(metrics, "sigma_human.co_observer_pairs"),
      "number",
      "the sigma_human ceiling needs its co-observer pair count: it is the floor no model can beat (09 section 16.2)",
    );

    const calibration = metricAt(metrics, "calibration");
    assert.ok(
      typeof calibration === "object" && calibration !== null,
      "the calibration check owns the confidence kill switch and must be in the file",
    );

    assert.ok(
      Array.isArray(metricAt(metrics, "shrinkage")),
      "the shrinkage report must exist (09 section 17.4 guardrail 2)",
    );

    const verdict = metricAt(metrics, "cv.verdict");
    assert.ok(
      (VERDICT_VOCABULARY as readonly string[]).includes(verdict as string),
      `cv.verdict must be one of ${VERDICT_VOCABULARY.join(" | ")}, not ${JSON.stringify(verdict)}`,
    );
  });
});
