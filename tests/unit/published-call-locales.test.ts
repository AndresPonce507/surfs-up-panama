// Current ranked calls require both locale members. Historical dawn receipts
// remain byte-for-byte facts and may predate call_en. This test pins that
// boundary so adding English cannot rewrite what the product said yesterday.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  assertStrictTwoDayUpdate,
  mergePublishedSurface,
  type PublishedSurfaceUpdate,
  type StaticSurface,
} from '../../src/publish/static-surface';

function currentUpdate(): Record<string, unknown> {
  const today = {
    spot_id: 'playa-venao',
    score_q: 80,
    call_es: 'Pecho a cabeza, viento limpio, mejor de 06:00 a 09:30.',
    call_en: 'Chest to head, clean wind, best from 06:00 to 09:30.',
    conf_level: 'high',
    size_band: 'chest_head',
    size_range_m: [1.1, 1.6],
    wind_state: 'clean',
    best_window: { start: '06:00', end: '09:30' },
  };
  const tomorrow = {
    spot_id: 'playa-venao',
    score_q: 70,
    call_es: 'Cintura a pecho, viento picado, mejor de 08:00 a 10:00.',
    call_en: 'Waist to chest, choppy wind, best from 08:00 to 10:00.',
    conf_level: 'medium',
    size_band: 'waist_chest',
    size_range_m: [0.7, 1.1],
    wind_state: 'choppy',
    best_window: { start: '08:00', end: '10:00' },
  };
  return {
    schema: 'published-surface-update/v1',
    surf_date: '2026-08-10',
    published_at: '2026-08-10T11:00:00.000Z',
    build_kind: 'hourly',
    calls: [{ ...today }],
    days: [
      { date: '2026-08-10', spots: [{ ...today }] },
      { date: '2026-08-11', spots: [{ ...tomorrow }] },
    ],
  };
}

describe('published call locale boundary', () => {
  it('refuses any current alias or day row whose Spanish or English call is missing or blank', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('call_es', 'call_en'),
        fc.constantFrom(undefined, '', '   '),
        fc.constantFrom('calls', 'today', 'tomorrow'),
        (field, invalid, location) => {
          const update = currentUpdate();
          const calls = update.calls as Record<string, unknown>[];
          const days = update.days as { spots: Record<string, unknown>[] }[];
          const target = location === 'calls'
            ? calls[0]!
            : days[location === 'today' ? 0 : 1]!.spots[0]!;
          target[field] = invalid;

          assert.throws(
            () => assertStrictTwoDayUpdate(update),
            /well-formed ranked civil days with non-empty calls/u,
            `Current ${location}.${field}=${JSON.stringify(invalid)} must refuse the publish.`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('refuses a current row when any structured fact is absent or malformed', () => {
    const invalidFact = fc.constantFrom(
      { field: 'conf_level', value: undefined },
      { field: 'size_band', value: undefined },
      { field: 'size_band', value: 'invented_band' },
      { field: 'size_range_m', value: undefined },
      { field: 'size_range_m', value: [1] },
      { field: 'wind_state', value: undefined },
      { field: 'wind_state', value: 'invented_wind' },
      { field: 'best_window', value: undefined },
      { field: 'best_window', value: { start: '29:99', end: '30:00' } },
    );
    fc.assert(
      fc.property(
        invalidFact,
        fc.constantFrom('calls', 'today', 'tomorrow'),
        ({ field, value }, location) => {
          const update = currentUpdate();
          const calls = update.calls as Record<string, unknown>[];
          const days = update.days as { spots: Record<string, unknown>[] }[];
          const target = location === 'calls'
            ? calls[0]!
            : days[location === 'today' ? 0 : 1]!.spots[0]!;
          target[field] = value;

          assert.throws(
            () => assertStrictTwoDayUpdate(update),
            /well-formed ranked civil days with non-empty calls/u,
            `Current ${location}.${field}=${JSON.stringify(value)} must refuse instead of treating omission as an honest null.`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('retains a Spanish-only legacy dawn receipt byte-for-byte while publishing a bilingual current update', () => {
    const legacyReceipt = {
      schema: 'published-surface-update/v1' as const,
      surf_date: '2026-08-09',
      published_at: '2026-08-09T11:00:00.000Z',
      build_kind: 'dawn' as const,
      calls: [{
        spot_id: 'playa-venao',
        score_q: 74,
        call_es: 'Pecho a cabeza, viento limpio, mejor de 06:00 a 09:30.',
      }],
    };
    const previous = {
      schema: 'static-surface/v1',
      current: currentUpdate(),
      dawn_receipts: [legacyReceipt],
    } as unknown as StaticSurface;
    const before = JSON.stringify(previous.dawn_receipts);

    const merged = mergePublishedSurface(
      previous,
      assertStrictTwoDayUpdate(currentUpdate()) as PublishedSurfaceUpdate,
    );

    assert.equal(JSON.stringify(merged.dawn_receipts), before, 'An English rollout must not mutate a historical receipt.');
    assert.equal('call_en' in merged.dawn_receipts[0]!.calls[0]!, false, 'Legacy Spanish-only receipt remains honestly Spanish-only.');
  });
});
