import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

type NotificationOptions = { body: string; tag: string; data: { url: string } };
type NotificationPayload = {
  v: number;
  title: string;
  body: string;
  url: string;
  tag: string;
};

type PushEventPort = {
  data: { json: () => NotificationPayload };
  waitUntil: (promise: Promise<unknown>) => void;
};

describe('handlePush', () => {
  // Event wiring is paradigm-exempt: this focused deterministic port test
  // proves the one observable handoff from a received push to the browser.
  it('shows every received payload and holds the event open until its notification settles', async () => {
    const payload = {
      v: 1,
      title: 'Mejor: Playa Venao, 91',
      body: 'Cintura a pecho y limpio.',
      url: '/spots/playa-venao/',
      tag: 'playa-venao',
    };
    let shown: { title: string; options: NotificationOptions } | undefined;
    let waited: Promise<unknown> | undefined;
    let finishNotification: (() => void) | undefined;
    const notification = new Promise<void>((resolve) => {
      finishNotification = resolve;
    });
    const event: PushEventPort = {
      data: { json: () => payload },
      waitUntil: (promise) => {
        waited = promise;
      },
    };
    const scope = {
      registration: {
        showNotification: (title: string, options: NotificationOptions) => {
          shown = { title, options };
          return notification;
        },
      },
    };

    const { handlePush } = await import('../../src/push/notification-seat');
    handlePush(event, scope);

    assert.deepEqual(shown, {
      title: payload.title,
      options: { body: payload.body, tag: payload.tag, data: { url: payload.url } },
    });
    assert.strictEqual(waited, notification, 'waitUntil must receive the pending showNotification promise');
    finishNotification?.();
    await waited;
  });
});
