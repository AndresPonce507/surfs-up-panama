// Accepted roadmap 02-01: “Correction reader validates, refuses units,
// degrades honestly”. Scenario “An unreadable correction file is read as
// absent, and the reader says why”, plus the roadmap's additional scenario
// “A score move stated in any unit but the points a surfer sees is refused by
// name”.
//
// The pre-authored cucumber scenarios reach this seam by dynamic import of
// src/learning/load-correction on recover/learning-build. That harness is not
// on this branch; every committed acceptance step of this feature here drives
// the same production port from Vitest instead, and this file follows that
// established shape.
//
// WHY THE FIXTURE IS NOT HAND-TYPED. The “loads intact” claim is only worth
// anything against bytes the shipped emitter actually writes, so the
// well-formed record below comes from buildCorrectionRecords - the same
// function the nightly fit calls - serialized exactly as fit.ts stores it.
// A hand-typed literal would prove the reader agrees with this test's author,
// not with the writer on the other side of the file.
//
// UNITS PIN (domain-model.md section 11): display_points is the only legal
// value for score_delta.units. The pin exists so a hundredfold misread fails
// at READ time instead of printing; the refusal has to NAME the foreign unit
// it found, because an unexplained refusal is indistinguishable from a bug.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { describe, it } from "vitest";

import {
  buildCorrectionRecords,
  currentCorrectionKey,
  type SpotInputs,
} from "../../../src/learning/correction-file";
import { evaluateLearningDeclarations } from "../../../src/learning/declarations";
import type { ObservationRow, PredictionRow } from "../../../src/learning/inputs";
import {
  loadStoredCorrection,
  type CorrectionLoadReport,
} from "../../../src/learning/load-correction";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const READER_MODULE = "load-correction.ts";

const SHIPPED_SOURCE_ROOT = fileURLToPath(
  new URL("../../../src/", import.meta.url),
);

class FixedClock {
  now(): Date {
    return new Date("2026-08-09T07:00:00.000Z");
  }
}

/**
 * The one driven capability the reader needs, standing in for BuildStore.
 *
 * It validates its input the way the real adapters do: both the filesystem
 * and S3 stores resolve a key against a prefix, so an empty key is a bug the
 * double must refuse rather than quietly serve. A double more permissive than
 * the adapter it stands for is a double that lies.
 */
class CannedCorrectionStore {
  readonly keysRead: string[] = [];

  constructor(private readonly bytesByKey: ReadonlyMap<string, string>) {}

  async getCorrection(key: string): Promise<string | null> {
    assert.equal(typeof key, "string", "a store is never asked for a non-key");
    assert.notEqual(key, "", "a store is never asked for an empty key");
    this.keysRead.push(key);
    return this.bytesByKey.get(key) ?? null;
  }
}

/** A store whose read fails outright, the way a permission or network fault fails. */
class UnreachableCorrectionStore {
  async getCorrection(_key: string): Promise<string | null> {
    throw new Error("the bucket refused the read");
  }
}

function storeHolding(bytes: string | null): CannedCorrectionStore {
  const held = new Map<string, string>();
  if (bytes !== null) held.set(currentCorrectionKey(SPOT_ID), bytes);
  return new CannedCorrectionStore(held);
}

