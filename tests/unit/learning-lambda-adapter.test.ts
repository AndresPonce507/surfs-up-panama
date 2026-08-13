// Runtime proof for the launch state: a nightly tick with no immutable reports
// must complete explicitly, without inventing corrections or public output.

import { describe, expect, it } from 'vitest';

import { createLearningRuntimeHandler } from '../../src/learning/learning-lambda-adapter.js';

type MemoryStore = {
  readonly values: Map<string, string>;
  readonly writes: string[];
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
};

function emptyStore(): MemoryStore {
  const values = new Map<string, string>();
  const writes: string[] = [];
  return {
    values,
    writes,
    async list(prefix) {
      return [...values.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, body) {
      writes.push(key);
      values.set(key, body);
    },
  };
}

describe('scheduled learning runtime', () => {
  it('makes zero reports an explicit successful nightly no-op without a correction or public write', async () => {
    const store = emptyStore();
    const handler = createLearningRuntimeHandler({
      store,
      clock: { now: () => new Date('2026-08-13T00:45:00.000Z') },
    });

    const outcome = await handler({ job: 'nightly-fit' });

    expect(outcome).toEqual({
      job: 'nightly-fit',
      completed: true,
      no_op: true,
      corrections_written: 0,
      metrics_written: false,
    });
    expect(store.writes).toEqual([]);
  });

  it('keeps monthly evaluation metrics-only even when the month has no reports', async () => {
    const store = emptyStore();
    const handler = createLearningRuntimeHandler({
      store,
      clock: { now: () => new Date('2026-08-13T01:05:00.000Z') },
    });

    const outcome = await handler({ job: 'monthly-evaluation' });

    expect(outcome).toEqual({
      job: 'monthly-evaluation',
      completed: true,
      no_op: false,
      corrections_written: 0,
      metrics_written: true,
    });
    expect(store.writes).toEqual(['learned/metrics/v1/dt=2026-08/metrics.json']);
  });
});
