// The Lambda composition root for the hourly Build run, proven the same way
// fetch-handler.test.ts proves Fetch: real pipeline code (runBuildOnce)
// wired to an in-memory BuildStore double, so the wiring and the honesty
// gate prove themselves offline. published-bundle-contract.test.ts and
// production-path-end-to-end.test.ts already prove runBuildOnce's own
// scoring/publish behaviour against real committed data; this suite is
// scoped to what this file adds: S3-shaped composition and build.success
// honesty, nothing about scoring.

import { describe, expect, it, vi } from 'vitest';

import { runBuild } from '../../src/pipeline/lambda/build-handler';
import { BUILD_REFUSED_EVENT, BUILD_SUCCESS_EVENT } from '../../src/pipeline/lambda/log-events';
import type { BuildStore } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const TODAY = '2026-08-10';
const TOMORROW = '2026-08-11';
const AT = '2026-08-10T11:22:00Z';

function seed(spot_id: string, name: string): SpotSeed {
  return {
    spot_id,
    name,
    region_id: 'pa-pacific',
    timezone: 'America/Panama',
    shore_normal_deg: 175,
    swell_window_deg: [150, 210],
    h_ref_m: 1.3,
    s_size: 0.5,
    wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
    tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
  };
}

function predictionLine(spot_id: string, date: string, height_m: number, source: string): string {
  return JSON.stringify({
    spot_id,
    source,
    run_ts: `${date}T06:00Z`,
    valid_ts: `${date}T18:00Z`,
    lead_h: 12,
    swell_h_m: height_m,
    swell_t_s: 14,
    swell_dir_deg: 180,
    wind_speed_kt: 8,
    wind_dir_deg: 40,
    tide_m: 2,
    tide_day_low_m: 0.5,
    tide_day_high_m: 3.5,
    land_masked: false,
  });
}

function bodyForDate(spot_id: string, height_m: number, date: string): string {
  return MEMBER_SOURCES.map((source) => predictionLine(spot_id, date, height_m, source)).join('\n');
}

class InMemoryBuildStore implements BuildStore {
  readonly predictions = new Map<string, string>();
  readonly putBundleKeys: string[] = [];
  readonly putManifestKeys: string[] = [];

  /** Heights differ per day so tomorrow's ranking is genuinely its own list,
   * never a byte-clone of today's (build.ts's clone guard). */
  seed(spot_id: string): void {
    const heightByDate: Readonly<Record<string, number>> = { [TODAY]: 1.2, [TOMORROW]: 0.6 };
    for (const date of [TODAY, TOMORROW]) {
      this.predictions.set(`predictions/v1/dt=${date}/${spot_id}.jsonl`, bodyForDate(spot_id, heightByDate[date]!, date));
    }
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.predictions.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.predictions.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(): Promise<string | null> {
    return null;
  }

  async putCallIfAbsent(): Promise<'created' | 'already-exists'> {
    return 'created';
  }

  async putBundle(key: string): Promise<void> {
    this.putBundleKeys.push(key);
  }

  async putManifest(key: string): Promise<void> {
    this.putManifestKeys.push(key);
  }
}

describe('runBuild (Lambda Build composition root)', () => {
  it('publishes the bundle and manifest and logs build.success with the real build id when the build has usable data', async () => {
    const store = new InMemoryBuildStore();
    store.seed('playa-venao');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
      probePublicManifest: async () => {},
    });

    expect(outcome.published).toBe(true);
    expect(store.putBundleKeys).toEqual([
      'pub/v1/regions/pa-pacific/bundle.json',
      'pub/v1/meta/spot-index.json',
    ]);
    expect(store.putManifestKeys).toEqual(['pub/v1/manifest.json']);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string; build_id?: string });
    expect(loggedLines).toEqual([{ event: BUILD_SUCCESS_EVENT, build_id: outcome.published ? outcome.build_id : undefined }]);

    logSpy.mockRestore();
  });

  it('never logs build.success, and logs the refusal reason instead, when no spot has any usable prediction', async () => {
    const store = new InMemoryBuildStore(); // seeded with nothing
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
    });

    expect(outcome.published).toBe(false);
    expect(store.putBundleKeys).toEqual([]);
    expect(store.putManifestKeys).toEqual([]);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string });
    expect(loggedLines.some((line) => line.event === BUILD_SUCCESS_EVENT)).toBe(false);
    expect(loggedLines.some((line) => line.event === BUILD_REFUSED_EVENT)).toBe(true);

    logSpy.mockRestore();
  });
});
