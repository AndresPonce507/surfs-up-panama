import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

const SW_SOURCE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';

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
  return {
    open(name: string) {
      assert.equal(name, 'surf-reports', 'the worker must open the same queue capture commits into');
      return request(database);
    },
    remaining,
  };
}

describe('offline queue flush', () => {
  it('replays the settled record unchanged and removes it after the site answers 200', async () => {
    const record: QueuedReport = {
      report_id: '01J0SIGNALSLICE03FLUSH001',
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
    const sent: Request[] = [];
    const fakeSelf = {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      location: { origin: ORIGIN },
      caches: { open: async () => ({ keys: async () => [] }), keys: async () => [], delete: async () => true },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(new URL(input, ORIGIN), init);
        sent.push(request);
        return new Response('', { status: 200 });
      },
    };

    // eslint-disable-next-line no-new-func -- this test drives the shipped worker, never a copy.
    new Function('self', 'indexedDB', SW_SOURCE)(fakeSelf, queue);
    const message = listeners.get('message')?.[0];
    assert.ok(message, 'the worker needs a page-message trigger because Background Sync is optional');
    const waits: Promise<unknown>[] = [];
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);

    assert.equal(sent.length, 1, 'returned coverage must send the waiting report once without a user action');
    assert.equal(sent[0]?.url, `${ORIGIN}/api/report`);
    assert.equal(sent[0]?.method, 'POST');
    assert.equal(await sent[0]!.text(), JSON.stringify(record), 'a retry must replay the committed record byte-for-byte');
    assert.deepEqual(queue.remaining, [], 'any 200 acknowledgement removes the record from the phone queue');
    assert.equal(listeners.has('sync'), false, 'Background Sync is not a required trigger');
  });
});
