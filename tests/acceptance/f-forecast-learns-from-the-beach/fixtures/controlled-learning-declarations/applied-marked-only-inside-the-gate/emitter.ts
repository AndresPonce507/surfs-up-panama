// Prepared fixture, never production code, never imported by a test.
// The emitter carries the gate's verdict through. It cannot invent the applied
// state, only pass on the one the gate produced, so it is not a marking site.

import { gateCorrection } from './gates';

export function emitCorrectionKey(input: {
  n: number;
  reporters: number;
  b: number;
  se: number;
}): { b: number; se: number; n: number; reporters: number; applied: boolean } {
  const verdict = gateCorrection(input);
  return {
    b: input.b,
    se: input.se,
    n: input.n,
    reporters: input.reporters,
    applied: verdict.applied,
  };
}
