// Scoring engine seam. RED SCAFFOLD, created by DISTILL 2026-08-08.
//
// The signatures below are the declared contract of
// docs/product/architecture/05-scoring-engine.md sections 3, 3.3, 3.4, 5 and 7.
// Every body throws: the acceptance and property tests in tests/ run against
// these seams and fail on the missing behaviour (active-RED, never skipped,
// never an import error). DELIVER slice-01 replaces the bodies and removes
// the __SCAFFOLD__ marker; the tests are not allowed to change.
//
// Purity contract (05 section 3): every function here is total and pure. No
// I/O, no clock, no config lookup, no ambient reads. Inputs in, value out.
//
// The learning imports below are pure too, and deliberate. applyCorrection
// must enforce the SAME ladder the nightly fit enforced, so it calls that
// ladder rather than restating it -- a second copy of the gate arithmetic
// living here is precisely how apply and fit would silently drift apart.
// src/learning/residuals.ts already imports hEff from this module for the
// same reason in the other direction, and the graph stays acyclic: gates and
// constants reach no further than each other and estimate.

import { SIGMA_EFF } from '../learning/constants';
import type { GatedKey, StoredCorrection } from '../learning/correction-file';
import { gateCorrection, type GateInput } from '../learning/gates';

/** domain-model.md section 11: a stored score move is stated in display points, and Q is that scale over 100. */
const DISPLAY_POINTS_PER_Q_UNIT = 100;

/**
 * The metres subtracted from every member's height, at every model and every
 * lead bucket, whatever a correction file states: none.
 *
 * G5 (06 section 7) bounds a stored height move at forty percent of the
 * member's OWN height, and it is the half of that rule that makes the other
 * half safe to ship. This port is handed a model and a lead time and never
 * the member's height, so the fraction can only be taken at the one call site
 * that knows it, src/pipeline/build.ts. Subtracting the stored metres here
 * while their bound waits for that call site would leave the layer able to
 * order an absurd wave height for as long as the window stayed open, on a
 * product whose one rule is to never claim more certainty than the data
 * earns. So the metres and their clamp ship together, in the change that
 * teaches this port the member's height, or not at all. Until then the height
 * a surfer reads is the forecast day zero published, which is never a lie.
 *
 * This is a stated refusal, not an unwritten feature: the acceptance example
 * and the property in tests/unit/learning-apply-recheck.test.ts both drive a
 * record whose height keys clear every rung on their own evidence and require
 * exactly zero back.
 */
const NO_MEMBER_HEIGHT_CORRECTION = (): number => 0;

// ---------- input types (05 section 3) ----------

export type SwellTrain = { h_m: number; t_s: number; dir_deg: number };
export type WindObs = { speed_kt: number; dir_deg: number };
export type TideObs = { height_m: number; day_low_m: number; day_high_m: number };

/** One usable prediction-log row, post land-mask filter. */
export type MemberRow = {
  source: string;
  lead_h: number;
  swell: SwellTrain;
  swell2: SwellTrain | null;
};

/** A declared member omitted from the blend with an explicit reason. */
export type ExcludedMember = {
  source: string;
  exclusion: 'land_masked' | 'unavailable';
};

/** The full declared member universe, never only the usable observations. */
export type DeclaredMember = MemberRow | ExcludedMember;

/** Output of applyCorrection(seed, correction), 05 section 5. */
export type EffectiveSpotParams = {
  /** Clockwise span theta_min -> theta_max, may wrap 360. */
  swell_window_deg: [number, number];
  sigma_dir_deg: number;
  h_ref_m: number;
  s_size: number;
  shore_normal_deg: number;
  wind: { u_star_kt: number; k_on_kt: number; k_off_kt: number; k_cross_kt: number };
  tide: { eta_opt: number; sigma_eta: number; neutral: boolean };
  weights: { w_size: number; w_wind: number; w_tide: number };
};

// ---------- output types ----------

/** Present factors in [0, 1]; null = observation unavailable, never 0, never a fabricated 1. */
export type SubScores = { dir: number; size: number; wind: number | null; tide: number | null };
export type Factor = 'dir' | 'size' | 'wind' | 'tide';
export type CorrectionGate = 'no_file' | 'n_lt_10' | 'reporters_lt_5' | 'not_significant' | 'applied';

