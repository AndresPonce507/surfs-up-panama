import fc from 'fast-check';
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

  // The published call log is written by the real pipeline, and its hourly
  // stamp carries minutes only: `2026-08-12T15:00Z`, never `...T15:00:00Z`.
  // build.ts's own dawn filter reads that shape back with
  // `call.valid_ts.endsWith('T18:00Z')`, and open-meteo-source.ts mints it as
  // `${time}Z` straight from the provider's minute-precision hour. A resolver
  // that demands a seconds field therefore matches nothing a real build ever
  // published, and every report would come back no_snapshot for good.
  //
  // The property quantifies over the whole equivalence class the bug lived in:
  // any instant inside a published hour belongs to that hour's call.
  it('compares a report against the hourly call the real pipeline published for that hour', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 }),
        async (hour, minute, second) => {
          const twoDigits = (value: number) => String(value).padStart(2, '0');
          const publishedHour = `2026-08-10T${twoDigits(hour)}:00Z`;
          const observedInThatHour = `2026-08-10T${twoDigits(hour)}:${twoDigits(minute)}:${twoDigits(second)}Z`;
          const reveal = await resolveReportReveal(
            { ...report, observed_at: observedInThatHour, submitted_at: observedInThatHour },
            { 'playa-venao': { region_id: 'pa-pacific' } },
            {
              async get(key) {
                return key.includes(`build=${twoDigits(hour)}Z`)
                  ? JSON.stringify({ spot_id: 'playa-venao', valid_ts: publishedHour, score_q: 82, size_band: 'chest_head', size_range_m: [1.1, 1.6], wind_state: 'clean', conf_level: 'medium' })
                  : null;
              },
            },
          );
          expect(reveal).toEqual({
            outcome: 'compared',
            predicted: { score_q: 82, size_band: 'chest_head', size_range_m: [1.1, 1.6], wind_state: 'clean', conf_level: 'medium' },
            delta: { score_points: 12, size_bands: 1 },
          });
        },
      ),
      { numRuns: 200 },
    );
  });
});
