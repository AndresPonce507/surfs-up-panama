// The hourly build run. RED SCAFFOLD, created by DISTILL 2026-08-08.
//
// Contract: 04-ingest-pipeline.md section 3 steps 9-11 plus section 6.
// Reads the newest usable snapshot per (spot, source) with run_ts <= build
// time (domain-model section 6), seeds, current/ corrections. Scores through
// the pure core (src/scoring). Writes, in this order:
//   log/calls/v1/dt=<date>/build=<HH>Z/<region>...  (the PublishedCall log)
//   pub/v1/regions/<region>/bundle.json             (builder render input)
//   pub/v1/manifest.json LAST                       (the commit marker)
// Partial-failure rule (04 section 6): a spot publishes with >= 1 usable wave
// member; zero usable members across every spot means REFUSE to publish: the
// previous artifacts keep serving and the manifest stamp does not advance.
// The build never fetches; the log is the only contract with the fetch run.

import type { BuildDeps, BuildOutcome } from './ports';
import { confidence } from '../scoring/confidence';
import { loadLaunchSpotSeeds } from '../data/launch-spots';
import {
  applyCorrection,
  blend,
  combine,
  hEff,
  sDir,
  sizeBand,
  sSize,
  sTide,
  sWind,
  type DeclaredMember,
  type MemberRow,
  type ScoreResult,
  type TideObs,
  type WindObs,
} from '../scoring/engine';

const DECLARED_MEMBER_SOURCES = [
  'ncep_gfswave016',
  'ncep_gfswave025',
  'meteofrance_wave',
  'dwd_gwam',
] as const;

const SIZE_BANDS = [
  { band: 'flat', lo_m: -Number.EPSILON, hi_m: 0.1 },
  { band: 'ankle_knee', lo_m: 0.1, hi_m: 0.4 },
  { band: 'knee_waist', lo_m: 0.4, hi_m: 0.7 },
  { band: 'waist_chest', lo_m: 0.7, hi_m: 1.1 },
  { band: 'chest_head', lo_m: 1.1, hi_m: 1.6 },
  { band: 'head_overhead', lo_m: 1.6, hi_m: 2.4 },
  { band: 'double_overhead_plus', lo_m: 2.4, hi_m: Number.POSITIVE_INFINITY },
] as const;

