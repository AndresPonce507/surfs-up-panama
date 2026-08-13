// Operator-only monthly metrics, 06-learning-layer.md section 10. Every
// section here is a function of the rows the store actually holds -- never
// a literal placeholder.
//
// `shrinkage[].flagged` is 05-05's real judgment now (09 section 17.4
// guardrail 2): a spot with SHRINKAGE_ALARM_MIN_N observations still shrunk
// by SHRINKAGE_ALARM_MIN_WEIGHT or more toward its parent means a
// misconfiguration -- tau wildly off, or a parent eating its children. The
// evaluation reads shrink_weight straight off the stored record's own
// shrunk_from_global field (no refit) and the flag is an ALARM only
// (adr-pooling-hierarchy-activation decision 6): nothing anywhere reacts to
// it, automating a response would hand the pooling a knob to turn itself.
//
// `calibration.offending_term` is 05-04's real judgment now (06 section 10;
// 09 section 3.6 consequence 3): the calibration check compares the 'high'
// and 'low' confidence bins' hit rates and names 'c_spread' only on the
// affirmative inversion (high strictly less often right than low). Naming is
// routing, not removal -- the scoring lane owns C_spread's actual deletion.
//
// `cv.verdict` is 05-02's real judgment now (06 section 7 G7;
// src/learning/cross-validation.ts), not the deferred literal 05-01 shipped:
// rolling-origin blocked CV, mean absolute error rather than a signed mean
// that can cancel (wave-decisions.md D-2026-08-12-1 pin 1), killed only when
// losers are a strict majority of the gated keys actually judged.
//
// Pure function, in and out: no store, no clock, no ambient world. evaluate.ts
// is the one module that reads the store and hands this module what it read.

import {
  OPEN_ENDED_SIZE_BAND,
  sizeBands,
  type SizeBandToken,
} from '../data/size-bands';
import type { GatedKey, StoredCorrection } from './correction-file';
import { TOP_BAND_NOMINAL_M } from './constants';
import {
  judgeRollingOriginCorrections,
  type CvVerdict,
  type DatedResidualSample,
} from './cross-validation';
import { spotsReportedIn, type ObservationRow, type PredictionRow, type PublishedCallRow } from './inputs';
import { formHeightResidualRows, reporterKeyOf } from './residuals';

/** 09 section 10.2: the ~400 same-day pairs a positive pairwise lift needs to claim anything. */
export const PAIRWISE_TARGET_PAIRS = 400;

/** 06 section 6.2: a quality "step" is one rung of the Bad/OK/Good/Epic ladder. Ties under one step are excluded from the pairwise metric. */
const QUALITY_RANK: Readonly<Record<string, number>> = { bad: 0, ok: 1, good: 2, epic: 3 };

/** 06 section 10: sigma_human's co-observer window. */
const CO_OBSERVER_WINDOW_MS = 2 * 60 * 60 * 1000;

export type MonthlyMetrics = {
  selection: {
    per_decile: { decile: number; calls: number; reported_days: number }[];
    solicited_share: number;
  };
  pairwise: { pairs: number; target_pairs: 400 };
  mae: {
    per_key: { spot_id: string; source: string; lead_bucket: string; mae: number; n: number }[];
    baselines: { climatology: number | null; persistence: number | null };
  };
  sigma_human: { value: number | null; co_observer_pairs: number };
  calibration: {
    probability: 'score_q/100 (naive)';
    bins: { conf_level: string; reports: number; hits: number; hit_rate: number; brier: number }[];
    offending_term: 'c_spread' | null;
  };
  shrinkage: {
    spot_id: string;
    shrink_weight: number;
    n: number;
    reporters: number;
    flagged: boolean;
  }[];
  cv: { verdict: CvVerdict };
};

export function buildMonthlyMetrics(input: {
  observations: readonly ObservationRow[];
  predictions: readonly PredictionRow[];
  calls: readonly PublishedCallRow[];
  corrections: readonly StoredCorrection[];
}): MonthlyMetrics {
  return {
    selection: selectionOf(input.observations, input.calls),
    pairwise: { pairs: pairwiseCountOf(input.observations), target_pairs: PAIRWISE_TARGET_PAIRS },
    mae: maeOf(input.observations, input.predictions),
    sigma_human: sigmaHumanOf(input.observations),
    calibration: calibrationOf(input.observations),
    shrinkage: shrinkageOf(input.corrections),
    cv: cvOf(input.observations, input.predictions, input.corrections),
  };
}

