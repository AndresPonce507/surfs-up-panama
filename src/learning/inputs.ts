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
import { selectionWeight, type ReporterOverrides } from './weights';

/** The read half of the store the fit is handed: what reading inputs needs. */
export interface LearningInputStore {
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
}

/** log/observations/v1/dt=<date>/reports.jsonl, one row per line. */
export const OBSERVATION_LOG_PREFIX = 'log/observations/v1/';
/** predictions/v1/dt=<run-date>/src=<source>/cyc=<cycle>Z/all.jsonl.gz, one row per line. */
export const PREDICTION_LOG_PREFIX = 'predictions/v1/';
/** Published calls supply the pooled, trailing propensity denominator only. */
export const CALL_LOG_PREFIX = 'log/calls/v1/';
/** Human-PR incident file. It can name reporters, never individual reports. */
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
  trigger?: 'organic' | 'push_solicited';
  /** Fit-only derived state. It never reaches a stored observation or correction. */
  selection_weight?: number;
  /** Fit-only incident weight, applied before every count and residual. */
  override_weight?: number;
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

export type PublishedCallRow = {
  spot_id?: string;
  valid_ts?: string;
  score_q?: number;
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
 * Every session reported in the log, read in key order. An absent day is an
 * absent key, never a zero-filled one, so a log nobody wrote reads as no rows
 * rather than as rows that say nothing happened.
 */
export async function readObservationLog(store: LearningInputStore): Promise<ObservationRow[]> {
  const keys = await store.list(OBSERVATION_LOG_PREFIX);
  const reported: ObservationRow[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    reported.push(...(parseJsonLines(body) as ObservationRow[]));
  }
  return reported;
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

/** Every published call available to this run, pooled across spots for selection weighting. */
export async function readCallHistory(store: LearningInputStore): Promise<PublishedCallRow[]> {
  const keys = await store.list(CALL_LOG_PREFIX);
  const rows: PublishedCallRow[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    rows.push(...(parseJsonLines(body) as PublishedCallRow[]));
  }
  return rows;
}

/** Missing or malformed incident files are the shipped all-ones default. */
export async function readReporterOverrides(store: LearningInputStore): Promise<ReporterOverrides> {
  const body = await store.get(REPORTER_OVERRIDES_KEY);
  if (body === null) return {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([reporter, weight]) =>
        reporter !== '' && typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1
          ? [[reporter, weight]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Add the inverse-propensity term to each usable observation.  The window is
 * the latest 90 published calendar days present in the immutable call log;
 * unavailable or malformed call rows cannot manufacture a rarity bonus.
 */
export function withSelectionWeights(
  observations: readonly ObservationRow[],
  calls: readonly PublishedCallRow[],
): ObservationRow[] {
  const usableCalls = calls.flatMap((call) => {
    const date = utcDateOf(call.valid_ts);
    if (call.spot_id === undefined || date === undefined || typeof call.score_q !== 'number' || !Number.isFinite(call.score_q)) return [];
    return [{ spotId: call.spot_id, date, decile: scoreDecile(call.score_q) }];
  });
  const latestDate = usableCalls.map((call) => call.date).sort().at(-1);
  if (latestDate === undefined) return observations.map((observation) => ({
    ...observation,
    selection_weight: observation.override_weight ?? 1,
  }));
  const firstDate = ninetyDaysBefore(latestDate);
  const windowCalls = usableCalls.filter((call) => call.date >= firstDate);
  const bySpotDay = new Map(windowCalls.map((call) => [`${call.spotId}\u0000${call.date}`, call]));
  const windowDays = [...bySpotDay.values()];
  const reportedSpotDays = new Set(
    observations.flatMap((observation) => {
      const date = utcDateOf(observation.observed_at);
      if (date === undefined) return [];
      const key = `${observation.spot_id}\u0000${date}`;
      return bySpotDay.has(key) ? [key] : [];
    }),
  );
  const reportsByDecile = new Map<number, number>();
  for (const key of reportedSpotDays) {
    const call = bySpotDay.get(key);
    if (call === undefined) continue;
    reportsByDecile.set(call.decile, (reportsByDecile.get(call.decile) ?? 0) + 1);
  }
  return observations.map((observation) => {
    const date = utcDateOf(observation.observed_at);
    const call = date === undefined ? undefined : bySpotDay.get(`${observation.spot_id}\u0000${date}`);
    if (call === undefined) return { ...observation, selection_weight: observation.override_weight ?? 1 };
    const totalDays = windowDays.length;
    const propensityWeight = selectionWeight({
      totalDays,
      reportedDays: reportsByDecile.get(call.decile) ?? 0,
      totalReportedDays: reportedSpotDays.size,
      trigger: observation.trigger,
    });
    return {
      ...observation,
      selection_weight: (observation.override_weight ?? 1) * propensityWeight,
    };
  });
}

function utcDateOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function ninetyDaysBefore(date: string): string {
  const first = new Date(`${date}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 89);
  return first.toISOString().slice(0, 10);
}

function scoreDecile(score: number): number {
  return Math.min(9, Math.max(0, Math.floor(score / 10)));
}

/** The spots the log actually names, each once, in the order they first appear. */
export function spotsReportedIn(reported: readonly ObservationRow[]): string[] {
  return [...new Set(reported.map((session) => session.spot_id))];
}
