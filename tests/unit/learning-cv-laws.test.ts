// Property laws for the monthly system-level judge (06-learning-layer.md
// section 7 row G7; adr-correction-gates-and-clamps decision 3;
// wave-decisions.md D-2026-08-12-1). Each law restates a declared rule of
// src/learning/cross-validation.ts over generated inputs, driven only
// through that module's two exported pure functions -- its own driving
// ports -- rather than through any private helper.
//
// Layer: unit, pure functions only. No store, no clock read from the
// ambient environment -- every day a sample needs is a field on a generated
// fixture, never `new Date()`.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  heldOutBlockStart,
  judgeRollingOriginCorrections,
  type DatedResidualSample,
} from '../../src/learning/cross-validation';

const RUNS = 100;

function addUtcDays(day: string, delta: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}

const someIsoDay = fc.integer({ min: 0, max: 3650 }).map((offset) => addUtcDays('2020-01-01', offset));

describe('the rolling origin is the freshest fortnight the system has, and training never touches it (06 section 7 G7)', () => {
  it('sits exactly 13 days before the latest sampled day, and classifies every sampled day as training or held-out, never neither', () => {
    fc.assert(
      fc.property(fc.array(someIsoDay, { minLength: 1, maxLength: 40 }), (days) => {
        const samples: DatedResidualSample[] = days.map((day, index) => ({ key: 'k', day, residual: index }));
        const start = heldOutBlockStart(samples);
        const latestDay = [...days].sort().at(-1)!;
        const expectedStart = addUtcDays(latestDay, -13);

        assert.equal(
          start,
          expectedStart,
          `held-out start must be exactly 13 days before the latest sampled day (${latestDay}); got ${start}`,
        );

        const trainCount = days.filter((day) => day < start!).length;
        const heldOutCount = days.filter((day) => day >= start!).length;
        assert.equal(
          trainCount + heldOutCount,
          days.length,
          'every sampled day must land in exactly one of training or held-out, never neither and never both',
        );
        assert.ok(heldOutCount >= 1, 'the latest sampled day must always fall inside its own held-out block');
      }),
      { numRuns: RUNS },
    );
  });
});

describe('a month judges nothing only when there is nothing to judge (D-2026-08-12-1 pin 2)', () => {
  it('reports not_evaluated exactly when there is no gated correction, or it has no training sample, or no held-out sample', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }).filter((b) => b !== 0),
        (hasGatedCorrection, hasTrainingSample, hasHeldOutSample, b) => {
          const ANCHOR_DAY = '2026-06-01'; // fixes the system's rolling origin regardless of which combination is under test
          const gatedCorrections = new Map<string, number>(hasGatedCorrection ? [['k', b]] : []);
          const samples: DatedResidualSample[] = [
            { key: 'anchor', day: ANCHOR_DAY, residual: 0 },
            ...(hasTrainingSample ? [{ key: 'k', day: '2026-01-01', residual: 0.1 }] : []),
            ...(hasHeldOutSample ? [{ key: 'k', day: ANCHOR_DAY, residual: 0.1 }] : []),
          ];

          const verdict = judgeRollingOriginCorrections({ gatedCorrections, samples });
          const judged = hasGatedCorrection && hasTrainingSample && hasHeldOutSample;

          assert.equal(
            verdict === 'not_evaluated',
            !judged,
            `not_evaluated must hold exactly when nothing was judged (gated=${hasGatedCorrection}, training=${hasTrainingSample}, heldOut=${hasHeldOutSample}); got ${verdict}`,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('a tie between winning and losing keys spares the corrections, never kills them (amended 05-02 criteria: strict majority, not plurality)', () => {
  it('reports corrections-stay whenever exactly half of the judged keys lost, for any even key count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (halfCount) => {
        const gatedCorrections = new Map<string, number>();
        const samples: DatedResidualSample[] = [{ key: 'anchor', day: '2026-06-01', residual: 0 }];
        for (let index = 0; index < halfCount; index += 1) {
          const losingKey = `lose_${index}`;
          const winningKey = `win_${index}`;
          gatedCorrections.set(losingKey, 1);
          gatedCorrections.set(winningKey, 1);
          // losing key: the held-out residual runs opposite the correction's own sign, so subtracting it doubles the miss.
          samples.push({ key: losingKey, day: '2026-01-01', residual: -1 });
          samples.push({ key: losingKey, day: '2026-06-01', residual: -1 });
          // winning key: the held-out residual matches the correction exactly, so subtracting it zeroes the miss.
          samples.push({ key: winningKey, day: '2026-01-01', residual: 1 });
          samples.push({ key: winningKey, day: '2026-06-01', residual: 1 });
        }

        const verdict = judgeRollingOriginCorrections({ gatedCorrections, samples });
        assert.equal(
          verdict,
          'corrections-stay',
          `an exact tie (${halfCount} losing, ${halfCount} winning) must spare the corrections, never kill them; got ${verdict}`,
        );
      }),
      { numRuns: RUNS },
    );
  });
});

describe('mean absolute error credits a correction that matches the held-out miss, and blames one that overshoots it (D-2026-08-12-1 pin 1: MAE, never a signed mean that can cancel)', () => {
  it('flips a single gated key between corrections-stay and corrections-killed as the held-out residual flips between matching the correction and doubling past it', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 2, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom(1, -1),
        fc.array(fc.double({ min: -0.04, max: 0.04, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 6 }),
        (b, sign, fractionalNoises) => {
          const gatedCorrections = new Map<string, number>([['k', b]]);
          const heldOutDays = fractionalNoises.map((_unused, index) => addUtcDays('2026-06-01', -index));
          const samples: DatedResidualSample[] = [
            { key: 'k', day: '2026-01-01', residual: sign * b }, // training presence, well before the boundary
            ...fractionalNoises.map((fractionalNoise, index) => ({
              key: 'k',
              day: heldOutDays[index]!,
              // noise is scaled to a small fraction of b, so it can never flip the dominant sign of sign*b + noise.
              residual: sign * b + fractionalNoise * b,
            })),
          ];

          const verdict = judgeRollingOriginCorrections({ gatedCorrections, samples });
          assert.equal(
            verdict,
            sign === 1 ? 'corrections-stay' : 'corrections-killed',
            `a held-out miss that matches the correction (+b) must be credited (corrections-stay); one that runs the correction's own size in the WRONG direction (-b) must be blamed (corrections-killed); got ${verdict} for sign=${sign}, b=${b}`,
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});
