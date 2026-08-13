// The hourly fetch run. RED SCAFFOLD, created by DISTILL 2026-08-08.
//
// Contract: docs/product/architecture/04-ingest-pipeline.md section 3.
// The run's durable side effects, in order and the ONLY ones it performs:
//   1. PUT the verbatim payload to raw/<provider>/dt=<date>/<HH>/spot=<spot>/run=<capture>.json.gz
//      as actual gzip bytes                                                   (durable #1)
//   2. PUT one gzip JSONL file per (run_date, source, cycle, partition) to
//      predictions/v1/... with If-None-Match:*                      (durable #2)
//      The partition names the forecast WINDOW the cycle had published when
//      this fetch saw it, so a window that rolls forward under an unchanged
//      cycle files its new hours instead of colliding with them. See
//      `predictionKey` below and adr-prediction-log-format.md decision 6.
// The snapshot happens before any scoring exists anywhere in the run, so no
// downstream failure, build bug or publish refusal can ever cost a snapshot.
// One row per member per valid hour, natural key
// (spot_id, source, run_ts, valid_ts), fields per domain-model section 5.1.

import { loadLaunchSpotSeeds } from '../data/launch-spots';
import { createHash, randomUUID } from 'node:crypto';
import type { IngestDeps, IngestOutcome, IngestStore, MemberHour, MemberSeries, TideHour, WindHour } from './ports';
import { rawArchiveRecord } from './raw-archive';

const PREDICTION_PREFIX = 'predictions/v1/';

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
  if (deps.startup_probe !== undefined) {
    try {
      await deps.startup_probe();
    } catch (error) {
      return { completed: false, events: [{ type: 'health.startup.refused', detail: message(error) }] };
    }
  }
  const recordsByKey = new Map<string, PredictionRow[]>();
  const executionId = deps.execution_id ?? randomUUID();
  const spots = deps.spots ?? loadLaunchSpotSeeds(deps.launchData);
  // One snapshot of the archive, read before the loop. Every prediction write
  // this run makes happens after the loop, so a single up-front read sees
  // exactly what a per-member read would have seen, at a fraction of the IO.
  const archive = await loadArchive(deps.store);
  for (const spot of spots) {
    const wavePayload = await deps.source.fetchWavePayload(spot.spot_id);
    const waveArchive = wavePayload.ok
      ? rawArchiveRecord('open-meteo-marine', spot.spot_id, deps.clock.now(), executionId, wavePayload.verbatim)
      : null;
    const windPayload = await deps.source.fetchWindPayload(spot.spot_id);
    const windArchive = windPayload.ok
      ? rawArchiveRecord('open-meteo-wind', spot.spot_id, deps.clock.now(), executionId, windPayload.verbatim)
      : null;
    const tidePayload = await deps.source.fetchTidePayload(spot.spot_id);
    const tideArchive = tidePayload.ok
      ? rawArchiveRecord('coops', spot.spot_id, deps.clock.now(), executionId, tidePayload.verbatim)
      : null;

    // Every successful HTTP response becomes forensic evidence before any
    // provider parser or validator can reject it. Keep all three raw bodies
    // when (for example) the wave payload is malformed so replay has the
    // full per-spot capture context.
    if (waveArchive !== null) await deps.store.putRawIfAbsent(waveArchive);
    if (windArchive !== null) await deps.store.putRawIfAbsent(windArchive);
    if (tideArchive !== null) await deps.store.putRawIfAbsent(tideArchive);

    if (!wavePayload.ok) {
      events.push({ type: 'wave_source_unavailable', detail: wavePayload.reason });
      continue;
    }
    const waves = deps.source.parseWaveMembers(wavePayload.verbatim);
    if (!waves.ok) {
      events.push({ type: 'wave_source_unavailable', detail: waves.reason });
      continue;
    }

    if (!cyclesChangedSinceFrozen(waves.data, deps.clock.now())) {
      events.push({ type: 'wave_source_unavailable', detail: 'cycle-frozen' });
      events.push({ type: 'health.provider.cycle_frozen', detail: 'older-than-24-hours' });
      continue;
    }

    let wind: readonly WindHour[] = [];
    if (windPayload.ok) {
      const parsedWind = deps.source.parseWind(windPayload.verbatim);
      if (parsedWind.ok) wind = parsedWind.data;
      else events.push({ type: 'wind_source_unavailable', detail: parsedWind.reason });
    } else {
      events.push({ type: 'wind_source_unavailable', detail: windPayload.reason });
    }
    let tide: readonly TideHour[] = [];
    if (tidePayload.ok) {
      const parsedTide = deps.source.parseTide(tidePayload.verbatim);
      if (parsedTide.ok) tide = parsedTide.data;
      else if (parsedTide.reason !== 'dark') events.push({ type: 'tide_source_unavailable', detail: parsedTide.reason });
    }

    for (const member of waves.data) {
      const attribution = retainPriorAttribution(archive, spot.spot_id, member);
      // An exact series has already been durably captured under its original
      // provider attribution. Do not merely rely on conditional PUT here:
      // avoiding the attempted write is what makes an unchanged provider
      // cycle idempotent even when the source gives it a new run timestamp.
      if (attribution.unchanged) {
        events.push({ type: 'cycle_unchanged', detail: `${spot.spot_id}/${attribution.member.source}` });
      } else {
        addMemberRows(recordsByKey, attribution.member, spot.spot_id, deps.clock.now(), wind, tide);
      }
    }
  }
  const archivedForecasts = forecastsByNaturalKey(archive);
  for (const [key, rows] of recordsByKey) {
    // The archive is insert-only at the RECORD grain, not merely at the object
    // grain. Conditional PUT alone used to carry that guarantee, because one
    // cycle could only ever address one object; now that a widened window
    // addresses its own object, a restated hour could otherwise be filed
    // beside the hour it contradicts. It is refused here instead.
    const contradicted = rows.find((row) => {
      const archived = archivedForecasts.get(naturalKey(row));
      return archived !== undefined && archived !== forecastStated(row);
    });
    if (contradicted !== undefined) {
      events.push({ type: 'prediction_rewrite_refused', detail: `${key} ${naturalKey(contradicted)}` });
      events.push({ type: ARCHIVE_REWRITE_REFUSED_EVENT, detail: naturalKey(contradicted) });
      continue;
    }
    const outcome = await deps.store.putPredictionIfAbsent(key, rows.map((row) => JSON.stringify(row)).join('\n'));
    events.push({ type: outcome === 'created' ? 'prediction_created' : 'prediction_duplicate', detail: key });
  }
  return { completed: true, events };
}

