// The publication gates, 06-learning-layer.md section 7: the exact
// conditions under which a correction key may be marked applied. This module
// is the ONE place in the shipped source allowed to construct that state
// (src/learning/declarations.ts's whole-source examination, 01-02 through
// 01-04, enforces that structurally over every file under src/, this one
// included -- the module basename "gates" is the name that examination
// privileges).
//
// This module owes G1 and G2 (06 section 7). G1: fewer than 10 paired
// mornings and nothing may be evaluated further, whatever the residuals look
// like. G2: fewer than 5 distinct trust-eligible reporters and nothing may be
// evaluated further either, whatever the morning count looks like -- ten
// mornings from one enthusiastic person is one person's eye, ten times, not
// evidence. 09 section 13.2 puts the halving of observer bias at four to nine
// distinct people; five is the bottom of that band, and the design rule is
// verbatim "prefer 8 reports from 8 people over 20 from 2". Stated honestly,
// because it matters for what this gate is and is not: distinctness over
// freely mintable identities is NOT an anti-gaming control (research 15
// section 11.2) -- trust eligibility (landed at 01-16, firing at 01-17) is
// the repair, and it ships inactive here, so this launch behaviour reads
// distinctness over every reporter, not yet only eligible ones.
//
// G3 (06 section 7; 09 section 13.3): a difference no larger than twice its
// stored standard error is indistinguishable from noise, whatever G1 and G2
// already cleared, and may never be marked applied. The stored error is the
// larger of the sample error and the physical noise floor, so coordinated
// agreement cannot buy a precision the measurement cannot honestly support.
//
// The rest of the table is later steps' TDD cycles, each adding its own
// failing test before it adds a line here -- not hinted at, not scaffolded,
// in this module ahead of a red test that needs it.

import { G1_MIN_MORNINGS, SIGMA_EFF } from "./constants";
import { gateStandardError } from "./estimate";

/** G2, 06 section 7: fewer distinct reporter_key values than this and a key may never be marked applied. */
export const G2_MIN_REPORTERS = 5;

/** G3, 06 section 7: a difference must clear this many multiples of its own stored standard error to be significant. */
export const G3_SIGNIFICANCE_MULTIPLE = 2;

/** What one gate call needs to know about a key: everything G1 through G3 read from (06 section 7). */
export type GateInput = {
  readonly n: number;
  readonly reporters: number;
  readonly b: number;
  /** Sample-only error before the physical floor is applied. */
  readonly se: number;
  /** Single-sample physical uncertainty for the claim; height remains the legacy default. */
  readonly sigma_eff?: number;
};

/** The gate's verdict: whether the key may be marked applied, and why (or why not). */
export type GateVerdict = {
  readonly applied: boolean;
  readonly reason: string;
  readonly se: number;
};

export function gateCorrection(input: GateInput): GateVerdict {
  const se = gateStandardError(
    input.se,
    input.sigma_eff ?? SIGMA_EFF.height.value,
    input.n,
  );
  if (input.n < G1_MIN_MORNINGS) {
    return { applied: false, reason: "n_lt_10", se };
  }
  if (input.reporters < G2_MIN_REPORTERS) {
    return { applied: false, reason: "reporters_lt_5", se };
  }
  if (Math.abs(input.b) <= G3_SIGNIFICANCE_MULTIPLE * se) {
    return { applied: false, reason: "not_significant", se };
  }
  return { applied: true, reason: "applied", se };
}
