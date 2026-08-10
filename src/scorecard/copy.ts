// The day-one empty-state sentence, composed from the block's own two
// integers, never typed as a flat literal.
//
// application-architecture.md section 10 line 419 settles the Spanish word
// for word: "Todavía no podemos decirte si acertamos aquí. Van {n} reportes
// de los {threshold} que hacen falta." Definition of Done row 2 requires the
// two numbers to be RENDERED FROM THE BLOCK'S INTEGERS, so this module never
// hands out a pre-filled string -- it hands out the pieces, and a caller
// joins them.
//
// Why parts and not a flat string, forced by the U6 oracle: `observeBox`
// (tests/acceptance/f-show-our-track-record/steps/support/track-record-box.ts)
// requires `font-variant-numeric: tabular-nums` on every element whose OWN
// text carries a digit. A single paragraph holding the whole sentence is
// itself a digit carrier without tabular-nums, so the renderer needs the
// counted values in their own elements. `composeEmptyStateSentence` hands
// back an ordered sequence of prose and counted parts; `joinSentenceParts`
// flattens it back to the one sentence a byte-level assertion reads, spaces
// included.
//
// One exported home, deliberate: this sentence lives here, not in
// src/i18n/strings.ts. That file belongs to another lane, and this lane must
// not edit it. Consolidating this verbatim string into strings.ts, both
// locales, marked verbatim, is a recorded follow-up for whoever holds that
// file -- the sibling report lane made the identical call for its own
// settled copy. Not performed here.

import type { ScorecardBlock } from './scorecard-block';

/** One piece of the composed sentence: literal prose, or a counted integer. */
export type SentencePart =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'count'; readonly value: number };

const PROSE_BEFORE_REPORT_COUNT = 'Todavía no podemos decirte si acertamos aquí. Van ';
const PROSE_BETWEEN_COUNTS = ' reportes de los ';
const PROSE_AFTER_THRESHOLD = ' que hacen falta.';

/**
 * Composes the day-one empty-state sentence from the block's own two
 * integers: the report count (`n_obs`) and the settled threshold
 * (`threshold`). The prose never carries a digit -- both counted values sit
 * in their own `count` parts, so a renderer can give each its own element
 * without splitting the sentence's words or spaces.
 *
 * Takes the block's fields by name, not two positional numbers: `n_obs` and
 * `threshold` are both plain numbers, and a positional `(n, threshold)`
 * signature is exactly the shape that lets a caller swap them by accident.
 */
export const composeEmptyStateSentence = (
  block: Pick<ScorecardBlock, 'n_obs' | 'threshold'>,
): readonly SentencePart[] => [
  { kind: 'text', value: PROSE_BEFORE_REPORT_COUNT },
  { kind: 'count', value: block.n_obs },
  { kind: 'text', value: PROSE_BETWEEN_COUNTS },
  { kind: 'count', value: block.threshold },
  { kind: 'text', value: PROSE_AFTER_THRESHOLD },
];

/** Flattens the parts back into the one sentence a byte-level assertion reads. */
export const joinSentenceParts = (parts: readonly SentencePart[]): string =>
  parts.map((part) => String(part.value)).join('');
