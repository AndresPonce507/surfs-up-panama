// Composition and observation for the APPLY side of this feature: the shipped
// builder consuming a stored correction through its already-shipped seam
// (slice-02), and the end-to-end fixture proof that the published number
// finally moves once the gates admit the evidence (slice-07).
//
// Pillar 3, app as in production: every publish here is the real shipped
// runBuildOnce over the same in-memory port fakes the keystone uses. The
// correction records below are hand-built test inputs in the exact
// spot-correction/1 shape (domain-model.md section 11); they stand in for the
// nightly fit's output so the apply fences can be watched independently of
// the fit, and slice-07's scenarios use the fit's real output instead.
//
// Sign conventions, pinned here because a silent disagreement is a 100x or a
// sign bug on every public number: residual and bias are forecast minus
// observed (06 section 4), the apply rule is corrected = raw - b, so a
// negative height b RAISES the published height; the score delta applied to
// the 0-1 score is MINUS b_score / 100 (06 section 4: delta_s = -b_score;
// 05 section 5's delta_q line omits that minus and is flagged stale in
// distill/red-classification.md — 06 section 4 is the sign SSOT).

import assert from 'node:assert/strict';

import { runBuildOnce } from '../../../../../src/pipeline/build';
import { venaoSeed } from '../../../daily-call-with-permanent-receipts/steps/support/fixtures';
import { SPOT_ID } from './synthetic-mornings';
import {
  BUILD_DATE,
  CORRECTIONS_PREFIX,
  CURRENT_CORRECTION_KEY,
  failureContext,
  learning,
  type StoredCorrection,
} from './learning-world';

/** src/learning/load-correction.ts — the reader the builder consumes (slice-02 seam). */
const LOAD_MODULE: string = '../../../../../src/learning/load-correction';

/** What reading a stored correction the way the builder reads it reports. */
export type CorrectionReadReport = {
  record: unknown | null;
  outcome: 'loaded' | 'absent' | 'rejected-as-absent';
  events: { type: string; detail?: string }[];
};

let readReport: CorrectionReadReport | null = null;

// ---------- hand-built spot-correction/1 records ----------

export const PASSING_HEIGHT_B = -0.18;
export const PASSING_SCORE_B = 9;

type KeyValues = { b: number; se: number; n: number; reporters: number; applied: boolean };

function record(
  height: KeyValues | null,
  score: (KeyValues & { units?: string }) | null,
): StoredCorrection {
  const base: StoredCorrection = {
    spot_id: SPOT_ID,
    schema: 'spot-correction/1',
    computed_at: `${BUILD_DATE}T09:10:00Z`,
    clamp: { max_abs_h_frac: 0.4, max_abs_score: 12 },
  };
  if (height !== null) {
    base.bias = { swell_h_m: { per_source: { ncep_gfswave016: { lead_24_48: height } } } };
  }
  if (score !== null) {
    const { units, ...values } = score;
    base.score_delta = { ...values, units: units ?? 'display_points' };
  }
  return base;
}

/** Passed every gate: 22 mornings, 7 people, height ran small, score ran generous. */
export function correctionThatPassedEveryGate(): StoredCorrection {
  return record(
    { b: PASSING_HEIGHT_B, se: 0.08, n: 22, reporters: 7, applied: true },
    { b: PASSING_SCORE_B, se: 3, n: 22, reporters: 7, applied: true },
  );
}

/** The gates refused it and it says so: too few mornings, too few people. */
export function correctionTheGatesRefused(n: number, reporters: number): StoredCorrection {
  return record(
    { b: -0.22, se: 0.09, n, reporters, applied: false },
    { b: 6, se: 4, n, reporters, applied: false },
  );
}

/** Hand-forged: claims applied on evidence the gates would never admit. */
export function forgedOnTooFewMornings(n: number, reporters: number): StoredCorrection {
  return record(
    { b: -0.22, se: 0.05, n, reporters, applied: true },
    { b: 9, se: 2, n, reporters, applied: true },
  );
}

/** Hand-forged: claims applied though the difference is buried in its own noise. */
export function forgedInsideItsOwnNoise(): StoredCorrection {
  return record(
    { b: -0.05, se: 0.09, n: 22, reporters: 7, applied: true },
    { b: 3, se: 4, n: 22, reporters: 7, applied: true },
  );
}

/** Passed the gates but orders a height move far past the 40% clamp. */
export function passingButOversizedHeightMove(): StoredCorrection {
  return record(
    { b: -2.0, se: 0.5, n: 22, reporters: 7, applied: true },
    null,
  );
}

