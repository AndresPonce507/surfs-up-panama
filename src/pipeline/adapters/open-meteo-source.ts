// Real ForecastSource adapter (adr-openmeteo-vs-raw-grib2.md): Open-Meteo
// Marine + Weather APIs behind the ForecastSourcePort. This is the narrow
// slice needed to CAPTURE genuine provider numbers for a one-time snapshot
// (see src/pipeline/capture-cli.ts) — it is not the hourly production Lambda
// adapter described in 04-ingest-pipeline.md (no startup probes, no
// change-detection probe against a prior cycle, no retry budget). Those are
// the ingest lane's to build; this adapter's cycle attribution uses only the
// documented candidate-cycle rule (04-ingest-pipeline.md §5 step 1-2), which
// is honest for a first, standalone capture where no prior cycle exists to
// compare against.
//
// Tide: no per-spot tide station reference exists in the spot seed schema
// yet (04-ingest-pipeline.md §11, "DELIVER BLOCKER"). Reusing one station's
// curve for spots hundreds of km away would misattribute a real number to
// the wrong place — worse than an honest absence. fetchTide reports 'dark'
// so scoring's null-tide branch (sTide, confidence capped at 0.7) runs
// honestly instead.

import type { Clock, ForecastSource, MemberSeries, ReceivedSourcePayload, SourceResult, TideHour, WindHour } from '../ports';
import type { SpotCoordinate } from './spot-coordinates';

const WAVE_MODELS = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
type WaveModel = (typeof WAVE_MODELS)[number];

const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Cycle schedule + conservative availability latency, from the source-by-source
 * table in 04-ingest-pipeline.md §2 and the unsure-items' stated defaults
 * (§12 items 2-3: GFS ~3.5-5h measured, MFWAM/GWAM default 6h until measured). */
const CYCLE_REGISTRY: Readonly<Record<WaveModel, { readonly cycleHoursUtc: readonly number[]; readonly latencyHours: number }>> = {
  ncep_gfswave016: { cycleHoursUtc: [0, 6, 12, 18], latencyHours: 5 },
  ncep_gfswave025: { cycleHoursUtc: [0, 6, 12, 18], latencyHours: 5 },
  meteofrance_wave: { cycleHoursUtc: [0, 12], latencyHours: 6 },
  dwd_gwam: { cycleHoursUtc: [0, 12], latencyHours: 6 },
};

type HourlyPayload = { readonly time: readonly string[] } & Readonly<Record<string, readonly (number | null)[]>>;

export class OpenMeteoForecastSource implements ForecastSource {
  constructor(
    private readonly spotsById: ReadonlyMap<string, SpotCoordinate>,
    private readonly clock: Clock,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly forecastDays = 2,
  ) {}

  async fetchWavePayload(spot_id: string): Promise<ReceivedSourcePayload> {
    const spot = this.requireSpot(spot_id);
    return this.get(marineUrl(spot, this.forecastDays));
  }