// ---------- selection (hazard a's tripwire, 06 section 6.3 fix 3) ----------

function selectionOf(
  observations: readonly ObservationRow[],
  calls: readonly PublishedCallRow[],
): MonthlyMetrics['selection'] {
  const reportedDays = new Set<string>();
  for (const observation of observations) {
    const day = dateOf(observation.observed_at);
    if (day !== undefined) reportedDays.add(spotDayKey(observation.spot_id, day));
  }

  const byDecile = new Map<number, { calls: number; reported_days: number }>();
  for (const call of calls) {
    const day = dateOf(call.valid_ts);
    if (day === undefined || typeof call.score_q !== 'number' || !Number.isFinite(call.score_q)) continue;
    const decile = decileOf(call.score_q);
    const row = byDecile.get(decile) ?? { calls: 0, reported_days: 0 };
    row.calls += 1;
    if (reportedDays.has(spotDayKey(call.spot_id, day))) row.reported_days += 1;
    byDecile.set(decile, row);
  }

  const solicited = observations.filter((observation) => observation.trigger === 'push_solicited').length;
  return {
    per_decile: [...byDecile]
      .sort(([left], [right]) => left - right)
      .map(([decile, counts]) => ({ decile, ...counts })),
    solicited_share: observations.length === 0 ? 0 : solicited / observations.length,
  };
}

function decileOf(scoreQ: number): number {
  return Math.min(9, Math.max(0, Math.floor(scoreQ / 10)));
}

// ---------- pairwise (THE metric, 09 section 10.2) ----------

/**
 * Same reporter_key, same local day, 2+ spots rated: did our ranking order
 * the pair the way their quality labels did. This step counts the pairs that
 * QUALIFY for the comparison (ties under one quality step excluded); scoring
 * the ranking itself against `baseline_rank_raw`/`our_rank` is a later step's
 * job once a fixture exercises more than one spot.
 *
 * "Local day" is read as the UTC calendar day of `observed_at`: no timezone
 * carrier exists on the record today, so this is the honest reading of what
 * the log actually stores, not an invented offset.
 */
function pairwiseCountOf(observations: readonly ObservationRow[]): number {
  const ratedByReporterDay = new Map<string, { spot_id: string; qualityRank: number }[]>();
  for (const observation of observations) {
    const deviceId = observation.device_id;
    const quality = observation.quality;
    const day = dateOf(observation.observed_at);
    if (deviceId === undefined || quality === undefined || day === undefined) continue;
    const qualityRank = QUALITY_RANK[quality];
    if (qualityRank === undefined) continue;

    const groupKey = `${reporterKeyOf(observation, deviceId)} ${day}`;
    const rated = ratedByReporterDay.get(groupKey) ?? [];
    rated.push({ spot_id: observation.spot_id, qualityRank });
    ratedByReporterDay.set(groupKey, rated);
  }

  let pairs = 0;
  for (const rated of ratedByReporterDay.values()) {
    for (let left = 0; left < rated.length; left += 1) {
      for (let right = left + 1; right < rated.length; right += 1) {
        if (rated[left]!.spot_id === rated[right]!.spot_id) continue;
        if (rated[left]!.qualityRank === rated[right]!.qualityRank) continue; // tie under one quality step
        pairs += 1;
      }
    }
  }
  return pairs;
}

// ---------- mae (06 section 10: "never the headline", B0/B2 alongside) ----------

/**
 * `HeightResidualRow` carries `source` and `leadBucket` but not `spot_id` --
 * residuals.ts deliberately leaves the sample spot-blind, and the caller
 * states it. Keying on `source leadBucket` alone would average two spots'
 * errors into one number the moment they share a source and lead bucket,
 * exactly the mistake fit.ts avoids by filtering `observations` down to one
 * spot before it ever calls `formHeightResidualRows`. This loop does the
 * same, spot by spot, so a key here is always (spot, source, lead_bucket),
 * matching 06 section 2's consumer table join key of `(month, spot_id)`.
 *
 * The three parts join on a double colon, not a plain space: `spot_id` and
 * `source` both come off permissively-parsed log rows (src/learning/inputs.ts
 * rejects nothing), so either could legally contain a space, and a
 * space-joined key can collide two different (spot, source) pairs into one
 * bucket. A double colon is not a realistic slug character in either field
 * (source names and spot ids are hyphenated identifiers throughout this
 * codebase's fixtures and seeds), which is a weaker guarantee than a
 * genuinely unrepresentable separator but is honestly what this map key
 * needs: a display-safe string with a low collision chance, not a security
 * boundary.
 */
