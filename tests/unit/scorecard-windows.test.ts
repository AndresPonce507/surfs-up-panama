import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { DailyAggregate } from '../../src/scorecard/daily-aggregate';
import { deriveWindows, SIGMA_EFF_BY_VARIABLE } from '../../src/scorecard/windows';

const asOf = '2026-08-10T12:00:00Z';

const daily = (
  error: number,
  index: number,
  variable: 'swell_h' | 'score',
): DailyAggregate => {
  const observedDay = new Date('2026-08-09T00:00:00Z');
  observedDay.setUTCDate(observedDay.getUTCDate() - index);
  return {
    spot_id: 'playa-venao',
    source: variable === 'swell_h' ? 'ncep_gfswave016' : 'published',
    lead_bucket: '[24,48)',
    variable,
    day: observedDay.toISOString().slice(0, 10),
    n: 1,
    sum_err: error,
    sum_abs_err: Math.abs(error),
    sum_sq_err: error ** 2,
    device_ids: [`device-${index}`],
  };
};

const assertSettledStats = (
  errors: readonly number[],
  variable: 'swell_h' | 'score',
  windowDays: 30 | 90,
  stats: ReturnType<typeof deriveWindows>,
): void => {
  const stat = stats.find((candidate) => candidate.window === `${windowDays}d`);
  assert.ok(stat, `recent daily rows must produce a ${windowDays}-day window`);
  const included = errors.slice(0, windowDays);
  const n = included.length;
  const bias = included.reduce((total, error) => total + error, 0) / n;
  const mae = included.reduce((total, error) => total + Math.abs(error), 0) / n;
  const variance = included.reduce((total, error) => total + (error - bias) ** 2, 0) / (n - 1);
  const sampleError = Math.sqrt(variance) / Math.sqrt(n);
  const floor = (0.5 * SIGMA_EFF_BY_VARIABLE[variable]) / Math.sqrt(n);

  assert.equal(stat.n, n, 'a window consumes no more than its settled daily-item limit');
  assert.ok(Math.abs(stat.bias - bias) < 1e-9, 'bias is the mean signed residual');
  assert.ok(Math.abs(stat.mae - mae) < 1e-9, 'mae is the mean absolute residual');
  assert.ok(Math.abs(stat.se_sample - sampleError) < 1e-9, 'se_sample uses sample variance, not population variance');
  assert.ok(Math.abs(stat.se_gate - Math.max(sampleError, floor)) < 1e-9, 'se_gate applies the physical floor');
  assert.equal(stat.se, stat.se_gate, 'the exposed se never leaks the unfloored sample error');
};

describe('scorecard windows', () => {
  it('derives the settled mean, mae, sample error and floored exposed error from bounded daily aggregates', () => {
    const arbitrary = fc.record({
      variable: fc.constantFrom<'swell_h' | 'score'>('swell_h', 'score'),
      errors: fc.array(fc.double({ min: -20, max: 20, noNaN: true, noDefaultInfinity: true }), {
        minLength: 2,
        maxLength: 100,
      }),
    });

    fc.assert(
      fc.property(arbitrary, ({ variable, errors }) => {
        const stats = deriveWindows(errors.map((error, index) => daily(error, index, variable)), asOf, (id) => id);
        assertSettledStats(errors, variable, 30, stats);
        assertSettledStats(errors, variable, 90, stats);
      }),
      { numRuns: 100 },
    );
  });
});
