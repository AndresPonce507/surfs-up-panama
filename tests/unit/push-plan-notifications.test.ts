// Slice-03 follow-up planning law, driven through the public pure planning
// port. The dynamic load preserves RED as an assertion failure while the
// DISTILL-declared port is still absent.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

type StoredSub = {
  spot_id: string;
  endpoint_hash: string;
  lang: string;
  threshold_score: number | null;
  last_notified_date: string | null;
  followup_date: string | null;
  device_id: string;
};

type NotifyPlan = {
  sends: { spot_id: string; url: string; title: string; body: string; kind?: string }[];
  deferred: number;
  events: { kind: string }[];
};

type PlanNotifications = (input: {
  now: string;
  spots: { spot_id: string; slug: string; name: string; timezone: string }[];
  scores: Record<string, number>;
  subscriptions: StoredSub[];
  run_cap: number;
}) => NotifyPlan;

async function planner(): Promise<PlanNotifications | null> {
  try {
    const module = await import('../../src/push/plan-notifications.ts');
    return typeof module.planNotifications === 'function' ? module.planNotifications : null;
  } catch {
    return null;
  }
}

describe('planNotifications -- afternoon follow-up (R41)', () => {
  it('plans exactly one settled Spanish follow-up for every subscriber notified today and not yet followed up during that spot’s 14:00–17:00 local window', async () => {
    const planNotifications = await planner();
    assert.ok(planNotifications, 'planNotifications must be available through the declared driving port.');

    fc.assert(
      fc.property(
        fc.integer({ min: 14, max: 16 }),
        fc.constantFrom<StoredSub['followup_date']>(null, '2026-08-09', '2026-08-10', '2026-08-11'),
        fc.integer({ min: 0, max: 100 }),
        (hour, followupDate, laterScore) => {
        const plan = planNotifications({
          now: `2026-08-10T${String(hour).padStart(2, '0')}:25:00-05:00`,
          spots: [{ spot_id: 'playa-venao', slug: 'playa-venao', name: 'Playa Venao', timezone: 'America/Panama' }],
          scores: { 'playa-venao': laterScore },
          subscriptions: [{
            spot_id: 'playa-venao', endpoint_hash: 'telefono-03', lang: 'es', threshold_score: 70,
            last_notified_date: '2026-08-10', followup_date: followupDate, device_id: 'telefono-03',
          }],
          run_cap: 10_000,
        });

        const followups = plan.sends.filter((send) => send.kind === 'followup');
          const eligible = followupDate === null || followupDate < '2026-08-10';
          assert.equal(
            followups.length,
            eligible ? 1 : 0,
            'A question is eligible only when the stored follow-up date is absent or strictly before the spot-local day.',
          );
          if (eligible) {
            assert.equal(followups[0]?.spot_id, 'playa-venao');
            assert.equal(followups[0]?.url, '/spots/playa-venao/reportar?t=ps');
            assert.equal(followups[0]?.title, '¿Cómo estuvo?');
            assert.equal(followups[0]?.kind, 'followup');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
