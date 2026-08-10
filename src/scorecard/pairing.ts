import { QUALITY_OBSERVED_SCORE, type QualityToken } from '../data/report-vocab';
import { sizeBands } from '../data/size-bands';

export type ScorecardVariable = 'swell_h' | 'score';

export type PredictionSnapshot = {
  readonly spot_id: string;
  readonly source: string;
  readonly run_ts: string;
  readonly valid_ts: string;
  readonly lead_h: number;
  readonly swell_h_m: number;
  readonly land_masked: boolean;
};

export type SurfReport = {
  readonly spot_id: string;
  readonly device_id: string;
  readonly observed_at: string;
  readonly size_band: string;
  readonly quality: string;
  readonly credential_issued_at: string;
  readonly received_at: string;
  readonly predicted: { readonly score_q: number };
};

export type Residual = {
  readonly spot_id: string;
  readonly source: string;
  readonly lead_bucket: string;
  readonly variable: ScorecardVariable;
  readonly paired_valid_ts: string;
  readonly err: number;
  readonly device_id: string;
  readonly quality: string;
};

export type PairingInput = {
  readonly predictions: readonly PredictionSnapshot[];
  readonly reports: readonly SurfReport[];
};

const floorUtcHour = (value: string): string | null => {
  const instant = new Date(value);
  if (!Number.isFinite(instant.valueOf())) return null;
  instant.setUTCMinutes(0, 0, 0);
  return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

const leadBucket = (leadHours: number): string => {
  if (leadHours < 12) return '[0,12)';
  if (leadHours < 24) return '[12,24)';
  if (leadHours < 48) return '[24,48)';
  if (leadHours < 96) return '[48,96)';
  return '[96,∞)';
};

const observedHeight = (sizeBand: string): number | null => {
  const band = sizeBands.find((candidate) => candidate.value === sizeBand);
  if (band === undefined || !Number.isFinite(band.hi_m)) return null;
  return (band.lo_m + band.hi_m) / 2;
};

const observedScore = (quality: string): number | null =>
  quality in QUALITY_OBSERVED_SCORE
    ? QUALITY_OBSERVED_SCORE[quality as QualityToken]
    : null;

const predictionKey = (prediction: PredictionSnapshot): string =>
  `${prediction.spot_id}|${prediction.valid_ts}|${prediction.source}`;

const reportPairKey = (report: SurfReport): string | null => {
  const hour = floorUtcHour(report.observed_at);
  return hour === null ? null : `${report.spot_id}|${hour}`;
};

const matchingPredictions = (
  predictions: readonly PredictionSnapshot[],
  report: SurfReport,
): readonly PredictionSnapshot[] => {
  const key = reportPairKey(report);
  if (key === null) return [];
  const perSource = new Map<string, PredictionSnapshot>();
  for (const prediction of predictions) {
    if (prediction.land_masked || !predictionKey(prediction).startsWith(`${key}|`)) continue;
    const current = perSource.get(prediction.source);
    if (current === undefined || prediction.run_ts > current.run_ts) perSource.set(prediction.source, prediction);
  }
  return [...perSource.values()];
};

const residualsFor = (prediction: PredictionSnapshot, report: SurfReport): readonly Residual[] => {
  const shared = {
    spot_id: prediction.spot_id,
    source: prediction.source,
    lead_bucket: leadBucket(prediction.lead_h),
    paired_valid_ts: prediction.valid_ts,
    device_id: report.device_id,
    quality: report.quality,
  };
  const height = observedHeight(report.size_band);
  const score = observedScore(report.quality);
  return [
    ...(height === null ? [] : [{ ...shared, variable: 'swell_h' as const, err: prediction.swell_h_m - height }]),
    ...(score === null
      ? []
      : [
          {
            ...shared,
            source: 'published',
            variable: 'score' as const,
            err: report.predicted.score_q - score,
          },
        ]),
  ];
};

/** Forms immutable residual samples at the settled (spot, source, lead, variable) grain. */
export const pairResiduals = ({ predictions, reports }: PairingInput): readonly Residual[] =>
  reports.flatMap((report) => matchingPredictions(predictions, report).flatMap((prediction) => residualsFor(prediction, report)));
