// The publication gates, 06-learning-layer.md section 7: the exact
// conditions under which a correction key may be marked applied. This module
// is the ONE place in the shipped source allowed to construct that state
// (src/learning/declarations.ts's whole-source examination, 01-02 through
// 01-04, enforces that structurally over every file under src/, this one
// included -- the module basename "gates" is the name that examination
// privileges).
//
// This step owes exactly G1 (06 section 7): fewer than 10 paired mornings and
// nothing may be evaluated further, whatever the residuals look like. G2
// (distinct trust-eligible reporters), G3 (significance against the
// standard-error floor) and the rest of the table are later steps' TDD
// cycles, each adding its own failing test before it adds a line here -- not
// hinted at, not scaffolded, in this module ahead of a red test that needs it.

import { G1_MIN_MORNINGS } from './constants';

/** What one gate call needs to know about a key: everything G1 through G3 read from (06 section 7). */
export type GateInput = { readonly n: number; readonly reporters: number; readonly b: number; readonly se: number };

/** The gate's verdict: whether the key may be marked applied, and why (or why not). */
export type GateVerdict = { readonly applied: boolean; readonly reason: string };

export function gateCorrection(input: GateInput): GateVerdict {
  if (input.n < G1_MIN_MORNINGS) {
    return { applied: false, reason: 'n_lt_10' };
  }
  return { applied: true, reason: 'applied' };
}
