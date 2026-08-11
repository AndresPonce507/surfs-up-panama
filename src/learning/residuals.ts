// Forming the two declared residual samples, 06-learning-layer.md section
// 5.1, verbatim:
//
//   r_height[i,m,l] = H_eff_pred[m, lead l] - (mid(band_i) - u_hat[r(i)])
//   r_score[i]      = score_q_shown[i] - q_obs(quality_i)   (skipped when predicted is null)
//
// u_hat is exactly 0 this slice: nobody has any reporting history yet
// (per-reporter offsets are a later stage, replacing the constant through
// this same seam, per this step's own design notes). H_eff comes from the
// shipped hEff(h, t) in src/scoring/engine.ts, imported read-only and never
// re-derived: any change to that formula changes the meaning of every
// residual this module has ever formed. mid(band) derives from
// src/data/size-bands.ts, never a second copy of that table.
//
// Pairing, 06 section 5.1: a report at (spot, hour = floor_utc_hour(observed_at))
// joins a prediction-log row at (spot, source, valid_ts) with land_masked
// false. A report can pair with more than one prediction row -- one per
// source reporting at that hour -- and forms one height residual sample per
// match, keyed by that source and the lead bucket the match's lead_h falls
// into. Nothing here is a rule about which report is trustworthy; that is
// the gate's job (src/learning/gates.ts), not this module's.
//
// Every field this module reads off a row is checked before use. A row this
// lane cannot fully make sense of (a line src/learning/inputs.ts could only
// partially parse) contributes nothing to any residual, rather than crashing
// the run that examines every OTHER spot's honest reports.

import { QUALITY_OBSERVED_SCORE } from '../data/report-vocab';
import { OPEN_ENDED_SIZE_BAND, sizeBands, type SizeBandToken } from '../data/size-bands';
import { hEff } from '../scoring/engine';
import { leadBucketOf, SIGMA_EFF, TOP_BAND_NOMINAL_M, TOP_BAND_VARIANCE_M2 } from './constants';
import type { ObservationRow, PredictionRow } from './inputs';
import { collapseDeviceDayMedian, winsorizeSpotDayResiduals } from './weights';

/** One weighted residual sample, still carrying who reported it so a key's distinct-reporter count can be formed later. */
export type ResidualSample = {
  readonly value: number;
  readonly weight: number;
  readonly device_id: string;
  /** Present for log-derived samples, so robustness can group one device-day. */
  readonly spot_id?: string;
  readonly session_day?: string;
  readonly band_width_m?: number;
};

/** One height residual sample, keyed to the model and lead bucket it was measured on (06 section 5.1). */
export type HeightResidualRow = {
  readonly spotId: string;
  readonly source: string;
  readonly leadBucket: string;
  readonly sample: ResidualSample;
};

/**
 * r_height, formed for every report that pairs with a prediction row. One
 * report can produce more than one row: one per matching (source, lead)
 * prediction.
 */
export function formHeightResidualRows(
  observations: readonly ObservationRow[],
  predictions: readonly PredictionRow[],
): HeightResidualRow[] {
  const rows: HeightResidualRow[] = [];
  for (const observation of observations) {
    const deviceId = observation.device_id;
    const band = observation.size_band;
    const observedHourMs = floorUtcHourMs(observation.observed_at);
    if (deviceId === undefined || band === undefined || observedHourMs === null) continue;
    const sessionDay = utcDayOf(observedHourMs);

    for (const prediction of predictions) {
      if (!pairs(observation, prediction, observedHourMs)) continue;
      const { mid, varianceM2, bandWidthM } = bandMidAndVarianceM(band);
      const value = hEff(prediction.swell_h_m, prediction.swell_t_s) - mid;
      rows.push({
        spotId: observation.spot_id,
        source: prediction.source,
        leadBucket: leadBucketOf(prediction.lead_h),
        sample: {
          value,
          weight: heightPrecisionWeight(varianceM2) * selectionWeightOf(observation),
          device_id: deviceId,
          spot_id: observation.spot_id,
          session_day: sessionDay,
          ...(bandWidthM === undefined ? {} : { band_width_m: bandWidthM }),
        },
      });
    }
  }
  return collapseHeightDeviceDays(rows);
}

/**
 * r_score, formed for every report that both names a quality label and
 * carries the `predicted` score a build showed. A morning nobody had a
 * forecast for has no score difference to contribute, so it is skipped here
 * rather than entered as zero.
 */
