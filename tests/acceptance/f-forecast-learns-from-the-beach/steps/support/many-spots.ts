// Fixture builders and isolated fit/evaluation runners for the slices that
// need more world than one spot's mornings: the pooling hierarchy (slice-03),
// the robustness / selection / per-reporter weights (slice-04), and the
// monthly evaluation (slice-05).
//
// Every morning here is invented. Nothing in this module is allowed to claim
// the forecast learned anything; these fixtures exist to drive declared laws
// over inputs whose true answer is known by construction, exactly like
// synthetic-mornings.ts, which they reuse rather than re-derive.

import assert from 'node:assert/strict';

import { InMemoryStore } from '../../../daily-call-with-permanent-receipts/steps/support/fakes';
import { sizeBands, type SizeBandToken } from '../../../../../src/data/size-bands';
import { TOP_BAND_NOMINAL_M, TOP_BAND_VARIANCE_M2 } from '../../../../../src/learning/constants';
import {
  addDays,
  bandMidM,
  observationKey,
  predictionKey,
  syntheticMornings,
  HISTORY_SOURCE,
  SIGMA_EFF_HEIGHT_M,
  SPOT_ID,
  type Morning,
  type MorningsSpec,
} from './synthetic-mornings';
import {
  CORRECTIONS_PREFIX,
  SHIPPED_TRUST_GATE,
  TRUST_GATE_KEY,
  failureContext,
  heightKeyOf,
  learning,
  type CorrectionKeyRecord,
  type StoredCorrection,
} from './learning-world';
import type { UniverseSnapshot } from './state-delta';

/** src/learning/fit.ts — the same driving port learning-world drives. */
const FIT_MODULE: string = '../../../../../src/learning/fit';
/** src/learning/evaluate.ts — the monthly evaluation's driving port (slice-05 seam). */
const MONTHLY_MODULE: string = '../../../../../src/learning/evaluate';

export const OVERRIDES_KEY = 'learned/overrides/v1/reporter-weights.json';
export const METRICS_PREFIX = 'learned/metrics/v1/';

// ---------- spots and their mornings ----------

/** The seed fields the hierarchy keys on: all data, nothing Panama-shaped. */
export type LearningSpotSeed = {
  spot_id: string;
  region_id: string;
  coast: string;
  break_type: string;
};

export type SpotMornings = { seed: LearningSpotSeed; mornings: Morning[] };

export function pacificBeach(spotId: string): LearningSpotSeed {
  return { spot_id: spotId, region_id: 'pa-pacific', coast: 'pacific', break_type: 'beach' };
}

export function pacificReef(spotId: string): LearningSpotSeed {
  return { spot_id: spotId, region_id: 'pa-pacific', coast: 'pacific', break_type: 'reef' };
}

export function caribbeanBeach(spotId: string): LearningSpotSeed {
  return { spot_id: spotId, region_id: 'pa-caribbean', coast: 'caribbean', break_type: 'beach' };
}

/**
 * Synthetic mornings re-keyed onto another spot. Report ids and device ids
 * get the spot's tag so two spots' mornings can never collide or share a
 * reporter by accident; `keepDeviceIds` deliberately shares reporters across
 * spots, which is how a cross-spot habit becomes identifiable (slice-04).
 */
export function morningsAt(
  seed: LearningSpotSeed,
  tag: string,
  spec: MorningsSpec,
  opts: { keepDeviceIds?: boolean } = {},
): SpotMornings {
  const mornings = syntheticMornings(spec).map((morning, index) => ({
    observation: {
      ...morning.observation,
      spot_id: seed.spot_id,
      report_id: `01J4QZK8Y3E9RWM2P7T6${tag.toUpperCase().padEnd(2, 'Z').slice(0, 2)}${String(index).padStart(4, '0')}`,
      device_id: opts.keepDeviceIds === true
        ? morning.observation.device_id
        : morning.observation.device_id.replace('d_learn_', `d_${tag}_`),
    },
    prediction: { ...morning.prediction, spot_id: seed.spot_id },
  }));
  return { seed, mornings };
}

export function mapMornings(
  spot: SpotMornings,
  fn: (morning: Morning, index: number) => Morning,
): SpotMornings {
  return { seed: spot.seed, mornings: spot.mornings.map((morning, index) => fn(morning, index)) };
}

export function bandWidthM(band: SizeBandToken): number {
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined || !Number.isFinite(row.hi_m)) {
    throw new Error(`test bug: no finite width for band ${band}`);
  }
  return row.hi_m - row.lo_m;
}

