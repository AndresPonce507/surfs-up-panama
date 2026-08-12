// What the screen says once the surfer's own report has arrived.
//
// WHY-NEW-FILE: src/report/reveal.ts
//   CLOSEST-EXISTING: src/report/island.ts
//   EXTENSION-COST: island.ts's own copy header already carries a FLAGGED note
//     saying this copy belongs in a module of its own and was inlined only
//     because that step's files_to_modify allowed no new file; extending it
//     again adds a fourth copy block and a second decision surface to a
//     thousand-line DOM orchestration module.
//   PARALLEL-RATIONALE: roadmap step 04-01 names this path in files_to_modify,
//     which is the boundary that note was waiting for. The reveal decision is
//     pure (a receipt plus the surfer's own answers in, sentences out) while
//     island.ts is the browser adapter that owns document, history, IndexedDB
//     and fetch.
//
// This module must never import from src/publish/**, src/forecast/** or
// src/pipeline/**: the report flow may not reach the forecast layer
// (application-architecture.md section 9, leak path L1, enforced by
// .dependency-cruiser.cjs). That is why the metre range is formatted here
// rather than borrowed from src/publish/display-format.ts, which is
// structurally out of reach and must stay that way.
//
// The comparison is shown only when the receipt carries every part of it. A
// receipt with no readable prediction, no delta or no counter produces the
// plain arrival instead -- never a card with a gap in it, and never a zero
// standing in for a number nobody computed (the product rule: a missing value
// renders as a stated absence, never as the most favourable reading).

import type { WindStateToken } from '../data/report-vocab';
import { sizeBands } from '../data/size-bands';
import type { ReportAnswers } from './report-record';
import type { ReportReceipt } from './submit';

/**
 * Headings and plain sentences for the arrived state. Wording is not yet
 * settled copy -- OPEN COPY ITEM, same product sign-off pass as island.ts's
 * Pre-requisite 8a block.
 */
export const RECEIVED_HEADING = 'Reporte recibido';
export const RECEIVED_MESSAGE = 'Gracias. Recibimos tu reporte.';

/** application-architecture.md section 10, report screen 2's card opener. */
export const COMPARED_MESSAGE = 'Gracias. Así nos fue:';

/**
 * Section 10's no-snapshot sentence, verbatim. It is said only when the write
 * path actually found no call for that spot and hour (`no_snapshot`), never as
 * a catch-all: a receipt that says it compared but arrives unreadable gets the
 * plain arrival instead, because claiming we had nothing forecast would be a
 * second, different lie.
 */
export const NO_CALL_MESSAGE =
  'Gracias. Esa hora no la teníamos pronosticada, así que no hay comparación.';

/**
 * An exact hit. Section 10's template only parameterises the two directions
 * ("nos pasamos" / "nos quedamos cortos"), so a difference of zero has no
 * settled sentence -- OPEN COPY ITEM. Plain, and it claims nothing beyond the
 * number: the call and the report landed on the same score.
 */
export const DEAD_ON_MESSAGE = 'Le dimos justo.';

/** The four lines of the comparison card, in reading order. */
export interface ComparisonLines {
  readonly said: string;
  readonly saw: string;
  readonly difference: string;
  readonly count: string;
}

/** What a screen showing the arrived report says. */
export interface ArrivalPresentation {
  readonly heading: string;
  readonly message: string;
  readonly comparison?: ComparisonLines;
}

const bandLabels = new Map(sizeBands.map(({ value, label }) => [value as string, label.es]));

/**
 * The three wind words, section 10's copy review. Held here rather than
 * imported from the published surface's display layer, which this module may
 * not reach.
 */
const windWords: Readonly<Record<WindStateToken, string>> = {
  clean: 'limpio',
  choppy: 'picado',
  blown_out: 'destrozado',
};

/**
 * The arrived state, decided from the receipt the server sent back and the
 * answers the surfer gave. Dependencies first, the surfer's own input last.
 */
export function decideArrivalUi(
  receipt: ReportReceipt,
  observed: ReportAnswers | undefined,
): ArrivalPresentation {
  const comparison = comparisonFrom(receipt, observed);
  if (comparison !== undefined) return { heading: RECEIVED_HEADING, message: COMPARED_MESSAGE, comparison };
  // The count is deliberately dropped here: with nothing to compare, a number
  // on the screen is a number the surfer has to interpret against a comparison
  // that does not exist.
  if (receipt.outcome === 'no_snapshot') return { heading: RECEIVED_HEADING, message: NO_CALL_MESSAGE };
  return { heading: RECEIVED_HEADING, message: RECEIVED_MESSAGE };
}

/** Every part present and in the shared vocabulary, or no card at all. */
function comparisonFrom(receipt: ReportReceipt, observed: ReportAnswers | undefined): ComparisonLines | undefined {
  const { predicted, delta, counter } = receipt;
  if (observed === undefined || predicted === null || delta === undefined || counter === undefined) return undefined;
  const saidBand = bandLabels.get(predicted.size_band);
  const saidWind = windWords[predicted.wind_state as WindStateToken];
  const sawBand = bandLabels.get(observed.size_band);
  if (saidBand === undefined || saidWind === undefined || sawBand === undefined) return undefined;
  return {
    said: `Dijimos: ${saidBand} (≈${metreRange(predicted.size_range_m)} m), ${saidWind}. ${predicted.score_q}.`,
    saw: `Tú viste: ${sawBand}, ${windWords[observed.wind]}.`,
    difference: differenceSentence(delta.score_points),
    count: `Reporte ${counter.n_reports} de ${counter.threshold} en este spot. Gracias.`,
  };
}

/** Positive means we ran big (07-write-path.md section 4.2). */
function differenceSentence(scorePoints: number): string {
  if (scorePoints === 0) return DEAD_ON_MESSAGE;
  const size = Math.abs(scorePoints);
  const points = size === 1 ? '1 punto' : `${size} puntos`;
  return scorePoints > 0 ? `Nos pasamos ${points}.` : `Nos quedamos cortos ${points}.`;
}

/** "1.1 a 1.6", one decimal, never below zero and never a dash. */
function metreRange([low, high]: readonly [number, number]): string {
  return `${oneDecimal(low)} a ${oneDecimal(high)}`;
}

function oneDecimal(metre: number): string {
  return Math.max(0, metre).toFixed(1);
}
