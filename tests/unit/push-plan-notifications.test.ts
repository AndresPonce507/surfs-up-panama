// Property law for the pure morning notification planning port. The product
// threshold stays a subscriber-supplied input here: this law deliberately
// proves no server default and no ambient clock are needed to plan a send.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { planNotifications, planSendReactions } from '../../src/push/plan-notifications';
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
    spotLocalDate: '2026-08-10',
  },
  {
    timezone: 'Etc/GMT-1',
    utcHoursInMorning: [5, 6, 7],
    spotLocalDate: '2026-08-10',
  },
  {
    timezone: 'Pacific/Kiritimati',
    utcHoursInMorning: [16, 17, 18],
    spotLocalDate: '2026-08-11',
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
  }, 15_000);

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

  it('sends at most the declared run cap, pooled across spots, and announces the remainder out loud', () => {
    // The cap is whatever the caller declares. No configuration number is
    // asserted here: 10,000 is the composition root's proposal in
    // adr-push-vapid-direct.md, not this module's rule, so the law is stated
    // over every whole cap from zero upward.
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 20 }),
        (subscribersAtFirstSpot, subscribersAtSecondSpot, declaredRunCap) => {
          const firstSpot = playaVenao;
          const secondSpot = { ...playaVenao, spot_id: 'santa-catalina', slug: 'santa-catalina', name: 'Santa Catalina' };
          const subscriptionsFor = (spot: typeof playaVenao, count: number): StoredSub[] =>
            Array.from({ length: count }, (_, index) => subscriptionWithBar(55, {
              spot_id: spot.spot_id,
              endpoint_hash: `${spot.spot_id}-suscriptor-${index + 1}`,
            }));
          const eligible = subscribersAtFirstSpot + subscribersAtSecondSpot;

          const plan = planNotifications({
            now: '2026-08-10T07:25:00-05:00',
            spots: [firstSpot, secondSpot],
            scores: { [firstSpot.spot_id]: 95, [secondSpot.spot_id]: 95 },
            subscriptions: [
              ...subscriptionsFor(firstSpot, subscribersAtFirstSpot),
              ...subscriptionsFor(secondSpot, subscribersAtSecondSpot),
            ],
            default_threshold_score: fixtureServerThresholdScore,
            run_cap: declaredRunCap,
          });

          assert.ok(plan && typeof plan === 'object', 'a capped run still returns a plan');
          assert.equal(
            plan.sends.length,
            Math.min(declaredRunCap, eligible),
            'one run sends at most its declared cap, counting every spot together',
          );
          assert.equal(
            plan.deferred,
            Math.max(0, eligible - declaredRunCap),
            'what did not fit is carried as the deferred remainder',
          );

          // A write that escapes the cap would stamp last_notified_date on a
          // subscriber who never received anything, costing them both the
          // aviso and the follow-up that solicits their report.
          assert.equal(plan.writes.length, plan.sends.length, 'the cap holds the dated writes to the sends it allowed');
          assert.deepEqual(
            plan.writes,
            plan.sends.map((send) => ({
              spot_id: send.spot_id,
              endpoint_hash: send.endpoint_hash,
              last_notified_date: '2026-08-10',
            })),
            'each allowed write belongs to an allowed send',
          );

          const announcements = plan.events.filter((event) => /cap|tope|skip|omit/i.test(event.kind));
          assert.equal(
            announcements.length,
            plan.deferred > 0 ? 1 : 0,
            'a remainder is announced, and a run that deferred nobody announces nothing',
          );
          assert.equal(
            announcements[0]?.deferred,
            plan.deferred > 0 ? plan.deferred : undefined,
            'the announcement carries how many were left for later, never a silent truncation',
          );
        },
      ),
      { numRuns: 200 },
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
            const plannedWrites = (plan as { writes?: { spot_id: string; endpoint_hash: string; last_notified_date: string }[] }).writes;

            assert.ok(plan && typeof plan === 'object', 'every run returns a plan, including a deduplicated run');
            assert.ok(Array.isArray(plannedWrites), 'the plan reports the date write that its adapter must make after a send');
            assert.deepEqual(
              plannedWrites,
              plan.sends.map((send) => ({
                spot_id: send.spot_id,
                endpoint_hash: send.endpoint_hash,
                last_notified_date: seed.spotLocalDate,
              })),
              'each planned write belongs to its send and records this spot-local civil date, not a server or UTC date',
            );
            sends += plan.sends.length;
            writes += plannedWrites.length;
            subscriptions = subscriptions.map((subscription) => {
              const write = plannedWrites.find(
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

describe('planNotifications -- afternoon follow-up (R41)', () => {
  it('plans exactly one settled Spanish follow-up after today’s morning aviso, regardless of the later score, during each spot’s local afternoon', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 13, max: 17 }),
        fc.constantFrom(
          { timezone: 'America/Panama', offset: '-05:00' },
          { timezone: 'Etc/GMT-1', offset: '+01:00' },
        ),
        fc.constantFrom<StoredSub['last_notified_date']>(null, '2026-08-09', '2026-08-10', '2026-08-11'),
        fc.constantFrom<StoredSub['followup_date']>(null, '2026-08-09', '2026-08-10', '2026-08-11'),
        fc.integer({ min: 0, max: 100 }),
        (hour, zone, notifiedDate, followupDate, laterScore) => {
          const subscription = subscriptionWithBar(70, {
            last_notified_date: notifiedDate,
            followup_date: followupDate,
          });
          const before = JSON.stringify(subscription);
          const plan = planNotifications({
            now: `2026-08-10T${String(hour).padStart(2, '0')}:25:00${zone.offset}`,
            spots: [{ ...playaVenao, timezone: zone.timezone }],
            scores: { [playaVenao.spot_id]: laterScore },
            subscriptions: [subscription],
            default_threshold_score: fixtureServerThresholdScore,
            run_cap: 10_000,
          });

          const followups = plan.sends.filter((send) => (send as { kind?: string }).kind === 'followup');
          const eligible = hour >= 14 && hour < 17
            && notifiedDate === '2026-08-10'
            && (followupDate === null || followupDate < '2026-08-10');

          assert.equal(
            followups.length,
            eligible ? 1 : 0,
            'only today’s morning aviso and no prior follow-up earn one afternoon question',
          );
          if (eligible) {
            const [followup] = followups;
            assert.deepEqual(
              followup,
              {
                spot_id: playaVenao.spot_id,
                endpoint_hash: subscription.endpoint_hash,
                lang: 'es',
                title: '¿Cómo estuvo?',
                body: '¿Cómo estuvo?',
                url: '/spots/playa-venao/reportar?t=ps',
                tag: playaVenao.spot_id,
                ttl_seconds: 4 * 60 * 60,
                kind: 'followup',
              },
              'the follow-up carries the settled question and the solicited-report deep link',
            );
          }
          assert.equal(JSON.stringify(subscription), before, 'planning does not mutate the supplied subscription state');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// The gone set is written here from the specification (07-write-path.md §8.4
// and adr-push-vapid-direct.md decision 4), never imported from the module
// under test. An oracle that read the production constant would agree with any
// gone set the implementation happened to hold, including "every non-2xx",
// which is exactly the mistake step 01-14 exists to catch.
const SPECIFIED_GONE_STATUSES: readonly number[] = [403, 404, 410];

const endpointHash = fc.string({ minLength: 1, maxLength: 12 }).filter((value) => value.trim().length > 0);

/** Weighted so the gone set is sampled densely while the rest of the HTTP
 *  status space (2xx acks, 429 throttles, 5xx transients) is still explored. */
const sendResponseStatus = fc.oneof(
  fc.constantFrom(403, 404, 410),
  fc.integer({ min: 100, max: 599 }),
);

function sendFor(hash: string) {
  return {
    spot_id: playaVenao.spot_id,
    endpoint_hash: hash,
    lang: 'es',
    title: 'Mejor: Playa Venao, 95',
    body: 'Playa Venao marca 95 esta mañana. Mira el pronóstico.',
    url: '/spots/playa-venao/',
    tag: playaVenao.spot_id,
    ttl_seconds: 4 * 60 * 60,
  };
}

describe('planSendReactions', () => {
  it('marks for deletion exactly the destinations the push service reported gone, prunes nobody on any other answer, and always returns a decision', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({ endpoint_hash: endpointHash, status: sendResponseStatus }),
          { selector: (response) => response.endpoint_hash, minLength: 0, maxLength: 12 },
        ),
        (responses) => {
          const sends = responses.map((response) => sendFor(response.endpoint_hash));
          const sendsBefore = JSON.stringify(sends);
          const responsesBefore = JSON.stringify(responses);

          const reactions = planSendReactions({ sends, responses });

          assert.ok(
            reactions !== null && typeof reactions === 'object',
            'la corrida no llegó a decidir nada sobre esos fallos, así que un cero de borrados todavía no prueba la regla',
          );
          assert.ok(Array.isArray(reactions.deletions), 'a reaction decision always reports its deletions, even when there are none');
          assert.ok(Array.isArray(reactions.events), 'a reaction decision always reports its events, even when there are none');

          const goneHashes = responses
            .filter((response) => SPECIFIED_GONE_STATUSES.includes(response.status))
            .map((response) => response.endpoint_hash);

          assert.deepEqual(
            reactions.deletions,
            goneHashes,
            'only 403, 404 and 410 prune, on the first failure; every other answer, transient ones included, costs nobody their subscription',
          );
          assert.deepEqual(
            reactions.events.map((event) => event.endpoint_hash),
            goneHashes,
            'every pruned destination leaves a loud witness naming it; a subscription deleted in silence is a broken promise nobody sees',
          );
          for (const event of reactions.events) {
            assert.equal(event.kind, 'push_subscription_pruned', 'the prune witness carries the declared event kind');
          }

          assert.equal(JSON.stringify(sends), sendsBefore, 'reacting is pure and does not mutate the supplied sends');
          assert.equal(JSON.stringify(responses), responsesBefore, 'reacting is pure and does not mutate the supplied responses');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never prunes a destination this run has no send for, so an unmatched answer can delete nobody', () => {
    fc.assert(
      fc.property(
        endpointHash,
        endpointHash,
        fc.constantFrom(403, 404, 410),
        (sentHash, unsentHash, goneStatus) => {
          fc.pre(sentHash !== unsentHash);

          const reactions = planSendReactions({
            sends: [sendFor(sentHash)],
            responses: [{ endpoint_hash: unsentHash, status: goneStatus }],
          });

          assert.ok(reactions !== null && typeof reactions === 'object', 'the run still decides when an answer matches no send');
          assert.deepEqual(
            reactions.deletions,
            [],
            'a gone answer for a destination this run never sent to is evidence about nothing; deleting on it would destroy a live subscription',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
