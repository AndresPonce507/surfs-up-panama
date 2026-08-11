import type { WindStateToken } from '../data/report-vocab';
import type { SizeBandToken } from '../data/size-bands';
import type { ConfidenceResult } from '../scoring/confidence';
import { FACTOR_TOKENS, type FactorToken } from './factor-vocab';

/** Spot-local `HH:MM` strings, precomputed at publish time; pages never compute them. */
export type BestWindow = {
  readonly start: string;
  readonly end: string;
};

/** `[lo, hi]` metres of the breaking face. Always rendered as a range, never a point. */
export type SizeRangeM = readonly [number, number];

/**
 * Re-exported from src/data/report-vocab.ts so the published surface, the
 * capture form and the write-path wire contract cannot drift. The arrow points
 * data -> publish and never back: the report route may not reach the forecast
 * layer (leak path L1).
 */
export type WindState = WindStateToken;

/**
 * The published projection of the continuous `C_total`. The level is what a
 * page prints; the continuous `conf_value` stays in the PublishedCall log so
 * thresholds can be retuned without rewriting what was shown
 * (domain-model.md section 13, canonical-names table).
 */
export type ConfLevel = 'low' | 'medium' | 'high';

/**
 * The reason terms behind `conf_level`, not a pre-rendered sentence: the
 * Spanish is composed at render time from `src/scoring/confidence.ts`, so
 * wording changes never require a republish and the 160-character bound
 * (`application-architecture.md` section 7 P1) is enforced where the
 * sentence is actually made (`adr-enriched-fields-reach-the-reading-
 * surface.md`). Derived from `ConfidenceResult`, the one place that shape is
 * computed, so this type cannot drift from what the scoring engine produces.
 */
export type ConfidenceReason = Pick<ConfidenceResult, 'dominant' | 'spread_terms' | 'track_state'>;

/** Day-independent spot identity carried on the surface itself, mirroring
 * `region-bundle.ts`'s `BundleSpotDetail` so a page never has to read the
 * bundle for it -- the bundle is written to S3 and never committed. */
export type SurfaceSpotDetail = {
  readonly name: string;
};

export type SurfaceCall = {
  readonly spot_id: string;
  readonly score_q: number;
  readonly call_es: string;
  // Structured publish fields. Optional on this wire type because the surface
  // committed for slice-01 predates them; the region bundle requires them.
  readonly conf_level?: ConfLevel;
  readonly size_band?: SizeBandToken;
  readonly size_range_m?: SizeRangeM;
  readonly wind_state?: WindState;
  readonly best_window?: BestWindow;
  /**
   * The reading-surface half of the day summary's `weakest_link`
   * (`BundleDaySummary`, src/publish/region-bundle.ts). Optional for the same
   * reason as the five structured fields above: surfaces committed before
   * this field existed carry no such key at all.
   *
   * A MISSING key and an explicit `null` are different facts and this type
   * must not collapse them: missing means an older surface published before
   * this field existed; `null` means the pipeline computed a perfect day, no
   * factor cost it any score. No renderer may collapse the two. Population
   * happens once, in `surfaceCall()` (src/pipeline/build.ts).
   *
   * Typed as `FactorToken`, the publish-side vocabulary, not the scoring
   * engine's `Factor`. Two lanes reached this field from opposite ends and
   * disagreed here. `FactorToken` wins because this is a wire type: the
   * reading surface has no business importing the engine's internal union,
   * and factor-vocab.ts already carries the guard asserting the two sets are
   * equal at the publish boundary. If they ever diverge that guard fails,
   * which is exactly where the failure belongs.
   */
  readonly weakest_link?: FactorToken | null;
  /**
   * Raw score from the exact row's already-published `weakest_link`.
   *
   * This scalar is neither a second factor selection nor Slice-04's
   * four-factor record. It is optional only for legacy named rows published
   * before this field existed; when present it is finite and within [0, 1].
   */
  readonly weakest_link_subscore?: number;
  /**
   * Producer-decided model score without this row's named weakest link.
   *
   * The page receives this integer verbatim and never computes it. It is
   * optional only for legacy named rows; a fresh named row carries either a
   * strictly higher score or the mutually exclusive equality marker below.
   * This is not Slice-04's damage disclosure.
   */
  readonly counterfactual_score_q?: number;
  /** A fresh named row's valid rounded-equality suppression marker. */
  readonly counterfactual_suppression?: 'rounded_equal';
  /** Same backward-compatibility reason as `weakest_link`: every freshly
   * built call sets this key, older committed surfaces may not have it. */
  readonly confidence_reason?: ConfidenceReason;
};

export type PublishedSurfaceDay = {
  /** Panama civil date for this independently ranked list. */
  readonly date: string;
  /** Array position is this day's rank. */
  readonly spots: readonly SurfaceCall[];
};

export type PublishedSurfaceUpdate = {
  readonly schema: 'published-surface-update/v1';
  /**
   * Compatibility aliases for the existing receipt and yesterday readers.
   * They must describe days[0], but new reading routes use days directly.
   */
  readonly surf_date: string;
  readonly published_at: string;
  readonly build_kind: 'dawn' | 'hourly';
  readonly calls: readonly SurfaceCall[];
  /** Today and tomorrow, never a copied single-day ranking. */
  readonly days: readonly [PublishedSurfaceDay, PublishedSurfaceDay];
  /**
   * Day-independent identity, unordered on purpose so it cannot encode a
   * third ranking that disagrees with either day array -- the same reasoning
   * as `region-bundle.ts`'s `spot_detail`, preserved rather than restated.
   * Optional for the same backward-compatibility reason as the per-call
   * enriched fields.
   */
  readonly spot_detail?: Readonly<Record<string, SurfaceSpotDetail>>;
};

