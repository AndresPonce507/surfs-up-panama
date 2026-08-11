// Operator-only monthly metrics. This projection records the surfaces later
// evaluation steps fill with judged values; it never changes a correction or
// feeds the public forecast.

import type { ObservationRow, PublishedCallRow } from './inputs';

export type MonthlyMetrics = {
  selection: { per_decile: { decile: number; calls: number; reported_days: number }[]; solicited_share: number };
  pairwise: { pairs: number; target_pairs: 400 };
  mae: { baselines: { climatology: null; persistence: null } };
  sigma_human: { co_observer_pairs: number };
  calibration: {
    probability: 'score_q/100 (naive)';
    bins: Record<string, { reports: number; hits: number; hit_rate: number; brier: number }>;
    offending_term: 'c_spread' | null;
  };
  shrinkage: unknown[];
  cv: { verdict: 'not_evaluated' };
};

export function buildMonthlyMetrics(input: {
  observations: readonly ObservationRow[];
  calls: readonly PublishedCallRow[];
}): MonthlyMetrics {
  const reportedDays = new Set(
    input.observations.flatMap((observation) => {
      const date = dateOf(observation.observed_at);
      return date === undefined ? [] : [`${observation.spot_id}\u0000${date}`];
    }),
  );
  const byDecile = new Map<number, { calls: number; reported_days: number }>();
  for (const call of input.calls) {
    const date = dateOf(call.valid_ts);
    if (call.spot_id === undefined || date === undefined || typeof call.score_q !== 'number') continue;
    const decile = Math.min(9, Math.max(0, Math.floor(call.score_q / 10)));
    const row = byDecile.get(decile) ?? { calls: 0, reported_days: 0 };
    row.calls += 1;
    if (reportedDays.has(`${call.spot_id}\u0000${date}`)) row.reported_days += 1;
    byDecile.set(decile, row);
  }
  const solicited = input.observations.filter((observation) => observation.trigger === 'push_solicited').length;
  return {
    selection: {
      per_decile: [...byDecile].sort(([left], [right]) => left - right).map(([decile, values]) => ({ decile, ...values })),
      solicited_share: input.observations.length === 0 ? 0 : solicited / input.observations.length,
    },
    pairwise: { pairs: 0, target_pairs: 400 },
    mae: { baselines: { climatology: null, persistence: null } },
    sigma_human: { co_observer_pairs: 0 },
    calibration: calibrationOf(input.observations),
    shrinkage: [],
    cv: { verdict: 'not_evaluated' },
  };
}

/**
 * The v1 probability is intentionally naive: the captured score is divided by
 * 100, then checked against the Good/Epic event. This file routes a failed
 * confidence signal for removal; scoring owns the actual term removal.
 */
function calibrationOf(observations: readonly ObservationRow[]): MonthlyMetrics['calibration'] {
  const aggregates = new Map<string, { reports: number; hits: number; squaredError: number }>();
  for (const observation of observations) {
    const confidence = observation.predicted?.conf_level;
    const score = observation.predicted?.score_q;
    if (typeof confidence !== 'string' || confidence === '' || typeof score !== 'number' || !Number.isFinite(score)) continue;
    const probability = score / 100;
    const hit = observation.quality === 'good' || observation.quality === 'epic';
    const aggregate = aggregates.get(confidence) ?? { reports: 0, hits: 0, squaredError: 0 };
    aggregate.reports += 1;
    aggregate.hits += Number(hit);
    aggregate.squaredError += (probability - Number(hit)) ** 2;
    aggregates.set(confidence, aggregate);
  }
  const bins = Object.fromEntries(
    [...aggregates].sort(([left], [right]) => left.localeCompare(right)).map(([confidence, aggregate]) => [confidence, {
      reports: aggregate.reports,
      hits: aggregate.hits,
      hit_rate: aggregate.hits / aggregate.reports,
      brier: aggregate.squaredError / aggregate.reports,
    }]),
  );
  const high = bins['high'];
  const low = bins['low'];
  return {
    probability: 'score_q/100 (naive)',
    bins,
    offending_term: high !== undefined && low !== undefined && high.hit_rate < low.hit_rate ? 'c_spread' : null,
  };
}

function dateOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}
