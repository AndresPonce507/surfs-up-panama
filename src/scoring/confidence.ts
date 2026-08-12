// Confidence, beside the score, never in it. RED SCAFFOLD, DISTILL 2026-08-08.
//
// Declared contract: docs/product/architecture/05-scoring-engine.md section 6.
// Structural separation (law L9): nothing this function returns is readable by
// combine(); the score signature accepts no spread, track or freshness input.

import type { MemberRow } from './engine';

export type SpreadInput =
  | { kind: 'absolute' }
  | { kind: 'climatology'; pct: number };

/** The published three-bucket projection of C_total. Same values as
 * `publish/static-surface.ts`'s `ConfLevel`; declared once here because this
 * module is where `level` is computed. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ConfidenceResult = {
  c_spread: number;
  c_track: number;
  /** null = no report ever: excluded from the product, not floored (05 section 6.3). */
  c_fresh: number | null;
  c_total: number;
  level: ConfidenceLevel;
  track_state: 'unverified' | 'measured';
  spread_terms: { height: number; period: number; direction: number };
  dominant:
    | 'spread_height'
    | 'spread_period'
    | 'spread_direction'
    | 'track'
    | 'freshness'
    | 'missing_data'
    | null;
};

export function confidence(
  members: MemberRow[],
  spread: SpreadInput,
  track: { mae: number; mae_ref: number } | null,
  last_report_age_h: number | null,
  missing: ('wind' | 'tide')[],
): ConfidenceResult {
  const c_spread = spread.kind === 'climatology'
    ? spread.pct <= 20 ? 1 : spread.pct < 80 ? 0.7 : 0.35
    : absoluteSpread(members);
  const c_track = track === null ? 1 : clamp(1 - track.mae / track.mae_ref);
  const c_fresh = last_report_age_h === null ? null : Math.max(Math.exp(-last_report_age_h / 36), 0.3);
  const product = c_spread * c_track * (c_fresh ?? 1);
  const cap = Math.min(
    missing.includes('wind') ? 0.4 : 1,
    missing.includes('tide') ? 0.7 : 1,
  );
  const c_total = Math.min(product, cap);
  const level = c_total <= 0.4 ? 'low' : c_total <= 0.7 ? 'medium' : 'high';
  const spread_terms = spread.kind === 'climatology'
    ? { height: 0, period: 0, direction: 0 }
    : absoluteSpreadTerms(members);
  const dominant = missing.length > 0
    ? 'missing_data'
    : dominantSpreadTerm(spread_terms, c_track, c_fresh);

  return {
    c_spread,
    c_track,
    c_fresh,
    c_total,
    level,
    track_state: track === null ? 'unverified' : 'measured',
    spread_terms,
    dominant,
  };
}

// ---- day-one confidence display: the word beside the score, and the honest
// reason one tap away (slice-07). Day-one confidence IS model agreement —
// nothing here reads track record or freshness, because `level` already
// folds that in, and this module never invents a beach report that does not
// exist (HANDOFF.md section 5, settled, not to be relitigated).

/** "confianza {word}" — the word that must sit beside every published score. */
export const CONFIDENCE_LEVEL_WORD_ES: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'alta',
  medium: 'media',
  low: 'baja',
};

const MODEL_AGREEMENT_ES: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'Los modelos coinciden bastante entre sí',
  medium: 'Los modelos coinciden solo en parte',
  low: 'Los modelos no se ponen de acuerdo',
};

/** Zero beach reports exist in this system today. This sentence stays fixed
 * and honest regardless of level: the level is agreement between forecast
 * models, never a claim that anyone checked the actual waves. */
const NO_BEACH_REPORT_ES =
  'Todavía nadie ha mandado un reporte desde la playa en este spot: esto es solo qué tanto se parecen los modelos entre ellos, no una confirmación real de las condiciones.';

