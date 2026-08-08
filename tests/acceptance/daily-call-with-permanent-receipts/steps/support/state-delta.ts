// Universe-bound state-delta assertion (test-design Mandate 8, adapted to
// this project's TypeScript stack). The universe is the set of port-exposed
// observable names: object-store keys under a declared prefix. Never internal
// struct fields.

import assert from 'node:assert/strict';

export type UniverseSnapshot = Map<string, string>;

export function assertStateDelta(opts: {
  before: UniverseSnapshot;
  after: UniverseSnapshot;
  /** The universe these snapshots were taken over, for the failure message. */
  universe: string;
  /** 'identical': nothing added, removed or changed.
   *  'append-only': every prior key byte-identical; new keys permitted. */
  expected: 'identical' | 'append-only';
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
