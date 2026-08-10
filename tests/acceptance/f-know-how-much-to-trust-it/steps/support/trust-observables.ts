// Shared producer-half observables for f-know-how-much-to-trust-it slices
// 02 to 05. JIT DISTILL 2026-08-10.
//
// Slice-01's steps file keeps its own private copies of these helpers on
// purpose: that lane is mid-DELIVER and its file must not move under it.
// This module is the shared vocabulary for the slices that open after it.
// When slice-01 closes, folding its copies into this module is recorded
// cleanup, not a behaviour change.
//
// Every helper observes through the port-exposed universe only: the object
// store the pipeline writes (bundle, publish surface, prediction log, call
// log, raw archive). Nothing here reaches into engine internals.

import assert from 'node:assert/strict';

import { runIngestOnce } from '../../../../../src/pipeline/ingest';
import { runBuildOnce } from '../../../../../src/pipeline/build';
import type { ForecastSource, IngestDeps } from '../../../../../src/pipeline/ports';
import type { SpotSeed } from '../../../../../src/scoring/engine';
import type { LaunchSeedData } from '../../../../../src/data/launch-spots';
import type { PipelineWorld } from '../../../daily-call-with-permanent-receipts/steps/support/world';
import type { MemberSpec } from '../../../daily-call-with-permanent-receipts/steps/support/fixtures';

/** The P1 bound this feature owes (application-architecture.md section 7). */
export const REASON_MAX_CHARS = 160;

// ---------------------------------------------------------------------------
// Domain vocabulary the oracles require, and nothing more. Pre-requisite 1
// (settled Spanish phrasings) stays OPEN: no oracle pins a sentence word for
// word, only the domain noun any settled wording must contain or must avoid.
// ---------------------------------------------------------------------------

export const NAMES_THE_TIDE = /\bmareas?\b/iu;
export const NAMES_THE_PERIOD = /\bper[ií]odos?\b/iu;
export const SAYS_ONE_MODEL_ANSWERED = /\b(?:un\s+solo|solo\s+un|[uú]nico)\s+modelo\b|\bun\s+modelo\s+solo\b/iu;

/** Any spread-term noun. With the spread factor disabled (slice-03) the
 * reason may name none of them, because a disabled factor never bound. */
export const NAMES_ANY_SPREAD_TERM = /\balturas?\b|\bper[ií]odos?\b|\bdirecci[oó]n(?:es)?\b/iu;

/** The zero-informative-signal admission of 05 section 6.4: wording open
 * (Pre-requisite 1), the noun "señal" is what any settled phrasing carries. */
export const SAYS_NO_USABLE_SIGNAL = /\bse[ñn]al(?:es)?\b/iu;

/** The climatology comparison of 05 section 6.1: the day against THIS spot's
 * own normal. Wording open; "normal" is the noun any settled form carries. */
export const COMPARES_AGAINST_SPOT_NORMAL = /\bnormal(?:es)?\b/iu;

/** Percentiles, percentages and probability wording are refused outright:
 * qualitative flag only (research 09 section 3.6; epic contradiction C4). */
export const SOUNDS_LIKE_PROBABILITY = /%|\bpor\s?ciento\b|\bprobabilidad(?:es)?\b|\bpercentil(?:es)?\b/iu;

export const CLAIMS_MODEL_DISAGREEMENT =
  /no\s+se\s+ponen\s+de\s+acuerdo|coinciden\s+solo\s+en\s+parte|se\s+contradicen|\bdifieren\b|\bdiscrepan\b|no\s+coinciden|se\s+parten/iu;

export const CLAIMS_BEACH_CONFIRMATION =
  /(alguien|un\s+surfista|un\s+reporte)\s+(confirm\w*|vio|report[oó])|confirmad[oa]\s+desde\s+la\s+playa|reporte\w*\s+desde\s+la\s+playa\s+confirm\w*/iu;

export const LEAKS_RAW_DATA =
  /\b(?:ncep|gfs|gfswave|dwd|gwam|ecmwf|meteofrance)(?:[_-]?[a-z0-9]+)*\b|\b(?:c_spread|c_track|c_fresh|conf_value|conf_level|confidence_reason|spread_terms|dominant|track_state|score_q|size_band|json|undefined|nan|null|true|false)\b/iu;

