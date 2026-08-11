// The slice-01 driving surface, production entry points only:
//
//   1. the real `npm run build` (which runs publish:surface --verify and the
//      page-weight gate exactly as a release build would),
//   2. the emitted dist/ served over real HTTP with the static-host URL
//      mapping (`build.format: 'file'`: an extensionless route resolves to
//      `<path>.html`). `astro preview` is deliberately NOT used: it resolves
//      directory URLs itself and hides a whole class of hosting bug,
//   3. real Chromium at 390 px, phone-first, driven by the steps.
//
// Steps ACT through this surface and OBSERVE only what a surfer (or the
// durable on-phone queue, the driven storage port of domain-model.md section
// 7.4) exposes. Action steps capture failures; Then steps turn them into
// assertion failures with the captured context attached, so an unimplemented
// seam fails as active-RED with the reason in the message — never as a
// broken import (same convention as the keystone's world).

import { After, AfterAll, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { loadLaunchSpotSeeds } from '../../../../../src/data/launch-spots';
import { loadLaunchSpotCoordinates } from '../../../../../src/pipeline/adapters/spot-coordinates';
import { serializeSpotIndex } from '../../../../../src/pipeline/static-publication';
import { createLocalWriteLambda, type LocalWriteLambda } from '../../../../../src/report/local-lambda';
import type { UniverseSnapshot } from './state-delta';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
export const DIST_ROOT = resolve(REPOSITORY_ROOT, 'dist');

export const SPOT_ID = 'playa-venao';
export const SPOT_NAME = 'Playa Venao';
export const SPOT_PATH = `/spots/${SPOT_ID}/`;
export const REPORT_PATH = `/spots/${SPOT_ID}/reportar/`;
/** Matches the full URL, since Playwright tests patterns against the href. */
export const REPORTED_URL_PATTERN = new RegExp(`/spots/${SPOT_ID}/reportado/?$`);
export const REPORTED_PATHNAME_PATTERN = new RegExp(`^/spots/${SPOT_ID}/reportado/?$`);

/**
 * Field names that exist only on the forecast side of the seam. None of them
 * may ever reach anything the report route family shows or loads
 * (application-architecture.md section 7 anti-leak payload contract, section 8
 * leak paths L1 to L4, adr-report-flow-leak-isolation.md). `size_band` is NOT
 * in this list: the capture form legitimately carries the seven band tokens.
 */
export const FORECAST_MARKERS = [
  'score_q',
  'size_range_m',
  'wind_state',
  'conf_level',
  'confidence_reason',
  'weakest_link',
  'best_window',
  'predicted',
  'data-forecast',
] as const;

const execFileAsync = promisify(execFile);

// ---------- the real production build, once per run ----------

export type BuildOutcome = Readonly<{ exitCode: number; output: string }>;

let buildPromise: Promise<BuildOutcome> | null = null;

/** Runs the real `npm run build` exactly once per acceptance run. */
export function ensureBuiltSite(): Promise<BuildOutcome> {
  buildPromise ??= (async (): Promise<BuildOutcome> => {
    try {
      const { stdout, stderr } = await execFileAsync('npm', ['run', 'build'], {
        cwd: REPOSITORY_ROOT,
        maxBuffer: 64 * 1024 * 1024,
      });
      return { exitCode: 0, output: `${stdout}\n${stderr}` };
    } catch (error) {
      const failed = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        exitCode: typeof failed.code === 'number' ? failed.code : 1,
        output: `${failed.stdout ?? ''}\n${failed.stderr ?? ''}\n${failed.message ?? ''}`,
      };
    }
  })();
  return buildPromise;
}

export async function assertBuiltSite(): Promise<void> {
  const build = await ensureBuiltSite();
  assert.equal(
    build.exitCode,
    0,
    'WHAT: the production build failed, so there is no site to walk. '
      + 'WHY: slice-01 scenarios drive the emitted dist/, never a dev server. '
      + `HOW: make \`npm run build\` finish green, then rerun.\n${build.output.slice(-2000)}`,
  );
}

// ---------- serving dist/ over real HTTP with the static-host mapping ----------

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

