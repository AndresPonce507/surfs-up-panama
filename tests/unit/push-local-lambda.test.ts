import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { describe, it } from 'vitest';

import { createPushLambda, type PushStore, type StoredPushSubscription } from '../../src/push/local-lambda';

const secret = 'a'.repeat(32);
const deviceId = 'd_0123456789abcdef0123456789abcdef';
const issuedAt = 1_786_634_400;

function credential(): string {
  const message = `v1.${deviceId}.${issuedAt}`;
  return `${message}.${createHmac('sha256', secret).update(message).digest('base64url')}`;
}

class MemoryPushStore implements PushStore {
  stored: StoredPushSubscription[] = [];

  async subscribe(subscription: StoredPushSubscription): Promise<'stored'> {
    this.stored = [subscription];
    return 'stored';
  }

  async unsubscribe(): Promise<void> {}

  async read(): Promise<StoredPushSubscription | null> {
    return null;
  }
}

describe('POST /api/push', () => {
  it('stores one credential-backed browser subscription with no invented notification dates', async () => {
    const store = new MemoryPushStore();
    const push = createPushLambda({
      store,
      credentialSecret: secret,
      knownSpotIds: ['playa-venao'],
      allowlist: ['fcm.googleapis.com'],
      clock: () => new Date('2026-08-13T12:00:00Z'),
    });

    const response = await push.handle({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-surf-credential': credential() },
      body: JSON.stringify({
        action: 'subscribe',
        spot_id: 'playa-venao',
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/example',
          keys: { p256dh: 'BNc7cv4C0Z7i4adqhvsw6ULC8jPjHEsC4Ha1hSSy8GGAz5dBRr6wqVZ9NnZJZTNz4R_KYxNq5f0e0KmP2jKVdZQ', auth: 'AAAAAAAAAAAAAAAAAAAAAA' },
        },
        lang: 'es',
      }),
    });

    assert.equal(response.statusCode, 200, 'a valid credential-backed browser subscription should receive its acknowledged state');
    assert.deepEqual(response.body, { status: 'subscribed' }, 'the browser only hears subscribed after persistence accepts it');
    assert.equal(store.stored.length, 1, 'one request stores exactly one subscription');
    assert.deepEqual(
      {
        spot_id: store.stored[0]?.spot_id,
        endpoint: store.stored[0]?.endpoint,
        device_id: store.stored[0]?.device_id,
        last_notified_date: store.stored[0]?.last_notified_date,
        followup_date: store.stored[0]?.followup_date,
      },
      {
        spot_id: 'playa-venao',
        endpoint: 'https://fcm.googleapis.com/fcm/send/example',
        device_id: deviceId,
        last_notified_date: null,
        followup_date: null,
      },
      'the server derives identity from the credential and leaves send dates empty until a delivery succeeds',
    );
  });
});
