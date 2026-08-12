// Accepted roadmap 04-03: "Concordance down-weights chronic disagreement,
// never bans", and its guard "A newcomer's first morning enters at full voice".
//
// 06-learning-layer.md section 6.2 step 3: w_r = clip(tau_w / (tau_w + D_r),
// 0.2, 1.0) with tau_w = 4, where D_r is the reporter's mean squared
// disagreement with the co-observed spot-day medians, in units of sigma_eff^2.
// Research 09 section 13.5c, verbatim: "Trust weight from agreement history.
// Weight a user by how well their past reports agreed with the consensus of
// other reporters at the same spot/time. Down-weight, never ban."
//
// THE FLOOR OF 0.2 IS DECISION 24'S SPIRIT MADE ARITHMETIC. A floor of zero
// would be a shadow ban. It is also unreachable from an honest fixture here,
// and that is a CONSEQUENCE this step demonstrates rather than assumes: the
// day fence runs first, so a chronic disagreer's residual is already clipped
// to two band widths before their disagreement is measured, which bounds D_r.
// The exact floor therefore lands as a unit property over generated worlds;
// this file pins the corridor a real liar can actually reach.
//
// THE ORACLE IS A MOVEMENT RATIO between two runs and one hand-computed
// counterfactual. Full trust is what the fit would store if concordance did
// not exist -- and because a weighted mean is unchanged when every weight is
// scaled by the same number, "every reporter at full trust" is just the
// precision-weighted mean over the same post-fence values, which the test
// computes from two declared constants and the fixture's own residuals.

import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { SIGMA_EFF } from "../../../src/learning/constants";
import { runLearningFitOnce } from "../../../src/learning/fit";

const SPOT_ID = "playa-venao";
const SOURCE = "ncep_gfswave016";
const LEAD_BUCKET = "lead_24_48";

/** Head to overhead, 1.6 m to 2.4 m: what the honest reporters saw every morning. */
const HEAD_OVERHEAD_MID_M = 2.0;
const HEAD_OVERHEAD_WIDTH_M = 0.8;
/** Ankle to knee, 0.1 m to 0.4 m (midpoint 0.25 m): what one reporter claims every single morning. */
const ANKLE_KNEE_WIDTH_M = 0.3;
/** 06 section 6.2 step 2: the day fence, in widths of the day median's band. */
const FENCE_M = 2 * HEAD_OVERHEAD_WIDTH_M;

/** 06 section 6.2 step 3's corridor, read off criterion 2 of the accepted step. */
const AT_MOST_OF_FULL_TRUST = 0.6;
const AT_LEAST_OF_FULL_TRUST = 0.05;

const CO_OBSERVED_MORNINGS = 8;
const SOLO_MORNINGS = 4;
const HONEST_REPORTERS = 6;
const RAW_DIFFERENCE_M = -0.22;
const SAMPLE_SPREAD_M = 0.42;

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

/** w_precision = 1 / (sigma_eff^2 + width(band)^2 / 12), 06 section 6.1. */
function precisionWeightOf(bandWidthM: number): number {
  return 1 / (SIGMA_EFF.height.value ** 2 + bandWidthM ** 2 / 12);
}

function dayOf(index: number): string {
  return `2026-07-${String(index + 1).padStart(2, "0")}`;
}

function residualOf(index: number): number {
  return RAW_DIFFERENCE_M + (index % 2 === 0 ? SAMPLE_SPREAD_M : -SAMPLE_SPREAD_M);
}

type Report = { device: string; band: string; day: string };

/**
 * Twelve mornings at one spot. On the first eight, two honest people report
 * head-to-overhead and one person claims ankle-to-knee -- three device-samples,
 * so the day has a middle and a fence. The last four are ordinary single
 * reports, there to carry the morning count.
 */