/** Em dash and en dash: forbidden in every UI string (project CLAUDE.md). */
export const LONG_DASH = /[—–]/u;

/** Glyph-dot shape beside the level word (09-design-system.md section 9). */
export const SHAPE_GLYPHS = /[●○]{2,}/u;

export const LEVEL_WORD = /confianza\s+(alta|media|baja)/iu;

// ---------------------------------------------------------------------------
// Fixture members. Values identical to slice-01's on purpose: the arithmetic
// notes there (c_total 0.7000 exactly with tide dark, 0.9922 with tide
// present; dominant spread_period on the split pull) carry over unchanged.
// ---------------------------------------------------------------------------

/** Four members that genuinely agree (slice-01's MODELS_THAT_AGREE). */
export const TIGHT_MEMBERS: readonly MemberSpec[] = [
  { source: 'ncep_gfswave016', h_m: 0.70, t_s: 12.0, dir_deg: 205 },
  { source: 'ncep_gfswave025', h_m: 0.71, t_s: 12.1, dir_deg: 206 },
  { source: 'meteofrance_wave', h_m: 0.70, t_s: 12.0, dir_deg: 205 },
  { source: 'dwd_gwam', h_m: 0.72, t_s: 12.2, dir_deg: 204 },
];

/** The real 2026-08-08 Venao pull, periods split 15.5 s against 10.05 s. */
export const PERIOD_SPLIT_MEMBERS: readonly MemberSpec[] = [
  { source: 'ncep_gfswave016', h_m: 0.64, t_s: 15.5, dir_deg: 206 },
  { source: 'ncep_gfswave025', h_m: 0.66, t_s: 15.5, dir_deg: 204 },
  { source: 'meteofrance_wave', h_m: 0.78, t_s: 11.6, dir_deg: 212 },
  { source: 'dwd_gwam', h_m: 0.86, t_s: 10.05, dir_deg: 203 },
];

// ---------------------------------------------------------------------------
// Published-morning observation
// ---------------------------------------------------------------------------

export type PublishedReasonRow = {
  readonly where: string;
  readonly day: number;
  readonly spot_id: string;
  readonly conf_level: string | undefined;
  readonly reason: string | null;
};

/** The world properties these slices share with slice-01's steps. The names
 * match slice-01's TrustWorld on purpose: its After hook cleans them up and
 * its Then steps read `trustPublished`, so reuse works across slice files. */
export type TrustLike = PipelineWorld & {
  trustPublished?: PublishedReasonRow[];
};

export function trustLike(world: PipelineWorld): TrustLike {
  return world as TrustLike;
}

/** Accepts either published shape (flat `confidence_reason_es` or nested
 * `confidence_reason: { es }`), same as slice-01's reader. */
export function reasonOf(row: Record<string, unknown>): string | null {
  const flat = row.confidence_reason_es;
  if (typeof flat === 'string') return flat;
  const nested = row.confidence_reason;
  if (typeof nested === 'string') return nested;
  if (typeof nested === 'object' && nested !== null) {
    const spanish = (nested as Record<string, unknown>).es;
    if (typeof spanish === 'string') return spanish;
  }
  return null;
}

/** Tolerant read: null when no bundle was published, so a When step never
 * fails as setup. The Then that needed rows reports the absence as behaviour
 * with the captured pipeline failures attached. */
export async function readPublishedReasonRows(world: PipelineWorld): Promise<PublishedReasonRow[] | null> {
  const body = await world.store.get('pub/v1/regions/pa-pacific/bundle.json');
  if (body === null) return null;
  const bundle = JSON.parse(body) as {
    days: { date: string; spots: Record<string, unknown>[] }[];
    publish_surface: { days: { date: string; spots: Record<string, unknown>[] }[] };
  };
  const rows: PublishedReasonRow[] = [];
  for (const [index, day] of bundle.days.entries()) {
    for (const spot of day.spots) {
      rows.push({
        where: `el resumen del día ${index} (${day.date})`,
        day: index,
        spot_id: String(spot.spot_id),
        conf_level: typeof spot.conf_level === 'string' ? spot.conf_level : undefined,
        reason: reasonOf(spot),
      });
    }
  }
  for (const [index, day] of bundle.publish_surface.days.entries()) {
    for (const spot of day.spots) {
      rows.push({
        where: `la superficie de lectura del día ${index} (${day.date})`,
        day: index,
        spot_id: String(spot.spot_id),
        conf_level: typeof spot.conf_level === 'string' ? spot.conf_level : undefined,
        reason: reasonOf(spot),
      });
    }
  }
  return rows.length === 0 ? null : rows;
}

