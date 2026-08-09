// Slice-05 acceptance steps. They drive the production ingest and build ports
// with two distinct civil days, then observe only the published region bundle.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from './support/world';
import './support/world';

type PublishedDay = {
  readonly date: string;
  readonly spots: readonly { readonly spot_id: string; readonly score_q: number }[];
};

type TomorrowWorld = PipelineWorld & { publishedDays?: readonly PublishedDay[] };

type BrowserTomorrowWorld = TomorrowWorld & {
  root?: string;
  preview?: ChildProcess;
  browser?: Browser;
  page?: Page;
  expectedTomorrow?: readonly { readonly spot_id: string; readonly score_q: number }[];
};

const projectRoot = process.cwd();

function tomorrowWorld(world: PipelineWorld): TomorrowWorld {
  return world as TomorrowWorld;
}

function browserWorld(world: PipelineWorld): BrowserTomorrowWorld {
  return world as BrowserTomorrowWorld;
}

function copyProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-05-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) copyFileSync(join(projectRoot, name), join(root, name));
  for (const name of ['data', 'public', 'scripts', 'src']) cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function installDistinctDays(root: string): readonly { readonly spot_id: string; readonly score_q: number }[] {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as { current: { surf_date: string; calls: { spot_id: string; score_q: number }[]; days?: unknown } };
  const tomorrow = [...surface.current.calls]
    .map((call, index) => ({ ...call, score_q: Math.max(0, call.score_q - (index % 4) - 2) }))
    .sort((left, right) => right.score_q - left.score_q || left.spot_id.localeCompare(right.spot_id));
  surface.current.days = [
    { date: surface.current.surf_date, calls: surface.current.calls },
    { date: '2026-08-10', calls: tomorrow },
  ];
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
  return tomorrow.map(({ spot_id, score_q }) => ({ spot_id, score_q }));
}

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') return reject(new Error('could not allocate preview port'));
      server.close((error) => error === undefined ? resolve(address.port) : reject(error));
    });
  });
}

