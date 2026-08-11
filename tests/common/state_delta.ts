// Project-wide TypeScript state-delta port. Tests declare only public,
// observable slots in their universe; implementation fields never belong here.
import assert from 'node:assert/strict';

export type UniverseSnapshot = ReadonlyMap<string, string>;

export function assertStateDelta({
  before,
  after,
  universe,
  expected,
}: {
  before: UniverseSnapshot;
  after: UniverseSnapshot;
  universe: readonly string[];
  expected: Readonly<Record<string, 'unchanged' | 'changed'>>;
}): void {
  for (const slot of universe) {
    const changed = before.get(slot) !== after.get(slot);
    assert.equal(
      changed,
      expected[slot] === 'changed',
      `state-delta: public slot ${slot} changed unexpectedly`,
    );
  }
}
