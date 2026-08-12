// The monthly evaluation's driving port, accepted roadmap 05-01/05-02
// (06-learning-layer.md section 10, section 7 row G7).
//
// METRICS-ONLY, per wave-decisions.md D-2026-08-12-1: this run writes
// exactly one file, under learned/metrics/v1/, and touches nothing else in
// the store. Most pointedly, it never rewrites a stored correction --
// recover/learning-build's evaluate.ts (lines 36-38, an in-place
// `current/<spot_id>.json` rewrite on a corrections-killed verdict) is the
// ruled-out mechanism and is not ported here in any form. A held-out kill
// verdict is published INTO this file's `cv.verdict` (buildMonthlyMetrics, by
// way of src/learning/cross-validation.ts's judge) and consumed by the
// correction-apply lane (src/learning/load-correction.ts); the stored
// corrections stay byte-untouched by this job on every verdict.
//
// `outcome.verdict` and the file's `cv.verdict` are one computation
// (roadmap 05-02 criterion 5): both read straight off `metrics.cv.verdict`,
// never recomputed a second way. A kill month also announces itself in
// `outcome.events`, distinct from a winning or not-yet-evaluated month
// (D-2026-08-12-1 pin 3) -- the file is the durable record, the event is the
// same fact said out loud to whoever is watching the run itself.
//
// Store and clock are passed in; nothing here reads the ambient environment
// or the ambient clock, per the rule at the top of src/pipeline/ports.ts.
// The fit window boundary is computed the same way src/learning/fit.ts
// computes its own -- this module owns reading its own clock, exactly as
// that one does.

import type { Clock } from '../pipeline/ports';
import { CORRECTIONS_PREFIX, type StoredCorrection } from './correction-file';
import { FIT_WINDOW_DAYS } from './constants';
import {
  readCallLog,
  readObservationLog,
  readPredictionLog,
  type LearningInputStore,
} from './inputs';
import { buildMonthlyMetrics, type MonthlyMetrics } from './metrics';

export const METRICS_PREFIX = 'learned/metrics/v1/';

/** The one event a kill month adds beyond `metrics_written` (D-2026-08-12-1 pin 3): the outcome must distinguish a kill month, not just the file it wrote. */
const EVENT_CORRECTIONS_KILLED = 'learning.cv.corrections_killed';

/** What the monthly evaluation needs of the store: read its inputs, store the one file it writes. */
export interface MonthlyEvaluationStore extends LearningInputStore {
  put(key: string, body: string): Promise<void>;
}

export interface MonthlyEvaluationDeps {
  store: MonthlyEvaluationStore;
  clock: Clock;
  /**
   * Accepted by the port's documented shape (roadmap 05-01 criterion 1) for
   * parity with the nightly fit's own `spots?` seam. Unused this step: no
   * pooling decision runs inside a metrics-only job. A later step that needs
   * the seed roster (e.g. to label a shrinkage row's basin) widens this same
   * parameter rather than adding a second one.
   */
  spots?: readonly unknown[];
}

/**
 * What one monthly evaluation reports. The same absence-needs-a-witness
 * discipline as `runLearningFitOnce`'s outcome: "the run finished, wrote this
 * one file, and reached this verdict" is a claim a surface has to exist to
 * make, and it is false the moment the job dies quietly.
 */
export type MonthlyEvaluationOutcome = {
  /** True iff the run reached its end. */
  completed: boolean;
  verdict: MonthlyMetrics['cv']['verdict'];
  /** The one key this run wrote, so the operator never hunts for it. */
  metrics_key: string;
  events: { type: string; detail?: string }[];
};

export async function runMonthlyEvaluationOnce(
  deps: MonthlyEvaluationDeps,
): Promise<MonthlyEvaluationOutcome> {
  const now = deps.clock.now();

  const observations = await readObservationLog(deps.store, oldestFitWindowBoundary(now));
  const predictions = await readPredictionLog(deps.store);
  const calls = await readCallLog(deps.store);
  const corrections = await readCurrentCorrections(deps.store);

  const metrics = buildMonthlyMetrics({ observations, predictions, calls, corrections });
  const metricsKey = monthlyMetricsKey(now);
  await deps.store.put(metricsKey, JSON.stringify(metrics));

  const events: MonthlyEvaluationOutcome['events'] = [{ type: 'metrics_written', detail: metricsKey }];
  if (metrics.cv.verdict === 'corrections-killed') {
    events.push({
      type: EVENT_CORRECTIONS_KILLED,
      detail: `${metricsKey}: cv.verdict is corrections-killed, so the apply lane degrades to day zero until a human looks`,
    });
  }

  return {
    completed: true,
    verdict: metrics.cv.verdict,
    metrics_key: metricsKey,
    events,
  };
}

/**
 * `now` minus FIT_WINDOW_DAYS, exactly the boundary fit.ts computes for the
 * observation log (06 section 5.2, section 8's "Fit window | trailing 90
 * d"). Restated here rather than imported: fit.ts's own copy is a private
 * function, and reading the clock belongs to whichever module holds it, not
 * to inputs.ts (src/pipeline/ports.ts's rule).
 */
function oldestFitWindowBoundary(now: Date): Date {
  const oldest = new Date(now);
  oldest.setUTCDate(oldest.getUTCDate() - FIT_WINDOW_DAYS);
  return oldest;
}

function monthlyMetricsKey(now: Date): string {
  return `${METRICS_PREFIX}dt=${now.toISOString().slice(0, 7)}/metrics.json`;
}

/** Read-only: the shrinkage section reads stored corrections; this job never writes to their prefix. */
async function readCurrentCorrections(store: MonthlyEvaluationStore): Promise<StoredCorrection[]> {
  const keys = await store.list(`${CORRECTIONS_PREFIX}current/`);
  const records: StoredCorrection[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    const record = parseStoredCorrection(body);
    if (record !== null) records.push(record);
  }
  return records;
}

/** A byte nobody can parse, or one missing the fields this module reads, is read as absent, never as a crash. */
function parseStoredCorrection(body: string): StoredCorrection | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Partial<StoredCorrection>;
    if (
      typeof record.spot_id !== 'string' ||
      record.bias?.swell_h_m?.per_source === undefined ||
      record.clamp === undefined
    ) {
      return null;
    }
    return record as StoredCorrection;
  } catch {
    return null;
  }
}
