// The offline report queue and the Earned Trust probe that guards it.
//
// application-architecture.md section 12 keeps unsent reports in IndexedDB
// keyed by report_id and drains them when the signal comes back. The rule
// stated there is the one that shapes this whole module: no silent queue that
// drops labels. So storage is never assumed to work. probe() writes, reads
// back and deletes a sentinel before the form is ever shown, and a store that
// refuses any of those three verbs, or that quietly hands back a value it was
// never given, produces a refusal the island can say out loud.
//
// The refused outcome carries no commit function. That is deliberate. commit
// is reachable only through a ready probe, so "commit never runs after a
// refusal" is a property of the type rather than a rule someone has to
// remember at the call site.
//
// domain-model.md section 10 gives SurfReport no edit command, so a row this
// module mangles on the way in is permanently wrong and no later slice can
// repair it. Every one of the ten fields is written explicitly, in a pinned
// order, and read back byte for byte before commit reports success.

import type { ReportRecord } from './report-record';

/** Rows written by the probe live under this prefix, never under a report_id. */
export const SENTINEL_KEY_PREFIX = 'sentinel/';

/**
 * A report the write path has settled is marked under this prefix, beside the
 * label rather than on top of it: domain-model.md section 10 gives SurfReport
 * no edit command, so the stored row is never rewritten, not even to record
 * that it will never be sent.
 */
export const SETTLED_KEY_PREFIX = 'settled/';
const IDENTITY_KEY = 'identity/anonymous';

/** The three verbs the queue needs from durable storage. Every one may refuse. */
export interface QueueStore {
  readonly put: (key: string, value: string) => Promise<void>;
  readonly get: (key: string) => Promise<string | undefined>;
  readonly remove: (key: string) => Promise<void>;
  /** Enumerates the durable rows so a later online visit can drain reports it did not create. */
  readonly entries: () => Promise<readonly { readonly key: string; readonly value: string }[]>;
}

/** Opening storage is refusable in its own right: private mode refuses here. */
export type StoreFactory = () => Promise<QueueStore>;

/** A fresh token per probe, so two probes never share one sentinel row. */
export type SentinelSource = () => string;

export interface QueueDependencies {
  readonly openStore: StoreFactory;
  readonly newSentinel: SentinelSource;
}

export type RefusalReason =
  | 'open_refused'
  | 'write_refused'
  | 'read_back_refused'
  | 'read_back_mismatch'
  | 'delete_refused';

export interface Refused {
  readonly kind: 'refused';
  readonly reason: RefusalReason;
  readonly detail: string;
}

export type ProbeOutcome = { readonly kind: 'ready'; readonly store: QueueStore } | Refused;

export type CommitOutcome = { readonly kind: 'queued'; readonly report_id: string } | Refused;

export interface ReportQueue {
  readonly commit: (record: ReportRecord) => Promise<CommitOutcome>;
  /** The verified durable bytes, used for a later network send without rebuilding the record. */
  readonly savedRecord?: (reportId: string) => Promise<string | undefined>;
  readonly discardSavedRecord?: (reportId: string) => Promise<void>;
  /**
   * Records the write path refused for something the saved bytes can never
   * survive, most of all a badly wrong phone clock. The row is kept and stays
   * readable -- the surfer was told plainly and the label is theirs -- but it
   * stops being something to send.
   */
  readonly settleSavedRecord?: (reportId: string) => Promise<void>;
  /** Immutable records already waiting before this page opened, never a new form value. */
  readonly pendingRecords?: () => Promise<readonly { readonly report_id: string; readonly bytes: string }[]>;
  readonly identity?: {
    read(): Promise<{ readonly deviceId: string; readonly credential: string } | undefined>;
    write(value: { readonly deviceId: string; readonly credential: string }): Promise<void>;
    clear(): Promise<void>;
  };
}

export type QueueOutcome = { readonly kind: 'ready'; readonly queue: ReportQueue } | Refused;

/**
 * Prove the store before the form is shown: write a sentinel, read it back,
 * delete it. Any refusal, and any read back that is not exactly what was
 * written, comes back as a refusal rather than a throw.
 */
export async function probe(deps: QueueDependencies): Promise<ProbeOutcome> {
  const opened = await attempt(() => deps.openStore());
  if (!opened.ok) return refuse('open_refused', opened.detail);
  const store = opened.value;

  const token = deps.newSentinel();
  const key = `${SENTINEL_KEY_PREFIX}${token}`;

  const written = await attempt(() => store.put(key, token));
  if (!written.ok) return refuse('write_refused', written.detail);

  // From here the sentinel exists, so every exit sweeps it back out.
  const readBack = await attempt(() => store.get(key));
  if (!readBack.ok) return sweep(store, key, refuse('read_back_refused', readBack.detail));
  if (readBack.value !== token) {
    const mismatch = refuse('read_back_mismatch', `sentinel read back as ${describeValue(readBack.value)}`);
    return sweep(store, key, mismatch);
  }

  const removed = await attempt(() => store.remove(key));
  if (!removed.ok) return refuse('delete_refused', removed.detail);

  return { kind: 'ready', store };
}