async function openTomorrow(world: BrowserTomorrowWorld): Promise<void> {
  assert.ok(world.root, 'test fixture error: isolated public surface is required');
  const build = spawnSync('npm', ['run', 'build'], { cwd: world.root, encoding: 'utf8' });
  assert.equal(build.status, 0, `test fixture error: isolated surface does not build:\n${build.stdout}\n${build.stderr}`);
  const port = await unusedPort();
  world.preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: world.root, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/manana`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) break; } catch { /* preview is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  world.browser = browser;
  world.page = page;
}

async function observePublishedDays(world: PipelineWorld): Promise<readonly PublishedDay[]> {
  const body = await world.store.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(body, `WHAT: no region bundle was published. WHY: tomorrow can only be read from the completed public build. HOW: publish both civil days before rendering the ranked routes.${world.failureContext()}`);
  const parsed = JSON.parse(body) as { days?: PublishedDay[] };
  return parsed.days ?? [];
}

Given('la costa tiene predicciones distintas para hoy y mañana', async function (this: PipelineWorld) {
  this.source.configureMorning('2026-08-09', '06', 0);
  this.clock.set('2026-08-09T11:02:14Z');
  await this.runIngest('today ingest');

  this.source.configureMorning('2026-08-10', '06', 0.45);
  this.clock.set('2026-08-10T11:02:14Z');
  await this.runIngest('tomorrow ingest');

  this.clock.set('2026-08-09T11:22:00Z');
});

When('se publica la costa para el surfista', async function (this: PipelineWorld) {
  await this.runBuild('two-day public build');
  tomorrowWorld(this).publishedDays = await observePublishedDays(this);
});

Then('la publicación trae exactamente hoy y mañana como días consecutivos', function (this: PipelineWorld) {
  const days = tomorrowWorld(this).publishedDays ?? [];
  assert.equal(
    days.length,
    2,
    `WHAT: public bundle has ${days.length} ranked day(s), not today and tomorrow. WHY: Mañana must be its own honest decision surface. HOW: publish exactly two consecutive day-summary arrays from the two forecast dates.`,
  );
  assert.deepEqual(
    days.map((day) => day.date),
    ['2026-08-09', '2026-08-10'],
    'WHAT: the public day dates are not the current Panama day followed by tomorrow. WHY: the two tabs must name distinct decisions. HOW: preserve the civil forecast date on each published ranking.',
  );
});

Then('cada día conserva su propio ranking completo', function (this: PipelineWorld) {
  const days = tomorrowWorld(this).publishedDays ?? [];
  assert.ok(days.every((day) => day.spots.length === 20), 'WHAT: a published day has no complete 20-spot ranking. WHY: a surfer cannot compare tomorrow from a partial coast. HOW: collect and rank every launch spot for each published day.');
  assert.deepEqual(days[0]?.spots.map((spot) => spot.spot_id), days[1]?.spots.map((spot) => spot.spot_id), 'WHAT: the two day arrays do not describe the same coast. WHY: rank changes must come from conditions, not a disappearing spot. HOW: preserve the launch population in both day summaries.');
});

Then('mañana no es una fotocopia numérica de hoy', function (this: PipelineWorld) {
  const days = tomorrowWorld(this).publishedDays ?? [];
  const todayScores = days[0]?.spots.map((spot) => spot.score_q) ?? [];
  const tomorrowScores = days[1]?.spots.map((spot) => spot.score_q) ?? [];
  assert.notDeepEqual(
    tomorrowScores,
    todayScores,
    'WHAT: every tomorrow score duplicates today. WHY: a visual copy makes a surfer plan from the wrong day. HOW: score tomorrow’s own forecast rows and publish them in days[1], never reuse days[0].',
  );
});

Then('la publicación no promete ni contiene un tercer día', function (this: PipelineWorld) {
  const days = tomorrowWorld(this).publishedDays ?? [];
  assert.equal(days.length, 2, `WHAT: public bundle contains ${days.length} days. WHY: the product says it knows only today and tomorrow. HOW: keep the publish contract to exactly two day-summary arrays.`);
});

Given('una superficie publicada aislada con rankings distintos para hoy y mañana', function (this: PipelineWorld) {
  const world = browserWorld(this);
  world.root = copyProject();
  world.expectedTomorrow = installDistinctDays(world.root);
});

When('el surfista abre Mañana a {int} px', { timeout: 30_000 }, async function (this: PipelineWorld, width: number) {
  assert.equal(width, 390, 'test contract fixes the phone viewport at 390 px');
  await openTomorrow(browserWorld(this));
});

Then('\\/manana muestra el ranking y los valores de mañana', async function (this: PipelineWorld) {
  const world = browserWorld(this);
  assert.ok(world.page && world.expectedTomorrow, 'test fixture error: tomorrow page and expected values are required');
  const rows = await world.page.locator('ol.ranked > li').evaluateAll((items) => items.map((item) => ({
    spot_id: item.querySelector('a')?.getAttribute('href')?.split('/').filter(Boolean).at(-1),
    score_q: Number(item.querySelector('strong')?.textContent),
  })));
  assert.deepEqual(rows, world.expectedTomorrow, 'WHAT: /manana does not render tomorrow’s own ordered values. WHY: a copied today ranking sends a surfer on the wrong trip. HOW: render forecast.days[1] for the Mañana route.');
});

Then('abrir \\/manana directamente muestra la misma superficie', async function (this: PipelineWorld) {
  const page = browserWorld(this).page;
  assert.ok(page, 'test fixture error: tomorrow page is required');
  await page.goto(new URL('/manana', page.url()).toString(), { waitUntil: 'domcontentloaded' });
  assert.match(page.url(), /\/manana\/?$/, 'WHAT: direct /manana did not resolve. HOW: prerender the tomorrow route.');
});

Then('la pestaña Mañana está activa, el pie es honesto y no hay tercer día', async function (this: PipelineWorld) {
  const page = browserWorld(this).page;
  assert.ok(page, 'test fixture error: tomorrow page is required');
  await assert.doesNotReject(async () => page.getByRole('link', { name: 'Mañana' }).getAttribute('aria-current').then((value) => assert.equal(value, 'page')));
  await assert.doesNotReject(async () => page.getByText('Solo hoy y mañana. Más allá nadie sabe de verdad, y no vamos a inventar.').count().then((count) => assert.equal(count, 1)));
  assert.equal(await page.locator('a[href*="pasado"], a[href*="third"], a[href*="7-day"]').count(), 0, 'WHAT: the page offers a third forecast day. HOW: retain only Hoy and Mañana in the public navigation.');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'WHAT: the 390px tomorrow route overflows horizontally. HOW: keep its ranked rows within the mobile viewport.');
});

After(async function (this: PipelineWorld) {
  const world = browserWorld(this);
  await world.browser?.close();
  world.preview?.kill('SIGTERM');
  if (world.root !== undefined) rmSync(world.root, { recursive: true, force: true });
});
