import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from './support/world';
import './support/world';

type SurfaceCall = { spot_id: string; score_q: number; call_es: string };
type PublishedDay = { date: string; spots: SurfaceCall[] };
type PublishedSurface = {
  current: {
    surf_date: string;
    calls: SurfaceCall[];
    days?: PublishedDay[] | unknown;
  };
};

type Slice05World = PipelineWorld & {
  slice05Root?: string;
  slice05Build?: { status: number | null; output: string };
};

const projectRoot = process.cwd();

function slice05World(world: PipelineWorld): Slice05World {
  return world as Slice05World;
}

function copyProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-05-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    cpSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function installedSurface(root: string): PublishedSurface {
  return JSON.parse(readFileSync(join(root, 'data/published-surface.json'), 'utf8')) as PublishedSurface;
}

function writeSurface(root: string, surface: PublishedSurface): void {
  writeFileSync(join(root, 'data/published-surface.json'), `${JSON.stringify(surface, null, 2)}\n`);
}

function build(world: Slice05World): void {
  assert.ok(world.slice05Root, 'test fixture error: isolated Slice-05 root is required');
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: world.slice05Root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  world.slice05Build = { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function validDays(surface: PublishedSurface): PublishedDay[] {
  assert.ok(Array.isArray(surface.current.days), 'test fixture error: installed surface must start with days');
  return surface.current.days as PublishedDay[];
}

function applyDefect(surface: PublishedSurface, defect: string): void {
  switch (defect) {
    case 'malformada':
      surface.current.days = [{ date: '2026-08-09', spots: 'no-es-una-lista' }];
      return;
    case 'sin-días':
      delete surface.current.days;
      return;
    case 'cero-días':
      surface.current.days = [];
      return;
    case 'un-día':
      surface.current.days = validDays(surface).slice(0, 1);
      return;
    case 'tres-días':
      surface.current.days = [...validDays(surface), structuredClone(validDays(surface)[1])];
      return;
    case 'fechas-no-consecutivas':
      validDays(surface)[1]!.date = '2026-08-12';
      return;
    case 'mañana-vacía':
      validDays(surface)[1]!.spots = [];
      return;
    case 'mañana-copiada':
      validDays(surface)[1]!.date = '2026-08-10';
      validDays(surface)[1]!.spots = structuredClone(surface.current.calls);
      return;
    case 'días-copiados-con-alias-distinto':
      surface.current.calls = structuredClone(surface.current.calls);
      surface.current.calls[0]!.score_q = 99;
      validDays(surface)[1]!.spots = structuredClone(validDays(surface)[0]!.spots);
      return;
    default:
      assert.fail(`test fixture error: unknown Slice-05 defect ${defect}`);
  }
}

Given('una superficie publicada con hoy y mañana consecutivos', function (this: PipelineWorld) {
  const world = slice05World(this);
  world.slice05Root = copyProject();
  const days = validDays(installedSurface(world.slice05Root));
  assert.equal(days.length, 2, 'test fixture error: fixture must contain exactly two days');
  assert.notDeepEqual(days[0]!.spots, days[1]!.spots, 'test fixture error: tomorrow must start as its own ranked values');
});

Given('una superficie publicada de dos días cambiada a {string}', function (this: PipelineWorld, defect: string) {
  const world = slice05World(this);
  world.slice05Root = copyProject();
  const surface = installedSurface(world.slice05Root);
  applyDefect(surface, defect);
  writeSurface(world.slice05Root, surface);
});

When('se construye la superficie estática de dos días', function (this: PipelineWorld) {
  build(slice05World(this));
});

When('se intenta construir la superficie estática de dos días', function (this: PipelineWorld) {
  build(slice05World(this));
});

Then('la ruta Mañana muestra el mejor spot y puntaje propios de mañana', function (this: PipelineWorld) {
  const world = slice05World(this);
  assert.equal(world.slice05Build?.status, 0, world.slice05Build?.output ?? 'test fixture error: build did not run');
  const html = readFileSync(join(world.slice05Root!, 'dist/manana.html'), 'utf8');
  assert.match(html, /VE A Santa Catalina - La Punta/, 'WHAT: Mañana did not render tomorrow\'s first ranked spot. WHY: tomorrow must be a separately ranked list. HOW: render days[1].spots in rank order.');
  assert.match(html, /<strong>91<\/strong>/, 'WHAT: Mañana did not render tomorrow\'s score. WHY: tomorrow needs its own numbers. HOW: preserve the day-two score through the static render.');
});

Then('la home conserva el mejor spot y puntaje de hoy', function (this: PipelineWorld) {
  const world = slice05World(this);
  const html = readFileSync(join(world.slice05Root!, 'dist/index.html'), 'utf8');
  assert.match(html, /VE A Playa Venao/, 'WHAT: home no longer renders today\'s first ranked spot. HOW: keep days[0] as the home read model.');
  assert.match(html, /<strong>88<\/strong>/, 'WHAT: home no longer renders today\'s score. HOW: keep today\'s score distinct from tomorrow\'s ranking.');
});

Then('la construcción rechaza la superficie de dos días', function (this: PipelineWorld) {
  const result = slice05World(this).slice05Build;
  assert.notEqual(result?.status, 0, 'WHAT: an invalid two-day surface built successfully. WHY: a static page must never invent a missing or copied tomorrow. HOW: reject malformed, missing, nonconsecutive, empty, or cloned day arrays before Astro renders.');
  assert.match(result?.output ?? '', /two|days|días|tomorrow|mañana/i, 'WHAT: the strict-surface refusal gives no repair clue. HOW: explain that exactly two consecutive ranked days are required.');
});

After(function (this: PipelineWorld) {
  const root = slice05World(this).slice05Root;
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});