/**
 * The deployed artifact is files on S3 behind CloudFront with
 * `build.format: 'file'`, so the host must map an extensionless route to its
 * `.html` document. This server performs exactly that mapping and nothing
 * more: exact file, else trailing-slash-stripped + `.html`, else `.html`
 * appended, else the built 404 document with a 404 status. No directory
 * indexes, no redirects, nothing `astro preview` would quietly fix.
 */
function resolveDocument(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;
  const candidates: string[] = [];
  if (safe === '/' || safe === '') {
    candidates.push('index.html');
  } else if (safe.endsWith('/')) {
    candidates.push(`${safe.replace(/\/+$/, '')}.html`);
  } else {
    candidates.push(safe, `${safe}.html`);
  }
  for (const candidate of candidates) {
    const path = resolve(DIST_ROOT, candidate.replace(/^\//, ''));
    if (!path.startsWith(DIST_ROOT)) return null;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

type ServedSite = Readonly<{ server: http.Server; baseUrl: string; writeStoreRoot: string }>;

let serverPromise: Promise<ServedSite> | null = null;

/**
 * Holds delivery of an already-computed real local report response long enough
 * to observe the page before it can receive that response. It never provides,
 * changes or substitutes a response, and times out open for unrelated walks.
 */
class ReportResponseBarrier {
  private armed = false;
  private held: { readonly release: () => void } | null = null;

  arm(): void { this.armed = true; }

  disarm(): void {
    this.armed = false;
    this.held?.release();
    this.held = null;
  }

  async hold(): Promise<void> {
    if (!this.armed) return;
    this.armed = false;
    let release!: () => void;
    const actualResponseMayContinue = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    const held = { release };
    this.held = held;
    await Promise.race([actualResponseMayContinue, pause(5_000)]);
    if (this.held === held) this.held = null;
  }

  async captureBeforeRelease(page: Page): Promise<string> {
    const deadline = Date.now() + 2_000;
    while (this.held === null && Date.now() < deadline) await pause(25);
    assert.ok(this.held, 'WHAT: the real report answer was not ready to observe. HOW: keep the page waiting for its actual report receipt.');
    const held = this.held;
    try {
      return await page.evaluate(() => document.body.innerText);
    } finally {
      held.release();
    }
  }
}

const reportResponseBarrier = new ReportResponseBarrier();

/**
 * Runs the static artifact beside the reviewed local Report/Mint composition.
 * The write paths use a disposable filesystem store, fresh HMAC secret,
 * actual clock and the launch spot index. This is a production-local adapter,
 * never a test-owned receipt or browser-route interception.
 */
export function ensureServedSite(): Promise<ServedSite> {
  serverPromise ??= createServedSite();
  return serverPromise;
}

async function createServedSite(): Promise<ServedSite> {
  const writeStoreRoot = await mkdtemp(join(tmpdir(), 'surfs-up-report-write-'));
  let server: http.Server | undefined;
  try {
    const index = JSON.parse(serializeSpotIndex(loadLaunchSpotSeeds(), loadLaunchSpotCoordinates())) as {
      readonly schema: string;
      readonly spots: Readonly<Record<string, unknown>>;
    };
    assert.equal(index.schema, 'spot-index/1', 'local report host needs the published spot index');
    const knownSpotIds = Object.keys(index.spots);
    assert.ok(knownSpotIds.includes(SPOT_ID), `local report host spot index lacks ${SPOT_ID}`);
    const writeLambda = createLocalWriteLambda({
      storeRoot: writeStoreRoot,
      credentialSecret: randomBytes(32).toString('base64url'),
      knownSpotIds,
      clock: () => new Date(),
    });
    server = http.createServer(async (request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (pathname === '/api/mint' || pathname === '/api/report') {
        await serveLocalWrite(request, response, pathname, writeLambda);
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('method not allowed');
        return;
      }
      const document = resolveDocument(pathname);
      if (document === null) {
        const notFound = resolve(DIST_ROOT, '404.html');
        if (existsSync(notFound)) {
          response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
          createReadStream(notFound).pipe(response);
          return;
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(document)] ?? 'application/octet-stream',
      });
      createReadStream(document).pipe(response);
    });
    await new Promise<void>((resolveServer, rejectServer) => {
      server?.once('error', rejectServer);
      server?.listen(0, '127.0.0.1', resolveServer);
    });
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object', 'local site server has no address');
    return { server, baseUrl: `http://127.0.0.1:${address.port}`, writeStoreRoot };
  } catch (error) {
    server?.close();
    await rm(writeStoreRoot, { recursive: true, force: true });
    throw error;
  }
}

async function serveLocalWrite(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  pathname: '/api/mint' | '/api/report',
  writeLambda: LocalWriteLambda,
): Promise<void> {
  const result = await writeLambda.handle({
    path: pathname,
    method: request.method ?? 'GET',
    headers: Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value])),
    body: await requestBody(request),
    sourceIp: request.socket.remoteAddress ?? '127.0.0.1',
  });
  if (pathname === '/api/report') await reportResponseBarrier.hold();
  response.writeHead(result.statusCode, {
    ...result.headers,
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(result.body));
}

function requestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolvePause) => { setTimeout(resolvePause, milliseconds); });
}