function maeOf(
  observations: readonly ObservationRow[],
  predictions: readonly PredictionRow[],
): MonthlyMetrics['mae'] {
  const byKey = new Map<
    string,
    { spot_id: string; source: string; lead_bucket: string; absErrors: number[] }
  >();
  for (const spotId of spotsReportedIn(observations)) {
    const spotObservations = observations.filter((observation) => observation.spot_id === spotId);
    for (const row of formHeightResidualRows(spotObservations, predictions)) {
      const key = spotId + "::" + row.source + "::" + row.leadBucket;
      const entry =
        byKey.get(key) ?? { spot_id: spotId, source: row.source, lead_bucket: row.leadBucket, absErrors: [] };
      entry.absErrors.push(Math.abs(row.sample.value));
      byKey.set(key, entry);
    }
  }

  const perKey = [...byKey.values()]
    .map(({ spot_id, source, lead_bucket, absErrors }) => ({
      spot_id,
      source,
      lead_bucket,
      mae: meanOf(absErrors),
      n: absErrors.length,
    }))
    .sort(
      (left, right) =>
        left.spot_id.localeCompare(right.spot_id) ||
        left.source.localeCompare(right.source) ||
        left.lead_bucket.localeCompare(right.lead_bucket),
    );

  return { per_key: perKey, baselines: baselinesOf(observations) };
}

type ObservedPoint = { readonly spot_id: string; readonly day: string; readonly mid: number };

function observedPointsOf(observations: readonly ObservationRow[]): ObservedPoint[] {
  const points: ObservedPoint[] = [];
  for (const observation of observations) {
    const day = dateOf(observation.observed_at);
    const mid = midOfBand(observation.size_band);
    if (day === undefined || mid === null) continue;
    points.push({ spot_id: observation.spot_id, day, mid });
  }
  return points;
}

/** B0: a constant predictor at the spot's own mean observed height over the window. */
function climatologyBaselineOf(points: readonly ObservedPoint[]): number | null {
  if (points.length === 0) return null;
  const bySpot = new Map<string, number[]>();
  for (const point of points) {
    bySpot.set(point.spot_id, [...(bySpot.get(point.spot_id) ?? []), point.mid]);
  }
  const errors: number[] = [];
  for (const mids of bySpot.values()) {
    const spotMean = meanOf(mids);
    for (const mid of mids) errors.push(Math.abs(mid - spotMean));
  }
  return meanOf(errors);
}

/** B2: yesterday's observed height predicts today's, only where yesterday actually had a report. */
function persistenceBaselineOf(points: readonly ObservedPoint[]): number | null {
  const bySpotDay = new Map<string, number>();
  for (const point of points) bySpotDay.set(spotDayKey(point.spot_id, point.day), point.mid);

  const errors: number[] = [];
  for (const point of points) {
    const yesterday = bySpotDay.get(spotDayKey(point.spot_id, addUtcDays(point.day, -1)));
    if (yesterday === undefined) continue;
    errors.push(Math.abs(point.mid - yesterday));
  }
  return errors.length === 0 ? null : meanOf(errors);
}

function baselinesOf(observations: readonly ObservationRow[]): MonthlyMetrics['mae']['baselines'] {
  const points = observedPointsOf(observations);
  return { climatology: climatologyBaselineOf(points), persistence: persistenceBaselineOf(points) };
}

// ---------- cv (06 section 7 G7: the monthly kill switch, judged here) ----------

function cvOf(
  observations: readonly ObservationRow[],
  predictions: readonly PredictionRow[],
  corrections: readonly StoredCorrection[],
): MonthlyMetrics['cv'] {
  return {
    verdict: judgeRollingOriginCorrections({
      gatedCorrections: gatedHeightCorrectionsOf(corrections),
      samples: datedHeightResidualSamplesOf(observations, predictions),
    }),
  };
}

/**
 * Every applied height key across every spot's stored correction, keyed the
 * same way `cvKeyOf` keys a residual sample below. `applied` is READ here,
 * never written: G4's marking rule (06 section 7) belongs to
 * src/learning/gates.ts alone, and src/learning/declarations.ts's
 * whole-source examination watches this file stay that way.
 */
