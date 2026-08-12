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
 * may CHARGE a reporter for being new.
 *
 * Passing `false` puts the same morning, the same band, the same day, in the
 * hands of a reporter the fit has seen twelve mornings from. Nothing else moves.
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
  // AMENDED 2026-08-12 BY 04-05, cross-slice by explicit authorisation (see
  // that step's contract). This example belongs to 04-03.
  //
  // WHAT THE OLD ORACLE ASSUMED: that the same morning stores the same number
  // whoever reported it, byte for byte, because nothing anywhere may notice
  // how new a reporter is.
  //
  // WHY IT WAS WRONG, and this is the one of the five where the CLAIM had to be
  // re-read rather than the arithmetic re-derived. 06 section 5.2's table
  // treats the two reporters differently on purpose: at n_r of 0 to 1 a
  // report "enters near face value", and by n_r of 16 the person's habit is
  // "mostly subtracted". No implementation of the per-reporter offset can make
  // a stranger's morning and a familiar face's morning store the same number,
  // so an equality here was a claim about the absence of a stage, not about
  // newcomers.
  //
  // WHAT GDP-10 ACTUALLY PROTECTS is the WEIGHT: a newcomer's voice must not be
  // discounted for being new. 04-03's own unit property holds that directly and
  // independently of any of this ("a reporter nobody has ever co-observed keeps
  // a full voice", proven against a loudly disagreeing community). What this
  // acceptance example can add, and what the equality was standing in for, is
  // the DIRECTION -- and the direction is measurable, unambiguous, and the
  // right way round.
  //
  // A stranger's morning moves the stored difference 0.1533 from where its
  // absence leaves it. The identical morning from a familiar face moves it
  // 0.0947. The stranger is heard MORE, by a factor of 1.62, and the reason is
  // not a bonus for being new: it is that the familiar face has a measured
  // habit and the fit subtracts it, while the stranger has one report, a shrink
  // of 1/(1+4), and their claim enters near face value. The asymmetry runs
  // against the familiar face, which is the only direction GDP-10 and the Sybil
  // argument care about. A discount for being new would show up here as the
  // stranger moving it LESS, and that is what this file now forbids.
  it("never lets a stranger's morning count for less than the same morning from a familiar face", async () => {
    const fromAStranger = agreeingCommunity(true);
    const fromAFamiliarFace = agreeingCommunity(false);
    const withoutThatMorning = reportedMornings(false);

    const stranger = await storedKeyFor(fromAStranger.observations, fromAStranger.predictions);
    const familiar = await storedKeyFor(
      fromAFamiliarFace.observations,
      fromAFamiliarFace.predictions,
    );
    const absent = await storedKeyFor(
      withoutThatMorning.observations,
      withoutThatMorning.predictions,
    );

    // The morning is COUNTED identically either way. Nothing about who reported
    // it changes whether it is evidence, which is the half of the guard that is
    // still an exact equality and always will be.
    assert.equal(
      stranger.n,
      familiar.n,
      `the morning counted ${stranger.n} times from a stranger and ${familiar.n} from a familiar face: a newcomer's report must be evidence on exactly the same terms as anybody's`,
    );
    // A stranger IS one more person, and the distinct-reporter count says so.
    // That is not a discount, it is the count being right: G2 gates on how many
    // different people have been out, and a newcomer adds one.
    assert.equal(
      stranger.reporters,
      familiar.reporters + 1,
      `the morning left ${stranger.reporters} distinct reporters from a stranger and ${familiar.reporters} from a familiar face: a newcomer must add exactly one to the count G2 gates on, no more and no less`,
    );

    const aStrangerMovedIt = Math.abs(stranger.b - absent.b);
    const aFamiliarFaceMovedIt = Math.abs(familiar.b - absent.b);

    assert.ok(
      aStrangerMovedIt > 0,
      `a stranger's first morning left the stored difference exactly where its absence leaves it: that is a silent ban, and 06 section 6.2 step 4 forbids one`,
    );
    assert.ok(
      aStrangerMovedIt >= aFamiliarFaceMovedIt,
      `a stranger's morning moved the stored difference ${aStrangerMovedIt} and the same morning from a familiar face moved it ${aFamiliarFaceMovedIt}. Being new bought a quieter voice, which is the newcomer discount GDP-10 forbids: it taxes the honest early community exactly when data is scarcest, and a Sybil attacker mints identities faster than any discount decays.`,
    );

    // And the mechanism behind the gap, so a future reader can tell this apart
    // from the fit having simply stopped distinguishing them. The familiar
    // face's habit is measured over thirteen reports and mostly subtracted; the
    // stranger's single report is shrunk to a fifth and enters near face value.
    assert.ok(
      aStrangerMovedIt > aFamiliarFaceMovedIt,
      `a stranger's morning and a familiar face's moved the stored difference identically (${aStrangerMovedIt}). That is not the newcomer discount this file guards against, but it does mean the per-reporter offset has stopped distinguishing a measured habit from an unmeasured one, and 06 section 5.2's whole table with it.`,
    );
  });
});
