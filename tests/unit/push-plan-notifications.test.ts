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

const fixtureServerThresholdScore = 55;

function subscriptionWithBar(bar: number, overrides: Partial<StoredSub> = {}): StoredSub {
  return {
    spot_id: playaVenao.spot_id,
    endpoint_hash: 'suscriptor-de-prueba',
    lang: 'es',
    threshold_score: bar,
    last_notified_date: null,
    followup_date: null,
    device_id: 'dispositivo-de-prueba',
    ...overrides,
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

function fixedOffsetTimezone(offsetFromUtc: number): string {
  const sign = offsetFromUtc >= 0 ? '-' : '+';
  return `Etc/GMT${sign}${Math.abs(offsetFromUtc)}`;
}

function localHourAtOffset(utcHour: number, offsetFromUtc: number): number {
  return (utcHour + offsetFromUtc + 24) % 24;
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
            default_threshold_score: fixtureServerThresholdScore,
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

  it('uses the declared server bar as the one monotone in-range cut for a subscriber who chose none', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (serverBar) => {
          const sweep = Array.from({ length: 101 }, (_, score) => planNotifications({
            now: '2026-08-10T07:25:00-05:00',
            spots: [playaVenao],
            scores: { [playaVenao.spot_id]: score },
            subscriptions: [subscriptionWithBar(0, { threshold_score: null })],
            default_threshold_score: serverBar,
            run_cap: 10_000,
          }).sends.length > 0);

          assert.deepEqual(
            sweep,
            Array.from({ length: 101 }, (_, score) => score >= serverBar),
            'a no-bar subscription has exactly one monotone in-range cut at the declared server bar',
          );
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
            default_threshold_score: fixtureServerThresholdScore,
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

  it('follows every spot-local fixed-offset hour, never the Panama or UTC hour', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -12, max: 12 }),
        fc.integer({ min: 0, max: 23 }),
        (offsetFromUtc, utcHour) => {
          const spot = {
            ...playaVenao,
            timezone: fixedOffsetTimezone(offsetFromUtc),
          };
          const plan = planNotifications({
            now: utcClockAtMinute25(utcHour),
            spots: [spot],
            scores: { [spot.spot_id]: 100 },
            subscriptions: [subscriptionWithBar(0)],
            default_threshold_score: fixtureServerThresholdScore,
            run_cap: 1,
          });
          const spotLocalHour = localHourAtOffset(utcHour, offsetFromUtc);
          const isSpotLocalMorning = spotLocalHour >= 6 && spotLocalHour < 9;

          assert.ok(plan && typeof plan === 'object', 'the run always returns a plan, including outside a spot-local morning');
          assert.equal(
            plan.sends.length,
            isSpotLocalMorning ? 1 : 0,
            `the verdict must follow the spot-local hour ${spotLocalHour}, not the UTC hour ${utcHour} or Panama's clock`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reports at most one dated write and send for a subscriber across arbitrary runs in one spot-local day', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...spotTimezones),
        fc.array(fc.constantFrom(0, 1, 2), { minLength: 1, maxLength: 30 }),
        (seed, runOffsets) => {
          const spot = { ...playaVenao, timezone: seed.timezone };
          const original = subscriptionWithBar(0);
          let subscriptions = [original];
          let sends = 0;
          let writes = 0;

          for (const offset of runOffsets) {
            const now = utcClockAtMinute25(seed.utcHoursInMorning[offset]!);
            const plan = planNotifications({
              now,
              spots: [spot],
              scores: { [spot.spot_id]: 100 },
              subscriptions,
              default_threshold_score: fixtureServerThresholdScore,
              run_cap: 10_000,
            });

            assert.ok(plan && typeof plan === 'object', 'every run returns a plan, including a deduplicated run');
            sends += plan.sends.length;
            writes += plan.writes.length;
            subscriptions = subscriptions.map((subscription) => {
              const write = plan.writes.find(
                (candidate) => candidate.spot_id === subscription.spot_id && candidate.endpoint_hash === subscription.endpoint_hash,
              );
              return write === undefined ? subscription : { ...subscription, last_notified_date: write.last_notified_date };
            });
          }

          assert.equal(sends, 1, 'at most one morning send reaches a subscriber for the same spot-local day');
          assert.equal(writes, 1, 'the plan reports one date write for that one send');
          assert.equal(original.last_notified_date, null, 'planning is pure and does not mutate the supplied subscription state');
        },
      ),
      { numRuns: 100 },
    );
  });
});
