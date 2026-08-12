// Accepted roadmap 03-01: "Seed metadata reaches the fit; basin is a wall".
//
// The oracle is byte-identity of one Caribbean spot's stored correction file
// across two runs of the real nightly-fit port: one run that saw every Pacific
// morning, one run that saw none of them. Nothing about the Caribbean spot
// changed between the two runs, so if a single Pacific morning reached its
// stored number at any weight, the bytes differ and this example fails
// (09 section 17.4 guardrail 1: basin is a hard partition, never a soft prior).
//
// Byte-identity alone would also pass under a weaker implementation that
// partitioned by REGION rather than by coast, so the example carries its own
// anti-vacuity pair: removing a DIFFERENT-REGION, SAME-COAST neighbour must
// change the very same bytes. One removal moves nothing, the other moves
// something, and only a wall standing exactly at the coast satisfies both.
//
// Determinism discipline carried over from 01-15: the clock is fixed, so
// computed_at is identical by construction and every difference the comparison
// reports is a difference in the arithmetic.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";
import type { SpotSeed } from "../../../src/learning/hierarchy";

const CLOCK_ISO = "2026-08-09T07:00:00.000Z";
const SOURCE = "ncep_gfswave016";
const CHEST_HEAD_MID_M = 1.35;

const PACIFIC_A = "playa-venao";
const PACIFIC_B = "playa-teta";
const CARIBBEAN_NORTH = "isla-grande";
const CARIBBEAN_SOUTH = "bocas-dumpers";

/**
 * The seed roster the fit is handed. It never changes between runs: only the
 * mornings do. Two Caribbean REGIONS on one coast are what make the wall's
 * position observable at all.
 */
const SEEDS: readonly SpotSeed[] = [
  { spot_id: PACIFIC_A, region_id: "pa-pacific", coast: "pacific", break_type: "point" },
  { spot_id: PACIFIC_B, region_id: "pa-pacific", coast: "pacific", break_type: "beach" },
  { spot_id: CARIBBEAN_NORTH, region_id: "pa-caribe-norte", coast: "caribbean", break_type: "reef" },
  { spot_id: CARIBBEAN_SOUTH, region_id: "pa-caribe-sur", coast: "caribbean", break_type: "beach" },
];

class FixedClock {
  now(): Date {
    return new Date(CLOCK_ISO);
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

/** One spot's mornings: how many, by how many people, and how big the forecast ran. */
type SpotMornings = {
  readonly spotId: string;
  readonly mornings: number;
  readonly reporters: number;
  readonly forecastRanBigByM: number;
};

const PACIFIC_MORNINGS: readonly SpotMornings[] = [
  { spotId: PACIFIC_A, mornings: 14, reporters: 7, forecastRanBigByM: 0.5 },
  { spotId: PACIFIC_B, mornings: 12, reporters: 6, forecastRanBigByM: 0.45 },
];

const CARIBBEAN_MORNINGS: readonly SpotMornings[] = [
  { spotId: CARIBBEAN_NORTH, mornings: 13, reporters: 6, forecastRanBigByM: -0.4 },
  { spotId: CARIBBEAN_SOUTH, mornings: 11, reporters: 5, forecastRanBigByM: -0.1 },
];

function dayOf(index: number): string {
  const day = new Date("2026-07-01T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + index);
  return day.toISOString().slice(0, 10);
}

/** Both logs for a set of spots, one JSON line per row, exactly the shape the fit reads. */
function logsFor(spots: readonly SpotMornings[]): {
  observations: string;
  predictions: string;
} {
  const observations: string[] = [];
  const predictions: string[] = [];
  for (const spot of spots) {
    for (let index = 0; index < spot.mornings; index += 1) {
      const day = dayOf(index);
      observations.push(
        JSON.stringify({
          spot_id: spot.spotId,
          device_id: `d_${spot.spotId}_${index % spot.reporters}`,
          observed_at: `${day}T18:41:00Z`,
          size_band: "chest_head",
        }),
      );
      predictions.push(
        JSON.stringify({
          spot_id: spot.spotId,
          source: SOURCE,
          valid_ts: `${day}T18:00:00Z`,
          lead_h: 36,
          // Positive forecastRanBigByM means the forecast ran big, which is a
          // positive residual under 06 section 4's forecast-minus-observed sign.
          swell_h_m: CHEST_HEAD_MID_M + spot.forecastRanBigByM,
          swell_t_s: 10,
          land_masked: false,
        }),
      );
    }
  }
  return { observations: observations.join("\n"), predictions: predictions.join("\n") };
}

/** One whole nightly run over the given mornings, with the full seed roster always handed in. */
async function storedCorrectionsFrom(
  spots: readonly SpotMornings[],
): Promise<Map<string, string>> {
  const store = new MemoryLearningStore();
  const logs = logsFor(spots);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock(), spots: SEEDS });

  const stored = new Map<string, string>();
  for (const key of await store.list("learned/corrections/v1/current/")) {
    const body = await store.get(key);
    if (body !== null) stored.set(key, body);
  }
  return stored;
}

function fileFor(stored: ReadonlyMap<string, string>, spotId: string): string {
  const body = stored.get(`learned/corrections/v1/current/${spotId}.json`);
  assert.ok(body, `the run must have stored a correction file for ${spotId}`);
  return body;
}

describe("03-01 acceptance: a Caribbean spot can never borrow a Pacific bias, at any weight", () => {
  it("stores the same bytes for a Caribbean spot whether or not the Pacific reported at all", async () => {
    const withPacific = await storedCorrectionsFrom([
      ...PACIFIC_MORNINGS,
      ...CARIBBEAN_MORNINGS,
    ]);
    const withoutPacific = await storedCorrectionsFrom(CARIBBEAN_MORNINGS);

    // Anti-vacuity: the Pacific mornings must really have been in the first run.
    // A run that quietly dropped them would make the identity below trivial.
    assert.ok(
      withPacific.has(`learned/corrections/v1/current/${PACIFIC_A}.json`),
      "the run that saw the Pacific must have stored the Pacific's own correction, or the identity below compares two Caribbean-only runs",
    );
    assert.equal(
      withoutPacific.has(`learned/corrections/v1/current/${PACIFIC_A}.json`),
      false,
      "the run that saw no Pacific morning must have stored no Pacific correction",
    );

    assert.equal(
      fileFor(withPacific, CARIBBEAN_NORTH),
      fileFor(withoutPacific, CARIBBEAN_NORTH),
      "a Caribbean spot's stored bytes must not move when every Pacific morning is removed: the basin is a hard partition, not a weight",
    );
    assert.equal(
      fileFor(withPacific, CARIBBEAN_SOUTH),
      fileFor(withoutPacific, CARIBBEAN_SOUTH),
      "the second Caribbean spot must be walled off from the Pacific too",
    );
  });

  it("still lets a different Caribbean region carry its neighbour, so the wall stands at the coast and not at the region", async () => {
    const wholeCaribbean = await storedCorrectionsFrom(CARIBBEAN_MORNINGS);
    const northAlone = await storedCorrectionsFrom([CARIBBEAN_MORNINGS[0]!]);

    assert.notEqual(
      fileFor(wholeCaribbean, CARIBBEAN_NORTH),
      fileFor(northAlone, CARIBBEAN_NORTH),
      "removing a same-coast neighbour in another region must move the stored number, or the wall is standing at the region and the Pacific identity above proves nothing about coasts",
    );
  });
});
