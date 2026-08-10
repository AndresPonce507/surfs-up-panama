// Synthetic mornings: the fixture builder for this feature's acceptance tests.
//
// Every morning here is invented. None of it is evidence that the forecast has
// learned anything, and nothing in this module is allowed to say it has. What
// these fixtures exist for is to drive the declared laws of
// 06-learning-layer.md section 5.1 over inputs whose true answer is known by
// construction.
//
// The shapes below are the two settled input records this lane consumes and
// never produces: the observation export (domain-model.md section 7.3, the
// fields the nightly export of log/observations/v1/ carries) and the prediction
// receipt (04-ingest-pipeline.md, the rows src/pipeline/ingest.ts writes to
// predictions/v1/). Reporter identity is the launch identity mapping: C5
// resolves reporter_key = device_id while no claim-merge exists
// (feature-delta Pre-requisite 8).

import type { QualityToken, WindStateToken } from '../../../../../src/data/report-vocab';
import { sizeBands, type SizeBandToken } from '../../../../../src/data/size-bands';

/** One row of the nightly observation export, domain-model.md section 7.3. */
export type ObservationRow = {
  report_id: string;
  spot_id: string;
  device_id: string;
  observed_at: string;
  submitted_at: string;
  /** Server-set at receipt; the age clause of G2 is frozen against it (06 section 7). */
  received_at: string;
  /** Server-set when the credential was minted (07 section 6). */
  credential_issued_at: string;
  size_band: SizeBandToken;
  size_band_schema: 1;
  wind: WindStateToken;
  quality: QualityToken;
  build_id: string;
  predicted: {
    score_q: number;
    size_band: SizeBandToken;
    wind_state: WindStateToken;
    conf_level: string;
  } | null;
  trigger: 'organic' | 'push_solicited';
};

/** One prediction receipt row, the same shape src/pipeline/ingest.ts writes. */
export type PredictionRow = {
  spot_id: string;
  source: string;
  run_ts: string;
  valid_ts: string;
  lead_h: number;
  swell_h_m: number;
  swell_t_s: number;
  swell_dir_deg: number;
  wind_speed_kt: number | null;
  wind_dir_deg: number | null;
  tide_m: number | null;
  tide_day_low_m: number | null;
  tide_day_high_m: number | null;
  land_masked: boolean;
};

export type Morning = { observation: ObservationRow; prediction: PredictionRow };

export const SPOT_ID = 'playa-venao';

/** One model and one lead bucket, so every synthetic morning lands on one key. */
export const HISTORY_SOURCE = 'ncep_gfswave016';
export const HISTORY_LEAD_H = 36;
export const HISTORY_LEAD_BUCKET = 'lead_24_48';

/**
 * Every synthetic morning is reported at one band, so the per-sample precision
 * weight (06 section 6.1) is uniform and the weighted mean is the plain mean.
 * That keeps every oracle a declared law rather than a re-implementation.
 */
export const REPORTED_BAND: SizeBandToken = 'chest_head';
/** A strictly bigger band, for the law that a bigger reported size lowers the difference. */
export const BIGGER_REPORTED_BAND: SizeBandToken = 'head_overhead';

/** Interval midpoint from the canonical band table, never a second copy of it. */
export function bandMidM(band: SizeBandToken): number {
  const row = sizeBands.find((candidate) => candidate.value === band);
  if (row === undefined) throw new Error(`test bug: unknown size band ${band}`);
  return (row.lo_m + row.hi_m) / 2;
}

/** 06 section 8: one home per variable. Height 0.48 m, score 25 points. */
export const SIGMA_EFF_HEIGHT_M = 0.48;
export const SIGMA_EFF_SCORE_POINTS = 25;

/** The wave period that makes the effective height equal the raw height. */
const NEUTRAL_PERIOD_S = 10;

/** First reported morning. Well inside the trailing 90 days and well before the
 *  build date, so no synthetic history can ever reach today's published call. */
const FIRST_REPORTED_DATE = '2026-07-01';

export type MorningsSpec = {
  /** How many mornings were reported. */
  count: number;
  /** How many distinct people reported them; devices cycle through the mornings. */
  reporters: number;
  /**
   * How much bigger the waves came in than the forecast said, in metres.
   * The residual convention is forecast minus observed (06 section 4), so a
   * positive value here means the forecast ran SMALL and the fitted difference
   * is negative, exactly the direction of the 06 section 11 worked example.
   */
  biggerThanForecastM: number;
  /** Half-spread of the mornings around that value; 0 means perfect agreement. */
  spreadM: number;
  /** The band every morning was reported at. */
  band?: SizeBandToken;
  /** Raise every morning's forecast by this much, leaving the reports untouched. */
  forecastShiftM?: number;
  /** Rotate which person reported which morning; nobody has history, so it may change nothing. */
  reporterRotation?: number;
  /** Give the first reporter a credential minted the same morning they reported. */
  freshCredentialForFirstReporter?: boolean;
  /** Every nth morning carries no captured forecast to compare against. */
  withoutCapturedForecastEvery?: number;
  /** Rotate the wind word; wind may change no number the fit writes. */
  windRotation?: number;
  /** Offset every morning's calendar day, so two sets of mornings never collide. */
  dayOffset?: number;
};

