// Adapts one published, ranked day entry into the public Spanish share
// template input. Routes choose the entry; this module preserves that choice
// all the way through the message and its stamped destination.

import type { DaySummary } from '../data/forecast';
import type { ShareDaySummary } from './whatsapp-call-message';
import { stampedShareLink } from './share-link';

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function publishedDayEs(publishedAt: string): string {
  const [year, month, day] = publishedAt.slice(0, 10).split('-').map(Number);
  const monthName = year === undefined || month === undefined ? undefined : MONTHS_ES[month - 1];
  if (day === undefined || monthName === undefined) {
    throw new Error(`share: la mañana publicada no trae una fecha legible ("${publishedAt}")`);
  }
  return `${day} de ${monthName}`;
}

/**
 * Converts the route-selected published value into the complete share
 * template input. Optional P1 enrichments may be absent in an honest degraded
 * reading surface. In that case the route withholds the fixed share template
 * instead of inventing its missing lines or aborting every spot page. The
 * production producer guard remains responsible for rejecting incomplete
 * current publishes.
 */
export function shareDaySummaryFor(
  publishedAt: string,
  spotName: string,
  summary: DaySummary,
): ShareDaySummary | undefined {
  const { size_band, wind_state, best_window, conf_level } = summary;
  if (
    size_band === undefined
    || wind_state === undefined
    || best_window === undefined
    || conf_level === undefined
  ) {
    return undefined;
  }
  return {
    fecha: publishedDayEs(publishedAt),
    spotName,
    scoreQ: summary.score_q,
    sizeBand: size_band,
    windState: wind_state,
    windowStart: best_window.start,
    windowEnd: best_window.end,
    confidenceLevel: conf_level,
  };
}

/**
 * The selected spot keeps the normal build stamp while replacing only the
 * published route. This makes a shared spot page fresh without falling back
 * to the home page.
 */
export function stampedSpotShareLink(
  configuredSite: string,
  publishedAt: string,
  spotId: string,
): string {
  const shared = new URL(stampedShareLink(configuredSite, publishedAt));
  shared.pathname = `/spots/${spotId}/`;
  return shared.toString();
}
