// The monthly, system-level correction judgement. It receives only the
// anonymous residual and correction-key surfaces needed to compare raw and
// corrected height forecasts; no report identifiers or operator-facing data
// cross this boundary.

export type CrossValidationVerdict = 'corrections-killed' | 'corrections-stay';

export const MONTHLY_ROLLING_ORIGIN_BLOCKS = {
  kind: 'rolling_origin_blocked',
  train_weeks: [1, 8],
  test_weeks: [9, 10],
} as const;

export type HeldOutResidual = {
  key: string;
  observed_on: string;
  raw_residual: number;
};

/**
 * The sole legal split is rolling-origin blocked time: the latest 14 calendar
 * days are held out and every earlier row is training-only. A key loses when
 * its corrected block error is strictly worse than its exact raw
 * counterfactual.
 */
export function judgeRollingOriginCorrections(input: {
  corrections: ReadonlyMap<string, number>;
  samples: readonly HeldOutResidual[];
}): CrossValidationVerdict {
  const heldOutStart = forwardHoldoutStart(input.samples);
  if (heldOutStart === undefined) return 'corrections-stay';

  let losingKeys = 0;
  let winningKeys = 0;
  for (const [key, correction] of input.corrections) {
    const training = input.samples.filter((sample) => sample.key === key && sample.observed_on < heldOutStart);
    const heldOut = input.samples.filter((sample) => sample.key === key && sample.observed_on >= heldOutStart);
    if (training.length === 0 || heldOut.length === 0) continue;
    const rawBlockError = Math.abs(mean(heldOut.map((sample) => sample.raw_residual)));
    const correctedBlockError = Math.abs(mean(heldOut.map((sample) => sample.raw_residual - correction)));
    if (correctedBlockError > rawBlockError) losingKeys += 1;
    if (correctedBlockError < rawBlockError) winningKeys += 1;
  }
  return losingKeys > winningKeys ? 'corrections-killed' : 'corrections-stay';
}

function forwardHoldoutStart(samples: readonly HeldOutResidual[]): string | undefined {
  const latest = samples.map((sample) => sample.observed_on).filter(isIsoDay).sort().at(-1);
  if (latest === undefined) return undefined;
  const start = new Date(`${latest}T00:00:00Z`);
  const heldOutDays = (MONTHLY_ROLLING_ORIGIN_BLOCKS.test_weeks[1] - MONTHLY_ROLLING_ORIGIN_BLOCKS.test_weeks[0] + 1) * 7;
  start.setUTCDate(start.getUTCDate() - (heldOutDays - 1));
  return start.toISOString().slice(0, 10);
}

function isIsoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
