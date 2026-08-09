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

/** schema spot-correction/1; null = no file (the launch state). */
export type CorrectionRecord = {
  spot_id: string;
  schema: 'spot-correction/1';
  score_delta?: {
    b: number;
    units: 'display_points';
    se: number;
    n: number;
    reporters: number;
    applied: boolean;
  };
  bias?: unknown;
  clamp?: { max_abs_h_frac: number };
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

export function applyCorrection(
  seed: SpotSeed,
  _correction: CorrectionRecord | null,
): CorrectionOutcome {
  return {
    params: paramsFrom(seed),
    memberHBias: () => 0,
    delta_q: 0,
    gate: 'no_file',
  };
}

export function sizeBand(h_eff_m: number, bands: SizeBandTable): string {
  return bands.find((band) => h_eff_m > band.lo_m && h_eff_m <= band.hi_m)?.band
    ?? bands[bands.length - 1]!.band;
}