// ---------- Chromium at 390 px ----------

let browserPromise: Promise<Browser> | null = null;

function ensureBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

export type CapturedResponse = Readonly<{
  url: string;
  status: number;
  contentType: string;
  body: Promise<string | null>;
}>;

/**
 * A browser-observed write attempt.  This is deliberately observation-only:
 * the acceptance surface never fulfils, alters, or manufactures a request.
 * Slice-03 must prove that the production page, rather than a step helper,
 * begins the anonymous credential and saved-label journey.
 */
export type CapturedWriteRequest = Readonly<{
  url: string;
  method: string;
  headers: Readonly<Record<string, string>>;
  body: string | null;
}>;

export interface ReportFlowScenario {
  flags: { storageRefused: boolean; javaScriptEnabled: boolean };
  offline: boolean;
  context: BrowserContext | null;
  page: Page | null;
  baseUrl: string | null;
  failures: { label: string; error: unknown }[];
  pageErrors: string[];
  captured: CapturedResponse[];
  writeAttempts: CapturedWriteRequest[];
  reportTextBeforeResponse: string | null;
  savedReportBeforeResponse: Record<string, unknown> | null;
  distSnapshot: UniverseSnapshot | null;
}

const scenarios = new WeakMap<object, ReportFlowScenario>();

export function scenarioState(world: object): ReportFlowScenario {
  const state = scenarios.get(world);
  assert.ok(state, 'test bug: no scenario state; the feature-tag Before hook did not run');
  return state;
}

Before({ tags: '@feature-f-tell-us-what-you-saw-cold' }, function (this: object) {
  scenarios.set(this, {
    flags: { storageRefused: false, javaScriptEnabled: true },
    offline: false,
    context: null,
    page: null,
    baseUrl: null,
    failures: [],
    pageErrors: [],
    captured: [],
    writeAttempts: [],
    reportTextBeforeResponse: null,
    savedReportBeforeResponse: null,
    distSnapshot: null,
  });
});

Before({ tags: '@local-real-io' }, function () {
  reportResponseBarrier.arm();
});

After({ tags: '@feature-f-tell-us-what-you-saw-cold' }, async function (this: object) {
  const state = scenarios.get(this);
  if (state?.context) await state.context.close();
});

After({ tags: '@local-real-io' }, function () {
  reportResponseBarrier.disarm();
});

AfterAll(async function () {
  if (browserPromise) await (await browserPromise).close();
  if (serverPromise) {
    const { server, writeStoreRoot } = await serverPromise;
    await new Promise<void>((resolveServer, rejectServer) => {
      server.close((error) => error === undefined ? resolveServer() : rejectServer(error));
    });
    await rm(writeStoreRoot, { recursive: true, force: true });
  }
});

/**
 * Creates the phone lazily, honouring flags set by earlier Given steps
 * (storage refusal, JavaScript off). 390 px is the declared smallest width.
 */
