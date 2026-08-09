// Slice-06 acceptance steps: any spot's own page carries its own today and
// tomorrow numbers, size in body-height words with a metre range, and the
// best window -- for the top spot and for a mediocre one alike.
//
// Harness note: every scenario builds an isolated copy of the production
// Astro surface and serves the emitted dist/ through `astro preview`, NOT
// raw `vite preview` the way slice-04's steps do. Verified empirically before
// writing this file: raw `vite preview` defaults to SPA fallback and silently
// serves index.html for ANY unmatched route -- both a real spot's
// directory-style href (masking the routing mismatch this project already
// knows about) and a misspelled one (masking the missing 404 page this slice
// must prove exists). `astro preview` resolves build.format:'file'
// directory-style hrefs correctly and returns a genuine 404 for a route that
// truly does not exist. Its one wrinkle: it daemonises -- the spawned process
// exits 0 immediately after printing "(pid NNNN)" and the server keeps
// running detached. Cleanup here kills that reported pid directly (plus a
// belt-and-braces port sweep), never a plain SIGTERM to the spawned child.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page, type Response } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from './support/world';
import './support/world';

const projectRoot = process.cwd();

type StructuredDay = {
  readonly size_band: string;
  readonly size_range_m: readonly [number, number];
  readonly wind_state: string;
  readonly best_window: { readonly start: string; readonly end: string };
  readonly expected_size: string;
  readonly expected_window: string;
};

/**
 * A day that deliberately carries no structured size or window, regardless
 * of what the real installed data happens to have. Real data completeness is
 * not permanent -- upstream fields (e.g. tide) can still leave a day's size
 * or window null -- so the honest-fallback path is exercised by a fixture
 * that always strips these fields, never by an incidental gap in production
 * data that could close.
 */
type DegradedDay = {
  readonly degraded: true;
};

type ProfileDay = StructuredDay | DegradedDay;

function isDegradedDay(day: ProfileDay): day is DegradedDay {
  return 'degraded' in day;
}

function requiredStructuredDay(day: ProfileDay, context: string): StructuredDay {
  assert.ok(!isDegradedDay(day), `test fixture error: ${context} is deliberately degraded and has no expected_size/expected_window`);
  return day;
}

type Profile = {
  readonly spot_id: string;
  readonly today: ProfileDay;
  readonly tomorrow: ProfileDay;
};

type Slice06Fixture = {
  readonly profiles: Readonly<Record<string, Profile>>;
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-06-spot-profiles.json', import.meta.url),
  'utf8',
)) as Slice06Fixture;

type SurfaceCall = {
  spot_id: string;
  score_q: number;
  call_es: string;
  size_band?: string;
  size_range_m?: readonly [number, number];
  wind_state?: string;
  best_window?: { start: string; end: string };
};

type StaticSurfaceFile = {
  current: {
    calls: SurfaceCall[];
    days: readonly [
      { date: string; spots: SurfaceCall[] },
      { date: string; spots: SurfaceCall[] },
    ];
  };
};

type PreviewDaemon = { readonly url: string; readonly pid: number; readonly root: string };

type RowSummary = { readonly name: string; readonly score: number };

type ExtractedSpotPage = {
  readonly name: string;
  readonly scoreToday: number;
  readonly scoreTomorrow: number;
  readonly sizeToday: string;
  readonly sizeTomorrow: string;
  readonly windowToday: string;
  readonly windowTomorrow: string;
  readonly bodyText: string;
  readonly backHref: string;
  readonly backWidth: number;
  readonly backHeight: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
};

type CapturedSpotPage = ExtractedSpotPage & {
  readonly todayRow: RowSummary;
  readonly tomorrowRow: RowSummary;
};

type WeakestSpotPage = ExtractedSpotPage & {
  readonly spotId: string;
  readonly todayRow: RowSummary;
  readonly tomorrowRow: RowSummary;
};

type Slice06World = PipelineWorld & {
  slice06Root?: string;
  slice06Daemon?: PreviewDaemon;
  slice06UiGate?: { readonly status: number | null; readonly output: string };
  slice06Browser?: Browser;
  slice06Page?: Page;
  slice06Response?: Response | null;
  slice06Pages?: Map<string, CapturedSpotPage>;
  slice06Current?: string;
  slice06WeakestSpot?: WeakestSpotPage;
};

