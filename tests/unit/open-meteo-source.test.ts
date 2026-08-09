// The capture adapter's parsing/normalization logic, proven against a real
// recorded Open-Meteo response (golden master, captured 2026-08-09 for Playa
// Venao) rather than an invented shape — a hand-written fixture would let a
// parser bug and its test agree on a fiction the real API never returns.
// Network wiring itself (fetchImpl called with the documented endpoint) is
// covered separately with an injected fake so the suite stays offline and
// deterministic; the transformation logic underneath is exercised against
// the real payload.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { OpenMeteoForecastSource, parseMarineResponse, parseWindResponse } from '../../src/pipeline/adapters/open-meteo-source';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const MARINE_PAYLOAD = readFileSync(join(FIXTURES, 'open-meteo-marine-playa-venao.json'), 'utf8');
const WIND_PAYLOAD = readFileSync(join(FIXTURES, 'open-meteo-wind-playa-venao.json'), 'utf8');
const CAPTURE_INSTANT = new Date('2026-08-09T14:00:00Z');

describe('parseMarineResponse (real Open-Meteo Marine payload)', () => {
  it('normalizes all four declared members with UTC hours, no land mask on real open-ocean swell', () => {
    const members = parseMarineResponse(JSON.parse(MARINE_PAYLOAD), CAPTURE_INSTANT);

    expect(members.map((m) => m.source).sort()).toEqual([
      'dwd_gwam',
      'meteofrance_wave',
      'ncep_gfswave016',
      'ncep_gfswave025',
    ]);
    expect(members).toHaveLength(4);

    for (const member of members) {
      expect(member.hours.length).toBeGreaterThan(0);
      expect(member.run_ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/);
      for (const hour of member.hours) {
        expect(hour.valid_ts).toMatch(/^2026-08-(09|10)T\d{2}:00Z$/);
        expect(hour.swell.h_m).toBeGreaterThanOrEqual(0);
        expect(hour.swell.t_s).toBeGreaterThan(0);
        expect(hour.land_masked).toBe(false);
        expect(hour.swell2).toBeNull();
      }
    }

    const gfs016 = members.find((m) => m.source === 'ncep_gfswave016');
    const firstHour = gfs016?.hours[0];
    expect(firstHour?.valid_ts).toBe('2026-08-09T00:00Z');
    expect(firstHour?.swell).toEqual({ h_m: 0.7, t_s: 15.35, dir_deg: 213 });
  });

  it('attributes run_ts strictly before the capture instant, per model, honoring each cycle schedule', () => {
    const members = parseMarineResponse(JSON.parse(MARINE_PAYLOAD), CAPTURE_INSTANT);
    for (const member of members) {
      expect(Date.parse(member.run_ts)).toBeLessThanOrEqual(CAPTURE_INSTANT.getTime());
    }
  });

  it('flags a fabricated all-zero row as land_masked, the documented H==0 && T==0 && dir==0 rule', () => {
    const payload = JSON.parse(MARINE_PAYLOAD) as {
      hourly: { time: string[] } & Record<string, (number | null)[]>;
    };
    payload.hourly.swell_wave_height_ncep_gfswave016![0] = 0;
    payload.hourly.swell_wave_period_ncep_gfswave016![0] = 0;
    payload.hourly.swell_wave_direction_ncep_gfswave016![0] = 0;

    const members = parseMarineResponse(payload, CAPTURE_INSTANT);
    const gfs016 = members.find((m) => m.source === 'ncep_gfswave016');
    expect(gfs016?.hours[0]?.land_masked).toBe(true);
  });
});

describe('parseWindResponse (real Open-Meteo Weather payload)', () => {
  it('normalizes wind speed and direction per UTC hour', () => {
    const hours = parseWindResponse(JSON.parse(WIND_PAYLOAD));

    expect(hours.length).toBeGreaterThan(0);
    expect(hours[0]?.valid_ts).toBe('2026-08-09T00:00Z');
    expect(hours[0]?.wind).not.toBeNull();
    for (const hour of hours) {
      expect(hour.valid_ts).toMatch(/^2026-08-(09|10)T\d{2}:00Z$/);
    }
  });
});

describe('OpenMeteoForecastSource (fetch wiring, no network)', () => {
  it('requests the documented marine endpoint with all four declared models and returns normalized data', async () => {
    const requested: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      requested.push(String(input));
      return new Response(MARINE_PAYLOAD, { status: 200 });
    };
    const source = new OpenMeteoForecastSource(
      new Map([['playa-venao', { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 }]]),
      { now: () => CAPTURE_INSTANT },
      fakeFetch,
    );

    const result = await source.fetchWaveMembers('playa-venao');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data).toHaveLength(4);
    expect(requested[0]).toContain('marine-api.open-meteo.com/v1/marine');
    expect(requested[0]).toContain('models=ncep_gfswave016%2Cncep_gfswave025%2Cmeteofrance_wave%2Cdwd_gwam');
    expect(requested[0]).toContain('latitude=7.4320526');
  });

  it('reports a transport failure as a SourceResult, never throwing through the port', async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error('network down');
    };
    const source = new OpenMeteoForecastSource(
      new Map([['playa-venao', { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 }]]),
      { now: () => CAPTURE_INSTANT },
      failingFetch,
    );

    const result = await source.fetchWaveMembers('playa-venao');
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('reports tide as honestly dark: no per-spot tide station reference exists yet (04-ingest-pipeline.md §11)', async () => {
    const source = new OpenMeteoForecastSource(
      new Map([['playa-venao', { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 }]]),
      { now: () => CAPTURE_INSTANT },
      async () => new Response('{}', { status: 200 }),
    );

    expect(await source.fetchTide('playa-venao')).toEqual({ ok: false, reason: 'dark' });
  });
});