export async function phonePage(state: ReportFlowScenario): Promise<Page> {
  if (state.page) return state.page;
  await assertBuiltSite();
  const { baseUrl } = await ensureServedSite();
  state.baseUrl = baseUrl;
  const browser = await ensureBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-PA',
    javaScriptEnabled: state.flags.javaScriptEnabled,
  });
  if (state.flags.storageRefused) {
    // Models a phone whose durable storage refuses (private mode, storage
    // pressure): any touch of the storage seam throws, exactly what the
    // island's write+read+delete sentinel probe must surface plainly
    // (application-architecture.md section 12). What this cannot model:
    // storage that fills up mid-write after a successful probe.
    //
    // Passed as a STRING, not a function reference. tsx/esbuild compiles a
    // named inner function (a const-bound arrow, or an object-literal
    // property like `get:`) by wrapping it in a `__name(fn, "name")` helper
    // call that preserves `.name`. `context.addInitScript(fn)` serialises a
    // function argument via `fn.toString()` and injects only that snippet
    // as a raw document-start script in the new page -- the `__name` helper
    // itself lives elsewhere in this module's compiled output and is
    // undefined in that fresh page global, so the injected script threw
    // `ReferenceError: __name is not defined` at the `const refuse = ...`
    // line and aborted silently before ever reaching Object.defineProperty.
    // A plain string has no function for esbuild to transform, so it ships
    // to the page exactly as written, with nothing to fail on.
    await context.addInitScript(
      "Object.defineProperty(window, 'indexedDB', { get: function () { "
        + "throw new DOMException('this phone refuses durable storage', 'InvalidStateError'); "
        + '}, configurable: false });',
    );
  }
  if (state.offline) await context.setOffline(true);
  context.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(baseUrl)) return;
    state.captured.push({
      url,
      status: response.status(),
      contentType: response.headers()['content-type'] ?? '',
      body: response.text().catch(() => null),
    });
  });
  context.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const pathname = new URL(request.url()).pathname;
    if (pathname !== '/api/mint' && pathname !== '/api/report') return;
    state.writeAttempts.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData(),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => state.pageErrors.push(String(error)));
  state.context = context;
  state.page = page;
  return page;
}

export async function setSignal(state: ReportFlowScenario, online: boolean): Promise<void> {
  state.offline = !online;
  if (state.context) await state.context.setOffline(!online);
}

export function failureContext(state: ReportFlowScenario): string {
  if (state.failures.length === 0) return '';
  const lines = state.failures.map(
    (f) => `${f.label}: ${f.error instanceof Error ? f.error.message.split('\n')[0] : String(f.error)}`,
  );
  return ` (captured journey failures: ${lines.join(' | ')})`;
}

// ---------- the journey, as the surfer walks it ----------

export async function openSpotPage(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  await page.goto(`${state.baseUrl}${SPOT_PATH}`, { waitUntil: 'load' });
}

export async function followReportCta(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  await page.getByText('¿ESTUVISTE? CUÉNTANOS').click();
  await page
    .waitForURL(new RegExp(`/spots/${SPOT_ID}/reportar/?$`), { timeout: 10_000 })
    .catch(() => {
      /* landing is asserted by the next Then, with context */
    });
}

export async function openReportScreenDirectly(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  await page.goto(`${state.baseUrl}${REPORT_PATH}`, { waitUntil: 'load' });
}

/** The concrete example every slice-01 scenario uses: Cintura a pecho, Picado, Bueno. */
export async function answerThreeQuestions(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  for (const label of ['Cintura a pecho', 'Picado', 'Bueno']) {
    try {
      await page.getByLabel(label, { exact: true }).check({ timeout: 5000 });
    } catch (error) {
      state.failures.push({ label: `answer "${label}"`, error });
    }
  }
}

export async function tapMandar(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  try {
    await page.getByRole('button', { name: 'Mandar' }).click({ timeout: 4000 });
  } catch (error) {
    state.failures.push({ label: 'tap Mandar', error });
  }
  // Give the island its moment: commit, history.replaceState, render.
  await page.waitForURL(REPORTED_URL_PATTERN, { timeout: 4000 }).catch((error: unknown) => {
    state.failures.push({ label: 'saved confirmation render', error });
  });
}

