// The offline worker is a classic public script, so it cannot import the
// canonical formatter from src/. This test evaluates the exact shipped worker
// and pins its required inline copy to the source formatter at the clock
// boundaries people actually read.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

import { formatPanamaTime } from '../../src/publish/reading-state';

const REPO_ROOT = resolve(__dirname, '../..');
const SW_SOURCE = readFileSync(resolve(REPO_ROOT, 'public/sw.js'), 'utf8');

type PanamaTimeFormatter = (publishedAt: string) => string;

function shippedWorkerFormatter(): PanamaTimeFormatter | undefined {
  const fakeSelf = {
    addEventListener() {},
    location: { origin: 'https://example.test' },
  };
  // eslint-disable-next-line no-new-func -- the formatter under test is the exact public worker script.
  return new Function('self', `${SW_SOURCE}\nreturn typeof formatPanamaTime === 'function' ? formatPanamaTime : undefined;`)(fakeSelf) as PanamaTimeFormatter | undefined;
}

describe('the offline worker Panama clock', () => {
  it('stays identical to the canonical formatter at midnight, noon, and both halves of the day', () => {
    const workerFormat = shippedWorkerFormatter();
    assert.ok(
      workerFormat,
      'the offline worker must carry its own formatter because public/ scripts cannot import src/publish/reading-state.ts',
    );

    const fixtures = [
      ['2026-08-10T05:00:00Z', '12:00 a.m.'],
      ['2026-08-10T16:59:00Z', '11:59 a.m.'],
      ['2026-08-10T17:00:00Z', '12:00 p.m.'],
      ['2026-08-11T01:04:00Z', '8:04 p.m.'],
    ] as const;

    for (const [publishedAt, expected] of fixtures) {
      assert.equal(workerFormat(publishedAt), formatPanamaTime(publishedAt));
      assert.equal(workerFormat(publishedAt), expected);
    }
  });
});
