import type { Fetcher } from './mint';

export interface ReportReceipt {
  readonly report_id: string;
  readonly outcome: 'compared' | 'no_snapshot' | 'queued_duplicate';
  readonly predicted: unknown;
}

export type SubmissionOutcome =
  | { readonly kind: 'received'; readonly receipt: ReportReceipt }
  | { readonly kind: 'refused'; readonly message: string; readonly credentialInvalid: boolean };

export interface SavedReportStore {
  discard(reportId: string): Promise<void>;
}

/** Sends only the immutable bytes read from the durable queue. */
export async function sendSavedReport(
  savedBytes: string,
  credential: string,
  fetcher: Fetcher = fetch,
  reportEndpoint: string | undefined = undefined,
): Promise<SubmissionOutcome> {
  if (reportEndpoint === undefined) throw new Error('No hay un endpoint para enviar el reporte.');
  const response = await fetcher(reportEndpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-surf-credential': credential,
    },
    body: savedBytes,
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) return { kind: 'refused', message: plainRefusal(body), credentialInvalid: response.status === 401 };
  const receipt = receiptFrom(body);
  return receipt === undefined
    ? { kind: 'refused', message: 'No pudimos confirmar el reporte ahora.', credentialInvalid: false }
    : { kind: 'received', receipt };
}

/** A stale browser credential gets exactly one invisible remint and replay. */
export async function sendWithCredentialRecovery(
  savedBytes: string,
  credential: { get(): Promise<string>; invalidate(): Promise<void> },
  fetcher: Fetcher = fetch,
  reportEndpoint: string | undefined = undefined,
): Promise<SubmissionOutcome> {
  const first = await sendSavedReport(savedBytes, await credential.get(), fetcher, reportEndpoint);
  if (first.kind !== 'refused' || !first.credentialInvalid) return first;
  await credential.invalidate();
  return sendSavedReport(savedBytes, await credential.get(), fetcher, reportEndpoint);
}

/** A durable label leaves the queue only once its own receipt is valid and matches. */
export async function finalizeSavedReport(
  reportId: string,
  outcome: SubmissionOutcome,
  store: SavedReportStore,
): Promise<SubmissionOutcome> {
  if (outcome.kind === 'received' && outcome.receipt.report_id === reportId) {
    await store.discard(reportId);
  }
  return outcome;
}

function receiptFrom(value: unknown): ReportReceipt | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { report_id?: unknown; outcome?: unknown; predicted?: unknown };
  if (typeof candidate.report_id !== 'string') return undefined;
  if (candidate.outcome !== 'compared' && candidate.outcome !== 'no_snapshot' && candidate.outcome !== 'queued_duplicate') return undefined;
  return { report_id: candidate.report_id, outcome: candidate.outcome, predicted: candidate.predicted };
}

function plainRefusal(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('error' in value)) return 'No pudimos enviar el reporte ahora.';
  const error = value.error;
  if (typeof error !== 'object' || error === null || !('what' in error)) return 'No pudimos enviar el reporte ahora.';
  return typeof error.what === 'string' ? error.what : 'No pudimos enviar el reporte ahora.';
}
