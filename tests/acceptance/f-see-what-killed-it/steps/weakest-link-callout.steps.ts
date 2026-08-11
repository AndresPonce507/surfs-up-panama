// Slice-01 acceptance steps for f-see-what-killed-it: the spot page names the
// one factor that ruined the day, per day section, in plain Spanish.
//
// HOW THESE DRIVE PRODUCTION
// --------------------------
// Every browser scenario builds an isolated copy of the production Astro
// surface with `npm run build` (the same command CI runs: publish:surface
// --verify then astro build) and serves the emitted dist/ over real HTTP from
// this process. Chromium then reads it at 390 px. The worktree's own data and
// dist are never written.
//
// NOT `astro preview`, and NOT `vite preview`. Both were rejected for this
// lane: vite preview's SPA fallback silently serves index.html for any
// unmatched route, which turns a missing spot page into a false pass; and the
// project must not depend on a preview server's own routing when the emitted
// artefact is what ships to S3. The server below resolves exactly three ways
// and then gives up with a real 404:
//     /x        -> dist/x        -> dist/x.html      -> dist/x/index.html
//     /x/       -> dist/x/index.html                 -> dist/x.html
// The trailing-slash rule mirrors the CloudFront rewrite the deploy owes:
// `build.format: 'file'` emits dist/spots/<id>.html while paths.spot() links
// to /spots/<id>/. That mismatch is Pre-requisite 6 (hosted preview 403s), a
// keystone/deploy concern; resolving it here keeps this lane's scenarios
// failing on the callout, which is what slice-01 owes, rather than on hosting,
// which it does not.
//
// THE MARKUP CONTRACT THIS SLICE FIXES
// ------------------------------------
// The culprit sentence renders as ONE element per day section:
//     section[data-day="today"]    [data-field="weakest-link"]
//     section[data-day="tomorrow"] [data-field="weakest-link"]
// following the house data-field convention already used for score, size and
// window. A day with no published culprit renders NO such element at all --
// not an empty one. Selectors live here, never in the Gherkin.
//
// FIXTURE DISCIPLINE
// ------------------
// The Given plants only what the pipeline is allowed to publish: a
// `weakest_link` value per spot-day on the reading surface. It never plants a
// rendered sentence. Two spots deliberately carry the honest negatives (an
// explicit null, and the field absent entirely), and every other spot carries
// a culprit, so "19 of 20 rows silently blank" cannot pass here the way it
// passed CI once before.
//
// SHARED WORLD
// ------------
// The cucumber World is registered once, globally, by the keystone lane's
// support module. This file imports it (read-only) and must never call
// setWorldConstructor: a second registration would replace the World for every
// other feature in the same run.

import { After, AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';

const projectRoot = process.cwd();

// ---------------------------------------------------------------- fixture --

type Factor = 'dir' | 'size' | 'wind' | 'tide';

type ProfileDay = {
  readonly link?: Factor | null;
  /**
   * The one scalar the published row has already paired with its named
   * factor. This is only a morning input for Slice-02's browser contract,
   * never a sentence the fixture expects the page to produce.
   */
  readonly subscore?: number;
  readonly omit?: boolean;
  readonly drop_wind_state?: boolean;
};

type Fixture = {
  readonly factor_words: Readonly<Record<Factor, string>>;
  readonly default_cycle: { readonly today: readonly Factor[]; readonly tomorrow: readonly Factor[] };
  readonly profiles: Readonly<Record<string, { readonly spot_id: string; readonly today: ProfileDay; readonly tomorrow: ProfileDay }>>;
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-01-weakest-link-profiles.json', import.meta.url),
  'utf8',
)) as Fixture;

const FACTOR_WORD: Readonly<Record<Factor, RegExp>> = {
  dir: new RegExp(fixture.factor_words.dir, 'i'),
  size: new RegExp(fixture.factor_words.size, 'i'),
  wind: new RegExp(fixture.factor_words.wind, 'i'),
  tide: new RegExp(fixture.factor_words.tide, 'i'),
};

type DayPlan = {
  readonly link: Factor | null;
  readonly subscore?: number;
  readonly omit: boolean;
  readonly dropWindState: boolean;
};
type SpotPlan = { readonly today: DayPlan; readonly tomorrow: DayPlan };

function requiredProfile(name: string): { spot_id: string; today: ProfileDay; tomorrow: ProfileDay } {
  const profile = fixture.profiles[name];
  assert.ok(profile, `test fixture error: unknown slice-01 profile "${name}"`);
  return profile;
}

function dayPlan(declared: ProfileDay | undefined, fallback: Factor): DayPlan {
  if (declared === undefined) return { link: fallback, omit: false, dropWindState: false };
  return {
    link: declared.omit === true ? null : declared.link === undefined ? fallback : declared.link,
    ...(declared.subscore === undefined ? {} : { subscore: declared.subscore }),
    omit: declared.omit === true,
    dropWindState: declared.drop_wind_state === true,
  };
}

/**
 * The published morning this lane asserts against, decided once from the
 * installed ranking so the Given and every Then read the same plan. Named
 * profiles win; every other spot gets a culprit from the rotating cycle, so no
 * row is accidentally blank.
 */
