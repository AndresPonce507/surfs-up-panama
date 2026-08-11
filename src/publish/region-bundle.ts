// The `region-bundle/1` contract: the build's render input for every route.
//
// WHY-NEW-FILE: src/publish/region-bundle.ts
//   CLOSEST-EXISTING: src/publish/static-surface.ts
//   EXTENSION-COST: static-surface.ts owns a different artifact
//     (`published-surface-update/v1`, the committed reading surface) and its
//     runtime two-day assertion; folding a second schema in would put two
//     artifact contracts and one validator behind one name.
//   PARALLEL-RATIONALE: different lifecycle and different consumer. The bundle
//     is written to S3 once per hourly build and read by the site builder; the
//     static surface is a committed file read by the publish CLI. The bundle
//     type must be importable by a page without dragging in the CLI's strict
//     two-day assertion.
//
// Authority: domain-model.md section 13 (schema authority) and
// adr-two-day-ranking.md. The shape is a split by DATA LIFETIME:
//
//   days[0], days[1]   ranked summary arrays. ARRAY POSITION IS THAT DAY'S
//                      RANK; there is no `rank` field anywhere, so today's
//                      order and tomorrow's cannot be conflated.
//   spot_detail{}      a JSON object, therefore unordered, therefore incapable
//                      of encoding a third ranking that disagrees with either
//                      day. Holds only what does not change between days.
//
// Join key, both directions: `spot_id`, which IS the URL slug.

import type { SizeBandToken } from '../data/size-bands';
import type { Factor } from '../scoring/engine';
import type {
  BestWindow,
  ConfLevel,
  PublishedSurfaceUpdate,
  SizeRangeM,
  WindState,
} from './static-surface';

/**
 * One spot's call for ONE day. Every value here is that day's own: confidence
 * genuinely drops with lead time, so tomorrow's summary is never today's
 * copied forward.
 */
export type BundleDaySummary = {
  readonly spot_id: string;
  /** Integer 0 to 100, published verbatim, never rescaled. */
  readonly score_q: number;
  readonly conf_level: ConfLevel;
  readonly call: { readonly es: string };
  readonly size_band: SizeBandToken;
  readonly size_range_m: SizeRangeM;
  /** null: wind was never observed this day, never fabricated as "clean" (05-scoring-engine.md section 3.6). */
  readonly wind_state: WindState | null;
  /** null: no genuine daylight peak this day, never a fabricated span (05-scoring-engine.md section 7). */
  readonly best_window: BestWindow | null;
  /** null means no factor cost this day any score; never a fabricated culprit. */
  readonly weakest_link: Factor | null;
  /** Raw score for this row's named weakest_link; absent only on a clean row. */
  readonly weakest_link_subscore?: number;
  /** Producer-decided integer score without this row's named weakest link. */
  readonly counterfactual_score_q?: number;
  /** Fresh-row equality discriminator; mutually exclusive with the score. */
  readonly counterfactual_suppression?: 'rounded_equal';
};

export type BundleDay = {
  /** Civil date in the region's timezone. */
  readonly date: string;
  /** Array position IS this day's rank. */
  readonly spots: readonly BundleDaySummary[];
};

/** Day-independent facts, held once per spot rather than once per spot per day. */
export type BundleSpotDetail = {
  readonly name: string;
};

export type RegionBundle = {
  readonly schema: 'region-bundle/1';
  readonly region_id: string;
  readonly build_id: string;
  readonly published_at: string;
  /** Exactly two: the civil date containing published_at, and the next one. */
  readonly days: readonly [BundleDay, BundleDay];
  readonly spot_detail: Readonly<Record<string, BundleSpotDetail>>;
  /** The reading surface promoted by `npm run publish:surface`. */
  readonly publish_surface: PublishedSurfaceUpdate;
};

// Re-exported so a reader that only ever touches the bundle has one import.
export type { BestWindow, ConfLevel, SizeRangeM, WindState } from './static-surface';
export type { SizeBandToken } from '../data/size-bands';
