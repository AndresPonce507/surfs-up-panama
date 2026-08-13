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
import { INGEST_SUCCESS_EVENT, PROVIDER_ERROR_EVENT, STARTUP_REFUSED_EVENT, UNCHANGED_CYCLE_EVENT } from '../../src/pipeline/lambda/log-events';
import type { ForecastSource, IngestStore, MemberSeries, RawArchiveRecord, ReceivedSourcePayload, SourceResult, TideHour, WindHour } from '../../src/pipeline/ports';
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
  readonly predictions = new Map<string, string>();

  async putRawIfAbsent(record: RawArchiveRecord): Promise<'created'> {
    this.rawKeys.push(record.key);
    return 'created';
  }

  async putPredictionIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    if (this.predictions.has(key)) return 'already-exists';
    this.predictionKeys.push(key);
    this.predictions.set(key, body);
    return 'created';
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.predictions.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.predictions.get(key) ?? null;
  }
}

class WorkingSource implements ForecastSource {
  fetchWavePayload(spot_id: string): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: true as const, verbatim: JSON.stringify({ spot_id }) });
  }

  parseWaveMembers(): SourceResult<MemberSeries[]> {
    const data: MemberSeries[] = [{
      source: 'ncep_gfswave016',
      run_ts: '2026-08-10T06:00Z',
      hours: [{ valid_ts: '2026-08-10T18:00Z', swell: { h_m: 1.1, t_s: 14, dir_deg: 204 }, swell2: null, land_masked: false }],
    }];
    return { ok: true, data };
  }

  fetchWindPayload(): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: true as const, verbatim: '{}' });
  }
  parseWind(): SourceResult<WindHour[]> { return { ok: true, data: [] }; }

  fetchTidePayload(): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false as const, reason: 'dark' as const });
  }
  parseTide(): SourceResult<TideHour[]> { return { ok: false, reason: 'dark' }; }
}

class DarkSource implements ForecastSource {
  fetchWavePayload(): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false as const, reason: 'error' as const });
  }
  parseWaveMembers(): SourceResult<MemberSeries[]> { return { ok: false, reason: 'dark' }; }

  fetchWindPayload(): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false as const, reason: 'error' as const });
  }
  parseWind(): SourceResult<WindHour[]> { return { ok: false, reason: 'dark' }; }

  fetchTidePayload(): Promise<ReceivedSourcePayload> {
    return Promise.resolve({ ok: false as const, reason: 'dark' as const });
  }
  parseTide(): SourceResult<TideHour[]> { return { ok: false, reason: 'dark' }; }
}

