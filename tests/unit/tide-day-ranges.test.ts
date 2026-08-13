import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { runBuildOnce } from '../../src/pipeline/build';
import { runIngestOnce } from '../../src/pipeline/ingest';
import type { BuildStore, Clock, ForecastSource, IngestStore, MemberSeries, RawArchiveRecord, ReceivedSourcePayload, SourceResult, TideHour, WindHour } from '../../src/pipeline/ports';
import { applyCorrection, sTide, type SpotSeed } from '../../src/scoring/engine';

const SPOT: SpotSeed = {
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

type StoredPrediction = {
  readonly valid_ts: string;
  readonly tide_day_low_m: number | null;
  readonly tide_day_high_m: number | null;
};

class MemoryStore implements IngestStore {
  predictionBody = '';

  async putRawIfAbsent(_record: RawArchiveRecord): Promise<'created'> {
    return 'created';
  }

  async putPredictionIfAbsent(_key: string, body: string): Promise<'created'> {
    this.predictionBody = body;
    return 'created';
  }
}

class TwoPanamaDaysSource implements ForecastSource {
  async fetchWavePayload(): Promise<ReceivedSourcePayload> {
    return { ok: true, verbatim: '{}', provider: 'test-wave' };
  }

  parseWaveMembers(): SourceResult<MemberSeries[]> {
    return {
      ok: true,
      data: [{
        source: 'ncep_gfswave016',
        run_ts: '2026-08-12T00:00Z',
        hours: [
          '2026-08-12T05:00Z', // midnight on Aug 12 in Panama
          '2026-08-12T11:00Z',
          '2026-08-13T04:00Z', // 23:00 on Aug 12 in Panama
          '2026-08-13T05:00Z', // midnight on Aug 13 in Panama
        ].map((valid_ts) => ({
          valid_ts,
          swell: { h_m: 1.2, t_s: 14, dir_deg: 204 },
          swell2: null,
          land_masked: false,
        })),
      }],
    };
  }

  async fetchWindPayload(): Promise<ReceivedSourcePayload> {
    return { ok: false, reason: 'dark' };
  }

  parseWind(): SourceResult<WindHour[]> {
    return { ok: false, reason: 'dark' };
  }

  async fetchTidePayload(): Promise<ReceivedSourcePayload> {
    return { ok: true, verbatim: '{}', provider: 'test-tide' };
  }

  parseTide(): SourceResult<TideHour[]> {
    return {
      ok: true,
      data: [
        { valid_ts: '2026-08-12T04:00Z', tide_m: 0 }, // Aug 11 local, excluded from Aug 12 range
        { valid_ts: '2026-08-12T05:00Z', tide_m: 1 },
        { valid_ts: '2026-08-12T11:00Z', tide_m: 4 },
        { valid_ts: '2026-08-13T04:00Z', tide_m: 2 },
        { valid_ts: '2026-08-13T05:00Z', tide_m: 5 },
      ],
    };
  }
}

describe('ingest tide day ranges', () => {
  it('stores extrema from the forecast row\'s spot-local civil day, never the whole provider payload', async () => {
    const store = new MemoryStore();

    const outcome = await runIngestOnce({
      source: new TwoPanamaDaysSource(),
      store,
      spots: [SPOT],
      clock: { now: () => new Date('2026-08-12T06:17:00Z') },
      execution_id: 'tide-day-boundary',
    });

    assert.equal(outcome.completed, true);
    const rows = store.predictionBody.split('\n').map((line) => JSON.parse(line) as StoredPrediction);
    assert.deepEqual(
      rows.map(({ valid_ts, tide_day_low_m, tide_day_high_m }) => ({ valid_ts, tide_day_low_m, tide_day_high_m })),
      [
        { valid_ts: '2026-08-12T05:00Z', tide_day_low_m: 1, tide_day_high_m: 4 },
        { valid_ts: '2026-08-12T11:00Z', tide_day_low_m: 1, tide_day_high_m: 4 },
        { valid_ts: '2026-08-13T04:00Z', tide_day_low_m: 1, tide_day_high_m: 4 },
        { valid_ts: '2026-08-13T05:00Z', tide_day_low_m: 5, tide_day_high_m: 5 },
      ],
    );
  });
});

class BuildMemoryStore implements BuildStore {
  readonly objects = new Map<string, string>();

  async getPrediction(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(): Promise<string | null> {
    return null;
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }

  async putBundle(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }

  async putManifest(key: string, body: string): Promise<void> {
    this.objects.set(key, body);
  }
}

const SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;

function stalePredictionLines(validTs: string, tideM: number, swellHeight: number): string {
  return SOURCES.map((source) => JSON.stringify({
    spot_id: SPOT.spot_id,
    source,
    run_ts: '2026-08-09T06:00Z',
    valid_ts: validTs,
    lead_h: 12,
    swell_h_m: swellHeight,
    swell_t_s: 14,
    swell_dir_deg: 180,
    wind_speed_kt: 5,
    wind_dir_deg: 355,
    tide_m: tideM,
    // These are receipts written before the ingest correction. The builder
    // must derive trustworthy local-day bounds from tide_m, never perpetuate
    // the stale whole-payload bounds.
    tide_day_low_m: 0,
    tide_day_high_m: 5,
    land_masked: false,
  })).join('\n');
}

describe('build tide day ranges', () => {
  it('re-derives a Panama-local day range from archived tide observations instead of trusting stale receipt bounds', async () => {
    const store = new BuildMemoryStore();
    store.objects.set('predictions/v1/dt=2026-08-09/tide-boundary.jsonl', [
      stalePredictionLines('2026-08-09T05:00Z', 1, 1.2),
      stalePredictionLines('2026-08-09T11:00Z', 4, 1.2),
      stalePredictionLines('2026-08-09T18:00Z', 2, 1.2),
      stalePredictionLines('2026-08-10T04:00Z', 3, 1.2),
      stalePredictionLines('2026-08-10T05:00Z', 5, 0.8),
      stalePredictionLines('2026-08-10T18:00Z', 5, 0.8),
    ].join('\n'));

    const clock: Clock = { now: () => new Date('2026-08-09T11:22:00Z') };
    const outcome = await runBuildOnce({ store, clock, region_id: 'pa-pacific', spots: [SPOT] });
    assert.equal(outcome.published, true, `The fixture must publish before its scored receipt can be read. Got ${JSON.stringify(outcome)}.`);

    const callsKey = [...store.objects.keys()].find((key) => key.startsWith('log/calls/v1/'));
    assert.ok(callsKey, 'The build must write a receipt with the score it actually used.');
    const call = (store.objects.get(callsKey) ?? '').split('\n')
      .map((line) => JSON.parse(line) as { valid_ts: string; sub: { tide: number | null } })
      .find((row) => row.valid_ts === '2026-08-09T18:00Z');
    assert.ok(call, 'The 18:00Z row for the published Panama day must be scored.');

    const expected = sTide({ height_m: 2, day_low_m: 1, day_high_m: 4 }, applyCorrection(SPOT, null).params);
    assert.equal(
      call.sub.tide,
      expected,
      'The local Aug 9 range is 1..4 m. The stale receipt range 0..5 m must not change this public call.',
    );
  });
});
