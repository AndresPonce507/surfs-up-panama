// The report handler's lookup is only honest when the builder publishes the
// same launch-policy identity it used for the reading surface. This test
// enters through the production build entry point and observes real files.

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runProductionBuild } from '../../src/pipeline/run-build-cli';
import { runBuildOnce } from '../../src/pipeline/build';
import type { BuildStore } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const CAPTURE_ROOT = resolve(process.cwd(), 'data/predictions-capture');
const BUILD_INSTANT = '2026-08-09T11:22:00Z';
const BUNDLE_SHA256_AT_BUILD_INSTANT = 'ac0c772cece44653918529cd059f49cb2482d2955213017942af4d12dc5aecbd';
const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;

describe('spot-index publication', { timeout: 30_000 }, () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'surfs-up-spot-index-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes every launch spot with the handler lookup fields beside the unchanged region bundle', async () => {
    const { bundlePath } = await runProductionBuild([
      '--at', BUILD_INSTANT,
      '--predictions', CAPTURE_ROOT,
      '--work-dir', workDir,
    ]);

    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as {
      schema: string;
      days: { spots: { spot_id: string }[] }[];
    };
    const index = JSON.parse(await readFile(join(workDir, 'pub/v1/meta/spot-index.json'), 'utf8')) as {
      schema: string;
      spots: Record<string, { region_id: string; geohash4: string }>;
    };

    expect(bundle.schema).toBe('region-bundle/1');
    expect(createHash('sha256').update(JSON.stringify(bundle)).digest('hex')).toBe(BUNDLE_SHA256_AT_BUILD_INSTANT);
    expect(index.schema).toBe('spot-index/1');
    expect(Object.keys(index.spots)).toHaveLength(20);
    expect(Object.keys(index.spots).sort()).toEqual(bundle.days[0]?.spots.map((spot) => spot.spot_id).sort());
    for (const entry of Object.values(index.spots)) {
      expect(entry).toMatchObject({ region_id: 'pa-pacific' });
      expect(entry.geohash4).toMatch(/^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/);
    }
    expect(index.spots['playa-venao']).toEqual({ region_id: 'pa-pacific', geohash4: 'd1qf' });
  });

  it('uses the exact controlled seed coordinates that a controlled build declares', async () => {
    const sourceSeedPath = join(workDir, 'controlled-spots.yaml');
    const policyPath = join(workDir, 'controlled-policy.json');
    await writeFile(sourceSeedPath, 'spots:\n\n  - spot_id: controlled-break\n    lat: 9.8765\n    lon: -77.5432\n');
    await writeFile(policyPath, JSON.stringify({ launch_spot_ids: ['controlled-break'] }));
    const store = new RecordingBuildStore();
    for (const date of ['2026-08-09', '2026-08-10']) {
      store.objects.set(
        `predictions/v1/dt=${date}/all.jsonl`,
        MEMBER_SOURCES.map((source, index) => predictionLine('controlled-break', date, date === '2026-08-09' ? 1.2 : 0.8, source, index)).join('\n'),
      );
    }

    const outcome = await runBuildOnce({
      store,
      clock: { now: () => new Date(BUILD_INSTANT) },
      region_id: 'test-region',
      spots: [controlledSpot()],
      launchData: { sourceSeedPath, policyPath },
    });

    expect(outcome.published).toBe(true);
    const index = JSON.parse(store.objects.get('pub/v1/meta/spot-index.json') ?? '') as {
      spots: Record<string, { region_id: string; geohash4: string }>;
    };
    expect(index.spots).toEqual({ 'controlled-break': { region_id: 'test-region', geohash4: 'd3bb' } });
  });
});

class RecordingBuildStore implements BuildStore {
  readonly objects = new Map<string, string>();

  async getPrediction(key: string): Promise<string | null> { return this.objects.get(key) ?? null; }
  async listPredictions(prefix: string): Promise<string[]> { return [...this.objects.keys()].filter((key) => key.startsWith(prefix)); }
  async getCorrection(): Promise<string | null> { return null; }
  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    if (this.objects.has(key)) return 'already-exists';
    this.objects.set(key, body);
    return 'created';
  }
  async putBundle(key: string, body: string): Promise<void> { this.objects.set(key, body); }
  async putManifest(key: string, body: string): Promise<void> { this.objects.set(key, body); }
}

function controlledSpot(): SpotSeed {
  return {
    spot_id: 'controlled-break', name: 'Controlled Break', region_id: 'test-region', timezone: 'America/Panama',
    shore_normal_deg: 175, swell_window_deg: [150, 210], h_ref_m: 1.3, s_size: 0.5,
    wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
    tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
  };
}

function predictionLine(spot_id: string, date: string, height_m: number, source: string, index: number): string {
  return JSON.stringify({
    spot_id, source, run_ts: `${date}T06:00Z`, valid_ts: `${date}T18:00Z`, lead_h: 12,
    swell_h_m: height_m + index * 0.02, swell_t_s: 15.5, swell_dir_deg: 204 + index,
    wind_speed_kt: 7, wind_dir_deg: 40, tide_m: 2.31, tide_day_low_m: 0.9,
    tide_day_high_m: 4.3, land_masked: false,
  });
}
