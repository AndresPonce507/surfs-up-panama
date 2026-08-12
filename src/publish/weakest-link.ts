// The publish-side reader for one spot's weakest_link, on one day.
//
// Pure lookup over the committed reading surface (static-surface.ts); it
// never renders, never derives, never guesses. Its output only becomes
// visible once a page mounts it (slice-01 step 01-05).
//
// DAY SELECTION mirrors src/data/forecast.ts line 77 exactly: today reads
// `surface.calls`, the legacy compatibility alias kept for the yesterday and
// receipt readers; tomorrow reads `surface.days[1].spots`, its own
// separately ranked list. `surface.days[0].spots` is never read here --
// that quirk is a compatibility alias, not an accident, and reading the more
// obvious `days[0]/days[1]` pair instead would show the wrong day's culprit
// the moment `calls` and `days[0].spots` disagree
// (application-architecture.md section 7, two-surfaces-must-not-disagree).
// tests/unit/weakest-link-surface-contract.test.ts pins this exact rule.
//
// MISSING VERSUS NULL, THE ONE DISTINCTION THIS MODULE MUST NOT COLLAPSE: a
// key absent from the row (an older committed surface, published before this
// field existed) and an explicit `null` (the pipeline computed a genuinely
// clean day -- no factor cost it any score) are different facts. Returning a
// tagged `WeakestLinkReading` instead of a bare `FactorToken | null` is the
// enforcement: a caller cannot reach for `??` and quietly merge the two.
//
// LEAK RULE (application-architecture.md sections 7 to 9): this module lives
// on the forecast side. The report-capture flow must never import it,
// directly or transitively.
//
// CROSS-LANE FOLLOW-UP, FLAGGED, NOT PERFORMED: once src/data/forecast.ts
// opens as a writable lane, DaySummary should absorb weakest_link and this
// module should collapse to nothing but a formatter, deleting the duplicated
// day-selection rule declared here.

import type { FactorToken } from './factor-vocab';
import type {
  HourlySubscore,
  HourlySubscorePoint,
  PublishedSurfaceUpdate,
  SurfaceCall,
} from './static-surface';

/** Array position in the published surface's `days` tuple: 0 is today, 1 is tomorrow. */
export type SurfaceDayIndex = 0 | 1;

/**
 * The three honest outcomes for one spot's one day. Never a fourth, and
 * never two spelled the same way: a consumer must name which one it means
 * before its code can compile, so a clean day can never quietly render as
 * "we do not know" or the reverse.
 */
export type WeakestLinkReading =
  | {
    readonly kind: 'named';
    readonly factor: FactorToken;
    /** Raw score from this exact published row's factor; absent on legacy rows. */
    readonly weakest_link_subscore?: number;
  }
  | { readonly kind: 'clean' }
  | { readonly kind: 'unknown' };

/**
 * One row's producer-decided counterfactual state. This reader never
 * recalculates the score or reselects a factor: its only job is to preserve
 * the published distinction between an available value, a valid rounded
 * collision, and a legacy named omission.
 */
export type CounterfactualReading =
  | { readonly kind: 'available'; readonly score_q: number }
  | { readonly kind: 'rounded_equal' }
  | { readonly kind: 'legacy_missing' }
  | { readonly kind: 'clean' }
  | { readonly kind: 'unknown' };

/**
 * Resolves the published culprit for one spot on one day, straight from the
 * row the publish pipeline already wrote. Never a derived or guessed factor:
 * every branch below only repeats what that one row already says, and a spot
 * with no row at all on that day reads exactly like a row with the key
 * missing -- both are "we do not know", never a fabricated absence of blame.
 */
export function resolveWeakestLink(
  surface: PublishedSurfaceUpdate,
  spotId: string,
  day: SurfaceDayIndex,
): WeakestLinkReading {
  const row = rowsForDay(surface, day).find((call) => call.spot_id === spotId);
  return row === undefined ? { kind: 'unknown' } : readingFor(row);
}

export function resolveCounterfactual(
  surface: PublishedSurfaceUpdate,
  spotId: string,
  day: SurfaceDayIndex,
): CounterfactualReading {
  const row = rowsForDay(surface, day).find((call) => call.spot_id === spotId);
  if (row === undefined || row.weakest_link === undefined) return { kind: 'unknown' };
  if (row.weakest_link === null) return { kind: 'clean' };
  if (row.counterfactual_score_q !== undefined) {
    return { kind: 'available', score_q: row.counterfactual_score_q };
  }
  if (row.counterfactual_suppression === 'rounded_equal') return { kind: 'rounded_equal' };
  return { kind: 'legacy_missing' };
}

/**
 * Why one day's four bars are unavailable. Four distinct facts, never one:
 *
 * - `no_best_window`   the day published no window, so there is nothing to
 *                      explain. The accepted normal omission.
 * - `legacy_hourly_missing`
 *                      the surface predates the hourly projection. A
 *                      backward-compatibility gap; the caller logs it once
 *                      at publish time and the page simply omits the bars.
 * - `hour_not_projected`
 *                      a FRESH projection has no point in the very hour its
 *                      own day summary published. A producer-contract error.
 * - `hour_duplicated`  two points sit inside that one published hour, so no
 *                      single honest answer exists. A producer-contract error.
 * - `malformed_point`  the matched point is not four raw scores. A
 *                      producer-contract error.
 *
 * Collapsing the last three into the first would file a real defect as an
 * old surface and silence the only signal that the producer is wrong.
 */
export type BreakdownUnavailableReason =
  | 'no_best_window'
  | 'legacy_hourly_missing'
  | 'hour_not_projected'
  | 'hour_duplicated'
  | 'malformed_point';