export function formScoreResidualSamples(observations: readonly ObservationRow[]): ResidualSample[] {
  const samples: ResidualSample[] = [];
  for (const observation of observations) {
    const deviceId = observation.device_id;
    const quality = observation.quality;
    const predictedScore = capturedScore(observation.predicted);
    if (deviceId === undefined || quality === undefined || predictedScore === null) continue;
    const qObs = QUALITY_OBSERVED_SCORE[quality];
    if (qObs === undefined) continue;
    const observedHourMs = floorUtcHourMs(observation.observed_at);
    samples.push({
      value: predictedScore - qObs,
      weight: scorePrecisionWeight() * selectionWeightOf(observation),
      device_id: deviceId,
      ...(observedHourMs === null ? {} : { spot_id: observation.spot_id, session_day: utcDayOf(observedHourMs) }),
    });
  }
  return collapseDeviceDayMedian(samples).map(withoutSessionIdentity);
}

/** A missing captured forecast is absence, never a zero-valued score sample. */
function capturedScore(predicted: ObservationRow['predicted']): number | null {
  if (predicted === null || predicted === undefined || typeof predicted.score_q !== 'number') return null;
  return predicted.score_q;
}

function selectionWeightOf(observation: ObservationRow): number {
  return observation.selection_weight ?? 1;
}

// ---------- pairing ----------

function pairs(observation: ObservationRow, prediction: PredictionRow, observedHourMs: number): boolean {
  if (prediction.spot_id !== observation.spot_id) return false;
  if (prediction.land_masked !== false) return false;
  if (typeof prediction.source !== 'string') return false;
  if (typeof prediction.swell_h_m !== 'number' || typeof prediction.swell_t_s !== 'number') return false;
  if (typeof prediction.lead_h !== 'number') return false;
  const validMs = safeDateMs(prediction.valid_ts);
  return validMs !== null && validMs === observedHourMs;
}

/** floor_utc_hour(observed_at), 06 section 5.1: minutes and seconds zeroed, in UTC. */
function floorUtcHourMs(observedAt: string | undefined): number | null {
  if (typeof observedAt !== 'string') return null;
  const ms = safeDateMs(observedAt);
  if (ms === null) return null;
  const floored = new Date(ms);
  floored.setUTCMinutes(0, 0, 0);
  return floored.getTime();
}

function utcDayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function safeDateMs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ---------- band midpoint, variance, and precision weights (06 section 5.1, 6.1) ----------

function bandMidAndVarianceM(band: SizeBandToken): { mid: number; varianceM2: number; bandWidthM?: number } {
  if (band === OPEN_ENDED_SIZE_BAND) return { mid: TOP_BAND_NOMINAL_M, varianceM2: TOP_BAND_VARIANCE_M2 };
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined) return { mid: TOP_BAND_NOMINAL_M, varianceM2: TOP_BAND_VARIANCE_M2 };
  const width = row.hi_m - row.lo_m;
  return { mid: (row.lo_m + row.hi_m) / 2, varianceM2: (width * width) / 12, bandWidthM: width };
}

/** w_precision = 1 / (sigma_eff^2 + width(band)^2/12), 06 section 6.1. */
function heightPrecisionWeight(bandVarianceM2: number): number {
  return 1 / (SIGMA_EFF.height.value ** 2 + bandVarianceM2);
}

/** Score carries no band interval, so its precision weight has no width term. */
function scorePrecisionWeight(): number {
  return 1 / SIGMA_EFF.score.value ** 2;
}

/** Each source/lead key gets one device-day voice before its estimate is formed. */
function collapseHeightDeviceDays(rows: readonly HeightResidualRow[]): HeightResidualRow[] {
  const byKey = new Map<string, HeightResidualRow[]>();
  for (const row of rows) {
    const key = `${row.source}\u0000${row.leadBucket}`;
    const group = byKey.get(key) ?? [];
    group.push(row);
    byKey.set(key, group);
  }

  const collapsed: HeightResidualRow[] = [];
  for (const group of byKey.values()) {
    const exemplar = group[0];
    if (exemplar === undefined) continue;
    const collapsedDeviceDays = collapseDeviceDayMedian(group.map((row) => row.sample));
    for (const sample of winsorizeSpotDayResiduals(collapsedDeviceDays)) {
      collapsed.push({
        spotId: exemplar.spotId,
        source: exemplar.source,
        leadBucket: exemplar.leadBucket,
        sample: withoutSessionIdentity(sample),
      });
    }
  }
  return collapsed;
}

/** Session identity is only pre-weighting work; estimates expose no new stored field. */
function withoutSessionIdentity(sample: ResidualSample): ResidualSample {
  const { spot_id: _spotId, session_day: _sessionDay, band_width_m: _bandWidthM, ...residual } = sample;
  return residual;
}
