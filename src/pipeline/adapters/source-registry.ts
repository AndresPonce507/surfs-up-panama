// The registry seam adr-openmeteo-vs-raw-grib2.md promised: "a registry
// change plus one adapter" (roadmap 04-03, W4 scope amendment). A composite
// ForecastSource, priority ordered. A healthy primary must answer alone: the
// same physical model must never feed the member table twice, which would
// shrink the confidence spread dishonestly (roadmap 04-03). A dark primary
// must fall through to the next entry's honest, independent reading instead
// of leaving the beach blank.
//
// Kept intentionally stateless: every call decides its winner fresh from the
// entries' own answers, dependencies passed in per the functional paradigm
// (nw-fp-principles: no ambient memory of "who won last time"). This is what
// makes the fold safe next to the NOAA adapter's lastRequestedSpot pattern
// (noaa-gfswave-source.ts): runIngestOnce always calls fetchWavePayload(spot)
// immediately before parseWaveMembers for that same spot, one spot at a time,
// so the registry never needs to remember which entry it consulted last.

import type { ForecastSource, ReceivedSourcePayload, SourceResult } from '../ports';
import type { Clock } from '../ports';
import { NoaaGfswaveForecastSource } from './noaa-gfswave-source';
import { OpenMeteoForecastSource } from './open-meteo-source';
import type { SpotCoordinate } from './spot-coordinates';

export type RegistryEntry = {
  readonly id: string;
  readonly source: ForecastSource;
};

/**
 * The production composition of the two wave vendors. The primary remains
 * Open-Meteo because it is the four-member launch source. NOAA is the
 * independent public-domain fallback for a dark primary, never a second copy
 * of a healthy primary's GFS member.
 *
 * This factory is deliberately at the adapter boundary rather than in either
 * composition root, so capture and Lambda Fetch cannot drift into different
 * provider order or silently leave the NOAA adapter reachable only from tests.
 */
export function productionForecastSource(
  spotsById: ReadonlyMap<string, SpotCoordinate>,
  clock: Clock,
  fetchImpl: typeof fetch = fetch,
): ForecastSource {
  return registryForecastSource([
    { id: 'open-meteo', source: new OpenMeteoForecastSource(spotsById, clock, fetchImpl) },
    { id: 'noaa-gfswave', source: new NoaaGfswaveForecastSource(spotsById, clock, fetchImpl) },
  ]);
}

export function registryForecastSource(entries: readonly RegistryEntry[]): ForecastSource {
  return {
    fetchWavePayload: (spotId) => foldFetch(entries, (entry) => entry.source.fetchWavePayload(spotId)),
    parseWaveMembers: (verbatim) =>
      foldParse(entries, (entry) => entry.source.parseWaveMembers(verbatim), () => ({ ok: false, reason: 'malformed' })),
    fetchWindPayload: (spotId) => foldFetch(entries, (entry) => entry.source.fetchWindPayload(spotId)),
    parseWind: (verbatim) => foldParse(entries, (entry) => entry.source.parseWind(verbatim), firstReasonOrMalformed),
    fetchTidePayload: (spotId) => foldFetch(entries, (entry) => entry.source.fetchTidePayload(spotId)),
    parseTide: (verbatim) => foldParse(entries, (entry) => entry.source.parseTide(verbatim), firstReasonOrMalformed),
  };
}

/**
 * Priority fold over one fetch method. The first entry to answer ok wins and
 * every entry after it is never invoked (roadmap 04-03: "the acceptance stub
 * counts ZERO fallback calls under a healthy primary"). When every entry
 * fails, the first entry's own reason survives, because the primary's
 * failure is the diagnostically honest one; when every entry happens to be
 * 'dark' this already reads as 'dark', which is the wind/tide fold's stated
 * requirement (roadmap 04-03: "prefer 'dark' when every entry said dark").
 */
async function foldFetch(
  entries: readonly RegistryEntry[],
  attempt: (entry: RegistryEntry) => Promise<ReceivedSourcePayload>,
): Promise<ReceivedSourcePayload> {
  let firstFailure: ReceivedSourcePayload | null = null;
  for (const entry of entries) {
    const payload = await attempt(entry);
    if (payload.ok) return payload;
    if (firstFailure === null) firstFailure = payload;
  }
  return firstFailure ?? { ok: false, reason: 'error' };
}

/**
 * Priority fold over one parse method. The first entry whose parser accepts
 * the payload wins. An entry's parser THROWING (rejecting bytes it does not
 * own) counts as not-ok for routing and never escapes the fold: it is not
 * this parser's payload to reject on behalf of the whole registry, the next
 * entry still deserves its turn. `onAllRejected` lets the wave routing (which
 * always reports 'malformed' when nothing accepts) and the wind/tide routing
 * (which prefers the first entry's own reason, honouring an honest 'dark')
 * share this one fold instead of diverging into two copies.
 */
function foldParse<T>(
  entries: readonly RegistryEntry[],
  attempt: (entry: RegistryEntry) => SourceResult<T>,
  onAllRejected: (firstReason: SourceResult<T> | null) => SourceResult<T>,
): SourceResult<T> {
  let firstReason: SourceResult<T> | null = null;
  for (const entry of entries) {
    let result: SourceResult<T>;
    try {
      result = attempt(entry);
    } catch {
      continue;
    }
    if (result.ok) return result;
    if (firstReason === null) firstReason = result;
  }
  return onAllRejected(firstReason);
}

function firstReasonOrMalformed<T>(firstReason: SourceResult<T> | null): SourceResult<T> {
  return firstReason ?? { ok: false, reason: 'malformed' };
}
