// The CO-OPS adapter gets an already-validated profile map from the profile
// smart constructor. No test fixture invents a local observation record.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CoopsTideSource } from '../../src/pipeline/adapters/coops-tide-source';
import type { AcceptedTideStationProfile } from '../../src/pipeline/adapters/tide-station-profiles';

const CLOCK = { now: () => new Date('2026-08-13T11:20:00Z') };

describe('CoopsTideSource', () => {
  it('Property: every unassigned spot stays dark without a network request', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 40 }), async (spotId) => {
        let requests = 0;
        const source = new CoopsTideSource(new Map(), CLOCK, async () => {
          requests += 1;
          return new Response('{}');
        });

        expect(await source.fetchTidePayload(spotId)).toEqual({ ok: false, reason: 'dark' });
        expect(requests).toBe(0);
      }),
      { numRuns: 25 },
    );
  });

  it('requests metric GMT hourly predictions only for a validated assignment and parses the returned tide hours', async () => {
    // This opaque value models the output of validateAcceptedTideStationProfiles;
    // it deliberately contains no fabricated observation evidence.
    const accepted = { spot_id: 'playa-venao', station_id: '9812501' } as unknown as AcceptedTideStationProfile;
    const requested: string[] = [];
    const source = new CoopsTideSource(new Map([[accepted.spot_id, accepted]]), CLOCK, async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ predictions: [{ t: '2026-08-13 12:00', v: '1.25' }] }), { status: 200 });
    });

    const payload = await source.fetchTidePayload('playa-venao');
    expect(payload).toMatchObject({ ok: true, provider: 'noaa-coops' });
    const url = new URL(requested[0]!);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      product: 'predictions', station: '9812501', units: 'metric', time_zone: 'gmt', interval: 'h', format: 'json',
      begin_date: '20260813', end_date: '20260820', datum: 'MLLW',
    });
    if (!payload.ok) throw new Error('unreachable');
    expect(source.parseTide(payload.verbatim)).toEqual({ ok: true, data: [{ valid_ts: '2026-08-13T12:00:00Z', tide_m: 1.25 }] });
  });
});