export type DawnReceipt = {
  readonly schema: 'published-surface-update/v1';
  readonly surf_date: string;
  readonly published_at: string;
  readonly build_kind: 'dawn' | 'hourly';
  readonly calls: readonly SurfaceCall[];
};

export type StaticSurface = {
  readonly schema: 'static-surface/v1';
  readonly current: PublishedSurfaceUpdate;
  readonly dawn_receipts: readonly DawnReceipt[];
};

export function mergePublishedSurface(
  previous: StaticSurface | null,
  incoming: PublishedSurfaceUpdate,
): StaticSurface {
  const retained = previous?.dawn_receipts ?? [];
  const dawn_receipts = incoming.build_kind === 'dawn'
    ? retainDawnReceipt(retained, incoming)
    : retained;
  return {
    schema: 'static-surface/v1',
    current: incoming,
    dawn_receipts,
  };
}

export function previousCivilDate(surfDate: string): string {
  const atNoonUtc = new Date(`${surfDate}T12:00:00Z`);
  atNoonUtc.setUTCDate(atNoonUtc.getUTCDate() - 1);
  return atNoonUtc.toISOString().slice(0, 10);
}

/**
 * The static reading surface has only two honest horizons. Keep this check
 * independent of the publishing CLI so Astro cannot render a malformed JSON
 * file when somebody invokes its builder directly.
 */
export function assertStrictTwoDayUpdate(value: unknown): PublishedSurfaceUpdate {
  if (!isRecord(value)
    || value.schema !== 'published-surface-update/v1'
    || typeof value.surf_date !== 'string'
    || typeof value.published_at !== 'string'
    || (value.build_kind !== 'dawn' && value.build_kind !== 'hourly')
    || !Array.isArray(value.calls)
    || !value.calls.every(isSurfaceCall)
    || !Array.isArray(value.days)
    || value.days.length !== 2
    || !value.days.every(isPublishedSurfaceDay)) {
    throw new Error('published surface must contain exactly two well-formed ranked civil days with non-empty calls.');
  }

  const [today, tomorrow] = value.days;
  if (today === undefined || tomorrow === undefined
    || today.date !== value.surf_date
    || tomorrow.date !== nextCivilDate(today.date)) {
    throw new Error('published surface days must be today and the next consecutive civil date.');
  }
  if (sameRankedCalls(today.spots, tomorrow.spots)
    || sameRankedCalls(value.calls, tomorrow.spots)) {
    throw new Error('published surface tomorrow ranking must be its own values, never a clone of today.');
  }
  return value as PublishedSurfaceUpdate;
}

function isPublishedSurfaceDay(value: unknown): value is PublishedSurfaceDay {
  return isRecord(value)
    && typeof value.date === 'string'
    && isCivilDate(value.date)
    && Array.isArray(value.spots)
    && value.spots.length > 0
    && value.spots.every(isSurfaceCall);
}

function isSurfaceCall(value: unknown): value is SurfaceCall {
  return isRecord(value)
    && typeof value.spot_id === 'string'
    && typeof value.score_q === 'number'
    && typeof value.call_es === 'string'
    && hasValidWeakestLinkSubscore(value)
    && hasValidCounterfactual(value);
}

function hasValidWeakestLinkSubscore(value: Record<string, unknown>): boolean {
  if (!Object.hasOwn(value, 'weakest_link_subscore')) return true;
  const scalar = value.weakest_link_subscore;
  return isFactorToken(value.weakest_link)
    && typeof scalar === 'number'
    && Number.isFinite(scalar)
    && scalar >= 0
    && scalar <= 1;
}

function hasValidCounterfactual(value: Record<string, unknown>): boolean {
  const hasScore = Object.hasOwn(value, 'counterfactual_score_q');
  const hasSuppression = Object.hasOwn(value, 'counterfactual_suppression');
  if (!hasScore && !hasSuppression) return true;
  if (!isFactorToken(value.weakest_link) || (hasScore && hasSuppression)) return false;
  if (hasSuppression) return value.counterfactual_suppression === 'rounded_equal';
  const score = value.counterfactual_score_q;
  const rowScore = value.score_q;
  return typeof score === 'number'
    && typeof rowScore === 'number'
    && Number.isInteger(score)
    && score >= 0
    && score <= 100
    && score > rowScore;
}

function isFactorToken(value: unknown): value is FactorToken {
  return typeof value === 'string' && FACTOR_TOKENS.includes(value as FactorToken);
}

function sameRankedCalls(left: readonly SurfaceCall[], right: readonly SurfaceCall[]): boolean {
  return left.length === right.length && left.every((call, index) => {
    const other = right[index];
    return other !== undefined
      && call.spot_id === other.spot_id
      && call.score_q === other.score_q
      && call.call_es === other.call_es;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCivilDate(value: string): boolean {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value;
}

function nextCivilDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function retainDawnReceipt(
  receipts: readonly DawnReceipt[],
  incoming: PublishedSurfaceUpdate,
): DawnReceipt[] {
  const existing = receipts.find((receipt) => receipt.surf_date === incoming.surf_date);
  if (existing !== undefined) return [...receipts];
  return [...receipts, incoming].sort((left, right) => left.surf_date.localeCompare(right.surf_date));
}
