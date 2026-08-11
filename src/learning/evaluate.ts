// The monthly evaluation driving port. Slice 05 begins by writing the
// operator's metrics projection; later steps add the held-out judgment and
// correction kill switch through this same port.

import type { Clock } from '../pipeline/ports';
import { readCallHistory, readObservationLog, type LearningInputStore } from './inputs';
import { buildMonthlyMetrics } from './metrics';

export const METRICS_PREFIX = 'learned/metrics/v1/';

export interface MonthlyEvaluationStore extends LearningInputStore {
  put(key: string, body: string): Promise<void>;
}

export type MonthlyEvaluationOutcome = {
  completed: boolean;
  verdict: 'not_evaluated';
  metrics_key: string;
  events: { type: 'metrics_written'; detail: string }[];
};

export async function runMonthlyEvaluationOnce(deps: {
  store: MonthlyEvaluationStore;
  clock: Clock;
  spots?: readonly unknown[];
}): Promise<MonthlyEvaluationOutcome> {
  const observations = await readObservationLog(deps.store);
  const calls = await readCallHistory(deps.store);
  const metrics = buildMonthlyMetrics({ observations, calls });
  const metricsKey = monthlyMetricsKey(deps.clock.now());
  await deps.store.put(metricsKey, JSON.stringify(metrics));
  return {
    completed: true,
    verdict: metrics.cv.verdict,
    metrics_key: metricsKey,
    events: [{ type: 'metrics_written', detail: metricsKey }],
  };
}

function monthlyMetricsKey(instant: Date): string {
  return `${METRICS_PREFIX}dt=${instant.toISOString().slice(0, 7)}/metrics.json`;
}
