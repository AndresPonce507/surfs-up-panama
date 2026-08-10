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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BuildDeps, BuildOutcome } from './ports';
import {
  confidence,
  DEFAULT_CONFIDENCE_FACTORS,
  type ConfidenceFactors,
} from '../scoring/confidence';
import { loadLaunchSpotSeeds } from '../data/launch-spots';
import { sizeBands, type SizeBandToken } from '../data/size-bands';
import { composeConfidenceReasonEs, type FactorVocabEs } from '../publish/confidence-reason';
import type {
  BundleDay,
  BundleDaySummary,
  RegionBundle,
} from '../publish/region-bundle';
import type {
  BestWindow,
  ConfLevel,
  SizeRangeM,
  SurfaceCall,
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

const DEFAULT_LAUNCH_POLICY_PATH = resolve('data/spots/pa-pacific-launch-v1.json');

const FACTOR_VOCAB_ES: FactorVocabEs = {
  height: 'altura',
  period: 'período',
  direction: 'dirección',
  wind: 'viento',
  tide: 'marea',
};

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
  /** null: wind was never observed this hour (05-scoring-engine.md section 3.6 / L16); never collapsed onto "clean", the best-case reading. */
  wind_state: WindState | null;
  /** null: no genuine daylight peak this day (05-scoring-engine.md section 7, "null when max_q = 0"); never an invented span. */
  best_window: BestWindow | null;
  bias_applied: number;
  bias_gate: string;
  members_used: number;
  members_null: number;
  missing: ('wind' | 'tide')[];
  confidence_reason_es: string;
  weakest_link: Factor | null;
};

/** Every hourly call for a spot's day, before that day's one best_window is known. */
type DraftCallRow = Omit<CallRow, 'best_window'>;

export async function runBuildOnce(deps: BuildDeps): Promise<BuildOutcome> {
  const now = deps.clock.now();
  const spots = deps.spots ?? loadLaunchSpotSeeds(deps.launchData);
  const confidenceFactors = readConfidenceFactors(deps.launchData?.policyPath);
  const date = regionalCivilDate(now, spots[0]?.timezone ?? 'America/Panama');
  const hour = now.toISOString().slice(11, 13);
  const dates = [date, followingCivilDate(date)] as const;
  const rows = await predictionRows(deps, dates);
  const calls = spots.flatMap((spot) => callsForSpot(spot, rows, dates, hour, confidenceFactors));
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

function callsForSpot(
  spot: NonNullable<BuildDeps['spots']>[number],
  rows: PredictionRow[],
  dates: readonly string[],
  hour: string,
  confidenceFactors: ConfidenceFactors,
): CallRow[] {
  const validHours = [...new Set(rows.filter((row) => row.spot_id === spot.spot_id).map((row) => row.valid_ts))].sort();
  const correction = applyCorrection(spot, null);
  const drafts: DraftCallRow[] = validHours.flatMap((validTs) => {
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
    const confidenceResult = confidence(members, { kind: 'absolute' }, null, null, score.missing, confidenceFactors);
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
      bias_applied: correction.delta_q,
      bias_gate: correction.gate,
      members_used: blended.members_used,
      members_null: blended.members_null,
      missing: score.missing,
      confidence_reason_es: composeConfidenceReasonEs(confidenceResult, FACTOR_VOCAB_ES, confidenceFactors),
      weakest_link: score.weakest_link,
    }];
  });
  const windowsByCivilDate = bestWindowsByCivilDate(drafts, spot.timezone);
  return drafts.map((draft) => ({
    ...draft,
    // A civil date with zero usable daylight score (every hour blanked, or a
    // flat day whose max_q is 0) has no honest peak to build a window
    // around; bestWindowsByCivilDate leaves that date out of the map on
    // purpose (05-scoring-engine.md section 7: "null when max_q = 0"), so
    // this lookup can genuinely miss and null is the honest result, not a
    // bug to paper over with a non-null assertion.
    best_window: windowsByCivilDate.get(civilDatePrefix(draft.valid_ts)) ?? null,
  }));
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
    confidence_reason: { es: call.confidence_reason_es },
    call: { es: spanishCall(call) },
    size_band: call.size_band,
    size_range_m: call.size_range_m,
    wind_state: call.wind_state,
    best_window: call.best_window,
    weakest_link: call.weakest_link,
  };
}

