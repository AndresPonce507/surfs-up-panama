// Prepared fixture, never production code, never imported by a test.
// The break this universe exists to have refused: the emitter produces the
// applied state itself, so a correction can go live without the gate ever
// having weighed the evidence behind it.

export function emitCorrectionKey(input: {
  n: number;
  reporters: number;
  b: number;
  se: number;
}): { b: number; se: number; n: number; reporters: number; applied: boolean } {
  return {
    b: input.b,
    se: input.se,
    n: input.n,
    reporters: input.reporters,
    applied: true,
  };
}
