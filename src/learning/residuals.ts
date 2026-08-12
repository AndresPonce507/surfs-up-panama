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

/**
 * One weighted residual sample, still carrying who reported it so a key's
 * distinct-reporter count can be formed later, and WHICH DAY they reported it
 * on so the weighing room can tell one session from several (06 section 6.2
 * step 1). `day` is the UTC calendar day of `observed_at`; it is null when the
 * row never said when it was seen, which is the honest reading of a sample
 * whose session cannot be identified.
 */
export type ResidualSample = {
  readonly value: number;
  readonly weight: number;
  readonly device_id: string;
  readonly day: string | null;
  /**
   * The width in metres of the band this sample was reported in, which is the
   * unit the day fence is measured in (06 section 6.2 step 2). Null when the
   * report named no band with two edges: the open top band has no upper edge
   * and therefore no width, and a score residual has no band at all.
   */
  readonly bandWidthM: number | null;
  /**
   * WHO reported it, 06 section 4: `reporter_key = person_id ?? device_id`, the
   * C5 resolution (adr-identity-claim-merge). Distinct from `device_id`, which
   * stays the carrier of "one session" (06 section 6.2 step 1 is keyed on the
   * device, deliberately): two devices belonging to one person are two
   * sessions but one voice.
   */
  readonly reporter_key: string;
  /**
   * The single-sample physical uncertainty of the claim this sample carries
   * (06 section 8). Concordance measures disagreement in units of sigma_eff^2,
   * so the sample has to know its own: a height residual and a score residual
   * live on different scales and cannot be compared without it.
   */
  readonly sigmaEff: number;
  /**
   * Whether the site ASKED for this morning (`trigger = push_solicited`,
   * 07 section 1 row: the island sets it from the solicitation deep link).
   * A solicited morning is already close to a random sample of pushed days,
   * so 06 section 6.3 gives it w_select = 1 and no rarity bonus.
   */
  readonly solicited: boolean;
};

/** One height residual sample, keyed to the model and lead bucket it was measured on (06 section 5.1). */
export type HeightResidualRow = { readonly source: string; readonly leadBucket: string; readonly sample: ResidualSample };

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

    for (const prediction of predictions) {
      if (!pairs(observation, prediction, observedHourMs)) continue;
      const { mid, varianceM2, widthM } = bandMidAndVarianceM(band);
      const value = hEff(prediction.swell_h_m, prediction.swell_t_s) - mid;
      rows.push({
        source: prediction.source,
        leadBucket: leadBucketOf(prediction.lead_h),
        sample: {
          value,
          weight: heightPrecisionWeight(varianceM2),
          device_id: deviceId,
          reporter_key: reporterKeyOf(observation, deviceId),
          day: utcDayOf(observedHourMs),
          bandWidthM: widthM,
          sigmaEff: SIGMA_EFF.height.value,
          solicited: observation.trigger === SOLICITED_TRIGGER,
        },
      });
    }
  }
  return rows;
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
    const predicted = observation.predicted;
    if (deviceId === undefined || quality === undefined || predicted === null || predicted === undefined) continue;
    if (typeof predicted.score_q !== 'number') continue;
    const qObs = QUALITY_OBSERVED_SCORE[quality];
    if (qObs === undefined) continue;
    const observedHourMs = floorUtcHourMs(observation.observed_at);
    samples.push({
      value: predicted.score_q - qObs,
      weight: scorePrecisionWeight(),
      device_id: deviceId,
      reporter_key: reporterKeyOf(observation, deviceId),
      day: observedHourMs === null ? null : utcDayOf(observedHourMs),
      // A score residual is a difference between two points on the 0-100
      // ladder. It was never reported as an interval, so it has no width and
      // no fence can be measured in it.
      bandWidthM: null,
      sigmaEff: SIGMA_EFF.score.value,
      solicited: observation.trigger === SOLICITED_TRIGGER,
    });
  }
  return samples;
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

/** 07 section 1: the one trigger value that means the site asked for this morning rather than waiting for it. */
const SOLICITED_TRIGGER = 'push_solicited';

/**
 * reporter_key, 06 section 4 and adr-identity-claim-merge's C5 resolution:
 * `person_id ?? device_id`, resolved here at aggregation time rather than at
 * capture, because a person only becomes known to the fit once their claim has
 * been merged. A row that never named a person is its device, which is the
 * launch shape: no claim path ships yet, so every reporter_key IS a device id
 * today and this line changes no stored number until one does.
 */
export function reporterKeyOf(observation: ObservationRow, deviceId: string): string {
  const person = observation.person_id;
  return typeof person === 'string' && person !== '' ? person : deviceId;
}

/** The UTC calendar day a sample was reported on, the unit 06 section 6.2's session collapse is keyed by. */
function utcDayOf(observedMs: number): string {
  return new Date(observedMs).toISOString().slice(0, 10);
}

function safeDateMs(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ---------- band midpoint, variance, and precision weights (06 section 5.1, 6.1) ----------

/**
 * `widthM` is null exactly where the band has no two edges to measure between:
 * the open top band stands in for its missing upper edge with a nominal value
 * and a nominal variance (06 section 5.1), and neither of those is a width. A
 * fence measured in an invented width would claim a precision the report never
 * carried, so a morning whose middle report is open-ended simply has no fence.
 */
function bandMidAndVarianceM(band: SizeBandToken): {
  mid: number;
  varianceM2: number;
  widthM: number | null;
} {
  const openEnded = { mid: TOP_BAND_NOMINAL_M, varianceM2: TOP_BAND_VARIANCE_M2, widthM: null };
  if (band === OPEN_ENDED_SIZE_BAND) return openEnded;
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined) return openEnded;
  const width = row.hi_m - row.lo_m;
  return { mid: (row.lo_m + row.hi_m) / 2, varianceM2: (width * width) / 12, widthM: width };
}

/** w_precision = 1 / (sigma_eff^2 + width(band)^2/12), 06 section 6.1. */
function heightPrecisionWeight(bandVarianceM2: number): number {
  return 1 / (SIGMA_EFF.height.value ** 2 + bandVarianceM2);
}

/** Score carries no band interval, so its precision weight has no width term. */
function scorePrecisionWeight(): number {
  return 1 / SIGMA_EFF.score.value ** 2;
}
