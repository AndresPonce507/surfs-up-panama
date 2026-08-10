// The four scoring factors in Spanish: one noun and one definite article each.
//
// Why a file of its own, and why it imports nothing at all: two lanes need the
// same four words. `f-see-what-killed-it` names the factor that killed the day
// on the spot page; `f-know-how-much-to-trust-it` names the same four factors
// in its confidence copy. Both lanes independently recorded that
// `src/data/report-vocab.ts` carries wind and quality tokens only, and that
// DELIVER owes ONE shared module rather than two copies that drift apart the
// first time somebody rewords one of them.
//
// The eventual home is `src/data/**`, beside `report-vocab.ts`, because the
// arrow there points data -> publish and never back. This file lands in
// `src/publish/**` only because `src/data/**` is not a writable lane for the
// step that created it. Keeping the module import-free is what makes that move
// a file move plus one import path change instead of a refactor: a module with
// zero edges cannot drag any part of the publish import graph into `src/data`.
//
// The token tuple below is declared locally and deliberately NOT imported from
// `src/scoring/engine.ts`, whose `Factor` union carries the same four tokens.
// Importing it would couple the copy layer to the scoring core and defeat the
// move. The two are asserted equal at the publish boundary, in
// `tests/unit/weakest-link-vocab.test.ts`, which is the one place allowed to
// see both sides at once.
//
// So: this module must never import anything, from anywhere.

/**
 * The four scoring factors, in the engine's own tiebreak order
 * (`dir > size > wind > tide`, 05-scoring-engine.md section 4). Declared here,
 * asserted equal to the engine's `Factor` union at the publish boundary.
 */
export const FACTOR_TOKENS = ['dir', 'size', 'wind', 'tide'] as const;

export type FactorToken = (typeof FACTOR_TOKENS)[number];

/**
 * One factor said in Spanish. The article and the noun stay separate fields
 * because the surface composes them into different sentences ("la marea",
 * "lo que lo tumbó fue la marea") and a pre-glued phrase cannot be taken apart
 * again. The article is a type-level union, so no runtime check is owed here.
 */
export type FactorWord = {
  readonly article: 'el' | 'la';
  readonly noun: string;
};

/**
 * The vocabulary itself. Grammatical gender is the language's, not a choice:
 * la dirección, el tamaño, el viento, la marea.
 */
export const FACTOR_VOCAB: Readonly<Record<FactorToken, FactorWord>> = {
  dir: { article: 'la', noun: 'dirección' },
  size: { article: 'el', noun: 'tamaño' },
  wind: { article: 'el', noun: 'viento' },
  tide: { article: 'la', noun: 'marea' },
};

/**
 * The lookup. Total by construction: `FactorToken` admits exactly the four
 * tokens the record is keyed by, so there is no missing case and no fallback
 * word that could quietly render for an unknown factor.
 */
export function factorWord(token: FactorToken): FactorWord {
  return FACTOR_VOCAB[token];
}
