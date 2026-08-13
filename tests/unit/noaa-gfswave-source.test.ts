// Unit oracles for the second, independent wave vendor (roadmap 04-02;
// adr-openmeteo-vs-raw-grib2.md decision 3). Every test drives the real
// captured NOAA gfswave grib_filter bytes committed at
// tests/acceptance/f-know-how-much-to-trust-it/fixtures/noaa-gfswave-20260813/
// (capture-receipt.json is the forensic record of the real request/response
// pair), through a stub fetchImpl. Nothing here ever reaches the network.
//
// The Venao case is the one the roadmap pins by name: the spot's exact
// 0.16-degree cell is land-masked in this grid, and the nearest ocean cell
// (real distance in metres, cos(lat)-scaled) is one step east, reading
// 0.76 m / 14.43 s / 194.65 deg at f018 (2026-08-13T18:00Z) and 0.78 m /
// 18.76 s at f042 (2026-08-14T18:00Z). See the adapter's own header comment
// for why "nearest" is measured from the spot's own cell rather than its raw
// coordinate: at this latitude an east/west grid step is a hair shorter in
// real metres than a north/south one.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NoaaGfswaveForecastSource } from '../../src/pipeline/adapters/noaa-gfswave-source';
import type { SpotCoordinate } from '../../src/pipeline/adapters/spot-coordinates';
import type { Clock } from '../../src/pipeline/ports';

const NOAA_DIR = join(import.meta.dirname, '../acceptance/f-know-how-much-to-trust-it/fixtures/noaa-gfswave-20260813');
const RECEIPT = JSON.parse(readFileSync(join(NOAA_DIR, 'capture-receipt.json'), 'utf8')) as {
  requests: readonly { url: string; body_file: string; sha256: string }[];
};

const HOUSE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;

// The spot's real coordinate (matches VENAO_COORD in the slice-04 acceptance
// steps): its exact grid cell is land-masked in the committed capture.
const VENAO: SpotCoordinate = { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 };
// Same grid, a coordinate whose exact cell is already ocean: it decodes to
// the identical cell Venao's neighbour search lands on (verified against the
// same fixture bytes), which is exactly what makes it useful as the "no
// search needed" control case.
const EXACT_OCEAN_SPOT: SpotCoordinate = { spot_id: 'exact-ocean-control', lat: 7.4320526, lon: -80.0328532 };
// A coordinate whose exact cell AND every cell within the two-cell search
// radius are land, verified against the same real capture.
const ALL_MASKED_SPOT: SpotCoordinate = { spot_id: 'all-masked-control', lat: 8.0, lon: -81.0 };

function pinnedClock(): Clock {
  // Inside the acceptance contract's INGEST_AT window: the 00Z cycle has
  // cleared its 5-hour latency (08:02 >= 05:00) and the 06Z cycle has not
  // (08:02 < 11:00), so the newest ELIGIBLE cycle is 2026-08-13T00:00Z.
  return { now: () => new Date('2026-08-13T08:02:14Z') };
}

function spotsById(...spots: readonly SpotCoordinate[]): ReadonlyMap<string, SpotCoordinate> {
  return new Map(spots.map((spot) => [spot.spot_id, spot]));
}

/** Serves the committed real bytes for whichever forecast hour the composed
 * URL asks for, regardless of the requested window bounds: the fixture grid
 * already covers every coordinate these tests use. `statusOverrides` lets one
 * test make a single sub-request fail without touching the other 16. */
function noaaFetchStub(statusOverrides: Readonly<Record<string, number>> = {}): { fetchImpl: typeof fetch; requestedUrls: string[] } {
  const requestedUrls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    const forecastHour = /file=gfswave\.t00z\.global\.0p16\.(f\d{3})\.grib2/.exec(url)?.[1];
    const overrideStatus = forecastHour === undefined ? undefined : statusOverrides[forecastHour];
    if (overrideStatus !== undefined) return new Response('', { status: overrideStatus });
    const captured = RECEIPT.requests.find((request) => forecastHour !== undefined && request.url.includes(`.${forecastHour}.`));
    if (captured === undefined) return new Response('', { status: 404 });
    return new Response(readFileSync(join(NOAA_DIR, captured.body_file)), { status: 200 });
  };
  return { fetchImpl, requestedUrls };
}

