// The monthly evaluation driving port. Slice 05 begins by writing the
// operator's metrics projection; later steps add the held-out judgment and
// correction kill switch through this same port.

import type { Clock } from '../pipeline/ports';
import { readCallHistory, readObservationLog, readPredictionLog, type LearningInputStore, type ObservationRow, type PredictionRow } from './inputs';
import { CORRECTIONS_PREFIX, serializeCorrection, type GatedKey, type StoredCorrection } from './correction-file';
import { judgeRollingOriginCorrections, type CrossValidationVerdict, type HeldOutResidual } from './cross-validation';
import { buildMonthlyMetrics } from './metrics';
import { formHeightResidualRows } from './residuals';

export const METRICS_PREFIX = 'learned/metrics/v1/';

export interface MonthlyEvaluationStore extends LearningInputStore {
  put(key: string, body: string): Promise<void>;
}

export type MonthlyEvaluationOutcome = {
  completed: boolean;
  verdict: CrossValidationVerdict | 'not_evaluated';
  metrics_key: string;
  events: { type: 'metrics_written'; detail: string }[];
};

export async function runMonthlyEvaluationOnce(deps: {
  store: MonthlyEvaluationStore;
  clock: Clock;
  spots?: readonly unknown[];
}): Promise<MonthlyEvaluationOutcome> {
  const observations = await readObservationLog(deps.store);
  const predictions = await readPredictionLog(deps.store);
  const calls = await readCallHistory(deps.store);
  const currentCorrections = await readCurrentCorrections(deps.store);
  const metrics = buildMonthlyMetrics({ observations, calls, corrections: currentCorrections.map(({ record }) => record) });
  const verdict = judgeCurrentCorrections(currentCorrections, observations, predictions);
  if (verdict === 'corrections-killed') {
    await Promise.all(currentCorrections.map(({ key, record }) => deps.store.put(key, serializeCorrection(disableCorrection(record)))));
  }
  const metricsKey = monthlyMetricsKey(deps.clock.now());
  await deps.store.put(metricsKey, JSON.stringify({ ...metrics, cv: { verdict } }));
  return {
    completed: true,
    verdict,
    metrics_key: metricsKey,
    events: [{ type: 'metrics_written', detail: metricsKey }],
  };
}

type CurrentCorrection = { key: string; record: StoredCorrection };

async function readCurrentCorrections(store: MonthlyEvaluationStore): Promise<CurrentCorrection[]> {
  const keys = await store.list(`${CORRECTIONS_PREFIX}current/`);
  const records: CurrentCorrection[] = [];
  for (const key of keys) {
    const body = await store.get(key);
    if (body === null) continue;
    const record = parseStoredCorrection(body);
    if (record !== null) records.push({ key, record });
  }
  return records;
}

function judgeCurrentCorrections(
  corrections: readonly CurrentCorrection[],
  observations: readonly ObservationRow[],
  predictions: readonly PredictionRow[],
): CrossValidationVerdict | 'not_evaluated' {
  const heightCorrections = new Map<string, number>();
  for (const { record } of corrections) {
    for (const [source, byLead] of Object.entries(record.bias.swell_h_m.per_source)) {
      for (const [lead, gated] of Object.entries(byLead)) {
        if (gated.applied) heightCorrections.set(heightKey(record.spot_id, source, lead), gated.b);
      }
    }
  }
  if (heightCorrections.size === 0) return 'not_evaluated';
  return judgeRollingOriginCorrections({ corrections: heightCorrections, samples: heightResiduals(observations, predictions) });
}

function heightResiduals(observations: readonly ObservationRow[], predictions: readonly PredictionRow[]): HeldOutResidual[] {
  return observations.flatMap((observation) => {
    const observedOn = utcDay(observation.observed_at);
    if (observedOn === undefined) return [];
    return formHeightResidualRows([observation], predictions).map((row) => ({
      key: heightKey(row.spotId, row.source, row.leadBucket),
      observed_on: observedOn,
      raw_residual: row.sample.value,
    }));
  });
}

function disableCorrection(record: StoredCorrection): StoredCorrection {
  const perSource = Object.fromEntries(
    Object.entries(record.bias.swell_h_m.per_source).map(([source, byLead]) => [
      source,
      Object.fromEntries(Object.entries(byLead).map(([lead, gated]) => [lead, disabled(gated)])),
    ]),
  );
  return {
    ...record,
    ...(record.score_delta === undefined ? {} : { score_delta: { ...disabled(record.score_delta), units: record.score_delta.units } }),
    bias: { swell_h_m: { per_source: perSource } },
  };
}

function disabled(key: GatedKey): GatedKey {
  return { ...key, applied: false };
}

function parseStoredCorrection(body: string): StoredCorrection | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Partial<StoredCorrection>;
    if (typeof record.spot_id !== 'string' || record.bias?.swell_h_m?.per_source === undefined || record.clamp === undefined) return null;
    return record as StoredCorrection;
  } catch {
    return null;
  }
}

function heightKey(spotId: string, source: string, lead: string): string {
  return `${spotId}\u0000${source}\u0000${lead}`;
}

function utcDay(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return undefined;
  return instant.toISOString().slice(0, 10);
}

function monthlyMetricsKey(instant: Date): string {
  return `${METRICS_PREFIX}dt=${instant.toISOString().slice(0, 7)}/metrics.json`;
}
