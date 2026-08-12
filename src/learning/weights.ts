// The weighing room, 06-learning-layer.md section 6: everything that decides
// how much a residual sample counts, before the estimator is allowed to
// average it. Section 6 is explicit that these are all MULTIPLICATIVE ON
// SAMPLES, and section 6.2 fixes their order; this module is where that order
// lives, so no caller has to remember it.
//
// Pure functions over a list of samples, in and out. Nothing here reads a
// store, a clock or a gate, and nothing here decides whether a correction may
// publish -- that is src/learning/gates.ts's alone.
//
// WHY THIS IS NOT PART OF src/learning/estimate.ts: that module is the general
// weighted-mean primitive, read by the height lane, the score lane and the
// gate's own error floor. It consumes a finished list of weighted values and
// never looks at who reported them or when. The weighing room does the
// opposite: it reads the sample's identity (its day, its device) and CHANGES
// THE LIST -- dropping repeats now, clipping and reweighting in later steps.
// Folding one into the other would make every reader of a weighted mean
// depend on fields the primitive deliberately cannot see.

import {
  SELECTION_WEIGHT_CAP,
  CONCORDANCE_PRIOR_OBSERVATIONS,
  CONCORDANCE_TAU,
  CONCORDANCE_WEIGHT_CEILING,
  CONCORDANCE_WEIGHT_FLOOR,
} from "./constants";
import type { ResidualSample } from "./residuals";

/**
 * 06 section 6.2 step 1: per (spot, day, device), collapse the samples to the
 * median sample. One person reporting five times in a session contributes
 * once. It is also the fix for the near-duplicate inflation research 09
 * section 13.4 gate 4 warns about: consecutive-hour reports of one swell are
 * one swell seen once, not several independent mornings, and counting them
 * separately inflates n and shrinks se on evidence that was never independent.
 *
 * The spot is already fixed by the caller -- this runs over one key's samples
 * -- so the session is (day, device) here.
 *
 * A sample whose day cannot be read is ITS OWN session, never merged with
 * another. Nothing about a report missing its timestamp says it came from the
 * same morning as the one before it, and quietly collapsing the two would
 * throw away evidence on a guess.
 */
export function collapseSessionsToMedian(
  samples: readonly ResidualSample[],
): ResidualSample[] {
  const bySession = new Map<string, ResidualSample[]>();
  const sessionsInOrder: string[] = [];

  samples.forEach((sample, index) => {
    const session = sessionKeyOf(sample, index);
    const alreadySeen = bySession.get(session);
    if (alreadySeen === undefined) {
      bySession.set(session, [sample]);
      sessionsInOrder.push(session);
      return;
    }
    alreadySeen.push(sample);
  });

  return sessionsInOrder.map((session) => medianSampleOf(bySession.get(session)!));
}

/**
 * 06 section 6.2 step 2, and research 09 section 13.5c's answer to gaming,
 * trolling and localism: per (spot, day), once three or more device-samples
 * exist, residuals are winsorized at two band widths either side of the
 * spot-day median. A claim past the fence is PULLED BACK TO IT, never dropped
 * -- the same "down-weight, never ban" line the rest of section 6.2 holds, and
 * the reason one loud morning does not cost the whole day.
 *
 * THIS RUNS AFTER THE SESSION COLLAPSE, so a day's samples are already one per
 * device and counting samples IS counting device-samples. Running it the other
 * way round would let somebody who pressed send three times become the
 * morning's median and fence the honest reporters instead.
 *
 * TWO BAND WIDTHS OF WHOSE BAND: the day median's own. A fence measured in the
 * clipped sample's band would let a wilder claim buy itself a wider fence.
 * When the median report named no band with two edges -- the open top band, or
 * a score residual, which was never an interval at all -- there is no width to
 * measure in, so the morning stands as reported rather than being fenced
 * against an invented number.
 *
 * Below three device-samples nothing is fenced: with two reports there is no
 * majority for anyone to be an outlier from, and 06 section 6.2 says so
 * outright. Shrinkage and the apply-time clamp are the backstop there.
 */
export function winsorizeAtDayFence(
  samples: readonly ResidualSample[],
): ResidualSample[] {
  const fenceByMorning = new Map<string, Fence | null>();
  for (const [morning, reported] of morningsIn(samples)) {
    fenceByMorning.set(morning, fenceFor(reported));
  }

  return samples.map((sample, index) => {
    const fence = fenceByMorning.get(morningKeyOf(sample, index)) ?? null;
    if (fence === null) return sample;
    return { ...sample, value: clip(sample.value, fence) };
  });
}

