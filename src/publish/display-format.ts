// The two canonical display formats of the published surface.
//
// Both are pure functions over fields the build already decided. A page
// renders them, it never recomputes a size or a window (application-
// architecture.md P1, "client renders, never computes"; domain-model.md
// section 13 precomputes local-time strings for exactly this reason).
//
// Format law (application-architecture.md section 10, decision 18): the
// body-height word comes FIRST and the metre RANGE second, always carrying
// "≈". A bare exact metre value promises precision the forecast does not have
// and is a contract violation, not a style preference.

import { OPEN_ENDED_SIZE_BAND, sizeBands, type SizeBandToken } from '../data/size-bands';
import { formatPanamaTime } from './reading-state';
import type { BestWindow } from './static-surface';

const APPROXIMATELY = '≈';
const RANGE_DASH = '–';

/**
 * `Cintura a pecho ≈0.7–1.1 m`. Renders the published `size_band` word and the
 * published `size_range_m`, never a re-derived one. The open-ended top band
 * reads `Doble o más ≈2.4 m o más`, because it has no honest upper edge.
 */
export function formatSizeEs(
  band: SizeBandToken,
  range: readonly [number, number],
): string {
  return `${bandWordEs(band)} ${APPROXIMATELY}${metres(band, range)}`;
}

/** `Ventana 6:00–9:30`. Renders the published `best_window` spot-local strings. */
export function formatBestWindowEs(window: BestWindow): string {
  return `Ventana ${readableHour(window.start)}${RANGE_DASH}${readableHour(window.end)}`;
}

/**
 * `Actualizado 6:04 a.m.` (application-architecture.md section 10, the exact
 * settled staleness-stamp copy; section 10 also settles the identical "a.m."
 * form for the English "Updated 6:04 a.m." string, so this one clock format
 * serves both locales). Renders the published `published_at` instant as the
 * Panama-local wall-clock time, resolved at build time so the document
 * stays true with JavaScript off and true for a service-worker-served stale
 * copy (section 12: "the stamp travels inside the document it describes").
 * A page must never interpolate the raw ISO instant.
 */
export function formatUpdatedAtEs(publishedAt: string): string {
  return formatPanamaTime(publishedAt);
}

function bandWordEs(band: SizeBandToken): string {
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined) {
    throw new Error(
      `display refused: WHAT size_band "${band}" is outside the v1 seven-band vocabulary; WHY a published size must name a body-height word every surfer already uses; HOW publish only the domain-model section 7.2 tokens.`,
    );
  }
  return row.label.es;
}

function metres(band: SizeBandToken, [lo, hi]: readonly [number, number]): string {
  if (band === OPEN_ENDED_SIZE_BAND) return `${oneDecimal(lo)} m o más`;
  return `${oneDecimal(lo)}${RANGE_DASH}${oneDecimal(hi)} m`;
}

/**
 * The classification table opens `flat` just below zero so a dead-flat sea
 * lands in it; a displayed metre value never goes below zero.
 */
function oneDecimal(metre: number): string {
  return Math.max(0, metre).toFixed(1);
}

/** `06:00` is stored, `6:00` is read. Only the hour loses its padding. */
function readableHour(localTime: string): string {
  return localTime.replace(/^0(\d:)/, '$1');
}
