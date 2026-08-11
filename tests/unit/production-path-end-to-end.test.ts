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

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runProductionBuild } from '../../src/pipeline/run-build-cli';
import type { PublishedSurfaceUpdate, StaticSurface, SurfaceCall } from '../../src/publish/static-surface';

const PROJECT_ROOT = process.cwd();
const CAPTURE_ROOT = resolve(PROJECT_ROOT, 'data/predictions-capture');
const AT = '2026-08-09T11:22:00Z';

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

  it('upgrades a Spanish-only current surface while retaining its immutable legacy receipt byte-for-byte', async () => {
    const { bundlePath } = await runProductionBuild(['--at', AT, '--predictions', CAPTURE_ROOT, '--work-dir', workDir]);
    const legacyReceipt = {
      schema: 'published-surface-update/v1',
      surf_date: '2026-08-08',
      published_at: '2026-08-08T11:22:00Z',
      build_kind: 'dawn',
      calls: [{ spot_id: 'playa-venao', score_q: 74, call_es: 'Cintura a pecho y limpio temprano.' }],
    };
    const legacyCurrent = {
      schema: 'published-surface-update/v1',
      surf_date: '2026-08-08',
      published_at: '2026-08-08T12:00:00Z',
      build_kind: 'hourly',
      calls: [{ spot_id: 'playa-venao', score_q: 74, call_es: 'Cintura a pecho y limpio temprano.' }],
      days: [
        { date: '2026-08-08', spots: [{ spot_id: 'playa-venao', score_q: 74, call_es: 'Cintura a pecho y limpio temprano.' }] },
        { date: '2026-08-09', spots: [{ spot_id: 'playa-venao', score_q: 70, call_es: 'Rodilla a cintura y limpio temprano.' }] },
      ],
    };
    await writeFile(scratchSurfacePath, `${JSON.stringify({
      schema: 'static-surface/v1',
      current: legacyCurrent,
      dawn_receipts: [legacyReceipt],
    }, null, 2)}\n`);

    const result = spawnSync('npx', ['tsx', 'src/publish/publish-static-surface.ts', '--input', bundlePath, '--output', scratchSurfacePath], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, `publish:surface migration failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

    const upgraded = JSON.parse(await readFile(scratchSurfacePath, 'utf8')) as StaticSurface;
    expect(upgraded.dawn_receipts[0]).toEqual(legacyReceipt);
    expect(upgraded.dawn_receipts).toHaveLength(2);
    const newReceipt = upgraded.dawn_receipts.find((receipt) => receipt.surf_date === '2026-08-09');
    expect(newReceipt?.calls).toHaveLength(20);
    for (const call of newReceipt?.calls ?? []) {
      expect(call.call_es.trim()).not.toBe('');
      expect(call.call_en?.trim()).not.toBe('');
    }
    for (const day of upgraded.current.days) {
      for (const call of day.spots) {
        expect(call.call_es.trim()).not.toBe('');
        expect(call.call_en.trim()).not.toBe('');
      }
    }
  }, 30_000);

  it('adds call_en to an existing structured current surface without changing any forecast fact', async () => {
    const today = {
      spot_id: 'playa-venao',
      score_q: 74,
      call_es: 'Pecho a cabeza, viento limpio, mejor de 06:00 a 09:30.',
      conf_level: 'high',
      size_band: 'chest_head',
      size_range_m: [1.1, 1.6],
      wind_state: 'clean',
      best_window: { start: '06:00', end: '09:30' },
    };
    const tomorrow = {
      spot_id: 'playa-venao',
      score_q: 68,
      call_es: 'Cintura a pecho, viento picado, sin ventana estimada.',
      conf_level: 'medium',
      size_band: 'waist_chest',
      size_range_m: [0.7, 1.1],
      wind_state: 'choppy',
      best_window: null,
    };
    const legacyReceipt = {
      schema: 'published-surface-update/v1',
      surf_date: '2026-08-08',
      published_at: '2026-08-08T11:22:00Z',
      build_kind: 'dawn',
      calls: [{ spot_id: 'playa-venao', score_q: 70, call_es: 'Cintura a pecho y limpio temprano.' }],
    };
    const before = {
      schema: 'static-surface/v1',
      current: {
        schema: 'published-surface-update/v1',
        surf_date: '2026-08-09',
        published_at: '2026-08-09T12:05:00Z',
        build_kind: 'hourly',
        calls: [{ ...today }],
        days: [
          { date: '2026-08-09', spots: [{ ...today }] },
          { date: '2026-08-10', spots: [{ ...tomorrow }] },
        ],
      },
      dawn_receipts: [legacyReceipt],
    };
    await writeFile(scratchSurfacePath, `${JSON.stringify(before, null, 2)}\n`);

    const result = spawnSync('npx', ['tsx', 'src/publish/publish-static-surface.ts', '--upgrade-current-locales', '--output', scratchSurfacePath], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, `locale projection upgrade failed:\n${result.stdout}\n${result.stderr}`).toBe(0);

    const upgraded = JSON.parse(await readFile(scratchSurfacePath, 'utf8')) as Record<string, any>;
    const projected = [
      ...upgraded.current.calls,
      ...upgraded.current.days.flatMap((day: Record<string, any>) => day.spots),
    ];
    expect(projected.map((call: Record<string, unknown>) => call.call_en)).toEqual([
      'Chest to head, clean wind, best from 06:00 to 09:30.',
      'Chest to head, clean wind, best from 06:00 to 09:30.',
      'Waist to chest, choppy wind, no estimated window.',
    ]);
    for (const call of projected) delete call.call_en;
    expect(upgraded).toEqual(before);

    const incomplete = structuredClone(before);
    delete (incomplete.current.days[1]!.spots[0]! as Record<string, unknown>).wind_state;
    await writeFile(scratchSurfacePath, `${JSON.stringify(incomplete, null, 2)}\n`);
    const refused = spawnSync('npx', ['tsx', 'src/publish/publish-static-surface.ts', '--upgrade-current-locales', '--output', scratchSurfacePath], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    expect(refused.status).not.toBe(0);
    expect(`${refused.stdout}\n${refused.stderr}`).toMatch(/wind_state is missing/u);
    expect(JSON.parse(await readFile(scratchSurfacePath, 'utf8'))).toEqual(incomplete);
  });
});

function surfaceDays(current: PublishedSurfaceUpdate): PublishedSurfaceUpdate['days'] {
  return current.days;
}

function assertFullyStructured(call: SurfaceCall): void {
  const bilingualCall = call as SurfaceCall & { readonly call_en?: string };
  expect(call.call_es.trim(), `${call.spot_id} missing call_es`).not.toBe('');
  expect(bilingualCall.call_en?.trim(), `${call.spot_id} missing call_en`).not.toBe('');
  expect(typeof call.conf_level, `${call.spot_id} missing conf_level`).toBe('string');
  expect(typeof call.size_band, `${call.spot_id} missing size_band`).toBe('string');
  expect(call.size_range_m, `${call.spot_id} missing size_range_m`).toHaveLength(2);
  expect(Object.hasOwn(call, 'wind_state'), `${call.spot_id} missing wind_state`).toBe(true);
  expect(call.wind_state === null || ['clean', 'choppy', 'blown_out'].includes(call.wind_state), `${call.spot_id} malformed wind_state`).toBe(true);
  expect(Object.hasOwn(call, 'best_window'), `${call.spot_id} missing best_window`).toBe(true);
  expect(call.best_window === null || /^\d{2}:\d{2}$/.test(call.best_window.start), `${call.spot_id} malformed best_window`).toBe(true);
}
