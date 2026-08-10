// The reason one tap away from every row's confidence word: THIS spot's own,
// for THIS day. Composed from what actually bound the level, never from the
// level word.
//
// WHY-NEW-FILE: src/publish/confidence-reason.ts
//   CLOSEST-EXISTING: src/scoring/confidence.ts
//   EXTENSION-COST: confidence.ts is the scoring core and may not learn the
//     publishing surface's vocabulary or its 160-character bound. The engine
//     computes causes; this module turns causes into one Spanish sentence.
//     Putting the sentence beside the arithmetic is what produced
//     `confidenceReasonEs(level)`, a reason composed from the projection of
//     the causes rather than from the causes.
//   PARALLEL-RATIONALE: direction publish -> scoring, the same way
//     region-bundle.ts imports scoring types and never the reverse.
//
// Authority: 05-scoring-engine.md section 3.6 (a cap that binds is the thing
// that topped the level, so name the absence by its name) and
// application-architecture.md section 7 P1 (one reason per (spot_id, day),
// at most 160 characters, degrade = the details block omitted).

import type { ConfidenceResult } from '../scoring/confidence';

/**
 * The Spanish factor nouns, injected rather than owned. DELIVER owes ONE
 * vocabulary module for the whole build (src/publish/factor-vocab.ts, authored
 * in the f-see-what-killed-it lane); this module takes it as a parameter so it
 * never becomes a second copy that can drift.
 */
export type FactorVocabEs = Readonly<
  Record<'height' | 'period' | 'direction' | 'wind' | 'tide', string>
>;

/** application-architecture.md section 7 P1. Enforced by the composer's
 * property tests: an over-budget wording fails at unit level, because
 * truncating the published sentence instead is forbidden outright. */
export const REASON_MAX_CHARS = 160;

type MissingInput = 'wind' | 'tide';

/**
 * Every phrase this module can publish, held in one table so the wording
 * sign-off Andres owns (Pre-requisite 1) is a one-line swap rather than a
 * hunt through branches, and so the 160-character budget stays auditable in
 * one place.
 */
export const REASON_PHRASES_ES = {
  /** One declared input went dark. `{inputs}` names it from the vocabulary. */
  missing_one_input: 'Falta el dato {inputs}',
  /** More than one went dark: one named clause per missing input. */
  missing_several_inputs: 'Faltan los datos {inputs}',
  /**
   * Nothing was missing, so no cap bound the level and the cause is whichever
   * spread term dominates. Naming that term is step 01-04's work; until it
   * lands this states the one thing that is true of every such morning. It is
   * a placeholder, not settled copy.
   */
  nothing_missing: 'Hoy no falta ningún dato para esta playa',
} as const;

/**
 * Grammar, never vocabulary: the noun itself always comes from the injected
 * `vocab`, only the contraction in front of it is decided here.
 */
const CONTRACTION_ES: Readonly<Record<MissingInput, string>> = {
  wind: 'del',
  tide: 'de la',
};

/** A stable reading order, so the same morning never composes two sentences. */
const MISSING_INPUT_ORDER: readonly MissingInput[] = ['wind', 'tide'];

export function composeConfidenceReasonEs(
  result: ConfidenceResult,
  vocab: FactorVocabEs,
): string {
  return `${bindingCauseClause(result, vocab)}.`;
}

function bindingCauseClause(result: ConfidenceResult, vocab: FactorVocabEs): string {
  const missing = orderedMissingInputs(result.missing);
  if (missing.length === 0) return REASON_PHRASES_ES.nothing_missing;

  const template = missing.length === 1
    ? REASON_PHRASES_ES.missing_one_input
    : REASON_PHRASES_ES.missing_several_inputs;
  return template.replace('{inputs}', namedMissingInputs(missing, vocab));
}

function namedMissingInputs(missing: readonly MissingInput[], vocab: FactorVocabEs): string {
  return missing.map((input) => `${CONTRACTION_ES[input]} ${vocab[input]}`).join(' y ');
}

function orderedMissingInputs(missing: readonly MissingInput[]): MissingInput[] {
  return MISSING_INPUT_ORDER.filter((input) => missing.includes(input));
}
