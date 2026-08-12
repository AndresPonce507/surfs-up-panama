// Accepted roadmap 05-05: "The shrinkage alarm flags misconfigured pooling".
// JIT-DISTILLED 2026-08-12 under wave-decisions.md D-2026-08-12-1/2; parked
// describe.skip until its step's crafter activates it.
//
// Non-visual: an alarm row in the operator's JSON; the port and the stored
// bytes are the observable universe. By design nothing else anywhere reacts
// to the flag.
//
// 09 s17.4 guardrail 2, verbatim: a spot with 80 observations still 60%
// shrunk means a misconfiguration -- tau wildly off, or a parent eating its
// children. The evaluation reads the shrink weight from the stored record's
// own shrunk_from_global field, so the alarm needs no refit. And the flag is
// an ALARM, never an automatic behaviour change (adr-pooling-hierarchy-
// activation decision 6): automating a response here would hand the pooling
// a knob to turn itself, so the one write this run makes is the metrics file.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { StoredCorrection } from "../../../src/learning/correction-record";
import {
  assertWritesConfinedToMetrics,
  driveMonthlyEvaluationOnce,
  metricAt,
} from "./support/monthly-port";

const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const METRICS_KEY = "learned/metrics/v1/dt=2026-08/metrics.json";

/** Eighty mornings and STILL sixty percent pooled away: the misconfiguration. */
const SHRUNK_SPOT = "playa-empozada";
const SHRUNK_WEIGHT = 0.6;
/** Eighty mornings, pooling nearly stepped aside: the healthy control. */
const HEALTHY_SPOT = "playa-venao";
const HEALTHY_WEIGHT = 0.1;
const MORNINGS_ON_FILE = 80;
const REPORTERS_ON_FILE = 12;

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

function gatedCorrection(
  spotId: string,
  shrunkFromGlobal: number,
): StoredCorrection {
  return {
    spot_id: spotId,
    schema: "spot-correction/1",
    computed_at: "2026-08-08T09:10:00.000Z",
    bias: {
      swell_h_m: {
        per_source: {
          [SOURCE]: {
            [LEAD_BUCKET]: {
              b: -0.09,
              se: 0.05,
              n: MORNINGS_ON_FILE,
              reporters: REPORTERS_ON_FILE,
              applied: true,
              shrunk_from_global: shrunkFromGlobal,
            },
          },
        },
      },
    },
    clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
  };
}

type ShrinkageRow = {
  spot_id?: unknown;
  shrink_weight?: unknown;
  n?: unknown;
  reporters?: unknown;
  flagged?: unknown;
};

function rowFor(rows: unknown, spotId: string): ShrinkageRow {
  assert.ok(
    Array.isArray(rows),
    "the shrinkage report must exist (09 s17.4 guardrail 2)",
  );
  const row = (rows as ShrinkageRow[]).find(
    (candidate) => candidate.spot_id === spotId,
  );
  assert.ok(
    row,
    `the shrinkage section carries one row per gated spot, and ${spotId} is gated: ${JSON.stringify(rows)}`,
  );
  return row;
}

describe.skip("05-05 acceptance: a spot still mostly pooled after eighty mornings is flagged as a misconfiguration", () => {
  it("flags the over-pooled spot, spares the healthy one, and changes nothing else anywhere", async () => {
    const store = new MemoryLearningStore();
    await store.put(
      `learned/corrections/v1/current/${SHRUNK_SPOT}.json`,
      JSON.stringify(gatedCorrection(SHRUNK_SPOT, SHRUNK_WEIGHT)),
    );
    await store.put(
      `learned/corrections/v1/current/${HEALTHY_SPOT}.json`,
      JSON.stringify(gatedCorrection(HEALTHY_SPOT, HEALTHY_WEIGHT)),
    );
    const before = store.snapshotAll();

    await driveMonthlyEvaluationOnce({ store, clock: new FixedClock() });
    const after = store.snapshotAll();

    // The flag is an alarm for the operator, never a behaviour change: the
    // one write this run makes is the metrics file itself
    // (adr-pooling-hierarchy-activation decision 6; D-2026-08-12-1).
    const newKeys = assertWritesConfinedToMetrics(before, after);
    assert.deepEqual(
      newKeys,
      [METRICS_KEY],
      "one run writes exactly one metrics file, keyed to the injected clock's own month",
    );
    const body = after.get(METRICS_KEY);
    assert.ok(body, "the metrics file must hold bytes");
    const metrics = JSON.parse(body) as Record<string, unknown>;

    const rows = metricAt(metrics, "shrinkage");
    const shrunk = rowFor(rows, SHRUNK_SPOT);
    const healthy = rowFor(rows, HEALTHY_SPOT);
    assert.equal(
      (rows as ShrinkageRow[]).length,
      2,
      `one row per gated spot, and exactly the gated spots: ${JSON.stringify(rows)}`,
    );

    for (const [spot, row, weight] of [
      [SHRUNK_SPOT, shrunk, SHRUNK_WEIGHT],
      [HEALTHY_SPOT, healthy, HEALTHY_WEIGHT],
    ] as const) {
      assert.equal(
        row.shrink_weight,
        weight,
        `${spot}'s row must carry the stored record's own shrunk_from_global, read not refitted: ${JSON.stringify(row)}`,
      );
      assert.equal(
        row.n,
        MORNINGS_ON_FILE,
        `${spot}'s row must carry the mornings behind the weight: ${JSON.stringify(row)}`,
      );
      assert.equal(
        row.reporters,
        REPORTERS_ON_FILE,
        `${spot}'s row must carry the distinct reporters behind the weight: ${JSON.stringify(row)}`,
      );
    }

    assert.equal(
      shrunk.flagged,
      true,
      `eighty mornings still sixty percent pooled away is a misconfiguration -- tau wildly off, or a parent eating its children -- and the file must say so (09 s17.4 guardrail 2): ${JSON.stringify(shrunk)}`,
    );
    assert.equal(
      healthy.flagged,
      false,
      `a spot whose pooling stepped aside is healthy, and an alarm that cries on healthy spots teaches the operator to ignore it: ${JSON.stringify(healthy)}`,
    );
  });
});
