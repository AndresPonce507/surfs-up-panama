import type { DailyAggregate } from './daily-aggregate';
import type { ScorecardVariable } from './pairing';

export type ScorecardWindow = '30d' | '90d';

export type WindowStat = {
  readonly spot_id: string;
  readonly source: string;
  readonly lead_bucket: string;
  readonly variable: ScorecardVariable;
  readonly window: ScorecardWindow;
  readonly n: number;
  readonly bias: number;
  readonly mae: number;
  readonly se_sample: number;
  readonly se_gate: number;
  readonly se: number;
  readonly distinct_reporters: number;
};

export const SIGMA_EFF_BY_VARIABLE: Readonly<Record<ScorecardVariable, number>> = {
  swell_h: 0.48,
  score: 25,
};

const WINDOW_DAYS: Readonly<Record<ScorecardWindow, number>> = {
  '30d': 30,
  '90d': 90,
};

const dayOf = (instant: string): string => instant.slice(0, 10);

const keyOf = (row: Pick<DailyAggregate, 'spot_id' | 'source' | 'lead_bucket' | 'variable'>): string =>
  [row.spot_id, row.source, row.lead_bucket, row.variable].join('|');

const windowStartDay = (asOf: string, days: number): string => {
  const instant = new Date(asOf);
  instant.setUTCDate(instant.getUTCDate() - days);
  return dayOf(instant.toISOString());
};

const includedDaily = (daily: DailyAggregate, asOfDay: string, startDay: string): boolean =>
  daily.day >= startDay && daily.day <= asOfDay;

const groupByKey = (daily: readonly DailyAggregate[]): ReadonlyMap<string, readonly DailyAggregate[]> =>
  daily.reduce((groups, row) => new Map(groups).set(keyOf(row), [...(groups.get(keyOf(row)) ?? []), row]), new Map<string, readonly DailyAggregate[]>());

const total = (daily: readonly DailyAggregate[], select: (row: DailyAggregate) => number): number =>
  daily.reduce((sum, row) => sum + select(row), 0);

const sampleError = (n: number, sumError: number, sumSquaredError: number): number => {
  if (n < 2) return 0;
  const centeredSumSquares = Math.max(0, sumSquaredError - (sumError ** 2) / n);
  return Math.sqrt(centeredSumSquares / (n - 1)) / Math.sqrt(n);
};

const distinctReporters = (daily: readonly DailyAggregate[], resolveReporter: (deviceId: string) => string): number =>
  new Set(daily.flatMap((row) => row.device_ids.map(resolveReporter))).size;

const statFor = (
  daily: readonly DailyAggregate[],
  window: ScorecardWindow,
  resolveReporter: (deviceId: string) => string,
): WindowStat => {
  const first = daily[0]!;
  const n = total(daily, (row) => row.n);
  const sumError = total(daily, (row) => row.sum_err);
  const sumAbsoluteError = total(daily, (row) => row.sum_abs_err);
  const sumSquaredError = total(daily, (row) => row.sum_sq_err);
  const seSample = sampleError(n, sumError, sumSquaredError);
  const floor = (0.5 * SIGMA_EFF_BY_VARIABLE[first.variable]) / Math.sqrt(n);
  const seGate = Math.max(seSample, floor);
  return {
    spot_id: first.spot_id,
    source: first.source,
    lead_bucket: first.lead_bucket,
    variable: first.variable,
    window,
    n,
    bias: sumError / n,
    mae: sumAbsoluteError / n,
    se_sample: seSample,
    se_gate: seGate,
    se: seGate,
    distinct_reporters: distinctReporters(daily, resolveReporter),
  };
};

const statsForWindow = (
  daily: readonly DailyAggregate[],
  asOf: string,
  window: ScorecardWindow,
  resolveReporter: (deviceId: string) => string,
): readonly WindowStat[] => {
  const asOfDay = dayOf(asOf);
  const startDay = windowStartDay(asOf, WINDOW_DAYS[window]);
  const selectedDaily = daily.filter((row) => includedDaily(row, asOfDay, startDay));
  return [...groupByKey(selectedDaily).values()]
    .map((rows) =>
      statFor(
        [...rows].sort((left, right) => right.day.localeCompare(left.day)).slice(0, WINDOW_DAYS[window]),
        window,
        resolveReporter,
      ),
    )
    .sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
};

/** Derives bounded 30- and 90-day statistics, exposing only the floored standard error. */
export const deriveWindows = (
  daily: readonly DailyAggregate[],
  asOf: string,
  resolveReporter: (deviceId: string) => string,
): readonly WindowStat[] =>
  (Object.keys(WINDOW_DAYS) as ScorecardWindow[]).flatMap((window) => statsForWindow(daily, asOf, window, resolveReporter));