export type ScoreResult = {
  /** [0, 1], pre-correction. */
  q: number;
  /** [0, 1], post-correction. */
  q_final: number;
  /** Integer 0..100 = Math.round(100 * q_final). Published verbatim as score_q. */
  score: number;
  h_eff_m: number;
  sub: SubScores;
  missing: ('wind' | 'tide')[];
  /** Sorted descending; no entry for a null factor. */
  damages: { factor: Factor; damage: number }[];
  /** null iff all damages are 0; never a null factor. */
  weakest_link: Factor | null;
  correction: { delta_q: number; gate: CorrectionGate };
};

/** A correction-aware score from the same model with its named weakness removed. */
export type CounterfactualScore = {
  /** Unrounded [0, 1] model score, kept in the scoring core for law checks. */
  q_without: number;
  /** Published integer counterpart on the existing score_q scale. */
  score_q: number;
};

export type BlendResult =
  | { kind: 'ok'; swell: SwellTrain; members_used: number; members_null: number }
  | { kind: 'no_usable_members'; members_null: number };

// ---------- spot seed and correction (domain-model section 11) ----------

export type SpotSeed = {
  spot_id: string;
  name: string;
  region_id: string;
  timezone: string;
  shore_normal_deg: number;
  swell_window_deg: [number, number];
  h_ref_m: number;
  s_size: number;
  wind_optimum: { u_star_kt: number; k_on_kt: number; k_off_kt: number; k_cross_kt: number };
  tide: {
    optimum: 'low' | 'mid_rising' | 'mid_falling' | 'high';
    sigma: 'narrow' | 'wide';
    range_class: 'micro' | 'meso' | 'macrotidal' | 'macro';
  };
};

export type CorrectionOutcome = {
  params: EffectiveSpotParams;
  /** Metres to SUBTRACT from a member's h_m; identically 0 unless gated in. */
  memberHBias: (source: string, lead_h: number) => number;
  /** Score-level delta in Q units; 0 unless gated in. */
  delta_q: number;
  gate: CorrectionGate;
};

// ---------- size bands (domain-model section 7.2; intervals (lo, hi]) ----------

export type SizeBandRow = { band: string; lo_m: number; hi_m: number };
export type SizeBandTable = readonly SizeBandRow[];

// ---------- the pure functions (05 sections 3, 3.3, 3.4, 5, 7) ----------

const FACTOR_ORDER: readonly Factor[] = ['dir', 'size', 'wind', 'tide'];
const CANONICAL_ANGLE_DECIMAL_PLACES = 10;

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

function angularDifference(first: number, second: number): number {
  return Number(((((first - second + 540) % 360) - 180)).toFixed(CANONICAL_ANGLE_DECIMAL_PLACES));
}

function isInsideClockwiseSpan(angle: number, span: [number, number]): boolean {
  const [start, end] = span;
  if (start <= end) return angle >= start && angle <= end;
  return angle >= start || angle <= end;
}

function paramsFrom(seed: SpotSeed): EffectiveSpotParams {
  return {
    swell_window_deg: seed.swell_window_deg,
    sigma_dir_deg: 20,
    h_ref_m: seed.h_ref_m,
    s_size: seed.s_size,
    shore_normal_deg: seed.shore_normal_deg,
    wind: seed.wind_optimum,
    tide: {
      eta_opt: seed.tide.optimum === 'low' ? 0.1 : seed.tide.optimum === 'high' ? 0.9 : 0.5,
      sigma_eta: seed.tide.sigma === 'narrow' ? 0.15 : 0.35,
      neutral: seed.tide.range_class === 'micro',
    },
    weights: { w_size: 0.4, w_wind: 0.4, w_tide: 0.2 },
  };
}

export function sDir(swellDir: number, p: EffectiveSpotParams): number {
  if (isInsideClockwiseSpan(swellDir, p.swell_window_deg)) return 1;
  const [start, end] = p.swell_window_deg;
  const distance = Math.min(
    Math.abs(angularDifference(swellDir, start)),
    Math.abs(angularDifference(swellDir, end)),
  );
  return Math.exp(-((distance / p.sigma_dir_deg) ** 2));
}

