import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { DaySummary } from '../../src/data/forecast';
import { shareDaySummaryFor } from '../../src/share/day-summary';

const complete: DaySummary = {
  spot_id: 'playa-venao',
  score_q: 78,
  call: { es: 'Pecho a cabeza, limpio, mejor de 06:00 a 09:00.' },
  size_band: 'chest_head',
  size_range_m: [1, 1.5],
  wind_state: 'clean',
  best_window: { start: '06:00', end: '09:00' },
  conf_level: 'high',
};

describe('shareDaySummaryFor', () => {
  it('adapts a complete published row into the fixed Spanish share template input', () => {
    assert.deepEqual(
      shareDaySummaryFor('2026-08-10T11:00:00.000Z', 'Playa Venao', complete),
      {
        fecha: '10 de agosto',
        spotName: 'Playa Venao',
        scoreQ: 78,
        sizeBand: 'chest_head',
        windState: 'clean',
        windowStart: '06:00',
        windowEnd: '09:00',
        confidenceLevel: 'high',
      },
    );
  });

  it.each(['size_band', 'wind_state', 'best_window', 'conf_level'] as const)(
    'withholds the share template when %s is absent instead of aborting the reading surface',
    (field) => {
      const partial = { ...complete } as Record<string, unknown>;
      delete partial[field];

      assert.equal(
        shareDaySummaryFor(
          '2026-08-10T11:00:00.000Z',
          'Playa Venao',
          partial as unknown as DaySummary,
        ),
        undefined,
      );
    },
  );
});
