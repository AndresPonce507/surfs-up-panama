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
// G3 (significance against the standard-error floor) and the rest of the
// table are later steps' TDD cycles, each adding its own failing test before
// it adds a line here -- not hinted at, not scaffolded, in this module ahead
// of a red test that needs it.

import { G1_MIN_MORNINGS } from './constants';

/** G2, 06 section 7: fewer distinct reporter_key values than this and a key may never be marked applied. */
export const G2_MIN_REPORTERS = 5;

/** What one gate call needs to know about a key: everything G1 through G3 read from (06 section 7). */
export type GateInput = { readonly n: number; readonly reporters: number; readonly b: number; readonly se: number };

/** The gate's verdict: whether the key may be marked applied, and why (or why not). */
export type GateVerdict = { readonly applied: boolean; readonly reason: string };

export function gateCorrection(input: GateInput): GateVerdict {
  if (input.n < G1_MIN_MORNINGS) {
    return { applied: false, reason: 'n_lt_10' };
  }
  if (input.reporters < G2_MIN_REPORTERS) {
    return { applied: false, reason: 'reporters_lt_5' };
  }
  return { applied: true, reason: 'applied' };
}