/** The four already-scored values behind one day's best window, or why there are none. */
export type BestWindowBreakdownReading =
  | { readonly kind: 'available'; readonly sub: HourlySubscore }
  | { readonly kind: 'unavailable'; readonly reason: BreakdownUnavailableReason };

/**
 * The four raw sub-scores of the single already-scored hour that this day's
 * published `best_window` starts in.
 *
 * A LOOKUP, not a decision. Every value returned was computed by the scoring
 * core for that exact hour and published on the surface; this function
 * selects one point and copies it. It does not average adjacent hours,
 * interpolate, re-score, read damages, choose the lowest factor, or fall
 * back to a neighbouring hour when the published one is missing -- each of
 * those would be a claim the producer never made.
 *
 * It computes no time zone either. The point carries its own precomputed
 * spot-local stamp and the summary carries its own spot-local `HH:MM`, so
 * the join is a string comparison between two already-local values, which
 * is why this stays legal on a page that must never touch a clock.
 *
 * WHICH FACTOR IS TO BLAME IS NOT DECIDED HERE. That is the day summary's
 * published `weakest_link` (`resolveWeakestLink`). A caller that let the
 * lowest of these four numbers mark the weak row would be re-deciding, on
 * the page, something the producer already decided -- the exact substitution
 * this slice exists to prevent.
 */
export function resolveBestWindowBreakdown(
  surface: PublishedSurfaceUpdate,
  spotId: string,
  day: SurfaceDayIndex,
): BestWindowBreakdownReading {
  const row = rowsForDay(surface, day).find((call) => call.spot_id === spotId);
  const windowStart = row?.best_window?.start;
  // A spot with no row on this day published no window either; both mean
  // this day has no window to explain, which is a normal omission.
  if (windowStart === undefined) return { kind: 'unavailable', reason: 'no_best_window' };

  const hourly = surface.spot_detail?.[spotId]?.hourly;
  if (hourly === undefined) return { kind: 'unavailable', reason: 'legacy_hourly_missing' };

  const matching = hourly.filter((point) => startsInPublishedHour(point, surface.days[day].date, windowStart));
  if (matching.length === 0) return { kind: 'unavailable', reason: 'hour_not_projected' };
  if (matching.length > 1) return { kind: 'unavailable', reason: 'hour_duplicated' };

  const sub = matching[0]!.sub;
  return isHourlySubscore(sub)
    ? { kind: 'available', sub: { dir: sub.dir, size: sub.size, wind: sub.wind, tide: sub.tide } }
    : { kind: 'unavailable', reason: 'malformed_point' };
}

/**
 * The one build-side record this slice emits: a spot-day whose surface was
 * published before the hourly projection existed.
 *
 * Not browser telemetry, and it cannot become browser telemetry: it is a
 * value returned from a pure function, written by the publish-time renderer
 * to its own output. No beacon, metric, endpoint or fetch is involved.
 */
export type BreakdownHealthEvent = {
  readonly event: 'health.publish.breakdown_hourly_missing';
  readonly spot_id: string;
  readonly day: 'today' | 'tomorrow';
  readonly published_at: string;
};

/**
 * The compatibility gap worth recording, or nothing.
 *
 * Exactly one of the five unavailable reasons qualifies. A day with no
 * window is normal and would cry wolf twenty times a morning; an
 * unprojected hour, a duplicated hour and a malformed point are producer
 * faults, and filing them here would disguise a live defect as an old
 * surface and silence the only signal that the build is wrong.
 */
export function breakdownCompatibilityGapEvent(
  reading: BestWindowBreakdownReading,
  spotId: string,
  day: SurfaceDayIndex,
  publishedAt: string,
): BreakdownHealthEvent | null {
  if (reading.kind !== 'unavailable' || reading.reason !== 'legacy_hourly_missing') return null;
  return {
    event: 'health.publish.breakdown_hourly_missing',
    spot_id: spotId,
    day: day === 0 ? 'today' : 'tomorrow',
    published_at: publishedAt,
  };
}

/**
 * Same published civil day, same published clock hour. The hour, not the
 * exact minute: the contract selects the point whose stamp "falls in the
 * same hour as that day summary's best_window.start", so a window opening at
 * 06:30 is explained by the 06:00 hour that contains it rather than refused.
 */
function startsInPublishedHour(point: HourlySubscorePoint, dayDate: string, windowStart: string): boolean {
  return point.t.slice(0, 10) === dayDate && point.t.slice(11, 13) === windowStart.slice(0, 2);
}

/**
 * The reading surface is JSON that reached this module through a parse and a
 * type assertion. The publish-time validator refuses a malformed point, so
 * this branch should be unreachable in production -- and it is checked
 * anyway, because the alternative is a page printing `undefined` beside
 * three real numbers, which is exactly how this repo's worst bug shipped.
 */
function isHourlySubscore(value: unknown): value is HourlySubscore {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isRawScore(candidate.dir)
    && isRawScore(candidate.size)
    && (candidate.wind === null || isRawScore(candidate.wind))
    && (candidate.tide === null || isRawScore(candidate.tide));
}

function isRawScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function rowsForDay(surface: PublishedSurfaceUpdate, day: SurfaceDayIndex): readonly SurfaceCall[] {
  return day === 0 ? surface.calls : surface.days[1].spots;
}

function readingFor(row: SurfaceCall): WeakestLinkReading {
  if (row.weakest_link === undefined) return { kind: 'unknown' };
  if (row.weakest_link === null) return { kind: 'clean' };
  return typeof row.weakest_link_subscore === 'number'
    ? { kind: 'named', factor: row.weakest_link, weakest_link_subscore: row.weakest_link_subscore }
    : { kind: 'named', factor: row.weakest_link };
}
