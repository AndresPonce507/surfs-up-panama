import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NoaaGfswaveForecastSource } from '../../src/pipeline/adapters/noaa-gfswave-grib2';

const FIXTURE_DIRECTORY = join(import.meta.dirname, '../acceptance/f-know-how-much-to-trust-it/fixtures/noaa-gfswave-grib2');
const RECEIPT = JSON.parse(readFileSync(join(FIXTURE_DIRECTORY, 'capture-receipt.json'), 'utf8')) as {
  request: { url: string };
  response: { body_file: string; byte_count: number; sha256: string };
};
const CAPTURED_RESPONSE = readFileSync(join(FIXTURE_DIRECTORY, RECEIPT.response.body_file));

describe('NoaaGfswaveForecastSource (real GRIB2 response at the production port)', () => {
  it('requests the documented filter URL, preserves its exact bytes, and emits the independently recorded normalized member', async () => {
    const requested: string[] = [];
    const source = new NoaaGfswaveForecastSource(
      new Map([['playa-venao', { spot_id: 'playa-venao', lat: 8, lon: -81 }]]),
      { now: () => new Date('2026-08-08T12:00:00Z') },
      async (input) => {
        requested.push(String(input));
        return new Response(CAPTURED_RESPONSE, { status: 200 });
      },
    );

    const result = await source.fetchWaveMembers('playa-venao');

    expect(requested).toEqual([RECEIPT.request.url]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect([...result.verbatim]).toEqual([...CAPTURED_RESPONSE]);
    expect(createHash('sha256').update(result.verbatim).digest('hex')).toBe(RECEIPT.response.sha256);
    expect(result.data).toEqual([{
      source: 'ncep_gfswave016',
      run_ts: '2026-08-08T00:00:00.000Z',
      hours: [{
        valid_ts: '2026-08-08T00:00:00.000Z',
        swell: { h_m: 0, t_s: 0, dir_deg: 0 },
        swell2: null,
        land_masked: true,
      }],
    }]);
    expect(CAPTURED_RESPONSE.byteLength).toBe(RECEIPT.response.byte_count);
  });
});
