// The operator-only metrics projection is a pure port. Its required sections
// must exist for every input shape, including a month with no observations.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { buildMonthlyMetrics } from '../../src/learning/metrics';

describe('monthly metrics projection', () => {
  it('reports every mandatory operator section for arbitrary report and call counts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('organic', 'push_solicited'), { maxLength: 60 }),
        fc.array(fc.integer({ min: 0, max: 99 }), { maxLength: 90 }),
        (triggers, scores) => {
          const metrics = buildMonthlyMetrics({
            observations: triggers.map((trigger, index) => ({
              spot_id: 'playa-venao',
              device_id: `d_${index % 7}`,
              observed_at: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T18:00:00Z`,
              trigger,
            })),
            calls: scores.map((score_q, index) => ({
              spot_id: 'playa-venao',
              valid_ts: `2026-07-${String((index % 28) + 1).padStart(2, '0')}T18:00:00Z`,
              score_q,
            })),
          });

          assert.ok(Array.isArray(metrics.selection.per_decile));
          assert.equal(typeof metrics.selection.solicited_share, 'number');
          assert.equal(metrics.pairwise.target_pairs, 400);
          assert.equal(typeof metrics.pairwise.pairs, 'number');
          assert.ok('climatology' in metrics.mae.baselines && 'persistence' in metrics.mae.baselines);
          assert.equal(typeof metrics.sigma_human.co_observer_pairs, 'number');
          assert.ok('offending_term' in metrics.calibration);
          assert.ok(Array.isArray(metrics.shrinkage));
          assert.equal(metrics.cv.verdict, 'not_evaluated');
        },
      ),
      { numRuns: 50 },
    );
  });
});