function buildPlan(): ReadonlyMap<string, SpotPlan> {
  const surface = JSON.parse(readFileSync(join(projectRoot, 'data/published-surface.json'), 'utf8')) as {
    current: { calls: { spot_id: string }[] };
  };
  const named = new Map(Object.values(fixture.profiles).map((p) => [p.spot_id, p]));
  const plan = new Map<string, SpotPlan>();
  surface.current.calls.forEach((call, index) => {
    const profile = named.get(call.spot_id);
    const todayFallback = fixture.default_cycle.today[index % fixture.default_cycle.today.length] ?? 'size';
    const tomorrowFallback = fixture.default_cycle.tomorrow[index % fixture.default_cycle.tomorrow.length] ?? 'tide';
    plan.set(call.spot_id, {
      today: dayPlan(profile?.today, todayFallback),
      tomorrow: dayPlan(profile?.tomorrow, tomorrowFallback),
    });
  });
  return plan;
}

const PLAN = buildPlan();

function plannedSpot(spotId: string): SpotPlan {
  const planned = PLAN.get(spotId);
  assert.ok(planned, `test fixture error: "${spotId}" is not in the installed ranking`);
  return planned;
}

function plannedFor(profileName: string): { spotId: string; plan: SpotPlan } {
  const spotId = requiredProfile(profileName).spot_id;
  return { spotId, plan: plannedSpot(spotId) };
}

// ------------------------------------------------------- isolated surface --

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
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-killed-it-'));
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

type SurfaceRow = {
  spot_id: string;
  weakest_link?: Factor | null;
  weakest_link_subscore?: number;
  wind_state?: string;
};

function applyDayPlan(rows: SurfaceRow[], which: 'today' | 'tomorrow'): void {
  for (const row of rows) {
    const planned = plannedSpot(row.spot_id)[which];
    if (planned.omit) {
      delete row.weakest_link;
    } else {
      row.weakest_link = planned.link;
    }
    if (typeof planned.subscore === 'number' && planned.link !== null && !planned.omit) {
      row.weakest_link_subscore = planned.subscore;
    } else {
      delete row.weakest_link_subscore;
    }
    if (planned.dropWindState) delete row.wind_state;
  }
}

/**
 * Plants the pipeline's own output on the reading surface: one named cause,
 * and where supplied, its already-paired value, per spot-day. This is an
 * INPUT, never an expected rendering.
 */
function applyPublishedCulprits(root: string): void {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as {
    current: { calls: SurfaceRow[]; days: [{ spots: SurfaceRow[] }, { spots: SurfaceRow[] }] };
  };
  applyDayPlan(surface.current.calls, 'today');
  applyDayPlan(surface.current.days[0].spots, 'today');
  applyDayPlan(surface.current.days[1].spots, 'tomorrow');
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
}

type UiGate = { readonly status: number | null; readonly output: string };

function buildSurface(root: string): UiGate {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`Slice-01 surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
  const gate = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return { status: gate.status, output: `${gate.stdout}${gate.stderr}` };
}

// ------------------------------------------------- emitted dist over HTTP --

const CONTENT_TYPE: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function resolveEmittedFile(distRoot: string, requestUrl: string): string | null {
  const withoutQuery = requestUrl.split('?')[0] ?? '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  const clean = normalize(decoded);
  if (!clean.startsWith('/')) return null;
  const candidates = clean.endsWith('/')
    ? [`${clean}index.html`, `${clean.slice(0, -1)}.html`]
    : [clean, `${clean}.html`, `${clean}/index.html`];
  const base = resolve(distRoot);
  for (const candidate of candidates) {
    const full = resolve(base, `.${candidate}`);
    if (full !== base && !full.startsWith(base + sep)) continue;
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      // not emitted under that name; try the next resolution
    }
  }
  return null;
}

async function unusedPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createNetServer();
    probe.once('error', rejectPort);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        rejectPort(new Error('test fixture error: could not allocate a port for the emitted surface'));
        return;
      }
      probe.close((error) => (error === undefined ? resolvePort(address.port) : rejectPort(error)));
    });
  });
}

async function startDistServer(distRoot: string, port: number): Promise<Server> {
  const server = createHttpServer((request, response) => {
    const file = resolveEmittedFile(distRoot, request.url ?? '/');
    if (file === null) {
      // A real 404 with the emitted 404 document. No SPA fallback, ever: a
      // fallback would serve the list page for a missing spot page and turn a
      // missing feature into a passing test.
      let body = 'No encontramos esa página.';
      try {
        body = readFileSync(join(distRoot, '404.html'), 'utf8');
      } catch {
        // the surface emitted no 404 document; the plain sentence stands in
      }
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPE[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ready());
  });
  return server;
}

type Harness = { readonly root: string; readonly url: string; readonly server: Server; readonly uiGate: UiGate };

// Built once per run: every browser scenario reads the SAME published morning,
// which is also what makes the scenarios a chained narrative rather than ten
// unrelated fixtures.
let harness: Harness | null = null;

async function ensureHarness(): Promise<Harness> {
  if (harness !== null) return harness;
  const root = copyProjectForSurface();
  applyPublishedCulprits(root);
  const uiGate = buildSurface(root);
  const port = await unusedPort();
  const server = await startDistServer(join(root, 'dist'), port);
  harness = { root, url: `http://127.0.0.1:${port}`, server, uiGate };
  return harness;
}

