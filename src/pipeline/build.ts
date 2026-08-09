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
import { sizeBands, type SizeBandToken } from '../data/size-bands';
import type {
  BundleDay,
  BundleDaySummary,
  RegionBundle,
} from '../publish/region-bundle';
import type {
  BestWindow,
  ConfLevel,
  SizeRangeM,
  WindState,
} from '../publish/static-surface';
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
  type Factor,
  type MemberRow,
  type ScoreResult,
  type SizeBandTable,
  type TideObs,
  type WindObs,
} from '../scoring/engine';

const DECLARED_MEMBER_SOURCES = [
  'ncep_gfswave016',
  'ncep_gfswave025',
  'meteofrance_wave',
  'dwd_gwam',
] as const;

// The classification intervals come from the one canonical vocabulary file
// (domain-model.md section 7.2), the same rows the capture form offers, so a
// published band and a reported band can never mean different waves.
const SIZE_BANDS: SizeBandTable = sizeBands.map(({ value, lo_m, hi_m }) => ({
  band: value,
  lo_m,
  hi_m,
}));

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

/**
 * One PublishedCall receipt row. `conf_value` (continuous) lives here and
 * ONLY here; the bundle publishes `conf_level`, so a display threshold can be
 * retuned later without rewriting what was actually shown
 * (domain-model.md sections 6 and 13).
 */
type CallRow = {
  spot_id: string;
  build_id: string;
  valid_ts: string;
  score_q: number;
  conf_value: number;
  conf_level: ConfLevel;
  sub: ScoreResult['sub'];
  h_eff_m: number;
  size_band: SizeBandToken;
  size_range_m: SizeRangeM;
  wind_state: WindState;
  best_window: BestWindow;
  bias_applied: number;
  bias_gate: string;
  members_used: number;
  members_null: number;
  missing: ('wind' | 'tide')[];
  weakest_link: Factor | null;
};

export async function runBuildOnce(deps: BuildDeps): Promise<BuildOutcome> {
  const now = deps.clock.now();
  const spots = deps.spots ?? loadLaunchSpotSeeds(deps.launchData);
  const date = regionalCivilDate(now, spots[0]?.timezone ?? 'America/Panama');
  const hour = now.toISOString().slice(11, 13);
  const dates = [date, followingCivilDate(date)] as const;
  const rows = await predictionRows(deps, dates);
  const calls = spots.flatMap((spot) => callsForSpot(spot, rows, dates, hour));
  if (calls.length === 0) return { published: false, reason: 'no usable wave members' };

  const build_id = `b_${date}T${hour}Z`;
  const callsKey = `log/calls/v1/dt=${date}/build=${hour}Z/${deps.region_id}.jsonl.gz`;
  const callsBody = calls.map((call) => JSON.stringify({ ...call, build_id })).join('\n');
  await deps.store.putCallIfAbsent(callsKey, callsBody);
  const rankedCallsByDay = dates.map((civilDate) => calls.filter((call) => call.valid_ts.startsWith(civilDate) && call.valid_ts.endsWith('T18:00Z')).sort((left, right) => right.score_q - left.score_q || left.spot_id.localeCompare(right.spot_id)));
  if (rankedCallsByDay.some((day) => day.length !== spots.length)) return { published: false, reason: 'missing complete today or tomorrow ranking' };
  if (sameRankedCalls(rankedCallsByDay[0]!, rankedCallsByDay[1]!)) return { published: false, reason: 'tomorrow ranking duplicates today' };
  const rankedCalls = rankedCallsByDay[0]!;
  const publishedAt = now.toISOString();
  const days: readonly [BundleDay, BundleDay] = [
    bundleDay(dates[0], rankedCallsByDay[0] ?? []),
    bundleDay(dates[1], rankedCallsByDay[1] ?? []),
  ];
  const bundle: RegionBundle = {
    schema: 'region-bundle/1',
    region_id: deps.region_id,
    build_id,
    published_at: publishedAt,
    days,
    // Day-independent identity, held once. An object has no order, so it can
    // never encode a ranking that disagrees with either day array.
    spot_detail: Object.fromEntries(spots.map((spot) => [spot.spot_id, { name: spot.name }])),
    publish_surface: {
      schema: 'published-surface-update/v1' as const,
      surf_date: date,
      published_at: publishedAt,
      build_kind: hour === '11' ? 'dawn' as const : 'hourly' as const,
      calls: rankedCalls.map(surfaceCall),
      days: [
        { date: dates[0], spots: (rankedCallsByDay[0] ?? []).map(surfaceCall) },
        { date: dates[1], spots: (rankedCallsByDay[1] ?? []).map(surfaceCall) },
      ],
    },
  };
  await deps.store.putBundle(`pub/v1/regions/${deps.region_id}/bundle.json`, JSON.stringify(bundle));
  await deps.store.putManifest('pub/v1/manifest.json', JSON.stringify({ build_id }));
  return { published: true, build_id };
}