/** Enough paired mornings, from enough people, that the emitter writes a full record. */
function pairedMornings(count: number, reporters: number): SpotInputs {
  const observations: ObservationRow[] = [];
  const predictions: PredictionRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const observedAt = new Date("2026-07-01T18:41:00Z");
    observedAt.setUTCDate(observedAt.getUTCDate() + index);
    const observedDate = observedAt.toISOString().slice(0, 10);

    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_seen_${index % reporters}`,
      observed_at: observedAt.toISOString(),
      size_band: "chest_head",
      quality: "good",
      predicted: { score_q: 78 },
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.9 + (index % 3) * 0.05,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return { spotId: SPOT_ID, observations, predictions };
}

/** The bytes the shipped nightly fit would leave at this spot's current key. */
function shippedCorrectionBytes(): string {
  const records = buildCorrectionRecords(
    [pairedMornings(18, 6)],
    new FixedClock(),
  );
  const record = records.get(SPOT_ID);
  assert.ok(record, "test bug: the emitter wrote no record for the fixture spot");
  assert.ok(
    record.score_delta,
    "test bug: the fixture must produce a score move for the units pin to have anything to refuse",
  );
  return JSON.stringify(record);
}

async function readCorrectionFrom(
  store: { getCorrection(key: string): Promise<string | null> },
): Promise<CorrectionLoadReport> {
  return loadStoredCorrection({ store, key: currentCorrectionKey(SPOT_ID) });
}

// ---------- oracles ----------

function assertReadAsAbsentAndSaysWhy(
  report: CorrectionLoadReport,
  mustName: RegExp,
): void {
  assert.equal(
    report.record,
    null,
    "a file the reader cannot make sense of must yield no correction at all, never a partly-trusted one",
  );
  assert.equal(
    report.outcome,
    "rejected-as-absent",
    "a file the reader cannot make sense of must be reported as refused, not silently as an absent file",
  );
  assert.ok(
    report.events.length > 0,
    "a refusal with no event is indistinguishable from a bug: the reader must say why",
  );
  const said = report.events
    .map((event) => `${event.type} ${event.detail ?? ""}`)
    .join(" | ");
  assert.match(
    said,
    mustName,
    `the refusal must name what it found; it said ${said}`,
  );
}

function assertLoadedIntact(report: CorrectionLoadReport, bytes: string): void {
  assert.equal(
    report.outcome,
    "loaded",
    "a well-formed record written by the shipped emitter must load",
  );
  assert.deepEqual(
    report.record,
    JSON.parse(bytes),
    "a well-formed record must load intact: schema, clamp limits, per-source height keys and score move, unchanged",
  );
}

function assertMissingFileIsAbsentNotRefused(
  report: CorrectionLoadReport,
): void {
  assert.equal(
    report.record,
    null,
    "no file at the key means no correction to apply",
  );
  assert.equal(
    report.outcome,
    "absent",
    "no file is the launch state, not a refusal: reporting it as refused would accuse a healthy product of a fault",
  );
}

describe("02-01 acceptance: an unreadable correction file is read as absent, and the reader says why", () => {
  it("refuses bytes that are not a record, names the problem, and never throws", async () => {
    const report = await readCorrectionFrom(
      storeHolding('{"spot_id": "playa-venao", schema'),
    );

    assertReadAsAbsentAndSaysWhy(report, /unreadable/i);
    assert.throws(
      () =>
        assertReadAsAbsentAndSaysWhy(
          { ...report, outcome: "absent" },
          /unreadable/i,
        ),
      /reported as refused/,
      "the oracle must reject a reader that files a corrupt file under the same outcome as a missing one",
    );
    assert.throws(
      () => assertReadAsAbsentAndSaysWhy({ ...report, events: [] }, /unreadable/i),
      /must say why/,
      "the oracle must reject a silent refusal",
    );
  });

  it("refuses a well-formed record whose score move is stated in a foreign unit, by name", async () => {
    const shipped = JSON.parse(shippedCorrectionBytes()) as {
      score_delta: { units: string };
    };
    const foreignUnit = "percent";
    const report = await readCorrectionFrom(
      storeHolding(
        JSON.stringify({
          ...shipped,
          score_delta: { ...shipped.score_delta, units: foreignUnit },
        }),
      ),
    );

    assertReadAsAbsentAndSaysWhy(report, new RegExp(foreignUnit));
    assert.throws(
      () =>
        assertReadAsAbsentAndSaysWhy(
          {
            ...report,
            events: [
              {
                type: "learning.correction.foreign_score_unit",
                detail: "the score move must be stated in display_points",
              },
            ],
          },
          new RegExp(foreignUnit),
        ),
      /must name what it found/,
      "the oracle must reject a refusal that only restates the unit it wanted instead of naming the one it found",
    );
  });

  it("survives a store whose read fails outright, reporting it rather than throwing", async () => {
    const report = await readCorrectionFrom(new UnreachableCorrectionStore());

    assertReadAsAbsentAndSaysWhy(report, /refused the read/);
  });

  it("loads a record the shipped emitter actually wrote, intact", async () => {
    const bytes = shippedCorrectionBytes();
    const store = storeHolding(bytes);

    const report = await readCorrectionFrom(store);

    assertLoadedIntact(report, bytes);
    assert.deepEqual(
      store.keysRead,
      [currentCorrectionKey(SPOT_ID)],
      "the reader must read the spot's own current key, once",
    );
    assert.throws(
      () =>
        assertLoadedIntact(
          { ...report, record: null },
          bytes,
        ),
      /must load/,
      "the oracle must reject a reader that drops a record the emitter wrote",
    );
  });

  it("reports a key with no file as absent, never as a refusal", async () => {
    const report = await readCorrectionFrom(storeHolding(null));

    assertMissingFileIsAbsentNotRefused(report);
    assert.throws(
      () =>
        assertMissingFileIsAbsentNotRefused({
          ...report,
          outcome: "rejected-as-absent",
        }),
      /not a refusal/,
      "the oracle must reject a reader that accuses a healthy launch state of a fault",
    );
  });

  it("constructs no applied state, so the shipped-source examination stays clean", async () => {
    const report = await evaluateLearningDeclarations({
      root: SHIPPED_SOURCE_ROOT,
    });

    assert.deepEqual(
      report.applied_marking_sites.filter((site) =>
        site.endsWith(READER_MODULE),
      ),
      [],
      "the reader parses a verdict and passes it on; only the gate may ever construct the applied state",
    );
    assert.deepEqual(
      report.violations,
      [],
      "adding the reader to the shipped tree must leave the whole-source safety examination clean",
    );
  });
});
