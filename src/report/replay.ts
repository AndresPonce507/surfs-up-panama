import { openBrowserReportQueue } from './browser-queue';
import type { Fetcher } from './mint';
import type { ReportQueue } from './queue';
import { finalizeSavedReport, sendWithCredentialRecovery } from './submit';
import { loadWriteBrowserEndpoints, type WriteBrowserEndpoints } from './write-browser-config';

const RETRY_BASE_MS = 30_000;
const RETRY_CAP_MS = 60 * 60 * 1000;
export const REPORT_QUEUE_FLUSH_MESSAGE = 'flush-report-queue';

export type ReplayResult = { readonly retryable: number };

/** Bounded exponential retry with full-width jitter, capped at one hour. */
export function replayRetryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt));
  return base === RETRY_CAP_MS ? base : Math.min(RETRY_CAP_MS, base + Math.floor(random() * base));
}

/**
 * Sends durable bytes only through the authenticated public Write Function URL.
 * It is intentionally independent of the report screen so any open page can
 * finish a report when signal returns.
 */
export async function replayQueuedReports({
  queue,
  endpoints,
  fetcher = fetch,
}: {
  readonly queue: ReportQueue;
  readonly endpoints: WriteBrowserEndpoints;
  readonly fetcher?: Fetcher;
}): Promise<ReplayResult> {
  const pending = await queue.pendingRecords?.() ?? [];
  if (pending.length === 0) return { retryable: 0 };
  const credential = replayCredentialProvider(queue, fetcher, endpoints.mint);
  let retryable = 0;
  for (const waiting of pending) {
    const outcome = await finalizeSavedReport(
      waiting.report_id,
      await sendWithCredentialRecovery(waiting.bytes, credential, fetcher, endpoints.report),
      {
        discard: (id) => queue.discardSavedRecord?.(id) ?? Promise.reject(new Error('report queue cannot discard receipt')),
        settle: (id, reason) => queue.settleSavedRecord?.(id, reason) ?? Promise.reject(new Error('report queue cannot settle refusal')),
      },
    );
    if (outcome.kind === 'refused' && outcome.persistence === 'may_arrive_later') retryable += 1;
  }
  return { retryable };
}

function replayCredentialProvider(queue: ReportQueue, fetcher: Fetcher, mintEndpoint: string): {
  get(): Promise<string>;
  invalidate(): Promise<void>;
} {
  let credential: Promise<string> | undefined;
  return {
    get: () => {
      credential ??= loadReplayCredential(queue, fetcher, mintEndpoint);
      return credential;
    },
    invalidate: async () => {
      credential = undefined;
      await queue.identity?.clear();
    },
  };
}

async function loadReplayCredential(queue: ReportQueue, fetcher: Fetcher, mintEndpoint: string): Promise<string> {
  const known = await queue.identity?.read();
  if (known !== undefined) return known.credential;
  const deviceId = `d_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const response = await fetcher(mintEndpoint, {
    method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: deviceId }),
  });
  const body = await response.json().catch(() => undefined) as { credential?: unknown } | undefined;
  if (!response.ok || typeof body?.credential !== 'string') throw new Error('No pudimos preparar el envío del reporte ahora.');
  await queue.identity?.write({ deviceId, credential: body.credential });
  return body.credential;
}

type ReplayWindow = Pick<Window, 'addEventListener' | 'setTimeout' | 'clearTimeout' | 'fetch' | 'navigator'>;

/** Starts replay on page open, returned signal, and the worker's activation nudge. */
export function startReportReplay(windowPort: ReplayWindow = window): void {
  let active: Promise<void> | undefined;
  let timer: number | undefined;
  let attempt = 0;

  const schedule = (result: ReplayResult): void => {
    if (result.retryable === 0 || timer !== undefined) return;
    timer = windowPort.setTimeout(() => {
      timer = undefined;
      void run();
    }, replayRetryDelay(attempt));
    attempt += 1;
  };
  const run = (): Promise<void> => {
    if (active !== undefined) return active;
    active = (async () => {
      const opened = await openBrowserReportQueue();
      if (opened.kind !== 'ready' || (await opened.queue.pendingRecords?.() ?? []).length === 0) return;
      const endpoints = await loadWriteBrowserEndpoints(windowPort.fetch);
      if (endpoints === undefined) return;
      const result = await replayQueuedReports({ queue: opened.queue, endpoints, fetcher: windowPort.fetch });
      if (result.retryable === 0) attempt = 0;
      schedule(result);
    })().catch(() => {
      schedule({ retryable: 1 });
    }).finally(() => {
      active = undefined;
    });
    return active;
  };

  windowPort.addEventListener('online', () => { void run(); });
  windowPort.navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === REPORT_QUEUE_FLUSH_MESSAGE) void run();
  });
  void run();
}
