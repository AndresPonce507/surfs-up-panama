// The nightly fit's declared inputs, read through the store port.
//
// 06-learning-layer.md section 2 fixes the closed set of inputs this lane
// consumes and never produces. This module is the one place that names those
// keys, so no other module has to know how the log is laid out.
//
// Two rules from the top of src/pipeline/ports.ts hold here. Nothing reads the
// ambient environment: the store is passed in. And nothing walks a calendar off
// a clock: the dates that exist are discovered by listing the prefix, so a day
// nobody reported simply is not there.
//
// The key that ends in .gz is a NAME, not a promise about the bytes. Both logs
// this step reads are plain JSON lines and are read as text.
//
// Reading is deliberately permissive: a line that fails to parse, or a row
// missing a field this lane needs, is simply not collected here. Nothing in
// this module decides whether a row is USABLE for a residual -- that
// judgement, and the crash-proofing it buys, belongs to whoever forms a
// residual from the row (src/learning/residuals.ts), not to the read.
// spot_id is the one field 01-01's walking skeleton already depended on
// (spotsReportedIn), so it keeps being read the same permissive way it always
// was: a row this module cannot fully make sense of still counts as a spot
// examined, exactly as it did before this step widened the rest of the row.

import type { QualityToken, WindStateToken } from '../data/report-vocab';
import type { SizeBandToken } from '../data/size-bands';

/** The read half of the store the fit is handed: what reading inputs needs. */
export interface LearningInputStore {
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
}

/** log/observations/v1/dt=<date>/reports.jsonl, one row per line. */
export const OBSERVATION_LOG_PREFIX = 'log/observations/v1/';
/** predictions/v1/dt=<run-date>/src=<source>/cyc=<cycle>Z/<partition>.jsonl.gz, one row per line.
 *  The partition names the forecast window the cycle had published when the
 *  fetch saw it (adr-prediction-log-format.md decision 6); older objects are
 *  named `all`. Nothing here parses it: the job reads every key under the
 *  prefix and works from the rows. */
export const PREDICTION_LOG_PREFIX = 'predictions/v1/';
/** log/calls/v1/dt=<date>/build=<HH>Z/<region_id>.jsonl.gz: what the site published, one row per spot-hour. */
export const CALL_LOG_PREFIX = 'log/calls/v1/';
/** 06 section 6.4: the incident file, git-versioned and human-edited by pull request. Absent by default. */
export const REPORTER_OVERRIDES_KEY = 'learned/overrides/v1/reporter-weights.json';

/**
 * One row of the nightly observation export, domain-model.md section 7.3,
 * widened from the walking skeleton's spot_id-only shape now that the
 * residual forms need the rest of it. Every field but spot_id is optional at
 * the TYPE level even though a real export always carries all of them: a
 * parsed row missing one is not this module's problem to reject, only to
 * pass on honestly as absent.
 */
export type ObservationRow = {
  spot_id: string;
  device_id?: string;
  observed_at?: string;
  size_band?: SizeBandToken;
  wind?: WindStateToken;
  quality?: QualityToken;
  predicted?: { score_q: number } | null;
  /** C5's late resolution, domain-model.md section 8: reporter_key = person_id ?? device_id. */
  person_id?: string;
  /**
   * 07 section 1: `organic` by default, `push_solicited` when the flow was
   * opened from a solicitation push. Read only by 06 section 6.3's selection
   * weight, which is the field's one declared consumer.
   */
  trigger?: string;
  /**
   * The two trust-gate carriers, 07 section 6, server-set and frozen at
   * receipt. They exist on every record from day one precisely so G2's
   * eligibility can be flipped on retroactively (06 section 7); they are read
   * only by src/learning/trust.ts and form no residual.
   */
  received_at?: string;
  credential_issued_at?: string;
};

/** One prediction receipt row, the same shape src/pipeline/ingest.ts writes (04-ingest-pipeline.md). */
export type PredictionRow = {
  spot_id: string;
  source: string;
  valid_ts: string;
  lead_h: number;
  swell_h_m: number;
  swell_t_s: number;
  land_masked: boolean;
};

