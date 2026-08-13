// Slice-01 harness: one real build of the production surface, served over
// real HTTP, read by a real Chromium at 390 px.
//
// Everything here drives production entry points only: `npm run build` from an
// isolated copy of this repository, the emitted `dist/` served by `astro
// preview`, and `fetch()` / Playwright against those served bytes. There is no
// fixture surface and no planted data: the spot pages this slice sweeps are
// whatever the installed `data/` really produces.
//
// Three mechanics are copied deliberately from
// tests/acceptance/daily-call-with-permanent-receipts/steps/spot-own-page.steps.ts
// (slice-06), where each was earned empirically rather than reasoned:
//
//  1. `astro preview`, never raw `vite preview`. Raw `vite preview` defaults to
//     an SPA fallback and serves index.html for ANY unmatched route, which
//     turns a missing page into a passing test. This file does not merely
//     trust that: startBuiltSurface() asserts a deliberately nonexistent route
//     answers 404 before any scenario is allowed to observe anything.
//  2. `astro preview` daemonises. The spawned child exits 0 immediately after
//     printing "(pid NNNN)" and the server keeps running detached, so cleanup
//     kills the REPORTED pid, not the spawned child.
//  3. The belt-and-braces port sweep is scoped with `-sTCP:LISTEN` and guarded
//     with `pid !== process.pid`. An unfiltered `lsof -i :PORT` also matches
//     this process's own outbound connections to that port and killing it
//     self-terminates the run.
//
// One build is made for the whole feature file and shared. No scenario mutates
// the surface, so a second build would only spend wall time.

import { AfterAll } from '@cucumber/cucumber';
import { chromium, type Browser, type Page, type Response } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectRoot = process.cwd();

/** The nonexistent route used to prove the server is not an SPA fallback. */
const IMPOSSIBLE_ROUTE = '/spots/no-existe-esta-playa-en-ningun-lado/';

export type BuiltSurface = {
  readonly root: string;
  readonly dist: string;
  readonly url: string;
  readonly pid: number;
  /** Result of the shipped static UI mandate gate over the same dist/. */
  readonly uiGate: { readonly status: number | null; readonly output: string };
  /** Every spot detail route the build really emitted, e.g. "/spots/playa-venao/". */
  readonly spotRoutes: readonly string[];
};

let surface: BuiltSurface | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

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
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-track-record-'));
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

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('test harness error: could not allocate a preview port'));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });
}

async function waitForReachable(url: string, log: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;
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
  throw new Error(`test harness error: the built surface never became reachable at ${url}: ${String(lastError)}\n${log()}`);
}

function stopPreviewDaemon(pid: number, url: string): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
  const port = new URL(url).port;
  const lookup = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  for (const pidText of (lookup.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)) {
    const other = Number(pidText);
    if (other === process.pid) continue;
    try {
      process.kill(other, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

/**
 * Builds the production surface from an isolated copy of the real repository,
 * serves it, and proves the server is honest about routes that do not exist.
 *
 * Every failure in here is a harness failure, raised with a "test harness
 * error" prefix so the RED classification can tell it apart from a scenario
 * that reached its behaviour oracle.
 */
export async function builtSurface(): Promise<BuiltSurface> {
  if (surface !== null) return surface;

  const root = copyProjectForSurface();

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (build.status !== 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`test harness error: the production build failed before any behaviour oracle:\n${build.stdout}\n${build.stderr}`);
  }

  const dist = join(root, 'dist');
  // build.format is 'file', so a spot detail page lands at dist/spots/<slug>.html
  // and its route is /spots/<slug>/. Sub-pages (ayer, reportar, reportado) live
  // one directory deeper and are not spot detail pages.
  const spotRoutes = readdirSync(join(dist, 'spots'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => `/spots/${entry.name.slice(0, -'.html'.length)}/`)
    .sort();

  const uiGateRun = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });

  const port = await unusedPort();
  const astro = join(root, 'node_modules/.bin/astro');
  const child = spawn(astro, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let reportedPid: number | null = null;
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    const match = /\(pid (\d+)\)/.exec(output);
    if (match?.[1] !== undefined) reportedPid = Number(match[1]);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const url = `http://127.0.0.1:${port}`;
  await waitForReachable(url, () => output);

  const pidDeadline = Date.now() + 5_000;
  while (reportedPid === null && Date.now() < pidDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(reportedPid !== null, `test harness error: astro preview became reachable but never reported a pid.\n${output}`);

  // Trap defused rather than commented away: a server with an SPA fallback
  // answers 200 for a route that does not exist, which would make every
  // "the page renders X" scenario in this file pass on index.html. Prove it
  // 404s before letting any scenario observe anything.
  const impossible = await fetch(`${url}${IMPOSSIBLE_ROUTE}`);
  if (impossible.status !== 404) {
    stopPreviewDaemon(reportedPid, url);
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      `test harness error: the preview server answered ${impossible.status} for ${IMPOSSIBLE_ROUTE}, ` +
        'a route this build does not emit. A server that serves something for an unmatched route ' +
        'makes a missing page look like a passing test; this run is refused rather than trusted.',
    );
  }

  surface = { root, dist, url, pid: reportedPid, uiGate: { status: uiGateRun.status, output: `${uiGateRun.stdout}${uiGateRun.stderr}` }, spotRoutes };
  return surface;
}

export function spotDocument(built: BuiltSurface, route: string): string {
  const slug = route.replace(/^\/spots\//, '').replace(/\/$/, '');
  return readFileSync(join(built.dist, 'spots', `${slug}.html`), 'utf8');
}

export async function openAt390(
  built: BuiltSurface,
  route: string,
  options: { readonly theme?: string; readonly movement?: string } = {},
): Promise<{ readonly page: Page; readonly response: Response | null }> {
  browser ??= await chromium.launch({ headless: true });
  if (page !== null) await page.close().catch(() => undefined);
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({
    colorScheme: options.theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: options.movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  const response = await page.goto(`${built.url}${route}`, { waitUntil: 'load' });
  assert.equal(
    response?.status(),
    200,
    `test harness error: ${route} answered ${String(response?.status())} from the built surface`,
  );
  return { page, response };
}

export async function releaseBuiltSurface(): Promise<void> {
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  page = null;
  browser = null;
  if (surface !== null) {
    stopPreviewDaemon(surface.pid, surface.url);
    rmSync(surface.root, { recursive: true, force: true });
    surface = null;
  }
}

// The singleton browser above is a live Chromium child process; the preview
// is a detached astro daemon. Neither is registered on any scenario's world,
// so no After hook ever releases them. Without this AfterAll the browser
// handle keeps cucumber's event loop referenced after the summary and the
// whole `npm run test:at` run hangs at exit (observed 2026-08-12).
AfterAll({ timeout: 30_000 }, releaseBuiltSurface);
