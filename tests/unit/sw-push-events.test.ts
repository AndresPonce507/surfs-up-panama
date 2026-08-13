// The push seat is registered in the classic worker that actually ships at
// /sw.js. This test evaluates that real artifact rather than a copied handler,
// so a green result proves the browser has registrations to invoke.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');
const SW_SOURCE = readFileSync(resolve(REPO_ROOT, 'public/sw.js'), 'utf8');
const ORIGIN = 'https://surfsuppanama.example';
const PAYLOAD = {
  v: 1,
  title: 'Mejor: Playa Venao, 95',
  body: 'Playa Venao marca 95 esta mañana. Mira el pronóstico.',
  url: '/spots/playa-venao/',
  tag: 'playa-venao',
};

type Listener = (event: never) => void;

function loadShippedWorker(openClientUrls: readonly string[] = []) {
  const listeners = new Map<string, Listener[]>();
  const shown: Array<{ title: string; options: { body: string; tag: string; data: { url: string } } }> = [];
  const focused: string[] = [];
  const opened: string[] = [];
  const trail: string[] = [];
  const fakeSelf = {
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    location: { origin: ORIGIN },
    registration: {
      showNotification: async (title: string, options: { body: string; tag: string; data: { url: string } }) => {
        trail.push('show');
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => {
        trail.push('matchAll');
        return openClientUrls.map((url) => ({
          url,
          focus: async () => {
            trail.push('focus');
            focused.push(url);
          },
        }));
      },
      openWindow: async (url: string) => {
        trail.push('openWindow');
        opened.push(url);
      },
    },
  };
  // eslint-disable-next-line no-new-func -- this evaluates the exact public worker, not a copy.
  new Function('self', SW_SOURCE)(fakeSelf);
  return { listeners, shown, focused, opened, trail };
}

function onlyListener(worker: ReturnType<typeof loadShippedWorker>, type: string): Listener {
  const listeners = worker.listeners.get(type) ?? [];
  assert.equal(listeners.length, 1, `expected exactly one ${type} listener in the shipped worker`);
  const listener = listeners[0];
  assert.ok(listener, `expected a ${type} listener in the shipped worker`);
  return listener;
}

describe('the shipped worker Push seat', () => {
  it('shows every push inside waitUntil, including an unreadable one', async () => {
    const worker = loadShippedWorker();
    const push = onlyListener(worker, 'push');
    const pending: Promise<unknown>[] = [];

    push({
      data: { json: () => PAYLOAD },
      waitUntil: (work: Promise<unknown>) => pending.push(work),
    } as never);

    assert.equal(pending.length, 1, 'the browser must hold the worker open until the aviso is shown');
    await Promise.all(pending);
    assert.deepEqual(worker.shown, [{
      title: PAYLOAD.title,
      options: { body: PAYLOAD.body, tag: PAYLOAD.tag, data: { url: PAYLOAD.url } },
    }]);

    const unreadablePending: Promise<unknown>[] = [];
    push({
      data: { json: () => { throw new Error('not JSON'); } },
      waitUntil: (work: Promise<unknown>) => unreadablePending.push(work),
    } as never);
    await Promise.all(unreadablePending);
    assert.equal(worker.shown.length, 2, 'an unreadable browser payload must not become a silent push');
    assert.equal(worker.shown[1]?.options.data.url, '/', 'an unreadable payload lands at the site root');
  });

  it('closes first, then focuses the matching path or opens the payload URL', async () => {
    const focusedWorker = loadShippedWorker([`${ORIGIN}/spots/playa-venao/?from=earlier`]);
    const notificationclick = onlyListener(focusedWorker, 'notificationclick');
    const focusedPending: Promise<unknown>[] = [];

    notificationclick({
      notification: {
        data: { url: PAYLOAD.url },
        close: () => focusedWorker.trail.push('close'),
      },
      waitUntil: (work: Promise<unknown>) => focusedPending.push(work),
    } as never);
    await Promise.all(focusedPending);
    assert.ok(
      focusedWorker.trail.indexOf('close') < focusedWorker.trail.indexOf('matchAll'),
      'a tap closes the notification before the client list is consulted',
    );
    assert.deepEqual(focusedWorker.focused, [`${ORIGIN}/spots/playa-venao/?from=earlier`]);
    assert.deepEqual(focusedWorker.opened, []);

    const emptyWorker = loadShippedWorker();
    const openPending: Promise<unknown>[] = [];
    onlyListener(emptyWorker, 'notificationclick')({
      notification: {
        data: { url: PAYLOAD.url },
        close: () => emptyWorker.trail.push('close'),
      },
      waitUntil: (work: Promise<unknown>) => openPending.push(work),
    } as never);
    await Promise.all(openPending);
    assert.deepEqual(emptyWorker.opened, [PAYLOAD.url]);
  });
});
