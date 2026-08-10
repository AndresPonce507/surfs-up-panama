// Composition and observation for this feature's acceptance suite.
//
// Deliberately NOT a cucumber World: `setWorldConstructor` is global and last
// registration wins, so registering one here would replace the keystone's
// PipelineWorld for the whole run. State lives in this module and is reset by a
// tag-scoped Before hook; the runner is serial (no `parallel` key in
// cucumber.mjs), so module state is safe.
//
// Pillar 3, app as in production: the builder half of every scenario is the
// real shipped composition, runIngestOnce and runBuildOnce over the same
// in-memory port fakes the keystone uses. The learning half is the nightly
// fit's own driving port. That port does not exist yet, which is the point:
// the act helper captures its absence and every Then turns that into a failure
// at its own behaviour oracle, with the captured reason attached. No oracle in
// this suite is satisfied by an empty store.
//
// The two seams below are the contract this DISTILL declares and DELIVER owes.
// They are loaded through a dynamic import with a non-literal specifier so a
// missing module can never crash the shared step registry at load time, which
// would take every other feature's suite down with it.

import { Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { runBuildOnce } from '../../../../../src/pipeline/build';
import { runIngestOnce } from '../../../../../src/pipeline/ingest';
import { venaoSeed } from '../../../daily-call-with-permanent-receipts/steps/support/fixtures';
import {
  FixedClock,
  FixtureSource,
  InMemoryStore,
} from '../../../daily-call-with-permanent-receipts/steps/support/fakes';
import {
  HISTORY_LEAD_BUCKET,
  HISTORY_SOURCE,
  SPOT_ID,
  observationKey,
  predictionKey,
  type Morning,
} from './synthetic-mornings';
import type { UniverseSnapshot } from './state-delta';

// ---------- the seams this slice declares (owed by DELIVER) ----------

/** src/learning/fit.ts — the nightly fit's driving port. */
const FIT_MODULE: string = '../../../../../src/learning/fit';
/** src/learning/declarations.ts — the source-universe examination. */
const DECLARATIONS_MODULE: string = '../../../../../src/learning/declarations';

/**
 * The outcome the fit reports. Every absence claim in this suite is observed
 * here rather than by looking at an empty store, so "nothing was written" is a
 * positive report from a surface that has to exist, never a vacuous truth.
 */
export type LearningFitOutcome = {
  completed: boolean;
  spots_examined: number;
  corrections_written: number;
  events: { type: string; detail?: string }[];
};

/** One gated key inside a correction, domain-model.md section 11. */
export type CorrectionKeyRecord = {
  b: number;
  se: number;
  n: number;
  reporters: number;
  applied: boolean;
  shrunk_from_global?: number;
};

/** schema spot-correction/1, domain-model.md section 11. */
export type StoredCorrection = {
  spot_id: string;
  schema: string;
  computed_at?: string;
  score_delta?: CorrectionKeyRecord & { units: string };
  bias?: { swell_h_m?: { per_source?: Record<string, Record<string, CorrectionKeyRecord>> } };
  clamp?: { max_abs_h_frac?: number; max_abs_score?: number };
  inputs?: { obs_export_through?: string; pred_log_through?: string };
};

/** What an examination of one source universe reports. */
export type LearningDeclarationsReport = {
  /** Every residual form the universe declares. Exactly two are legal today. */
  residual_forms: string[];
  /** Every single-sample noise floor the universe declares, by variable. */
  noise_floors: Record<string, { value: number; derived_from: string }>;
  /** Every place that can mark a correction applied. */
  applied_marking_sites: string[];
  violations: { rule: string; detail: string }[];
};

export const RULE_ONLY_THE_GATE_MAY_MARK_APPLIED = 'only-the-gate-may-mark-a-correction-applied';
export const RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR = 'a-wind-residual-must-bring-its-own-noise-floor';

// ---------- fixed instants and the shipped config ----------

export const BUILD_DATE = '2026-08-08';
const INGEST_INSTANT = `${BUILD_DATE}T11:02:14Z`;
const BUILD_INSTANT = `${BUILD_DATE}T11:22:00Z`;

/** 07 section 7.3, shipped values: every clause is inactive at launch. */
export const SHIPPED_TRUST_GATE = {
  min_credential_age_days: 0,
  min_prior_reports: 0,
  min_prior_spots: 2,
};

export const TRUST_GATE_KEY = 'data/config/trust-gate.json';
export const CORRECTIONS_PREFIX = 'learned/corrections/v1/';
export const CURRENT_CORRECTION_KEY = `${CORRECTIONS_PREFIX}current/${SPOT_ID}.json`;
export const PUBLISHED_PREFIX = 'pub/v1/';

// ---------- scenario state ----------

type LearningState = {
  store: InMemoryStore;
  clock: FixedClock;
  source: FixtureSource;
  mornings: Morning[];
  trustGate: Record<string, number>;
  fitOutcome: LearningFitOutcome | null;
  declarations: LearningDeclarationsReport | null;
  seedPublished: UniverseSnapshot;
  failures: { label: string; error: unknown }[];
};

function freshState(): LearningState {
  return {
    store: new InMemoryStore(),
    clock: new FixedClock(INGEST_INSTANT),
    source: new FixtureSource(),
    mornings: [],
    trustGate: { ...SHIPPED_TRUST_GATE },
    fitOutcome: null,
    declarations: null,
    seedPublished: new Map(),
    failures: [],
  };
}

export let learning: LearningState = freshState();

Before({ tags: '@feature-f-forecast-learns-from-the-beach' }, () => {
  learning = freshState();
});

export function failureContext(): string {
  if (learning.failures.length === 0) return '';
  const lines = learning.failures.map(
    (failure) => `${failure.label}: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
  );
  return ` (captured failures: ${lines.join(' | ')})`;
}

// ---------- acting through the shipped builder ----------

/** The morning call as it publishes with no correction anywhere: the baseline. */
export async function publishSeedMorning(): Promise<void> {
  learning.source.configureMorning(BUILD_DATE, '06', 0);
  learning.clock.set(INGEST_INSTANT);
  await runIngestOnce({
    source: learning.source,
    store: learning.store,
    clock: learning.clock,
    spots: [venaoSeed],
  });
  learning.clock.set(BUILD_INSTANT);
  await runBuildOnce({
    store: learning.store,
    clock: learning.clock,
    spots: [venaoSeed],
    region_id: 'pa-pacific',
  });
  learning.seedPublished = learning.store.snapshot(PUBLISHED_PREFIX);
  assert.ok(
    learning.seedPublished.size > 0,
    'the shipped builder published nothing at all for the baseline morning; this suite cannot measure whether a correction moved a number it never saw',
  );
}

/** Publish again and hand back what a surfer would read now. */
export async function republishMorning(): Promise<UniverseSnapshot> {
  learning.clock.set(BUILD_INSTANT);
  await runBuildOnce({
    store: learning.store,
    clock: learning.clock,
    spots: [venaoSeed],
    region_id: 'pa-pacific',
  });
  return learning.store.snapshot(PUBLISHED_PREFIX);
}

// ---------- acting through the nightly fit ----------

export async function writeLearningInputs(): Promise<void> {
  const observationsByDate = new Map<string, string[]>();
  const predictionsByRunDate = new Map<string, string[]>();

  for (const morning of learning.mornings) {
    const observedDate = morning.observation.observed_at.slice(0, 10);
    const runDate = morning.prediction.run_ts.slice(0, 10);
    observationsByDate.set(observedDate, [
      ...(observationsByDate.get(observedDate) ?? []),
      JSON.stringify(morning.observation),
    ]);
    predictionsByRunDate.set(runDate, [
      ...(predictionsByRunDate.get(runDate) ?? []),
      JSON.stringify(morning.prediction),
    ]);
  }

  for (const [date, lines] of observationsByDate) {
    await learning.store.put(observationKey(date), lines.join('\n'));
  }
  for (const [runDate, lines] of predictionsByRunDate) {
    await learning.store.put(predictionKey(runDate, HISTORY_SOURCE), lines.join('\n'));
  }
  await learning.store.put(TRUST_GATE_KEY, JSON.stringify(learning.trustGate));
}

/**
 * Drive the nightly fit. Module absence and invocation failure are captured
 * here, at the act boundary, and never inside an assertion: every Then reads
 * the reported outcome and fails at its own oracle with the reason attached.
 */
export async function runNightlyFit(label = 'nightly fit'): Promise<void> {
  await writeLearningInputs();
  try {
    const module = await import(FIT_MODULE);
    learning.fitOutcome = await module.runLearningFitOnce({
      store: learning.store,
      clock: learning.clock,
    });
  } catch (error) {
    learning.failures.push({ label, error });
    learning.fitOutcome = null;
  }
}

export async function examineLearningDeclarations(root: string, label = 'declarations examination'): Promise<void> {
  try {
    const module = await import(DECLARATIONS_MODULE);
    learning.declarations = await module.evaluateLearningDeclarations({ root });
  } catch (error) {
    learning.failures.push({ label, error });
    learning.declarations = null;
  }
}

// ---------- observing ----------

export function requireFitOutcome(): LearningFitOutcome {
  const outcome = learning.fitOutcome;
  assert.ok(
    outcome,
    `the nightly fit reported no outcome at all, so nothing can be said about what it wrote or refused.${failureContext()}`,
  );
  return outcome;
}

export function requireDeclarations(): LearningDeclarationsReport {
  const report = learning.declarations;
  assert.ok(
    report,
    `the learning declarations were never examined, so neither safety rule was checked.${failureContext()}`,
  );
  return report;
}

export async function storedCorrection(): Promise<StoredCorrection | null> {
  const body = await learning.store.get(CURRENT_CORRECTION_KEY);
  if (body === null) return null;
  return JSON.parse(body) as StoredCorrection;
}

export async function requireStoredCorrection(): Promise<StoredCorrection> {
  const record = await storedCorrection();
  assert.ok(
    record,
    `no correction was stored for ${SPOT_ID}: the fit never recorded what it examined or why it refused.${failureContext()}`,
  );
  return record;
}

export function heightKeyOf(record: StoredCorrection): CorrectionKeyRecord {
  const key = record.bias?.swell_h_m?.per_source?.[HISTORY_SOURCE]?.[HISTORY_LEAD_BUCKET];
  assert.ok(
    key,
    `the stored correction records no height difference for ${HISTORY_SOURCE} at ${HISTORY_LEAD_BUCKET}, so there is nothing to gate.${failureContext()}`,
  );
  return key;
}

/**
 * One nightly fit over a generated set of mornings in an isolated store, for
 * the property scenarios. The outcome requirement is asserted here, so a missing
 * fit surfaces as the property's counterexample rather than being swallowed;
 * only module absence is captured, and it is reported in the same message.
 */
export async function fitOver(
  mornings: Morning[],
  trustGate: Record<string, number> = SHIPPED_TRUST_GATE,
): Promise<{
  outcome: LearningFitOutcome;
  correction: StoredCorrection | null;
  storedUniverse: UniverseSnapshot;
}> {
  learning.store = new InMemoryStore();
  learning.mornings = mornings;
  learning.trustGate = { ...trustGate };
  learning.fitOutcome = null;
  await runNightlyFit('nightly fit over a generated set of mornings');
  const outcome = requireFitOutcome();
  return {
    outcome,
    correction: await storedCorrection(),
    storedUniverse: learning.store.snapshot(CORRECTIONS_PREFIX),
  };
}

export function scoreDeltaOf(record: StoredCorrection): CorrectionKeyRecord & { units: string } {
  const delta = record.score_delta;
  assert.ok(
    delta,
    `the stored correction records no score delta, so the second declared residual form produced nothing.${failureContext()}`,
  );
  return delta;
}