/**
 * The reason text one tap away from every row's confidence word.
 *
 * `agreement` is REQUIRED, not optional. The two callers that render this
 * sentence must both decide what they know, because this project's worst
 * shipped bug was an optional field that silently rendered nothing on
 * nineteen of twenty spot pages while every test stayed green.
 *
 * `{ kind: 'unknown' }` is the honest degrade for a surface committed before
 * `confidence_reason` existed, and it reproduces exactly what this function
 * returned before per-variable reading landed.
 */
export function confidenceReasonEs(level: ConfidenceLevel, agreement: ModelAgreement): string {
  return `${agreementSentenceEs(level, agreement)}. ${NO_BEACH_REPORT_ES}`;
}

/**
 * One factor said in Spanish, article and noun.
 *
 * Declared here rather than imported from `src/publish/factor-vocab.ts` on
 * purpose: that module is the shared vocabulary for `size` and `dir` and names
 * this feature as its second consumer, but the arrow points core -> publish
 * and never back, so the scoring core may not import it. The two are asserted
 * equal in `tests/unit/model-agreement.test.ts`, the same guard pattern
 * `tests/unit/weakest-link-vocab.test.ts` already uses. `period` has no factor
 * token to share, because it is a swell variable and not a scoring factor.
 */
const SPREAD_VARIABLE_ES: Readonly<Record<SpreadVariable, string>> = {
  height: 'el tamaño',
  period: 'el período',
  direction: 'la dirección',
};