function world06(world: PipelineWorld): Slice06World {
  return world as Slice06World;
}

function credentialFreeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function copyProjectForSurface(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-06-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    copyFileSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  // A directory junction keeps the isolated build offline while using the
  // exact installed dependency tree. Nothing is installed or downloaded.
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function requiredProfile(name: string): Profile {
  const profile = fixture.profiles[name];
  assert.ok(profile, `test fixture error: unknown slice-06 profile ${name}`);
  return profile;
}

function applyDay(rows: readonly SurfaceCall[], spotId: string, day: ProfileDay): void {
  const row = rows.find((call) => call.spot_id === spotId);
  assert.ok(row, `test fixture error: ${spotId} is not in the installed ranking`);
  if (isDegradedDay(day)) {
    delete row.size_band;
    delete row.size_range_m;
    delete row.wind_state;
    delete row.best_window;
    return;
  }
  Object.assign(row, {
    size_band: day.size_band,
    size_range_m: day.size_range_m,
    wind_state: day.wind_state,
    best_window: day.best_window,
  });
}

function applyProfiles(root: string, profileNames: readonly string[]): void {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as StaticSurfaceFile;
  for (const name of profileNames) {
    const profile = requiredProfile(name);
    applyDay(surface.current.calls, profile.spot_id, profile.today);
    applyDay(surface.current.days[1].spots, profile.spot_id, profile.tomorrow);
  }
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
}

function buildSurface(root: string): { readonly status: number | null; readonly output: string } {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`Slice-06 surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
  const gate = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return { status: gate.status, output: `${gate.stdout}${gate.stderr}` };
}

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('test fixture error: could not allocate a preview port'));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });
}

async function waitForReachable(url: string, root: string, log: () => string): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`preview returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Slice-06 preview at ${root} never became reachable: ${String(lastError)}\n${log()}`);
}

async function startPreviewDaemon(root: string): Promise<PreviewDaemon> {
  const port = await unusedPort();
  const astro = join(root, 'node_modules/.bin/astro');
  const child = spawn(astro, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let pid: number | null = null;
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    const match = /\(pid (\d+)\)/.exec(output);
    if (match?.[1] !== undefined) pid = Number(match[1]);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const url = `http://127.0.0.1:${port}`;
  await waitForReachable(url, root, () => output);
  // The port can become reachable before the piped stdout 'data' event with
  // the "(pid NNNN)" startup line has been processed by this event loop --
  // observed as a real race, not a hypothetical one. Poll briefly rather
  // than asserting immediately.
  const pidDeadline = Date.now() + 5_000;
  while (pid === null && Date.now() < pidDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(pid !== null, `test fixture error: astro preview became reachable but never reported a pid.\n${output}`);
  return { url, pid, root };
}

function stopPreviewDaemon(daemon: PreviewDaemon | undefined): void {
  if (daemon === undefined) return;
  try {
    process.kill(daemon.pid, 'SIGKILL');
  } catch {
    // already gone
  }
  const port = new URL(daemon.url).port;
  // Belt-and-braces only: match LISTENING sockets on this exact port, never
  // any connection. Plain `lsof -i :PORT` also matches THIS process's own
  // outbound fetch()/Playwright connections to that port -- lsof matches a
  // port on either side of a socket. Verified empirically: an unfiltered
  // sweep returned this very process's own pid, and killing it self-
  // terminated the run (observed as an unexplained SIGKILL, exit 137, with
  // no error ever printed). `-sTCP:LISTEN` scopes the match to the actual
  // server socket; `pid !== process.pid` is a second, explicit guard.
  const lookup = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  for (const pidText of (lookup.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)) {
    const pid = Number(pidText);
    if (pid === process.pid) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

async function ensureDaemon(world: Slice06World): Promise<PreviewDaemon> {
  if (world.slice06Daemon !== undefined) return world.slice06Daemon;
  assert.ok(world.slice06Root, 'test fixture error: isolated slice-06 root is required');
  world.slice06UiGate = buildSurface(world.slice06Root);
  const daemon = await startPreviewDaemon(world.slice06Root);
  world.slice06Daemon = daemon;
  return daemon;
}

async function ensureBrowser(
  world: Slice06World,
  theme: string,
  movement: string,
  width: number,
): Promise<Page> {
  if (world.slice06Browser === undefined) {
    world.slice06Browser = await chromium.launch({ headless: true });
  }
  if (world.slice06Page !== undefined) {
    await world.slice06Page.close();
  }
  const page = await world.slice06Browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  world.slice06Page = page;
  return page;
}

function requiredPage(world: Slice06World): Page {
  assert.ok(world.slice06Page, 'test fixture error: no page is open yet');
  return world.slice06Page;
}

function requiredPages(world: Slice06World): Map<string, CapturedSpotPage> {
  if (world.slice06Pages === undefined) world.slice06Pages = new Map();
  return world.slice06Pages;
}

function capturedPage(world: Slice06World, profileName: string): CapturedSpotPage {
  const page = requiredPages(world).get(profileName);
  assert.ok(page, `test fixture error: profile "${profileName}" page was not opened yet`);
  return page;
}

function requiredCurrent(world: Slice06World): string {
  assert.ok(world.slice06Current, 'test fixture error: no spot page has been opened yet');
  return world.slice06Current;
}

function requiredWeakest(world: Slice06World): WeakestSpotPage {
  assert.ok(world.slice06WeakestSpot, 'test fixture error: the weakest spot page was not opened yet');
  return world.slice06WeakestSpot;
}

async function rankedRow(page: Page, spotId: string): Promise<RowSummary> {
  const row = page.locator(`ol.ranked > li:has(a[href="/spots/${spotId}/"])`);
  const count = await row.count();
  assert.equal(count, 1, `test fixture error: expected exactly one list row for /spots/${spotId}/, found ${count}`);
  return row.evaluate((li) => {
    const anchor = li.querySelector('a');
    const score = li.querySelector('strong');
    return {
      name: (anchor?.textContent ?? '').replace(/^VE A\s+/i, '').trim(),
      score: Number(score?.textContent?.trim() || 'NaN'),
    };
  });
}

async function extractSpotPage(page: Page): Promise<ExtractedSpotPage> {
  // No named const helper functions inside this callback: tsx/esbuild wraps
  // named function bindings with a `__name(...)` call for `.name`
  // preservation, and that wrapper is not defined once Playwright serializes
  // this closure's source into the browser context. Verified empirically
  // (ReferenceError: __name is not defined). Every lookup is inlined instead.
  return page.evaluate(() => {
    const back = document.querySelector('[data-field="back-to-list"]');
    const backRect = back?.getBoundingClientRect();
    return {
      name: document.querySelector('h1')?.textContent?.trim() ?? '',
      scoreToday: Number(document.querySelector('section[data-day="today"] [data-field="score"]')?.textContent?.trim() || 'NaN'),
      scoreTomorrow: Number(document.querySelector('section[data-day="tomorrow"] [data-field="score"]')?.textContent?.trim() || 'NaN'),
      sizeToday: document.querySelector('section[data-day="today"] [data-field="size"]')?.textContent?.trim() ?? '',
      sizeTomorrow: document.querySelector('section[data-day="tomorrow"] [data-field="size"]')?.textContent?.trim() ?? '',
      windowToday: document.querySelector('section[data-day="today"] [data-field="window"]')?.textContent?.trim() ?? '',
      windowTomorrow: document.querySelector('section[data-day="tomorrow"] [data-field="window"]')?.textContent?.trim() ?? '',
      bodyText: document.body.innerText,
      backHref: back?.getAttribute('href') ?? '',
      backWidth: backRect?.width ?? 0,
      backHeight: backRect?.height ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

async function openProfilePage(
  world: Slice06World,
  profileName: string,
  width: number,
  theme: string,
  movement: string,
): Promise<void> {
  const profile = requiredProfile(profileName);
  const daemon = await ensureDaemon(world);
  const page = await ensureBrowser(world, theme, movement, width);
  await page.goto(daemon.url, { waitUntil: 'domcontentloaded' });
  const todayRow = await rankedRow(page, profile.spot_id);
  await page.goto(`${daemon.url}/manana/`, { waitUntil: 'domcontentloaded' });
  const tomorrowRow = await rankedRow(page, profile.spot_id);
  await page.goto(daemon.url, { waitUntil: 'domcontentloaded' });
  await page.locator(`ol.ranked > li a[href="/spots/${profile.spot_id}/"]`).click();
  await page.waitForLoadState('domcontentloaded');
  const captured = await extractSpotPage(page);
  requiredPages(world).set(profileName, { ...captured, todayRow, tomorrowRow });
  world.slice06Current = profileName;
}

function hasTechnicalLeak(text: string): boolean {
  return /\b(?:AccessDenied|stack trace|TypeError|ReferenceError|undefined|NaN|Internal Server Error|Cannot GET)\b/i.test(text);
}

/**
 * A metre number that is neither the low edge of a range nor the open-ended
 * floor phrase. Mirrors the contract's own oracle (published-display-format
 * test) so `0.7-1.1 m` and `2.4 m o más` are never mistaken for a bare value.
 */
const BARE_METRE_VALUE = /(?:^|[^–\d.])\d+(?:[.,]\d+)?\s*m\b(?!\s*o más)/u;

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: el surfista abre cualquier spot, no solo el mejor, y necesita sus propios números completos y honestos. HOW: ${how}`,
  );
}

// ---------- Given ----------

Given('una superficie publicada real, sin modificar', function (this: PipelineWorld) {
  world06(this).slice06Root = copyProjectForSurface();
});

Given('una superficie publicada donde un spot pierde su tamaño y su ventana de hoy', function (this: PipelineWorld) {
  const world = world06(this);
  world.slice06Root = copyProjectForSurface();
  applyProfiles(world.slice06Root, ['sin-datos']);
});

Given('una superficie publicada con perfiles de tamaño y ventana distintos para dos spots', function (this: PipelineWorld) {
  const world = world06(this);
  world.slice06Root = copyProjectForSurface();
  applyProfiles(world.slice06Root, ['primera-luz', 'medio-flojo']);
});

// ---------- When ----------

When(
  'el surfista escribe mal la dirección de un spot y la abre a {int} px',
  { timeout: 30_000 },
  async function (this: PipelineWorld, width: number) {
    const world = world06(this);
    const daemon = await ensureDaemon(world);
    const page = await ensureBrowser(world, 'claro', 'normal', width);
    world.slice06Response = await page.goto(`${daemon.url}/spots/spot-que-no-existe/`, { waitUntil: 'domcontentloaded' });
  },
);

When(
  'el surfista toca {string} desde la lista de hoy y abre su página a {int} px',
  { timeout: 30_000 },
  async function (this: PipelineWorld, profileName: string, width: number) {
    await openProfilePage(world06(this), profileName, width, 'claro', 'normal');
  },
);

When(
  'el surfista abre la página de {string} y luego la de {string} a {int} px',
  { timeout: 45_000 },
  async function (this: PipelineWorld, first: string, second: string, width: number) {
    const world = world06(this);
    await openProfilePage(world, first, width, 'claro', 'normal');
    await openProfilePage(world, second, width, 'claro', 'normal');
  },
);

When(
  'el surfista abre la página del spot más flojo de la lista a {int} px',
  { timeout: 30_000 },
  async function (this: PipelineWorld, width: number) {
    const world = world06(this);
    const daemon = await ensureDaemon(world);
    const page = await ensureBrowser(world, 'claro', 'normal', width);
    await page.goto(daemon.url, { waitUntil: 'domcontentloaded' });
    const href = await page.locator('ol.ranked > li').last().locator('a').getAttribute('href');
    assert.ok(href, 'test fixture error: last ranked row has no link');
    const spotId = href.replace(/^\/spots\//, '').replace(/\/$/, '');
    const todayRow = await rankedRow(page, spotId);
    await page.goto(`${daemon.url}/manana/`, { waitUntil: 'domcontentloaded' });
    const tomorrowRow = await rankedRow(page, spotId);
    await page.goto(daemon.url, { waitUntil: 'domcontentloaded' });
    await page.locator(`ol.ranked > li a[href="/spots/${spotId}/"]`).click();
    await page.waitForLoadState('domcontentloaded');
    const captured = await extractSpotPage(page);
    world.slice06WeakestSpot = { spotId, todayRow, tomorrowRow, ...captured };
  },
);

When(
  'el surfista toca el camino de vuelta',
  { timeout: 15_000 },
  async function (this: PipelineWorld) {
    const page = requiredPage(world06(this));
    await page.locator('[data-field="back-to-list"]').click();
    await page.waitForLoadState('domcontentloaded');
  },
);

When(
  'el surfista abre la página de {string} a {int} px',
  { timeout: 30_000 },
  async function (this: PipelineWorld, profileName: string, width: number) {
    await openProfilePage(world06(this), profileName, width, 'claro', 'normal');
  },
);

When(
  'el surfista abre la página de {string} a {int} px, con tema {string} y movimiento {string}',
  { timeout: 30_000 },
  async function (this: PipelineWorld, profileName: string, width: number, theme: string, movement: string) {
    await openProfilePage(world06(this), profileName, width, theme, movement);
  },
);

// ---------- Then ----------

Then('la página dice en español que esa playa no existe, sin error crudo ni texto en blanco', { timeout: 15_000 }, async function (this: PipelineWorld) {
  const world = world06(this);
  const page = requiredPage(world);
  const body = await page.evaluate(() => ({
    text: document.body.innerText.trim(),
    lang: document.documentElement.getAttribute('lang'),
  }));
  const status = world.slice06Response?.status() ?? null;
  const findings: string[] = [];
  if (body.text.length === 0) findings.push('la página quedó en blanco');
  if (body.lang !== 'es') findings.push(`la página no está en español (lang="${String(body.lang)}")`);
  if (!/no (?:encontramos|existe)/i.test(body.text)) findings.push('la página no dice en palabras que esa playa no existe');
  if (hasTechnicalLeak(body.text)) findings.push(`la página expone un error crudo: "${body.text}"`);
  if (status !== 404) findings.push(`la respuesta fue ${String(status)}, no 404`);
  assertBehavior(findings, 'servir src/pages/404.astro, real y en español, para cualquier dirección de spot que no exista.');
});

Then(
  'la página ofrece un camino de vuelta a la lista, y no es silenciosamente la propia lista',
  async function (this: PipelineWorld) {
    const page = requiredPage(world06(this));
    const info = await page.evaluate(() => ({
      backHref: document.querySelector('[data-field="back-to-list"]')?.getAttribute('href') ?? null,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      hasRanked: document.querySelector('ol.ranked') !== null,
    }));
    const findings: string[] = [];
    if (info.backHref === null || !/^\/$/.test(info.backHref)) findings.push('no hay un enlace real de vuelta a la lista de hoy');
    if (info.hasRanked) findings.push('la dirección mal escrita cayó silenciosamente en la propia lista de hoy, en vez de una página 404 real');
    assertBehavior(findings, 'servir una página 404 real con un enlace explícito de vuelta, nunca la lista disfrazada de respuesta.');
  },
);

Then('la página nombra ese spot y no otro', function (this: PipelineWorld) {
  const world = world06(this);
  const page = capturedPage(world, requiredCurrent(world));
  assertBehavior(
    page.name === page.todayRow.name ? [] : [`la página muestra "${page.name}", su fila en la lista dice "${page.todayRow.name}"`],
    'usar spot_detail.name de ese spot_id exacto, nunca el de otra fila.',
  );
});

Then('el puntaje de hoy en la página es el mismo que su fila de hoy en la lista', function (this: PipelineWorld) {
  const world = world06(this);
  const page = capturedPage(world, requiredCurrent(world));
  assertBehavior(
    page.scoreToday === page.todayRow.score ? [] : [`la página muestra ${page.scoreToday}, la fila de hoy en la lista muestra ${page.todayRow.score}`],
    'leer el puntaje de hoy de la misma fila publicada que la lista de hoy, sin recalcularlo.',
  );
});

Then('el puntaje de mañana en la página es el mismo que su fila de mañana en la lista de mañana', function (this: PipelineWorld) {
  const world = world06(this);
  const page = capturedPage(world, requiredCurrent(world));
  assertBehavior(
    page.scoreTomorrow === page.tomorrowRow.score ? [] : [`la página muestra ${page.scoreTomorrow}, la fila de mañana en /manana/ muestra ${page.tomorrowRow.score}`],
    'leer el puntaje de mañana del día 1 del bundle publicado, sin copiar el de hoy.',
  );
});

Then(
  'el tamaño de hoy y de mañana aparecen como palabra del cuerpo primero y luego "≈" con un rango en metros',
  function (this: PipelineWorld) {
    const world = world06(this);
    const current = requiredCurrent(world);
    const profile = requiredProfile(current);
    const today = requiredStructuredDay(profile.today, `${current}.today`);
    const tomorrow = requiredStructuredDay(profile.tomorrow, `${current}.tomorrow`);
    const page = capturedPage(world, current);
    const findings: string[] = [];
    if (page.sizeToday !== today.expected_size) findings.push(`hoy: se esperaba "${today.expected_size}", se vio "${page.sizeToday}"`);
    if (page.sizeTomorrow !== tomorrow.expected_size) findings.push(`mañana: se esperaba "${tomorrow.expected_size}", se vio "${page.sizeTomorrow}"`);
    assertBehavior(findings, 'renderizar formatSizeEs(size_band, size_range_m) del día correspondiente, nunca formatear el tamaño a mano.');
  },
);

Then(
  'la ventana de hoy y de mañana aparecen como "Ventana" con hora de inicio y de fin',
  function (this: PipelineWorld) {
    const world = world06(this);
    const current = requiredCurrent(world);
    const profile = requiredProfile(current);
    const today = requiredStructuredDay(profile.today, `${current}.today`);
    const tomorrow = requiredStructuredDay(profile.tomorrow, `${current}.tomorrow`);
    const page = capturedPage(world, current);
    const findings: string[] = [];
    if (page.windowToday !== today.expected_window) findings.push(`hoy: se esperaba "${today.expected_window}", se vio "${page.windowToday}"`);
    if (page.windowTomorrow !== tomorrow.expected_window) findings.push(`mañana: se esperaba "${tomorrow.expected_window}", se vio "${page.windowTomorrow}"`);
    assertBehavior(findings, 'renderizar formatBestWindowEs(best_window) del día correspondiente, nunca formatear la ventana a mano.');
  },
);

Then('el tamaño de hoy de un spot no es igual al tamaño de hoy del otro', function (this: PipelineWorld) {
  const world = world06(this);
  const a = capturedPage(world, 'primera-luz');
  const b = capturedPage(world, 'medio-flojo');
  assertBehavior(
    a.sizeToday !== b.sizeToday ? [] : [`ambos spots muestran el mismo tamaño de hoy: "${a.sizeToday}"`],
    'leer el tamaño publicado de CADA spot por su propio spot_id, nunca copiar el de otro.',
  );
});

Then('la ventana de hoy de un spot no es igual a la ventana de hoy del otro', function (this: PipelineWorld) {
  const world = world06(this);
  const a = capturedPage(world, 'primera-luz');
  const b = capturedPage(world, 'medio-flojo');
  assertBehavior(
    a.windowToday !== b.windowToday ? [] : [`ambos spots muestran la misma ventana de hoy: "${a.windowToday}"`],
    'leer la ventana publicada de CADA spot por su propio spot_id, nunca copiar la de otro.',
  );
});

Then('ninguna de las dos páginas muestra un valor de metros exacto y sin "≈" ni rango', function (this: PipelineWorld) {
  const world = world06(this);
  const findings: string[] = [];
  for (const name of ['primera-luz', 'medio-flojo']) {
    const page = capturedPage(world, name);
    const match = BARE_METRE_VALUE.exec(page.bodyText);
    if (match) findings.push(`la página de ${name} muestra un metro exacto y pelado: "${match[0].trim()}"`);
  }
  assertBehavior(findings, 'renderizar el tamaño siempre con formatSizeEs: palabra, "≈" y rango, jamás un número de metros suelto.');
});

Then('la página nombra ese spot y trae sus números reales de hoy y de mañana', function (this: PipelineWorld) {
  const page = requiredWeakest(world06(this));
  const findings: string[] = [];
  if (page.name !== page.todayRow.name) findings.push(`la página dice "${page.name}", la lista dice "${page.todayRow.name}"`);
  if (page.scoreToday !== page.todayRow.score) findings.push(`el puntaje de hoy no cuadra: página ${page.scoreToday}, lista ${page.todayRow.score}`);
  if (page.scoreTomorrow !== page.tomorrowRow.score) findings.push(`el puntaje de mañana no cuadra: página ${page.scoreTomorrow}, lista ${page.tomorrowRow.score}`);
  assertBehavior(findings, 'renderizar el spot real más flojo con sus propios datos publicados, sin inventar ni dejar vacío.');
});

Then(
  'el tamaño y la ventana de hoy y de mañana están completos o dicen en palabras que faltan, nunca en blanco ni con error crudo',
  function (this: PipelineWorld) {
    // Deliberately data-state-agnostic: the real weakest spot may have full
    // structured data today and a genuine gap tomorrow (a coordinator-verified
    // fact -- completeness is not permanent, e.g. the tide gap). This proves
    // the page is always in ONE of the two honest states, whichever the real
    // data currently is, rather than assuming either state permanently.
    const page = requiredWeakest(world06(this));
    const findings: string[] = [];
    if (hasTechnicalLeak(page.bodyText)) findings.push('la página expone un error crudo o un valor técnico');
    for (const [label, text] of [
      ['tamaño de hoy', page.sizeToday],
      ['tamaño de mañana', page.sizeTomorrow],
      ['ventana de hoy', page.windowToday],
      ['ventana de mañana', page.windowTomorrow],
    ] as const) {
      if (text.trim().length === 0) {
        findings.push(`${label} quedó vacío`);
        continue;
      }
      const isHonestFallback = /^Sin (?:datos de tamaño|ventana)/i.test(text);
      const isFormatted = text.includes('≈') || /^Ventana\s/.test(text);
      if (!isHonestFallback && !isFormatted) {
        findings.push(`${label} no es ni un valor formateado ni el mensaje honesto de "sin datos": "${text}"`);
      }
    }
    assertBehavior(findings, 'mostrar siempre el tamaño y la ventana formateados con formatSizeEs/formatBestWindowEs, o el mensaje honesto en palabras cuando falten -- nunca vacío ni un valor crudo, sin importar si los datos de hoy están completos.');
  },
);

Then(
  'donde falta tamaño o ventana la página lo dice en palabras, sin error crudo ni texto en blanco',
  function (this: PipelineWorld) {
    // Bound to a DELIBERATELY degraded fixture profile (never to whatever the
    // real installed data happens to have): a scenario that only "passes"
    // because production data is currently incomplete is not proof the
    // fallback works, it is a coincidence. See "sin-datos" in the fixture.
    const world = world06(this);
    const page = capturedPage(world, requiredCurrent(world));
    const findings: string[] = [];
    if (hasTechnicalLeak(page.bodyText)) findings.push('la página expone un error crudo o un valor técnico');
    if (page.sizeToday.trim().length === 0) findings.push('el campo de tamaño de hoy quedó vacío en vez de decir algo');
    if (page.windowToday.trim().length === 0) findings.push('el campo de ventana de hoy quedó vacío en vez de decir algo');
    if (!/sin datos de tamaño/i.test(page.sizeToday)) findings.push('falta el tamaño y la página no lo dice en palabras');
    if (!/sin ventana/i.test(page.windowToday)) findings.push('falta la ventana y la página no lo dice en palabras');
    assertBehavior(findings, 'mostrar un mensaje explícito en español cuando el tamaño o la ventana todavía no están publicados para ese spot.');
  },
);

Then('la ventana de mañana para ese mismo spot aparece con formato normal, no degradada', function (this: PipelineWorld) {
  // Proves the degradation is scoped to today only: tomorrow's structured
  // fields are untouched by the fixture and must render formatted, not fall
  // back, on the very same page as today's deliberately missing fields.
  const world = world06(this);
  const current = requiredCurrent(world);
  const tomorrow = requiredStructuredDay(requiredProfile(current).tomorrow, `${current}.tomorrow`);
  const page = capturedPage(world, current);
  assertBehavior(
    page.windowTomorrow === tomorrow.expected_window ? [] : [`se esperaba "${tomorrow.expected_window}", se vio "${page.windowTomorrow}"`],
    'degradar solo el día cuyo dato falta; el otro día del mismo spot sigue leyendo formatBestWindowEs normalmente.',
  );
});

Then('nada se corta ni se encima en 390 px', function (this: PipelineWorld) {
  const world = world06(this);
  const page = capturedPage(world, requiredCurrent(world));
  assertBehavior(
    page.scrollWidth <= page.clientWidth ? [] : [`el documento desborda: scrollWidth ${page.scrollWidth} > clientWidth ${page.clientWidth}`],
    'usar el layout móvil existente (Base.astro, components.css) sin anchos fijos que no quepan en 390 px.',
  );
});

Then('el camino de vuelta mide al menos 44 por 44 px', function (this: PipelineWorld) {
  const world = world06(this);
  const page = capturedPage(world, requiredCurrent(world));
  const findings: string[] = [];
  if (page.backWidth < 44) findings.push(`ancho ${Math.round(page.backWidth)}px`);
  if (page.backHeight < 44) findings.push(`alto ${Math.round(page.backHeight)}px`);
  assertBehavior(findings, 'dar al enlace de vuelta el tamaño táctil --tap ya usado por nav a.');
});

Then('el surfista está de nuevo en la lista de hoy', async function (this: PipelineWorld) {
  const page = requiredPage(world06(this));
  const info = await page.evaluate(() => ({
    hasRanked: document.querySelector('ol.ranked') !== null,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
  }));
  assertBehavior(
    info.hasRanked ? [] : [`no volvió a la lista, el título es "${info.heading}"`],
    'enlazar el camino de vuelta a la ruta de la lista de hoy (paths.home).',
  );
});

// Contrast math runs here in Node, not inside page.evaluate: a named const
// helper bound inside an evaluate callback gets wrapped by tsx/esbuild in a
// `__name(...)` call for `.name` preservation, and that wrapper does not
// exist once Playwright serializes the closure into the browser (verified
// empirically: ReferenceError: __name is not defined). The browser side of
// this check only collects raw computed-style strings.
function parseRgb(value: string): readonly number[] | null {
  const match = /rgba?\(([^)]+)\)/i.exec(value);
  if (!match || match[1] === undefined) return null;
  const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

function relativeLuminance([r, g, b]: readonly number[]): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
}

function contrastRatio(foreground: readonly number[], background: readonly number[]): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

interface RawAudit {
  readonly backgroundColor: string;
  readonly textColors: readonly { readonly tag: string; readonly color: string }[];
  readonly moving: readonly string[];
  readonly loadingCount: number;
}

Then('la página del spot cumple las siete comprobaciones visuales', async function (this: PipelineWorld) {
  const world = world06(this);
  const page = requiredPage(world);
  const captured = capturedPage(world, requiredCurrent(world));
  const raw: RawAudit = await page.evaluate(() => {
    const backgroundColor = getComputedStyle(document.body).backgroundColor;
    const textColors = [...document.querySelectorAll('h1, section p, section strong, [data-field]')]
      .filter((el) => (el.textContent ?? '').trim().length > 0 && el.getBoundingClientRect().width > 0)
      .map((el) => ({ tag: el.tagName.toLowerCase(), color: getComputedStyle(el).color }));
    const moving = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? [...document.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0))
        .map((el) => el.tagName.toLowerCase())
      : [];
    const loadingCount = document.querySelectorAll('[role="progressbar"], [data-reading-state="loading"], .spinner, .skeleton').length;
    return { backgroundColor, textColors, moving, loadingCount };
  });
  const background = parseRgb(raw.backgroundColor) ?? [255, 255, 255];
  const contrastFailures = raw.textColors.flatMap(({ tag, color }) => {
    const foreground = parseRgb(color);
    if (foreground === null) return ['no se pudo medir el color de un texto principal'];
    const ratio = contrastRatio(foreground, background);
    return ratio < 4.5 ? [`${tag} queda en ${ratio.toFixed(2)}:1`] : [];
  });
  const findings: string[] = [];
  findings.push(...contrastFailures.map((finding) => `U1: ${finding}`));
  if (captured.scrollWidth > captured.clientWidth) findings.push('U2: la página desborda 390 px');
  if (captured.backWidth < 44 || captured.backHeight < 44) findings.push('U3: el camino de vuelta no cumple el tamaño táctil');
  if (raw.moving.length > 0) findings.push(`U4: movimiento reducido deja transiciones en ${raw.moving.join(', ')}`);
  if (raw.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial');
  if (world.slice06UiGate?.status !== 0) findings.push(`U2/U4/U6/U7: el gate de la superficie falló: ${(world.slice06UiGate?.output ?? '').trim()}`);
  assertBehavior(findings, 'reusar los tokens y componentes existentes (Base.astro, components.css) para la página del spot, sin introducir estilo propio.');
});

After({ tags: '@slice-06', timeout: 15_000 }, async function (this: PipelineWorld) {
  const world = world06(this);
  await world.slice06Page?.close().catch(() => undefined);
  await world.slice06Browser?.close().catch(() => undefined);
  stopPreviewDaemon(world.slice06Daemon);
  if (world.slice06Root !== undefined) {
    rmSync(world.slice06Root, { recursive: true, force: true });
  }
});
