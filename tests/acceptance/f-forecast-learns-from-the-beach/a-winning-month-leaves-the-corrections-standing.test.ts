// Accepted roadmap 05-02: "The kill switch, watched killing and sparing".
// JIT-DISTILLED 2026-08-12 under wave-decisions.md D-2026-08-12-1/2; parked
// describe.skip until its step's crafter activates it.
//
// Non-visual: a verdict inside an operator-only JSON; the port and the stored
// bytes are the observable universe.
//
// THE SPARE. A switch only ever seen killing proves nothing about its
// judgment. Same ten weeks as the kill scenario, but the held-out fortnight
// kept agreeing with the correction: the judge must record corrections-stay
// in the metrics file, the stored bytes stay untouched (trivially -- under
// D-2026-08-12-1 the monthly job never writes there on ANY verdict), and the
// apply lane goes on loading the stored record, so the correction stands and
// applies.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { StoredCorrection } from "../../../src/learning/correction-record";
import { loadStoredCorrections } from "../../../src/learning/load-correction";
import {
  assertWritesConfinedToMetrics,
  driveMonthlyEvaluationOnce,
  metricAt,
} from "./support/monthly-port";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const CORRECTION_KEY = `learned/corrections/v1/current/${SPOT_ID}.json`;
const METRICS_KEY = "learned/metrics/v1/dt=2026-08/metrics.json";

const STORED_HEIGHT_B = -0.18;

/** All ten weeks kept coming in 0.22 m bigger than forecast: the correction keeps earning its keep. */
const TRAIN_DIFFERENCE_M = -0.22;
const HELD_OUT_DIFFERENCE_M = -0.22;
const TRAIN_MORNINGS = 40;
const HELD_OUT_MORNINGS = 14;
const TRAIN_SPREAD_M = 0.42;
const HELD_OUT_SPREAD_M = 0.1;

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

  snapshotPrefix(prefix: string): Map<string, string> {
    return new Map(
      [...this.values].filter(([key]) => key.startsWith(prefix)),
    );
  }
}

function correctionThatPassedEveryGate(): StoredCorrection {
  return {
    spot_id: SPOT_ID,
    schema: "spot-correction/1",
    computed_at: "2026-08-01T07:00:00.000Z",
    bias: {
      swell_h_m: {
        per_source: {
          [SOURCE]: {
            [LEAD_BUCKET]: {
              b: STORED_HEIGHT_B,
              se: 0.05,
              n: 22,
              reporters: 7,
              applied: true,
              shrunk_from_global: 0.22,
            },
          },
        },
      },
    },
    clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
  };
}

function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

function tenWeeksAgreeingWithTheCorrection(): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];
  for (let index = 0; index < TRAIN_MORNINGS + HELD_OUT_MORNINGS; index += 1) {
    const heldOut = index >= TRAIN_MORNINGS;
    const date = addDays("2026-06-06", index);
    const mean = heldOut ? HELD_OUT_DIFFERENCE_M : TRAIN_DIFFERENCE_M;
    const spread = heldOut ? HELD_OUT_SPREAD_M : TRAIN_SPREAD_M;
    const residual = mean + (index % 2 === 0 ? spread : -spread);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_learn_${index % 7}`,
      observed_at: `${date}T18:41:00Z`,
      size_band: "chest_head",
      quality: "good",
      predicted: { score_q: index % 2 === 0 ? 82 : 76, conf_level: "medium" },
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

describe.skip("05-02 acceptance: a winning month leaves the corrections standing, and says so", () => {
  it("publishes corrections-stay, touches no stored byte, and the apply lane keeps loading the record", async () => {
    const store = new MemoryLearningStore();
    await store.put(
      CORRECTION_KEY,
      JSON.stringify(correctionThatPassedEveryGate()),
    );
    const fixture = tenWeeksAgreeingWithTheCorrection();
    await store.put(
      "log/observations/v1/dt=2026-06-06/reports.jsonl",
      fixture.observations,
    );
    await store.put(
      "predictions/v1/dt=2026-06-05/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
      fixture.predictions,
    );
    const correctionsBefore = store.snapshotPrefix("learned/corrections/v1/");
    const before = store.snapshotAll();

    const clock = new FixedClock();
    const outcome = await driveMonthlyEvaluationOnce({ store, clock });
    const after = store.snapshotAll();

    const newKeys = assertWritesConfinedToMetrics(before, after);
    assert.deepEqual(
      newKeys,
      [METRICS_KEY],
      "one run writes exactly one metrics file, keyed to the injected clock's own month",
    );
    const body = after.get(METRICS_KEY);
    assert.ok(body, "the metrics file must hold bytes");
    const metrics = JSON.parse(body) as Record<string, unknown>;
    assert.equal(
      metricAt(metrics, "cv.verdict"),
      "corrections-stay",
      "the monthly file must record the winning verdict too; a check only ever seen killing proves nothing about its judgment",
    );
    assert.equal(
      outcome.verdict,
      "corrections-stay",
      "the outcome's verdict and the published verdict never disagree (roadmap 05-02)",
    );

    assert.deepEqual(
      store.snapshotPrefix("learned/corrections/v1/"),
      correctionsBefore,
      "a winning month writes nothing to learned/corrections/v1/ either: the monthly job is metrics-only on every verdict (D-2026-08-12-1)",
    );

    // The apply lane, handed the same store and the same clock, still loads
    // the stored record: the correction stands and applies. The clock is the
    // widening the amended 05-02 criteria order (the loader reads the latest
    // monthly verdict before trusting any stored record; corrections-stay
    // leaves the per-correction gates as the authority).
    const applyLaneInput = {
      store: {
        getCorrection: (key: string): Promise<string | null> => store.get(key),
      },
      spotIds: [SPOT_ID],
      clock,
    } as unknown as Parameters<typeof loadStoredCorrections>[0];
    const appliedBySpot = await loadStoredCorrections(applyLaneInput);
    const record = appliedBySpot.get(SPOT_ID);
    assert.ok(
      record !== null && record !== undefined,
      "a month the corrections won must leave them standing: the apply lane must still load the stored record for playa-venao",
    );
    const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
    assert.ok(key, "the loaded record must keep its height key");
    assert.equal(
      key.applied,
      true,
      "the gate verdict the nightly fit stored is carried through untouched; the monthly job neither marks nor unmarks it",
    );
    assert.equal(
      key.b,
      STORED_HEIGHT_B,
      "the correction stands exactly as stored: a winning month may not have moved a single number (D-2026-08-12-1)",
    );
  });
});
