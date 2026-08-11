// The missing production caller for runBuildOnce, proven through its own
// driving surface (the exported CLI function), asserting on the emitted
// region-bundle/1 file at the driven port boundary (real filesystem).
// Real I/O, tmp_path (Mandate 6): the store is a real FilesystemStore, never
// a mock of one.

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { publishedWeakestLinkSubscore } from '../../src/pipeline/build';
import { runProductionBuild } from '../../src/pipeline/run-build-cli';
import type { RegionBundle } from '../../src/publish/region-bundle';
import type { Factor, ScoreResult, SpotSeed } from '../../src/scoring/engine';

const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const TODAY = '2026-08-09';
const TOMORROW = '2026-08-10';
const AT = '2026-08-09T11:22:00Z';
const FACTORS: readonly Factor[] = ['dir', 'size', 'wind', 'tide'];
const factorArb = fc.constantFrom<Factor>(...FACTORS);
const factorPairArb = factorArb.chain((selected) => fc.constantFrom(
  ...FACTORS.filter((factor) => factor !== selected),
).map((unselected) => ({ selected, unselected })));

function subScores(selected: Factor, selectedScore: number): ScoreResult['sub'] {
  return { dir: 0.91, size: 0.82, wind: 0.73, tide: 0.64, [selected]: selectedScore };
}

function malformedObservedSubscore(selected: 'wind' | 'tide', selectedScore: number | null): ScoreResult['sub'] {
  return selected === 'wind'
    ? { dir: 0.91, size: 0.82, wind: selectedScore, tide: 0.64 }
    : { dir: 0.91, size: 0.82, wind: 0.73, tide: selectedScore };
}

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

function perfectPredictionLines(spot_id: string, date: string): string[] {
  // hEff(h, 15.5) = 1.3, the seed's reference height; the swell is inside
  // the window, wind is the exact offshore optimum, and tide is mid-range.
  // Every scored factor is therefore one, so this row is a real clean day.
  const perfectHeight = 1.3 / Math.sqrt(15.5 / 10);
  return MEMBER_SOURCES.map((source) => JSON.stringify({
    spot_id,
    source,
    run_ts: `${date}T06:00Z`,
    valid_ts: `${date}T18:00Z`,
    lead_h: 12,
    swell_h_m: perfectHeight,
    swell_t_s: 15.5,
    swell_dir_deg: 180,
    wind_speed_kt: 5,
    wind_dir_deg: 355,
    tide_m: 2.6,
    tide_day_low_m: 0.9,
    tide_day_high_m: 4.3,
    land_masked: false,
  }));
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
        expect(summary.best_window?.start).toMatch(/^\d{2}:\d{2}$/);
      }
    }

    const freshRows = [
      ...bundle.days.flatMap((day) => day.spots),
      ...bundle.publish_surface.calls,
      ...bundle.publish_surface.days.flatMap((day) => day.spots),
    ] as Array<{
      readonly spot_id: string;
      readonly weakest_link?: string | null;
      readonly weakest_link_subscore?: unknown;
    }>;
    for (const row of freshRows) {
      if (typeof row.weakest_link === 'string') {
        expect(Object.hasOwn(row, 'weakest_link_subscore'), `${row.spot_id}: every fresh named culprit must carry its raw score`).toBe(true);
        expect(
          typeof row.weakest_link_subscore === 'number'
            && Number.isFinite(row.weakest_link_subscore)
            && row.weakest_link_subscore >= 0
            && row.weakest_link_subscore <= 1,
          `${row.spot_id}: a named culprit score must be finite and within [0, 1]`,
        ).toBe(true);
      } else {
        expect(Object.hasOwn(row, 'weakest_link_subscore'), `${row.spot_id}: a clean row must omit the culprit score`).toBe(false);
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

  it('omits the serialized scalar for a real clean day while another row keeps both rankings distinct', async () => {
    const spots = [seed('playa-venao', 'Playa Venao'), seed('playa-cambutal', 'Playa Cambutal')];
    for (const [date, cambutalHeight] of [[TODAY, 0.7], [TOMORROW, 1.4]] as const) {
      const lines = [
        ...perfectPredictionLines('playa-venao', date),
        ...MEMBER_SOURCES.map((source, index) => predictionLine('playa-cambutal', date, cambutalHeight, source, index)),
      ];
      const dir = join(predictionsRoot, 'predictions/v1', `dt=${date}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'all.jsonl'), lines.join('\n'));
    }

    const { bundlePath } = await runProductionBuild(
      ['--at', AT, '--predictions', predictionsRoot, '--work-dir', workDir, '--region', 'pa-pacific'],
      { spots },
    );
    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as RegionBundle;
    const cleanRows = [
      ...bundle.days.flatMap((day) => day.spots),
      ...bundle.publish_surface.calls,
      ...bundle.publish_surface.days.flatMap((day) => day.spots),
    ].filter((row) => row.spot_id === 'playa-venao');

    expect(cleanRows).not.toHaveLength(0);
    for (const row of cleanRows) {
      expect(row.weakest_link).toBeNull();
      expect(Object.hasOwn(row, 'weakest_link_subscore')).toBe(false);
    }
  });

  it('carries only the selected factor score, regardless of unselected factor changes', () => {
    fc.assert(
      fc.property(
        factorPairArb,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        ({ selected, unselected }, selectedHundredths, changeHundredths) => {
          const selectedScore = selectedHundredths / 100;
          const changedSelectedScore = ((selectedHundredths + changeHundredths) % 101) / 100;
          const original = subScores(selected, selectedScore);
          const changedUnselected = { ...original, [unselected]: ((selectedHundredths + 37) % 101) / 100 };
          const changedSelected = subScores(selected, changedSelectedScore);
          const before = structuredClone(original);

          expect(publishedWeakestLinkSubscore({ weakest_link: selected, sub: original })).toBe(selectedScore);
          expect(publishedWeakestLinkSubscore({ weakest_link: selected, sub: changedUnselected })).toBe(selectedScore);
          expect(publishedWeakestLinkSubscore({ weakest_link: selected, sub: changedSelected })).toBe(changedSelectedScore);
          expect(original).toEqual(before);
        },
      ),
    );
  });

  it('refuses a named culprit whose matching raw score is missing, non-finite, or outside the published range', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'wind' | 'tide'>('wind', 'tide'),
        fc.constantFrom<number | null>(null, Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01),
        (selected, invalidScore) => {
          expect(() => publishedWeakestLinkSubscore({
            weakest_link: selected,
            sub: malformedObservedSubscore(selected, invalidScore),
          })).toThrow(/publish refused/);
        },
      ),
    );
  });

});