function requiredHarness(): Harness {
  assert.ok(harness, 'test fixture error: the published morning was never built');
  return harness;
}

// ------------------------------------------------------------- the reader --

type CalloutReading = {
  readonly today: string | null;
  readonly tomorrow: string | null;
  readonly todayCount: number;
  readonly tomorrowCount: number;
  readonly scoreToday: string;
  readonly scoreTomorrow: string;
  readonly sizeToday: string;
  readonly windowToday: string;
  readonly sizeTomorrow: string;
  readonly windowTomorrow: string;
  readonly bodyText: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
};

// Every text read below is `innerText`, never `textContent`, and that choice is
// load-bearing. `textContent` returns the words of an element that is
// display:none, visibility:hidden or zero-sized, so markup that ships but never
// renders would satisfy every oracle in this file. `innerText` returns '' for
// an element nobody can see, which `calloutFindings` already reports as an
// empty box. This repo's worst shipped bug passed all ten CI jobs; a callout
// the surfer cannot read must not pass this one.
//
// No named const helpers inside page.evaluate: tsx/esbuild wraps named
// function bindings in a `__name(...)` call that does not exist once
// Playwright serialises the closure into the browser context. Every lookup is
// inlined, deliberately.
async function readCallouts(page: Page): Promise<CalloutReading> {
  return page.evaluate(() => ({
    today: (document.querySelector('section[data-day="today"] [data-field="weakest-link"]') as HTMLElement | null)?.innerText?.trim() ?? null,
    tomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="weakest-link"]') as HTMLElement | null)?.innerText?.trim() ?? null,
    todayCount: document.querySelectorAll('section[data-day="today"] [data-field="weakest-link"]').length,
    tomorrowCount: document.querySelectorAll('section[data-day="tomorrow"] [data-field="weakest-link"]').length,
    scoreToday: (document.querySelector('section[data-day="today"] [data-field="score"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    scoreTomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="score"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    sizeToday: (document.querySelector('section[data-day="today"] [data-field="size"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    windowToday: (document.querySelector('section[data-day="today"] [data-field="window"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    sizeTomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="size"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    windowTomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="window"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    bodyText: document.body.innerText,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

type Slice01World = PipelineWorld & {
  killedItBrowser?: Browser;
  killedItPage?: Page;
  killedItOpened?: string;
  killedItReading?: CalloutReading;
  killedItNeighbour?: CalloutReading;
  killedItSweep?: Map<string, CalloutReading>;
  killedItListText?: string;
  killedItListCallouts?: number;
  killedItMonochrome?: { readonly today: string | null; readonly tomorrow: string | null };
  killedItVisual?: RawVisualAudit;
};

function world01(world: PipelineWorld): Slice01World {
  return world as Slice01World;
}

async function ensurePage(
  world: Slice01World,
  width: number,
  theme: string,
  movement: string,
): Promise<Page> {
  if (world.killedItBrowser === undefined) {
    world.killedItBrowser = await chromium.launch({ headless: true });
  }
  if (world.killedItPage !== undefined) await world.killedItPage.close().catch(() => undefined);
  const page = await world.killedItBrowser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  world.killedItPage = page;
  return page;
}

function requiredPage(world: Slice01World): Page {
  assert.ok(world.killedItPage, 'test fixture error: no page is open yet');
  return world.killedItPage;
}

function requiredReading(world: Slice01World): CalloutReading {
  assert.ok(world.killedItReading, 'test fixture error: no spot page has been read yet');
  return world.killedItReading;
}

function requiredSweep(world: Slice01World): Map<string, CalloutReading> {
  assert.ok(world.killedItSweep, 'test fixture error: the list of beaches was never walked');
  return world.killedItSweep;
}

async function openSpot(world: Slice01World, spotId: string, width: number, theme: string, movement: string): Promise<CalloutReading> {
  const active = await ensureHarness();
  const page = await ensurePage(world, width, theme, movement);
  const response = await page.goto(`${active.url}/spots/${spotId}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    response?.status(),
    200,
    `test fixture error: the emitted surface did not serve /spots/${spotId}/ (status ${String(response?.status())}); the behavior oracle was never reached`,
  );
  return readCallouts(page);
}

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: el surfista abre su playa para saber qué se la arruinó, y una frase que falta, que miente o que solo se distingue por el color no le sirve. HOW: ${how}`,
  );
}

const CODE_LEAK = /\b(?:dir|size|wind|tide|weakest[_ -]?link|null|undefined|NaN|true|false|the|today|tomorrow)\b/i;
const EM_DASH = /[—]|--/;

function calloutFindings(label: string, text: string | null, expected: Factor | null): string[] {
  if (expected === null) {
    if (text === null) return [];
    return [`${label}: la mañana no publicó culpable y la página igual muestra "${text}"`];
  }
  if (text === null) return [`${label}: la mañana publicó un culpable y la página no lo nombra`];
  if (text.length === 0) return [`${label}: la página dejó el recuadro del culpable vacío`];
  if (!FACTOR_WORD[expected].test(text)) {
    return [`${label}: se publicó ${expected} y la frase dice "${text}", que no lo nombra en palabras`];
  }
  return [];
}

/** A printed value is a whole two-place decimal token, never a prefix of a longer number. */
function hasPrintedTwoPlaceValue(text: string, value: number): boolean {
  const token = value.toFixed(2).replace('.', '\\.')
  return new RegExp(`(?:^|[^0-9.])${token}(?![0-9])`).test(text);
}

// ------------------------------------------------------------------ Given --

Given(
  'una mañana publicada donde cada playa trae el punto débil que salió del cálculo',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    await ensureHarness();
  },
);

Given(
  'una mañana publicada donde cada playa trae la causa y el valor que le corresponde',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    await ensureHarness();
    const { plan } = plannedFor('nombre-mas-largo');
    assert.equal(plan.today.subscore, 0.18, 'test fixture error: hoy must carry the published value 0.18');
    assert.equal(plan.tomorrow.subscore, 0.62, 'test fixture error: mañana must carry the published value 0.62');
  },
);

Given('en esa misma mañana una playa salió perfecta, sin nada que la tumbara', function () {
  const { spotId, plan } = plannedFor('dia-perfecto');
  assert.ok(
    plan.today.link === null && plan.tomorrow.link === null && !plan.today.omit && !plan.tomorrow.omit,
    `test fixture error: ${spotId} must be published with an explicit "no culprit" on both days`,
  );
});

Given('en esa misma mañana una playa se publicó sin ese dato en ninguno de sus dos días', function () {
  const { spotId, plan } = plannedFor('campo-ausente');
  assert.ok(
    plan.today.omit && plan.tomorrow.omit,
    `test fixture error: ${spotId} must be published with the culprit field absent on both days`,
  );
});

Given('en esa misma mañana una playa no tuvo dato de viento hoy y su culpable publicado es la marea', function () {
  const { spotId, plan } = plannedFor('sin-dato-de-viento');
  assert.ok(
    plan.today.dropWindState && plan.today.link === 'tide',
    `test fixture error: ${spotId} must be published today with no wind observation and tide as the culprit`,
  );
});

Given('una playa con sus constantes y una mañana completa de modelos, viento y marea', function (this: PipelineWorld) {
  this.spots = [venaoSeed];
  this.source.configureMorning(this.today);
});

// ------------------------------------------------------------------- When --

When('el surfista abre la playa {string} a {int} px', { timeout: 600_000 }, async function (this: PipelineWorld, profileName: string, width: number) {
  const world = world01(this);
  const { spotId } = plannedFor(profileName);
  world.killedItOpened = profileName;
  world.killedItReading = await openSpot(world, spotId, width, 'claro', 'normal');
});

When(
  'el surfista abre la playa {string} a {int} px, con tema {string} y movimiento {string}',
  { timeout: 600_000 },
  async function (this: PipelineWorld, profileName: string, width: number, theme: string, movement: string) {
    const world = world01(this);
    const { spotId } = plannedFor(profileName);
    world.killedItOpened = profileName;
    world.killedItReading = await openSpot(world, spotId, width, theme, movement);
    world.killedItVisual = await auditVisualQuality(requiredPage(world));
  },
);

When(
  'el surfista abre la playa {string} a {int} px con la pantalla lavada, sin color',
  { timeout: 600_000 },
  async function (this: PipelineWorld, profileName: string, width: number) {
    const world = world01(this);
    const { spotId } = plannedFor(profileName);
    world.killedItOpened = profileName;
    world.killedItReading = await openSpot(world, spotId, width, 'claro', 'normal');
    const page = requiredPage(world);
    // What this proves, stated plainly so nobody over-reads it: the oracle is
    // that the factor is NAMED IN WORDS the reader can see. It is not a
    // simulated colour-blind render. Flattening every colour signal to one ink
    // on one paper is the honest way to make that claim hold under a washed-out
    // screen too: after it, only text survives, and because the reading below
    // uses innerText, a culprit conveyed by a coloured swatch (or by markup
    // that is present but not rendered) reads as empty rather than as passing.
    await page.addStyleTag({
      content: '*,*::before,*::after{color:rgb(17,17,17) !important;background-color:rgb(255,255,255) !important;background-image:none !important;border-color:rgb(17,17,17) !important;fill:rgb(17,17,17) !important;stroke:rgb(17,17,17) !important;box-shadow:none !important;}',
    });
    const flattened = await readCallouts(page);
    world.killedItMonochrome = { today: flattened.today, tomorrow: flattened.tomorrow };
  },
);

When('el surfista recorre todas las playas de la lista', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const sweep = new Map<string, CalloutReading>();
  for (const spotId of PLAN.keys()) {
    sweep.set(spotId, await openSpot(world, spotId, 390, 'claro', 'normal'));
  }
  world.killedItSweep = sweep;
});

When(
  'el surfista mira la lista de hoy y después abre la playa {string} a {int} px',
  { timeout: 600_000 },
  async function (this: PipelineWorld, profileName: string, width: number) {
    const world = world01(this);
    const active = await ensureHarness();
    const page = await ensurePage(world, width, 'claro', 'normal');
    await page.goto(active.url, { waitUntil: 'domcontentloaded' });
    const list = await page.evaluate(() => ({
      text: document.body.innerText,
      callouts: document.querySelectorAll('[data-field="weakest-link"]').length,
    }));
    world.killedItListText = list.text;
    world.killedItListCallouts = list.callouts;
    const { spotId } = plannedFor(profileName);
    world.killedItOpened = profileName;
    world.killedItReading = await openSpot(world, spotId, width, 'claro', 'normal');
  },
);

When('esa mañana se publica', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await this.publishMorning('killed-it-morning', this.today);
});

// ------------------------------------------------------------------- Then --

Then('la sección de hoy nombra en palabras el punto débil publicado para hoy', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  assertBehavior(
    calloutFindings('hoy', requiredReading(world).today, plan.today.link),
    'renderizar el weakest_link publicado del día 0 con su palabra en español, en la sección de hoy.',
  );
});

Then('la sección de mañana nombra en palabras el punto débil publicado para mañana', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  assertBehavior(
    calloutFindings('mañana', requiredReading(world).tomorrow, plan.tomorrow.link),
    'renderizar el weakest_link publicado del día 1 con su palabra en español, en la sección de mañana.',
  );
});

Then('ninguna de las dos secciones nombra el punto débil del otro día', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (plan.today.link !== null && plan.tomorrow.link !== null && plan.today.link !== plan.tomorrow.link) {
    if (reading.today !== null && FACTOR_WORD[plan.tomorrow.link].test(reading.today)) {
      findings.push(`hoy nombra el culpable de mañana: "${reading.today}"`);
    }
    if (reading.tomorrow !== null && FACTOR_WORD[plan.today.link].test(reading.tomorrow)) {
      findings.push(`mañana nombra el culpable de hoy: "${reading.tomorrow}"`);
    }
  }
  assertBehavior(findings, 'leer el weakest_link del día que esa sección muestra, nunca el del otro día.');
});

Then('la sección de hoy nombra el punto débil publicado para hoy con el valor que le corresponde', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).today;
  const findings = calloutFindings('hoy', text, plan.today.link);
  const expected = plan.today.subscore;
  if (expected === undefined) {
    findings.push('la mañana de hoy no trae el valor que este escenario necesita comprobar');
  } else if (text === null || !hasPrintedTwoPlaceValue(text, expected)) {
    findings.push(`hoy no deja leer el valor publicado ${expected.toFixed(2)} dentro de su frase`);
  }
  assertBehavior(
    findings,
    'leer la causa y el valor que la misma fila publicada ya emparejó para hoy; la página no elige ni calcula otro número.',
  );
});