export function hEff(h_m: number, t_s: number): number {
  return h_m * Math.sqrt(t_s / 10);
}

export function sSize(h_eff: number, p: EffectiveSpotParams): number {
  if (h_eff === 0) return 0;
  return Math.exp(-0.5 * (Math.log(h_eff / p.h_ref_m) / p.s_size) ** 2);
}

export function sWind(wind: WindObs | null, p: EffectiveSpotParams): number | null {
  if (wind === null) return null;
  const relativeRadians = angularDifference(wind.dir_deg, p.shore_normal_deg) * Math.PI / 180;
  const offshore = -wind.speed_kt * Math.cos(relativeRadians);
  const cross = wind.speed_kt * Math.abs(Math.sin(relativeRadians));
  const penalty = (Math.max(0, -offshore) / p.wind.k_on_kt) ** 2
    + (Math.max(0, offshore - p.wind.u_star_kt) / p.wind.k_off_kt) ** 2
    + (cross / p.wind.k_cross_kt) ** 2;
  return Math.exp(-penalty);
}

export function sTide(tide: TideObs | null, p: EffectiveSpotParams): number | null {
  if (tide === null) return null;
  if (p.tide.neutral) return 1;
  const range = tide.day_high_m - tide.day_low_m;
  const stage = range === 0
    ? p.tide.eta_opt
    : clamp((tide.height_m - tide.day_low_m) / range, 0, 1);
  return Math.exp(-0.5 * ((stage - p.tide.eta_opt) / p.tide.sigma_eta) ** 2);
}

export function combine(sub: SubScores, p: EffectiveSpotParams, delta_q: number): ScoreResult {
  const factors: { factor: Exclude<Factor, 'dir'>; score: number; weight: number }[] = [
    { factor: 'size', score: sub.size, weight: p.weights.w_size },
    ...(sub.wind === null ? [] : [{ factor: 'wind' as const, score: sub.wind, weight: p.weights.w_wind }]),
    ...(sub.tide === null ? [] : [{ factor: 'tide' as const, score: sub.tide, weight: p.weights.w_tide }]),
  ];
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const geometricMean = factors.some((factor) => factor.score === 0)
    ? 0
    : Math.exp(factors.reduce((sum, factor) => sum + factor.weight * Math.log(factor.score), 0) / totalWeight);
  const q = sub.dir * geometricMean;
  const q_final = clamp(q + delta_q, 0, 1);
  const damages = [
    { factor: 'dir' as const, damage: -Math.log(sub.dir) },
    ...factors.map((factor) => ({
      factor: factor.factor,
      damage: factor.weight / totalWeight * -Math.log(factor.score),
    })),
  ].sort((left, right) => right.damage - left.damage || FACTOR_ORDER.indexOf(left.factor) - FACTOR_ORDER.indexOf(right.factor));
  const weakest = damages.find((damage) => damage.damage > 0)?.factor ?? null;

  return {
    q,
    q_final,
    score: Math.round(100 * q_final),
    h_eff_m: 0,
    sub,
    missing: [
      ...(sub.wind === null ? ['wind' as const] : []),
      ...(sub.tide === null ? ['tide' as const] : []),
    ],
    damages,
    weakest_link: weakest,
    correction: { delta_q, gate: 'no_file' },
  };
}

/**
 * Forms the producer-only counterfactual while the exact damages and
 * correction remain in scope. A missing named weakness has no candidate.
 */
