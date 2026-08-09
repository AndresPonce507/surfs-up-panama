// The missing production caller for runBuildOnce, proven through its own
// driving surface (the exported CLI function), asserting on the emitted
// region-bundle/1 file at the driven port boundary (real filesystem).
// Real I/O, tmp_path (Mandate 6): the store is a real FilesystemStore, never
// a mock of one.

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runProductionBuild } from '../../src/pipeline/run-build-cli';
import type { RegionBundle } from '../../src/publish/region-bundle';
import type { SpotSeed } from '../../src/scoring/engine';

const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const AT = '2026-08-09T11:22:00Z';

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

function predictionLine(spot_id: string, date: string, height_m: number, source: string, index: number): string {
  return JSON.stringify({
    spot_id,
    source,
    run_ts: `${date}T06:00Z`,
    valid_ts: `${date}T18:00Z`,
    lead_h: 12,
    swell_h_m: height_m + index * 0.02,
    swell_t_s: 15.5,
    swell_dir_deg: 204 + index,
    wind_speed_kt: 7,
    wind_dir_deg: 40,
    tide_m: null,
    tide_day_low_m: null,
    tide_day_high_m: null,
    land_masked: false,
  });
}

async function seedPredictions(predictionsRoot: string): Promise<void> {
  // Heights differ per spot and per day so tomorrow's ranking is genuinely
  // its own list, never a clone of today's (build.ts's clone guard).
  const heightsByDate: Record<string, Record<string, number>> = {
    [TODAY]: { 'playa-venao': 1.2, 'playa-cambutal': 0.7 },
    [TOMORROW]: { 'playa-venao': 0.5, 'playa-cambutal': 1.4 },
  };
  for (const date of [TODAY, TOMORROW]) {
    const heights = heightsByDate[date]!;
    const lines = Object.keys(heights).flatMap((spot_id) =>
      MEMBER_SOURCES.map((source, index) => predictionLine(spot_id, date, heights[spot_id]!, source, index)),
    );
    const dir = join(predictionsRoot, 'predictions/v1', `dt=${date}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'all.jsonl'), lines.join('\n'));
  }
}

describe('runProductionBuild (the missing production caller for runBuildOnce)', () => {
  let predictionsRoot: string;
  let workDir: string;

  beforeEach(async () => {
    predictionsRoot = await mkdtemp(join(tmpdir(), 'surfs-up-predictions-'));
    workDir = await mkdtemp(join(tmpdir(), 'surfs-up-work-'));
  });

  afterEach(async () => {
    await rm(predictionsRoot, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('refuses without --at, naming why a pinned instant is required', async () => {
    await expect(runProductionBuild(['--predictions', predictionsRoot, '--work-dir', workDir])).rejects.toThrow(/--at/);
  });

  it('emits a region-bundle/1 file at the documented key, with real day-independent scoring for every spot', async () => {
    await seedPredictions(predictionsRoot);
    const spots = [seed('playa-venao', 'Playa Venao'), seed('playa-cambutal', 'Playa Cambutal')];

    const result = await runProductionBuild(
      ['--at', AT, '--predictions', predictionsRoot, '--work-dir', workDir, '--region', 'pa-pacific'],
      { spots },
    );

    expect(result.bundlePath).toBe(join(workDir, 'pub/v1/regions/pa-pacific/bundle.json'));
    const bundle = JSON.parse(await readFile(result.bundlePath, 'utf8')) as RegionBundle;
    expect(bundle.schema).toBe('region-bundle/1');
    expect(bundle.days.map((day) => day.date)).toEqual([TODAY, TOMORROW]);
    for (const day of bundle.days) {
      expect(day.spots).toHaveLength(2);
      for (const summary of day.spots) {
        expect(typeof summary.conf_level).toBe('string');
        expect(typeof summary.size_band).toBe('string');
        expect(summary.size_range_m).toHaveLength(2);
        expect(typeof summary.wind_state).toBe('string');
        expect(summary.best_window.start).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  it('surfaces the pipeline refusal reason instead of pretending the build succeeded', async () => {
    // no predictions seeded: zero usable wave members anywhere
    const spots = [seed('playa-venao', 'Playa Venao')];

    await expect(
      runProductionBuild(['--at', AT, '--predictions', predictionsRoot, '--work-dir', workDir], { spots }),
    ).rejects.toThrow(/no usable wave members/);
  });
});
