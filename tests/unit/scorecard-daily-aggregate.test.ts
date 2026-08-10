import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { aggregateDaily } from '../../src/scorecard/daily-aggregate';
import type { Residual } from '../../src/scorecard/pairing';

const residual = (overrides: Partial<Residual> = {}): Residual => ({
  spot_id: 'playa-venao',
  source: 'ncep_gfswave016',
  lead_bucket: '[24,48)',
  variable: 'swell_h',
  paired_valid_ts: '2026-08-08T18:00:00Z',
  err: 0.3,
  device_id: 'device-1',
  quality: 'good',
  ...overrides,
});

const aggregateKey = (row: Pick<Residual, 'spot_id' | 'source' | 'lead_bucket' | 'variable'> & { day: string }): string =>
  `${row.spot_id}|${row.source}|${row.lead_bucket}|${row.variable}|${row.day}`;

const expectedDevicesByAggregate = (residuals: readonly Residual[]): ReadonlyMap<string, readonly string[]> => {
  const devices = new Map<string, Set<string>>();
  for (const item of residuals) {
    const day = item.paired_valid_ts.slice(0, 10);
    const key = aggregateKey({ ...item, day });
    devices.set(key, new Set([...(devices.get(key) ?? []), item.device_id]));
  }
  return new Map([...devices.entries()].map(([key, values]) => [key, [...values].sort()]));
};

const dailyArbitrary = fc
  .array(
    fc.record({
      day: fc.integer({ min: 1, max: 20 }),
      err: fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true }),
      device: fc.integer({ min: 1, max: 6 }),
      variable: fc.constantFrom<'swell_h' | 'score'>('swell_h', 'score'),
    }),
    { maxLength: 50 },
  )
  .map((rows) =>
    rows.map(({ day, err, device, variable }) =>
      residual({
        paired_valid_ts: `2026-08-${String(day).padStart(2, '0')}T18:00:00Z`,
        err,
        device_id: `device-${device}`,
        variable,
      }),
    ),
  );

describe('scorecard daily aggregates', () => {
  it('is permutation-invariant while retaining the raw device identities and additive error sums', () => {
    fc.assert(
      fc.property(dailyArbitrary, (residuals) => {
        const forward = aggregateDaily(residuals);
        const reversed = aggregateDaily([...residuals].reverse());
        assert.deepEqual(forward, reversed, 'daily aggregate output must not depend on report arrival order');
        assert.equal(
          forward.reduce((total, row) => total + row.n, 0),
          residuals.length,
          'each residual must contribute exactly once to one daily aggregate',
        );
        const expectedDevices = expectedDevicesByAggregate(residuals);
        assert.deepEqual(
          new Map(forward.map((row) => [aggregateKey(row), row.device_ids])),
          expectedDevices,
          'daily aggregates must retain the raw device identities for their own settled grain',
        );
      }),
      { numRuns: 100 },
    );
  });
});
