import assert from 'node:assert/strict';

import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, it } from 'vitest';

import type { DaySummary } from '../../src/data/forecast';
import { shareDaySummaryFor } from '../../src/share/day-summary';
// @ts-expect-error Astro resolves component modules in the Vitest pipeline.
import SpotDetail from '../../src/components/SpotDetail.astro';

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

  it.each(['size_band', 'size_range_m', 'wind_state', 'best_window', 'conf_level', 'call.es'] as const)(
    'withholds the share template when %s is absent instead of aborting the reading surface',
    (field) => {
      const partial = { ...complete, call: { ...complete.call } } as unknown as Record<string, unknown>;
      if (field === 'call.es') {
        delete (partial.call as Record<string, unknown>).es;
      } else {
        delete partial[field];
      }

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

  it('keeps the honest reading page while omitting both share controls for an incomplete row', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(SpotDetail, {
      props: {
        locale: 'es',
        spotId: 'mariatos',
        announcement: {
          title: 'Mariatos, 69',
          description: 'Llamado de surf para Mariatos.',
          url: 'https://olas.example/spots/mariatos/',
          locale: 'es_PA',
        },
      },
    });

    assert.match(html, /data-day="today"/, 'la lectura de hoy desapareció con el dato parcial');
    assert.match(html, /data-field="score"/, 'el número honesto dejó de renderizarse');
    assert.doesNotMatch(html, /class="spot-share"/, 'la página ofreció compartir un llamado incompleto');
    assert.doesNotMatch(html, /share-whatsapp/, 'la página inventó una acción de WhatsApp');
    assert.doesNotMatch(html, /Copiar el llamado/, 'la página inventó una acción de copiar');
  });
});
