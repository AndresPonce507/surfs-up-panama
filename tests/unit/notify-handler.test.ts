import { describe, expect, it } from 'vitest';

import { createNotifyHandler } from '../../src/push/notify-handler';

const subscription = {
  spot_id: 'playa-venao', endpoint_hash: 'a'.repeat(32), endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  p256dh: 'p256dh', auth: 'auth', lang: 'es', threshold_score: 70,
  last_notified_date: null, followup_date: null, device_id: 'd_0123456789abcdef0123456789abcdef',
};

describe('scheduled notify handler', () => {
  it('persists the planned local-day dedup date only after a confirmed push delivery', async () => {
    const writes: unknown[] = [];
    const handler = createNotifyHandler({
      clock: () => new Date('2026-08-13T12:25:00Z'),
      spots: [{ spot_id: 'playa-venao', slug: 'playa-venao', name: 'Playa Venao', timezone: 'America/Panama' }],
      scores: { 'playa-venao': 82 },
      store: {
        list: async () => [subscription],
        stamp: async (write) => { writes.push(write); },
        prune: async () => undefined,
      },
      sender: { send: async () => ({ status: 201 }) },
    });

    await expect(handler.run()).resolves.toEqual({ sent: 1, pruned: 0, deferred: 0 });
    expect(writes).toEqual([{ spot_id: 'playa-venao', endpoint_hash: subscription.endpoint_hash, last_notified_date: '2026-08-13' }]);
  });

  it('prunes a definitely gone endpoint but never lies that it was notified', async () => {
    const writes: unknown[] = [];
    const pruned: unknown[] = [];
    const handler = createNotifyHandler({
      clock: () => new Date('2026-08-13T12:25:00Z'),
      spots: [{ spot_id: 'playa-venao', slug: 'playa-venao', name: 'Playa Venao', timezone: 'America/Panama' }],
      scores: { 'playa-venao': 82 },
      store: {
        list: async () => [subscription],
        stamp: async (write) => { writes.push(write); },
        prune: async (spotId, endpointHash) => { pruned.push([spotId, endpointHash]); },
      },
      sender: { send: async () => ({ status: 410 }) },
    });

    await expect(handler.run()).resolves.toEqual({ sent: 0, pruned: 1, deferred: 0 });
    expect(writes).toEqual([]);
    expect(pruned).toEqual([['playa-venao', subscription.endpoint_hash]]);
  });
});
