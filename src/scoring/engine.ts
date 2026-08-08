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

export const __SCAFFOLD__ = true;

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

// ---------- scaffold thrower ----------

function notImplemented(fn: string): never {
  // Thrown as the active-RED signal: the behaviour is missing, the test is
  // correct. Classified RED (assertion-class failure), never BROKEN.
  throw new Error(
    `__SCAFFOLD__ assertion: ${fn} is not implemented yet. ` +
      'This seam is authored by DISTILL; DELIVER slice-01 makes it real.',
  );
}

// ---------- the pure functions (05 sections 3, 3.3, 3.4, 5, 7) ----------

export function sDir(_swellDir: number, _p: EffectiveSpotParams): number {
  return notImplemented('sDir');
}

export function hEff(_h_m: number, _t_s: number): number {
  return notImplemented('hEff');
}

export function sSize(_h_eff: number, _p: EffectiveSpotParams): number {
  return notImplemented('sSize');
}

export function sWind(_w: WindObs | null, _p: EffectiveSpotParams): number | null {
  return notImplemented('sWind');
}

export function sTide(_t: TideObs | null, _p: EffectiveSpotParams): number | null {
  return notImplemented('sTide');
}

export function combine(_sub: SubScores, _p: EffectiveSpotParams, _delta_q: number): ScoreResult {
  return notImplemented('combine');
}

export function blend(_members: MemberRow[]): BlendResult {
  return notImplemented('blend');
}

export function rankSpots(
  _values: { spot_id: string; v: number }[],
): { spot_id: string; rank: number }[] {
  return notImplemented('rankSpots');
}

export function applyCorrection(
  _seed: SpotSeed,
  _correction: CorrectionRecord | null,
): CorrectionOutcome {
  return notImplemented('applyCorrection');
}

export function sizeBand(_h_eff_m: number, _bands: SizeBandTable): string {
  return notImplemented('sizeBand');
}
