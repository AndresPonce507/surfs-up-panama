// Prepared fixture, never production code, never imported by a test.
// The one legitimate marking site: the applied state is produced here and
// nowhere else, from the publication gates of 06-learning-layer.md section 7.

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
