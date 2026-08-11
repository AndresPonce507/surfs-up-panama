// The monthly evaluator's pure decision port. A correction is judged only on
// the forward two-week holdout; its earlier rows are evidence of training,
// never part of the score that decides whether it stays applied.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { judgeRollingOriginCorrections } from '../../src/learning/cross-validation';

describe('rolling-origin correction judgement', () => {
  it('kills exactly when a majority of gated keys worsen in the forward held-out fortnight', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 9 }),
        fc.double({ min: 0.01, max: 0.4, noNaN: true, noDefaultInfinity: true }),
        (losesByKey, magnitude) => {
          const corrections = new Map(losesByKey.map((_loses, index) => [`key-${index}`, -magnitude]));
          const samples = losesByKey.flatMap((loses, index) => [
            { key: `key-${index}`, observed_on: '2026-06-10', raw_residual: -magnitude },
            { key: `key-${index}`, observed_on: '2026-07-20', raw_residual: loses ? magnitude : -magnitude },
          ]);
          const losses = losesByKey.filter(Boolean).length;
          const wins = losesByKey.length - losses;

          assert.equal(
            judgeRollingOriginCorrections({ corrections, samples }),
            losses > wins ? 'corrections-killed' : 'corrections-stay',
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});
