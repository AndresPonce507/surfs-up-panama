// NOAA CO-OPS tide predictions adapter. It receives only smart-constructed
// accepted profiles, so no location, coast, or nearest-station fallback can
// reach this wire boundary.

import type { Clock, ForecastSource, MemberSeries, ReceivedSourcePayload, SourceResult, TideHour, WindHour } from '../ports';
import type { AcceptedTideStationProfile } from './tide-station-profiles';

const COOPS_PREDICTIONS_ENDPOINT = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const COOPS_PROVIDER = 'noaa-coops';

export class CoopsTideSource implements ForecastSource {
  constructor(
    private readonly profilesBySpotId: ReadonlyMap<string, AcceptedTideStationProfile>,
    private readonly clock: Clock,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  fetchWavePayload(_spot_id: string): Promise<ReceivedSourcePayload> { return Promise.resolve({ ok: false, reason: 'dark' }); }
  parseWaveMembers(_verbatim: string): SourceResult<MemberSeries[]> { return { ok: false, reason: 'dark' }; }
  fetchWindPayload(_spot_id: string): Promise<ReceivedSourcePayload> { return Promise.resolve({ ok: false, reason: 'dark' }); }
  parseWind(_verbatim: string): SourceResult<WindHour[]> { return { ok: false, reason: 'dark' }; }

  async fetchTidePayload(spot_id: string): Promise<ReceivedSourcePayload> {
    const profile = this.profilesBySpotId.get(spot_id);
    if (profile === undefined) return { ok: false, reason: 'dark' };
    try {
      const response = await this.fetchImpl(coopsPredictionsUrl(profile.station_id, this.clock.now()));
      if (!response.ok) return { ok: false, reason: 'error' };
      return { ok: true, verbatim: await response.text(), provider: COOPS_PROVIDER };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  parseTide(verbatim: string): SourceResult<TideHour[]> {
    try {
      const parsed = JSON.parse(verbatim) as { predictions?: unknown };
      if (!Array.isArray(parsed.predictions)) return { ok: false, reason: 'malformed' };
      const hours = parsed.predictions.map(parsePrediction);
      return { ok: true, data: hours };
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }
}

/** CO-OPS asks in UTC (GMT), metric MLLW, with `interval=h` for an inclusive eight-day window. */
export function coopsPredictionsUrl(stationId: string, now: Date): string {
  const begin = utcDate(now);
  const end = utcDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7)));
  const params = new URLSearchParams({
    product: 'predictions',
    application: 'surfs-up-panama',
    begin_date: begin,
    end_date: end,
    datum: 'MLLW',
    station: stationId,
    time_zone: 'gmt',
    units: 'metric',
    interval: 'h',
    format: 'json',
  });
  return `${COOPS_PREDICTIONS_ENDPOINT}?${params.toString()}`;
}

function parsePrediction(value: unknown): TideHour {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('CO-OPS prediction must be an object');
  const prediction = value as Record<string, unknown>;
  if (typeof prediction.t !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(prediction.t)) throw new Error('CO-OPS prediction timestamp is invalid');
  const tide_m = Number(prediction.v);
  if (!Number.isFinite(tide_m)) throw new Error('CO-OPS prediction value is invalid');
  return { valid_ts: `${prediction.t.replace(' ', 'T')}:00Z`, tide_m };
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}
