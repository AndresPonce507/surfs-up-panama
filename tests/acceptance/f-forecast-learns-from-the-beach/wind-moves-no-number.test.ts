// Accepted roadmap 01-15: “Wind changes no number the fit writes”.
// The pre-authored scenario translated to the repository's Vitest acceptance
// harness. The driving port is the nightly fit; the observable is every byte
// stored under the corrections prefix, read back through the store port.
//
// Wind is claim-exempt (06-learning-layer.md section 8): the observed carrier
// is a three-state word, the product renders wind only as a word, and no
// categorical-wind residual model exists. So wind forms no residual, carries
// no bias and no standard error, and gives the gates nothing to weigh. This
// file states that exemption as an executable law.
//
// The oracle is BYTE-identity over the whole prefix, not a numeric
// comparison, so it also pins the determinism the exemption rests on:
// computed_at must come from the INJECTED clock (the rule at the top of
// src/pipeline/ports.ts -- nothing in the core reads the ambient clock), and
// no field may carry a hash, a run counter, a random identifier, or a map
// whose insertion order the wind rotation could disturb. Both directions are
// checked: the same clock must reproduce the same bytes, and a different
// clock must move computed_at and nothing else.

import assert from "node:assert/strict";

import fc from "fast-check";
import { describe, it } from "vitest";

import { WIND_STATE_TOKENS } from "../../../src/data/report-vocab";
import { CORRECTIONS_PREFIX } from "../../../src/learning/correction-file";
import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const PROPERTY_RUNS = 20;
const FIRST_CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SECOND_CLOCK_ISO = "2026-08-10T07:00:00.000Z";

class FixedClock {
  constructor(private readonly iso: string) {}
  now(): Date {
    return new Date(this.iso);
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

function morningAt(
  dayOffset: number,
  reporterIndex: number,
  windIndex: number,
): Morning {
  const observedAt = new Date("2026-07-01T18:41:00Z");
  observedAt.setUTCDate(observedAt.getUTCDate() + dayOffset);
  const observedDate = observedAt.toISOString().slice(0, 10);

  return {
    observation: {
      spot_id: SPOT_ID,
      device_id: `d_wind_${reporterIndex}`,
      observed_at: observedAt.toISOString(),
      size_band: "chest_head",
      wind: WIND_STATE_TOKENS[windIndex % WIND_STATE_TOKENS.length],
      quality: "good",
      predicted: { score_q: 82 },
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

/** Every key stored under the corrections prefix and the exact bytes behind it. */
type PrefixSnapshot = readonly (readonly [string, string])[];

async function fitAndSnapshotPrefix(
  mornings: readonly Morning[],
  clockIso: string,
): Promise<PrefixSnapshot> {
  const store = new MemoryLearningStore();
  await store.put(
    "log/observations/v1/dt=2026-07-01/reports.jsonl",
    asJsonLines(mornings.map((morning) => morning.observation)),
  );
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    asJsonLines(mornings.map((morning) => morning.prediction)),
  );

  await runLearningFitOnce({ store, clock: new FixedClock(clockIso) });

  const keys = await store.list(CORRECTIONS_PREFIX);
  assert.ok(
    keys.length > 0,
    "the fit must store something under the corrections prefix, or there is no byte-identity to observe",
  );
  const snapshot: (readonly [string, string])[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    assert.ok(body, `the fit listed ${key} but stored no bytes behind it`);
    snapshot.push([key, body] as const);
  }
  return snapshot;
}

function assertWindMovesNoNumber(
  baseline: PrefixSnapshot,
  rotated: PrefixSnapshot,
): void {
  assert.equal(
    JSON.stringify(rotated),
    JSON.stringify(baseline),
    "rotating the wind word on every morning must leave the corrections prefix byte-identical",
  );
  for (const [key, body] of rotated) {
    assert.doesNotMatch(
      body,
      /wind/i,
      `wind is claim-exempt, so ${key} must carry no wind residual, bias or standard error`,
    );
  }
}

function assertComputedAtComesFromTheInjectedClock(
  snapshot: PrefixSnapshot,
  expectedIso: string,
): void {
  for (const [key, body] of snapshot) {
    const record = JSON.parse(body) as { computed_at?: string };
    assert.equal(
      record.computed_at,
      expectedIso,
      `${key} must stamp the injected clock, never the ambient one`,
    );
  }
}

describe("01-15 acceptance property: which wind a reporter named changes no number the fit writes", () => {
  it("keeps the whole corrections prefix byte-identical under a wind rotation, and stamps only the injected clock", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 30 }),
        fc.integer({ min: 5, max: 7 }),
        fc.integer({ min: 1, max: WIND_STATE_TOKENS.length - 1 }),
        async (count, reporters, windRotation) => {
          const mornings = Array.from(
            { length: count },
            (_unused, index) => morningAt(index, index % reporters, index),
          );
          const rotated = Array.from({ length: count }, (_unused, index) =>
            morningAt(index, index % reporters, index + windRotation),
          );

          const baseline = await fitAndSnapshotPrefix(mornings, FIRST_CLOCK_ISO);
          const afterRotation = await fitAndSnapshotPrefix(
            rotated,
            FIRST_CLOCK_ISO,
          );
          assertWindMovesNoNumber(baseline, afterRotation);

          // Re-running the same inputs on the same injected clock must write
          // the same bytes: no hash, no run counter, no ambient timestamp.
          const rerun = await fitAndSnapshotPrefix(mornings, FIRST_CLOCK_ISO);
          assertWindMovesNoNumber(baseline, rerun);
          assertComputedAtComesFromTheInjectedClock(baseline, FIRST_CLOCK_ISO);

          // And the stamp really is the clock's: moving the injected clock
          // moves computed_at, which a hardcoded literal could never do.
          const laterClock = await fitAndSnapshotPrefix(
            mornings,
            SECOND_CLOCK_ISO,
          );
          assertComputedAtComesFromTheInjectedClock(
            laterClock,
            SECOND_CLOCK_ISO,
          );

          const [firstKey, firstBody] = afterRotation[0]!;
          assert.throws(
            () =>
              assertWindMovesNoNumber(baseline, [
                [firstKey, firstBody.replace(/"computed_at":"[^"]*"/, '"computed_at":"1999-01-01T00:00:00.000Z"')],
                ...afterRotation.slice(1),
              ]),
            /byte-identical/,
            "the oracle must reject a controlled mutation of a single stored byte",
          );
          // Passed as BOTH sides so byte-identity holds and only the
          // claim-exemption assertion can fire.
          const withWindBias: PrefixSnapshot = [
            [
              firstKey,
              firstBody.replace('"clamp"', '"wind_bias":{"b":0.1},"clamp"'),
            ] as const,
            ...afterRotation.slice(1),
          ];
          assert.throws(
            () => assertWindMovesNoNumber(withWindBias, withWindBias),
            /no wind residual, bias or standard error/,
            "the oracle must reject a controlled wind-bias field appearing in a stored record",
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
