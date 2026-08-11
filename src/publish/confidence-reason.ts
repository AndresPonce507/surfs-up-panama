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

import {
  DEFAULT_CONFIDENCE_FACTORS,
  type ConfidenceFactors,
  type ConfidenceResult,
} from '../scoring/confidence';

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
   * Nothing was missing, so no cap bound the level. Reached only when no
   * named spread term dominates either: today that means the tracked cause is
   * track record, freshness, height, direction, or no signal at all --
   * naming those is not this step's job, so this states the one thing that
   * is true of every such morning. It is a placeholder, not settled copy.
   */
  nothing_missing: 'No falta ningún dato para esta playa',
  /** Every participating factor lacks input. Low confidence is an honest
   * absence of signal, not a perfect product of neutral fallback values. */
  no_usable_signal: 'Todavía no hay una señal usable para medir la confianza',
  /**
   * Nothing was missing, so no cap bound the level, and the models split on
   * this term instead: `{factor}` names it from the injected vocabulary,
   * never a second copy authored here. `confidence()` forces every spread
   * term to zero below two members (05-scoring-engine.md section 6.1), so
   * this can only be reached with two or more models actually disagreeing --
   * never on a single-model day (step 01-05's shape).
   */
  spread_disagreement: 'Los modelos no se ponen de acuerdo en el {factor}',
  /** The spot has earned its own completed-day distribution. This remains a
   * qualitative comparison: the percentile never reaches the reader. */
  spread_worse_than_spot_normal: 'Los modelos se parten más de lo normal en este spot',
  /**
   * `c_fresh === null`: no beach report has ever reached this spot, so the
   * level is agreement between forecast models, never a confirmation from the
   * beach (05-scoring-engine.md section 6.3). Read off the result, never
   * asserted unconditionally: the day a real report lands `c_fresh` stops
   * being null and this clause drops itself with no code edit.
   */
  nobody_reported: 'Todavía nadie ha reportado desde la playa',
  /**
   * `track_state === 'unverified'`: no gated scorecard exists yet for this
   * spot (05-scoring-engine.md section 6.2). Read off the result, never
   * asserted unconditionally: the day a scorecard clears its gate
   * `track_state` becomes `'measured'` and this clause drops itself with no
   * code edit.
   */
  no_verified_record: 'Este spot no tiene historial verificado',
  /**
   * `members_used === 1`: with a single member every spread term is forced
   * to zero (`confidence()`, 05-scoring-engine.md section 6.1's f(M) cap), so
   * there is nothing to compare and nothing to disagree about. Read off the
   * result, never asserted unconditionally: the day a second model answers
   * `members_used` stops being 1 and this clause drops itself with no code
   * edit. Composed instead of `spread_disagreement` on that day, never
   * alongside it -- `dominant` can never be a spread_* term with one member,
   * so the two clauses can never both fire.
   */
  single_model_answered: 'Solo un modelo respondió',
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
  factors: ConfidenceFactors = DEFAULT_CONFIDENCE_FACTORS,
  context: { readonly comparesAgainstSpotNormal?: boolean; readonly day?: 'today' | 'tomorrow' } = {},
): string {
  const clauses = [
    bindingCauseClause(result, vocab, factors, context),
    ...singleModelClause(result),
    ...honestyClauses(result),
  ];
  const day = context.day === 'tomorrow' ? 'Mañana' : 'Hoy';
  return `${day}, ${lowercaseFirst(clauses.join('. '))}.`;
}

function lowercaseFirst(text: string): string {
  return `${text.slice(0, 1).toLocaleLowerCase('es-PA')}${text.slice(1)}`;
}

/**
 * A single answering model has nothing to compare itself against, which is a
 * different fact from "the models agree" -- the most confident-sounding lie
 * this system could tell, since a lone member looks like perfect consensus
 * from the inside. Stated plainly whenever `members_used === 1`, regardless
 * of what else the sentence says, so it never gets buried under a missing-
 * input clause and never leaves the reader to infer agreement from silence.
 */
function singleModelClause(result: ConfidenceResult): readonly string[] {
  return result.members_used === 1 ? [REASON_PHRASES_ES.single_model_answered] : [];
}

/**
 * The two binding copy clauses this step adds, in a stable reading order.
 * Both read straight off `result` -- never hardcoded -- so a morning with a
 * real report or a real scorecard composes a shorter, truer sentence with no
 * code edit (DoD 4: input-driven, never a claim the data has not earned).
 */
function honestyClauses(result: ConfidenceResult): readonly string[] {
  const clauses: string[] = [];
  if (result.c_fresh === null) clauses.push(REASON_PHRASES_ES.nobody_reported);
  if (result.track_state === 'unverified') clauses.push(REASON_PHRASES_ES.no_verified_record);
  return clauses;
}

function bindingCauseClause(
  result: ConfidenceResult,
  vocab: FactorVocabEs,
  factors: ConfidenceFactors,
  context: { readonly comparesAgainstSpotNormal?: boolean },
): string {
  const missing = orderedMissingInputs(result.missing);
  if (missing.length > 0) {
    const template = missing.length === 1
      ? REASON_PHRASES_ES.missing_one_input
      : REASON_PHRASES_ES.missing_several_inputs;
    return template.replace('{inputs}', namedMissingInputs(missing, vocab));
  }
  if (!result.has_usable_signal) return REASON_PHRASES_ES.no_usable_signal;
  if (factors.spread && context.comparesAgainstSpotNormal === true) {
    return REASON_PHRASES_ES.spread_worse_than_spot_normal;
  }
  if (factors.spread && result.dominant === 'spread_period') {
    return REASON_PHRASES_ES.spread_disagreement.replace('{factor}', vocab.period);
  }
  return REASON_PHRASES_ES.nothing_missing;
}

function namedMissingInputs(missing: readonly MissingInput[], vocab: FactorVocabEs): string {
  return missing.map((input) => `${CONTRACTION_ES[input]} ${vocab[input]}`).join(' y ');
}

function orderedMissingInputs(missing: readonly MissingInput[]): MissingInput[] {
  return MISSING_INPUT_ORDER.filter((input) => missing.includes(input));
}
