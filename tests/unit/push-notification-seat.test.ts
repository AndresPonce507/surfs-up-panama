// Laws for the service worker notification seat (slice-01 steps 01-15 to
// 01-19). The seat is THIS lane's module; the two registration lines that
// mount it belong to F-WORKS-WITH-NO-SIGNAL's service worker file and are
// handed over as a contract, never written here.
//
// The roadmap marks these steps EXEMPT FROM THE PBT PARADIGM: service worker
// event wiring is single-shot by nature, and the invariants worth quantifying
// live in the payload composition (01-06) rather than here. The one exception
// below is deliberate: "never a silent push" IS a law over arbitrary payloads,
// including payloads that cannot be read at all, so it is written as a
// property.
//
// EVERY handler call takes its scope as an argument. Nothing here touches a
// global `self`, which is also why these tests run at all under vitest's node
// environment: a module reaching for an ambient service worker global would
// throw before it showed anything.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { handleNotificationClick, handlePush } from '../../src/push/notification-seat';

const VENAO_PAYLOAD = {
  title: 'Mejor: Playa Venao, 95',
  body: 'Playa Venao marca 95 esta mañana. Mira el pronóstico.',
  spot_id: 'playa-venao',
  url: '/spots/playa-venao/',
};

type ShowCall = { title: string; options: { body: string; tag: string; data: { url: string } } };

/**
 * A service worker scope whose network and storage capabilities are TRAPS.
 * Step 01-17's obligation is a designed absence, so it has to be observable:
 * any handler that reaches for one of the four is recorded and thrown at,
 * rather than quietly succeeding.
 */
function trapScope(openClients: readonly string[] = []) {
  const shown: ShowCall[] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const touched: string[] = [];
  const trail: string[] = [];

  function trap(name: string): (...args: readonly unknown[]) => never {
    return () => {
      touched.push(name);
      throw new Error(`el aviso tocó ${name}, que tiene que quedar sin tocar`);
    };
  }

  const scope = {
    registration: {
      // Deliberately deferred to a later tick. A handler that called
      // showNotification without handing the promise to waitUntil would leave
      // nothing held open, and the worker is free to die before this resolves:
      // that is the silent push the browser punishes. Recording on a later tick
      // is what makes "held open until actually shown" observable at all.
      showNotification: (title: string, options: ShowCall['options']): Promise<string> =>
        new Promise((resolve) => {
          setTimeout(() => {
            trail.push('show');
            shown.push({ title, options });
            resolve('shown');
          }, 0);
        }),
    },
    clients: {
      matchAll: async (): Promise<readonly { url: string; focus: () => Promise<unknown> }[]> => {
        trail.push('matchAll');
        return openClients.map((url) => ({
          url,
          focus: async (): Promise<unknown> => {
            trail.push('focus');
            focused.push(url);
            return null;
          },
        }));
      },
      openWindow: async (url: string): Promise<unknown> => {
        trail.push('openWindow');
        opened.push(url);
        return null;
      },
    },
    fetch: trap('la red'),
    caches: { open: trap('caches'), match: trap('caches'), keys: trap('caches') },
    indexedDB: { open: trap('IndexedDB'), deleteDatabase: trap('IndexedDB') },
    localStorage: { getItem: trap('localStorage'), setItem: trap('localStorage'), removeItem: trap('localStorage') },
  };

  return { scope, shown, opened, focused, touched, trail };
}

/** A push event carrying a readable JSON payload. */
function pushEvent(payload: unknown) {
  const pending: Promise<unknown>[] = [];
  return {
    event: {
      data: { json: (): unknown => payload },
      waitUntil: (work: Promise<unknown>): void => {
        pending.push(work);
      },
    },
    pending,
  };
}

/** A push event with no payload at all, which the browser is free to deliver. */
function emptyPushEvent() {
  const pending: Promise<unknown>[] = [];
  return {
    event: {
      waitUntil: (work: Promise<unknown>): void => {
        pending.push(work);
      },
    },
    pending,
  };
}

/**
 * `trail` is the SHARED call trail from the scope this event is handed to, so
 * the close-then-decide ordering step 01-18 requires is observable across both
 * objects rather than only inside one of them.
 */
function clickEvent(data: unknown, trail: string[]) {
  const pending: Promise<unknown>[] = [];
  const closed: string[] = [];
  return {
    closed,
    pending,
    event: {
      notification: {
        data,
        close: (): void => {
          trail.push('close');
          closed.push('close');
        },
      },
      waitUntil: (work: Promise<unknown>): void => {
        pending.push(work);
      },
    },
  };
}

