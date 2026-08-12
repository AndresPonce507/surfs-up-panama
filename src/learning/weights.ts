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