/** 06 section 6.2 step 2: three device-samples is where a morning has a middle worth trusting. */
const MIN_DEVICE_SAMPLES_TO_FENCE = 3;
/** 06 section 6.2 step 2: two band widths either side. */
const FENCE_BAND_WIDTHS = 2;

type Fence = { readonly middle: number; readonly reach: number };

function fenceFor(morning: readonly ResidualSample[]): Fence | null {
  if (morning.length < MIN_DEVICE_SAMPLES_TO_FENCE) return null;
  const middle = medianSampleOf(morning);
  if (middle.bandWidthM === null) return null;
  return { middle: middle.value, reach: FENCE_BAND_WIDTHS * middle.bandWidthM };
}

function clip(value: number, fence: Fence): number {
  return Math.min(
    Math.max(value, fence.middle - fence.reach),
    fence.middle + fence.reach,
  );
}

/** Every sample grouped by the morning it was reported on; an undated sample is a morning of its own. */
function morningsIn(
  samples: readonly ResidualSample[],
): Map<string, ResidualSample[]> {
  const byMorning = new Map<string, ResidualSample[]>();
  samples.forEach((sample, index) => {
    const morning = morningKeyOf(sample, index);
    const reported = byMorning.get(morning);
    if (reported === undefined) {
      byMorning.set(morning, [sample]);
      return;
    }
    reported.push(sample);
  });
  return byMorning;
}

function morningKeyOf(sample: ResidualSample, index: number): string {
  return sample.day === null ? ` undated ${index}` : sample.day;
}

/**
 * Same day, same device is one session. An unreadable day makes the sample a
 * session of its own.
 *
 * A plain space separates the two parts, and that is unambiguous rather than
 * lucky: a day is always the ten fixed characters of a calendar date, so the
 * separator always sits at the same offset and no pair of parts can spell
 * another pair's key. The undated form leads with the separator instead, which
 * no calendar date can, since every one of them starts with a digit.
 */
function sessionKeyOf(sample: ResidualSample, index: number): string {
  if (sample.day === null) return ` undated ${index}`;
  return `${sample.day} ${sample.device_id}`;
}

/**
 * The median SAMPLE, not the median value. What survives has to be a report
 * somebody actually made, because the later stages read its own band width and
 * its own precision weight off it; an interpolated midpoint between two
 * reports has neither. With an even count there is no single middle, so the
 * lower of the two is taken -- a fixed choice, so the same session always
 * collapses to the same byte.
 */
function medianSampleOf(session: readonly ResidualSample[]): ResidualSample {
  if (session.length === 1) return session[0]!;
  const byValue = [...session].sort((left, right) => left.value - right.value);
  return byValue[Math.floor((byValue.length - 1) / 2)]!;
}

/**
 * 06 section 6.2 step 3: `w_r = clip(tau_w / (tau_w + D_r), 0.2, 1.0)`, where
 * D_r is a reporter's mean squared disagreement with the co-observed spot-day
 * medians, in units of sigma_eff^2, shrunk toward the population mean when
 * co-observations are few. Research 09 section 13.5c is where it comes from,
 * and its wording settles two things 06 leaves open.
 *
 * FIRST, THE MEDIAN IS THE OTHER REPORTERS', NOT THE WHOLE MORNING'S. 09
 * section 13.5c says to weigh a reporter by "how well their past reports
 * agreed with the consensus of OTHER reporters at the same spot/time". Reading
 * it the other way is not merely looser, it is broken: on a two-report morning
 * the median IS one of the two reports, so one of the two would measure a
 * disagreement of zero with themselves, and the louder half of every pair
 * would go unmeasured.
 *
 * SECOND, DOWN-WEIGHT, NEVER BAN. The floor is 0.2 and the weight never
 * reaches zero, so no amount of disagreement removes a voice; only the human
 * incident file can do that, and it is a different input with a different
 * audit trail. The ceiling is 1.0, so agreeing with everybody buys a full
 * voice and never more.
 *
 * A REPORTER NOBODY HAS EVER REPORTED ALONGSIDE KEEPS A FULL VOICE (06 section
 * 6.2 step 4, GDP-10). There is no measurement of them to shrink, and handing
 * them the population's disagreement instead would be a newcomer discount:
 * a tax on the honest early community exactly when data is scarcest, and one
 * a Sybil attacker escapes anyway by minting a fresh identity.
 *
 * THIS RUNS AFTER THE DAY FENCE, so the disagreements it measures are already
 * clipped ones. That is deliberate and it has a visible consequence: a liar's
 * D_r is bounded by the fence, so the 0.2 floor cannot be reached by anyone
 * whose mornings had three witnesses. The floor is for the unwatched mornings,
 * and for a world the fixtures cannot reach.
 *
 * The argument is a list of KEYS -- each one spot's samples at one source and
 * one lead bucket, already collapsed and fenced. Disagreement is only
 * meaningful inside a key: two residuals at the same key on the same morning
 * differ by exactly what the two people reported, while two residuals at
 * different sources differ by two forecasts as well.
 */