describe('handlePush', () => {
  it('shows the payload title and body, grouped by spot, and holds the event open until it is actually shown', async () => {
    const { scope, shown } = trapScope();
    const { event, pending } = pushEvent(VENAO_PAYLOAD);

    handlePush(event, scope);

    assert.equal(
      pending.length,
      1,
      'the handler holds the event open with waitUntil; a bare showNotification lets the worker die mid-push and the browser sees a silent push',
    );
    assert.equal(shown.length, 0, 'nothing is shown before the held work is awaited, which is what proves waitUntil received the real work');

    await Promise.all(pending);

    assert.equal(shown.length, 1, 'every push received shows exactly one notification');
    assert.equal(shown[0]?.title, VENAO_PAYLOAD.title, 'the notification carries the payload title');
    assert.equal(shown[0]?.options.body, VENAO_PAYLOAD.body, 'the notification carries the payload body');
    assert.equal(
      shown[0]?.options.data.url,
      VENAO_PAYLOAD.url,
      'the url is placed in the notification data at show time; without it, tapping has nothing to read',
    );
  });

  it('never lets a push arrive in silence, whatever the payload turns out to be', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(VENAO_PAYLOAD),
          fc.anything(),
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ title: fc.string(), body: fc.string(), spot_id: fc.string(), url: fc.string() }),
        ),
        async (payload) => {
          const { scope, shown, touched } = trapScope();
          const { event, pending } = pushEvent(payload);

          handlePush(event, scope);
          await Promise.all(pending);

          assert.equal(
            shown.length,
            1,
            'a push that shows nothing costs the surfer the whole subscription: browsers punish a silent push by revoking it',
          );
          assert.ok((shown[0]?.title ?? '').trim().length > 0, 'a shown notification always has a title a surfer can read');
          assert.ok((shown[0]?.options.tag ?? '').trim().length > 0, 'a shown notification always carries a tag, so it replaces rather than stacks');
          assert.deepEqual(touched, [], 'showing an unreadable payload still touches no network and no storage');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('shows a notification even when the browser delivers a push with no payload at all', async () => {
    const { scope, shown } = trapScope();
    const { event, pending } = emptyPushEvent();

    handlePush(event, scope);
    await Promise.all(pending);

    assert.equal(shown.length, 1, 'a payload-less push is still a push, and still has to be shown');
  });

  it('groups two avisos of the same spot under the spot tag, so the new one replaces the old instead of stacking', async () => {
    const { scope, shown } = trapScope();

    for (const score of [88, 95]) {
      const { event, pending } = pushEvent({ ...VENAO_PAYLOAD, title: `Mejor: Playa Venao, ${score}` });
      handlePush(event, scope);
      await Promise.all(pending);
    }

    assert.equal(shown.length, 2, 'both avisos are shown; replacement is the browser\'s job given a shared tag, never a suppressed second push');
    assert.equal(shown[0]?.options.tag, VENAO_PAYLOAD.spot_id, 'the tag is the spot carried in the payload');
    assert.equal(shown[1]?.options.tag, VENAO_PAYLOAD.spot_id, 'the second aviso shares the first one\'s tag, never a per-message identifier');
  });

  it('shows the aviso without asking the network or reading or writing any storage', async () => {
    const { scope, shown, touched } = trapScope();
    const { event, pending } = pushEvent(VENAO_PAYLOAD);

    handlePush(event, scope);
    await Promise.all(pending);

    assert.equal(
      shown.length,
      1,
      'el aviso nunca se llegó a mostrar, así que no haber tocado nada todavía no prueba nada',
    );
    assert.deepEqual(
      touched,
      [],
      'everything the notification needs comes from the payload; a stateless handler cannot be broken by iOS storage eviction or missing Background Sync',
    );
  });
});

describe('handleNotificationClick', () => {
  it('closes the aviso first, then focuses the window already on that spot, without opening a second one', async () => {
    const { scope, opened, focused, touched, trail } = trapScope([
      'https://surfsuppanama.example/spots/otro-spot/',
      'https://surfsuppanama.example/spots/playa-venao/',
    ]);
    const { event, pending, closed } = clickEvent({ url: VENAO_PAYLOAD.url }, trail);

    handleNotificationClick(event, scope);
    await Promise.all(pending);

    assert.deepEqual(closed, ['close'], 'el aviso siguió en la bandeja después de tocarlo');
    assert.ok(
      trail.indexOf('close') >= 0 && trail.indexOf('close') < trail.indexOf('matchAll'),
      'the notification is closed BEFORE the client list is consulted; the order is observable, not incidental',
    );
    assert.deepEqual(focused, ['https://surfsuppanama.example/spots/playa-venao/'], 'the window already on that spot is the one focused');
    assert.deepEqual(opened, [], 'no second window is opened when a matching client exists');
    assert.deepEqual(touched, [], 'tapping touches no network and no storage either');
  });

  it('closes the aviso and opens the spot page when no window is open at all', async () => {
    const { scope, opened, focused, trail } = trapScope([]);
    const { event, pending, closed } = clickEvent({ url: VENAO_PAYLOAD.url }, trail);

    handleNotificationClick(event, scope);
    await Promise.all(pending);

    assert.deepEqual(closed, ['close'], 'the notification is closed on this path too, exactly as when a client already existed');
    assert.deepEqual(opened, [VENAO_PAYLOAD.url], 'with nothing open, tapping opens a window at the payload url');
    assert.deepEqual(focused, [], 'nothing can be focused when the client list is empty');
    assert.ok(trail.includes('matchAll'), 'the choice between focusing and opening is made from the actual client list, never assumed');
  });

  it('still closes the aviso and lands the surfer somewhere when the notification carries no url', async () => {
    const { scope, opened, trail } = trapScope([]);
    const { event, pending, closed } = clickEvent(null, trail);

    handleNotificationClick(event, scope);
    await Promise.all(pending);

    assert.deepEqual(closed, ['close'], 'a notification with no data is still dismissed when it is tapped');
    assert.equal(opened.length, 1, 'a tap always lands somewhere rather than doing nothing visible');
    assert.ok(trail.includes('matchAll'), 'the client list is still what decides, even for a url-less notification');
  });
});
