import { describe, expect, it } from 'vitest';

import { resolveReportReveal } from '../../src/report/call-log-reader';

const report = {
  report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN', spot_id: 'playa-venao',
  observed_at: '2026-08-10T18:30:00Z', submitted_at: '2026-08-10T18:30:00Z',
  size_band: 'waist_chest' as const, size_band_schema: 1 as const, wind: 'choppy' as const,
  quality: 'good' as const, trigger: 'organic' as const, photo_ids: [],
};

describe('PublishedCall read-only resolver', () => {
  it('returns a compared reveal from a matching report-hour call and walks back to the preceding build', async () => {
    const reads: string[] = [];
    const reveal = await resolveReportReveal(report, { 'playa-venao': { region_id: 'pa-pacific' } }, {
      async get(key) {
        reads.push(key);
        return key.includes('build=17Z') ? JSON.stringify({ spot_id: 'playa-venao', valid_ts: '2026-08-10T18:00:00Z', score_q: 82, size_band: 'chest_head', size_range_m: [1.1, 1.6], wind_state: 'clean', conf_level: 'medium' }) : null;
      },
    });
    expect(reads).toEqual([
      'log/calls/v1/dt=2026-08-10/build=18Z/pa-pacific.jsonl.gz',
      'log/calls/v1/dt=2026-08-10/build=17Z/pa-pacific.jsonl.gz',
    ]);
    expect(reveal).toEqual({ outcome: 'compared', predicted: { score_q: 82, size_band: 'chest_head', size_range_m: [1.1, 1.6], wind_state: 'clean', conf_level: 'medium' }, delta: { score_points: 12, size_bands: 1 } });
  });

  it('returns the honest no_snapshot shape when every allowed log object is absent', async () => {
    await expect(resolveReportReveal(report, { 'playa-venao': { region_id: 'pa-pacific' } }, { async get() { return null; } }))
      .resolves.toEqual({ outcome: 'no_snapshot', predicted: null });
  });
});