function reportedMornings(withTheChronicReporter: boolean): {
  observations: string;
  predictions: string;
  honestResiduals: number[];
  chronicResiduals: number[];
} {
  const reports: Report[] = [];
  const honestResiduals: number[] = [];
  const chronicResiduals: number[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < CO_OBSERVED_MORNINGS + SOLO_MORNINGS; index += 1) {
    const day = dayOf(index);
    const watched = index < CO_OBSERVED_MORNINGS;

    reports.push({ device: `d_honest_${index % HONEST_REPORTERS}`, band: "head_overhead", day });
    honestResiduals.push(residualOf(index));
    if (watched) {
      reports.push({
        device: `d_honest_${(index + 1) % HONEST_REPORTERS}`,
        band: "head_overhead",
        day,
      });
      honestResiduals.push(residualOf(index));
    }
    if (watched && withTheChronicReporter) {
      reports.push({ device: "d_chronic", band: "ankle_knee", day });
      // The fence clips the claim before anyone measures how far off it was.
      chronicResiduals.push(residualOf(index) + FENCE_M);
    }

    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${day}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: HEAD_OVERHEAD_MID_M + residualOf(index),
      swell_t_s: 10,
      land_masked: false,
    });
  }

  return {
    observations: reports
      .map((report) =>
        JSON.stringify({
          spot_id: SPOT_ID,
          device_id: report.device,
          observed_at: `${report.day}T18:41:00Z`,
          size_band: report.band,
        }),
      )
      .join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
    honestResiduals,
    chronicResiduals,
  };
}

type StoredHeightKey = { b: number; n: number; reporters: number; applied: boolean };

async function storedKeyFor(observations: string, predictions: string): Promise<StoredHeightKey> {
  const store = new MemoryLearningStore();
  await store.put("log/observations/v1/dt=2026-07-01/reports.jsonl", observations);
  await store.put(
    "predictions/v1/dt=2026-06-30/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz",
    predictions,
  );
  await runLearningFitOnce({ store, clock: new FixedClock() });

  const body = await store.get(`learned/corrections/v1/current/${SPOT_ID}.json`);
  assert.ok(body, "the run must have stored a correction record for the spot");
  const record = JSON.parse(body) as {
    bias: { swell_h_m: { per_source: Record<string, Record<string, StoredHeightKey>> } };
  };
  const key = record.bias.swell_h_m.per_source[SOURCE]?.[LEAD_BUCKET];
  assert.ok(key, "the difference must stay keyed to its source and lead bucket");
  return key;
}

/**
 * What the fit would store if concordance did not exist. A weighted mean does
 * not change when every weight is scaled by one number, so "everybody at full
 * trust" is simply the precision-weighted mean over the same post-fence
 * residuals -- no concordance term at all.
 */
function differenceAtFullTrust(honest: readonly number[], chronic: readonly number[]): number {
  const honestWeight = precisionWeightOf(HEAD_OVERHEAD_WIDTH_M);
  const chronicWeight = precisionWeightOf(ANKLE_KNEE_WIDTH_M);
  const total =
    honest.reduce((sum, value) => sum + honestWeight * value, 0) +
    chronic.reduce((sum, value) => sum + chronicWeight * value, 0);
  return total / (honest.length * honestWeight + chronic.length * chronicWeight);
}

