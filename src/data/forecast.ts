// The slice-01 publish-build render input (payload P1).
// At publish time the site builder consumes the region bundle server-side and
// bakes real values into the HTML routes; the browser never fetches forecast
// JSON (adr-publish-time-html-rendering.md). This module exists so the route
// skeleton has a typed render source and so the forecast/identity import
// boundary is real from day one.
//
// LEAK RULE (application-architecture.md sections 7 to 9): the report flow
// routes and components must NEVER import this module, directly or
// transitively. The report capture screen is forecast-free by construction;
// that is an anti-anchoring correctness constraint, not a style preference.

import surface from '../../data/published-surface.json';

import type { Locale } from '../i18n/strings';
import type { SizeBandToken } from './size-bands';
import {
  assertStrictTwoDayUpdate,
  type BestWindow,
  type ConfidenceReason,
  type ConfLevel,
  type SizeRangeM,
  type SurfaceCall,
  type WindState,
} from '../publish/static-surface';

export interface DaySummary {
  /** Joins to spot_detail and to SpotIdentity on spot_id. */
  readonly spot_id: string;
  /** Published score: an integer 0 to 100, rendered as-is, never rescaled. */
  readonly score_q: number;
  /** The Spanish call text rendered into the static reading surface. */
  readonly call: Partial<Record<Locale, string>>;
  /** Structured publish fields let the reading surface repeat the call without
   * trusting a free-form narrative. Render them through
   * `src/publish/display-format.ts`; never format a size or a window inline. */
  readonly size_band?: SizeBandToken;
  readonly size_range_m?: SizeRangeM;
  readonly wind_state?: WindState;
  readonly best_window?: BestWindow;
  /**
   * That day's own confidence level. It is a DAY field: confidence drops with
   * lead time, so tomorrow's is genuinely lower than today's. The continuous
   * value behind it stays in the PublishedCall log (domain-model section 13).
   */
  readonly conf_level?: ConfLevel;
  /**
   * The per-variable spread terms behind that level, carried through so the
   * row can name WHICH thing the models split on instead of saying "they agree
   * in part" (research 09 sections 8.4 and 14.4). The Spanish is composed at
   * render time from `src/scoring/confidence.ts`, never stored, so rewording
   * never needs a republish.
   *
   * Optional for the same reason the five structured fields above are: a
   * surface committed before this field existed carries no such key. A missing
   * key is a real fact and renders as `{ kind: 'unknown' }`, which reproduces
   * the older, level-only sentence rather than inventing an agreement.
   */
  readonly confidence_reason?: ConfidenceReason;
}

export interface ForecastPlaceholder {
  /** Publish stamp for the static candidate. */
  readonly published_at: string;
  /**
   * days[0] = today, days[1] = tomorrow. Array position IS that day's rank;
   * no rank field exists (adr-two-day-ranking.md).
   */
  readonly days: readonly [readonly DaySummary[], readonly DaySummary[]];
}

const current = assertStrictTwoDayUpdate(surface.current);

function summaries(calls: readonly SurfaceCall[]): readonly DaySummary[] {
  return calls.map((call) => ({
  spot_id: call.spot_id,
  score_q: call.score_q,
  call: { es: call.call_es },
  ...(call.size_band === undefined ? {} : { size_band: call.size_band }),
  ...(call.size_range_m === undefined ? {} : { size_range_m: call.size_range_m }),
  ...(call.wind_state === undefined ? {} : { wind_state: call.wind_state }),
  ...(call.best_window === undefined ? {} : { best_window: call.best_window }),
  ...(call.conf_level === undefined ? {} : { conf_level: call.conf_level }),
  ...(call.confidence_reason === undefined ? {} : { confidence_reason: call.confidence_reason }),
  }));
}

export const forecast: ForecastPlaceholder = {
  published_at: current.published_at,
  // Today's legacy alias remains only for yesterday-receipt compatibility.
  // Tomorrow always comes from its separately ranked day array.
  days: [summaries(current.calls), summaries(current.days[1].spots)],
};
