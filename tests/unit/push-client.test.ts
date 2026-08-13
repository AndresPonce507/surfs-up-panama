import { describe, expect, it } from 'vitest';

import { readStoredPushStatus, subscribeBrowserToSpot } from '../../src/push/push-client';

const publicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const credential = ['v1', `d_${'0123456789abcdef'.repeat(2)}`, '1', 'fixture-signature'].join('.');
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    keys: { p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString('base64url'), auth: Buffer.alloc(16, 3).toString('base64url') },
  }),
};

describe('browser Push subscription client', () => {
  it('shows subscribed only after the real subscription and the server acknowledgement both exist', async () => {
    const sent: unknown[] = [];
    const outcome = await subscribeBrowserToSpot({
      config: { push_url: 'https://push.example/api/push', mint_url: 'https://mint.example/api/mint', vapid_public_key: publicKey },
      spotId: 'playa-venao', lang: 'es', credential: async () => credential,
      registration: { pushManager: { getSubscription: async () => null, subscribe: async () => subscription } },
      fetcher: async (url, init) => {
        sent.push([url, init]);
        return new Response(JSON.stringify({ status: 'subscribed' }), { status: 200 });
      },
    });

    expect(outcome).toEqual({ kind: 'subscribed' });
    expect(sent).toEqual([[
      'https://push.example/api/push',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-surf-credential': credential },
        body: JSON.stringify({ action: 'subscribe', spot_id: 'playa-venao', subscription: subscription.toJSON(), lang: 'es' }),
      }),
    ]]);
  });

  it('keeps the honest inactive state when the write endpoint refuses the real browser subscription', async () => {
    const outcome = await subscribeBrowserToSpot({
      config: { push_url: 'https://push.example/api/push', mint_url: 'https://mint.example/api/mint', vapid_public_key: publicKey },
      spotId: 'playa-venao', lang: 'es', credential: async () => 'credential',
      registration: { pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription } },
      fetcher: async () => new Response(JSON.stringify({ error: { code: 'store_unavailable' } }), { status: 503 }),
    });

    expect(outcome).toEqual({ kind: 'refused' });
  });

  it('returns to active only after the endpoint confirms this credential owns the real browser subscription', async () => {
    const outcome = await readStoredPushStatus({
      config: { push_url: 'https://push.example/api/push', mint_url: 'https://mint.example/api/mint', vapid_public_key: publicKey },
      spotId: 'playa-venao', subscription, credential: async () => 'credential',
      fetcher: async () => new Response(JSON.stringify({ status: 'subscribed', threshold_score: 67 }), { status: 200 }),
    });

    expect(outcome).toEqual({ kind: 'subscribed', thresholdScore: 67 });
  });
});
