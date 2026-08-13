// The one-time, out-of-band capture composition root. Real filesystem I/O
// (Mandate 6); the ForecastSource itself is overridable so this suite proves
// the wiring (predictions land under the documented key, provenance is
// written and honestly reflects what was captured) without a network call.
// The real Open-Meteo network path is proven separately by the committed
// snapshot under data/predictions-capture/ (captured once, live, out of
// band) plus run-build-cli.test.ts's real-snapshot integration test.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCapture } from '../../src/pipeline/capture-cli';
import type { ForecastSource, MemberSeries, ReceivedSourcePayload, SourceResult, TideHour, WindHour } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const RUN_TS = '2026-08-09T06:00Z';

const VENAO_SEED: SpotSeed = {
  spot_id: 'playa-venao',
  name: 'Playa Venao',
  region_id: 'pa-pacific',
  timezone: 'America/Panama',
  shore_normal_deg: 158,
  swell_window_deg: [135, 225],
  h_ref_m: 1.3,
  s_size: 0.5,
  wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
  tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
};

class StubSource implements ForecastSource {
  fetchWavePayload(spot_id: string): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: true as const, verbatim: JSON.stringify({ spot_id }) });
  }

  parseWaveMembers(): SourceResult<MemberSeries[]> {
    const data: MemberSeries[] = [{
      source: 'ncep_gfswave016',
      run_ts: RUN_TS,
      hours: [{ valid_ts: '2026-08-09T18:00Z', swell: { h_m: 1.1, t_s: 14, dir_deg: 204 }, swell2: null, land_masked: false }],
    }];
    return { ok: true, data };
  }

  fetchWindPayload(): Promise<ReceivedSourcePayload> { return Promise.resolve({ ok: true as const, verbatim: '{}' }); }
  parseWind(): SourceResult<WindHour[]> {
    return { ok: true, data: [{ valid_ts: '2026-08-09T18:00Z', wind: { speed_kt: 6, dir_deg: 40 } }] };
  }

  fetchTidePayload(): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false as const, reason: 'dark' as const });
  }
  parseTide(): SourceResult<TideHour[]> { return { ok: false, reason: 'dark' }; }
}

describe('runCapture (one-time real-data snapshot composition root)', () => {
  let out: string;

  beforeEach(async () => {
    out = await mkdtemp(join(tmpdir(), 'surfs-up-capture-'));
  });

  afterEach(async () => {
    await rm(out, { recursive: true, force: true });
  });

  it('writes a prediction row under the documented S3-shaped key and a provenance file naming what ran', async () => {
    const result = await runCapture(['--out', out], {
      source: new StubSource(),
      spots: [VENAO_SEED],
      clock: { now: () => new Date('2026-08-09T14:00:00Z') },
    });

    const written = gunzipSync(await readFile(
      // The partition names the forecast window this cycle had published when
      // the capture ran, so a window that rolls forward under an unchanged
      // cycle files its new hours instead of colliding with them
      // (adr-prediction-log-format.md decision 6).
      join(out, 'predictions/v1/dt=2026-08-09/src=ncep_gfswave016/cyc=06Z/all-window-1f80b4df4d072b78.jsonl.gz'),
    )).toString('utf8');
    expect(written).toContain('"spot_id":"playa-venao"');

    const provenance = JSON.parse(await readFile(result.provenancePath, 'utf8')) as {
      captured_at: string;
      tide: { fetched: boolean };
      coverage: { date: string; sources_present: string[] }[];
    };
    expect(provenance.captured_at).toBe('2026-08-09T14:00:00.000Z');
    expect(provenance.tide.fetched).toBe(false);
    expect(provenance.coverage.find((c) => c.date === '2026-08-09')?.sources_present).toEqual(['ncep_gfswave016']);
  });
});