/**
 * Open the queue for this session. A refusal comes back without a queue, so
 * commit is unreachable unless the probe actually passed.
 */
export async function openReportQueue(deps: QueueDependencies): Promise<QueueOutcome> {
  const probed = await probe(deps);
  if (probed.kind === 'refused') return probed;
  const store = probed.store;
  return {
    kind: 'ready',
    queue: {
      commit: (record) => append(store, record),
      savedRecord: (reportId) => store.get(reportId),
      discardSavedRecord: (reportId) => store.remove(reportId),
      settleSavedRecord: (reportId) => store.put(`${SETTLED_KEY_PREFIX}${reportId}`, reportId),
      pendingRecords: async () => pendingFrom(await store.entries()),
      identity: {
        read: async () => parseIdentity(await store.get(IDENTITY_KEY)),
        write: (value) => store.put(IDENTITY_KEY, JSON.stringify(value)),
        clear: () => store.remove(IDENTITY_KEY),
      },
    },
  };
}

/**
 * The reports a later visit may still send: every durable row that is not
 * bookkeeping and has not been settled.
 *
 * The exclusion lives here rather than at the flush call site on purpose. The
 * report page drains its queue on every visit, so a rule the caller has to
 * remember is a rule one future caller forgets, and the report that gets sent
 * anyway is the one the server already refused. Reading it off the rows makes
 * "a settled report never sends itself again" a property of the queue, the
 * same way a refused probe makes commit unreachable rather than forbidden.
 */
function pendingFrom(
  rows: readonly { readonly key: string; readonly value: string }[],
): readonly { readonly report_id: string; readonly bytes: string }[] {
  const settled = new Set(
    rows.filter(({ key }) => key.startsWith(SETTLED_KEY_PREFIX)).map(({ key }) => key.slice(SETTLED_KEY_PREFIX.length)),
  );
  return rows
    .filter(({ key }) => key !== IDENTITY_KEY && !key.startsWith(SENTINEL_KEY_PREFIX) && !key.startsWith(SETTLED_KEY_PREFIX))
    .filter(({ key }) => !settled.has(key))
    .map(({ key, value }) => ({ report_id: key, bytes: value }));
}

function parseIdentity(value: string | undefined): { readonly deviceId: string; readonly credential: string } | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as { deviceId?: unknown; credential?: unknown };
    return typeof parsed.deviceId === 'string' && typeof parsed.credential === 'string'
      ? { deviceId: parsed.deviceId, credential: parsed.credential }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Append one record under its own report_id and read it back byte for byte
 * before calling it queued. A row that cannot be verified is swept, so a
 * refused commit never leaves something behind that claims to be queued.
 */
async function append(store: QueueStore, record: ReportRecord): Promise<CommitOutcome> {
  const key = record.report_id;
  const row = encodeRow(record);

  const written = await attempt(() => store.put(key, row));
  if (!written.ok) return sweep(store, key, refuse('write_refused', written.detail));

  const readBack = await attempt(() => store.get(key));
  if (!readBack.ok) return sweep(store, key, refuse('read_back_refused', readBack.detail));
  if (readBack.value !== row) {
    const mismatch = refuse('read_back_mismatch', `row ${key} read back as ${describeValue(readBack.value)}`);
    return sweep(store, key, mismatch);
  }

  return { kind: 'queued', report_id: key };
}

/**
 * The ten pinned fields, written in one fixed order so the same record always
 * encodes to the same bytes and a retry replays instead of forking.
 */
function encodeRow(record: ReportRecord): string {
  return JSON.stringify({
    report_id: record.report_id,
    spot_id: record.spot_id,
    observed_at: record.observed_at,
    submitted_at: record.submitted_at,
    size_band: record.size_band,
    size_band_schema: record.size_band_schema,
    wind: record.wind,
    quality: record.quality,
    trigger: record.trigger,
    photo_ids: [...record.photo_ids],
  });
}

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly detail: string };

/** Storage refuses two ways: a rejected promise and a synchronous throw. */
async function attempt<T>(action: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (cause) {
    return { ok: false, detail: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** Best effort cleanup on the way out. A store refusing here changes nothing. */
async function sweep<T>(store: QueueStore, key: string, outcome: T): Promise<T> {
  await attempt(() => store.remove(key));
  return outcome;
}

function refuse(reason: RefusalReason, detail: string): Refused {
  return { kind: 'refused', reason, detail };
}

function describeValue(value: string | undefined): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}
