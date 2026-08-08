// Placeholder stand-in for the publish-build render input (payload P1).
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

import type { Locale } from '../i18n/strings';

export interface DaySummary {
  /** Joins to spot_detail and to SpotIdentity on spot_id. */
  readonly spot_id: string;
  /** Published score: an integer 0 to 100, rendered as-is, never rescaled. */
  readonly score_q: number;
  /** The call text. Placeholder here; real text arrives from the bundle. */
  readonly call: Record<Locale, string>;
}

export interface ForecastPlaceholder {
  /** Placeholder for the build stamp fields (build_id, published_at). */
  readonly published_at: string;
  /**
   * days[0] = today, days[1] = tomorrow. Array position IS that day's rank;
   * no rank field exists (adr-two-day-ranking.md).
   */
  readonly days: readonly [readonly DaySummary[], readonly DaySummary[]];
}

const placeholderDay: readonly DaySummary[] = [
  {
    spot_id: 'spot-placeholder-1',
    score_q: 0,
    call: { es: '[llamado placeholder]', en: '[call placeholder]' },
  },
  {
    spot_id: 'spot-placeholder-2',
    score_q: 0,
    call: { es: '[llamado placeholder]', en: '[call placeholder]' },
  },
];

export const forecast: ForecastPlaceholder = {
  published_at: '[placeholder]',
  days: [placeholderDay, placeholderDay],
};
