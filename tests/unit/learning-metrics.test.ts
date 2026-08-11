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

  // bypass: buildMonthlyMetrics is a pure driving port whose only observable
  // surface is its returned projection; no mutable port state exists.
  it('bins naive score probabilities by captured confidence and routes a failed high-confidence term for removal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        (highOutcomes, lowOutcomes) => {
          const observations = [
            ...highOutcomes.map((isGood, index) => calibrationObservation({ index, confidence: 'high', isGood, score: 80 })),
            ...lowOutcomes.map((isGood, index) => calibrationObservation({ index: index + highOutcomes.length, confidence: 'low', isGood, score: 20 })),
          ];
          const metrics = buildMonthlyMetrics({ observations, calls: [] });
          const high = metrics.calibration.bins.high;
          const low = metrics.calibration.bins.low;

          assert.ok(high !== undefined && low !== undefined, 'each captured confidence level must keep its own calibration bin');
          assert.equal(high.hit_rate, rateOf(highOutcomes));
          assert.equal(low.hit_rate, rateOf(lowOutcomes));
          assert.equal(high.brier, brierOf(highOutcomes, 0.8));
          assert.equal(low.brier, brierOf(lowOutcomes, 0.2));
          assert.equal(
            metrics.calibration.offending_term,
            rateOf(highOutcomes) < rateOf(lowOutcomes) ? 'c_spread' : null,
            'C_spread is routed for removal exactly when high confidence predicts fewer Good/Epic mornings than low confidence',
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

function calibrationObservation(input: { index: number; confidence: string; isGood: boolean; score: number }) {
  return {
    spot_id: 'playa-venao',
    device_id: `d_${input.index}`,
    observed_at: `2026-07-${String((input.index % 28) + 1).padStart(2, '0')}T18:00:00Z`,
    quality: input.isGood ? ('good' as const) : ('bad' as const),
    predicted: { score_q: input.score, conf_level: input.confidence },
  };
}

function rateOf(outcomes: readonly boolean[]): number {
  return outcomes.filter(Boolean).length / outcomes.length;
}

function brierOf(outcomes: readonly boolean[], probability: number): number {
  return outcomes.reduce((total, isGood) => total + (probability - (isGood ? 1 : 0)) ** 2, 0) / outcomes.length;
}
