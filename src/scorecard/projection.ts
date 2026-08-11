import { aggregateDaily, type DailyAggregate } from './daily-aggregate';
import { pairableReportCounts, pairResiduals, type PredictionSnapshot, type Residual, type ScorecardVariable, type SurfReport } from './pairing';
import { evaluateBiasClause } from './publish-gate';
import { decideScorecardBlock, type ScorecardBlock } from './scorecard-block';
import { eligibleReports, type TrustGateConfig } from './trust-eligibility';
import { deriveWindows, type WindowStat } from './windows';

export type ProjectionInput = {
  readonly predictions: readonly PredictionSnapshot[];
  readonly reports: readonly SurfReport[];
  readonly fromAccumulator?: ScorecardAccumulator | null;
  readonly variables?: readonly string[];
  readonly trustConfig: TrustGateConfig | null;
  readonly resolveReporter: (deviceId: string) => string;
  readonly asOf: string;
};

/** The immutable report-log prefix accumulated by the incremental fold. */
export type ScorecardAccumulator = {
  readonly reports: readonly SurfReport[];
};

export type ScorecardProjection = {
  readonly residuals: readonly Residual[];
  readonly daily: readonly DailyAggregate[];
  readonly keys: readonly WindowStat[];
  readonly blocks: Readonly<Record<string, ScorecardBlock>>;
};

const allowedVariables: readonly ScorecardVariable[] = ['swell_h', 'score'];

const validateVariables = (variables: readonly string[] | undefined): void => {
  for (const variable of variables ?? allowedVariables) {
    if (variable === 'wind') throw new Error('wind is not a scorecard variable and cannot form a residual');
    if (!allowedVariables.includes(variable as ScorecardVariable)) throw new Error(`unsupported scorecard variable: ${variable}`);
  }
};

const blocksFrom = (
  keys: readonly WindowStat[],
  displayObservationsBySpot: ReadonlyMap<string, number>,
): Readonly<Record<string, ScorecardBlock>> => {
  const bySpot = keys
    .filter((stat) => stat.window === '30d')
    .reduce((spots, stat) => (spots.has(stat.spot_id) ? spots : new Map(spots).set(stat.spot_id, stat)), new Map<string, WindowStat>());
  const spotIds = new Set([...bySpot.keys(), ...displayObservationsBySpot.keys()]);
  return Object.fromEntries(
    [...spotIds].map((spotId) => {
      const stat = bySpot.get(spotId);
      return [
        spotId,
        decideScorecardBlock({
          pairedObservations: stat?.n ?? 0,
          displayObservations: displayObservationsBySpot.get(spotId) ?? 0,
          distinctTrustEligibleReporters: stat?.distinct_reporters ?? 0,
          biasClause: stat === undefined ? 'unavailable' : evaluateBiasClause(stat.bias, stat.se_gate),
        }),
      ];
    }),
  );
};

/** The slice-02 driving port. Later steps fill daily, keys and blocks from these residuals. */
export const projectScorecard = (input: ProjectionInput): ScorecardProjection => {
  validateVariables(input.variables);
  const selected = new Set<ScorecardVariable>((input.variables ?? allowedVariables) as readonly ScorecardVariable[]);
  const reports = input.fromAccumulator?.reports ?? input.reports;
  const residuals = pairResiduals({ predictions: input.predictions, reports }).filter((residual) => selected.has(residual.variable));
  const displayObservationsBySpot = pairableReportCounts({ predictions: input.predictions, reports });
  const gatedReports = eligibleReports(reports, input.trustConfig, input.resolveReporter);
  const gatedResiduals = pairResiduals({ predictions: input.predictions, reports: gatedReports }).filter((residual) =>
    selected.has(residual.variable),
  );
  const daily = aggregateDaily(gatedResiduals);
  const keys = deriveWindows(daily, input.asOf, input.resolveReporter);
  return {
    residuals,
    daily,
    keys,
    blocks: blocksFrom(keys, displayObservationsBySpot),
  };
};

/** Appends one immutable report-log item for the eventual single-writer updater. */
export const applyReport = (
  accumulator: ScorecardAccumulator | null,
  report: SurfReport,
  _input: ProjectionInput,
): ScorecardAccumulator => ({ reports: [...(accumulator?.reports ?? []), report] });
