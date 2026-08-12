// Accepted roadmap 04-06: "The incident file excises reporters by recompute".
//
// 06-learning-layer.md section 6.4, and research 15 section 3's recovery
// story: data poisoning is recoverable in an afternoon BY RECOMPUTE, provided
// some down-weight mechanism exists. This is that mechanism, and it is the
// auditable one -- a git-versioned file, human-edited by pull request, absent
// by default -- rather than a moderation queue, which decision 24 forbids.
//
// It adjudicates REPORTERS after a named incident, never individual reports.
// That is the whole reason it does not violate decision 24: nobody reviews a
// morning and decides whether it was true. A campaign is excised by name and
// the fit is recomputed from the logs that were always there.
//
// THE ORACLE IS BYTE IDENTITY, twice over. A reporter at weight zero must
// leave the fit storing exactly what it stores when their mornings were never
// written at all -- which is a much stronger claim than "their samples were
// weighted zero", because a zero-weight sample still counts toward n, toward
// the distinct-reporter count, toward the physical noise floor's n and toward
// the day medians. And an absent file must leave every stored byte exactly
// where it is today, because the shipped default is that the file is absent.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";
const CHEST_HEAD_MID_M = 1.35;
const REPORTER_WEIGHTS_KEY = "learned/overrides/v1/reporter-weights.json";

const MORNINGS = 22;
const HONEST_REPORTERS = 7;
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;
/** The device the incident names. It reports its own mornings, wildly. */
const CAMPAIGN_DEVICE = "d_campaign";
const CAMPAIGN_MORNINGS = 6;
const TOLERANCE = 1e-12;

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

function dayOf(index: number): string {
  const day = new Date("2026-07-01T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + index);
  return day.toISOString().slice(0, 10);
}

function logsFor(theCampaignReported: boolean): {
  observations: string;
  predictions: string;
} {
  const observations: object[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < MORNINGS; index += 1) {
    const day = dayOf(index);
    const residual = RAW_DIFFERENCE_M + (index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M);
    observations.push({
      spot_id: SPOT_ID,
      device_id: `d_honest_${index % HONEST_REPORTERS}`,
      observed_at: `${day}T18:41:00Z`,
      size_band: "chest_head",
      quality: "good",
      predicted: { score_q: 82 },
    });
    // The campaign piles onto the first few mornings, alongside the honest
    // reports, which is what a coordinated push actually looks like.
    if (theCampaignReported && index < CAMPAIGN_MORNINGS) {
      observations.push({
        spot_id: SPOT_ID,
        device_id: CAMPAIGN_DEVICE,
        observed_at: `${day}T18:41:00Z`,
        size_band: "double_overhead_plus",
        quality: "epic",
        predicted: { score_q: 82 },
      });
    }
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${day}T18:00:00Z`,
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

type StoredHeightKey = { b: number; n: number; reporters: number };

async function storedFor(options: {
  theCampaignReported: boolean;
  incidentFile?: string;
}): Promise<{ body: string; key: StoredHeightKey }> {
  const store = new MemoryLearningStore();
  const logs = logsFor(options.theCampaignReported);
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", logs.observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    logs.predictions,
  );
  if (options.incidentFile !== undefined) {
    await store.put(REPORTER_WEIGHTS_KEY, options.incidentFile);
  }

  await runLearningFitOnce({ store, clock: new FixedClock() });

  const body = await store.get(`learned/corrections/v1/current/${SPOT_ID}.json`);
  assert.ok(body, "the run must have stored a correction record for the spot");
  const record = JSON.parse(body) as {
    bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the difference must stay keyed to its source and lead bucket");
  return { body, key };
}

describe("04-06 acceptance: a discovered campaign is excised by an incident file that names reporters", () => {
  it("stores exactly what it stores when the campaign's mornings were never written at all", async () => {
    const neverHappened = await storedFor({ theCampaignReported: false });
    const excised = await storedFor({
      theCampaignReported: true,
      incidentFile: JSON.stringify({ [CAMPAIGN_DEVICE]: 0 }),
    });
    const stillCounted = await storedFor({ theCampaignReported: true });

    assert.notEqual(
      stillCounted.body,
      neverHappened.body,
      "test bug: the campaign must move the stored numbers, or excising it proves nothing",
    );
    assert.equal(
      excised.key.n,
      neverHappened.key.n,
      `an excised reporter still left ${excised.key.n} mornings in the count against ${neverHappened.key.n}: weight zero has to come out of every gated count, not just out of the average`,
    );
    assert.equal(
      excised.key.reporters,
      neverHappened.key.reporters,
      "an excised reporter still counted toward the distinct-reporter gate",
    );
    assert.equal(
      excised.body,
      neverHappened.body,
      "a reporter at weight zero must vanish byte-identically to their mornings never being stored: anything less leaves their fingerprint in n, in the error floor or in a day's median",
    );
  });

  it("changes nothing at all when no incident file exists, and nothing when it names nobody", async () => {
    const noFile = await storedFor({ theCampaignReported: true });
    const emptyFile = await storedFor({
      theCampaignReported: true,
      incidentFile: JSON.stringify({}),
    });
    const unreadableFile = await storedFor({
      theCampaignReported: true,
      incidentFile: "{ this is not json",
    });

    assert.equal(
      emptyFile.body,
      noFile.body,
      "an incident file naming nobody must leave every stored byte where the shipped default leaves it",
    );
    assert.equal(
      unreadableFile.body,
      noFile.body,
      "an unreadable incident file must read as absent, never as an excuse to drop somebody: a file nobody can parse names nobody",
    );
  });

  it("down-weights a named reporter without excising them when the weight is not zero", async () => {
    const stillCounted = await storedFor({ theCampaignReported: true });
    const halved = await storedFor({
      theCampaignReported: true,
      incidentFile: JSON.stringify({ [CAMPAIGN_DEVICE]: 0.5 }),
    });
    const excised = await storedFor({
      theCampaignReported: true,
      incidentFile: JSON.stringify({ [CAMPAIGN_DEVICE]: 0 }),
    });

    assert.equal(
      halved.key.n,
      stillCounted.key.n,
      "a reporter who was down-weighted rather than excised is still there, so their mornings still count",
    );
    assert.ok(
      Math.abs(halved.key.b - stillCounted.key.b) > TOLERANCE,
      `a weight of half stored ${halved.key.b}, the same number full weight stores: the file's weights are being read as a yes-or-no`,
    );
    assert.ok(
      Math.abs(halved.key.b - excised.key.b) > TOLERANCE,
      `a weight of half stored ${halved.key.b}, the same number weight zero stores: half a voice is not a removal`,
    );
  });
});
