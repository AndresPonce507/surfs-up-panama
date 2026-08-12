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
