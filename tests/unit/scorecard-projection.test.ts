import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import * as projection from '../../src/scorecard/projection';
import type { PredictionSnapshot, SurfReport } from '../../src/scorecard/pairing';
import type { ScorecardAccumulator } from '../../src/scorecard/projection';

type IncrementalProjection = (
  accumulator: ScorecardAccumulator | null,
  report: SurfReport,
  input: unknown,
) => ScorecardAccumulator;

const reportSet = fc
  .array(
    fc.record({ day: fc.integer({ min: 1, max: 28 }), device: fc.integer({ min: 1, max: 7 }) }),
    { maxLength: 40 },
  )
  .map((rows) =>
    rows.map(
      ({ day, device }): SurfReport => ({
        spot_id: 'playa-venao',
        device_id: `device-${device}`,
        observed_at: `2026-08-${String(day).padStart(2, '0')}T12:00:00Z`,
        size_band: 'waist_chest',
        quality: 'good',
        credential_issued_at: '2026-07-01T00:00:00Z',
        received_at: `2026-08-${String(day).padStart(2, '0')}T12:00:00Z`,
        predicted: { score_q: 70 },
      }),
    ),
  );

const predictionsFor = (reports: readonly SurfReport[]): readonly PredictionSnapshot[] =>
  reports.map((report) => ({
    spot_id: report.spot_id,
    source: 'ncep_gfswave016',
    run_ts: '2026-08-01T00:00:00Z',
    valid_ts: report.observed_at,
    lead_h: 24,
    swell_h_m: 1.2,
    land_masked: false,
  }));

describe('scorecard projection rebuild — immutable log contract', () => {
  it('rebuilds the complete observable projection exactly from reports folded one at a time', () => {
    assert.equal(
      typeof projection['applyReport'],
      'function',
      'projectScorecard must expose applyReport so the immutable logs can be folded incrementally',
    );
    const applyReport = projection['applyReport'] as IncrementalProjection;

    fc.assert(
      fc.property(reportSet, (reports) => {
        const input = {
          predictions: predictionsFor(reports),
          reports,
          trustConfig: null,
          resolveReporter: (deviceId: string): string => deviceId,
          asOf: '2026-08-30T12:00:00Z',
        };
        const batch = projection.projectScorecard(input);
        const accumulator = reports.reduce<ScorecardAccumulator | null>(
          (current, report) => applyReport(current, report, { ...input, reports: [] }),
          null,
        );
        const folded = projection.projectScorecard({ ...input, fromAccumulator: accumulator });

        assert.deepEqual(
          folded,
          batch,
          'folding immutable reports one at a time must rebuild the same projection as a from-scratch recompute',
        );
      }),
    );
  });
});
