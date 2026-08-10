// Prepared fixture, never production code, never imported by a test.
//
// The break this universe exists to have refused: a categorical-wind residual
// form has been added, so wind now makes a numeric claim, but no noise floor
// for wind was declared. Its significance gate would then rest on the sample's
// own agreement alone, which is the exact vulnerability the floor removes and
// the exact gap that once opened by silence (06-learning-layer.md section 8).

export const RESIDUAL_FORMS = ['r_height', 'r_score', 'r_wind'] as const;

export const SIGMA_EFF: Record<string, { value: number; derived_from: string }> = {
  height: { value: 0.48, derived_from: 'height-error-decomposition' },
  score: { value: 25, derived_from: 'one-quality-anchor-step' },
};

export type GateVerdict = { applied: boolean; reason: string };

export function gateCorrection(input: {
  n: number;
  reporters: number;
  b: number;
  se: number;
}): GateVerdict {
  if (input.n < 10) return { applied: false, reason: 'n_lt_10' };
  if (input.reporters < 5) return { applied: false, reason: 'reporters_lt_5' };
  if (Math.abs(input.b) <= 2 * input.se) return { applied: false, reason: 'not_significant' };
  return { applied: true, reason: 'applied' };
}