export function concordanceWeightByReporter(
  keys: readonly (readonly ResidualSample[])[],
): Map<string, number> {
  const disagreements = new Map<string, number[]>();
  for (const key of keys) {
    for (const [, morning] of morningsIn(key)) {
      recordDisagreementsOn(morning, disagreements);
    }
  }

  const measured = [...disagreements].map(
    ([reporter, squared]) => [reporter, meanOf(squared)] as const,
  );
  const population = meanOf(measured.map(([, mean]) => mean));

  const weights = new Map<string, number>();
  for (const [reporter, ownMean] of measured) {
    const seen = disagreements.get(reporter)!.length;
    const ownShare = seen / (seen + CONCORDANCE_PRIOR_OBSERVATIONS);
    const shrunk = ownShare * ownMean + (1 - ownShare) * population;
    weights.set(reporter, clipToVoice(CONCORDANCE_TAU / (CONCORDANCE_TAU + shrunk)));
  }
  for (const key of keys) {
    for (const sample of key) {
      if (!weights.has(sample.reporter_key)) {
        weights.set(sample.reporter_key, CONCORDANCE_WEIGHT_CEILING);
      }
    }
  }
  return weights;
}

/** Every reporter on this morning, scored against the middle of what everybody ELSE saw. */
function recordDisagreementsOn(
  morning: readonly ResidualSample[],
  into: Map<string, number[]>,
): void {
  if (morning.length < 2) return;
  morning.forEach((sample, index) => {
    const others = morning.filter((_, other) => other !== index);
    const consensus = medianSampleOf(others).value;
    const offBy = (sample.value - consensus) / sample.sigmaEff;
    const seen = into.get(sample.reporter_key) ?? [];
    seen.push(offBy * offBy);
    into.set(sample.reporter_key, seen);
  });
}

