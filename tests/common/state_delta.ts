// Project-wide state-delta port for TypeScript acceptance tests.
//
// Values are deliberately port-exposed observations, never private object
// fields.  The port is small because feature suites supply their own capture
// function for each real driving surface.

import assert from 'node:assert/strict';

export type StateSnapshot = Readonly<Record<string, unknown>>;

export type StateExpectation = Readonly<{
  changed?: Readonly<Record<string, unknown>>;
  unchanged?: readonly string[];
}>;

export function assertStateDelta(
  before: StateSnapshot,
  after: StateSnapshot,
  universe: readonly string[],
  expected: StateExpectation,
): void {
  for (const name of universe) {
    const expectedChange = expected.changed?.[name];
    if (Object.prototype.hasOwnProperty.call(expected.changed ?? {}, name)) {
      assert.deepEqual(after[name], expectedChange, `state delta: ${name} did not reach its declared value`);
    } else {
      assert.deepEqual(after[name], before[name], `state delta: ${name} changed without being declared`);
    }
  }

  for (const name of expected.unchanged ?? []) {
    assert.deepEqual(after[name], before[name], `state delta: ${name} was expected to remain unchanged`);
  }
}
