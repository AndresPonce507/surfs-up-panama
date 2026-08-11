import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

const SW_SOURCE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60 * 1000;

type QueuedReport = Readonly<{
  report_id: string;
  spot_id: string;
  observed_at: string;
  submitted_at: string;
  size_band: string;
  size_band_schema: number;
  wind: string;
  quality: string;
  trigger: string;
}>;

function queueDatabase(records: QueuedReport[]) {
  const remaining = [...records];
  const request = <T>(result: T) => {
    const operation: { result?: T; onsuccess?: () => void } = {};
    queueMicrotask(() => {
      operation.result = result;
      operation.onsuccess?.();
    });
    return operation;
  };
  const database = {
    objectStoreNames: { contains: (name: string) => name === 'queue' },
    close() {},
    transaction(_name: string, mode: IDBTransactionMode) {
      const transaction: { oncomplete?: () => void; objectStore: () => unknown } = {
        objectStore: () => mode === 'readonly'
          ? { getAll: () => request([...remaining]) }
          : {
              delete: (reportId: string) => {
                const index = remaining.findIndex((record) => record.report_id === reportId);
                if (index !== -1) remaining.splice(index, 1);
                queueMicrotask(() => transaction.oncomplete?.());
              },
            },
      };
      return transaction;
    },
  };
  return { open: () => request(database), remaining };
}

async function drainMicrotasks(): Promise<void> {
  for (let tick = 0; tick < 12; tick += 1) await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('offline throttling backoff', () => {
  it('keeps a throttled record and schedules bounded exponential retries with jitter', async () => {
    const record: QueuedReport = {
      report_id: '01J0SIGNALSLICE03BACKOFF01',
      spot_id: 'playa-venao',
      observed_at: '2026-08-10T14:00:00.000Z',
      submitted_at: '2026-08-10T14:30:00.000Z',
      size_band: 'waist_chest',
      size_band_schema: 1,
      wind: 'choppy',
      quality: 'good',
      trigger: 'organic',
    };
    const queue = queueDatabase([record]);
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    const timers: Array<{ delay: number; callback: () => void }> = [];
    const outcomes: Array<Response | Error> = [
      ...Array.from({ length: 9 }, () => new Response('', { status: 429 })),
      new Response('', { status: 503 }),
      new Error('network timeout'),
    ];
    const fakeSelf = {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      location: { origin: ORIGIN },
      caches: { open: async () => ({ keys: async () => [] }), keys: async () => [], delete: async () => true },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      fetch: async () => {
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        assert.ok(outcome, 'test bug: the controlled transient response sequence ran out');
        return outcome;
      },
    };
    const schedule = (callback: () => void, delay: number) => {
      timers.push({ callback, delay });
      return timers.length;
    };
    const deterministicMath = Object.assign(Object.create(Math), { random: () => 0.5 }) as Math;

    // eslint-disable-next-line no-new-func -- this drives the classic worker that ships to phones.
    new Function('self', 'indexedDB', 'setTimeout', 'Math', SW_SOURCE)(fakeSelf, queue, schedule, deterministicMath);
    const message = listeners.get('message')?.[0];
    assert.ok(message, 'the worker needs the returned-signal trigger before it can back off');
    const waits: Promise<unknown>[] = [];
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);

    const delays: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const scheduled = timers.shift();
      assert.ok(scheduled, `a throttled attempt ${attempt + 1} must schedule its retry without sleeping in the test`);
      delays.push(scheduled.delay);
      scheduled.callback();
      await drainMicrotasks();
    }

    assert.ok(delays[0]! >= BASE_DELAY_MS && delays[0]! < BASE_DELAY_MS * 2, 'the first retry waits 30 seconds plus bounded jitter');
    assert.ok(delays[1]! >= BASE_DELAY_MS * 2 && delays[1]! < BASE_DELAY_MS * 4, 'the second retry doubles before jitter');
    assert.ok(delays.every((delay) => delay <= MAX_DELAY_MS), 'no retry delay exceeds the settled one-hour cap');
    assert.equal(delays.at(-1), MAX_DELAY_MS, 'the ladder reaches and holds the one-hour cap');
    const afterServerFailure = timers.shift();
    assert.ok(afterServerFailure, 'a 503 must receive the same bounded retry as a 429');
    afterServerFailure.callback();
    await drainMicrotasks();
    const afterTimeout = timers.shift();
    assert.ok(afterTimeout, 'a network timeout must receive the same bounded retry as a 429');
    afterTimeout.callback();
    await drainMicrotasks();
    assert.ok(timers.shift(), 'a timeout keeps the record waiting and schedules its next polite retry');
    assert.deepEqual(queue.remaining, [record], 'a throttled door keeps the committed report waiting');
  });
});
