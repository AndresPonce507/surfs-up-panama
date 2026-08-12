// Accepted roadmap 01-16: “Shipped trust settings drop nobody”.
// The pre-authored scenario translated to the repository's Vitest acceptance
// harness. The driving port is the nightly fit; the observable is the pair of
// counts inside the stored correction record.
//
// The claim is an absence: at the shipped config
// {min_credential_age_days: 0, min_prior_reports: 0, min_prior_spots: 2} the
// eligibility predicate reduces to age >= 0 AND priors >= 0, both true by
// construction, so all 22 mornings and all 7 people count -- including the
// reporter whose credential was minted the same morning they reported.
//
// AN UNFIRED GATE IS NOT EVIDENCE. This step proves only that a predicate
// which always returns true was called; 01-17 immediately follows and watches
// the same predicate actually drop somebody.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";
import { SHIPPED_TRUST_GATE } from "../../../src/learning/trust";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const MORNINGS = 22;
const REPORTERS = 7;

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

/**
 * The accepted fixture's arithmetic, checkable by hand. Twenty-two mornings
 * cycle seven devices, so indices 0, 7, 14 and 21 belong to the first
 * reporter. That reporter's credential is minted at 05:00 on the morning they
 * reported and the report is received at 18:44 the same day -- about 0.57
 * days of standing. Every other credential was issued 2026-01-04, months
 * before these July mornings.
 */
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

type GatedKey = { b: number; se: number; n: number; reporters: number };

async function storedRecordUnder(
  trustGate: typeof SHIPPED_TRUST_GATE | undefined,
): Promise<string> {
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

  await runLearningFitOnce(
    trustGate === undefined
      ? { store, clock: new FixedClock() }
      : { store, clock: new FixedClock(), trustGate },
  );
  const stored = await store.get(
    `learned/corrections/v1/current/${SPOT_ID}.json`,
  );
  assert.ok(stored, "the fit must persist the counts it actually weighed");
  return stored;
}

function heightKeyOf(body: string): GatedKey {
  const record = JSON.parse(body) as {
    bias: { swell_h_m: { per_source: Record<string, Record<string, GatedKey>> } };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the height difference must stay keyed to source and lead");
  return key;
}

function assertShippedTrustDropsNobody(
  atShippedConfig: string,
  withNoTrustSettingsAtAll: string,
): void {
  const key = heightKeyOf(atShippedConfig);
  assert.equal(
    key.n,
    MORNINGS,
    "at the shipped trust settings every morning must still count, the same-morning credential included",
  );
  assert.equal(
    key.reporters,
    REPORTERS,
    "at the shipped trust settings every person must still count, the same-morning credential included",
  );
  assert.equal(
    atShippedConfig,
    withNoTrustSettingsAtAll,
    "every stored byte must be identical to the same computation with no trust settings at all",
  );
}

describe("01-16 acceptance: the shipped trust settings drop nobody", () => {
  it("counts all 22 mornings and all 7 people, bit-identically to an ungated computation", async () => {
    const atShippedConfig = await storedRecordUnder(SHIPPED_TRUST_GATE);
    // Every threshold at zero IS "no trust settings at all": no age is
    // required and no prior report is required, so nothing can be excluded.
    const withNoTrustSettingsAtAll = await storedRecordUnder({
      min_credential_age_days: 0,
      min_prior_reports: 0,
      min_prior_spots: 0,
    });
    const byDefault = await storedRecordUnder(undefined);

    assertShippedTrustDropsNobody(atShippedConfig, withNoTrustSettingsAtAll);
    assert.equal(
      byDefault,
      atShippedConfig,
      "a fit handed no trust gate must behave exactly as the shipped config does",
    );

    assert.throws(
      () =>
        assertShippedTrustDropsNobody(
          atShippedConfig.replace(`"n":${MORNINGS}`, `"n":${MORNINGS - 4}`),
          withNoTrustSettingsAtAll,
        ),
      /every morning must still count/,
      "the acceptance oracle must reject a controlled mutation that drops the fresh credential's mornings",
    );
    assert.throws(
      () =>
        assertShippedTrustDropsNobody(
          atShippedConfig,
          withNoTrustSettingsAtAll.replace(
            `"reporters":${REPORTERS}`,
            `"reporters":${REPORTERS - 1}`,
          ),
        ),
      /identical to the same computation with no trust settings/,
      "the acceptance oracle must reject a controlled divergence from the ungated computation",
    );
  });
});