Then('la sección de mañana nombra el punto débil publicado para mañana con el valor que le corresponde', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).tomorrow;
  const findings = calloutFindings('mañana', text, plan.tomorrow.link);
  const expected = plan.tomorrow.subscore;
  if (expected === undefined) {
    findings.push('la mañana de mañana no trae el valor que este escenario necesita comprobar');
  } else if (text === null || !hasPrintedTwoPlaceValue(text, expected)) {
    findings.push(`mañana no deja leer el valor publicado ${expected.toFixed(2)} dentro de su frase`);
  }
  assertBehavior(
    findings,
    'leer la causa y el valor que la misma fila publicada ya emparejó para mañana; la página no elige ni calcula otro número.',
  );
});

Then('ninguna sección toma el valor publicado del otro día', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const today = plan.today.subscore?.toFixed(2);
  const tomorrow = plan.tomorrow.subscore?.toFixed(2);
  const findings: string[] = [];
  if (today !== undefined && reading.tomorrow !== null && hasPrintedTwoPlaceValue(reading.tomorrow, Number(today))) {
    findings.push(`mañana toma el valor de hoy (${today})`);
  }
  if (tomorrow !== undefined && reading.today !== null && hasPrintedTwoPlaceValue(reading.today, Number(tomorrow))) {
    findings.push(`hoy toma el valor de mañana (${tomorrow})`);
  }
  assertBehavior(
    findings,
    'mantener cada valor junto a la causa de su propio día: hoy y mañana nunca se prestan una cifra entre sí.',
  );
});