async function predictionRows(deps: BuildDeps, dates: readonly string[]): Promise<PredictionRow[]> {
  const keys = (await Promise.all(dates.map((date) => deps.store.listPredictions(`predictions/v1/dt=${date}/`)))).flat();
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

function callsForSpot(spot: NonNullable<BuildDeps['spots']>[number], rows: PredictionRow[], dates: readonly string[], hour: string): CallRow[] {
  const validHours = [...new Set(rows.filter((row) => row.spot_id === spot.spot_id).map((row) => row.valid_ts))].sort();
  const correction = applyCorrection(spot, null);
  return validHours.flatMap((validTs) => {
    if (!dates.some((date) => validTs.startsWith(date))) return [];
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
    // SIZE_BANDS is derived from the one canonical vocabulary whose tokens ARE
    // the v1 enum, so classification can only land on one of them.
    const band = sizeBand(effectiveHeight, SIZE_BANDS) as SizeBandToken;
    return [{
      spot_id: spot.spot_id,
      build_id: `b_${dates[0]}T${hour}Z`,
      valid_ts: validTs,
      score_q: score.score,
      conf_value: confidenceResult.c_total,
      conf_level: confidenceResult.level,
      sub: score.sub,
      h_eff_m: effectiveHeight,
      size_band: band,
      size_range_m: sizeRange(band),
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

function bundleDay(date: string, calls: readonly CallRow[]): BundleDay {
  return { date, spots: calls.map(daySummary) };
}

/** Every field is that day's own value; nothing here is shared with the other day. */
function daySummary(call: CallRow): BundleDaySummary {
  return {
    spot_id: call.spot_id,
    score_q: call.score_q,
    conf_level: call.conf_level,
    call: { es: spanishCall(call) },
    size_band: call.size_band,
    size_range_m: call.size_range_m,
    wind_state: call.wind_state,
    best_window: call.best_window,
    weakest_link: call.weakest_link,
  };
}

function surfaceCall(call: CallRow) {
  return {
    spot_id: call.spot_id,
    score_q: call.score_q,
    call_es: spanishCall(call),
    conf_level: call.conf_level,
    size_band: call.size_band,
    size_range_m: call.size_range_m,
    wind_state: call.wind_state,
    best_window: call.best_window,
  };
}

function spanishCall(call: CallRow): string {
  return `${spanishSizeBand(call.size_band)}, viento ${spanishWind(call.wind_state)}, mejor de ${call.best_window.start} a ${call.best_window.end}.`;
}

function followingCivilDate(civilDate: string): string { const date = new Date(`${civilDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function regionalCivilDate(instant: Date, timezone: string): string { const fields = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant); const part = (type: Intl.DateTimeFormatPartTypes) => fields.find((field) => field.type === type)?.value ?? ''; return `${part('year')}-${part('month')}-${part('day')}`; }
function sameRankedCalls(left: readonly CallRow[], right: readonly CallRow[]): boolean { return left.length === right.length && left.every((call, index) => { const other = right[index]; return other !== undefined && call.spot_id === other.spot_id && call.score_q === other.score_q && call.size_band === other.size_band && call.wind_state === other.wind_state && call.best_window.start === other.best_window.start && call.best_window.end === other.best_window.end; }); }

function sizeRange(sizeBand: string): SizeRangeM {
  const band = SIZE_BANDS.find((candidate) => candidate.band === sizeBand);
  // Never publish a negative metre: the flat band's lower edge is a
  // classification sentinel that opens just below zero, not a wave height.
  const lo_m = Math.max(0, band?.lo_m ?? 0);
  if (band === undefined || !Number.isFinite(band.hi_m)) {
    // The display range remains finite even for the open-ended final band.
    // The categorical band is still the primary claim, and the display format
    // reads that band as "2.4 m o más" rather than claiming this ceiling.
    return [lo_m, 3];
  }
  return [lo_m, band.hi_m];
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