/** Passed the gates but orders a score move far past the 12-point clamp. */
export function passingButOversizedScoreMove(): StoredCorrection {
  return record(
    null,
    { b: 30, se: 4, n: 22, reporters: 7, applied: true },
  );
}

/** Legal in every way except the unit its score move is stated in. */
export function correctionInForeignUnits(units: string): StoredCorrection {
  return record(
    null,
    { b: 9, se: 3, n: 22, reporters: 7, applied: true, units },
  );
}

export async function storeCorrection(body: StoredCorrection | string): Promise<void> {
  await learning.store.put(
    CURRENT_CORRECTION_KEY,
    typeof body === 'string' ? body : JSON.stringify(body),
  );
}

export function deleteEveryCorrection(): void {
  for (const key of [...learning.store.objects.keys()]) {
    if (key.startsWith(CORRECTIONS_PREFIX)) learning.store.objects.delete(key);
  }
}

// ---------- publishing at a fresh hour, so the archive keeps both builds ----------

let nextBuildHour = 12;

export function resetApplyWorld(): void {
  nextBuildHour = 12;
  readReport = null;
}

/**
 * Publish again at the NEXT hour. The archive's append-only log then carries
 * both the day-zero build and this one, so what was live in each is readable
 * side by side — the same reason production archives every build.
 */
export async function publishAtAFreshHour(): Promise<string> {
  const hour = String(nextBuildHour).padStart(2, '0');
  nextBuildHour += 1;
  learning.clock.set(`${BUILD_DATE}T${hour}:22:00Z`);
  const outcome = await runBuildOnce({
    store: learning.store,
    clock: learning.clock,
    spots: [venaoSeed],
    region_id: 'pa-pacific',
  });
  assert.ok(
    outcome.published,
    `the shipped builder refused to publish at ${hour}Z, so nothing can be said about what a surfer would read: ${'reason' in outcome ? outcome.reason : 'unknown'}`,
  );
  return hour;
}

// ---------- reading the archive ----------

export type ArchivedCall = {
  spot_id: string;
  valid_ts: string;
  score_q: number;
  h_eff_m: number;
  size_band: string;
  wind_state: string | null;
  bias_applied: number;
  bias_gate: string;
};

function archivedCallsAt(hour: string): ArchivedCall[] {
  const key = `log/calls/v1/dt=${BUILD_DATE}/build=${hour}Z/pa-pacific.jsonl.gz`;
  const body = learning.store.objects.get(key);
  assert.ok(
    body,
    `no archived calls exist for the ${hour}Z build; the archive is the audit trail this feature's honesty rides on.${failureContext()}`,
  );
  return body.split('\n').map((line) => JSON.parse(line) as ArchivedCall);
}

/** The ranked-hour call for the spot as one build archived it. */
export function archivedRankedCallAt(hour: string): ArchivedCall {
  const call = archivedCallsAt(hour).find(
    (row) => row.spot_id === SPOT_ID && row.valid_ts === `${BUILD_DATE}T18:00Z`,
  );
  assert.ok(
    call,
    `the ${hour}Z build archived no ranked call for ${SPOT_ID}, so what was live cannot be audited.${failureContext()}`,
  );
  return call;
}

export function baselineArchivedCall(): ArchivedCall {
  return archivedRankedCallAt('11');
}

export function newestArchivedCall(): ArchivedCall {
  const hour = String(nextBuildHour - 1).padStart(2, '0');
  assert.ok(nextBuildHour > 12, 'nothing was published after day zero, so there is no newer archive to read');
  return archivedRankedCallAt(hour);
}

/** Field-level identity of what a surfer reads, deliberately ignoring build identity. */
export function assertReadsExactlyWhatDayZeroPublished(newest: ArchivedCall): void {
  const baseline = baselineArchivedCall();
  for (const field of ['score_q', 'h_eff_m', 'size_band', 'wind_state'] as const) {
    assert.deepEqual(
      newest[field],
      baseline[field],
      `the ${field} a surfer reads moved from what day zero published, and nothing below the gates may move it.${failureContext()}`,
    );
  }
}

// ---------- reading a stored correction the way the builder reads it ----------

export async function readCorrectionAsTheBuilderDoes(label = 'correction read'): Promise<void> {
  try {
    const module = await import(LOAD_MODULE);
    readReport = await module.loadStoredCorrection({
      store: learning.store,
      key: CURRENT_CORRECTION_KEY,
    });
  } catch (error) {
    learning.failures.push({ label, error });
    readReport = null;
  }
}

export function requireReadReport(): CorrectionReadReport {
  assert.ok(
    readReport,
    `the stored correction was never read the way the builder reads it, so nothing can be said about how a reader treats it.${failureContext()}`,
  );
  return readReport;
}
