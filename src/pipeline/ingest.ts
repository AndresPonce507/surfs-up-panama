// The hourly fetch run. RED SCAFFOLD, created by DISTILL 2026-08-08.
//
// Contract: docs/product/architecture/04-ingest-pipeline.md section 3.
// The run's durable side effects, in order and the ONLY ones it performs:
//   1. PUT the verbatim payload to raw/<provider>/dt=<date>/<HH>/  (durable #1)
//   2. PUT one gzip JSONL file per (run_date, source, cycle, partition) to
//      predictions/v1/... with If-None-Match:*                      (durable #2)
// The snapshot happens before any scoring exists anywhere in the run, so no
// downstream failure, build bug or publish refusal can ever cost a snapshot.
// One row per member per valid hour, natural key
// (spot_id, source, run_ts, valid_ts), fields per domain-model section 5.1.

import { loadLaunchSpotSeeds } from '../data/launch-spots';
import type { IngestDeps, IngestOutcome, MemberSeries, TideHour, WindHour } from './ports';
import { rawArchiveRecord } from './raw-archive';

type PredictionRow = {
  spot_id: string;
  source: string;
  run_ts: string;
  valid_ts: string;
  lead_h: number;
  fetched_ts: string;
  swell_h_m: number;
  swell_t_s: number;
  swell_dir_deg: number;
  swell2_h_m: number | null;
  swell2_t_s: number | null;
  swell2_dir_deg: number | null;
  wind_speed_kt: number | null;
  wind_dir_deg: number | null;
  tide_m: number | null;
  tide_day_low_m: number | null;
  tide_day_high_m: number | null;
  land_masked: boolean;
};

export async function runIngestOnce(deps: IngestDeps): Promise<IngestOutcome> {
  const events: IngestOutcome['events'] = [];
  const recordsByKey = new Map<string, PredictionRow[]>();
  const spots = deps.spots ?? loadLaunchSpotSeeds(deps.launchData);
  for (const spot of spots) {
    const wavePayload = await deps.source.fetchWavePayload(spot.spot_id);
    const windPayload = await deps.source.fetchWindPayload(spot.spot_id);
    const tidePayload = await deps.source.fetchTidePayload(spot.spot_id);

    // The received bytes become durable evidence before any parser can
    // reject them. The key contains provider, spot and capture instant, so
    // captures made during one hour never overwrite each other.
    if (wavePayload.ok) await deps.store.putRaw(rawArchiveRecord('open-meteo-marine', spot.spot_id, deps.clock.now(), wavePayload.verbatim));
    if (windPayload.ok) await deps.store.putRaw(rawArchiveRecord('open-meteo-wind', spot.spot_id, deps.clock.now(), windPayload.verbatim));
    if (tidePayload.ok) await deps.store.putRaw(rawArchiveRecord('coops', spot.spot_id, deps.clock.now(), tidePayload.verbatim));

    if (!wavePayload.ok) {
      events.push({ type: 'wave_source_unavailable', detail: wavePayload.reason });
      continue;
    }
    const waves = deps.source.parseWaveMembers(wavePayload.verbatim);
    if (!waves.ok) {
      events.push({ type: 'wave_source_unavailable', detail: waves.reason });
      continue;
    }
    const wind = windPayload.ok ? deps.source.parseWind(windPayload.verbatim) : windPayload;
    const tide = tidePayload.ok ? deps.source.parseTide(tidePayload.verbatim) : tidePayload;

    for (const member of waves.data) {
      addMemberRows(recordsByKey, member, spot.spot_id, deps.clock.now(), wind.ok ? wind.data : [], tide.ok ? tide.data : []);
    }
  }
  for (const [key, rows] of recordsByKey) {
    const outcome = await deps.store.putPredictionIfAbsent(key, rows.map((row) => JSON.stringify(row)).join('\n'));
    events.push({ type: outcome === 'created' ? 'prediction_created' : 'prediction_duplicate', detail: key });
  }
  return { completed: true, events };
}

function addMemberRows(
  recordsByKey: Map<string, PredictionRow[]>,
  member: MemberSeries,
  spotId: string,
  fetchedAt: Date,
  wind: readonly WindHour[],
  tide: readonly TideHour[],
): void {
  const runDate = member.run_ts.slice(0, 10);
  const runHour = member.run_ts.slice(11, 13);
  const key = `predictions/v1/dt=${runDate}/src=${member.source}/cyc=${runHour}Z/all.jsonl.gz`;
  const rows = recordsByKey.get(key) ?? [];
  const tideValues = tide.flatMap((hour) => hour.tide_m === null ? [] : [hour.tide_m]);
  const tideDayLow = tideValues.length === 0 ? null : Math.min(...tideValues);
  const tideDayHigh = tideValues.length === 0 ? null : Math.max(...tideValues);
  for (const hour of member.hours) {
    const windAtHour = wind.find((candidate) => candidate.valid_ts === hour.valid_ts)?.wind ?? null;
    const tideAtHour = tide.find((candidate) => candidate.valid_ts === hour.valid_ts)?.tide_m ?? null;
    rows.push({
      spot_id: spotId,
      source: member.source,
      run_ts: member.run_ts,
      valid_ts: hour.valid_ts,
      lead_h: differenceInHours(hour.valid_ts, member.run_ts),
      fetched_ts: fetchedAt.toISOString(),
      swell_h_m: hour.swell.h_m,
      swell_t_s: hour.swell.t_s,
      swell_dir_deg: hour.swell.dir_deg,
      swell2_h_m: hour.swell2?.h_m ?? null,
      swell2_t_s: hour.swell2?.t_s ?? null,
      swell2_dir_deg: hour.swell2?.dir_deg ?? null,
      wind_speed_kt: windAtHour?.speed_kt ?? null,
      wind_dir_deg: windAtHour?.dir_deg ?? null,
      tide_m: tideAtHour,
      tide_day_low_m: tideDayLow,
      tide_day_high_m: tideDayHigh,
      land_masked: hour.land_masked,
    });
  }
  recordsByKey.set(key, rows);
}

function differenceInHours(validTimestamp: string, runTimestamp: string): number {
  return Math.round((Date.parse(validTimestamp) - Date.parse(runTimestamp)) / 3_600_000);
}
