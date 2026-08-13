import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, it } from 'vitest';

const SW_SOURCE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

describe('offline queue flush handoff', () => {
  it('stays within the accepted worker budget', () => {
    assert.ok(gzipSync(SW_SOURCE).length <= 3.4 * 1024, 'the service-worker delivery path must stay within its 3.4 KB gzip ceiling');
  });

  it('asks every open page to perform the authenticated replay on activation and on the returned-signal message', async () => {
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    const notices: unknown[] = [];
    const fakeSelf = {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      location: { origin: 'https://surfs-up.example' },
      caches: { open: async () => ({ keys: async () => [] }), keys: async () => [], delete: async () => true },
      clients: {
        claim: async () => {},
        matchAll: async () => [{ postMessage: (message: unknown) => notices.push(message) }],
      },
      skipWaiting: async () => {},
      fetch: async () => new Response('', { status: 200 }),
    };

    // eslint-disable-next-line no-new-func -- this evaluates the shipped worker artifact.
    new Function('self', SW_SOURCE)(fakeSelf);
    const activate = listeners.get('activate');
    const message = listeners.get('message')?.[0];
    assert.ok(activate && activate.length > 0, 'activation must wake an already-open page that holds a queued report');
    assert.ok(message, 'the online nudge must reach the page that owns the credential');

    const waits: Promise<unknown>[] = [];
    for (const handler of activate) handler({ waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);

    assert.deepEqual(
      notices,
      [{ type: 'flush-report-queue' }, { type: 'flush-report-queue' }],
      'the worker never posts the report itself: it hands replay to the open page, which can mint and attach x-surf-credential',
    );
    assert.doesNotMatch(SW_SOURCE, /self\.fetch\(WRITE_PATH/, 'a direct same-origin worker POST would 404 in production');
  });
});
