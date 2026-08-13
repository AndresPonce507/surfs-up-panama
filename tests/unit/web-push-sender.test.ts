import { describe, expect, it } from 'vitest';

import { createWebPushSender } from '../../src/push/web-push-sender';

describe('Web Push sender', () => {
  it('configures VAPID once and encrypts only the planned JSON payload for the browser endpoint', async () => {
    const configured: unknown[] = [];
    const sent: unknown[] = [];
    const sender = createWebPushSender({
      setVapidDetails: (...details) => { configured.push(details); },
      sendNotification: async (...details) => { sent.push(details); return { statusCode: 201 }; },
    }, {
      subject: 'https://surfsuppanama.com', publicKey: 'public-key', privateKey: 'private-key',
    });

    const response = await sender.send({
      endpoint: 'https://fcm.googleapis.com/fcm/send/example', p256dh: 'p256dh', auth: 'auth',
    }, {
      title: 'Mejor: Playa Venao, 82', body: 'Playa Venao marca 82 esta mañana. Mira el pronóstico.',
      url: '/spots/playa-venao/', tag: 'playa-venao', ttl_seconds: 14_400,
    });

    expect(response).toEqual({ status: 201 });
    expect(configured).toEqual([['https://surfsuppanama.com', 'public-key', 'private-key']]);
    expect(sent).toEqual([[
      { endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys: { p256dh: 'p256dh', auth: 'auth' } },
      JSON.stringify({ title: 'Mejor: Playa Venao, 82', body: 'Playa Venao marca 82 esta mañana. Mira el pronóstico.', url: '/spots/playa-venao/', tag: 'playa-venao' }),
      { TTL: 14_400 },
    ]]);
  });

  it('turns an explicit browser-service rejection into its status so Notify can prune a gone subscription', async () => {
    const sender = createWebPushSender({
      setVapidDetails: () => undefined,
      sendNotification: async () => {
        throw Object.assign(new Error('subscription expired'), { statusCode: 410 });
      },
    }, {
      subject: 'https://surfsuppanama.com', publicKey: 'public-key', privateKey: 'private-key',
    });

    await expect(sender.send({
      endpoint: 'https://fcm.googleapis.com/fcm/send/example', p256dh: 'p256dh', auth: 'auth',
    }, {
      title: 'Mejor', body: 'Mira el pronóstico.', url: '/spots/playa-venao/', tag: 'playa-venao', ttl_seconds: 14_400,
    })).resolves.toEqual({ status: 410 });
  });
});
