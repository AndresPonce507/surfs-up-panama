// Declared-law tests for the publication gate ladder itself
// (src/learning/gates.ts), 06-learning-layer.md section 7. This step (01-06)
// owes exactly G2: fewer than five distinct trust-eligible reporters and a
// key may never be marked applied, whatever its morning count, difference,
// or standard error look like.
//
// Test paradigm, per this step's own design notes: the gate ladder is a
// declared law, so the point is proven as a fast-check property over
// generated (n, reporters, b, se) tuples, asserting that `applied` implies
// every clause established so far held. The specific fixture counts --
// this step's own acceptance scenario numbers -- are the example.
//
// Layer: unit, pure function only. gateCorrection reads nothing but its
// four input fields; no store, no clock, no ambient world.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { gateCorrection } from '../../src/learning/gates';
import { G1_MIN_MORNINGS } from '../../src/learning/constants';

/** This step's own required floor (06 section 7; 09 section 13.2 puts the
 *  halving of observer bias at four to nine distinct people, five is the
 *  bottom of that band). Held here, not imported from production, so this
 *  test still pins the number the design document states even if a typo
 *  ever drifted the constant gates.ts carries. */
const REQUIRED_DISTINCT_REPORTERS = 5;

const someB = fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true });
const someSe = fc.double({ min: 0, max: 2, noNaN: true, noDefaultInfinity: true });

describe('gateCorrection: the declared law -- applied implies every established clause held', () => {
  it('never returns applied: true unless both n clears G1 and reporters clears G2, for any generated tuple', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 50 }),
        someB,
        someSe,
        (n, reporters, b, se) => {
          const verdict = gateCorrection({ n, reporters, b, se });
          if (verdict.applied) {
            assert.ok(n >= G1_MIN_MORNINGS, `applied: true must never happen with n (${n}) below G1's floor (${G1_MIN_MORNINGS})`);
            assert.ok(
              reporters >= REQUIRED_DISTINCT_REPORTERS,
              `applied: true must never happen with reporters (${reporters}) below G2's floor (${REQUIRED_DISTINCT_REPORTERS})`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('gateCorrection: G2, the point -- distinct reporters is a floor independent of morning count', () => {
  it('refuses whatever the morning count looks like, deliberately generating many mornings paired with few people', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: G1_MIN_MORNINGS, max: 1000 }), // many mornings, always clearing G1 on its own
        fc.integer({ min: 0, max: REQUIRED_DISTINCT_REPORTERS - 1 }), // few people, always short of G2
        someB,
        someSe,
        (n, reporters, b, se) => {
          const verdict = gateCorrection({ n, reporters, b, se });
          assert.equal(
            verdict.applied,
            false,
            `${n} mornings from only ${reporters} distinct people must never be marked applied, however many mornings pile up`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('gateCorrection: this step\'s own acceptance numbers, as fixture examples', () => {
  it('refuses twelve mornings from three people, and the reason names the reporters, not the mornings', () => {
    const verdict = gateCorrection({ n: 12, reporters: 3, b: 0.22, se: 0.05 });
    assert.equal(verdict.applied, false, 'twelve mornings clears G1, but three distinct reporters must still refuse it at G2');
    assert.equal(verdict.reason, 'reporters_lt_5', 'the refusal reason must point at the reporter count, not the morning count G1 already cleared');
  });

  it('turns on exactly at the boundary: four reporters still refuses, five (with the same ten mornings) applies', () => {
    const oneShort = gateCorrection({ n: 10, reporters: 4, b: 0.22, se: 0.05 });
    assert.equal(oneShort.applied, false, 'four distinct reporters is one short of G2, however comfortably G1 is cleared');
    assert.equal(oneShort.reason, 'reporters_lt_5');

    const atBoundary = gateCorrection({ n: 10, reporters: 5, b: 0.22, se: 0.05 });
    assert.equal(atBoundary.applied, true, 'ten mornings and five distinct reporters is the minimum evidence this step owes a pass on');
  });
});
