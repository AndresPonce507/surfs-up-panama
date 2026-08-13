import {
  SENTINEL_KEY_PREFIX,
  openReportQueue,
  type QueueOutcome,
  type QueueStore,
} from './queue';

export const REPORT_QUEUE_DATABASE = 'psb-report-queue';
export const REPORT_QUEUE_STORE = 'entries';

/** The browser adapter shared by capture and the global returned-signal replay. */
export function openBrowserReportQueue(): Promise<QueueOutcome> {
  return openReportQueue({ openStore: openIndexedDbStore, newSentinel: randomSentinelToken });
}

function openIndexedDbStore(): Promise<QueueStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REPORT_QUEUE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(REPORT_QUEUE_STORE)) {
        request.result.createObjectStore(REPORT_QUEUE_STORE);
      }
    };
    request.onsuccess = () => resolve(storeFrom(request.result));
    request.onerror = () => reject(request.error ?? new Error('report queue: indexedDB open failed'));
  });
}

function storeFrom(db: IDBDatabase): QueueStore {
  return {
    put: (key, value) => runRequest(db, 'readwrite', (store) => store.put(toStorable(key, value), key)).then(() => undefined),
    get: (key) => runRequest(db, 'readonly', (store) => store.get(key)).then(fromStorable),
    remove: (key) => runRequest(db, 'readwrite', (store) => store.delete(key)).then(() => undefined),
    entries: () => listStoredEntries(db),
  };
}

function listStoredEntries(db: IDBDatabase): Promise<readonly { readonly key: string; readonly value: string }[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(REPORT_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(REPORT_QUEUE_STORE);
    const keys = store.getAllKeys();
    const values = store.getAll();
    transaction.oncomplete = () => resolve(
      keys.result.flatMap((key, index) => {
        const value = fromStorable(values.result[index]);
        return typeof key === 'string' && value !== undefined ? [{ key, value }] : [];
      }),
    );
    transaction.onerror = () => reject(transaction.error ?? new Error('report queue: indexedDB list failed'));
  });
}

function runRequest(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(REPORT_QUEUE_STORE, mode);
    const request = action(transaction.objectStore(REPORT_QUEUE_STORE));
    request.onsuccess = () => resolve(request.result as unknown);
    request.onerror = () => reject(request.error ?? new Error('report queue: indexedDB request failed'));
  });
}

/** The probe is a string; reports and settled-reason markers remain structured rows for the worker's offline surface. */
function toStorable(key: string, value: string): unknown {
  return key.startsWith(SENTINEL_KEY_PREFIX) ? value : (JSON.parse(value) as unknown);
}

function fromStorable(stored: unknown): string | undefined {
  if (stored === undefined) return undefined;
  return typeof stored === 'string' ? stored : JSON.stringify(stored);
}

function randomSentinelToken(): string {
  return `probe-${crypto.randomUUID()}`;
}