function clipToVoice(weight: number): number {
  return Math.min(
    Math.max(weight, CONCORDANCE_WEIGHT_FLOOR),
    CONCORDANCE_WEIGHT_CEILING,
  );
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Every sample's weight multiplied by what its reporter's record has earned (06 section 6, all multiplicative). */
export function applyReporterWeights(
  samples: readonly ResidualSample[],
  byReporter: ReadonlyMap<string, number>,
): ResidualSample[] {
  return samples.map((sample) => {
    const earned = byReporter.get(sample.reporter_key) ?? CONCORDANCE_WEIGHT_CEILING;
    if (earned === CONCORDANCE_WEIGHT_CEILING) return sample;
    return { ...sample, weight: sample.weight * earned };
  });
}

/** One published call as the propensity denominator reads it: which spot, which morning, how good the site said it would be. */
export type PublishedCall = {
  readonly spot_id: string;
  readonly day: string;
  readonly score_q: number;
};

/** The key a morning is looked up by: one spot, one calendar day. */
export function morningKey(spotId: string, day: string): string {
  return `${spotId} ${day}`;
}

/**
 * 06 section 6.3, answering research 09 section 13.5a -- selection bias, the
 * most serious hazard in the whole feedback loop. People post when it is good,
 * so the labels are conditioned on the very thing the forecast is trying to
 * predict, and a bias fitted only on good days corrects only good days and may
 * be wrong in the opposite direction on the flat, blown-out mornings when
 * somebody most needs to be told not to drive two hours.
 *
 * The fix needs no extra collection, only the prediction log this lane already
 * has: bucket every published morning by the score decile the site showed that
 * day, count how often each bucket gets reported at all, and weight a report
 * by the inverse of its bucket's reporting rate.
 *
 *   w_select = min(3, P_bar / P_hat(decile))
 *
 * THE CAP IS NOT DECORATION. P_hat is zero for a kind of morning nobody has
 * ever reported, and an uncapped inverse is an infinity: one report on the
 * first flat day anybody ever bothered with would outweigh the whole rest of
 * the fit. Capped, it counts for three mornings, which is a bonus and not a
 * takeover.
 *
 * A MORNING NOBODY PUBLISHED A CALL FOR HAS NO WEIGHT HERE and is left alone
 * at 1. There is no propensity to invert: the site never told anybody what to
 * expect that day, so the report was not selected on a published score.
 *
 * Deliberately pooled across spots and blind to which spot a morning belongs
 * to (06 section 6.3: "pooled across spots at launch"), because the thing
 * being modelled is a behaviour -- people post when it looks good -- and not a
 * property of any one beach.
 */
export function selectionWeightByMorning(
  calls: readonly PublishedCall[],
  reportedMornings: ReadonlySet<string>,
): Map<string, number> {
  const decileOfMorning = new Map<string, number>();
  for (const call of calls) {
    if (typeof call.score_q !== "number" || !Number.isFinite(call.score_q)) continue;
    if (typeof call.spot_id !== "string" || typeof call.day !== "string") continue;
    // A morning with more than one published call is bucketed by the last one
    // in key order, which is the most recent build before it: what was live
    // that morning, not what an earlier build had guessed.
    decileOfMorning.set(morningKey(call.spot_id, call.day), decileOf(call.score_q));
  }

  const published = new Map<number, number>();
  const reported = new Map<number, number>();
  for (const [morning, decile] of decileOfMorning) {
    published.set(decile, (published.get(decile) ?? 0) + 1);
    if (reportedMornings.has(morning)) {
      reported.set(decile, (reported.get(decile) ?? 0) + 1);
    }
  }

  const publishedInAll = sumOf(published.values());
  const reportedInAll = sumOf(reported.values());
  if (publishedInAll === 0 || reportedInAll === 0) return new Map();
  const overallRate = reportedInAll / publishedInAll;

  const weights = new Map<string, number>();
  for (const [morning, decile] of decileOfMorning) {
    const rate = (reported.get(decile) ?? 0) / published.get(decile)!;
    weights.set(morning, rate === 0 ? SELECTION_WEIGHT_CAP : Math.min(SELECTION_WEIGHT_CAP, overallRate / rate));
  }
  return weights;
}

/** The published 0-100 score's decile, 06 section 6.3. A hundred belongs to the top bucket, not an eleventh one. */
function decileOf(scoreQ: number): number {
  return Math.min(9, Math.max(0, Math.floor(scoreQ / 10)));
}

function sumOf(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Each sample's weight multiplied by how rare its kind of morning is
 * (06 section 6, all multiplicative).
 *
 * A morning the site ASKED for is exempt and keeps a plain 1: it is already
 * close to a random sample of pushed days, so there is no selection to undo
 * (09 section 13.5a fix 1). Paying it a rarity bonus on top would double-count
 * the very correction it is evidence against.
 */
export function applySelectionWeights(
  samples: readonly ResidualSample[],
  spotId: string,
  byMorning: ReadonlyMap<string, number>,
): ResidualSample[] {
  return samples.map((sample) => {
    if (sample.solicited || sample.day === null) return sample;
    const rarity = byMorning.get(morningKey(spotId, sample.day));
    if (rarity === undefined || rarity === 1) return sample;
    return { ...sample, weight: sample.weight * rarity };
  });
}

/**
 * 06 section 6.4's override weight, for the reporters an incident named who
 * were down-weighted rather than removed. A weight of zero is not applied
 * here at all: it is an EXCISION, handled upstream in fit.ts by dropping the
 * reporter's rows before anything reads them, because a zero-weight sample
 * would still count toward n, toward the distinct-reporter gate, toward the
 * physical noise floor's n and toward a day's median. "Vanishes from the fit"
 * has to mean vanishes.
 */
export function applyOverrideWeights(
  samples: readonly ResidualSample[],
  overrides: ReadonlyMap<string, number>,
): ResidualSample[] {
  if (overrides.size === 0) return [...samples];
  return samples.map((sample) => {
    const adjudicated = overrides.get(sample.reporter_key);
    if (adjudicated === undefined || adjudicated === 1) return sample;
    return { ...sample, weight: sample.weight * adjudicated };
  });
}
