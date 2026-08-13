import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');
const SW_SOURCE = readFileSync(resolve(REPO_ROOT, 'public/sw.js'), 'utf8');
const BASE_SOURCE = readFileSync(resolve(REPO_ROOT, 'src/layouts/Base.astro'), 'utf8');

describe('report replay ownership', () => {
  it('keeps the generic reading helper out of unauthenticated report delivery', () => {
    const listeners = new Map<string, unknown[]>();
    const helper = {
      addEventListener(type: string, listener: unknown) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      caches: {
        open: async () => ({ keys: async () => [] }),
        keys: async () => [],
        delete: async () => true,
      },
      clients: { claim: async () => {} },
      location: { origin: 'https://preview.example.test' },
      skipWaiting: async () => {},
    };

    // eslint-disable-next-line no-new-func -- exercise the exact classic worker a phone receives.
    new Function('self', SW_SOURCE)(helper);

    assert.equal(listeners.has('message'), false, 'the helper must not own a report-replay message protocol');
    assert.doesNotMatch(SW_SOURCE, /self\.fetch\(WRITE_PATH/, 'the worker must not replay reports to the static site');
    assert.doesNotMatch(BASE_SOURCE, /flush-report-queue/, 'pages must not nudge the helper toward a retired report path');
  });
});