describe('runFetch (Lambda Fetch composition root)', () => {
  it('refuses before any provider or S3 write when a startup substrate probe fails', async () => {
    const store = new InMemoryIngestStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const outcome = await runFetch({
      source: new WorkingSource(), store, spots: [VENAO], execution_id: 'evt-1',
      startup_probe: async () => { throw new Error('conditional put ignored'); },
    });
    expect(outcome).toEqual({ completed: false, events: [{ type: STARTUP_REFUSED_EVENT, detail: 'conditional put ignored' }] });
    expect(store.rawKeys).toEqual([]);
    expect(store.predictionKeys).toEqual([]);
    expect(logSpy.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([{ event: STARTUP_REFUSED_EVENT, detail: 'conditional put ignored' }]);
    logSpy.mockRestore();
  });

  it('refuses an attributed provider cycle frozen for more than 24 hours and emits the alarm event', async () => {
    const store = new InMemoryIngestStore();
    const source = new WorkingSource();
    source.parseWaveMembers = () => ({ ok: true, data: [{
      source: 'ncep_gfswave016', run_ts: '2026-08-07T06:00Z',
      hours: [{ valid_ts: '2026-08-10T18:00Z', swell: { h_m: 1.1, t_s: 14, dir_deg: 204 }, swell2: null, land_masked: false }],
    }] });
    const outcome = await runFetch({ source, store, spots: [VENAO], execution_id: 'evt-1', clock: { now: () => new Date('2026-08-10T06:17:00Z') } });
    expect(outcome.events).toContainEqual({ type: 'wave_source_unavailable', detail: 'cycle-frozen' });
    expect(outcome.events).toContainEqual({ type: 'health.provider.cycle_frozen', detail: 'older-than-24-hours' });
    expect(store.predictionKeys).toEqual([]);
  });

  it('compares the persisted canonical prior series before a write: identical retains attribution and performs no prediction PUT', async () => {
    const store = new InMemoryIngestStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    store.predictions.set('predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=00Z/all.jsonl.gz', JSON.stringify({
      spot_id: 'playa-venao', source: 'ncep_gfswave016', run_ts: '2026-08-10T00:00Z', valid_ts: '2026-08-10T18:00Z', lead_h: 18,
      fetched_ts: '2026-08-10T00:17:00Z', swell_h_m: 1.1, swell_t_s: 14, swell_dir_deg: 204,
      swell2_h_m: null, swell2_t_s: null, swell2_dir_deg: null, wind_speed_kt: null, wind_dir_deg: null,
      tide_m: null, tide_day_low_m: null, tide_day_high_m: null, land_masked: false,
    }));

    const outcome = await runFetch({
      source: new WorkingSource(), store, spots: [VENAO], execution_id: 'evt-1',
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
    });

    expect(outcome.completed).toBe(true);
    expect(store.predictionKeys).toEqual([]);
    expect(store.predictions.size).toBe(1);
    expect(outcome.events).toContainEqual({ type: 'cycle_unchanged', detail: 'playa-venao/ncep_gfswave016' });
    expect(outcome.events.some((event) => event.type.startsWith('prediction_'))).toBe(false);
    const loggedEvents = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string });
    expect(loggedEvents).toContainEqual({ event: UNCHANGED_CYCLE_EVENT, cycle: 'playa-venao/ncep_gfswave016' });
    expect(loggedEvents).toContainEqual(expect.objectContaining({ event: INGEST_SUCCESS_EVENT, predictions_created: 0, predictions_confirmed_duplicate: 0, unchanged_cycles: 1 }));
    logSpy.mockRestore();
  });

  it('writes a new attributed cycle when the persisted canonical series differs', async () => {
    const store = new InMemoryIngestStore();
    store.predictions.set('predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=00Z/all.jsonl.gz', JSON.stringify({
      spot_id: 'playa-venao', source: 'ncep_gfswave016', run_ts: '2026-08-10T00:00Z', valid_ts: '2026-08-10T18:00Z', lead_h: 18,
      fetched_ts: '2026-08-10T00:17:00Z', swell_h_m: 0.9, swell_t_s: 14, swell_dir_deg: 204,
      swell2_h_m: null, swell2_t_s: null, swell2_dir_deg: null, wind_speed_kt: null, wind_dir_deg: null,
      tide_m: null, tide_day_low_m: null, tide_day_high_m: null, land_masked: false,
    }));

    await runFetch({
      source: new WorkingSource(), store, spots: [VENAO], execution_id: 'evt-1',
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
    });

    expect(store.predictionKeys).toEqual(['predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=06Z/all-window-e532841fa552e55d.jsonl.gz']);
    expect(store.predictions.size).toBe(2);
  });

  it('archives the raw payload, writes the prediction row, and logs ingest.success when the run genuinely produced data', async () => {
    const store = new InMemoryIngestStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runFetch({
      source: new WorkingSource(),
      store,
      spots: [VENAO],
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
      execution_id: 'evt-1',
    });

    expect(outcome.completed).toBe(true);
    expect(store.rawKeys).toContain('raw/open-meteo-marine/dt=2026-08-10/06/spot=playa-venao/run=2026-08-10T06-17-00.000Z/execution=evt-1.json.gz');
    expect(store.predictionKeys).toEqual(['predictions/v1/dt=2026-08-10/src=ncep_gfswave016/cyc=06Z/all-window-e532841fa552e55d.jsonl.gz']);

    const loggedEvents = logSpy.mock.calls.map(([line]) => (JSON.parse(String(line)) as { event: string }).event);
    expect(loggedEvents).toContain(INGEST_SUCCESS_EVENT);

    logSpy.mockRestore();
  });

  it('archives a malformed received wave response before parser refusal, then writes no prediction receipt', async () => {
    const store = new InMemoryIngestStore();
    const timeline: string[] = [];
    const archive = store.putRawIfAbsent.bind(store);
    store.putRawIfAbsent = async (record) => {
      timeline.push('archive');
      return archive(record);
    };
    const source: ForecastSource = {
      async fetchWavePayload() { return { ok: true, verbatim: '{not-json' }; },
      parseWaveMembers() { timeline.push('parse'); return { ok: false, reason: 'malformed' }; },
      async fetchWindPayload() { return { ok: false, reason: 'dark' }; },
      parseWind() { return { ok: false, reason: 'dark' }; },
      async fetchTidePayload() { return { ok: false, reason: 'dark' }; },
      parseTide() { return { ok: false, reason: 'dark' }; },
    };

    const outcome = await runFetch({ source, store, spots: [VENAO], clock: { now: () => new Date('2026-08-10T06:17:00Z') }, execution_id: 'evt-1' });

    expect(outcome.events).toContainEqual({ type: 'wave_source_unavailable', detail: 'malformed' });
    expect(timeline).toEqual(['archive', 'parse']);
    expect(store.rawKeys).toEqual(['raw/open-meteo-marine/dt=2026-08-10/06/spot=playa-venao/run=2026-08-10T06-17-00.000Z/execution=evt-1.json.gz']);
    expect(store.predictionKeys).toEqual([]);
  });

  it('never logs ingest.success, and logs provider.error instead, when every wave source is dark this run', async () => {
    const store = new InMemoryIngestStore();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runFetch({
      source: new DarkSource(),
      store,
      spots: [VENAO],
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
      execution_id: 'evt-1',
    });

    expect(outcome.completed).toBe(true);
    expect(store.predictionKeys).toEqual([]);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string });
    expect(loggedLines.some((line) => line.event === INGEST_SUCCESS_EVENT)).toBe(false);
    expect(loggedLines.some((line) => line.event === PROVIDER_ERROR_EVENT)).toBe(true);

    logSpy.mockRestore();
  });
});
