// The monthly, system-level correction judgement (06-learning-layer.md
// section 7 row G7; adr-correction-gates-and-clamps decision 3). Deliberately
// system-level, not per-spot: at n ~= 10 a per-spot held-out split is noise
// and the gate would flap monthly (the ADR's own rejection of that
// alternative). Random k-fold is banned by the same ADR -- consecutive hours
// of one swell are near-duplicates, and a random split leaks across them --
// so the one legal split is rolling-origin blocked time: every sample in the
// system shares ONE held-out origin, computed from the latest residual-
// bearing day across the whole system, never per key.
//
// MAE, not block-bias magnitude (wave-decisions.md D-2026-08-12-1 pin 1). A
// signed mean can read as near-zero purely because a real error alternates
// sign; a raw model that is honestly off by 0.3 m every morning, half the
// time high and half the time low, would look perfect under
// `|mean(residual)|` and would then watch a correction that actually helps
// get blamed for making a "perfect" number worse. Mean ABSOLUTE error never
// makes that mistake: it charges every miss regardless of its sign, so a
// correction only wins credit for shrinking the typical miss, never for an
// accidental cancellation.
//
// `b`, the amount subtracted, is read from the record the nightly fit
// already stored (06 section 7's gate verdict, carried through untouched by
// src/learning/load-correction.ts). This module never re-fits anything --
// judging the fit that already shipped is the whole of its job.
//
// Pure function, in and out: no store, no clock. evaluate.ts, by way of
// metrics.ts, hands this module the residual samples it already read and the
// gated keys it already parsed.
//
// SCOPE, flagged: only height corrections are judged this slice. A
// score_delta correction has no analogous MAE metric defined anywhere in 06
// section 10 today, and no acceptance or design text names one; judging it
// would be speculative implementation ahead of a test that asks for it.

/** Read structurally by src/learning/declarations.ts (05-03): random or shuffled folds never ship. */
export const CV_SCHEME = {
  kind: 'rolling_origin_blocked',
  train_weeks: [1, 8],
  test_weeks: [9, 10],
} as const;

/** The three verdicts D-2026-08-12-1 admits. The apply lane treats the last two identically: only an affirmative kill kills. */
export type CvVerdict = 'corrections-killed' | 'corrections-stay' | 'not_evaluated';

/**
 * One height residual sample, dated and keyed the same way metrics.ts's own
 * per-key MAE is (spot_id source lead_bucket, space-joined -- see that
 * module's own collision-safety note). Not every sample here belongs to a
 * gated key: the held-out origin rolls off the WHOLE system's residual
 * history, gated or not, because the split is system-level by design.
 */
export type DatedResidualSample = {
  readonly key: string;
  readonly day: string;
  readonly residual: number;
};

/** CV_SCHEME's held-out block length in calendar days: (10 - 9 + 1) * 7 = 14. */
const HELD_OUT_DAYS = (CV_SCHEME.test_weeks[1] - CV_SCHEME.test_weeks[0] + 1) * 7;

/**
 * The one shared rolling origin: 14 calendar days back from the latest day
 * any sample in the system was observed on, so the held-out block is always
 * the freshest fortnight the system actually has, whatever month the job
 * runs in. `undefined` when there is nothing to roll from at all.
 */
export function heldOutBlockStart(samples: readonly DatedResidualSample[]): string | undefined {
  const latest = samples.map((sample) => sample.day).sort().at(-1);
  if (latest === undefined) return undefined;
  const start = new Date(`${latest}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (HELD_OUT_DAYS - 1));
  return start.toISOString().slice(0, 10);
}

/**
 * The judge. For every gated key with at least one training-period sample
 * and at least one held-out sample, compares corrected vs raw mean absolute
 * error on the held-out block alone (pin 1). A key with no training history
 * or no held-out data this month is left out of the count entirely, honestly
 * -- it was not evaluated, not spared. `not_evaluated` when nothing was
 * judged at all. Killed only when losers are a strict MAJORITY of the keys
 * actually judged; an exact tie spares (amended 05-02 criteria).
 */
export function judgeRollingOriginCorrections(input: {
  readonly gatedCorrections: ReadonlyMap<string, number>;
  readonly samples: readonly DatedResidualSample[];
}): CvVerdict {
  const start = heldOutBlockStart(input.samples);
  if (start === undefined || input.gatedCorrections.size === 0) return 'not_evaluated';

  let losingKeys = 0;
  let judgedKeys = 0;
  for (const [key, b] of input.gatedCorrections) {
    const forKey = input.samples.filter((sample) => sample.key === key);
    const training = forKey.filter((sample) => sample.day < start);
    const heldOut = forKey.filter((sample) => sample.day >= start);
    if (training.length === 0 || heldOut.length === 0) continue;

    judgedKeys += 1;
    const rawBlockError = meanAbsolute(heldOut.map((sample) => sample.residual));
    const correctedBlockError = meanAbsolute(heldOut.map((sample) => sample.residual - b));
    if (correctedBlockError > rawBlockError) losingKeys += 1;
  }

  if (judgedKeys === 0) return 'not_evaluated';
  return losingKeys * 2 > judgedKeys ? 'corrections-killed' : 'corrections-stay';
}

function meanAbsolute(values: readonly number[]): number {
  return values.reduce((total, value) => total + Math.abs(value), 0) / values.length;
}
