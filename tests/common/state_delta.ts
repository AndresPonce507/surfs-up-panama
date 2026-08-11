// Project-wide state-delta port for TypeScript acceptance tests. Universe
// names are port-exposed observations, never private object fields.

import assert from 'node:assert/strict';

export type StateSnapshot = Readonly<Record<string, unknown>>;

export type DeltaPredicate =
  | Readonly<{ kind: 'set_to'; value: unknown }>
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'containing'; value: unknown }>
  | Readonly<{ kind: 'appended_with'; value: unknown }>
  | Readonly<{ kind: 'prepended_with'; value: unknown }>
  | Readonly<{ kind: 'normalized_to'; value: unknown }>
  | Readonly<{ kind: 'idempotent_after' }>
  | Readonly<{ kind: 'legacy_healed'; value: unknown }>;

export const setTo = (value: unknown): DeltaPredicate => ({ kind: 'set_to', value });
export const unchanged = (): DeltaPredicate => ({ kind: 'unchanged' });
export const containing = (value: unknown): DeltaPredicate => ({ kind: 'containing', value });
export const appendedWith = (value: unknown): DeltaPredicate => ({ kind: 'appended_with', value });
export const prependedWith = (value: unknown): DeltaPredicate => ({ kind: 'prepended_with', value });
export const normalizedTo = (value: unknown): DeltaPredicate => ({ kind: 'normalized_to', value });
export const idempotentAfter = (): DeltaPredicate => ({ kind: 'idempotent_after' });
export const legacyHealed = (value: unknown): DeltaPredicate => ({ kind: 'legacy_healed', value });

function contains(value: unknown, expected: unknown): boolean {
  return typeof value === 'string'
    ? value.includes(String(expected))
    : Array.isArray(value) && value.some((item) => Object.is(item, expected));
}

export function assertStateDelta(
  before: StateSnapshot,
  after: StateSnapshot,
  universe: readonly string[],
  expected: Readonly<Record<string, DeltaPredicate>>,
): void {
  const allowed = new Set(universe);
  for (const name of Object.keys(expected)) {
    assert.ok(allowed.has(name), `state delta: expected ${name} is outside the declared universe`);
  }
  for (const name of universe) {
    const predicate = expected[name] ?? unchanged();
    const was = before[name];
    const now = after[name];
    switch (predicate.kind) {
      case 'set_to': case 'normalized_to': case 'legacy_healed':
        assert.deepEqual(now, predicate.value, `state delta: ${name} did not reach its declared value`);
        break;
      case 'unchanged': case 'idempotent_after':
        assert.deepEqual(now, was, `state delta: ${name} changed without being declared`);
        break;
      case 'containing':
        assert.ok(contains(now, predicate.value), `state delta: ${name} does not contain its declared value`);
        break;
      case 'appended_with':
        assert.deepEqual(now, Array.isArray(was) ? [...was, predicate.value] : undefined, `state delta: ${name} was not appended with its declared value`);
        break;
      case 'prepended_with':
        assert.deepEqual(now, Array.isArray(was) ? [predicate.value, ...was] : undefined, `state delta: ${name} was not prepended with its declared value`);
        break;
    }
  }
}