Then('ninguna de las dos secciones nombra un culpable', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (reading.today !== null) findings.push(`hoy muestra "${reading.today}" sin que se haya publicado culpable`);
  if (reading.tomorrow !== null) findings.push(`mañana muestra "${reading.tomorrow}" sin que se haya publicado culpable`);
  assertBehavior(findings, 'no renderizar nada cuando el weakest_link publicado es nulo o no viene: nunca un culpable inventado.');
});

Then('no queda un recuadro vacío ni una palabra suelta donde iría el culpable', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (reading.todayCount !== 0) findings.push(`hoy dejó ${reading.todayCount} recuadro(s) del culpable en la página`);
  if (reading.tomorrowCount !== 0) findings.push(`mañana dejó ${reading.tomorrowCount} recuadro(s) del culpable en la página`);
  if (/\bnull\b|\bundefined\b|\bNaN\b/i.test(reading.bodyText)) findings.push('la página imprime una palabra del código donde iría el culpable');
  assertBehavior(findings, 'omitir el elemento entero cuando no hay culpable, en vez de renderizarlo vacío.');
});

Then('la página sigue mostrando el puntaje, el tamaño y la ventana de los dos días', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  for (const [label, text] of [
    ['puntaje de hoy', reading.scoreToday],
    ['puntaje de mañana', reading.scoreTomorrow],
    ['tamaño de hoy', reading.sizeToday],
    ['ventana de hoy', reading.windowToday],
    ['tamaño de mañana', reading.sizeTomorrow],
    ['ventana de mañana', reading.windowTomorrow],
  ] as const) {
    if (text.trim().length === 0) findings.push(`${label} quedó vacío`);
  }
  assertBehavior(findings, 'dejar intacto el resto de la sección del día cuando el culpable no se muestra.');
});

