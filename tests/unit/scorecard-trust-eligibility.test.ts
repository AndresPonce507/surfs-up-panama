import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { SurfReport } from '../../src/scorecard/pairing';
import { eligibleReports } from '../../src/scorecard/trust-eligibility';

const atHour = (hour: number): string => new Date(Date.UTC(2026, 7, 10, hour)).toISOString();

const report = (overrides: Partial<SurfReport> = {}): SurfReport => ({
  spot_id: 'playa-venao',
  device_id: 'device-1',
  observed_at: atHour(12),
  size_band: 'waist_chest',
  quality: 'good',
  credential_issued_at: atHour(0),
  received_at: atHour(12),
  predicted: { score_q: 70 },
  ...overrides,
});

describe('scorecard trust eligibility', () => {
  it('uses receipt-time credential age and earlier reporter history, while the shipped zero config is a bit-identical no-op', () => {
    const arbitrary = fc.record({
      enoughAge: fc.boolean(),
      priorReports: fc.integer({ min: 0, max: 5 }),
      priorSpots: fc.integer({ min: 1, max: 3 }),
      minimumReports: fc.integer({ min: 1, max: 4 }),
      minimumSpots: fc.integer({ min: 1, max: 3 }),
    });

    fc.assert(
      fc.property(arbitrary, ({ enoughAge, priorReports, priorSpots, minimumReports, minimumSpots }) => {
        const candidate = report({
          device_id: 'candidate',
          received_at: atHour(12),
          credential_issued_at: enoughAge ? atHour(-24) : atHour(11),
        });
        const history = Array.from({ length: priorReports }, (_, index) =>
          report({
            device_id: 'candidate',
            spot_id: `spot-${index % priorSpots}`,
            received_at: atHour(index),
            credential_issued_at: atHour(0),
          }),
        );
        const reports = [...history, candidate];
        const config = {
          min_credential_age_days: 1,
          min_prior_reports: minimumReports,
          min_prior_spots: minimumSpots,
        };
        const expected = enoughAge && priorReports >= minimumReports && Math.min(priorReports, priorSpots) >= minimumSpots;

        assert.equal(eligibleReports(reports, config, (deviceId) => deviceId).includes(candidate), expected);
        assert.deepEqual(
          eligibleReports(reports, { min_credential_age_days: 0, min_prior_reports: 0, min_prior_spots: 2 }, (deviceId) => deviceId),
          reports,
          'the shipped all-zero config must leave every stored report eligible',
        );
      }),
      { numRuns: 100 },
    );
  });
});
