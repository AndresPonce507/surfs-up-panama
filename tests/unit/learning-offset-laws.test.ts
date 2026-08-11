// The per-reporter term is a public pure-estimator port.  These laws keep its
// three-pass, shrink-to-zero contract independent of the fit's storage seam.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  fitReporterOffsets,
  reporterOffsetOf,
  shrinkReporterOffset,
} from '../../src/learning/estimate';

describe('per-reporter offsets', () => {
  it('shrinks every raw personal habit toward zero by the declared evidence weight', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }),
        (reports, raw) => {
          const actual = shrinkReporterOffset(raw, reports);
          if (reports === 0) {
            assert.equal(actual, 0);
            return;
          }
          const expected = (reports / (reports + 4)) * raw;
          assert.equal(actual, expected);
          assert.ok(Math.abs(actual) <= Math.abs(raw));
        },
      ),
      { numRuns: 50 },
    );
  });

  it('backfits a cross-spot habit through exactly three passes and leaves unseen reporters at zero', () => {
    const habit = 'd_habit';
    const samples = [
      ...Array.from({ length: 22 }, () => ({ key: 'costa-larga\u0000ncep\u0000lead_24_48', spotId: 'costa-larga', reporter: 'd_honest_a', value: 0, weight: 1 })),
      ...Array.from({ length: 12 }, () => ({ key: 'punta-brava\u0000ncep\u0000lead_24_48', spotId: 'punta-brava', reporter: 'd_honest_b', value: 0, weight: 1 })),
      ...Array.from({ length: 5 }, () => ({ key: 'costa-larga\u0000ncep\u0000lead_24_48', spotId: 'costa-larga', reporter: habit, value: -0.5, weight: 1 })),
      ...Array.from({ length: 4 }, () => ({ key: 'punta-brava\u0000ncep\u0000lead_24_48', spotId: 'punta-brava', reporter: habit, value: -0.5, weight: 1 })),
    ];

    const offsets = fitReporterOffsets(samples);

    assert.ok(reporterOffsetOf(offsets, habit) > 0, 'a repeated bigger-call habit across two spots must be measured');
    assert.ok(reporterOffsetOf(offsets, habit) < 0.5, 'the personal term must remain shrunk toward zero');
    assert.equal(reporterOffsetOf(offsets, 'd_new'), 0, 'a reporter with no samples has exactly zero offset');
  });
});
