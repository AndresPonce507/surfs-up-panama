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

import { gateCorrection, G3_SIGNIFICANCE_MULTIPLE } from '../../src/learning/gates';
import { gateStandardError, physicalNoiseFloor } from '../../src/learning/estimate';
import { G1_MIN_MORNINGS, SIGMA_EFF, TAU_SPOT_PRIOR } from '../../src/learning/constants';
import { shrinkTowardParent } from '../../src/learning/shrink';

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
            assert.ok(
              Math.abs(b) > G3_SIGNIFICANCE_MULTIPLE * se,
              `applied: true must never happen with a difference (${b}) that does not clear ${G3_SIGNIFICANCE_MULTIPLE} times its own standard error (${se})`,
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

describe('gateCorrection: G3, the point -- significance is a floor independent of n and reporters', () => {
  it('refuses whatever n and reporters look like, deliberately generating a difference that never clears twice its own se', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: G1_MIN_MORNINGS, max: 1000 }), // always clears G1 on its own
        fc.integer({ min: REQUIRED_DISTINCT_REPORTERS, max: 50 }), // always clears G2 on its own
        fc.double({ min: 0, max: 2, noNaN: true, noDefaultInfinity: true }), // se
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }), // a fraction of 2*se, never exceeding it
        (n, reporters, se, fractionOfTwiceSe) => {
          const b = fractionOfTwiceSe * G3_SIGNIFICANCE_MULTIPLE * se;
          const verdict = gateCorrection({ n, reporters, b, se });
          assert.equal(
            verdict.applied,
            false,
            `a difference of ${b} against a standard error of ${se} does not clear ${G3_SIGNIFICANCE_MULTIPLE} times that error, so it must never be marked applied however comfortably ${n} mornings from ${reporters} reporters clears G1 and G2`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('gateCorrection: G3 physical noise floor -- agreement cannot buy precision below the measurement itself', () => {
  it('records the exact height floor and refuses the twenty-two-morning, seven-person zero-spread fixture', () => {
    const n = 22;
    const floor = physicalNoiseFloor(SIGMA_EFF.height.value, n);
    const verdict = gateCorrection({ n, reporters: 7, b: -0.08, se: 0, sigma_eff: SIGMA_EFF.height.value });

    assert.equal(verdict.applied, false, 'twenty-two perfectly agreeing reports cannot make an eight-centimetre difference significant');
    assert.equal(verdict.reason, 'not_significant');
    assert.ok(Math.abs(verdict.se - floor) < 1e-6, `stored se must be the physical floor ${floor}, not the zero sample error`);
  });

  it('makes every sub-physical spread share one stored error and one gate outcome, however closely reports agree', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: G1_MIN_MORNINGS, max: 500 }),
        fc.integer({ min: REQUIRED_DISTINCT_REPORTERS, max: 50 }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (n, reporters, firstFraction, secondFraction) => {
          const floor = physicalNoiseFloor(SIGMA_EFF.height.value, n);
          const lowerSampleError = Math.min(firstFraction, secondFraction) * floor;
          const higherSampleError = Math.max(firstFraction, secondFraction) * floor;
          const b = G3_SIGNIFICANCE_MULTIPLE * floor;
          const lowerSpread = gateCorrection({ n, reporters, b, se: lowerSampleError, sigma_eff: SIGMA_EFF.height.value });
          const higherSpread = gateCorrection({ n, reporters, b, se: higherSampleError, sigma_eff: SIGMA_EFF.height.value });

          assert.equal(lowerSpread.se, floor, 'a below-floor spread must store the physical floor');
          assert.equal(higherSpread.se, floor, 'less agreement below the same floor must store that same physical floor');
          assert.equal(lowerSpread.applied, higherSpread.applied, 'dropping a sub-physical spread must never make the gate easier to pass');
          assert.equal(lowerSpread.applied, false, 'a difference exactly at twice the floor still has not cleared G3');
          assert.equal(
            gateStandardError(lowerSampleError, SIGMA_EFF.height.value, n),
            lowerSpread.se,
            'the pure stored-error function and the gate must share exactly one floor calculation',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('refuses every zero-spread difference under the physical floor across the same counts and reporters as the nightly-fit property', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 40 }),
        fc.integer({ min: REQUIRED_DISTINCT_REPORTERS, max: 9 }),
        fc.double({ min: 0.01, max: 0.95, noNaN: true, noDefaultInfinity: true }),
        (n, reporters, fractionOfThreshold) => {
          // With zero spread, the gate's standard error is exactly its physical
          // floor. Twice that floor is sigma_eff / sqrt(n), so this generated
          // difference remains strictly below G3's significance threshold.
          const threshold = SIGMA_EFF.height.value / Math.sqrt(n);
          const b = fractionOfThreshold * threshold;
          const verdict = gateCorrection({ n, reporters, b, se: 0, sigma_eff: SIGMA_EFF.height.value });

          assert.equal(verdict.se, physicalNoiseFloor(SIGMA_EFF.height.value, n), 'zero spread must still store the physical floor');
          assert.equal(
            verdict.applied,
            false,
            `${n} perfectly agreeing mornings from ${reporters} people with difference ${b} below ${threshold} must never be publishable`,
          );
          assert.equal(verdict.reason, 'not_significant', 'G1 and G2 clear, so the physical floor must be the refusal reason');
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('shrinkTowardParent: G4 corridor -- the stored difference stays between its raw estimate and parent', () => {
  it('keeps generated 10-to-40-morning height differences inside the zero-parent corridor, across every required count, spread, and difference', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 40 }),
        fc.double({ min: 0.05, max: 1.2, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 0.3, noNaN: true, noDefaultInfinity: true }),
        (count, biggerThanForecastM, spreadM) => {
          // The acceptance fixture's convention is forecast minus observed,
          // hence reports bigger than forecast yield a negative raw difference.
          // Its alternating spread cancels for even counts and leaves one
          // same-signed half-spread divided by count for odd counts.
          const residualSpread = count % 2 === 0 ? 0 : spreadM / count;
          const rawDifference = -biggerThanForecastM + residualSpread;
          const storedDifference = shrinkTowardParent(rawDifference, count, TAU_SPOT_PRIOR, 0);

          assert.ok(
            Math.abs(storedDifference) <= Math.abs(rawDifference) + Number.EPSILON,
            `the stored difference ${storedDifference} must not exceed raw ${rawDifference} after ${count} mornings`,
          );
          assert.ok(
            storedDifference * rawDifference >= 0,
            `the stored difference ${storedDifference} must not flip raw ${rawDifference}'s sign after ${count} mornings`,
          );
        },
      ),
      { numRuns: 20 },
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

  it('refuses this step\'s own fixture, twenty-two mornings from seven people differing by three centimetres, and names the reason significance', () => {
    // 22 mornings, spread 0.42, clearing G1 and G2 comfortably: b = -0.03 m,
    // se_sample = 0.42 / sqrt(22) = 0.0895 m, twice that is 0.179 m -- well
    // above the 0.03 m difference, so this refusal is G3's, not G1's or G2's.
    const verdict = gateCorrection({ n: 22, reporters: 7, b: -0.03, se: 0.0895 });
    assert.equal(
      verdict.applied,
      false,
      'a three-centimetre difference against a standard error of nine centimetres does not clear twice that error',
    );
    assert.equal(
      verdict.reason,
      'not_significant',
      'the refusal reason must point at significance, not at the morning or reporter count G1 and G2 already cleared',
    );
  });

  it('turns on exactly at the significance boundary: a difference at twice se still refuses, a hair beyond it applies', () => {
    const storedSe = physicalNoiseFloor(SIGMA_EFF.height.value, 22);
    const atBoundary = gateCorrection({ n: 22, reporters: 7, b: G3_SIGNIFICANCE_MULTIPLE * storedSe, se: 0.05 });
    assert.equal(atBoundary.applied, false, 'a difference exactly twice its standard error has not cleared it, only reached it');
    assert.equal(atBoundary.reason, 'not_significant');

    const justBeyond = gateCorrection({ n: 22, reporters: 7, b: G3_SIGNIFICANCE_MULTIPLE * storedSe + 1e-9, se: 0.05 });
    assert.equal(justBeyond.applied, true, 'a difference a hair beyond twice its standard error has cleared it');
  });
});

describe('two-level launch shrinkage: a one-spot parent is the spot mean', () => {
  it('keeps every raw difference inside its own corridor when the only examined spot also defines the parent', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -4, max: 4, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 500 }),
        (rawDifference, sampleCount) => {
          // In a one-spot region the group-weighted parent is that spot's raw
          // mean. This proves the launch hierarchy is identity here without
          // replacing the parent with a made-up zero.
          const parentMean = rawDifference;
          const storedDifference = shrinkTowardParent(rawDifference, sampleCount, TAU_SPOT_PRIOR, parentMean);

          assert.ok(
            Math.abs(storedDifference) <= Math.abs(rawDifference) + Number.EPSILON,
            `stored difference ${storedDifference} must not exceed raw difference ${rawDifference}`,
          );
          assert.ok(
            storedDifference * rawDifference >= 0,
            `stored difference ${storedDifference} must not flip raw difference ${rawDifference}`,
          );
          assert.ok(
            Math.abs(storedDifference - rawDifference) <= Number.EPSILON,
            'one-spot pooling must retain the spot mean because its parent is the same mean',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
