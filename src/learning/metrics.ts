// Operator-only monthly metrics. This projection records the surfaces later
// evaluation steps fill with judged values; it never changes a correction or
// feeds the public forecast.

import type { ObservationRow, PublishedCallRow } from './inputs';

export type MonthlyMetrics = {
  selection: { per_decile: { decile: number; calls: number; reported_days: number }[]; solicited_share: number };
  pairwise: { pairs: number; target_pairs: 400 };
  mae: { baselines: { climatology: null; persistence: null } };
  sigma_human: { co_observer_pairs: number };
  calibration: { offending_term: null };
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
    calibration: { offending_term: null },
    shrinkage: [],
    cv: { verdict: 'not_evaluated' },
  };
}

function dateOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}