  parseWaveMembers(verbatim: string): SourceResult<MemberSeries[]> {
    try {
      return { ok: true, data: parseMarineResponse(JSON.parse(verbatim) as unknown, this.clock.now()) };
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }

  async fetchWindPayload(spot_id: string): Promise<ReceivedSourcePayload> {
    const spot = this.requireSpot(spot_id);
    return this.get(windUrl(spot, this.forecastDays));
  }

  parseWind(verbatim: string): SourceResult<WindHour[]> {
    try {
      return { ok: true, data: parseWindResponse(JSON.parse(verbatim) as unknown) };
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }

  fetchTidePayload(_spot_id: string): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }

  parseTide(_verbatim: string): SourceResult<TideHour[]> {
    return { ok: false, reason: 'dark' };
  }

  private async get(url: string): Promise<ReceivedSourcePayload> {
    try {
      const response = await this.fetchImpl(url);
      if (!response.ok) return { ok: false, reason: 'error' };
      return { ok: true, verbatim: await response.text() };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  private requireSpot(spot_id: string): SpotCoordinate {
    const spot = this.spotsById.get(spot_id);
    if (spot === undefined) {
      throw new Error(`OpenMeteoForecastSource: no coordinate registered for ${spot_id}`);
    }
    return spot;
  }
}

export function parseMarineResponse(payload: unknown, capturedAt: Date): MemberSeries[] {
  const hourly = requireHourly(payload);
  const times = hourly.time;
  return WAVE_MODELS.flatMap((model): MemberSeries[] => {
    const heights = hourly[`swell_wave_height_${model}`];
    const periods = hourly[`swell_wave_period_${model}`];
    const directions = hourly[`swell_wave_direction_${model}`];
    if (heights === undefined || periods === undefined || directions === undefined) return [];

    const hours = times.flatMap((time, index) => {
      const h_m = heights[index];
      const t_s = periods[index];
      const dir_deg = directions[index];
      if (h_m === undefined || h_m === null || t_s === undefined || t_s === null || dir_deg === undefined || dir_deg === null) {
        return [];
      }
      return [{
        valid_ts: `${time}Z`,
        swell: { h_m, t_s, dir_deg },
        swell2: null,
        land_masked: h_m === 0 && t_s === 0 && dir_deg === 0,
      }];
    });
    if (hours.length === 0) return [];

    const registry = CYCLE_REGISTRY[model];
    return [{ source: model, run_ts: candidateCycleIso(capturedAt, registry.cycleHoursUtc, registry.latencyHours), hours }];
  });
}

export function parseWindResponse(payload: unknown): WindHour[] {
  const hourly = requireHourly(payload);
  const speeds = hourly.wind_speed_10m;
  const directions = hourly.wind_direction_10m;
  if (speeds === undefined || directions === undefined) {
    throw new Error('open-meteo weather response is missing wind_speed_10m or wind_direction_10m');
  }
  return hourly.time.map((time, index): WindHour => {
    const speed_kt = speeds[index];
    const dir_deg = directions[index];
    return {
      valid_ts: `${time}Z`,
      wind: speed_kt === undefined || speed_kt === null || dir_deg === undefined || dir_deg === null
        ? null
        : { speed_kt, dir_deg },
    };
  });
}

function requireHourly(payload: unknown): HourlyPayload {
  if (typeof payload !== 'object' || payload === null || !('hourly' in payload)) {
    throw new Error('open-meteo response is missing an hourly block');
  }
  const hourly = (payload as { hourly: unknown }).hourly;
  if (typeof hourly !== 'object' || hourly === null || !Array.isArray((hourly as { time?: unknown }).time)) {
    throw new Error('open-meteo response hourly block is missing a time array');
  }
  return hourly as HourlyPayload;
}

/** 04-ingest-pipeline.md §5 step 1-2: latest cycle where now >= cycle + latency. */
function candidateCycleIso(now: Date, cycleHoursUtc: readonly number[], latencyHours: number): string {
  let best: number | null = null;
  for (let daysAgo = 0; daysAgo <= 3; daysAgo += 1) {
    for (const hour of cycleHoursUtc) {
      const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hour, 0, 0);
      if (now.getTime() >= candidate + latencyHours * 3_600_000 && (best === null || candidate > best)) {
        best = candidate;
      }
    }
  }
  if (best === null) {
    throw new Error('no eligible model cycle found within the 3-day lookback window');
  }
  return `${new Date(best).toISOString().slice(0, 16)}Z`;
}

function marineUrl(spot: SpotCoordinate, forecastDays: number): string {
  const params = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lon),
    hourly: 'swell_wave_height,swell_wave_period,swell_wave_direction',
    models: WAVE_MODELS.join(','),
    timezone: 'UTC',
    forecast_days: String(forecastDays),
  });
  return `${MARINE_ENDPOINT}?${params.toString()}`;
}

function windUrl(spot: SpotCoordinate, forecastDays: number): string {
  const params = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lon),
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
    timezone: 'UTC',
    forecast_days: String(forecastDays),
  });
  return `${WEATHER_ENDPOINT}?${params.toString()}`;
}
