// The Lambda composition root for the hourly Fetch run, proven through its
// own driving surface (the exported `runFetch`), the same pattern
// capture-cli.test.ts and run-build-cli.test.ts already use: real pipeline
// code (runIngestOnce), pure function stubs standing in for the network and
// for S3, so the wiring proves itself without a real AWS call. The real
// Open-Meteo + S3 path is out of scope here (Andres deploys, then the
// dead-man alarm proves it live); this suite proves the seam honestly
// reports what actually happened, never more.

import { describe, expect, it, vi } from 'vitest';

import { runFetch } from '../../src/pipeline/lambda/fetch-handler';
import { INGEST_SUCCESS_EVENT, PROVIDER_ERROR_EVENT } from '../../src/pipeline/lambda/log-events';
import type { ForecastSource, IngestStore, MemberSeries, SourceResult, TideHour, WindHour } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const VENAO: SpotSeed = {
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

class InMemoryIngestStore implements IngestStore {
  readonly rawKeys: string[] = [];
  readonly predictionKeys: string[] = [];

  async putRaw(key: string): Promise<void> {
    this.rawKeys.push(key);
  }

  async putPredictionIfAbsent(key: string): Promise<'created' | 'already-exists'> {
    this.predictionKeys.push(key);
    return 'created';
  }
}

class WorkingSource implements ForecastSource {
  fetchWaveMembers(spot_id: string): Promise<SourceResult<MemberSeries[]>> {
    const data: MemberSeries[] = [{
      source: 'ncep_gfswave016',
      run_ts: '2026-08-10T06:00Z',
      hours: [{ valid_ts: '2026-08-10T18:00Z', swell: { h_m: 1.1, t_s: 14, dir_deg: 204 }, swell2: null, land_masked: false }],
    }];
    return Promise.resolve({ ok: true, verbatim: JSON.stringify({ spot_id }), data });
  }

  fetchWind(): Promise<SourceResult<WindHour[]>> {
    return Promise.resolve({ ok: true, verbatim: '{}', data: [] });
  }

  fetchTide(): Promise<SourceResult<TideHour[]>> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }
}

class DarkSource implements ForecastSource {
  fetchWaveMembers(): Promise<SourceResult<MemberSeries[]>> {
    return Promise.resolve({ ok: false, reason: 'error' });
  }

  fetchWind(): Promise<SourceResult<WindHour[]>> {
    return Promise.resolve({ ok: false, reason: 'error' });
  }

  fetchTide(): Promise<SourceResult<TideHour[]>> {
    return Promise.resolve({ ok: false, reason: 'dark' });
  }
}

describe('runFetch (Lambda Fetch composition root)', () => {
  it('archives the raw payload, writes the prediction row, and logs ingest.success when the run genuinely produced data', async () => {
    const store = new InMemoryIngestStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runFetch({
      source: new WorkingSource(),
      store,
      spots: [VENAO],
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
    });

    expect(outcome.completed).toBe(true);
    expect(store.rawKeys).toContain('raw/open-meteo-marine/dt=2026-08-10/06/payload.json');
    expect(store.predictionKeys).toEqual(['predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz']);

    const loggedEvents = logSpy.mock.calls.map(([line]) => (JSON.parse(String(line)) as { event: string }).event);
    expect(loggedEvents).toContain(INGEST_SUCCESS_EVENT);

    logSpy.mockRestore();
  });

  it('never logs ingest.success, and logs provider.error instead, when every wave source is dark this run', async () => {
    const store = new InMemoryIngestStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runFetch({
      source: new DarkSource(),
      store,
      spots: [VENAO],
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
    });

    expect(outcome.completed).toBe(true);
    expect(store.predictionKeys).toEqual([]);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string });
    expect(loggedLines.some((line) => line.event === INGEST_SUCCESS_EVENT)).toBe(false);
    expect(loggedLines.some((line) => line.event === PROVIDER_ERROR_EVENT)).toBe(true);

    logSpy.mockRestore();
  });
});
