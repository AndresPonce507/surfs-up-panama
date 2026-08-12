// The scorecard block is the producer-side contract for the display counter.
// It carries its integers and their joined rendering together so consumers
// never need to parse a display string back into business values.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { decideScorecardBlock } from '../../src/scorecard/scorecard-block';
import { REPORTS_REQUIRED } from '../../src/scorecard/threshold';

describe('scorecard block counter — producer contract', () => {
  it('joins its own observation count and exported threshold for every computed block', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.constantFrom('satisfied', 'unsatisfied', 'unavailable'),
        (pairedObservations, distinctTrustEligibleReporters, biasClause) => {
          const block = decideScorecardBlock({
            pairedObservations,
            distinctTrustEligibleReporters,
            biasClause,
          });

          assert.deepEqual(
            {
              n_obs: block.n_obs,
              threshold: block.threshold,
              counter: block.counter,
            },
            {
              n_obs: pairedObservations,
              threshold: REPORTS_REQUIRED,
              counter: `${pairedObservations} / ${REPORTS_REQUIRED}`,
            },
            'the counter must derive from the block integers and the exported threshold home',
          );
        },
      ),
    );
  });
});
