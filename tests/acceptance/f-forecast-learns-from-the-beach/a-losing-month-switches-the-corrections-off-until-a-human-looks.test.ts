// Accepted roadmap 05-02: "The kill switch, watched killing and sparing".
// JIT-DISTILLED 2026-08-12 under wave-decisions.md D-2026-08-12-1/2; parked
// describe.skip until its step's crafter activates it.
//
// Non-visual: a verdict inside an operator-only JSON; the port and the stored
// bytes are the observable universe. The day-zero degrade this pins is
// precisely that nothing visible changes wrongly.
//
// THE KILL, RE-ANCHORED TO THE APPLY SEAM (D-2026-08-12-1 pin 4). The recover
// branch's scenario asserted `applied: false` flipped onto the stored records;
// that mechanism -- the monthly job rewriting learned/corrections/v1/ in
// place -- was ruled OUT on 2026-08-12. Under the ruling the same product
// truth (a bad month degrades to day zero, loudly, until a human looks) is
// observed at three seams instead:
//   (a) the verdict lands IN the metrics file and in the outcome;
//   (b) every stored correction byte is EXACTLY as before the run;
//   (c) the correction-APPLY lane consumes the latest verdict and maps every
//       spot to null, the same cost as no file at all.
// The judge itself: rolling-origin blocked CV, train weeks one to eight, test
// nine and ten, corrected mean ABSOLUTE error against raw on the held-out
// block, per gated key (06 s7 G7; adr-correction-gates-and-clamps decision 3;
// D-2026-08-12-1 pin 1 -- MAE, not block-bias magnitude).

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

/** The gated, applied height correction the month is judging. */
const STORED_HEIGHT_B = -0.18;

/** Weeks one to eight kept earning the correction: forecast ran 0.22 m small. */
const TRAIN_DIFFERENCE_M = -0.22;
/** The held-out fortnight flipped sign: the forecast now runs 0.22 m BIG. */
const HELD_OUT_DIFFERENCE_M = 0.22;
const TRAIN_MORNINGS = 40;
const HELD_OUT_MORNINGS = 14;
const TRAIN_SPREAD_M = 0.42;
/** Tight enough that the held-out block's own verdict is unambiguous, never a coin flip on spread. */
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

/** Shaped exactly as src/learning/correction-file.ts writes it, schema spot-correction/1. */
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

/**
 * Ten weeks of residual-bearing mornings, 2026-06-06 through 2026-07-29:
 * forty training mornings whose raw difference is exactly -0.22, then the
 * held-out fortnight at +0.22. Even counts either side of every alternation,
 * so each block's mean is exact by construction.
 */
function tenWeeksTurningAgainstTheCorrection(): {
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

describe.skip("05-02 acceptance: a losing month switches the corrections off until a human looks", () => {
  it("publishes corrections-killed into the metrics file, leaves every stored byte alone, and the apply lane degrades to day zero", async () => {
    const store = new MemoryLearningStore();
    await store.put(
      CORRECTION_KEY,
      JSON.stringify(correctionThatPassedEveryGate()),
    );
    const fixture = tenWeeksTurningAgainstTheCorrection();
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

    // (a) The verdict is published INTO the metrics file, and the outcome agrees.
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
      "corrections-killed",
      "a month the corrections lose on held-out mornings must publish the kill INTO the metrics file, so the human who looks knows why (06 s7 G7 via D-2026-08-12-1)",
    );
    assert.equal(
      outcome.verdict,
      "corrections-killed",
      "the outcome's verdict and the published verdict never disagree (roadmap 05-02)",
    );

    // (b) Every stored correction byte is EXACTLY as before the run. The
    // ruled-out mechanism rewrote these bytes in place; this pins that it
    // never comes back (D-2026-08-12-1).
    assert.deepEqual(
      store.snapshotPrefix("learned/corrections/v1/"),
      correctionsBefore,
      "the monthly job is metrics-only: a kill month leaves learned/corrections/v1/ byte-identical, because the kill overrides consumption, not storage (D-2026-08-12-1)",
    );

    // (c) The apply lane obeys the verdict: with the same store and the same
    // clock, the loader maps the spot to null -- the day-zero cost, exactly
    // what an absent or corrupt file costs. Today loadStoredCorrections takes
    // { store, spotIds } and never reads the verdict; consuming it (a clock
    // input, bounded probe on the latest month) is exactly the widening the
    // amended 05-02 criteria order.
    const applyLaneInput = {
      store: {
        getCorrection: (key: string): Promise<string | null> => store.get(key),
      },
      spotIds: [SPOT_ID],
      clock,
    } as unknown as Parameters<typeof loadStoredCorrections>[0];
    const appliedBySpot = await loadStoredCorrections(applyLaneInput);
    assert.equal(
      appliedBySpot.get(SPOT_ID),
      null,
      "while the latest monthly verdict is corrections-killed, the apply lane must map every spot to null -- day-zero numbers everywhere, byte-identical to every correction refusing (D-2026-08-12-1; G7's judgment at the apply seam). Today the loader takes no clock and never reads the verdict, which is precisely what 05-02 adds",
    );

    // (d) A kill month is distinguishable in the outcome's events; the
    // reference branch emitted only metrics_written on every path
    // (D-2026-08-12-1 pin 3).
    assert.ok(
      Array.isArray(outcome.events) &&
        outcome.events.some((event) =>
          JSON.stringify(event).includes("corrections-killed"),
        ),
      `a kill month must announce itself in the outcome's events, not just in the file: ${JSON.stringify(outcome.events)}`,
    );
  });
});