type CapturedEnvelope = {
  readonly capture: string;
  readonly provider: string;
  readonly requests: { url: string; body_b64: string; sha256: string }[];
};

describe('NoaaGfswaveForecastSource', () => {
  it('composes the 17 grib_filter URLs byte-equal to the committed capture receipt', async () => {
    const { fetchImpl, requestedUrls } = noaaFetchStub();
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock(), fetchImpl);

    const result = await source.fetchWavePayload(VENAO.spot_id);

    expect(result.ok).toBe(true);
    expect(requestedUrls).toEqual(RECEIPT.requests.map((request) => request.url));
  });

  it('round-trips the capture envelope: every part verifies its receipted sha256, and parsing yields 17 house-precision hours', async () => {
    const { fetchImpl } = noaaFetchStub();
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock(), fetchImpl);

    const payload = await source.fetchWavePayload(VENAO.spot_id);
    expect(payload.ok).toBe(true);
    if (!payload.ok) throw new Error('unreachable');

    const envelope = JSON.parse(payload.verbatim) as CapturedEnvelope;
    expect(envelope.capture).toBe('noaa-gfswave-grib2/v1');
    expect(envelope.provider).toBe('noaa-gfswave');
    expect(envelope.requests).toHaveLength(17);
    for (const part of envelope.requests) {
      expect(createHash('sha256').update(Buffer.from(part.body_b64, 'base64')).digest('hex')).toBe(part.sha256);
    }

    const parsed = source.parseWaveMembers(payload.verbatim);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.data).toHaveLength(1);
    const member = parsed.data[0]!;
    expect(member.source).toBe('ncep_gfswave016');
    // 04-03's Given asserts row.run_ts === HOUSE_CYCLE ('2026-08-13T00:00Z')
    // literally; a regex alone would pass a Section-1 decode drifted by an
    // hour and break that acceptance step.
    expect(member.run_ts).toBe('2026-08-13T00:00Z');
    for (const hour of member.hours) expect(hour.valid_ts).toMatch(HOUSE_TIMESTAMP_PATTERN);
    // Ascending, one per valid_ts, run+offset arithmetic pinned across the
    // whole f000..f048 window, not just the two spot checks below.
    expect(member.hours.map((hour) => hour.valid_ts)).toEqual([
      '2026-08-13T00:00Z', '2026-08-13T03:00Z', '2026-08-13T06:00Z', '2026-08-13T09:00Z',
      '2026-08-13T12:00Z', '2026-08-13T15:00Z', '2026-08-13T18:00Z', '2026-08-13T21:00Z',
      '2026-08-14T00:00Z', '2026-08-14T03:00Z', '2026-08-14T06:00Z', '2026-08-14T09:00Z',
      '2026-08-14T12:00Z', '2026-08-14T15:00Z', '2026-08-14T18:00Z', '2026-08-14T21:00Z',
      '2026-08-15T00:00Z',
    ]);
  });

  it('reads the real Venao values: exact cell land-masked, nearest ocean cell one step east', async () => {
    const { fetchImpl } = noaaFetchStub();
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock(), fetchImpl);
    const payload = await source.fetchWavePayload(VENAO.spot_id);
    if (!payload.ok) throw new Error('unreachable');
    const parsed = source.parseWaveMembers(payload.verbatim);
    if (!parsed.ok) throw new Error('unreachable');
    const hours = parsed.data[0]!.hours;

    const f018 = hours.find((hour) => hour.valid_ts === '2026-08-13T18:00Z');
    expect(f018?.land_masked).toBe(false);
    expect(f018?.swell.h_m).toBeCloseTo(0.76, 2);
    expect(f018?.swell.t_s).toBeCloseTo(14.43, 2);
    expect(f018?.swell.dir_deg).toBeCloseTo(194.65, 1);

    const f042 = hours.find((hour) => hour.valid_ts === '2026-08-14T18:00Z');
    expect(f042?.land_masked).toBe(false);
    expect(f042?.swell.h_m).toBeCloseTo(0.78, 2);
    expect(f042?.swell.t_s).toBeCloseTo(18.76, 2);
  });

  it('refuses a part whose bytes no longer match its receipted sha256', async () => {
    const { fetchImpl } = noaaFetchStub();
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock(), fetchImpl);
    const payload = await source.fetchWavePayload(VENAO.spot_id);
    if (!payload.ok) throw new Error('unreachable');
    const envelope = JSON.parse(payload.verbatim) as CapturedEnvelope;

    const firstPart = envelope.requests[0]!;
    const corruptedBytes = Buffer.from(firstPart.body_b64, 'base64');
    // Byte 400 sits deep inside message 0's section 7 (packed data, offsets
    // 242..675 for this fixture): far from the GRIB magic, section-length
    // fields and the 7777 end marker, so the corruption is only ever caught
    // by the sha256 check, never by GRIB2 structural parsing.
    corruptedBytes[400] = (corruptedBytes[400] ?? 0) ^ 0xff;
    envelope.requests[0] = { ...firstPart, body_b64: corruptedBytes.toString('base64') };

    expect(source.parseWaveMembers(JSON.stringify(envelope))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses the real Open-Meteo response, not its own capture envelope', () => {
    // The exact body 04-03's registry will hand this parser when it tries
    // every entry's parser in priority order: the committed same-cycle
    // capture, not a synthetic two-key stand-in.
    const openMeteoBody = readFileSync(
      join(import.meta.dirname, '../acceptance/f-know-how-much-to-trust-it/fixtures/open-meteo-marine-playa-venao-20260813.json'),
      'utf8',
    );
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock());

    expect(source.parseWaveMembers(openMeteoBody)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reports the whole payload dark when one of the 17 sub-requests fails', async () => {
    const { fetchImpl } = noaaFetchStub({ f024: 404 });
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock(), fetchImpl);

    const result = await source.fetchWavePayload(VENAO.spot_id);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('reads the exact cell directly when it is already ocean: no neighbour search needed', async () => {
    const { fetchImpl } = noaaFetchStub();
    const source = new NoaaGfswaveForecastSource(spotsById(EXACT_OCEAN_SPOT), pinnedClock(), fetchImpl);
    const payload = await source.fetchWavePayload(EXACT_OCEAN_SPOT.spot_id);
    if (!payload.ok) throw new Error('unreachable');
    const parsed = source.parseWaveMembers(payload.verbatim);
    if (!parsed.ok) throw new Error('unreachable');

    const f018 = parsed.data[0]!.hours.find((hour) => hour.valid_ts === '2026-08-13T18:00Z');
    expect(f018?.land_masked).toBe(false);
    expect(f018?.swell.h_m).toBeCloseTo(0.76, 2);
    expect(f018?.swell.t_s).toBeCloseTo(14.43, 2);
    expect(f018?.swell.dir_deg).toBeCloseTo(194.65, 1);
  });

  it('stays land_masked when every cell within the search radius is land', async () => {
    const { fetchImpl } = noaaFetchStub();
    const source = new NoaaGfswaveForecastSource(spotsById(ALL_MASKED_SPOT), pinnedClock(), fetchImpl);
    const payload = await source.fetchWavePayload(ALL_MASKED_SPOT.spot_id);
    if (!payload.ok) throw new Error('unreachable');
    const parsed = source.parseWaveMembers(payload.verbatim);
    if (!parsed.ok) throw new Error('unreachable');

    const f018 = parsed.data[0]!.hours.find((hour) => hour.valid_ts === '2026-08-13T18:00Z');
    expect(f018?.land_masked).toBe(true);
    expect(f018?.swell).toEqual({ h_m: 0, t_s: 0, dir_deg: 0 });
  });

  it('reports wind and tide dark: they stay with their own dedicated providers', async () => {
    const source = new NoaaGfswaveForecastSource(spotsById(VENAO), pinnedClock());

    expect(await source.fetchWindPayload(VENAO.spot_id)).toEqual({ ok: false, reason: 'dark' });
    expect(source.parseWind('')).toEqual({ ok: false, reason: 'dark' });
    expect(await source.fetchTidePayload(VENAO.spot_id)).toEqual({ ok: false, reason: 'dark' });
    expect(source.parseTide('')).toEqual({ ok: false, reason: 'dark' });
  });
});
