// Accepted roadmap 01-11: “Agreement buys nothing: the physical noise floor”.
// The real nightly-fit port writes the record. The in-memory store is its
// driven port, and the stored height key is the observable gate universe.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const AGREED_DIFFERENCE_M = -0.08;
const HEIGHT_SIGMA_EFF_M = 0.48;
const FLOOR_MULTIPLIER = 0.5;
const FLOOR_TOLERANCE = 1e-6;

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

function perfectlyAgreeingMornings(): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < 22; index += 1) {
    const observedDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_agree_${index % 7}`,
      observed_at: `${observedDate}T18:41:00Z`,
      size_band: "chest_head",
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      // Every residual is exactly -0.08 m, so sample spread is zero.
      swell_h_m: 1.35 + AGREED_DIFFERENCE_M,
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
  b: number;
  se: number;
  n: number;
  reporters: number;
  applied: boolean;
};

function assertPhysicalFloorContract(key: StoredHeightKey): void {
  const expectedFloor =
    (FLOOR_MULTIPLIER * HEIGHT_SIGMA_EFF_M) / Math.sqrt(key.n);
  assert.equal(key.n, 22);
  assert.equal(key.reporters, 7);
  assert.ok(
    Math.abs(key.se - expectedFloor) <= FLOOR_TOLERANCE,
    `stored error ${key.se} must equal the physical floor ${expectedFloor}, not the reports' zero spread`,
  );
  assert.equal(
    key.applied,
    false,
    "twenty-two perfectly agreeing reports must not make an eight-centimetre difference significant",
  );
  assert.ok(
    Math.abs(key.b) <= 2 * key.se,
    "the physical floor must keep the stored difference from clearing G3",
  );
}

describe("01-11 acceptance: agreement buys nothing below the physical noise floor", () => {
  it("stores the height floor and refuses a coordinated zero-spread difference", async () => {
    const store = new MemoryLearningStore();
    const fixture = perfectlyAgreeingMornings();
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
    assert.ok(stored, "the fit must record the gate decision it made");
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
      "the stored error must remain attached to its source and lead key",
    );

    assertPhysicalFloorContract(key);
    assert.throws(
      () => assertPhysicalFloorContract({ ...key, se: 0, applied: true }),
      /must equal the physical floor/,
      "the acceptance oracle must reject a controlled zero-error publication mutation",
    );
  });
});
