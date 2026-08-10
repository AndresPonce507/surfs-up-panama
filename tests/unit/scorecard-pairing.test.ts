import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { pairResiduals, type PredictionSnapshot, type SurfReport } from '../../src/scorecard/pairing';

const hour = '2026-08-08T18:00:00Z';

const prediction = (overrides: Partial<PredictionSnapshot> = {}): PredictionSnapshot => ({
  spot_id: 'playa-venao',
  source: 'ncep_gfswave016',
  run_ts: '2026-08-07T06:00:00Z',
  valid_ts: hour,
  lead_h: 36,
  swell_h_m: 1.2,
  land_masked: false,
  ...overrides,
});

const report = (overrides: Partial<SurfReport> = {}): SurfReport => ({
  spot_id: 'playa-venao',
  device_id: 'device-1',
  observed_at: '2026-08-08T18:41:00Z',
  size_band: 'waist_chest',
  quality: 'good',
  credential_issued_at: '2026-07-01T00:00:00Z',
  received_at: '2026-08-08T18:41:00Z',
  predicted: { score_q: 70 },
  ...overrides,
});

describe('scorecard pairing', () => {
  it('is total over generated logs and only emits unmasked same-spot same-hour residuals', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            spot_id: fc.constantFrom('playa-venao', 'santa-catalina'),
            observed_at: fc.constantFrom('2026-08-08T18:41:00Z', '2026-08-08T17:59:00Z'),
            land_masked: fc.boolean(),
          }),
          { maxLength: 30 },
        ),
        (rows) => {
          const reports = rows.map(({ spot_id, observed_at }) => report({ spot_id, observed_at }));
          const predictions = rows.map(({ spot_id, observed_at, land_masked }) =>
            prediction({ spot_id, valid_ts: observed_at.replace(/T\d{2}:\d{2}:\d{2}Z$/, 'T18:00:00Z'), land_masked }),
          );
          const residuals = pairResiduals({ predictions, reports });

          for (const residual of residuals) {
            const matched = predictions.find(
              (candidate) =>
                !candidate.land_masked &&
                candidate.spot_id === residual.spot_id &&
                candidate.valid_ts === residual.paired_valid_ts,
            );
            assert.ok(matched, 'every residual must come from an unmasked prediction at the same spot and floored UTC hour');
            assert.ok(['swell_h', 'score'].includes(residual.variable), 'wind cannot enter the scorecard grain');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