describe("04-03 acceptance: chronic disagreement is down-weighted, never silenced", () => {
  it("lets a reporter who disagrees every morning move the number, but far less than full trust would", async () => {
    const withLiar = reportedMornings(true);
    const withoutLiar = reportedMornings(false);

    const heard = await storedKeyFor(withLiar.observations, withLiar.predictions);
    const unheard = await storedKeyFor(withoutLiar.observations, withoutLiar.predictions);
    const believed = differenceAtFullTrust(withLiar.honestResiduals, withLiar.chronicResiduals);

    assert.ok(
      heard.b !== unheard.b,
      `the chronic reporter left the stored difference at ${unheard.b}, exactly where their absence leaves it: a down-weight must never become a ban`,
    );
    assert.ok(
      (heard.b - unheard.b) * (believed - unheard.b) > 0 &&
        Math.abs(heard.b - unheard.b) < Math.abs(believed - unheard.b),
      `the chronic reporter moved the stored difference to ${heard.b}, which is not between the ${unheard.b} their absence leaves and the ${believed} believing them outright would reach`,
    );

    const shareOfFullTrust = Math.abs(heard.b - unheard.b) / Math.abs(believed - unheard.b);
    assert.ok(
      shareOfFullTrust < AT_MOST_OF_FULL_TRUST,
      `a reporter disagreeing every single morning still moved the stored difference ${shareOfFullTrust} of the way a believed reporter moves it, which is not under ${AT_MOST_OF_FULL_TRUST}`,
    );
    assert.ok(
      shareOfFullTrust > AT_LEAST_OF_FULL_TRUST,
      `a reporter disagreeing every morning moved the stored difference only ${shareOfFullTrust} of full trust, at or under the ${AT_LEAST_OF_FULL_TRUST} floor: that is a silencing, not a down-weight`,
    );
  });
});

/**
 * The guard, 06 section 6.2 step 4 and GDP-10. A newcomer discount would tax
 * the honest early community exactly when data is scarcest, and a Sybil
 * attacker mints identities faster than any discount decays. Nothing anywhere
 * may pay attention to how new a reporter is.
 */
function agreeingCommunity(theLastMorningIsANewcomer: boolean): {
  observations: string;
  predictions: string;
} {
  const reports: Report[] = [];
  const predictions: object[] = [];

  for (let index = 0; index < 12; index += 1) {
    const day = dayOf(index);
    reports.push({ device: `d_known_${index % HONEST_REPORTERS}`, band: "head_overhead", day });
    reports.push({
      device: `d_known_${(index + 1) % HONEST_REPORTERS}`,
      band: "head_overhead",
      day,
    });
    predictions.push({
      spot_id: SPOT_ID,
      source: SOURCE,
      valid_ts: `${day}T18:00:00Z`,
      lead_h: 36,
      swell_h_m: HEAD_OVERHEAD_MID_M + residualOf(index),
      swell_t_s: 10,
      land_masked: false,
    });
  }

  // One more morning, reported once, and seen differently from every other:
  // the weight it carries is the only thing that can move the stored number.
  const lastDay = dayOf(12);
  reports.push({
    device: theLastMorningIsANewcomer ? "d_first_morning" : "d_known_0",
    band: "ankle_knee",
    day: lastDay,
  });
  predictions.push({
    spot_id: SPOT_ID,
    source: SOURCE,
    valid_ts: `${lastDay}T18:00:00Z`,
    lead_h: 36,
    swell_h_m: HEAD_OVERHEAD_MID_M + residualOf(12),
    swell_t_s: 10,
    land_masked: false,
  });

  return {
    observations: reports
      .map((report) =>
        JSON.stringify({
          spot_id: SPOT_ID,
          device_id: report.device,
          observed_at: `${report.day}T18:41:00Z`,
          size_band: report.band,
        }),
      )
      .join("\n"),
    predictions: predictions.map((row) => JSON.stringify(row)).join("\n"),
  };
}

describe("04-03 acceptance: a newcomer's first morning enters at full voice", () => {
  it("weighs a stranger's morning exactly as it weighs the same morning from a familiar reporter", async () => {
    const fromAStranger = agreeingCommunity(true);
    const fromAFamiliarFace = agreeingCommunity(false);

    const stranger = await storedKeyFor(fromAStranger.observations, fromAStranger.predictions);
    const familiar = await storedKeyFor(
      fromAFamiliarFace.observations,
      fromAFamiliarFace.predictions,
    );

    assert.equal(
      stranger.b,
      familiar.b,
      `the same morning stored ${stranger.b} reported by a stranger and ${familiar.b} reported by a familiar face: some part of this fit is charging people for being new`,
    );
  });
});
