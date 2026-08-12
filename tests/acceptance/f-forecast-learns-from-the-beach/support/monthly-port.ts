// Shared slice-05 harness. JIT-DISTILLED 2026-08-12 under wave-decisions.md
// D-2026-08-12-1/2.
//
// THE ONE JOB: reach the monthly evaluation's driving port by DYNAMIC import,
// so that on today's tree -- where src/learning/evaluate.ts does not exist --
// every slice-05 scenario fails at an ASSERTION that says so in business
// terms, never as a compile or collection error. This is the recover branch's
// many-spots.ts harness idea (the module path held as a plain string), kept
// because it is what lets a not-yet-scaffolded seam be RED instead of BROKEN.
//
// Also home to the two oracles every file that runs the port shares:
// - assertWritesConfinedToMetrics: D-2026-08-12-1's ruling made observable.
//   The monthly job may write ONLY under learned/metrics/v1/; any byte
//   created, changed or deleted anywhere else violates the ruling.
// - metricAt: a path walk that names the missing section when a hazard the
//   design says must be watched is not in the file (06 section 10).

import assert from "node:assert/strict";

/** src/learning/evaluate.ts, held as a plain string so nothing binds to it at compile time. */
const MONTHLY_MODULE: string = "../../../../src/learning/evaluate";

export const METRICS_PREFIX = "learned/metrics/v1/";

/**
 * The three verdicts D-2026-08-12-1 admits. The apply lane treats the last
 * two identically: only an affirmative kill kills.
 */
export const VERDICT_VOCABULARY = [
  "corrections-killed",
  "corrections-stay",
  "not_evaluated",
] as const;

export type MonthlyStore = {
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
};

export type MonthlyOutcome = {
  completed: boolean;
  verdict: string;
  metrics_key: string;
  events: readonly unknown[];
};

/**
 * Drive one monthly evaluation through its own port. A missing module, a
 * missing export and a bare-void return each fail at their own assertion,
 * in that order, so today's RED names exactly what is absent.
 */
export async function driveMonthlyEvaluationOnce(deps: {
  store: MonthlyStore;
  clock: { now(): Date };
}): Promise<MonthlyOutcome> {
  let loaded: Record<string, unknown> | null = null;
  try {
    loaded = (await import(MONTHLY_MODULE)) as Record<string, unknown>;
  } catch {
    loaded = null;
  }
  assert.ok(
    loaded !== null,
    "the monthly evaluation port does not exist yet: nothing at src/learning/evaluate.ts answers when the monthly conscience is asked to run (accepted roadmap 05-01)",
  );
  const port = loaded["runMonthlyEvaluationOnce"];
  assert.equal(
    typeof port,
    "function",
    "the monthly evaluation port does not exist yet: src/learning/evaluate.ts exports no runMonthlyEvaluationOnce (accepted roadmap 05-01)",
  );
  const outcome = (await (port as (input: unknown) => Promise<unknown>)(deps)) as
    | MonthlyOutcome
    | null
    | undefined;
  assert.ok(
    outcome !== null && outcome !== undefined,
    "the monthly evaluation returned a bare void: { completed, verdict, metrics_key, events } is the port's contract (accepted roadmap 05-01)",
  );
  return outcome;
}

/**
 * D-2026-08-12-1, as bytes: compare a full store snapshot from before the run
 * with one from after, refuse any deletion, rewrite or creation outside
 * learned/metrics/v1/, and hand back the new metrics keys (sorted) so the
 * caller can pin "exactly one file, for the clock's own month".
 */
export function assertWritesConfinedToMetrics(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  for (const [key, bytes] of before) {
    if (key.startsWith(METRICS_PREFIX)) continue;
    const now = after.get(key);
    assert.ok(
      now !== undefined,
      `the monthly evaluation DELETED ${key}: the job is metrics-only and may touch nothing outside ${METRICS_PREFIX} (D-2026-08-12-1)`,
    );
    assert.equal(
      now,
      bytes,
      `the monthly evaluation REWROTE ${key}: every byte outside ${METRICS_PREFIX} must stay exactly as it was -- the ruled-out mechanism rewrote stored corrections in place, and it must never come back (D-2026-08-12-1)`,
    );
  }
  const newMetricsKeys: string[] = [];
  for (const key of after.keys()) {
    if (before.has(key)) continue;
    assert.ok(
      key.startsWith(METRICS_PREFIX),
      `the monthly evaluation CREATED ${key}: a metrics-only job writes under ${METRICS_PREFIX} and nowhere else (D-2026-08-12-1)`,
    );
    newMetricsKeys.push(key);
  }
  return newMetricsKeys.sort();
}

/** Walk a dotted path into the parsed metrics file, naming the missing section on refusal. */
export function metricAt(metrics: Record<string, unknown>, path: string): unknown {
  let value: unknown = metrics;
  for (const part of path.split(".")) {
    assert.ok(
      typeof value === "object" &&
        value !== null &&
        part in (value as Record<string, unknown>),
      `the monthly file is missing "${path}" (stopped at "${part}"): every hazard the design names must be watched, not assumed away (06 section 10)`,
    );
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
