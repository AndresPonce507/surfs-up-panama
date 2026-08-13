// Unit oracles for the registry seam (roadmap 04-03; adr-openmeteo-vs-raw-
// grib2.md decision 2, "a registry change plus one adapter"). Every entry is
// a pure function stub, no mock library: the registry's whole contract is a
// priority fold over ForecastSource, so a fake that counts its own calls is
// enough to prove the zero-calls-under-a-healthy-primary guarantee (roadmap
// 04-03: "the same physical model must never feed the member table twice").
//
// Every property below is a house-style fold law, not an example dressed up:
// "the fold returns the first ok answer and stops" is one behaviour whether
// the winner sits at index 0 or index 4, so it is pinned once as a property
// over generated entry lists rather than as N hand-picked examples.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { registryForecastSource, type RegistryEntry } from '../../src/pipeline/adapters/source-registry';
import type {
  ForecastSource,
  MemberSeries,
  ReceivedSourcePayload,
  SourceResult,
  TideHour,
  WindHour,
} from '../../src/pipeline/ports';

type Calls = { wave: number; wind: number; tide: number; parseWave: number; parseWind: number; parseTide: number };

function newCalls(): Calls {
  return { wave: 0, wind: 0, tide: 0, parseWave: 0, parseWind: 0, parseTide: 0 };
}

/** Whether an entry's wave parser accepts, rejects, or throws when routing
 * tries it: 'throw' proves the fold survives a parser that rejects bytes it
 * does not own by raising instead of returning ok:false. */
type WaveParseBehavior = SourceResult<MemberSeries[]> | 'throw';

/**
 * A pure function stub honouring the ForecastSource port. Counts every call
 * it receives on the shared `calls` object so a test can assert an entry was
 * never consulted, without a mock library (house style: test doubles are
 * functions).
 */
function stubSource(options: {
  readonly calls: Calls;
  readonly waveFetch: ReceivedSourcePayload;
  readonly waveParse?: WaveParseBehavior;
  readonly windFetch?: ReceivedSourcePayload;
  readonly windParse?: SourceResult<WindHour[]>;
  readonly tideFetch?: ReceivedSourcePayload;
  readonly tideParse?: SourceResult<TideHour[]>;
}): ForecastSource {
  return {
    async fetchWavePayload() {
      options.calls.wave += 1;
      return options.waveFetch;
    },
    parseWaveMembers() {
      options.calls.parseWave += 1;
      const behavior = options.waveParse ?? { ok: false, reason: 'malformed' };
      if (behavior === 'throw') throw new Error('stub refuses bytes it does not own');
      return behavior;
    },
    async fetchWindPayload() {
      options.calls.wind += 1;
      return options.windFetch ?? { ok: false, reason: 'dark' };
    },
    parseWind() {
      options.calls.parseWind += 1;
      return options.windParse ?? { ok: false, reason: 'dark' };
    },
    async fetchTidePayload() {
      options.calls.tide += 1;
      return options.tideFetch ?? { ok: false, reason: 'dark' };
    },
    parseTide() {
      options.calls.parseTide += 1;
      return options.tideParse ?? { ok: false, reason: 'dark' };
    },
  };
}

function okPayload(provider: string, verbatim: string): ReceivedSourcePayload {
  return { ok: true, verbatim, provider };
}