export function counterfactualScore(
  result: Pick<ScoreResult, 'sub' | 'damages' | 'weakest_link' | 'correction'>,
): CounterfactualScore | undefined {
  const damages = result.damages;
  const deltaQ = result.correction.delta_q;
  if (!Number.isFinite(deltaQ) || damages.some((item) => !isValidDamage(item))) {
    throw new Error('counterfactual requires non-negative scored damages and finite correction');
  }
  if (new Set(damages.map((item) => item.factor)).size !== damages.length) {
    throw new Error('counterfactual requires each scored factor at most once');
  }
  if (!hasExpectedDamageFactors(damages, result.sub)) {
    throw new Error('counterfactual requires the complete scored-factor receipt for its sub-scores');
  }
  if (!isL10DamageOrder(damages)) {
    throw new Error('counterfactual requires L10-ranked damage receipt');
  }
  const leadingDamage = damages[0]?.damage ?? 0;
  if (result.weakest_link === null) {
    if (leadingDamage > 0) {
      throw new Error('counterfactual requires a named weakest factor for positive damage');
    }
    return undefined;
  }
  if (leadingDamage <= 0) {
    throw new Error('counterfactual requires no named weakest factor for all-zero damage');
  }
  if (damages[0]?.factor !== result.weakest_link) {
    throw new Error('counterfactual requires the named weakest factor to lead its damage receipt');
  }
  const namedDamage = damages.find((item) => item.factor === result.weakest_link);
  if (namedDamage === undefined) {
    throw new Error('counterfactual requires the named weakest factor in its damage receipt');
  }
  const totalDamage = damages.reduce((sum, item) => sum + item.damage, 0);
  const remainingDamage = Number.isFinite(totalDamage) && Number.isFinite(namedDamage.damage)
    ? totalDamage - namedDamage.damage
    : damages
      .filter((item) => item.factor !== result.weakest_link)
      .reduce((sum, item) => sum + item.damage, 0);
  const q_without = clamp(Math.exp(-remainingDamage) + deltaQ, 0, 1);
  return { q_without, score_q: Math.round(100 * q_without) };
}

function isValidDamage(value: { factor: Factor; damage: number }): boolean {
  return FACTOR_ORDER.includes(value.factor) && !Number.isNaN(value.damage) && value.damage >= 0;
}

function hasExpectedDamageFactors(
  damages: readonly { factor: Factor; damage: number }[],
  sub: SubScores,
): boolean {
  const expected = expectedDamageFactors(sub);
  return damages.length === expected.length && expected.every((factor) => damages.some((item) => item.factor === factor));
}

function expectedDamageFactors(sub: SubScores): readonly Factor[] {
  if (!isValidSubScore(sub.dir) || !isValidSubScore(sub.size)
    || (sub.wind !== null && !isValidSubScore(sub.wind))
    || (sub.tide !== null && !isValidSubScore(sub.tide))) {
    throw new Error('counterfactual requires finite unit sub-scores');
  }
  return [
    'dir',
    'size',
    ...(sub.wind === null ? [] : ['wind' as const]),
    ...(sub.tide === null ? [] : ['tide' as const]),
  ];
}

function isValidSubScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isL10DamageOrder(damages: readonly { factor: Factor; damage: number }[]): boolean {
  return damages.every((item, index) => {
    const previous = damages[index - 1];
    if (previous === undefined) return true;
    return previous.damage > item.damage
      || (previous.damage === item.damage && FACTOR_ORDER.indexOf(previous.factor) < FACTOR_ORDER.indexOf(item.factor));
  });
}

export function blend(members: DeclaredMember[]): BlendResult {
  const usable = members.filter((member): member is MemberRow =>
    !('exclusion' in member) && member.swell.h_m >= 0 && member.swell.t_s > 0,
  );
  if (usable.length === 0) return { kind: 'no_usable_members', members_null: members.length };

  const count = usable.length;
  const directionRadians = usable.map((member) => member.swell.dir_deg * Math.PI / 180);
  const direction = Math.atan2(
    directionRadians.reduce((sum, radians) => sum + Math.sin(radians), 0),
    directionRadians.reduce((sum, radians) => sum + Math.cos(radians), 0),
  ) * 180 / Math.PI;
  return {
    kind: 'ok',
    swell: {
      h_m: usable.reduce((sum, member) => sum + member.swell.h_m, 0) / count,
      t_s: usable.reduce((sum, member) => sum + member.swell.t_s, 0) / count,
      dir_deg: (direction + 360) % 360,
    },
    members_used: count,
    members_null: members.length - count,
  };
}

export function rankSpots(
  values: { spot_id: string; v: number }[],
): { spot_id: string; rank: number }[] {
  const sorted = [...values].sort((left, right) => right.v - left.v || left.spot_id.localeCompare(right.spot_id));
  let currentRank = 0;
  return sorted.map((value, index) => {
    if (index === 0 || value.v !== sorted[index - 1]?.v) currentRank = index + 1;
    return { spot_id: value.spot_id, rank: currentRank };
  });
}