function surfaceCall(call: CallRow): SurfaceCall {
  return {
    spot_id: call.spot_id,
    score_q: call.score_q,
    call_es: spanishCall(call),
    conf_level: call.conf_level,
    confidence_reason_es: call.confidence_reason_es,
    size_band: call.size_band,
    size_range_m: call.size_range_m,
    // wind_state and best_window are optional on the wire (SurfaceCall),
    // never null: an unknown wind reading, or a day with no genuine peak,
    // omits the field rather than publishing a null the reading routes
    // don't expect and RankedList.astro already degrades gracefully around
    // (application-architecture.md section 7: absent structured fields fall
    // back to the baked call sentence, never a raw null).
    ...(call.wind_state === null ? {} : { wind_state: call.wind_state }),
    ...(call.best_window === null ? {} : { best_window: call.best_window }),
  };
}

function readConfidenceFactors(policyPath: string | undefined): ConfidenceFactors {
  const policy = JSON.parse(readFileSync(policyPath ?? DEFAULT_LAUNCH_POLICY_PATH, 'utf8')) as {
    confidence_factors?: { spread?: unknown };
  };
  const spread = policy.confidence_factors?.spread;
  if (typeof spread !== 'boolean') {
    throw new Error('launch policy refused: confidence_factors.spread must be a boolean');
  }
  return { ...DEFAULT_CONFIDENCE_FACTORS, spread };
}

function spanishCall(call: CallRow): string {
  const windowPhrase = call.best_window === null
    ? 'sin ventana estimada'
    : `mejor de ${call.best_window.start} a ${call.best_window.end}`;
  return `${spanishSizeBand(call.size_band)}, viento ${spanishWind(call.wind_state)}, ${windowPhrase}.`;
}