/** "el tamaño", "el tamaño y la dirección", "el tamaño, el período y la dirección". */
function listEs(variables: readonly SpreadVariable[]): string {
  const words = variables.map((variable) => SPREAD_VARIABLE_ES[variable]);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`;
}

/** "en el tamaño", "en el tamaño ni en la dirección" — the negative list. */
function negativeListEs(variables: readonly SpreadVariable[]): string {
  return variables.map((variable) => `en ${SPREAD_VARIABLE_ES[variable]}`).join(' ni ');
}

function agreementSentenceEs(level: ConfidenceLevel, agreement: ModelAgreement): string {
  if (agreement.kind === 'unknown') return MODEL_AGREEMENT_ES[level];
  if (agreement.kind === 'not_comparable') {
    return 'Hoy solo un modelo alcanza a ver este spot, así que no hay con qué comparar';
  }
  if (agreement.disagree.length === 0) {
    return `Los modelos coinciden en ${listEs(agreement.agree)}`;
  }
  if (agreement.agree.length === 0) {
    return `Los modelos no coinciden ${negativeListEs(agreement.disagree)}`;
  }
  return `Los modelos coinciden en ${listEs(agreement.agree)}, pero no ${negativeListEs(agreement.disagree)}`;
}

// ---- Per-variable agreement: naming WHICH thing the models split on
// (F-KNOW-HOW-MUCH-TO-TRUST-IT, slice-01).
//
// Research 09 section 8.4, third bullet: "Report spread in the variable, not
// just overall. 'They agree on size but disagree on period' is genuinely
// actionable to a surfer." Section 14.4: "Name the specific disagreement,
// never a generic 'conditions may vary'." The generic sentence above is
// exactly what those two lines forbid, and it is what the surface said until
// this slice.
//
// This stays a QUALITATIVE flag and adds no number to the surface. Research 09
// section 3.6 walks back its own earlier calibrated formula on four studies
// (Whitaker & Loughe 1998, Ebert 2001, Eckel & Mass 2005, Rupp et al. 2026)
// and binds the design: "must be treated as a qualitative flag, never a
// calibrated error bar." And per section 7.5, it is reported BESIDE the score
// and never folded into it: everything below runs at render time and law L9
// still holds, because `combine()` cannot read any of it.

export const SPREAD_VARIABLES = ['height', 'period', 'direction'] as const;
export type SpreadVariable = (typeof SPREAD_VARIABLES)[number];
export type SpreadTerms = Readonly<Record<SpreadVariable, number>>;

/**
 * The cut above which one variable reads as a disagreement.
 *
 * Not a taste call. Research 09 section 7.5 works the measured Playa Venao
 * members into three penalty terms, height 0.239, period 0.832, direction
 * 0.090, and writes its own sentence from them: "Models agree on size and
 * direction but split badly on period." That reading forces the threshold into
 * `(0.239, 0.832]`. 0.5 sits inside it and carries a plain meaning of its own:
 * a term reaches 0.5 exactly when the spread has grown to about 71 % of its own
 * calibration constant (`c1 = 0.25` for height, `c2 = 0.20` for period,
 * `c3 = 30°` for direction). `tests/unit/model-agreement.test.ts` holds that
 * worked example as an oracle, so this number cannot drift away from the
 * document that justifies it.
 */
export const DISAGREEMENT_THRESHOLD = 0.5;

/**
 * How the models compared, as three mutually exclusive readings.
 *
 * `not_comparable` is the honest half of a real ambiguity. Zero spread terms
 * mean either perfect agreement or that fewer than two members could see this
 * spot at all, and `members_used` is not published. A single member caps
 * `c_spread` at 0.4 (section 7.5's `f(M)`), so a zero-term row that still
 * reached a level above `low` must have had two or more members. Zero terms
 * with `low` therefore cannot be claimed as agreement, and this type refuses
 * to let a caller say it did.
 *
 * `unknown` is for a surface committed before `confidence_reason` existed. It
 * is never produced by `modelAgreement`, only constructed at a call site that
 * genuinely has no terms to read.
 */
export type ModelAgreement =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'not_comparable' }
  | { readonly kind: 'compared'; readonly agree: readonly SpreadVariable[]; readonly disagree: readonly SpreadVariable[] };

/** Every variable lands in exactly one side, by construction. */
export function modelAgreement(terms: SpreadTerms, level: ConfidenceLevel): ModelAgreement {
  if (isSilent(terms) && level === 'low') return { kind: 'not_comparable' };
  return {
    kind: 'compared',
    agree: SPREAD_VARIABLES.filter((variable) => terms[variable] <= DISAGREEMENT_THRESHOLD),
    disagree: SPREAD_VARIABLES.filter((variable) => terms[variable] > DISAGREEMENT_THRESHOLD),
  };
}

function isSilent(terms: SpreadTerms): boolean {
  return SPREAD_VARIABLES.every((variable) => terms[variable] === 0);
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function angleDistance(first: number, second: number): number {
  return Math.abs(((first - second + 540) % 360) - 180);
}

function absoluteSpreadTerms(members: MemberRow[]): { height: number; period: number; direction: number } {
  if (members.length < 2) return { height: 0, period: 0, direction: 0 };
  const heights = members.map((member) => member.swell.h_m);
  const periods = members.map((member) => member.swell.t_s);
  const directions = members.map((member) => member.swell.dir_deg);
  const maxDirectionDistance = directions.flatMap((direction, index) =>
    directions.slice(index + 1).map((other) => angleDistance(direction, other)),
  ).reduce((maximum, distance) => Math.max(maximum, distance), 0);
  const heightMean = heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const periodMean = periods.reduce((sum, value) => sum + value, 0) / periods.length;
  return {
    height: (standardDeviation(heights) / heightMean / 0.25) ** 2,
    period: (standardDeviation(periods) / periodMean / 0.2) ** 2,
    direction: (maxDirectionDistance / 30) ** 2,
  };
}

function absoluteSpread(members: MemberRow[]): number {
  const terms = absoluteSpreadTerms(members);
  const value = Math.exp(-(terms.height + terms.period + terms.direction));
  return members.length < 2 ? Math.min(value, 0.4) : value;
}

function dominantSpreadTerm(
  terms: { height: number; period: number; direction: number },
  c_track: number,
  c_fresh: number | null,
): ConfidenceResult['dominant'] {
  const candidates: [ConfidenceResult['dominant'], number][] = [
    ['spread_height', terms.height],
    ['spread_period', terms.period],
    ['spread_direction', terms.direction],
    ['track', -Math.log(c_track)],
  ];
  if (c_fresh !== null) candidates.push(['freshness', -Math.log(c_fresh)]);
  const dominant = candidates.reduce((current, candidate) => candidate[1] > current[1] ? candidate : current);
  return dominant[1] > 0 ? dominant[0] : null;
}