/** Health event for a refused rewrite. Informational: no metric filter watches it. */
const ARCHIVE_REWRITE_REFUSED_EVENT = 'health.archive.rewrite_refused';

type ArchivedObject = { readonly key: string; readonly rows: readonly PredictionRow[] };

/**
 * Every prediction receipt already on the substrate, read once. `null` when
 * the store offers no read seam: both the attribution retention and the
 * rewrite refusal below are then inert, and immutability rests on conditional
 * PUT alone, which is exactly the guarantee this path always had.
 */
async function loadArchive(store: IngestStore): Promise<readonly ArchivedObject[] | null> {
  if (store.listPredictions === undefined || store.getPrediction === undefined) return null;
  const keys = await store.listPredictions(PREDICTION_PREFIX);
  const objects: ArchivedObject[] = [];
  for (const key of keys) {
    const body = await store.getPrediction(key);
    if (body === null) continue;
    objects.push({ key, rows: body.split('\n').filter(Boolean).map((line) => JSON.parse(line) as PredictionRow) });
  }
  return objects;
}

/** The record natural key of the log (adr-prediction-log-format.md decision 4). */
function naturalKey(row: PredictionRow): string {
  return `${row.spot_id}|${row.source}|${row.run_ts}|${row.valid_ts}`;
}

/**
 * What the natural key actually identifies: one wave model's cycle predicting
 * one hour. That, and only that, may never change once archived.
 *
 * Deliberately excluded, because they are not the keyed prediction and DO
 * legitimately move between two looks at the same cycle -- treating them as
 * history would refuse every genuine rollforward and restore the very defect
 * this guard was added alongside:
 *   - `fetched_ts`, audit/debug metadata only (domain-model.md section 5.1);
 *   - `wind_*`, `tide_*`, contemporaneous joins from providers running their
 *     own cycles, carried on the row for replay convenience and keyed by
 *     nothing in this row's natural key.
 */
function forecastStated(row: PredictionRow): string {
  return JSON.stringify([
    row.lead_h,
    row.swell_h_m, row.swell_t_s, row.swell_dir_deg,
    row.swell2_h_m, row.swell2_t_s, row.swell2_dir_deg,
    row.land_masked,
  ]);
}

function forecastsByNaturalKey(archive: readonly ArchivedObject[] | null): ReadonlyMap<string, string> {
  const stated = new Map<string, string>();
  if (archive === null) return stated;
  for (const object of archive) {
    for (const row of object.rows) {
      if (!stated.has(naturalKey(row))) stated.set(naturalKey(row), forecastStated(row));
    }
  }
  return stated;
}

function retainPriorAttribution(
  archive: readonly ArchivedObject[] | null,
  spotId: string,
  member: MemberSeries,
): { member: MemberSeries; unchanged: boolean } {
  if (archive === null) return { member, unchanged: false };
  const canonical = JSON.stringify(member.hours.map((hour) => [hour.valid_ts, hour.swell.h_m, hour.swell.t_s, hour.swell.dir_deg, hour.swell2, hour.land_masked]));
  for (const object of archive) {
    if (!object.key.includes(`/src=${member.source}/`)) continue;
    const rows = object.rows
      .filter((row) => row.spot_id === spotId && row.source === member.source)
      .sort((left, right) => left.valid_ts.localeCompare(right.valid_ts));
    const prior = JSON.stringify(rows.map((row) => [row.valid_ts, row.swell_h_m, row.swell_t_s, row.swell_dir_deg, row.swell2_h_m === null ? null : { h_m: row.swell2_h_m, t_s: row.swell2_t_s, dir_deg: row.swell2_dir_deg }, row.land_masked]));
    if (rows.length === member.hours.length && prior === canonical) {
      return { member: { ...member, run_ts: rows[0]!.run_ts }, unchanged: true };
    }
  }
  return { member, unchanged: false };
}

