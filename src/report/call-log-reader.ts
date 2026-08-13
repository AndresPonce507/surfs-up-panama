// Read-only PublishedCall resolution for the report Lambda. A missing or
// malformed call is intentionally an honest no_snapshot, never a 5xx.

import { sizeBands, type SizeBandToken } from '../data/size-bands';
import type { ReportRecord } from './report-record';
import type { PredictedCall, ReportReveal } from './local-write-store';

export interface SpotIndexEntry { readonly region_id: string; }
export interface CallLogReader { get(key: string): Promise<string | null>; }

type CallRow = PredictedCall & { readonly spot_id: string; readonly valid_ts: string };

const qualityAnchors: Readonly<Record<string, number>> = { bad: 20, ok: 45, good: 70, epic: 90 };
const sizeBandIndexes = new Map(sizeBands.map(({ value }, index) => [value, index]));

export async function resolveReportReveal(
  record: ReportRecord,
  index: Readonly<Record<string, SpotIndexEntry>>,
  reader: CallLogReader,
): Promise<ReportReveal> {
  const spot = index[record.spot_id];
  if (spot === undefined) return noSnapshot();
  const observedHour = `${utcHour(record.observed_at)}:00:00Z`;
  for (let offset = 0; offset <= 3; offset += 1) {
    const buildAt = new Date(Date.parse(observedHour) - (offset * 60 * 60 * 1000));
    const key = callKey(buildAt, spot.region_id);
    const content = await reader.get(key);
    if (content === null) continue;
    const call = content.split('\n').map(parseCall).find((candidate): candidate is CallRow => candidate !== null && candidate.spot_id === record.spot_id && utcHour(candidate.valid_ts) === utcHour(record.observed_at));
    if (call === undefined) continue;
    const observedScore = qualityAnchors[record.quality];
    const predictedBand = sizeBandIndexes.get(call.size_band as SizeBandToken);
    const observedBand = sizeBandIndexes.get(record.size_band);
    if (observedScore === undefined || predictedBand === undefined || observedBand === undefined) return noSnapshot();
    return {
      outcome: 'compared',
      predicted: {
        score_q: call.score_q,
        size_band: call.size_band,
        size_range_m: call.size_range_m,
        wind_state: call.wind_state,
        conf_level: call.conf_level,
      },
      delta: { score_points: call.score_q - observedScore, size_bands: predictedBand - observedBand },
    };
  }
  return noSnapshot();
}

/**
 * The hour a timestamp belongs to, as `YYYY-MM-DDTHH`.
 *
 * The published call log stamps its hours with minutes only
 * (`2026-08-12T15:00Z`) because open-meteo-source.ts mints `valid_ts` straight
 * from the provider's minute-precision hour, and build.ts reads that shape
 * back with `call.valid_ts.endsWith('T18:00Z')`. A report's `observed_at`
 * carries seconds. Comparing the two as raw strings never matches, so both
 * sides are reduced to the hour they share before they are compared. Calls are
 * strictly hourly, so the hour is their whole identity.
 */
function utcHour(timestamp: string): string {
  return timestamp.slice(0, 13);
}

function callKey(buildAt: Date, regionId: string): string {
  const date = buildAt.toISOString().slice(0, 10);
  const hour = buildAt.toISOString().slice(11, 13);
  return `log/calls/v1/dt=${date}/build=${hour}Z/${regionId}.jsonl.gz`;
}

function parseCall(line: string): CallRow | null {
  try {
    const value = JSON.parse(line) as Partial<CallRow>;
    if (typeof value.spot_id !== 'string' || typeof value.valid_ts !== 'string' || typeof value.score_q !== 'number'
      || typeof value.size_band !== 'string' || !Array.isArray(value.size_range_m) || value.size_range_m.length !== 2
      || !value.size_range_m.every((part) => typeof part === 'number') || typeof value.wind_state !== 'string' || typeof value.conf_level !== 'string') return null;
    return value as CallRow;
  } catch {
    return null;
  }
}

function noSnapshot(): ReportReveal {
  return { outcome: 'no_snapshot', predicted: null };
}