/**
 * Read a stored correction, 05 section 5 and 06 sections 4 and 7.
 *
 * THE STORED VERDICT HAS NO POWER. A correction file is data: one process
 * wrote it, another reads it a day later, and the only thing standing between
 * whoever can write that file and a number a surfer reads is this function.
 * So every gate the fit enforced is re-run here from the record's OWN stated
 * evidence -- its morning count, its distinct reporters, its stored standard
 * error -- and the record's `applied` booleans are never consulted at all. A
 * forged file and an honest one are the same shape; only the evidence differs.
 *
 * The ladder itself is not re-implemented here. gateCorrection is imported so
 * that apply and fit inherit the same arithmetic, including both anti-Sybil
 * amendments, and cannot drift apart. Re-flooring an already-floored standard
 * error is the identity, so reading a record twice never hardens it.
 *
 * ONE FILE, ONE VERDICT. The score key is the record's verdict: it is the key
 * a forged file moves a published score with, and build.ts archives exactly
 * one gate per call. A file the score ladder refuses moves nothing at all,
 * height included -- which is what "the waves and score a surfer reads are
 * exactly what day zero published" means. A record stating no score move at
 * all states no evidence this body can weigh, and is refused on the first
 * rung like any other file with too few mornings behind it.
 *
 * SIGN, 06 section 4: the score moves by MINUS the stored points over 100,
 * because residual and bias are forecast minus observed. 05 section 5's
 * delta_q line omits that minus and is stale against 06.
 *
 * G6 (06 section 7) binds here: the score move saturates at the limit the
 * record itself carries, so a corrupt file cannot order an absurd number.
 * G5, its height twin, cannot bind here at all, and so NO HEIGHT MOVES: see
 * NO_MEMBER_HEIGHT_CORRECTION above for why the metres wait for the clamp
 * that bounds them rather than shipping ahead of it.
 *
 * The `applied` token is never written in this file. It is carried out of
 * gateCorrection's verdict, because src/learning/declarations.ts's
 * whole-source examination privileges the gate module's basename and no
 * other, and constructing that token here would make this file a marking site.
 */
export function applyCorrection(
  seed: SpotSeed,
  correction: StoredCorrection | null,
): CorrectionOutcome {
  const params = paramsFrom(seed);
  if (correction === null) {
    return { params, memberHBias: NO_MEMBER_HEIGHT_CORRECTION, delta_q: 0, gate: 'no_file' };
  }

  const verdict = gateCorrection(statedScoreEvidenceOf(correction.score_delta));
  if (!verdict.applied) {
    return { params, memberHBias: NO_MEMBER_HEIGHT_CORRECTION, delta_q: 0, gate: verdict.reason };
  }

  return {
    params,
    memberHBias: NO_MEMBER_HEIGHT_CORRECTION,
    delta_q: storedScoreMoveOf(correction),
    gate: verdict.reason,
  };
}

/** The published score move: MINUS the stored points over 100, bounded by the record's own limit. */
function storedScoreMoveOf(correction: StoredCorrection): number {
  const limit = correction.clamp.max_abs_score;
  const bounded = clamp(correction.score_delta?.b ?? 0, -limit, limit);
  return -bounded / DISPLAY_POINTS_PER_Q_UNIT;
}

/**
 * What the ladder reads off the record's stated score key. A record that
 * states no score move carries no evidence this body can weigh, and a claim
 * with no evidence behind it is refused on the first rung rather than waved
 * through.
 */
function statedScoreEvidenceOf(stated: GatedKey | undefined): GateInput {
  return {
    n: stated?.n ?? 0,
    reporters: stated?.reporters ?? 0,
    b: stated?.b ?? 0,
    se: stated?.se ?? 0,
    sigma_eff: SIGMA_EFF.score.value,
  };
}

export function sizeBand(h_eff_m: number, bands: SizeBandTable): string {
  return bands.find((band) => h_eff_m > band.lo_m && h_eff_m <= band.hi_m)?.band
    ?? bands[bands.length - 1]!.band;
}
