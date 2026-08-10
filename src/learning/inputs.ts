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
// The key that ends in .gz is a NAME, not a promise about the bytes. The
// observation log this step reads is plain JSON lines and is read as text.

/** The read half of the store the fit is handed: what reading inputs needs. */
export interface LearningInputStore {
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
}

/** log/observations/v1/dt=<date>/reports.jsonl, one row per line. */
export const OBSERVATION_LOG_PREFIX = 'log/observations/v1/';

/**
 * One reported session, narrowed to the fields this step reads. The full row is
 * domain-model.md section 7.3; later steps widen this as the residual forms they
 * compute need more of it. Nothing is invented here that the log does not carry.
 */
export type ObservedSession = {
  spot_id: string;
};

/**
 * Every session reported in the log, read in key order. An absent day is an
 * absent key, never a zero-filled one, so a log nobody wrote reads as no rows
 * rather than as rows that say nothing happened.
 */
export async function readObservationLog(store: LearningInputStore): Promise<ObservedSession[]> {
  const keys = await store.list(OBSERVATION_LOG_PREFIX);
  const reported: ObservedSession[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    for (const line of body.split('\n')) {
      const row = line.trim();
      if (row === '') continue;
      reported.push(JSON.parse(row) as ObservedSession);
    }
  }
  return reported;
}

/** The spots the log actually names, each once, in the order they first appear. */
export function spotsReportedIn(reported: readonly ObservedSession[]): string[] {
  return [...new Set(reported.map((session) => session.spot_id))];
}
