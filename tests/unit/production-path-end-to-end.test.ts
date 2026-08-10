// Walking-skeleton-style proof (used sparingly, real I/O, real subprocess):
// the full offline production path, start to finish, against the REAL
// committed capture (data/predictions-capture/, captured live from
// Open-Meteo on 2026-08-09 — see its PROVENANCE.json). No network call here:
// the capture already happened, once, out of band; this test proves the
// rest of the chain is a pure, offline function of that committed snapshot.
//
//   npm run pipeline:build -- --at <ISO> [--work-dir <dir>]
//   npm run publish:surface -- --input <bundle> --output <scratch surface>
//
// It never writes data/published-surface.json: --output always points at a
// tmp path, so this cannot regress the committed reading surface.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runProductionBuild } from '../../src/pipeline/run-build-cli';
import type { PublishedSurfaceUpdate, StaticSurface, SurfaceCall } from '../../src/publish/static-surface';

const PROJECT_ROOT = process.cwd();
const CAPTURE_ROOT = resolve(PROJECT_ROOT, 'data/predictions-capture');
// The committed snapshot was fetched at 18:42Z and attributed to its 12Z
// run. A build at 11:22Z would correctly refuse it as future knowledge.
const AT = '2026-08-09T19:22:00Z';

describe('offline production path against the real committed capture', () => {
  let workDir: string;
  let scratchSurfacePath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'surfs-up-e2e-work-'));
    scratchSurfacePath = join(await mkdtemp(join(tmpdir(), 'surfs-up-e2e-surface-')), 'published-surface.json');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('publishes a bundle for the full 20-spot launch policy from committed data alone, no network', async () => {
    const { bundlePath } = await runProductionBuild(['--at', AT, '--predictions', CAPTURE_ROOT, '--work-dir', workDir]);
    expect(bundlePath).toBe(resolve(workDir, 'pub/v1/regions/pa-pacific/bundle.json'));

    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as { days: { date: string; spots: unknown[] }[] };
    expect(bundle.days).toHaveLength(2);
    expect(bundle.days[0]?.spots).toHaveLength(20);
    expect(bundle.days[1]?.spots).toHaveLength(20);
  });

  it('feeds that bundle into the real, unmodified publish:surface CLI and gets a surface with all five fields on every spot, both days', async () => {
    const { bundlePath } = await runProductionBuild(['--at', AT, '--predictions', CAPTURE_ROOT, '--work-dir', workDir]);

    const result = spawnSync('npx', ['tsx', 'src/publish/publish-static-surface.ts', '--input', bundlePath, '--output', scratchSurfacePath], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, `publish:surface failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

    const surface = JSON.parse(await readFile(scratchSurfacePath, 'utf8')) as StaticSurface;
    const days = surfaceDays(surface.current);
    expect(days).toHaveLength(2);
    for (const day of days) {
      expect(day.spots).toHaveLength(20);
      for (const call of day.spots) {
        assertFullyStructured(call);
      }
    }
  }, 30_000);
});

function surfaceDays(current: PublishedSurfaceUpdate): PublishedSurfaceUpdate['days'] {
  return current.days;
}

function assertFullyStructured(call: SurfaceCall): void {
  expect(typeof call.conf_level, `${call.spot_id} missing conf_level`).toBe('string');
  expect(typeof call.size_band, `${call.spot_id} missing size_band`).toBe('string');
  expect(call.size_range_m, `${call.spot_id} missing size_range_m`).toHaveLength(2);
  expect(typeof call.wind_state, `${call.spot_id} missing wind_state`).toBe('string');
  expect(call.best_window?.start, `${call.spot_id} missing best_window`).toMatch(/^\d{2}:\d{2}$/);
}