export async function visibleText(state: ReportFlowScenario): Promise<string> {
  const page = await phonePage(state);
  return page.evaluate(() => document.body.innerText);
}

/** Passive bounded wait for a browser-observed write request, never a route. */
export async function observedWriteRequest(
  state: ReportFlowScenario,
  pathname: '/api/mint' | '/api/report',
  timeoutMilliseconds = 2_000,
): Promise<CapturedWriteRequest | undefined> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const request = state.writeAttempts.find((attempt) => new URL(attempt.url).pathname === pathname);
    if (request) return request;
    await new Promise<void>((resolvePause) => { setTimeout(resolvePause, 25); });
  }
  return state.writeAttempts.find((attempt) => new URL(attempt.url).pathname === pathname);
}

/** Passive bounded wait for a browser-observed write response, never a route. */
export async function observedWriteResponse(
  state: ReportFlowScenario,
  pathname: '/api/mint' | '/api/report',
  timeoutMilliseconds = 2_000,
): Promise<CapturedResponse | undefined> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const response = state.captured.find((attempt) => new URL(attempt.url).pathname === pathname);
    if (response) return response;
    await new Promise<void>((resolvePause) => { setTimeout(resolvePause, 25); });
  }
  return state.captured.find((attempt) => new URL(attempt.url).pathname === pathname);
}

/** Captures the actual page state while its real local report response is held. */
export async function textBeforeReportAnswer(state: ReportFlowScenario): Promise<string> {
  return reportResponseBarrier.captureBeforeRelease(await phonePage(state));
}

// ---------- observing the durable on-phone queue (driven storage port) ----------

export type QueuedReport = Readonly<{
  database: string;
  store: string;
  row: Record<string, unknown>;
}>;

/**
 * Dumps every record in the phone's durable storage and keeps the
 * report-shaped ones (the domain record of domain-model.md section 7.3:
 * report_id + the three label fields). Schema-agnostic on purpose: the
 * database and store names belong to the island's implementation and may be
 * renamed freely without touching these tests.
 */
export async function queuedReports(state: ReportFlowScenario): Promise<QueuedReport[]> {
  const page = await phonePage(state);
  const dump = await page.evaluate(async () => {
    const found: { database: string; store: string; row: unknown }[] = [];
    const databases = await indexedDB.databases();
    for (const info of databases) {
      if (!info.name) continue;
      const name = info.name;
      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolveDb(request.result);
        request.onerror = () => rejectDb(request.error ?? new Error('open failed'));
      });
      try {
        for (const storeName of Array.from(db.objectStoreNames)) {
          const rows = await new Promise<unknown[]>((resolveRows, rejectRows) => {
            const transaction = db.transaction(storeName, 'readonly');
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolveRows(request.result as unknown[]);
            request.onerror = () => rejectRows(request.error ?? new Error('read failed'));
          });
          for (const row of rows) found.push({ database: name, store: storeName, row });
        }
      } finally {
        db.close();
      }
    }
    return found;
  });
  return dump.filter(
    (entry): entry is QueuedReport =>
      typeof entry.row === 'object'
      && entry.row !== null
      && 'report_id' in (entry.row as Record<string, unknown>)
      && 'size_band' in (entry.row as Record<string, unknown>)
      && 'wind' in (entry.row as Record<string, unknown>)
      && 'quality' in (entry.row as Record<string, unknown>),
  );
}

// ---------- repository build output universe ----------

function snapshotTree(path: string, label: string, snapshot: UniverseSnapshot): void {
  if (!existsSync(path)) {
    snapshot.set(label, '<absent>');
    return;
  }
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    snapshot.set(label, '<directory>');
    for (const entry of readdirSync(path).sort()) {
      snapshotTree(join(path, entry), `${label}/${entry}`, snapshot);
    }
    return;
  }
  snapshot.set(label, `<file:${readFileSync(path).toString('base64')}>`);
}

export function snapshotRepositoryBuildOutput(): UniverseSnapshot {
  const snapshot: UniverseSnapshot = new Map();
  snapshotTree(DIST_ROOT, 'repo-root:dist', snapshot);
  return snapshot;
}
