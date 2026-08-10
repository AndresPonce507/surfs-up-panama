import { pairResiduals, type PredictionSnapshot, type Residual, type ScorecardVariable, type SurfReport } from './pairing';

export type ProjectionInput = {
  readonly predictions: readonly PredictionSnapshot[];
  readonly reports: readonly SurfReport[];
  readonly variables?: readonly string[];
  readonly trustConfig: Record<string, unknown>;
  readonly resolveReporter: (deviceId: string) => string;
  readonly asOf: string;
};

export type ScorecardProjection = {
  readonly residuals: readonly Residual[];
  readonly daily: readonly unknown[];
  readonly keys: readonly unknown[];
  readonly blocks: Readonly<Record<string, unknown>>;
};

const allowedVariables: readonly ScorecardVariable[] = ['swell_h', 'score'];

const validateVariables = (variables: readonly string[] | undefined): void => {
  for (const variable of variables ?? allowedVariables) {
    if (variable === 'wind') throw new Error('wind is not a scorecard variable and cannot form a residual');
    if (!allowedVariables.includes(variable as ScorecardVariable)) throw new Error(`unsupported scorecard variable: ${variable}`);
  }
};

/** The slice-02 driving port. Later steps fill daily, keys and blocks from these residuals. */
export const projectScorecard = (input: ProjectionInput): ScorecardProjection => {
  validateVariables(input.variables);
  const selected = new Set<ScorecardVariable>((input.variables ?? allowedVariables) as readonly ScorecardVariable[]);
  return {
    residuals: pairResiduals(input).filter((residual) => selected.has(residual.variable)),
    daily: [],
    keys: [],
    blocks: {},
  };
};