function gatedHeightCorrectionsOf(corrections: readonly StoredCorrection[]): Map<string, number> {
  const gated = new Map<string, number>();
  for (const correction of corrections) {
    for (const [source, byLead] of Object.entries(correction.bias.swell_h_m.per_source)) {
      for (const [leadBucket, key] of Object.entries(byLead)) {
        if (!key.applied) continue;
        gated.set(cvKeyOf(correction.spot_id, source, leadBucket), key.b);
      }
    }
  }
  return gated;
}

/**
 * Every height residual this month can date, spot by spot -- the same
 * pairing `maeOf` forms above, kept as its own pass rather than shared: the
 * CV judge and the displayed MAE are two different questions asked of the
 * same rows, and entangling them would make either one harder to change
 * alone. A residual with no day (06 section 5.1: a row that never said when
 * it was seen) forms no CV sample, because the rolling origin cannot place
 * it anywhere.
 */
function datedHeightResidualSamplesOf(
  observations: readonly ObservationRow[],
  predictions: readonly PredictionRow[],
): DatedResidualSample[] {
  const samples: DatedResidualSample[] = [];
  for (const spotId of spotsReportedIn(observations)) {
    const spotObservations = observations.filter((observation) => observation.spot_id === spotId);
    for (const row of formHeightResidualRows(spotObservations, predictions)) {
      if (row.sample.day === null) continue;
      samples.push({ key: cvKeyOf(spotId, row.source, row.leadBucket), day: row.sample.day, residual: row.sample.value });
    }
  }
  return samples;
}

/** (spot, source, lead_bucket), space-joined: the same collision-safety reasoning as `maeOf`'s own key, above. */
function cvKeyOf(spotId: string, source: string, leadBucket: string): string {
  return `${spotId} ${source} ${leadBucket}`;
}

// ---------- sigma_human (the ceiling no model can beat, 09 section 16.2) ----------

function sigmaHumanOf(observations: readonly ObservationRow[]): MonthlyMetrics['sigma_human'] {
  type Witness = { readonly reporterKey: string; readonly mid: number; readonly observedMs: number };
  const bySpot = new Map<string, Witness[]>();
  for (const observation of observations) {
    const deviceId = observation.device_id;
    const mid = midOfBand(observation.size_band);
    const observedMs = safeDateMs(observation.observed_at);
    if (deviceId === undefined || mid === null || observedMs === null) continue;
    const witnesses = bySpot.get(observation.spot_id) ?? [];
    witnesses.push({ reporterKey: reporterKeyOf(observation, deviceId), mid, observedMs });
    bySpot.set(observation.spot_id, witnesses);
  }

  const disagreements: number[] = [];
  for (const witnesses of bySpot.values()) {
    for (let left = 0; left < witnesses.length; left += 1) {
      for (let right = left + 1; right < witnesses.length; right += 1) {
        if (witnesses[left]!.reporterKey === witnesses[right]!.reporterKey) continue;
        if (Math.abs(witnesses[left]!.observedMs - witnesses[right]!.observedMs) > CO_OBSERVER_WINDOW_MS) continue;
        disagreements.push(Math.abs(witnesses[left]!.mid - witnesses[right]!.mid));
      }
    }
  }
  return {
    value: disagreements.length === 0 ? null : meanOf(disagreements),
    co_observer_pairs: disagreements.length,
  };
}

// ---------- calibration (the confidence kill switch's own bins, 09 section 10.2) ----------

/**
 * `conf_level` is not a field src/learning/inputs.ts's `ObservationRow` type
 * declares today (it types `predicted` as `{ score_q: number } | null`), but
 * a real captured report carries it inside the same block (06 section 10).
 * Read permissively here, in this module's own row view, rather than
 * widening the shared type on this step's say-so alone.
 */
type CapturedPredictedBlock = { readonly score_q?: number; readonly conf_level?: string };