/** A line whose parsed JSON is not an object (or is `null`) is dropped here: reading a `.spot_id` off it later must never throw. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJsonLines(body: string): Record<string, unknown>[] {
  const parsed: Record<string, unknown>[] = [];
  for (const line of body.split('\n')) {
    const row = line.trim();
    if (row === '') continue;
    try {
      const value: unknown = JSON.parse(row);
      if (isRecord(value)) parsed.push(value);
    } catch {
      // An unparseable line contributes nothing; it is not this lane's job
      // to reject the run over one bad line in a 90-day window.
    }
  }
  return parsed;
}

/**
 * Every session reported in the log within the trailing fit window
 * (06-learning-layer.md section 5.2, section 8's "Fit window | trailing
 * 90 d"; adr-per-reporter-offset-estimator), read in key order. An absent day
 * is an absent key, never a zero-filled one, so a log nobody wrote reads as
 * no rows rather than as rows that say nothing happened.
 *
 * Observation keys are partitioned by day (`dt=<date>/reports.jsonl`), so the
 * window is enforced at the KEY level: a whole day outside the window is
 * never fetched, not merely dropped after the GET, keeping both the LIST and
 * the GET bounded as the log grows past ninety days of history.
 *
 * `oldest` is the caller's boundary, not this module's: fit.ts holds the
 * clock and computes it the same way it already computes
 * `publishedCallsWithin`'s own `oldest` for the call log, per the rule at the
 * top of src/pipeline/ports.ts that nothing in this lane reads the ambient
 * clock.
 */
export async function readObservationLog(
  store: LearningInputStore,
  oldest: Date,
): Promise<ObservationRow[]> {
  const keys = await store.list(OBSERVATION_LOG_PREFIX);
  const reported: ObservationRow[] = [];
  for (const key of keys) {
    if (!keyIsWithinFitWindow(key, oldest)) continue;
    const body = await store.get(key);
    if (body === null) continue;
    reported.push(...(parseJsonLines(body) as ObservationRow[]));
  }
  return reported;
}

/**
 * True unless the key's `dt=<date>` day is strictly older than `oldest`,
 * mirroring fit.ts's `publishedCallsWithin` boundary exactly: the day itself
 * (midnight UTC) compared against the caller's `oldest` instant, day < oldest
 * excluded, day >= oldest kept. A key whose day this reader cannot parse is
 * kept rather than dropped: the same permissive-read stance this module takes
 * on rows applies to a key shape this bound was not told to expect -- silence
 * about a day it does not recognise must never look like an honest exclusion.
 */
function keyIsWithinFitWindow(key: string, oldest: Date): boolean {
  const match = /dt=(\d{4}-\d{2}-\d{2})/.exec(key);
  if (match === null) return true;
  return new Date(`${match[1]}T00:00:00Z`).getTime() >= oldest.getTime();
}

/**
 * Every prediction receipt in the log, read in key order. Read the same
 * permissive way as the observation log, for the same reason: a row this
 * module cannot make sense of is a pairing problem for residuals.ts, not a
 * reason to fail the whole nightly run.
 */
export async function readPredictionLog(store: LearningInputStore): Promise<PredictionRow[]> {
  const keys = await store.list(PREDICTION_LOG_PREFIX);
  const rows: PredictionRow[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    rows.push(...(parseJsonLines(body) as PredictionRow[]));
  }
  return rows;
}

/**
 * One published call, 06 section 6.3's propensity denominator and NEVER a
 * residual: the learning lane reads this log to find out how often a kind of
 * morning gets reported at all, not to find out whether the forecast was right.
 */
export type PublishedCallRow = {
  spot_id: string;
  valid_ts: string;
  score_q: number;
};

/**
 * Every published call in the log, read in key order and the same permissive
 * way as the other two: a row this module cannot make sense of contributes no
 * denominator rather than failing the nightly run.
 */
export async function readCallLog(store: LearningInputStore): Promise<PublishedCallRow[]> {
  const keys = await store.list(CALL_LOG_PREFIX);
  const rows: PublishedCallRow[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    rows.push(...(parseJsonLines(body) as PublishedCallRow[]));
  }
  return rows;
}

/**
 * 06 section 6.4's override weights: a flat map of reporter_key to weight.
 *
 * ABSENT MEANS EVERY WEIGHT IS ONE, and so does unreadable, and so does any
 * entry that is not a number. A file nobody can parse names nobody: the one
 * thing this reader must never do is turn a corrupt byte into somebody being
 * dropped from the fit. Erring the other way is safe -- the campaign is still
 * there, the incident is still open, and a human notices.
 */
export async function readReporterOverrides(
  store: LearningInputStore,
): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  const body = await store.get(REPORTER_OVERRIDES_KEY);
  if (body === null) return weights;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return weights;
  }
  if (!isRecord(parsed)) return weights;
  for (const [reporterKey, weight] of Object.entries(parsed)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) continue;
    weights.set(reporterKey, weight);
  }
  return weights;
}

/** The spots the log actually names, each once, in the order they first appear. */
export function spotsReportedIn(reported: readonly ObservationRow[]): string[] {
  return [...new Set(reported.map((session) => session.spot_id))];
}