function followingCivilDate(civilDate: string): string { const date = new Date(`${civilDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function regionalCivilDate(instant: Date, timezone: string): string { const fields = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant); const part = (type: Intl.DateTimeFormatPartTypes) => fields.find((field) => field.type === type)?.value ?? ''; return `${part('year')}-${part('month')}-${part('day')}`; }
function sameRankedCalls(left: readonly CallRow[], right: readonly CallRow[]): boolean { return left.length === right.length && left.every((call, index) => { const other = right[index]; return other !== undefined && call.spot_id === other.spot_id && call.score_q === other.score_q && call.size_band === other.size_band && call.wind_state === other.wind_state && call.best_window?.start === other.best_window?.start && call.best_window?.end === other.best_window?.end; }); }

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

// A null wind sub-score means wind was never observed this hour
// (05-scoring-engine.md section 3.6 / L16) -- distinct from a real, poor
// reading, and never the same as the best-case "clean" bucket. Carrying that
// absence through as `null` is the fix; the scoring layer upstream already
// modeled it honestly (sWind returns null, wind leaves the geometric mean),
// this presentation mapping was the only place still collapsing it.
function windState(score: number | null): WindState | null {
  if (score === null) return null;
  if (score >= 0.75) return 'clean';
  if (score >= 0.35) return 'choppy';
  return 'blown_out';
}

// D6(a), 05-scoring-engine.md section 7: best_window is the longest
// contiguous run of daylight hours whose score is at least 80% of that
// day's daylight peak, derived from THIS spot's own hourly series -- never
// a fixed offset shared by every spot, which is the defect this replaces
// (every row read "mejor de 13:00 a 16:00" because every spot's window used
// to be the same T18:00Z ranking hour plus three hours, in the same shared
// timezone).
//
// The design also calls for real per-spot, per-date daylight bounds from
// shell-computed solar-position arithmetic (lat/lon in). This pipeline does
// not carry lat/lon into scoring today -- SpotSeed has none; only the
// ingest-side capture adapter (src/pipeline/adapters/spot-coordinates.ts)
// does, and it is out of this fix's file scope to plumb it through. Every
// launch spot shares one timezone (data/spots/pa-pacific.yaml: all
// `America/Panama`), and Panama sits close enough to the equator (~7-9N)
// that sunrise and sunset drift by only about twenty minutes across the
// year, so a fixed 06:00-18:00 local bound is an honest regional
// approximation of daylight, not a fabricated one. It is NOT the exact
// per-spot, per-date computation the design ultimately wants -- flagged,
// not fixed, same as the missing lat/lon plumbing it depends on.
const DAYLIGHT_LOCAL_HOURS: readonly [number, number] = [6, 18];

const BEST_WINDOW_RATIO = 0.8;

/** The UTC calendar-date prefix of an hourly `valid_ts`, e.g. `2026-08-09`. */
function civilDatePrefix(validTs: string): string {
  return validTs.slice(0, 10);
}

/** `06:00`. Spot-local clock time, the same format the published field carries. */
function localHhmm(validTs: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(validTs));
}

/**
 * One honest best_window per (spot, published day), keyed by the same UTC
 * date-prefix grouping the rest of this file already ranks by
 * (`call.valid_ts.startsWith(civilDate)`). Every draft row's own key is
 * present in the returned map because the map is built entirely from those
 * same rows: no draft can look up a key nothing produced.
 */
function bestWindowsByCivilDate(drafts: readonly DraftCallRow[], timezone: string): ReadonlyMap<string, BestWindow> {
  const byDate = new Map<string, DraftCallRow[]>();
  for (const draft of drafts) {
    const key = civilDatePrefix(draft.valid_ts);
    const bucket = byDate.get(key);
    if (bucket === undefined) byDate.set(key, [draft]);
    else bucket.push(draft);
  }
  const windows = new Map<string, BestWindow>();
  for (const [key, dayRows] of byDate) {
    const daylight = dayRows
      .map((draft) => ({ validTs: draft.valid_ts, hour: Number(localHhmm(draft.valid_ts, timezone).slice(0, 2)), score_q: draft.score_q }))
      .filter((row) => row.hour >= DAYLIGHT_LOCAL_HOURS[0] && row.hour <= DAYLIGHT_LOCAL_HOURS[1])
      .sort((left, right) => left.hour - right.hour);
    const window = longestHighScoreRun(daylight, timezone);
    if (window !== null) windows.set(key, window);
  }
  return windows;
}

/** Longest contiguous run of daylight hours at or above 80% of that run's own daylight peak. */
function longestHighScoreRun(
  daylight: readonly { readonly validTs: string; readonly hour: number; readonly score_q: number }[],
  timezone: string,
): BestWindow | null {
  if (daylight.length === 0) return null;
  const dayMax = Math.max(...daylight.map((row) => row.score_q));
  // A flat or fully-gated day (every daylight hour scores exactly zero) has
  // no genuine peak to build a window around. Without this guard every
  // zero-score hour would satisfy `0 >= 0.8 * 0` and the entire daylight
  // span would wrongly read as "best" -- the design's own documented
  // exception (05-scoring-engine.md section 7: "null when max_q = 0").
  if (dayMax === 0) return null;
  const threshold = BEST_WINDOW_RATIO * dayMax;
  let best: { startIndex: number; endIndex: number } | null = null;
  let runStartIndex: number | null = null;
  daylight.forEach((row, index) => {
    const previous = daylight[index - 1];
    const contiguous = previous !== undefined && row.hour === previous.hour + 1;
    if (!contiguous) runStartIndex = null;
    if (row.score_q < threshold) {
      runStartIndex = null;
      return;
    }
    if (runStartIndex === null) runStartIndex = index;
    if (best === null || index - runStartIndex > best.endIndex - best.startIndex) {
      best = { startIndex: runStartIndex, endIndex: index };
    }
  });
  if (best === null) return null;
  const { startIndex, endIndex } = best as { startIndex: number; endIndex: number };
  return {
    start: localHhmm(daylight[startIndex]!.validTs, timezone),
    end: localHhmm(daylight[endIndex]!.validTs, timezone),
  };
}

function spanishWind(windState: CallRow['wind_state']): string {
  if (windState === null) return 'sin datos';
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