/** 06 section 5.1: the open top band enters at its nominal variance, every other at width^2/12. */
export function perSampleVarianceM2(band: SizeBandToken): number {
  if (band === 'double_overhead_plus') return TOP_BAND_VARIANCE_M2;
  const width = bandWidthM(band);
  return (width * width) / 12;
}

/** 06 section 6.1, the declared precision weight, computed from the one constants home. */
export function precisionWeight(band: SizeBandToken): number {
  return 1 / (SIGMA_EFF_HEIGHT_M * SIGMA_EFF_HEIGHT_M + perSampleVarianceM2(band));
}

/** The metre value a reported band contributes: interval midpoint, or the open band's nominal. */
export function bandValueM(band: SizeBandToken): number {
  return band === 'double_overhead_plus' ? TOP_BAND_NOMINAL_M : bandMidM(band);
}

/** Clone one device's every report N times inside the same session. */
export function withSessionRepeats(spot: SpotMornings, deviceId: string, times: number): SpotMornings {
  const mornings = spot.mornings.flatMap((morning) => {
    if (morning.observation.device_id !== deviceId) return [morning];
    return Array.from({ length: times }, (_unused, repeat) => ({
      observation: {
        ...morning.observation,
        report_id: `${morning.observation.report_id.slice(0, -2)}R${repeat}`,
        observed_at: morning.observation.observed_at.replace('T18:41', `T18:${41 + repeat}`),
      },
      prediction: morning.prediction,
    }));
  });
  return { seed: spot.seed, mornings };
}

/**
 * One extra morning on an already-reported day: `band` moves only what the
 * person said they saw (the fixture anchors the forecast to the reference
 * band), so an absurd band is an absurd claim against the same forecast.
 */
export function extraSameDayReport(
  spot: SpotMornings,
  dayIndex: number,
  deviceId: string,
  band: SizeBandToken,
  trigger: 'organic' | 'push_solicited' = 'organic',
): Morning {
  const template = spot.mornings[dayIndex];
  assert.ok(template, `test bug: no morning at day index ${dayIndex}`);
  return {
    observation: {
      ...template.observation,
      report_id: `${template.observation.report_id.slice(0, -3)}X${String(dayIndex).padStart(2, '0')}`,
      device_id: deviceId,
      size_band: band,
      trigger,
    },
    prediction: template.prediction,
  };
}

// ---------- published-calls history, the propensity denominator ----------

export type CallHistoryDay = { date: string; score_q: number };

/**
 * Scenario-scoped fixture state shared by more than one steps module (the
 * published-calls history is given once and consumed by both the weights and
 * the monthly-evaluation steps). Reset by the weights module's Before hook.
 */
export const shared: { calls: CallHistoryDay[] } = { calls: [] };

export function callsHistory(days: CallHistoryDay[]): [string, string][] {
  return days.map((day) => [
    `log/calls/v1/dt=${day.date}/build=11Z/pa-pacific.jsonl.gz`,
    JSON.stringify({
      spot_id: SPOT_ID,
      build_id: `b_${day.date}T11Z`,
      valid_ts: `${day.date}T18:00Z`,
      score_q: day.score_q,
    }),
  ]);
}

export function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => addDays(start, index));
}

// ---------- isolated runs through the two driving ports ----------

export type IsolatedRunConfig = {
  spots: SpotMornings[];
  calls?: [string, string][];
  /** Flat map reporter_key -> weight; absent file means every weight is 1. */
  overrides?: Record<string, number> | null;
  correction?: { key: string; body: string }[];
  trustGate?: Record<string, number>;
  label?: string;
};

export type IsolatedRunResult = {
  corrections: UniverseSnapshot;
  metrics: UniverseSnapshot;
  store: InMemoryStore;
  fitOutcome: unknown | null;
  monthlyOutcome: unknown | null;
};