Then('la página se lee completa, sin error crudo ni texto en blanco', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (reading.bodyText.trim().length === 0) findings.push('la página quedó en blanco');
  if (/\b(?:TypeError|ReferenceError|Internal Server Error|Cannot GET|stack trace)\b/i.test(reading.bodyText)) {
    findings.push('la página expone un error crudo');
  }
  if (reading.scoreToday.trim().length === 0) findings.push('el puntaje de hoy quedó vacío');
  assertBehavior(findings, 'tratar la ausencia del campo como un estado normal de la página, no como un fallo de render.');
});

Then('en esa misma mañana la playa de al lado sí nombra el suyo', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId, plan } = plannedFor('dos-dias-distintos');
  const neighbour = await openSpot(world, spotId, 390, 'claro', 'normal');
  world.killedItNeighbour = neighbour;
  const findings = [
    ...calloutFindings('la playa de al lado, hoy', neighbour.today, plan.today.link),
    ...calloutFindings('la playa de al lado, mañana', neighbour.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'renderizar el culpable de cada playa desde su propia fila publicada: el silencio de una playa sin dato no puede ser el silencio de todas.',
  );
});

Then('la sección de hoy nombra la marea', function (this: PipelineWorld) {
  const world = world01(this);
  assertBehavior(
    calloutFindings('hoy', requiredReading(world).today, 'tide'),
    'renderizar el weakest_link publicado tal cual: la marea, porque es lo que se publicó.',
  );
});

Then('la sección de hoy no nombra el viento como culpable', function (this: PipelineWorld) {
  const world = world01(this);
  const today = requiredReading(world).today;
  const findings: string[] = [];
  if (today !== null && FACTOR_WORD.wind.test(today)) {
    findings.push(`la frase del culpable dice "${today}", y hoy no hubo dato de viento en esa playa`);
  }
  assertBehavior(
    findings,
    'no deducir el culpable de los sub-puntajes ni del estado del viento: el motor ya garantiza que nunca nombra un factor sin observación (L16), y la página solo repite esa etiqueta.',
  );
});

Then('cada playa cuya mañana trae culpable lo nombra en sus dos secciones', function (this: PipelineWorld) {
  const world = world01(this);
  const sweep = requiredSweep(world);
  const findings: string[] = [];
  let named = 0;
  let expected = 0;
  for (const [spotId, reading] of sweep) {
    const plan = plannedSpot(spotId);
    if (plan.today.link !== null) {
      expected += 1;
      if (reading.today !== null && FACTOR_WORD[plan.today.link].test(reading.today)) named += 1;
      else findings.push(`${spotId} (hoy) no nombra su culpable publicado`);
    }
    if (plan.tomorrow.link !== null) {
      expected += 1;
      if (reading.tomorrow !== null && FACTOR_WORD[plan.tomorrow.link].test(reading.tomorrow)) named += 1;
      else findings.push(`${spotId} (mañana) no nombra su culpable publicado`);
    }
  }
  const summary = findings.length === 0 ? [] : [`${named} de ${expected} días con culpable publicado lo nombran; faltan: ${findings.slice(0, 6).join(', ')}${findings.length > 6 ? ` y ${findings.length - 6} más` : ''}`];
  assertBehavior(
    summary,
    'renderizar el culpable en TODA fila publicada que lo trae: una sola playa correcta y diecinueve calladas es exactamente el fallo que ya pasó por CI una vez.',
  );
});

