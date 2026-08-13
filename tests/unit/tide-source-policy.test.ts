// Trust Slice 02 policy boundary: a candidate station can never become a
// production mapping. This test intentionally supplies no invented validation
// record; candidate status alone must be refused.

import { describe, expect, it } from 'vitest';

import type { ForecastSource } from '../../src/pipeline/ports';
import { shippedTideStationProfiles } from '../../src/pipeline/adapters/tide-station-profiles';

describe('production tide-source composition', () => {
  it('ships no active tide station mappings', () => {
    expect(shippedTideStationProfiles).toEqual({ version: 1, profiles: [] });
  });

  it('refuses a candidate station profile instead of treating it as an active mapping', () => {
    type ProductionFactory = (
      spotsById: ReadonlyMap<string, { readonly spot_id: string; readonly lat: number; readonly lon: number }>,
      clock: { readonly now: () => Date },
      fetchImpl: typeof fetch,
      stationProfiles: unknown,
    ) => ForecastSource;
    return import('../../src/pipeline/adapters/source-registry').then((registry) => {
      const factory = (registry as { readonly productionForecastSource?: ProductionFactory }).productionForecastSource;
      expect(typeof factory).toBe('function');
      if (factory === undefined) throw new Error('unreachable');

      const spots = new Map([['playa-venao', { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 }]]);
      const candidate = { version: 1, profiles: [{ status: 'candidate', spot_id: 'playa-venao', station_id: '9812501' }] };
      expect(() => factory(spots, { now: () => new Date('2026-08-13T00:00:00Z') }, fetch, candidate)).toThrow(/candidate/i);
    });
  });
});