async function writeInputs(store: InMemoryStore, config: IsolatedRunConfig): Promise<void> {
  const observationsByDate = new Map<string, string[]>();
  const predictionsByRunDate = new Map<string, Set<string>>();
  for (const spot of config.spots) {
    for (const morning of spot.mornings) {
      const observedDate = morning.observation.observed_at.slice(0, 10);
      const runDate = morning.prediction.run_ts.slice(0, 10);
      observationsByDate.set(observedDate, [
        ...(observationsByDate.get(observedDate) ?? []),
        JSON.stringify(morning.observation),
      ]);
      // Several same-day reports share ONE prediction row; the log stores the
      // row once, so the fixture must too, or pairing would double-count it.
      const rows = predictionsByRunDate.get(runDate) ?? new Set<string>();
      rows.add(JSON.stringify(morning.prediction));
      predictionsByRunDate.set(runDate, rows);
    }
  }
  for (const [date, lines] of observationsByDate) {
    await store.put(observationKey(date), lines.join('\n'));
  }
  for (const [runDate, rows] of predictionsByRunDate) {
    await store.put(predictionKey(runDate, HISTORY_SOURCE), [...rows].join('\n'));
  }
  await store.put(TRUST_GATE_KEY, JSON.stringify(config.trustGate ?? SHIPPED_TRUST_GATE));
  for (const [key, body] of config.calls ?? []) {
    await store.put(key, body);
  }
  if (config.overrides != null) {
    await store.put(OVERRIDES_KEY, JSON.stringify(config.overrides));
  }
  for (const { key, body } of config.correction ?? []) {
    await store.put(key, body);
  }
}

/** One nightly fit over an isolated store, across any number of spots. */
export async function fitAcrossSpots(config: IsolatedRunConfig): Promise<IsolatedRunResult> {
  const store = new InMemoryStore();
  await writeInputs(store, config);
  let fitOutcome: unknown | null = null;
  try {
    const module = await import(FIT_MODULE);
    fitOutcome = await module.runLearningFitOnce({
      store,
      clock: learning.clock,
      spots: config.spots.map((spot) => spot.seed),
    });
  } catch (error) {
    learning.failures.push({ label: config.label ?? 'nightly fit across spots', error });
  }
  return {
    corrections: store.snapshot(CORRECTIONS_PREFIX),
    metrics: store.snapshot(METRICS_PREFIX),
    store,
    fitOutcome,
    monthlyOutcome: null,
  };
}

/** One monthly evaluation over an isolated store (slice-05 seam). */
export async function evaluateMonth(config: IsolatedRunConfig): Promise<IsolatedRunResult> {
  const store = new InMemoryStore();
  await writeInputs(store, config);
  let monthlyOutcome: unknown | null = null;
  try {
    const module = await import(MONTHLY_MODULE);
    monthlyOutcome = await module.runMonthlyEvaluationOnce({
      store,
      clock: learning.clock,
      spots: config.spots.map((spot) => spot.seed),
    });
  } catch (error) {
    learning.failures.push({ label: config.label ?? 'monthly evaluation', error });
  }
  return {
    corrections: store.snapshot(CORRECTIONS_PREFIX),
    metrics: store.snapshot(METRICS_PREFIX),
    store,
    fitOutcome: null,
    monthlyOutcome,
  };
}

/** The monthly evaluation driven against the shared scenario store, not an isolated one. */
export async function evaluateMonthInPlace(label = 'monthly evaluation'): Promise<unknown | null> {
  try {
    const module = await import(MONTHLY_MODULE);
    return await module.runMonthlyEvaluationOnce({
      store: learning.store,
      clock: learning.clock,
    });
  } catch (error) {
    learning.failures.push({ label, error });
    return null;
  }
}

// ---------- reading what a run stored ----------

export function correctionIn(universe: UniverseSnapshot, spotId: string): StoredCorrection | null {
  const body = universe.get(`${CORRECTIONS_PREFIX}current/${spotId}.json`);
  if (body === undefined) return null;
  return JSON.parse(body) as StoredCorrection;
}

export function requireCorrectionIn(universe: UniverseSnapshot, spotId: string): StoredCorrection {
  const record = correctionIn(universe, spotId);
  assert.ok(
    record,
    `no correction was stored for ${spotId}: the fit never recorded what it examined there or why it refused.${failureContext()}`,
  );
  return record;
}

export function requireHeightKeyIn(universe: UniverseSnapshot, spotId: string): CorrectionKeyRecord {
  return heightKeyOf(requireCorrectionIn(universe, spotId));
}

export function requireMetricsIn(result: IsolatedRunResult): Record<string, unknown> {
  const key = [...result.metrics.keys()].sort()[0];
  assert.ok(
    key,
    `the monthly evaluation stored no metrics file at all, so nothing the design says must be watched is being watched.${failureContext()}`,
  );
  const body = result.metrics.get(key);
  assert.ok(body, `the metrics file at ${key} is empty.${failureContext()}`);
  return JSON.parse(body) as Record<string, unknown>;
}
