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
import type { PublishedSurfaceUpdate, SurfaceCall } from './static-surface';

/** Array position in the published surface's `days` tuple: 0 is today, 1 is tomorrow. */
export type SurfaceDayIndex = 0 | 1;

/**
 * The three honest outcomes for one spot's one day. Never a fourth, and
 * never two spelled the same way: a consumer must name which one it means
 * before its code can compile, so a clean day can never quietly render as
 * "we do not know" or the reverse.
 */
export type WeakestLinkReading =
  | { readonly kind: 'named'; readonly factor: FactorToken }
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
  return row === undefined ? { kind: 'unknown' } : readingFor(row.weakest_link);
}

function rowsForDay(surface: PublishedSurfaceUpdate, day: SurfaceDayIndex): readonly SurfaceCall[] {
  return day === 0 ? surface.calls : surface.days[1].spots;
}

function readingFor(weakestLink: FactorToken | null | undefined): WeakestLinkReading {
  if (weakestLink === undefined) return { kind: 'unknown' };
  if (weakestLink === null) return { kind: 'clean' };
  return { kind: 'named', factor: weakestLink };
}