describe('registryForecastSource: fetch priority fold', () => {
  it('Property: returns the first ok entry and never calls an entry after the winner', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }).chain((size) => fc.record({
          size: fc.constant(size),
          winner: fc.integer({ min: 0, max: size - 1 }),
        })),
        async ({ size, winner }) => {
          const calls: Calls[] = Array.from({ length: size }, () => newCalls());
          const entries: RegistryEntry[] = Array.from({ length: size }, (_, index) => ({
            id: `entry-${index}`,
            source: stubSource({
              calls: calls[index]!,
              waveFetch: index === winner
                ? okPayload(`provider-${index}`, `bytes-${index}`)
                : { ok: false, reason: 'error' },
            }),
          }));

          const registry = registryForecastSource(entries);
          const result = await registry.fetchWavePayload('playa-venao');

          expect(result).toEqual(okPayload(`provider-${winner}`, `bytes-${winner}`));
          for (let index = 0; index <= winner; index += 1) {
            expect(calls[index]!.wave).toBe(1);
          }
          for (let index = winner + 1; index < size; index += 1) {
            expect(calls[index]!.wave).toBe(0);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('the second source receives zero calls when the primary is healthy (the never-double-feed guarantee)', async () => {
    const primaryCalls = newCalls();
    const fallbackCalls = newCalls();
    const primary = stubSource({ calls: primaryCalls, waveFetch: okPayload('open-meteo-marine', 'primary-bytes') });
    const fallback = stubSource({ calls: fallbackCalls, waveFetch: okPayload('noaa-gfswave', 'fallback-bytes') });

    const registry = registryForecastSource([{ id: 'open-meteo', source: primary }, { id: 'noaa-gfswave', source: fallback }]);
    const result = await registry.fetchWavePayload('playa-venao');

    expect(result).toEqual(okPayload('open-meteo-marine', 'primary-bytes'));
    expect(fallbackCalls.wave).toBe(0);
  });

  it('falls through to the independent source when the primary is dark, and its own provider survives untouched', async () => {
    const primaryCalls = newCalls();
    const fallbackCalls = newCalls();
    const primary = stubSource({ calls: primaryCalls, waveFetch: { ok: false, reason: 'error' } });
    const fallback = stubSource({ calls: fallbackCalls, waveFetch: okPayload('noaa-gfswave', 'fallback-bytes') });

    const registry = registryForecastSource([{ id: 'open-meteo', source: primary }, { id: 'noaa-gfswave', source: fallback }]);
    const result = await registry.fetchWavePayload('playa-venao');

    expect(primaryCalls.wave).toBe(1);
    expect(fallbackCalls.wave).toBe(1);
    expect(result).toEqual(okPayload('noaa-gfswave', 'fallback-bytes'));
  });

  it('reports the first entry\'s failure reason when every entry fails to deliver', async () => {
    const first = stubSource({ calls: newCalls(), waveFetch: { ok: false, reason: 'stale' } });
    const second = stubSource({ calls: newCalls(), waveFetch: { ok: false, reason: 'error' } });

    const registry = registryForecastSource([{ id: 'first', source: first }, { id: 'second', source: second }]);
    const result = await registry.fetchWavePayload('playa-venao');

    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('wires the production primary and independent fallback through this registry', async () => {
    type ProductionFactory = (
      spotsById: ReadonlyMap<string, { readonly spot_id: string; readonly lat: number; readonly lon: number }>,
      clock: { readonly now: () => Date },
      fetchImpl: typeof fetch,
    ) => ForecastSource;
    const module = await import('../../src/pipeline/adapters/source-registry') as unknown as {
      readonly productionForecastSource?: ProductionFactory;
    };
    if (typeof module.productionForecastSource !== 'function') {
      throw new Error('the production source registry is not wired into the ForecastSource port');
    }

    const spots = new Map([['playa-venao', { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 }]]);
    const clock = { now: () => new Date('2026-08-13T08:02:14Z') };

    const healthyUrls: string[] = [];
    const healthyFetch: typeof fetch = async (input) => {
      const url = String(input);
      healthyUrls.push(url);
      return new Response('{}', { status: 200 });
    };
    const healthy = await module.productionForecastSource(spots, clock, healthyFetch).fetchWavePayload('playa-venao');
    expect(healthy).toMatchObject({ ok: true, provider: 'open-meteo-marine' });
    expect(healthyUrls).toHaveLength(1);
    expect(healthyUrls[0]).toContain('marine-api.open-meteo.com');

    const darkPrimaryUrls: string[] = [];
    const darkPrimaryFetch: typeof fetch = async (input) => {
      const url = String(input);
      darkPrimaryUrls.push(url);
      return url.includes('marine-api.open-meteo.com')
        ? new Response('', { status: 503 })
        : new Response('GRIB2 fallback bytes', { status: 200 });
    };
    const fallback = await module.productionForecastSource(spots, clock, darkPrimaryFetch).fetchWavePayload('playa-venao');
    expect(fallback).toMatchObject({ ok: true, provider: 'noaa-gfswave' });
    expect(darkPrimaryUrls.filter((url) => url.includes('marine-api.open-meteo.com'))).toHaveLength(2);
    expect(darkPrimaryUrls.filter((url) => url.includes('filter_gfswave.pl'))).toHaveLength(17);
  });
});

describe('registryForecastSource: parse routing', () => {
  it('routes to the entry whose parser accepts, surviving an earlier entry whose parser throws', () => {
    const throwing = stubSource({ calls: newCalls(), waveFetch: { ok: false, reason: 'error' }, waveParse: 'throw' });
    const accepting = stubSource({
      calls: newCalls(),
      waveFetch: { ok: false, reason: 'error' },
      waveParse: { ok: true, data: [{ source: 'ncep_gfswave016', run_ts: '2026-08-13T00:00Z', hours: [] }] },
    });

    const registry = registryForecastSource([{ id: 'throwing', source: throwing }, { id: 'accepting', source: accepting }]);
    const result = registry.parseWaveMembers('some-envelope');

    expect(result).toEqual({ ok: true, data: [{ source: 'ncep_gfswave016', run_ts: '2026-08-13T00:00Z', hours: [] }] });
  });

  it('reports malformed when every entry\'s parser rejects the payload', () => {
    const first = stubSource({ calls: newCalls(), waveFetch: { ok: false, reason: 'error' }, waveParse: { ok: false, reason: 'malformed' } });
    const second = stubSource({ calls: newCalls(), waveFetch: { ok: false, reason: 'error' }, waveParse: 'throw' });

    const registry = registryForecastSource([{ id: 'first', source: first }, { id: 'second', source: second }]);
    const result = registry.parseWaveMembers('bytes-nobody-recognises');

    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('registryForecastSource: wind and tide fold', () => {
  it('folds wind and tide the same way: first ok wins, and reports dark when every entry stays dark', async () => {
    const primaryCalls = newCalls();
    const fallbackCalls = newCalls();
    const primary = stubSource({ calls: primaryCalls, waveFetch: { ok: false, reason: 'error' } });
    const fallback = stubSource({ calls: fallbackCalls, waveFetch: { ok: false, reason: 'error' } });

    const registry = registryForecastSource([{ id: 'primary', source: primary }, { id: 'fallback', source: fallback }]);

    const windResult = await registry.fetchWindPayload('playa-venao');
    const tideResult = await registry.fetchTidePayload('playa-venao');
    const parsedWind = registry.parseWind('irrelevant');
    const parsedTide = registry.parseTide('irrelevant');

    expect(windResult).toEqual({ ok: false, reason: 'dark' });
    expect(tideResult).toEqual({ ok: false, reason: 'dark' });
    expect(parsedWind).toEqual({ ok: false, reason: 'dark' });
    expect(parsedTide).toEqual({ ok: false, reason: 'dark' });
  });

  it('wind fold: the second entry\'s ok wind reading wins when the primary reports dark', async () => {
    const primary = stubSource({ calls: newCalls(), waveFetch: { ok: false, reason: 'error' }, windFetch: { ok: false, reason: 'dark' } });
    const fallback = stubSource({
      calls: newCalls(),
      waveFetch: { ok: false, reason: 'error' },
      windFetch: okPayload('some-wind-vendor', 'wind-bytes'),
    });

    const registry = registryForecastSource([{ id: 'primary', source: primary }, { id: 'fallback', source: fallback }]);
    const result = await registry.fetchWindPayload('playa-venao');

    expect(result).toEqual(okPayload('some-wind-vendor', 'wind-bytes'));
  });
});
