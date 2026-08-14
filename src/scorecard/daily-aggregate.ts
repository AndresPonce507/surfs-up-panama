import type { Residual } from './pairing';

export type DailyAggregate = {
  readonly spot_id: string;
  readonly source: string;
  readonly lead_bucket: string;
  readonly variable: Residual['variable'];
  readonly day: string;
  readonly n: number;
  readonly sum_err: number;
  readonly sum_abs_err: number;
  readonly sum_sq_err: number;
  readonly device_ids: readonly string[];
};

type AccumulatedDailyAggregate = {
  readonly spot_id: string;
  readonly source: string;
  readonly lead_bucket: string;
  readonly variable: Residual['variable'];
  readonly day: string;
  readonly n: number;
  readonly sum_err: number;
  readonly sum_abs_err: number;
  readonly sum_sq_err: number;
  readonly device_ids: readonly string[];
};

const dayOf = (pairedValidTimestamp: string): string => pairedValidTimestamp.slice(0, 10);

const aggregateKey = (residual: Residual, day: string): string =>
  [residual.spot_id, residual.source, residual.lead_bucket, residual.variable, day].join('|');

const aggregateSortKey = (aggregate: DailyAggregate): string =>
  [aggregate.spot_id, aggregate.source, aggregate.lead_bucket, aggregate.variable, aggregate.day].join('|');

const residualSortKey = (residual: Residual): string =>
  [
    residual.spot_id,
    residual.source,
    residual.lead_bucket,
    residual.variable,
    residual.paired_valid_ts,
    residual.device_id,
    residual.err.toString(),
  ].join('|');

const initialAggregate = (residual: Residual, day: string): AccumulatedDailyAggregate => ({
  spot_id: residual.spot_id,
  source: residual.source,
  lead_bucket: residual.lead_bucket,
  variable: residual.variable,
  day,
  n: 0,
  sum_err: 0,
  sum_abs_err: 0,
  sum_sq_err: 0,
  device_ids: [],
});

const addResidual = (aggregate: AccumulatedDailyAggregate, residual: Residual): AccumulatedDailyAggregate => ({
  ...aggregate,
  n: aggregate.n + 1,
  sum_err: aggregate.sum_err + residual.err,
  sum_abs_err: aggregate.sum_abs_err + Math.abs(residual.err),
  sum_sq_err: aggregate.sum_sq_err + residual.err ** 2,
  device_ids: aggregate.device_ids.includes(residual.device_id)
    ? aggregate.device_ids
    : [...aggregate.device_ids, residual.device_id],
});

const publicAggregate = (aggregate: AccumulatedDailyAggregate): DailyAggregate => ({
  spot_id: aggregate.spot_id,
  source: aggregate.source,
  lead_bucket: aggregate.lead_bucket,
  variable: aggregate.variable,
  day: aggregate.day,
  n: aggregate.n,
  sum_err: aggregate.sum_err,
  sum_abs_err: aggregate.sum_abs_err,
  sum_sq_err: aggregate.sum_sq_err,
  device_ids: [...aggregate.device_ids].sort(),
});

/** Adds each residual once to its immutable (spot, source, lead, variable, day) aggregate. */
export const aggregateDaily = (residuals: readonly Residual[]): readonly DailyAggregate[] => {
  const aggregates = [...residuals].sort((left, right) => residualSortKey(left).localeCompare(residualSortKey(right))).reduce((current, residual) => {
    const day = dayOf(residual.paired_valid_ts);
    const key = aggregateKey(residual, day);
    const next = new Map(current);
    next.set(key, addResidual(current.get(key) ?? initialAggregate(residual, day), residual));
    return next;
  }, new Map<string, AccumulatedDailyAggregate>());
  return [...aggregates.values()]
    .map(publicAggregate)
    .sort((left, right) => aggregateSortKey(left).localeCompare(aggregateSortKey(right)));
};
