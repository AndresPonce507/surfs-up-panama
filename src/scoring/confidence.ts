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
  /** Freshness of the oldest model run that contributes to this call. */
  c_model_fresh: number;
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
    | 'model_freshness'
    | 'missing_data'
    | null;
};

export function confidence(
  members: MemberRow[],
  spread: SpreadInput,
  track: { mae: number; mae_ref: number } | null,
  last_report_age_h: number | null,
  missing: ('wind' | 'tide')[],
  /**
   * The oldest contributing model run's age at build time. `null` preserves
   * the historical core-only call shape; the pipeline must supply a real age
   * from its archived `run_ts` values.
   */
  model_run_age_h: number | null = null,
): ConfidenceResult {
  const c_spread = spread.kind === 'climatology'
    ? spread.pct <= 20 ? 1 : spread.pct < 80 ? 0.7 : 0.35
    : absoluteSpread(members);
  const c_track = track === null ? 1 : clamp(1 - track.mae / track.mae_ref);
  const c_fresh = freshness(last_report_age_h);
  // A model agreement is only as current as its oldest contributing run. The
  // decay and conservative floor deliberately reuse the established report
  // freshness policy, so no new confidence-tuning constant is invented.
  const c_model_fresh = freshness(model_run_age_h) ?? 1;
  const product = c_spread * c_track * (c_fresh ?? 1) * c_model_fresh;
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
    : dominantConfidenceTerm(spread_terms, c_track, c_fresh, c_model_fresh);

  return {
    c_spread,
    c_track,
    c_fresh,
    c_model_fresh,
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
  high: 'Los modelos coinciden bastante y su actualización sigue reciente',
  medium: 'Los modelos coinciden solo en parte o la actualización ya lleva varias horas',
  low: 'Los modelos no coinciden o la actualización ya está vieja',
};

/** Zero beach reports exist in this system today. This sentence stays fixed
 * and honest regardless of level: the level is agreement between forecast
 * models, never a claim that anyone checked the actual waves. */
const NO_BEACH_REPORT_ES =
  'Todavía nadie ha mandado un reporte desde la playa en este spot: esto es solo qué tanto se parecen los modelos entre ellos, no una confirmación real de las condiciones.';

/**
 * The reason text one tap away from every row's confidence word. Pure
 * function of `level` alone: the published bundle carries no continuous
 * `conf_value` and no per-spot spread breakdown (domain-model.md section 13,
 * `conf_value` stays PublishedCall-log-only), so a level-keyed, honestly
 * worded explanation is the only truthful thing this can say.
 */
export function confidenceReasonEs(level: ConfidenceLevel): string {
  return `${MODEL_AGREEMENT_ES[level]}. ${NO_BEACH_REPORT_ES}`;
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function freshness(age_h: number | null): number | null {
  if (age_h === null) return null;
  // A malformed archived stamp is not evidence of freshness. It receives the
  // same conservative floor as a very old, but parseable, model run.
  if (!Number.isFinite(age_h)) return 0.3;
  return Math.max(Math.exp(-Math.max(age_h, 0) / 36), 0.3);
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

function dominantConfidenceTerm(
  terms: { height: number; period: number; direction: number },
  c_track: number,
  c_fresh: number | null,
  c_model_fresh: number,
): ConfidenceResult['dominant'] {
  const candidates: [ConfidenceResult['dominant'], number][] = [
    ['spread_height', terms.height],
    ['spread_period', terms.period],
    ['spread_direction', terms.direction],
    ['track', -Math.log(c_track)],
  ];
  if (c_fresh !== null) candidates.push(['freshness', -Math.log(c_fresh)]);
  candidates.push(['model_freshness', -Math.log(c_model_fresh)]);
  const dominant = candidates.reduce((current, candidate) => candidate[1] > current[1] ? candidate : current);
  return dominant[1] > 0 ? dominant[0] : null;
}