function cyclesChangedSinceFrozen(members: readonly MemberSeries[], now: Date): boolean {
  // Open-Meteo omits an observed run identifier. Its attributed cycles must
  // still advance within 24 hours or we refuse a frozen provider response.
  return members.every((member) => {
    const run = Date.parse(member.run_ts);
    return Number.isFinite(run) && run <= now.getTime() && run >= now.getTime() - 24 * 3_600_000;
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addMemberRows(
  recordsByKey: Map<string, PredictionRow[]>,
  member: MemberSeries,
  spotId: string,
  fetchedAt: Date,
  wind: readonly WindHour[],
  tide: readonly TideHour[],
): void {
  const key = predictionKey(member);
  const rows = recordsByKey.get(key) ?? [];
  const tideValues = tide.flatMap((hour) => hour.tide_m === null ? [] : [hour.tide_m]);
  const tideDayLow = tideValues.length === 0 ? null : Math.min(...tideValues);
  const tideDayHigh = tideValues.length === 0 ? null : Math.max(...tideValues);
  for (const hour of canonicalHours(member.hours)) {
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

/**
 * The object a member series belongs in: its run partition, then the forecast
 * window that run had published by the time this fetch saw it.
 *
 * The run alone was not enough. The provider asks for whole forecast DAYS in
 * UTC (`forecast_days`, open-meteo-source.ts), so the window advances at UTC
 * midnight while the attributed cycle holds until the next 6-hourly cycle
 * clears its latency. Between those instants the same cycle emits hours it had
 * never emitted before. Addressed by run alone they hashed onto the first
 * fetch's key, the conditional PUT answered already-exists, and a whole
 * forecast day was silently discarded -- the outage of 2026-08-13.
 *
 * The window id hashes the exact set of hours covered and NOTHING ELSE. Two
 * consequences, both deliberate:
 *   - the name is a pure function of (cycle, window), so repeating a fetch
 *     verbatim can only land on the same object, and the conditional PUT keeps
 *     its meaning: first write wins, bytes never move;
 *   - a cycle that restates the SAME hours with DIFFERENT numbers collides
 *     rather than diverging, so it can never sneak past write-once under a
 *     fresh name. Hashing the values instead would invert exactly that.
 *
 * Layout depth is unchanged. The window rides in the `<partition>` slot the
 * key template already ends with (domain-model.md section 5.2), because the
 * archive already holds `all.jsonl.gz` objects that are immutable forever: a
 * new path SEGMENT would have split the log across two depths permanently and
 * broken every fixed-depth glob and hive-partitioned read over it.
 */
function predictionKey(member: MemberSeries): string {
  const runDate = member.run_ts.slice(0, 10);
  const runHour = member.run_ts.slice(11, 13);
  return `${PREDICTION_PREFIX}dt=${runDate}/src=${member.source}/cyc=${runHour}Z/all-window-${windowId(member.hours)}.jsonl.gz`;
}

function windowId(hours: readonly MemberHour[]): string {
  const covered = canonicalHours(hours).map((hour) => hour.valid_ts).join(',');
  return createHash('sha256').update(covered).digest('hex').slice(0, 16);
}

/**
 * The hour list an object is written from: ascending, one entry per valid_ts.
 *
 * Both the object's NAME and its BYTES are taken from this, so the name is a
 * pure function of the covered hours and the bytes are a pure function of the
 * fetch -- which is what lets conditional PUT stay meaningful. Hashing a
 * canonical list while writing the raw one would let two payloads differing
 * only in hour order share a key and disagree on content, and the loser's
 * bytes would be dropped: the same class of silent loss this whole change
 * exists to end. Open-Meteo already emits ascending unique hours, so in
 * practice this reorders nothing; it is here so the guarantee does not depend
 * on that.
 *
 * A repeated valid_ts keeps its first entry, deterministically.
 */
function canonicalHours(hours: readonly MemberHour[]): readonly MemberHour[] {
  const byValidTs = new Map<string, MemberHour>();
  for (const hour of hours) {
    if (!byValidTs.has(hour.valid_ts)) byValidTs.set(hour.valid_ts, hour);
  }
  return [...byValidTs.values()].sort((left, right) => left.valid_ts.localeCompare(right.valid_ts));
}

function differenceInHours(validTimestamp: string, runTimestamp: string): number {
  return Math.round((Date.parse(validTimestamp) - Date.parse(runTimestamp)) / 3_600_000);
}
