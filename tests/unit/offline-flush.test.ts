import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

const SW_SOURCE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
const REPORT_ISLAND_SOURCE = readFileSync(resolve(__dirname, '../../src/report/island.ts'), 'utf8');
const ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';

const CAPTURE_DATABASE = /const DATABASE_NAME = '([^']+)'/.exec(REPORT_ISLAND_SOURCE)?.[1];
const CAPTURE_STORE = /const STORE_NAME = '([^']+)'/.exec(REPORT_ISLAND_SOURCE)?.[1];
assert.ok(CAPTURE_DATABASE && CAPTURE_STORE, 'the capture adapter must declare its durable queue names');

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

type QueuedEntry = QueuedReport & Readonly<{ refusal_what?: string | null }>;

function queueDatabase(records: QueuedEntry[]) {
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
    objectStoreNames: { contains: (name: string) => name === CAPTURE_STORE },
    close() {},
    transaction(_name: string, mode: IDBTransactionMode) {
      const transaction: { oncomplete?: () => void; objectStore: () => unknown } = {
        objectStore: () => mode === 'readonly'
          ? { getAll: () => request([...remaining]) }
          : {
              put: (record: QueuedEntry, reportId: string) => {
                assert.equal(reportId, record.report_id, 'the keyless capture store uses report_id as its durable key');
                const index = remaining.findIndex((candidate) => candidate.report_id === record.report_id);
                if (index === -1) remaining.push(record);
                else remaining[index] = record;
                queueMicrotask(() => transaction.oncomplete?.());
              },
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
      assert.equal(name, CAPTURE_DATABASE, 'the worker must open the same queue capture commits into');
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

  it('flushes when the helper activates and shares that flush with a simultaneous page nudge', async () => {
    const record: QueuedReport = {
      report_id: '01J0SIGNALSLICE03ACTIVATE1',
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
    let answer: ((response: Response) => void) | undefined;
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
        return new Promise<Response>((resolve) => { answer = resolve; });
      },
    };

    // eslint-disable-next-line no-new-func -- this test drives the shipped worker, never a copy.
    new Function('self', 'indexedDB', SW_SOURCE)(fakeSelf, queue);
    const activate = listeners.get('activate');
    const message = listeners.get('message')?.[0];
    assert.ok(activate && activate.length > 0, 'the helper needs an activation trigger for reports that predate its first install');
    assert.ok(message, 'the returned-signal trigger remains available while activation starts the replay');
    const waits: Promise<unknown>[] = [];
    for (const handler of activate) handler({ waitUntil: (work: Promise<unknown>) => waits.push(work) });
    for (let tick = 0; tick < 8 && sent.length === 0; tick += 1) await new Promise<void>((resolve) => queueMicrotask(resolve));

    assert.equal(sent.length, 1, 'activation must replay the waiting record when the queue predates the helper');
    assert.equal(await sent[0]!.text(), JSON.stringify(record), 'activation must replay the committed record byte-for-byte');
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    for (let tick = 0; tick < 8; tick += 1) await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(sent.length, 1, 'activation must share its in-flight replay with a simultaneous page nudge');
    assert.ok(answer, 'test bug: the worker did not reach the controlled site answer');
    answer(new Response('', { status: 200 }));
    await Promise.all(waits);

    assert.deepEqual(queue.remaining, [], 'the helper removes an activation-time replay only after the site answers');
  });

  it('keeps a refused label, stores the site\'s what, and never replays it on a later automatic trigger', async () => {
    const record: QueuedReport = {
      report_id: '01J0SIGNALSLICE04REFUSED1',
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
    const scheduled: number[] = [];
    const fakeSelf = {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      location: { origin: ORIGIN },
      caches: { open: async () => ({ keys: async () => [] }), keys: async () => [], delete: async () => true },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        sent.push(input instanceof Request ? input : new Request(new URL(input, ORIGIN), init));
        return new Response(JSON.stringify({ error: { code: 'schema_invalid', what: 'El reporte no tiene la forma que esperamos.' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    };

    // eslint-disable-next-line no-new-func -- this test drives the shipped worker, never a copy.
    new Function('self', 'indexedDB', 'setTimeout', SW_SOURCE)(fakeSelf, queue, (_callback: () => void, delay: number) => {
      scheduled.push(delay);
      return scheduled.length;
    });
    const message = listeners.get('message')?.[0];
    assert.ok(message, 'the worker needs the returned-signal trigger before it can retain a refusal');
    const waits: Promise<unknown>[] = [];
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);

    assert.equal(sent.length, 1, 'the refused report reaches the site once to hear its reason');
    assert.equal(await sent[0]!.text(), JSON.stringify(record), 'saved refusal metadata never changes the committed report replay');
    assert.deepEqual(
      queue.remaining,
      [{ ...record, refusal_what: 'El reporte no tiene la forma que esperamos.' }],
      'a permanent refusal keeps its label and retains only the site\'s plain reason beside it',
    );
    assert.deepEqual(scheduled, [], 'a 4xx other than 401 or 429 never schedules an automatic retry');

    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);

    assert.equal(sent.length, 1, 'a later returned-signal trigger never sends a permanently refused report again');
  });

  it('marks a permanent refusal without a readable reason so it cannot be retried', async () => {
    const record: QueuedReport = {
      report_id: '01J0SIGNALSLICE03REFUSEDNOREASON',
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
        sent.push(input instanceof Request ? input : new Request(new URL(input, ORIGIN), init));
        return new Response('', { status: 400 });
      },
    };

    // eslint-disable-next-line no-new-func -- this test drives the shipped worker, never a copy.
    new Function('self', 'indexedDB', SW_SOURCE)(fakeSelf, queue);
    const message = listeners.get('message')?.[0];
    assert.ok(message, 'the returned-signal trigger must retain every permanent refusal, even a malformed one');
    const waits: Promise<unknown>[] = [];
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);
    message({ data: { type: 'flush-report-queue' }, waitUntil: (work: Promise<unknown>) => waits.push(work) });
    await Promise.all(waits);

    assert.equal(sent.length, 1, 'a missing error.what may hide the explanation, never reopen automatic retries');
    assert.deepEqual(queue.remaining, [{ ...record, refusal_what: null }], 'the retained null marker keeps the label and records that the refusal is final');
  });
});
