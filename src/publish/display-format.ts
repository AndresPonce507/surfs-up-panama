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
import { factorWord, type FactorWord } from './factor-vocab';
import type { BestWindow } from './static-surface';
import type { WeakestLinkReading } from './weakest-link';

const APPROXIMATELY = '≈';
const RANGE_DASH = '–';

/**
 * The one place this wording lives, so the pending copy settlement (Andres,
 * through the cousin's crew channel) is a one-line swap here, never an edit
 * scattered across components. `named` composes the settled Pre-requisite 3
 * sentence from the shared factor-vocab.ts word -- article and noun both
 * come from that module, never hardcoded here, so the phrase is correct for
 * every one of the four factors and not just the ones that happen to take
 * "el".
 *
 * `clean` and `unknown` are two different honest sentences, not one. A day
 * the pipeline scored perfectly and a day published on an older surface that
 * never carried this field are different facts (static-surface.ts,
 * `SurfaceCall.weakest_link`); collapsing them into the same wording -- or
 * into silence that reads as "all clear" -- is the dishonesty this product
 * refuses. Whether either sentence ever reaches a page is a mounting
 * decision this module does not make.
 *
 * STRINGS BOUNDARY, FLAGGED NOT FIXED: application-architecture.md and the
 * feature plan both put UI strings in src/i18n/strings.ts; that lane is
 * forbidden to this step. This constant is a cross-lane follow-up owed to
 * the i18n owner once that lane opens.
 */
export const WEAKEST_LINK_SENTENCE_ES = {
  named: (word: FactorWord): string => `Lo que lo tumba: ${word.article} ${word.noun}.`,
  clean: 'Este día no tuvo ningún punto débil: nada le bajó el puntaje.',
  unknown: 'Esta mañana no trajo ese dato: no sabemos qué lo habría tumbado.',
} as const;

/**
 * Turns one published weakest-link reading into the settled Spanish
 * sentence. Total over the three honest outcomes a spot-day can carry
 * (weakest-link.ts, `WeakestLinkReading`): a page or component calls this
 * and never composes the wording inline.
 */
export function formatWeakestLinkEs(reading: WeakestLinkReading): string {
  return reading.kind === 'named' ? WEAKEST_LINK_SENTENCE_ES.named(factorWord(reading.factor)) : WEAKEST_LINK_SENTENCE_ES[reading.kind];
}

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
