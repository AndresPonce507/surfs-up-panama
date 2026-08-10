// Pure composer for the section-10 Spanish share template
// (application-architecture.md §10, "Share card template"):
//
//   SURF {fecha}
//   Mejor: {spot}, {score}
//   {tamaño} y {viento}. {ventana}.
//   Confianza {nivel}.
//   {url}?b={build_id}
//
// No I/O, no clock, no ambient reads: every field the template needs travels
// in as an argument. `shareLink` (the finished `{url}?b={build_id}` line) is
// built elsewhere (slice-01-02) and handed in already-formed; this module
// only lays the five lines out.

import { sizeBands } from '../data/size-bands';
import type { WindStateToken } from '../data/report-vocab';
import type { SizeBandToken } from '../data/size-bands';
import { CONFIDENCE_LEVEL_WORD_ES, type ConfidenceLevel } from '../scoring/confidence';

export type ShareDaySummary = {
  /** Already-formatted Spanish date text for the `{fecha}` slot (upstream owns formatting; this module only places it). */
  readonly fecha: string;
  readonly spotName: string;
  /** `score_q`: an int 0-100, rendered as-is (application-architecture.md §7). */
  readonly scoreQ: number;
  readonly sizeBand: SizeBandToken;
  readonly windState: WindStateToken;
  /** `best_window.start`/`.end`, spot-local `HH:MM`, rendered verbatim. */
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly confidenceLevel: ConfidenceLevel;
};

const SIZE_BAND_LABEL_ES: ReadonlyMap<SizeBandToken, string> = new Map(
  sizeBands.map((band) => [band.value, band.label.es]),
);

/**
 * report-vocab.ts exports only the canonical wire tokens, no Spanish label —
 * these are the three words section 10's copy review named (limpio / picado
 * / destrozado), keyed by the imported canonical token type so a drift in
 * `WIND_STATE_TOKENS` cannot silently leave a token unmapped.
 */
const WIND_STATE_WORD_ES: Readonly<Record<WindStateToken, string>> = {
  clean: 'limpio',
  choppy: 'picado',
  blown_out: 'destrozado',
};

function sizeBandLabelEs(token: SizeBandToken): string {
  const label = SIZE_BAND_LABEL_ES.get(token);
  if (label === undefined) {
    throw new Error(`sin etiqueta canónica en español para el tamaño "${token}"`);
  }
  return label;
}

/**
 * Lays the section-10 Spanish share template out over a populated day
 * summary. `shareLink` is the already-composed `{url}?b={build_id}` line
 * (built elsewhere); this function only places it as the closing line,
 * verbatim.
 */
export function composeWhatsAppCallMessage(day: ShareDaySummary, shareLink: string): string {
  const conditionsLine =
    `${sizeBandLabelEs(day.sizeBand)} y ${WIND_STATE_WORD_ES[day.windState]}. Mejor de ${day.windowStart} a ${day.windowEnd}.`;

  return [
    `SURF ${day.fecha}`,
    `Mejor: ${day.spotName}, ${day.scoreQ}`,
    conditionsLine,
    `Confianza ${CONFIDENCE_LEVEL_WORD_ES[day.confidenceLevel]}.`,
    shareLink,
  ].join('\n');
}
