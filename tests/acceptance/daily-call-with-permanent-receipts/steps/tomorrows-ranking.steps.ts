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

type DayTop = { readonly spotId: string; readonly spotName: string; readonly score: number };

type Slice05World = PipelineWorld & {
  slice05Root?: string;
  slice05Build?: { status: number | null; output: string };
  slice05ExpectedToday?: DayTop;
  slice05ExpectedTomorrow?: DayTop;
};

const projectRoot = process.cwd();

// Source-owned display names, read the same way top-call-card.steps.ts does,
// so the headline this scenario asserts is never a second hardcoded copy of
// the name — it comes from the same human-owned file the page itself reads.
const namesById = new Map(
  [...readFileSync(join(projectRoot, 'data/spots/pa-pacific.yaml'), 'utf8').matchAll(
    /^\s+- spot_id: ([^\n]+)\n\s+name: ([^\n]+)$/gm,
  )].map((match) => [
    match[1]!.trim(),
    match[2]!.trim().replace(/^"(.*)"$/, '$1'),
  ]),
);

function slice05World(world: PipelineWorld): Slice05World {
  return world as Slice05World;
}

function topOfDay(day: PublishedDay): DayTop {
  const top = day.spots[0];
  assert.ok(top, `test fixture error: day ${day.date} has no ranked spots`);
  const spotName = namesById.get(top.spot_id);
  assert.ok(spotName, `test fixture error: ${top.spot_id} has no source-owned display name`);
  return { spotId: top.spot_id, spotName, score: top.score_q };
}

function requiredExpected(world: Slice05World, which: 'slice05ExpectedToday' | 'slice05ExpectedTomorrow'): DayTop {
  const expected = world[which];
  assert.ok(expected, `test fixture error: ${which} was not derived before the Then step ran`);
  return expected;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headlinePattern(spotName: string): RegExp {
  return new RegExp(`VE A ${escapeForRegExp(spotName)}`);
}

function scorePattern(score: number): RegExp {
  return new RegExp(`<strong(?:\\s[^>]*)?>${score}</strong>`);
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
      validDays(surface)[1]!.date = civilDateAfter(validDays(surface)[1]!.date);
      return;
    case 'mañana-vacía':
      validDays(surface)[1]!.spots = [];
      return;
    case 'mañana-copiada':
      validDays(surface)[1]!.date = surface.current.surf_date;
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

function civilDateAfter(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

Given('una superficie publicada con hoy y mañana consecutivos', function (this: PipelineWorld) {
  const world = slice05World(this);
  world.slice05Root = copyProject();
  const days = validDays(installedSurface(world.slice05Root));
  assert.equal(days.length, 2, 'test fixture error: fixture must contain exactly two days');
  assert.notDeepEqual(days[0]!.spots, days[1]!.spots, 'test fixture error: tomorrow must start as its own ranked values');

  const today = topOfDay(days[0]!);
  const tomorrow = topOfDay(days[1]!);
  // The scenario's whole point: tomorrow is ranked on tomorrow's own
  // numbers, never a clone of today. Deriving both expectations from the
  // same installed surface would go vacuous the moment days[1] were a copy
  // of days[0] (both Then steps would then assert the SAME headline/score
  // against both pages and could not tell a real two-day build from a
  // cloned one). This assertion keeps that failure mode alive: a cloned
  // top entry fails HERE, before either page is even built.
  assert.notDeepEqual(
    { spotId: today.spotId, score: today.score },
    { spotId: tomorrow.spotId, score: tomorrow.score },
    'test fixture error: today and tomorrow must not share the same top spot and score, or this scenario cannot distinguish a genuine two-day build from a cloned one',
  );
  world.slice05ExpectedToday = today;
  world.slice05ExpectedTomorrow = tomorrow;
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
  const expected = requiredExpected(world, 'slice05ExpectedTomorrow');
  const html = readFileSync(join(world.slice05Root!, 'dist/manana.html'), 'utf8');
  assert.match(html, headlinePattern(expected.spotName), `WHAT: Mañana did not render tomorrow's first ranked spot (${expected.spotName}). WHY: tomorrow must be a separately ranked list. HOW: render days[1].spots in rank order.`);
  assert.match(html, scorePattern(expected.score), `WHAT: Mañana did not render tomorrow's score (${expected.score}). WHY: tomorrow needs its own numbers. HOW: preserve the day-two score through the static render.`);
});

Then('la home conserva el mejor spot y puntaje de hoy', function (this: PipelineWorld) {
  const world = slice05World(this);
  const expected = requiredExpected(world, 'slice05ExpectedToday');
  const html = readFileSync(join(world.slice05Root!, 'dist/index.html'), 'utf8');
  assert.match(html, headlinePattern(expected.spotName), `WHAT: home no longer renders today's first ranked spot (${expected.spotName}). HOW: keep days[0] as the home read model.`);
  assert.match(html, scorePattern(expected.score), `WHAT: home no longer renders today's score (${expected.score}). HOW: keep today's score distinct from tomorrow's ranking.`);
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
