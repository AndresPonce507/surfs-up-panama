// Universe-bound state-delta assertion (test-design Mandate 8, adapted to
// this project's TypeScript stack; same shape as the keystone's copy under
// tests/acceptance/daily-call-with-permanent-receipts/steps/support/). The
// universe is the set of port-exposed observable names: file-tree entries
// under a declared root. Never internal struct fields.

import assert from 'node:assert/strict';

export type UniverseSnapshot = Map<string, string>;

export function assertStateDelta(opts: {
  before: UniverseSnapshot;
  after: UniverseSnapshot;
  /** The universe these snapshots were taken over, for the failure message. */
  universe: string;
  /** 'identical': nothing added, removed or changed. */
  expected: 'identical';
  context?: string;
}): void {
  const { before, after, universe, expected } = opts;
  const context = opts.context ? ` ${opts.context}` : '';

  for (const [key, body] of before) {
    assert.ok(
      after.has(key),
      `state-delta over ${universe}: key disappeared: ${key}.${context}`,
    );
    assert.equal(
      after.get(key),
      body,
      `state-delta over ${universe}: key rewritten, not byte-identical: ${key}.${context}`,
    );
  }

  if (expected === 'identical') {
    const added = [...after.keys()].filter((k) => !before.has(k));
    assert.deepEqual(
      added,
      [],
      `state-delta over ${universe}: expected no new keys, found: ${added.join(', ')}.${context}`,
    );
  }
}
