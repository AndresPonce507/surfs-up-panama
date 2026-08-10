// Prepared fixture, never production code, never imported by a test.
//
// The same categorical-wind residual form, shipped the only way it is allowed
// to ship: with a noise floor of its own, in that residual's units, derived
// from how often the three-word wind label itself is misread rather than
// borrowed from height metres (06-learning-layer.md section 8, the binding
// precondition). This universe must be accepted, or the rule would be refusing
// everything and proving nothing.

export const RESIDUAL_FORMS = ['r_height', 'r_score', 'r_wind'] as const;

export const SIGMA_EFF: Record<string, { value: number; derived_from: string }> = {
  height: { value: 0.48, derived_from: 'height-error-decomposition' },
  score: { value: 25, derived_from: 'one-quality-anchor-step' },
  wind: { value: 0.31, derived_from: 'wind-label-confusion-structure' },
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
