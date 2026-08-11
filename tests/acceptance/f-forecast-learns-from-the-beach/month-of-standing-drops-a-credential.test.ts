// Accepted roadmap 01-17: “A month of standing drops this morning's
// credential”. The pre-authored scenario translated to the repository's Vitest
// acceptance harness. The driving port is the nightly fit; the observable is
// the counts and the stored error inside the correction record.
//
// AN UNFIRED GATE IS NOT EVIDENCE (06-learning-layer.md section 7, clause
// check:unfired-is-not-evidence). 01-16 proved only that a predicate which
// always returns true was called. This file watches the same predicate
// actually drop somebody, and watches it not drop them at the shipped
// config, in the same run.
//
// THE FIXTURE'S ARITHMETIC, checkable by hand. Twenty-two mornings cycle
// seven devices, so indices 0, 7, 14 and 21 belong to the first reporter.
// That reporter's credential is minted at 05:00 on the morning they reported
// and the report is received at 18:44 the same day: about 0.57 days against
// the configured 30, so exactly four mornings drop and the stored record must
// carry n = 18 and reporters = 6.
//
// THE CORRECTION IS STILL WRITTEN. A refusal that leaves no trace is
// indistinguishable from a fit that never ran, so the file must record the
// counts it actually weighed.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  PHYSICAL_NOISE_FLOOR_MULTIPLIER,
  SIGMA_EFF,
} from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";
import { G2_MIN_REPORTERS } from "../../../src/learning/gates";
import { SHIPPED_TRUST_GATE, type TrustGateConfig } from "../../../src/learning/trust";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const MORNINGS = 22;
const REPORTERS = 7;
const MORNINGS_ON_THE_FRESH_CREDENTIAL = 4;
const SURVIVING_MORNINGS = MORNINGS - MORNINGS_ON_THE_FRESH_CREDENTIAL;
const SURVIVING_REPORTERS = REPORTERS - 1;
const A_MONTH_OF_STANDING = 30;

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

function twentyTwoMorningsOneOfThemFreshlyCredentialled(): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < MORNINGS; index += 1) {
    const observedDate = `2026-07-${String(index + 1).padStart(2, "0")}`;
    const reporterIndex = index % REPORTERS;
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_trust_${reporterIndex}`,
      observed_at: `${observedDate}T18:41:00Z`,
      size_band: "chest_head",
      received_at: `${observedDate}T18:44:00Z`,
      credential_issued_at:
        reporterIndex === 0
          ? `${observedDate}T05:00:00Z`
          : "2026-01-04T09:00:00Z",
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${observedDate}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: 1.13,
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: observations.map((row) => JSON.stringify(row)).join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

type GatedKey = {
  b: number;
  se: number;
  n: number;
  reporters: number;
  applied: boolean;
};

async function heightKeyUnder(trustGate: TrustGateConfig): Promise<GatedKey> {
  const store = new MemoryLearningStore();
  const fixture = twentyTwoMorningsOneOfThemFreshlyCredentialled();
  await store.put(
    "log/observations/v1/dt=2026-07-01/reports.jsonl",
    fixture.observations,
  );
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    fixture.predictions,
  );

  await runLearningFitOnce({ store, clock: new FixedClock(), trustGate });
  const stored = await store.get(
    `learned/corrections/v1/current/${SPOT_ID}.json`,
  );
  // A refusal that leaves no trace is indistinguishable from a fit that never
  // ran, so the file must exist however many samples the gate removed.
  assert.ok(
    stored,
    "the fit must still write the correction, recording the counts it actually weighed",
  );
  const record = JSON.parse(stored) as {
    bias: { swell_h_m: { per_source: Record<string, Record<string, GatedKey>> } };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the height difference must stay keyed to source and lead");
  return key;
}

/** The physical floor at whatever sample count the RECORD reports, never at the fixture's raw count. */
function physicalFloorAt(sampleCount: number): number {
  return (
    (PHYSICAL_NOISE_FLOOR_MULTIPLIER * SIGMA_EFF.height.value) /
    Math.sqrt(sampleCount)
  );
}

function assertAMonthOfStandingDropsThisMorningsCredential(
  gateNotFiring: GatedKey,
  gateFiring: GatedKey,
): void {
  assert.equal(
    gateNotFiring.n,
    MORNINGS,
    "at the shipped settings the same-morning credential must still count",
  );
  assert.equal(
    gateNotFiring.reporters,
    REPORTERS,
    "at the shipped settings every person must still count",
  );
  assert.equal(
    gateFiring.n,
    SURVIVING_MORNINGS,
    "asking for a month of standing must remove the four mornings reported on the same-morning credential",
  );
  assert.equal(
    gateFiring.reporters,
    SURVIVING_REPORTERS,
    "only six people may count once the same-morning credential is excluded",
  );
  assert.ok(
    gateFiring.reporters >= G2_MIN_REPORTERS,
    "six people still clears the five that publication requires, so the drop is observable in the counts rather than in a refusal",
  );
  // The count inside the stored error's floor must be the POST-eligibility
  // one. Read it back off the record rather than from the fixture that
  // produced it: if the floor were computed over the raw count while n was
  // reported post-eligibility, the two would silently disagree.
  assert.equal(
    gateFiring.se,
    physicalFloorAt(gateFiring.n),
    "the stored error's floor must be computed at the count the record itself reports",
  );
  assert.notEqual(
    gateFiring.se,
    physicalFloorAt(MORNINGS),
    "the floor must have moved off the raw 22-morning count, or ineligible samples never left the error",
  );
}

describe("01-17 acceptance: a trust setting that asks for a month of standing drops this morning's credential", () => {
  it("drops exactly the four mornings on the fresh credential, from the counts and from the stored error's floor", async () => {
    const gateNotFiring = await heightKeyUnder(SHIPPED_TRUST_GATE);
    const gateFiring = await heightKeyUnder({
      ...SHIPPED_TRUST_GATE,
      min_credential_age_days: A_MONTH_OF_STANDING,
    });

    assertAMonthOfStandingDropsThisMorningsCredential(gateNotFiring, gateFiring);

    assert.throws(
      () =>
        assertAMonthOfStandingDropsThisMorningsCredential(gateNotFiring, {
          ...gateFiring,
          n: MORNINGS,
        }),
      /must remove the four mornings/,
      "the oracle must reject a run whose morning count never felt the gate",
    );
    assert.throws(
      () =>
        assertAMonthOfStandingDropsThisMorningsCredential(gateNotFiring, {
          ...gateFiring,
          reporters: REPORTERS,
        }),
      /only six people may count/,
      "the oracle must reject a run whose distinctness never felt the gate",
    );
    assert.throws(
      () =>
        assertAMonthOfStandingDropsThisMorningsCredential(gateNotFiring, {
          ...gateFiring,
          se: physicalFloorAt(MORNINGS),
        }),
      /at the count the record itself reports/,
      "the oracle must reject a stored error still floored at the raw morning count",
    );
  });
});