Then('cada frase del punto débil está en español, sin palabras del código, sin inglés y sin guiones largos', function (this: PipelineWorld) {
  const world = world01(this);
  const sweep = requiredSweep(world);
  const findings: string[] = [];
  let seen = 0;
  for (const [spotId, reading] of sweep) {
    const plan = plannedSpot(spotId);
    for (const [label, text, link] of [
      ['hoy', reading.today, plan.today.link],
      ['mañana', reading.tomorrow, plan.tomorrow.link],
    ] as const) {
      if (link === null) continue;
      if (text === null) continue;
      seen += 1;
      if (CODE_LEAK.test(text)) findings.push(`${spotId} (${label}) filtra una palabra del código: "${text}"`);
      if (EM_DASH.test(text)) findings.push(`${spotId} (${label}) usa un guión largo: "${text}"`);
      if (/[{}\[\]"]/.test(text)) findings.push(`${spotId} (${label}) filtra puntuación de datos: "${text}"`);
    }
  }
  if (seen === 0) findings.unshift('no hay ni una frase de punto débil en toda la lista de playas que revisar');
  assertBehavior(
    findings,
    'escribir la frase en español desde src/i18n/strings.ts con el nombre del factor tomado del módulo de vocabulario compartido, nunca el token del motor ni texto inglés.',
  );
});

Then('la lista de hoy sigue igual, sin nombrar culpables', function (this: PipelineWorld) {
  const world = world01(this);
  const findings: string[] = [];
  if ((world.killedItListCallouts ?? 0) !== 0) {
    findings.push(`la lista de hoy muestra ${String(world.killedItListCallouts)} frase(s) de punto débil`);
  }
  if ((world.killedItListText ?? '').trim().length === 0) findings.push('la lista de hoy quedó en blanco');
  assertBehavior(
    findings,
    'dejar la lista de hoy intacta: el aviso vive en un componente propio montado solo en la página de la playa.',
  );
});

Then('la página de esa playa sí nombra el suyo', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  assertBehavior(
    calloutFindings('hoy', requiredReading(world).today, plan.today.link),
    'montar el aviso en la página de la playa, que es la única superficie que este corte toca.',
  );
});

Then('el punto débil se sigue leyendo en palabras, sin que el color cargue el aviso', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const flattened = world.killedItMonochrome;
  assert.ok(flattened, 'test fixture error: the flattened-colour reading was never taken');
  const findings = [
    ...calloutFindings('con la pantalla lavada, hoy', flattened.today, plan.today.link),
    ...calloutFindings('con la pantalla lavada, mañana', flattened.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'nombrar el factor con palabras dentro del propio aviso: el color puede reforzarlo, nunca cargarlo solo (09-design-system.md línea 237).',
  );
});

// Contrast math runs in Node, never inside page.evaluate: a named const helper
// bound inside an evaluate callback gets wrapped by tsx/esbuild in a
// `__name(...)` call that the browser context does not define. The browser
// side only collects raw computed-style strings.
function parseRgb(value: string): readonly number[] | null {
  const match = /rgba?\(([^)]+)\)/i.exec(value);
  if (!match || match[1] === undefined) return null;
  const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

function relativeLuminance(rgb: readonly number[]): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0);
}

function contrastRatio(foreground: readonly number[], background: readonly number[]): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

interface RawVisualAudit {
  readonly pieces: readonly { readonly day: string; readonly color: string; readonly backdrop: string; readonly fontSize: string; readonly lineHeight: string }[];
  readonly taps: readonly { readonly where: string; readonly width: number; readonly height: number }[];
  readonly ctaWidth: number;
  readonly ctaHeight: number;
  readonly moving: readonly string[];
  readonly loadingCount: number;
  readonly inlineHex: number;
  readonly reducedMotion: boolean;
}