/** Reads the published morning and shares it with slice-01's Then steps. */
export async function captureTrustPublished(world: PipelineWorld): Promise<PublishedReasonRow[] | null> {
  const rows = await readPublishedReasonRows(world);
  const shared = trustLike(world);
  if (rows === null) delete shared.trustPublished;
  else shared.trustPublished = rows;
  return rows;
}

/** The behavioural accessor for this feature's own Then steps: an unpublished
 * morning is reported as behaviour with the captured failures, never as a
 * fixture error. */
export function publishedRowsOrFinding(world: PipelineWorld): { rows: PublishedReasonRow[]; findings: string[] } {
  const rows = trustLike(world).trustPublished;
  if (rows === undefined || rows.length === 0) {
    return {
      rows: [],
      findings: [`la mañana no publicó ninguna fila que leer${world.failureContext()}`],
    };
  }
  return { rows, findings: [] };
}

/** Rows for one spot that carry a reason; empty set is a finding, so
 * "nothing to inspect" can never read as "all clean". */
export function reasonsForSpot(
  rows: readonly PublishedReasonRow[],
  spotId: string,
): { reasons: PublishedReasonRow[]; findings: string[] } {
  const forSpot = rows.filter((row) => row.spot_id === spotId);
  if (forSpot.length === 0) {
    return { reasons: [], findings: [`"${spotId}" no aparece en ninguna mitad de la mañana publicada`] };
  }
  const reasons = forSpot.filter((row) => row.reason !== null);
  const findings = reasons.length === 0
    ? [`ninguna de las ${forSpot.length} filas publicadas de "${spotId}" trae una razón que revisar`]
    : [];
  return { reasons, findings };
}

export function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: un surfista decide en segundos si maneja dos horas, y la razón no puede nombrar una causa que no pesó ni prometer más certeza de la que los datos ganaron. HOW: ${how}`,
  );
}

// ---------------------------------------------------------------------------
// Morning choreography with injectable deps (policy path, source registry).
// Same :02 fetch / :22 build sequence as PipelineWorld.publishMorning; the
// difference is that these slices need deps publishMorning does not take.
// ---------------------------------------------------------------------------

export type MorningOptions = {
  readonly label: string;
  readonly date: string;
  readonly source: ForecastSource;
  readonly spots: readonly SpotSeed[];
  readonly launchData?: LaunchSeedData;
  /** The slice-04 source registry, fixed by DISTILL as the acceptance
   * contract: `sources` beside the legacy `source`, ordered, each entry
   * `{ provider_id, source }`. Ignored by today's pipeline, which is the RED. */
  readonly sources?: readonly { provider_id: string; source: ForecastSource }[];
  readonly buildHourUtc?: number;
};

export async function runMorning(world: PipelineWorld, opts: MorningOptions): Promise<void> {
  const buildHour = String(opts.buildHourUtc ?? 11).padStart(2, '0');
  const spots = [...opts.spots];
  world.clock.set(`${opts.date}T${buildHour}:02:14Z`);
  const ingestDeps: IngestDeps & { sources?: MorningOptions['sources'] } = {
    source: opts.source,
    store: world.store,
    clock: world.clock,
    spots,
    ...(opts.launchData === undefined ? {} : { launchData: opts.launchData }),
    ...(opts.sources === undefined ? {} : { sources: opts.sources }),
  };
  try {
    await runIngestOnce(ingestDeps);
  } catch (error) {
    world.failures.push({ label: `${opts.label}: ingest`, error });
  }
  world.clock.set(`${opts.date}T${buildHour}:22:00Z`);
  try {
    await runBuildOnce({
      store: world.store,
      clock: world.clock,
      spots,
      ...(opts.launchData === undefined ? {} : { launchData: opts.launchData }),
      region_id: 'pa-pacific',
    });
  } catch (error) {
    world.failures.push({ label: `${opts.label}: build`, error });
  }
}