function calibrationOf(observations: readonly ObservationRow[]): MonthlyMetrics['calibration'] {
  const aggregates = new Map<string, { reports: number; hits: number; squaredError: number }>();
  for (const observation of observations) {
    const predicted = observation.predicted as CapturedPredictedBlock | null | undefined;
    const confidence = predicted?.conf_level;
    const score = predicted?.score_q;
    if (typeof confidence !== 'string' || confidence === '' || typeof score !== 'number' || !Number.isFinite(score)) {
      continue;
    }
    const probability = score / 100;
    const hit = observation.quality === 'good' || observation.quality === 'epic';
    const aggregate = aggregates.get(confidence) ?? { reports: 0, hits: 0, squaredError: 0 };
    aggregate.reports += 1;
    aggregate.hits += Number(hit);
    aggregate.squaredError += (probability - Number(hit)) ** 2;
    aggregates.set(confidence, aggregate);
  }

  const bins = [...aggregates]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([confidence, aggregate]) => ({
      conf_level: confidence,
      reports: aggregate.reports,
      hits: aggregate.hits,
      hit_rate: aggregate.hits / aggregate.reports,
      brier: aggregate.squaredError / aggregate.reports,
    }));
  return { probability: 'score_q/100 (naive)', bins, offending_term: offendingTermOf(bins) };
}

/**
 * 09 section 3.6 consequence 3: if the high-confidence bin is not more often
 * right than the low-confidence bin, C_spread is named for removal. Compares
 * only the 'high' and 'low' bins the design names -- a month missing either
 * one has no comparison to make, and absence must never manufacture a
 * removal (a detector only ever seen firing proves nothing about its
 * judgment). A tie (equal hit rates) is not an inversion: only a STRICTLY
 * lower high-confidence hit rate names the term.
 */
function offendingTermOf(
  bins: readonly { conf_level: string; hit_rate: number }[],
): 'c_spread' | null {
  const high = bins.find((bin) => bin.conf_level === 'high');
  const low = bins.find((bin) => bin.conf_level === 'low');
  if (high === undefined || low === undefined) return null;
  return high.hit_rate < low.hit_rate ? 'c_spread' : null;
}

// ---------- shrinkage (09 section 17.4 guardrail 2) ----------

/** 09 section 17.4 guardrail 2: this many observations is enough evidence for a spot to have earned independence. */
const SHRINKAGE_ALARM_MIN_N = 80;
/** 09 section 17.4 guardrail 2: still pooled away by at least this much at that evidence level is the misconfiguration. */
const SHRINKAGE_ALARM_MIN_WEIGHT = 0.6;

function shrinkageOf(corrections: readonly StoredCorrection[]): MonthlyMetrics['shrinkage'] {
  return corrections
    .map((correction) => ({ spot_id: correction.spot_id, key: fullestAppliedKeyOf(correction) }))
    .filter((entry): entry is { spot_id: string; key: GatedKey } => entry.key !== undefined)
    .map(({ spot_id, key }) => ({
      spot_id,
      shrink_weight: key.shrunk_from_global,
      n: key.n,
      reporters: key.reporters,
      flagged: isOverPooled(key.n, key.shrunk_from_global),
    }))
    .sort((left, right) => left.spot_id.localeCompare(right.spot_id));
}

/** A spot that has earned independence (high n) but is still mostly pooled away is a misconfiguration, never noise on day one. */
function isOverPooled(n: number, shrinkWeight: number): boolean {
  return n >= SHRINKAGE_ALARM_MIN_N && shrinkWeight >= SHRINKAGE_ALARM_MIN_WEIGHT;
}

/** The spot-level alarm representative: the applied key with the most evidence behind it. */
function fullestAppliedKeyOf(correction: StoredCorrection): GatedKey | undefined {
  const keys = [
    ...Object.values(correction.bias.swell_h_m.per_source).flatMap((byLead) => Object.values(byLead)),
    ...(correction.score_delta === undefined ? [] : [correction.score_delta]),
  ].filter((key) => key.applied);
  return keys.sort((left, right) => right.n - left.n || right.shrunk_from_global - left.shrunk_from_global)[0];
}

// ---------- small shared helpers ----------

function midOfBand(band: SizeBandToken | undefined): number | null {
  if (band === undefined) return null;
  if (band === OPEN_ENDED_SIZE_BAND) return TOP_BAND_NOMINAL_M;
  const row = sizeBands.find((candidate) => candidate.value === band);
  return row === undefined ? null : (row.lo_m + row.hi_m) / 2;
}

function spotDayKey(spotId: string, day: string): string {
  return `${spotId} ${day}`;
}

function addUtcDays(day: string, delta: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}

function dateOf(value: unknown): string | undefined {
  const ms = safeDateMs(value);
  return ms === null ? undefined : new Date(ms).toISOString().slice(0, 10);
}

function safeDateMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function meanOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
