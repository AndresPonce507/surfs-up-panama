// Accepted roadmap 04-01: "One session counts once: device-day median
// collapse".
//
// 06-learning-layer.md section 6.2 step 1: per (spot, day, device) the fit
// collapses samples to the median sample before anything else weighs them.
// One person reporting five times in a session contributes once. It is also
// the fix for the near-duplicate leak research 09 section 13.4 gate 4 warns
// about, where consecutive-hour reports of one swell are counted as if they
// were independent mornings.
//
// THE ORACLE IS BYTE IDENTITY, not a corridor. A run where one morning was
// submitted five times must store exactly the bytes a run where it was
// submitted once stores -- every field of every key, the score delta
// included, down to the last digit. A corridor would let an implementation
// that collapsed only the height lane, or only the value and not the count,
// slip through: n, se and the gate verdict all read off the sample list.
//
// Byte identity is only a fair oracle because computed_at comes from the run's
// own injected clock and the record's key order is insertion order over the
// same fixture (01-15's discipline). Both runs here use the same fixed clock
// and the same spot, source and lead bucket, so nothing but the collapse can
// move a byte.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;
const MORNINGS = 22;
const REPORTERS = 7;

/** The morning one enthusiastic device submits over and over, and how many times. */
const REPEATED_MORNING_INDEX = 0;
const SUBMISSIONS_IN_THE_SESSION = 5;

class FixedClock {
  now(): Date {
    return new Date("2026-08-09T07:00:00.000Z");
  }
}

class MemoryLearningStore {
  private readonly values = new Map<string, string>();

  async list(prefix: string): Promise<string[]> {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, body: string): Promise<void> {
    this.values.set(key, body);
  }
}

/**
 * The same twenty-two mornings either way. `submissionsPerSession` is how many
 * times the device that reported the repeated morning pressed send within that
 * one session: once is the honest baseline, five is the same session recorded
 * five times. Every repeat carries the same band, the same quality and the same
 * shown score -- it is one report submitted five times, not five opinions --
 * and every repeat falls inside the same UTC hour, so all five pair with the
 * one prediction row that hour has.
 */
function reportedMornings(submissionsPerSession: number): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < MORNINGS; index += 1) {
    const observedDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const deviation = index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M;
    const residual = RAW_DIFFERENCE_M + deviation;
    const submissions =
      index === REPEATED_MORNING_INDEX ? submissionsPerSession : 1;

    for (let submission = 0; submission < submissions; submission += 1) {
      observations.push({
        spot_id: SPOT_ID,
        device_id: `d_learn_${index % REPORTERS}`,
        // 18:41, 18:43, 18:45 ... all floor to the same UTC hour, which is
        // what makes them one session rather than several mornings.
        observed_at: `${observedDate}T18:${String(41 + submission * 2).padStart(2, "0")}:00Z`,
        size_band: "chest_head",
        quality: "good",
        predicted: { score_q: index % 2 === 0 ? 82 : 76 },
      });
    }

    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
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

async function storedRecordFor(submissionsPerSession: number): Promise<string> {
  const store = new MemoryLearningStore();
  const fixture = reportedMornings(submissionsPerSession);
  await store.put(
    "log/observations/v1/dt=2026-07-01/reports.jsonl",
    fixture.observations,
  );
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    fixture.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock() });

  const body = await store.get(`learned/corrections/v1/current/${SPOT_ID}.json`);
  assert.ok(body, "the run must have stored a correction record for the spot");
  return body;
}

type StoredHeightKey = { n: number; reporters: number };

function heightKeyIn(body: string): StoredHeightKey {
  const record = JSON.parse(body) as {
    bias: {
      swell_h_m: {
        per_source: Record<string, Record<string, StoredHeightKey>>;
      };
    };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the difference must stay keyed to its source and lead bucket");
  return key;
}

describe("04-01 acceptance: one session counts exactly once", () => {
  it("stores the same bytes whether the morning was submitted once or five times", async () => {
    const submittedOnce = await storedRecordFor(1);
    const submittedFiveTimes = await storedRecordFor(SUBMISSIONS_IN_THE_SESSION);

    assert.equal(
      heightKeyIn(submittedFiveTimes).n,
      MORNINGS,
      `five submissions in one session counted as ${heightKeyIn(submittedFiveTimes).n} mornings instead of ${MORNINGS}: the session was never collapsed`,
    );
    assert.equal(
      submittedFiveTimes,
      submittedOnce,
      "a session submitted five times must leave every stored byte identical to the same session submitted once",
    );
  });

  it("still counts the mornings that were reported once each", async () => {
    const key = heightKeyIn(await storedRecordFor(1));
    assert.equal(key.n, MORNINGS, "the honest baseline run must keep all its mornings");
    assert.equal(
      key.reporters,
      REPORTERS,
      "collapsing sessions must not collapse the people who reported them",
    );
  });
});