type PredictionRow = {
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

type CallRow = {
  spot_id: string;
  build_id: string;
  valid_ts: string;
  score_q: number;
  conf_value: number;
  conf_level: string;
  sub: ScoreResult['sub'];
  h_eff_m: number;
  size_band: string;
  size_range_m: readonly [number, number];
  wind_state: 'clean' | 'choppy' | 'blown_out';
  best_window: { readonly start: string; readonly end: string };
  bias_applied: number;
  bias_gate: string;
  members_used: number;
  members_null: number;
  missing: ('wind' | 'tide')[];
  weakest_link: string | null;
};

export async function runBuildOnce(deps: BuildDeps): Promise<BuildOutcome> {
  const now = deps.clock.now();
  const date = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(11, 13);
  const rows = await predictionRows(deps, date);
  const spots = deps.spots ?? loadLaunchSpotSeeds(deps.launchData);
  const calls = spots.flatMap((spot) => callsForSpot(spot, rows, date, hour));
  if (calls.length === 0) return { published: false, reason: 'no usable wave members' };

  const build_id = `b_${date}T${hour}Z`;
  const callsKey = `log/calls/v1/dt=${date}/build=${hour}Z/${deps.region_id}.jsonl.gz`;
  const callsBody = calls.map((call) => JSON.stringify({ ...call, build_id })).join('\n');
  await deps.store.putCallIfAbsent(callsKey, callsBody);
  const rankedCalls = calls
    .filter((call) => call.valid_ts.endsWith('T18:00Z'))
    .sort((left, right) => right.score_q - left.score_q || left.spot_id.localeCompare(right.spot_id));
  const bundle = {
    publish_surface: {
      schema: 'published-surface-update/v1' as const,
      surf_date: date,
      published_at: now.toISOString(),
      build_kind: hour === '11' ? 'dawn' as const : 'hourly' as const,
      calls: rankedCalls.map((call) => ({
        spot_id: call.spot_id,
        score_q: call.score_q,
        call_es: spanishCall(call),
        size_band: call.size_band,
        size_range_m: call.size_range_m,
        wind_state: call.wind_state,
        best_window: call.best_window,
      })),
    },
    days: [{
      date,
      spots: rankedCalls.map((call) => ({
        spot_id: call.spot_id,
        score_q: call.score_q,
        weakest_link: call.weakest_link,
        call: { es: spanishCall(call) },
      })),
    }],
  };
  await deps.store.putBundle(`pub/v1/regions/${deps.region_id}/bundle.json`, JSON.stringify(bundle));
  await deps.store.putManifest('pub/v1/manifest.json', JSON.stringify({ build_id }));
  return { published: true, build_id };
}

async function predictionRows(deps: BuildDeps, date: string): Promise<PredictionRow[]> {
  const keys = await deps.store.listPredictions(`predictions/v1/dt=${date}/`);
  const rows: PredictionRow[] = [];
  for (const key of keys) {
    const body = await deps.store.getPrediction(key);
    if (body === null) continue;
    for (const line of body.split('\n')) {
      if (line !== '') rows.push(JSON.parse(line) as PredictionRow);
    }
  }
  return rows;
}

function callsForSpot(spot: NonNullable<BuildDeps['spots']>[number], rows: PredictionRow[], date: string, hour: string): CallRow[] {
  const validHours = [...new Set(rows.filter((row) => row.spot_id === spot.spot_id).map((row) => row.valid_ts))].sort();
  const correction = applyCorrection(spot, null);
  return validHours.flatMap((validTs) => {
    if (!validTs.startsWith(date)) return [];
    const bySource = new Map(rows.filter((row) => row.spot_id === spot.spot_id && row.valid_ts === validTs).map((row) => [row.source, row]));
    const declared = DECLARED_MEMBER_SOURCES.map((source): DeclaredMember => {
      const row = bySource.get(source);
      if (row === undefined || row.land_masked) return { source, exclusion: row?.land_masked ? 'land_masked' : 'unavailable' };
      return {
        source,
        lead_h: row.lead_h,
        swell: {
          h_m: row.swell_h_m - correction.memberHBias(source, row.lead_h),
          t_s: row.swell_t_s,
          dir_deg: row.swell_dir_deg,
        },
        swell2: null,
      };
    });
    const blended = blend(declared);
    if (blended.kind === 'no_usable_members') return [];
    const representative = [...bySource.values()].find((row) => !row.land_masked);
    if (representative === undefined) return [];
    const wind: WindObs | null = representative.wind_speed_kt === null || representative.wind_dir_deg === null
      ? null
      : { speed_kt: representative.wind_speed_kt, dir_deg: representative.wind_dir_deg };
    const tide: TideObs | null = representative.tide_m === null || representative.tide_day_low_m === null || representative.tide_day_high_m === null
      ? null
      : { height_m: representative.tide_m, day_low_m: representative.tide_day_low_m, day_high_m: representative.tide_day_high_m };
    const effectiveHeight = hEff(blended.swell.h_m, blended.swell.t_s);
    const score = combine({
      dir: sDir(blended.swell.dir_deg, correction.params),
      size: sSize(effectiveHeight, correction.params),
      wind: sWind(wind, correction.params),
      tide: sTide(tide, correction.params),
    }, correction.params, correction.delta_q);
    const members = declared.filter((member): member is MemberRow => !('exclusion' in member));
    const confidenceResult = confidence(members, { kind: 'absolute' }, null, null, score.missing);
    return [{
      spot_id: spot.spot_id,
      build_id: `b_${date}T${hour}Z`,
      valid_ts: validTs,
      score_q: score.score,
      conf_value: confidenceResult.c_total,
      conf_level: confidenceResult.level,
      sub: score.sub,
      h_eff_m: effectiveHeight,
      size_band: sizeBand(effectiveHeight, SIZE_BANDS),
      size_range_m: sizeRange(sizeBand(effectiveHeight, SIZE_BANDS)),
      wind_state: windState(score.sub.wind),
      best_window: bestWindow(validTs, spot.timezone),
      bias_applied: correction.delta_q,
      bias_gate: correction.gate,
      members_used: blended.members_used,
      members_null: blended.members_null,
      missing: score.missing,
      weakest_link: score.weakest_link,
    }];
  });
}

function spanishCall(call: CallRow): string {
  return `${spanishSizeBand(call.size_band)}, viento ${spanishWind(call.wind_state)}, mejor de ${call.best_window.start} a ${call.best_window.end}.`;
}

function sizeRange(sizeBand: string): readonly [number, number] {
  const band = SIZE_BANDS.find((candidate) => candidate.band === sizeBand);
  if (band === undefined || !Number.isFinite(band.hi_m)) {
    // The display range remains finite even for the open-ended final band.
    // The categorical band is still the primary claim.
    return [band?.lo_m ?? 0, 3];
  }
  return [band.lo_m, band.hi_m];
}

function windState(score: number | null): 'clean' | 'choppy' | 'blown_out' {
  if (score === null || score >= 0.75) return 'clean';
  if (score >= 0.35) return 'choppy';
  return 'blown_out';
}

function bestWindow(validTs: string, timezone: string): { readonly start: string; readonly end: string } {
  const start = new Date(validTs);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const format = (instant: Date): string => new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return { start: format(start), end: format(end) };
}

function spanishWind(windState: CallRow['wind_state']): string {
  return ({ clean: 'limpio', choppy: 'picado', blown_out: 'destrozado' })[windState];
}

function spanishSizeBand(sizeBand: string): string {
  const labels: Readonly<Record<string, string>> = {
    flat: 'Plano',
    ankle_knee: 'Tobillo a rodilla',
    knee_waist: 'Rodilla a cintura',
    waist_chest: 'Cintura a pecho',
    chest_head: 'Pecho a cabeza',
    head_overhead: 'Cabeza a un metro más',
    double_overhead_plus: 'Doble o más',
  };
  return labels[sizeBand] ?? 'Condiciones variables';
}
