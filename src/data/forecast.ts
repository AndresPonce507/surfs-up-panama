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

export interface DaySummary {
  /** Joins to spot_detail and to SpotIdentity on spot_id. */
  readonly spot_id: string;
  /** Published score: an integer 0 to 100, rendered as-is, never rescaled. */
  readonly score_q: number;
  /** The Spanish call text rendered into the static reading surface. */
  readonly call: Partial<Record<Locale, string>>;
  /** Structured publish fields let the reading surface repeat the call without
   * trusting a free-form narrative. */
  readonly size_band?: string;
  readonly size_range_m?: readonly [number, number];
  readonly wind_state?: string;
  readonly best_window?: { readonly start: string; readonly end: string };
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

type PublishedCall = {
  readonly spot_id: string;
  readonly score_q: number;
  readonly call_es: string;
  readonly size_band?: string;
  readonly size_range_m?: readonly [number, number];
  readonly wind_state?: string;
  readonly best_window?: { readonly start: string; readonly end: string };
};

const today: readonly DaySummary[] = (surface.current.calls as readonly PublishedCall[]).map((call) => ({
  spot_id: call.spot_id,
  score_q: call.score_q,
  call: { es: call.call_es },
  ...(call.size_band === undefined ? {} : { size_band: call.size_band }),
  ...(call.size_range_m === undefined ? {} : { size_range_m: call.size_range_m }),
  ...(call.wind_state === undefined ? {} : { wind_state: call.wind_state }),
  ...(call.best_window === undefined ? {} : { best_window: call.best_window }),
}));

export const forecast: ForecastPlaceholder = {
  published_at: surface.current.published_at,
  days: [today, today],
};