async function auditVisualQuality(page: Page): Promise<RawVisualAudit> {
  return page.evaluate(() => {
    const callouts = [...document.querySelectorAll('section[data-day] [data-field="weakest-link"]')];
    const pieces = callouts.map((el) => {
      let backdrop = 'rgba(0, 0, 0, 0)';
      let node: Element | null = el;
      while (node !== null) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          backdrop = candidate;
          break;
        }
        node = node.parentElement;
      }
      const style = getComputedStyle(el);
      return {
        day: el.closest('section[data-day]')?.getAttribute('data-day') ?? '?',
        color: style.color,
        backdrop,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    });
    const taps = callouts.flatMap((el) => [...el.querySelectorAll('a,button,summary,[role="button"],input,select')].map((control) => {
      const rect = control.getBoundingClientRect();
      return { where: `${el.closest('section[data-day]')?.getAttribute('data-day') ?? '?'} ${control.tagName.toLowerCase()}`, width: rect.width, height: rect.height };
    }));
    const cta = document.querySelector('a.cta')?.getBoundingClientRect();
    const moving = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? callouts
        .filter((el) => getComputedStyle(el).transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
          || getComputedStyle(el).animationName !== 'none')
        .map((el) => el.closest('section[data-day]')?.getAttribute('data-day') ?? '?')
      : [];
    const loadingCount = callouts.filter((el) => el.querySelector('[role="progressbar"], .spinner, .skeleton') !== null).length;
    const inlineHex = callouts.filter((el) => /#[0-9a-f]{3,8}/i.test(el.getAttribute('style') ?? '')).length;
    return {
      pieces,
      taps,
      ctaWidth: cta?.width ?? 0,
      ctaHeight: cta?.height ?? 0,
      moving,
      loadingCount,
      inlineHex,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

Then('la frase del punto débil cumple las siete comprobaciones visuales sobre el fondo real', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const audit = world.killedItVisual;
  assert.ok(audit, 'test fixture error: the visual audit was never taken');
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const expectedPieces = (plan.today.link === null ? 0 : 1) + (plan.tomorrow.link === null ? 0 : 1);
  const findings: string[] = [];

  if (audit.pieces.length !== expectedPieces) {
    findings.push(`U1/U5: se esperaban ${expectedPieces} frases de punto débil que comprobar y hay ${audit.pieces.length}; no hay nada que medir contra el fondo real`);
  }
  for (const piece of audit.pieces) {
    const foreground = parseRgb(piece.color);
    const background = parseRgb(piece.backdrop);
    if (foreground === null || background === null) {
      findings.push(`U1: no se pudo medir el contraste de la frase de ${piece.day}`);
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) findings.push(`U1: la frase de ${piece.day} queda en ${ratio.toFixed(2)}:1 sobre su fondo real`);
    const fontSize = Number.parseFloat(piece.fontSize);
    const lineHeight = Number.parseFloat(piece.lineHeight);
    if (!Number.isFinite(fontSize) || fontSize < 14) findings.push(`U6: la frase de ${piece.day} se compone a ${piece.fontSize}`);
    if (Number.isFinite(lineHeight) && Number.isFinite(fontSize) && lineHeight < fontSize * 1.2) {
      findings.push(`U6: la frase de ${piece.day} tiene un interlineado apretado (${piece.lineHeight} sobre ${piece.fontSize})`);
    }
  }
  if (reading.scrollWidth > reading.clientWidth) {
    findings.push(`U2: la página desborda a 390 px con el nombre de playa más largo (${reading.scrollWidth} > ${reading.clientWidth})`);
  }
  for (const tap of audit.taps) {
    if (tap.width < 44 || tap.height < 44) findings.push(`U3: ${tap.where} mide ${Math.round(tap.width)} por ${Math.round(tap.height)} px`);
  }
  if (audit.ctaWidth < 44 || audit.ctaHeight < 44) {
    findings.push(`U3: el llamado a reportar quedó desplazado u ocluido (${Math.round(audit.ctaWidth)} por ${Math.round(audit.ctaHeight)} px)`);
  }
  if (audit.moving.length > 0) findings.push(`U4: con movimiento reducido la frase sigue animándose en ${audit.moving.join(', ')}`);
  if (audit.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial dentro del aviso');
  if (audit.inlineHex !== 0) findings.push('U7: el aviso trae color en crudo en su atributo de estilo, en vez de un token');
  const gate = requiredHarness().uiGate;
  if (gate.status !== 0) findings.push(`U2/U4/U6/U7: el gate visual de la superficie falló: ${gate.output.trim()}`);

  assertBehavior(
    findings,
    'construir el aviso con los tokens y la escala tipográfica ya declarados (09-design-system.md línea 237), medido sobre el fondo real de la página en los dos temas, no sobre blanco.',
  );
});

Then(
  'el recibo del día y la superficie de lectura nombran el mismo punto débil, playa por playa y día por día',
  async function (this: PipelineWorld) {
    const body = await this.store.get('pub/v1/regions/pa-pacific/bundle.json');
    assert.ok(body, `no region bundle was published; the behavior oracle was never reached.${this.failureContext()}`);
    const bundle = JSON.parse(body) as {
      days: { date: string; spots: { spot_id: string; weakest_link?: unknown }[] }[];
      publish_surface: { days: { date: string; spots: { spot_id: string; weakest_link?: unknown }[] }[] };
    };
    const findings: string[] = [];
    bundle.days.forEach((day, index) => {
      const readingDay = bundle.publish_surface.days[index];
      if (readingDay === undefined) {
        findings.push(`la superficie de lectura no trae el día ${day.date}`);
        return;
      }
      for (const receipt of day.spots) {
        const reading = readingDay.spots.find((row) => row.spot_id === receipt.spot_id);
        if (reading === undefined) {
          findings.push(`${receipt.spot_id} (${day.date}) está en el recibo y no en la superficie de lectura`);
          continue;
        }
        if (!('weakest_link' in reading)) {
          findings.push(`${receipt.spot_id} (${day.date}): el recibo dice ${JSON.stringify(receipt.weakest_link)} y la superficie de lectura no lleva el campo`);
          continue;
        }
        if (reading.weakest_link !== receipt.weakest_link) {
          findings.push(`${receipt.spot_id} (${day.date}): el recibo dice ${JSON.stringify(receipt.weakest_link)} y la superficie de lectura ${JSON.stringify(reading.weakest_link)}`);
        }
      }
    });
    assertBehavior(
      findings,
      'llevar weakest_link también en surfaceCall(), para que la superficie que leen las páginas diga lo mismo que el recibo del día.',
    );
  },
);

// ---------------------------------------------------------------- cleanup --

After({ tags: '@feature-f-see-what-killed-it and @slice-01', timeout: 30_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  await world.killedItPage?.close().catch(() => undefined);
  await world.killedItBrowser?.close().catch(() => undefined);
  delete world.killedItPage;
  delete world.killedItBrowser;
});

AfterAll({ timeout: 30_000 }, async function () {
  if (harness === null) return;
  const active = harness;
  harness = null;
  await new Promise<void>((done) => active.server.close(() => done()));
  rmSync(active.root, { recursive: true, force: true });
});
