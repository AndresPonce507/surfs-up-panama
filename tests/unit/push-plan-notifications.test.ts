// Property law for the pure morning notification planning port. The product
// threshold stays a subscriber-supplied input here: this law deliberately
// proves no server default and no ambient clock are needed to plan a send.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { planNotifications } from '../../src/push/plan-notifications';
import type { StoredSub } from '../../src/push/types';

const playaVenao = {
  spot_id: 'playa-venao',
  slug: 'playa-venao',
  name: 'Playa Venao',
  timezone: 'America/Panama',
};

function subscriptionWithBar(bar: number): StoredSub {
  return {
    spot_id: playaVenao.spot_id,
    endpoint_hash: 'suscriptor-de-prueba',
    lang: 'es',
    threshold_score: bar,
    last_notified_date: null,
    followup_date: null,
    device_id: 'dispositivo-de-prueba',
  };
}

const spotTimezones = [
  {
    timezone: 'America/Panama',
    utcHoursInMorning: [11, 12, 13],
  },
  {
    timezone: 'Etc/GMT-1',
    utcHoursInMorning: [5, 6, 7],
  },
] as const;

function utcClockAtMinute25(hour: number): string {
  return `2026-08-10T${String(hour).padStart(2, '0')}:25:00Z`;
}

describe('planNotifications', () => {
  it('plans a send if and only if a morning score reaches the subscriber-supplied bar across the full scale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (bar, score) => {
          const plan = planNotifications({
            now: '2026-08-10T07:25:00-05:00',
            spots: [playaVenao],
            scores: { [playaVenao.spot_id]: score },
            subscriptions: [subscriptionWithBar(bar)],
            run_cap: 10_000,
          });

          assert.ok(
            plan && typeof plan === 'object',
            'la corrida no llegó a decidir nada, así que un cero de avisos todavía no prueba la regla',
          );
          assert.equal(
            plan.sends.length,
            score >= bar ? 1 : 0,
            'a send is planned if and only if the score reaches the subscriber-supplied bar',
          );

          if (score < bar) return;

          const [send] = plan.sends;
          assert.equal(send?.lang, 'es', 'the plan preserves the subscriber language');
          assert.equal(send?.spot_id, playaVenao.spot_id, 'the plan keeps the subscribed spot');
          assert.equal(send?.tag, playaVenao.spot_id, 'the notification tag groups by spot');
          assert.equal(send?.url, '/spots/playa-venao/', 'the notification opens the spot page');
          assert.equal(send?.ttl_seconds, 4 * 60 * 60, 'a morning call expires after four hours');
          assert.ok(send?.title.includes(playaVenao.name), 'the Spanish title names the spot');
          assert.ok(send?.title.includes(String(score)), 'the Spanish title names the score');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('plans only during the closed 06:25, 07:25, and 08:25 spot-local window', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...spotTimezones),
        fc.integer({ min: 0, max: 23 }),
        (seed, utcHour) => {
          const spot = { ...playaVenao, timezone: seed.timezone };
          const plan = planNotifications({
            now: utcClockAtMinute25(utcHour),
            spots: [spot],
            scores: { [spot.spot_id]: 100 },
            subscriptions: [subscriptionWithBar(0)],
            run_cap: 1,
          });

          assert.ok(
            plan && typeof plan === 'object',
            'la corrida debe devolver un Plan aun cuando el reloj cierre la ventana',
          );
          assert.equal(
            plan.sends.length,
            seed.utcHoursInMorning.some((morningUtcHour) => morningUtcHour === utcHour) ? 1 : 0,
            'solo las 06:25, 07:25 y 08:25 locales del huso declarado por el spot permiten un aviso',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
