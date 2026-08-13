import type { Fetcher } from './mint';
import { SEND_REFUSED_MESSAGE, decideRefusal, type RefusalPersistence } from './refusal';

/**
 * The call we had logged for that spot and hour, exactly the five fields
 * 07-write-path.md section 4.2 puts on the wire. Read as a whole or not at
 * all: a half-parsed prediction is how a card renders the word "undefined" at
 * the one moment the surfer is being told what we said.
 *
 * Declared here rather than imported from local-write-store.ts on purpose --
 * that module is the server's filesystem adapter and pulls in node:fs. The
 * browser's copy of the contract is this parse, field by field.
 */
export interface PredictedCall {
  readonly score_q: number;
  readonly size_band: string;
  readonly size_range_m: readonly [number, number];
  readonly wind_state: string;
  readonly conf_level: string;
}

/** Signed, positive = we ran big (07-write-path.md section 4.2). */
export interface ComparisonDelta {
  readonly score_points: number;
  readonly size_bands: number;
}

/** Decision 19's "N de M" pair, counted server-side and only ever displayed. */
export interface ReportCounter {
  readonly n_reports: number;
  readonly threshold: number;
}

/**
 * What came back with the surfer's own report. `delta` and `counter` are
 * absent rather than null when the server did not send a readable pair: the
 * reveal reads presence, so an absent field can only ever produce the honest
 * no-comparison state, never a blank or a zero that looks like a comparison.
 */
export interface ReportReceipt {
  readonly report_id: string;
  readonly outcome: 'compared' | 'no_snapshot' | 'queued_duplicate';
  readonly predicted: PredictedCall | null;
  readonly delta?: ComparisonDelta;
  readonly counter?: ReportCounter;
}

/**
 * `persistence` is what the queue reads: a refusal the same bytes can never
 * survive is settled and must stop sending itself, while everything else is
 * still waiting (src/report/refusal.ts). Carrying only `message` is how a
 * wrong phone clock ended up re-sent on every page load.
 */
export type SubmissionOutcome =
  | { readonly kind: 'received'; readonly receipt: ReportReceipt }
  | {
    readonly kind: 'refused';
    readonly message: string;
    readonly persistence: RefusalPersistence;
    readonly credentialInvalid: boolean;
  };

export interface SavedReportStore {
  discard(reportId: string): Promise<void>;
  /** Keep the label, stop sending it: the write path will never accept these bytes. */
  settle(reportId: string, reason: string): Promise<void>;
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
      'x-surf-credential': credential,
    },
    body: savedBytes,
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) return { kind: 'refused', ...decideRefusal(body), credentialInvalid: response.status === 401 };
  const receipt = receiptFrom(body);
  // An unreadable receipt is not a refusal the server explained: it may well
  // have stored the report, so the label stays waiting and a later send
  // collects its original receipt as a duplicate.
  return receipt === undefined
    ? { kind: 'refused', message: 'No pudimos confirmar el reporte ahora.', persistence: 'may_arrive_later', credentialInvalid: false }
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

/**
 * The one place that decides what a send outcome does to the durable label.
 *
 * A label leaves the queue only once its own receipt is valid and matches. A
 * refusal waiting cannot fix keeps the label but settles it, so no later visit
 * sends it again. Everything else leaves the row exactly as it was, waiting.
 */
export async function finalizeSavedReport(
  reportId: string,
  outcome: SubmissionOutcome,
  store: SavedReportStore,
): Promise<SubmissionOutcome> {
  if (outcome.kind === 'received' && outcome.receipt.report_id === reportId) {
    await store.discard(reportId);
    return outcome;
  }
  if (outcome.kind === 'refused' && outcome.persistence === 'settled') {
    await store.settle(reportId, outcome.message);
  }
  return outcome;
}

function receiptFrom(value: unknown): ReportReceipt | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as { report_id?: unknown; outcome?: unknown; predicted?: unknown; delta?: unknown; counter?: unknown };
  if (typeof candidate.report_id !== 'string') return undefined;
  if (candidate.outcome !== 'compared' && candidate.outcome !== 'no_snapshot' && candidate.outcome !== 'queued_duplicate') return undefined;
  const delta = deltaFrom(candidate.delta);
  const counter = counterFrom(candidate.counter);
  return {
    report_id: candidate.report_id,
    outcome: candidate.outcome,
    predicted: predictedFrom(candidate.predicted),
    ...(delta === undefined ? {} : { delta }),
    ...(counter === undefined ? {} : { counter }),
  };
}

function predictedFrom(value: unknown): PredictedCall | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const { score_q, size_band, size_range_m, wind_state, conf_level } = candidate;
  if (!isFiniteNumber(score_q)) return null;
  if (typeof size_band !== 'string' || typeof wind_state !== 'string' || typeof conf_level !== 'string') return null;
  if (!Array.isArray(size_range_m) || size_range_m.length !== 2) return null;
  const [low, high] = size_range_m as readonly unknown[];
  if (!isFiniteNumber(low) || !isFiniteNumber(high)) return null;
  return { score_q, size_band, size_range_m: [low, high], wind_state, conf_level };
}

function deltaFrom(value: unknown): ComparisonDelta | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { score_points, size_bands } = value as Record<string, unknown>;
  if (!Number.isInteger(score_points) || !Number.isInteger(size_bands)) return undefined;
  return { score_points: score_points as number, size_bands: size_bands as number };
}

function counterFrom(value: unknown): ReportCounter | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { n_reports, threshold } = value as Record<string, unknown>;
  if (!Number.isInteger(n_reports) || !Number.isInteger(threshold)) return undefined;
  return { n_reports: n_reports as number, threshold: threshold as number };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// plainRefusal moved to src/report/refusal.ts as decideRefusal, which reads
// the same WHAT sentence and, on the same pass, the code the queue needs.
// SEND_REFUSED_MESSAGE is re-exported so the one sentence has one home.
export { SEND_REFUSED_MESSAGE };