const WIND_WORDS: readonly WindStateToken[] = ['clean', 'choppy', 'blown_out'];
/** The published score each morning showed, alternating so score residuals have honest spread. */
const SHOWN_SCORES = [82, 76];

export function syntheticMornings(spec: MorningsSpec): Morning[] {
  const band = spec.band ?? REPORTED_BAND;
  const dayOffset = spec.dayOffset ?? 0;
  const withoutForecastEvery = spec.withoutCapturedForecastEvery ?? 0;
  const windRotation = spec.windRotation ?? 0;
  const reporterRotation = spec.reporterRotation ?? 0;
  const forecastShiftM = spec.forecastShiftM ?? 0;

  return Array.from({ length: spec.count }, (_unused, index) => {
    const deviation = spec.spreadM === 0 ? 0 : (index % 2 === 0 ? spec.spreadM : -spec.spreadM);
    // forecast - observed = -biggerThanForecastM + deviation + forecastShiftM
    // ... at the REFERENCE band. The forecast is anchored to the fixed
    // reference band's midpoint, never to the band actually reported, so
    // moving the reported band moves ONLY what the person said they saw.
    // (Roadmap 01-18 records the trap this one line fixes: when the forecast
    // followed the reported band around, the law "reporting a bigger size
    // lowers the difference" compared a number to itself and was unsatisfiable
    // by any implementation. Fixed by the DISTILL lane, 2026-08-10.)
    const forecastEffectiveHeightM = bandMidM(REPORTED_BAND) - spec.biggerThanForecastM + deviation + forecastShiftM;
    const observedDate = addDays(FIRST_REPORTED_DATE, index + dayOffset);
    const runDate = addDays(observedDate, -1);
    const reporterIndex = (index + reporterRotation) % spec.reporters;
    const deviceId = `d_learn_${reporterIndex}`;
    const credentialIssuedAt = spec.freshCredentialForFirstReporter === true && reporterIndex === 0
      ? `${observedDate}T05:00:00Z`
      : '2026-01-04T09:00:00Z';
    const hasForecast = withoutForecastEvery === 0 || (index + 1) % withoutForecastEvery !== 0;

    return {
      observation: {
        report_id: `01J4QZK8Y3E9RWM2P7T6B1X${String(index).padStart(3, '0')}`,
        spot_id: SPOT_ID,
        device_id: deviceId,
        observed_at: `${observedDate}T18:41:00Z`,
        submitted_at: `${observedDate}T18:44:12Z`,
        received_at: `${observedDate}T18:44:13Z`,
        credential_issued_at: credentialIssuedAt,
        size_band: band,
        size_band_schema: 1,
        wind: WIND_WORDS[(index + windRotation) % WIND_WORDS.length]!,
        quality: 'good',
        build_id: `b_${observedDate}T11Z`,
        predicted: hasForecast
          ? {
              score_q: SHOWN_SCORES[index % SHOWN_SCORES.length]!,
              size_band: band,
              wind_state: 'clean',
              conf_level: 'medium',
            }
          : null,
        trigger: 'organic',
      },
      prediction: {
        spot_id: SPOT_ID,
        source: HISTORY_SOURCE,
        run_ts: `${runDate}T06:00Z`,
        valid_ts: `${observedDate}T18:00Z`,
        lead_h: HISTORY_LEAD_H,
        swell_h_m: forecastEffectiveHeightM,
        swell_t_s: NEUTRAL_PERIOD_S,
        swell_dir_deg: 180,
        wind_speed_kt: 7,
        wind_dir_deg: 40,
        tide_m: 2.31,
        tide_day_low_m: 0.9,
        tide_day_high_m: 4.3,
        land_masked: false,
      },
    };
  });
}

/** The difference the fit should measure before any pooling: forecast minus observed. */
export function rawDifferenceM(spec: Pick<MorningsSpec, 'biggerThanForecastM'>): number {
  return -spec.biggerThanForecastM;
}

/** The noise floor half of se_gate for a given number of mornings (06 section 7, G3). */
export function heightNoiseFloor(n: number): number {
  return 0.5 * SIGMA_EFF_HEIGHT_M / Math.sqrt(n);
}

export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export function observationKey(date: string): string {
  return `log/observations/v1/dt=${date}/reports.jsonl`;
}

export function predictionKey(runDate: string, source: string): string {
  return `predictions/v1/dt=${runDate}/src=${source}/cyc=06Z/all.jsonl.gz`;
}
