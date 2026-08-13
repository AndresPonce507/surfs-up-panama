// The slice-01 driving surface for f-works-with-no-signal. Production entry
// points only:
//
//   1. the real `npm run build` (which runs publish:surface --verify and the
//      page-weight gate exactly as a release build would, because the gate is
//      wired into astro.config.mjs as an integration),
//   2. the emitted dist/ served over real HTTP with the static-host URL
//      mapping (`build.format: 'file'`: an extensionless route resolves to
//      `<path>.html`). `astro preview` is deliberately NOT used: it resolves
//      directory URLs itself and hides a whole class of hosting bug, which is
//      how twenty spot links once shipped returning 403,
//   3. real Chromium at 390 px, phone-first, driven by the steps.
//
// WHY THE SIGNAL IS CUT AT THE SERVER AND NOT AT THE BROWSER
// ----------------------------------------------------------
// A service worker is the classic thing that passes unit tests and fails in a
// browser, so this harness never simulates the worker's environment. It cuts
// the real thing: `blackout` destroys the socket the moment a request arrives
// (what an unreachable origin looks like to a phone) and `stall` accepts the
// request and never answers (what a network that has gone to sleep looks
// like, and the only condition under which a three-second timeout can be
// observed to fire). Chromium's own offline emulation is not used, because
// its propagation to service-worker fetches is exactly the thing under test
// and a helper that never sees the failure would pass a green that means
// nothing.
//
// WHY EVERY RESPONSE CARRIES `Cache-Control: no-store`
// ----------------------------------------------------
// Without it Chromium's own HTTP cache answers a repeat navigation and
// impersonates the service worker: "the same forecast is on the screen" goes
// green with no helper installed at all. With it, the browser's Cache Storage
// (the helper's own store) is the only place a cached page can come from, and
// that is precisely the discriminator these scenarios exist to test. The
// deployed site sets its own caching headers at CloudFront; this is a
// test-harness discipline, not a statement about production headers.
//
// Steps ACT through this surface and OBSERVE only what a surfer sees plus the
// origin's Cache Storage (the port-exposed observable of the helper). Action
// steps capture failures; Then steps turn them into assertion failures with
// the captured context attached, so an unimplemented seam fails as active-RED
// with the reason in the message, never as a broken import (same convention
// as the keystone's world).

import { After, AfterAll, Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import type { Socket } from 'node:net';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
export const DIST_ROOT = resolve(REPOSITORY_ROOT, 'dist');

/** The spot the surfer is parked at. Everything else is a spot they never opened. */
export const VISITED_SPOT = 'playa-venao';
export const UNVISITED_SPOT = 'punta-chame';

/**
 * The live browser discovers the bare Function URLs in the no-store public
 * configuration document. The harness keeps the local endpoints same-origin,
 * but still requires the minted credential on every report POST, so a stale
 * `/api/report` worker replay cannot pass this production-shaped journey.
 */
export const WRITE_PATH = '/api/report';
export const MINT_PATH = '/api/mint';
export const WRITE_CREDENTIAL = 'local-write-credential';

/** What the live site answers a report with. Its presence proves the answer came from the site. */
export const LIVE_ANSWER_MARK = 'live-answer-8f2c41';
/** What is planted in the phone's own store. Its presence in an answer is the failure. */
export const PLANTED_ANSWER_MARK = 'planted-answer-do-not-serve';

/** Verbatim, application-architecture.md section 10, sentence one of the offline copy. */
export const OFFLINE_SENTENCE_ONE_PREFIX = 'Sin señal. Esto es lo último que vimos, de las ';
/** Verbatim, same block, sentence two. Slice-03 lands it; it must be ABSENT today. */
export const OFFLINE_SENTENCE_TWO = 'Los reportes que mandes quedan guardados.';

/** Ceilings: application-architecture.md section 5 line item 4, section 4 route table, section 6. */
export const HELPER_CEILING_BYTES = 3 * 1024;
export const OFFLINE_PAGE_CEILING_BYTES = 3 * 1024;
export const REGISTRATION_CEILING_BYTES = Math.round(0.2 * 1024);

/** Request-count guardrail, research 08 section 12.4 via application-architecture.md section 12. */
export const READING_SESSION_REQUEST_CEILING = 10;

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
      + 'HOW: make `npm run build` finish green, then rerun. If it started failing the moment '
      + 'an offline page appeared, the page-weight gate is refusing an emitted document it has '
      + 'no declared ceiling for: declare /sin-senal at 3 KB in DECLARED_ROUTES in '
      + `scripts/page-weight-core.mjs.\n${build.output.slice(-2000)}`,
  );
}

// ---------- serving dist/ over real HTTP, with the signal under our control ----------

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

export type SignalState = 'online' | 'blackout' | 'stall';

/**
 * How the write path answers a send (slices 03-04). 'live' is byte-for-byte
 * the behaviour slice-01 was recorded against. The scripted behaviours model
 * the settled server contract of 07-write-path.md sections 4.3 to 5: a
 * throttled front door (429, bodyless), a refusal with a reason (400), and
 * the nastiest branch, an answer stored by the site but lost on the way back
 * to the phone. Dedup memory implements 4.4: the first answer for a
 * `report_id` is kept, and a replay is answered with that original reveal as
 * `queued_duplicate`, never counted twice.
 */
export type WritePathBehaviour = 'live' | 'throttled' | 'server-error' | 'refused' | 'lose-answer-once';

export type ReceivedSend = Readonly<{ body: string; at: number }>;

const REFUSAL_REASON_ES = 'El reporte no tiene la forma que esperamos.';
export { REFUSAL_REASON_ES };

const site = {
  signal: 'online' as SignalState,
  counting: false,
  asked: [] as string[],
  held: new Set<Socket>(),
  /** Path -> replacement body, so an amended helper is served without ever touching dist/. */
  overrides: new Map<string, { body: string; contentType: string; status?: number | undefined }>(),
  writePath: {
    behaviour: 'live' as WritePathBehaviour,
    /** report_id -> the exact reveal body the site composed the first time. */
    stored: new Map<string, string>(),
    /** Every send that reached the site, in arrival order. */
    received: [] as ReceivedSend[],
    answersLost: 0,
  },
};

export function resetSite(): void {
  site.signal = 'online';
  site.counting = false;
  site.asked = [];
  site.overrides.clear();
  site.writePath.behaviour = 'live';
  site.writePath.stored.clear();
  site.writePath.received = [];
  site.writePath.answersLost = 0;
  releaseHeldSockets();
}

export function setWritePathBehaviour(behaviour: WritePathBehaviour): void {
  site.writePath.behaviour = behaviour;
}

/** Every send that reached the site, oldest first. The driven-port observable of a flush. */
export function writePathReceived(): ReceivedSend[] {
  return [...site.writePath.received];
}

/** How many distinct reports the site is holding. One, ever, is the slice-04 promise. */
export function writePathStoredCount(): number {
  return site.writePath.stored.size;
}

/** The reveal the site composed the first time it stored this report, or null. */
export function writePathStoredAnswer(reportId: string): string | null {
  return site.writePath.stored.get(reportId) ?? null;
}

/**
 * Puts a report into the site's memory as if an earlier send had already
 * succeeded, reveal and all. The Given of every "the site already has it"
 * scenario: the phone's queue entry survived, the site's record did too.
 */
export function prestoreReport(reportId: string): void {
  site.writePath.stored.set(reportId, composeFirstReveal(reportId));
}

function composeFirstReveal(reportId: string): string {
  return JSON.stringify({
    outcome: 'compared',
    mark: LIVE_ANSWER_MARK,
    report_id: reportId,
    predicted: { score_q: 74, size_band: 'waist_chest', size_range_m: [0.7, 1.1], wind_state: 'choppy', conf_level: 'medium' },
    delta: { score_points: 4, size_bands: 0 },
    counter: { n_reports: site.writePath.stored.size + 1, threshold: 30 },
  });
}

function answerSend(body: string, response: http.ServerResponse, socket: Socket, credential: string | undefined): void {
  const noStore = { 'cache-control': 'no-store' } as const;
  if (credential !== WRITE_CREDENTIAL) {
    response.writeHead(401, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { code: 'credential_invalid', what: 'No pudimos confirmar el reporte ahora.' } }));
    return;
  }
  site.writePath.received.push({ body, at: Date.now() });

  if (site.writePath.behaviour === 'throttled') {
    // The front door, free and bodyless (07-write-path.md section 4.3).
    response.writeHead(429, { ...noStore, 'retry-after': '30' });
    response.end();
    return;
  }
  if (site.writePath.behaviour === 'server-error') {
    response.writeHead(503, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { code: 'store_unavailable', what: 'No pudimos guardar el reporte.', why: 'La bodega no responde.', how: 'El teléfono lo intenta de nuevo solo.' } }));
    return;
  }
  if (site.writePath.behaviour === 'refused') {
    response.writeHead(400, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: { code: 'schema_invalid', what: REFUSAL_REASON_ES, why: 'Le falta un dato o trae uno que no existe.', how: 'Revisa el reporte; esperar no lo arregla.' } }));
    return;
  }

  let reportId = 'unknown';
  try {
    const parsed = JSON.parse(body) as { report_id?: string };
    if (typeof parsed.report_id === 'string' && parsed.report_id.length > 0) reportId = parsed.report_id;
  } catch {
    // A body the site cannot read still gets the live answer; slice-01's
    // scenarios never asserted on parsing and must keep their recorded RED.
  }

  const already = site.writePath.stored.get(reportId);
  if (already !== null && already !== undefined) {
    // 07 section 4.4: the original reveal, rebuilt, outcome queued_duplicate.
    // Not double-counted, quota untouched, stored answer byte-preserved.
    const original = JSON.parse(already) as Record<string, unknown>;
    response.writeHead(200, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ...original, outcome: 'queued_duplicate' }));
    return;
  }

  if (site.writePath.behaviour === 'lose-answer-once' && site.writePath.answersLost === 0) {
    // The site heard and stored the report; the answer died on the way back.
    site.writePath.answersLost += 1;
    site.writePath.stored.set(reportId, composeFirstReveal(reportId));
    socket.destroy();
    return;
  }

  if (site.writePath.behaviour === 'live') {
    const reveal = composeFirstReveal(reportId);
    site.writePath.stored.set(reportId, reveal);
    response.writeHead(200, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
    response.end(reveal);
    return;
  }

  const reveal = composeFirstReveal(reportId);
  site.writePath.stored.set(reportId, reveal);
  response.writeHead(200, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
  response.end(reveal);
}

function releaseHeldSockets(): void {
  for (const socket of site.held) socket.destroy();
  site.held.clear();
}

export function startCountingRequests(): void {
  site.asked = [];
  site.counting = true;
}

export function requestsAsked(): string[] {
  return [...site.asked];
}

export function overrideServedFile(path: string, body: string, contentType: string, status?: number): void {
  site.overrides.set(path, { body, contentType, status });
}

export function clearServedOverride(path: string): void {
  site.overrides.delete(path);
}

/**
 * The deployed artifact is files on S3 behind CloudFront with
 * `build.format: 'file'`, so the host must map an extensionless route to its
 * `.html` document. This server performs exactly that mapping and nothing
 * more: exact file, else trailing-slash-stripped + `.html`, else `.html`
 * appended. No directory indexes, no redirects, nothing `astro preview` would
 * quietly fix.
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

let serverPromise: Promise<{ server: http.Server; baseUrl: string }> | null = null;

export function ensureServedSite(): Promise<{ server: http.Server; baseUrl: string }> {
  serverPromise ??= new Promise((resolveServer, rejectServer) => {
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (site.counting) site.asked.push(`${request.method ?? 'GET'} ${pathname}`);

      if (site.signal === 'blackout') {
        // An unreachable origin, as a phone with no bars experiences it.
        request.socket.destroy();
        return;
      }
      if (site.signal === 'stall') {
        // Accepted and never answered: the only condition under which a
        // three-second network-first timeout can be watched firing.
        site.held.add(request.socket);
        request.socket.on('close', () => site.held.delete(request.socket));
        return;
      }

      const noStore = { 'cache-control': 'no-store' } as const;

      if (request.method === 'GET' && pathname === '/push-config.json') {
        const origin = `http://${request.headers.host}`;
        response.writeHead(200, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ mint_url: `${origin}${MINT_PATH}`, report_url: `${origin}${WRITE_PATH}` }));
        return;
      }
      if (request.method === 'POST' && pathname === MINT_PATH) {
        response.writeHead(200, { ...noStore, 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ credential: WRITE_CREDENTIAL }));
        return;
      }

      if (request.method === 'POST' && pathname === WRITE_PATH) {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const header = request.headers['x-surf-credential'];
          answerSend(Buffer.concat(chunks).toString('utf8'), response, request.socket, Array.isArray(header) ? header[0] : header);
        });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { ...noStore, 'content-type': 'text/plain; charset=utf-8' });
        response.end('method not allowed');
        return;
      }

      const override = site.overrides.get(pathname);
      if (override) {
        response.writeHead(override.status ?? 200, { ...noStore, 'content-type': override.contentType });
        response.end(override.body);
        return;
      }

      const document = resolveDocument(pathname);
      if (document === null) {
        const notFound = resolve(DIST_ROOT, '404.html');
        const body = existsSync(notFound) ? readFileSync(notFound) : Buffer.from('not found');
        response.writeHead(404, { ...noStore, 'content-type': 'text/html; charset=utf-8' });
        response.end(body);
        return;
      }
      response.writeHead(200, {
        ...noStore,
        'content-type': CONTENT_TYPES[extname(document)] ?? 'application/octet-stream',
      });
      response.end(readFileSync(document));
    });
    server.on('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address !== null && typeof address === 'object', 'static server has no address');
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
  return serverPromise;
}

// ---------- Chromium at 390 px ----------

let browserPromise: Promise<Browser> | null = null;

function ensureBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

export type SeenForecast = Readonly<{ stampLine: string | null; topCallLine: string | null; text: string }>;

export interface SignalScenario {
  context: BrowserContext | null;
  page: Page | null;
  baseUrl: string | null;
  failures: { label: string; error: unknown }[];
  pageErrors: string[];
  /** What the surfer had on screen the last time the forecast loaded with signal. */
  lastSeen: SeenForecast | null;
  /** The report screen's own words the last time it loaded with signal. */
  lastSeenReportScreen: string | null;
  /** Milliseconds the most recent navigation took, for the timeout scenario. */
  lastNavigationMs: number | null;
  /** The answer the phone got back from its most recent send. */
  lastSend: { ok: boolean; status: number; body: string; error: string | null } | null;
  /** The helper file as the build emitted it, and with the alerts listeners appended. */
  helperSource: { url: string; original: string; amended: string } | null;
}

const scenarios = new WeakMap<object, SignalScenario>();

export function scenarioState(world: object): SignalScenario {
  const state = scenarios.get(world);
  assert.ok(state, 'test bug: no scenario state; the feature-tag Before hook did not run');
  return state;
}

Before({ tags: '@feature-f-works-with-no-signal' }, function (this: object) {
  resetSite();
  scenarios.set(this, {
    context: null,
    page: null,
    baseUrl: null,
    failures: [],
    pageErrors: [],
    lastSeen: null,
    lastSeenReportScreen: null,
    lastNavigationMs: null,
    lastSend: null,
    helperSource: null,
  });
});

After({ tags: '@feature-f-works-with-no-signal' }, async function (this: object) {
  const state = scenarios.get(this);
  if (state?.context) await state.context.close();
  resetSite();
});

AfterAll(async function () {
  releaseHeldSockets();
  if (browserPromise) await (await browserPromise).close();
  if (serverPromise) (await serverPromise).server.close();
});

/** Creates the phone lazily. 390 px is the declared smallest width. */
export async function phonePage(state: SignalScenario): Promise<Page> {
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
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => state.pageErrors.push(String(error)));
  state.context = context;
  state.page = page;
  return page;
}

/**
 * Observes the real page-to-controller boundary without replacing it. The
 * emitted Base.astro handler still calls the browser's native postMessage.
 */
export async function observeControllerMessages(state: SignalScenario): Promise<void> {
  const page = await phonePage(state);
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    const postMessage = ServiceWorker.prototype.postMessage;
    Object.defineProperty(ServiceWorker.prototype, 'postMessage', {
      configurable: true,
      value(message: unknown, options?: StructuredSerializeOptions) {
        messages.push(message);
        return postMessage.call(this, message, options);
      },
    });
    (window as Window & { __signalControllerMessages?: unknown[] }).__signalControllerMessages = messages;
  });
}

export async function controllerMessages(state: SignalScenario): Promise<unknown[]> {
  const page = await phonePage(state);
  return page.evaluate(
    () => (window as Window & { __signalControllerMessages?: unknown[] }).__signalControllerMessages ?? [],
  );
}

/** A brand new phone: nothing installed, nothing cached, no history. */
export async function freshPhone(state: SignalScenario): Promise<Page> {
  if (state.context) await state.context.close();
  state.context = null;
  state.page = null;
  return phonePage(state);
}

/**
 * A phone that runs no JavaScript at all (slice-02, R15): the absolute
 * publish time must still read true, because truth lives in the document,
 * never in a script. Same 390 px phone, scripting off.
 */
export async function phoneWithoutJavaScript(state: SignalScenario): Promise<Page> {
  if (state.context) await state.context.close();
  state.context = null;
  state.page = null;
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
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  state.context = context;
  state.page = page;
  return page;
}

/**
 * Serves 404 for the helper script, modelling a phone that queued reports
 * before any helper ever installed (slice-03, the activation trigger: the
 * queue predates the helper, and the helper's first activation must flush
 * it). The site is fully functional unregistered, so this is a real state.
 */
export function withholdHelper(state: SignalScenario): void {
  const url = helperUrlFromBuiltHome();
  if (url === null) {
    state.failures.push({
      label: 'withhold the offline helper from a first visit',
      error: new Error('the built home page starts no offline helper, so there is nothing to withhold'),
    });
    return;
  }
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  overrideServedFile(path, 'not here yet', 'text/plain; charset=utf-8', 404);
}

/** Ends the withholding: the next visit gets the real emitted helper. */
export function releaseHelper(): void {
  const url = helperUrlFromBuiltHome();
  if (url === null) return;
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  clearServedOverride(path);
}

export function setSignal(state: SignalScenario, signal: SignalState): void {
  void state;
  if (site.signal === 'stall' && signal !== 'stall') releaseHeldSockets();
  site.signal = signal;
}

export function failureContext(state: SignalScenario): string {
  if (state.failures.length === 0) return '';
  const lines = state.failures.map(
    (f) => `${f.label}: ${f.error instanceof Error ? f.error.message.split('\n')[0] : String(f.error)}`,
  );
  return ` (captured journey failures: ${lines.join(' | ')})`;
}

// ---------- walking the site ----------

export async function goTo(
  state: SignalScenario,
  path: string,
  label: string,
  options: { waitUntil?: 'load' | 'domcontentloaded'; timeout?: number } = {},
): Promise<void> {
  const page = await phonePage(state);
  const started = Date.now();
  try {
    await page.goto(`${state.baseUrl}${path}`, {
      waitUntil: options.waitUntil ?? 'load',
      timeout: options.timeout ?? 15_000,
    });
  } catch (error) {
    state.failures.push({ label, error });
  }
  state.lastNavigationMs = Date.now() - started;
}

export async function visibleText(state: SignalScenario): Promise<string> {
  const page = await phonePage(state);
  try {
    return await page.evaluate(() => document.body.innerText);
  } catch (error) {
    state.failures.push({ label: 'read what is on the screen', error });
    return '';
  }
}

function lineStartingWith(text: string, prefix: string): string | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) return trimmed;
  }
  return null;
}

/**
 * Waits until the helper the page registered is installed and in charge.
 * Never throws: a phone with no helper is the RED these scenarios exist to
 * report, and it must be reported by a Then with its reason, not by a hook.
 */
export async function settleHelper(state: SignalScenario): Promise<void> {
  const page = await phonePage(state);
  try {
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return;
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((done) => setTimeout(done, 8000)),
      ]);
    });
  } catch (error) {
    state.failures.push({ label: 'wait for the offline helper to install', error });
  }
}

/**
 * The opening move of nearly every scenario: the surfer reads the home page
 * where there is still signal. Reloads once after the helper settles so the
 * page the surfer is looking at is one the helper is actually in charge of,
 * which is the state a returning visit is in.
 */
export async function readHomeWithSignal(state: SignalScenario): Promise<void> {
  setSignal(state, 'online');
  await goTo(state, '/', 'read the home page with signal');
  await settleHelper(state);
  await goTo(state, '/', 're-read the home page with signal');
  const text = await visibleText(state);
  state.lastSeen = {
    stampLine: lineStartingWith(text, 'Actualizado'),
    topCallLine: lineStartingWith(text, 'VE A '),
    text,
  };
}

export async function openReportScreenWithSignal(state: SignalScenario, spot: string): Promise<void> {
  setSignal(state, 'online');
  await goTo(state, `/spots/${spot}/reportar`, `open the report screen for ${spot} with signal`);
  await settleHelper(state);
  state.lastSeenReportScreen = normalise(await visibleText(state));
}

export function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ---------- observing the helper and its store ----------

export type HelperStatus = Readonly<{
  supported: boolean;
  installed: boolean;
  inCharge: boolean;
  scriptUrl: string | null;
}>;

export async function helperStatus(state: SignalScenario): Promise<HelperStatus> {
  const page = await phonePage(state);
  try {
    return await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { supported: false, installed: false, inCharge: false, scriptUrl: null };
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const active = registration?.active ?? null;
      return {
        supported: true,
        installed: active !== null,
        inCharge: navigator.serviceWorker.controller !== null,
        scriptUrl: active?.scriptURL ?? null,
      };
    });
  } catch (error) {
    state.failures.push({ label: 'ask the phone whether the offline helper is running', error });
    return { supported: false, installed: false, inCharge: false, scriptUrl: null };
  }
}

/** Every address the phone is holding a copy of, across every store the site owns. */
export async function keptOnPhone(state: SignalScenario): Promise<string[]> {
  const page = await phonePage(state);
  try {
    return await page.evaluate(async () => {
      if (!('caches' in window)) return [];
      const kept: string[] = [];
      for (const name of await caches.keys()) {
        const store = await caches.open(name);
        for (const request of await store.keys()) kept.push(request.url);
      }
      return kept;
    });
  } catch (error) {
    state.failures.push({ label: 'read what the phone is holding', error });
    return [];
  }
}

/**
 * Plants an answer to a sent report in the phone's own store, keyed by the
 * write-path address. This is the deliberately poisoned fixture of
 * application-architecture.md section 9 (clause check:unfired-is-not-evidence)
 * carried onto the real surface: a helper that matches on the address, or that
 * looks a request up ignoring its method, or that lets the write path fall
 * through to a cache-first branch, will hand this back instead of the site's
 * answer. It is keyed by address rather than by a POST request on purpose:
 * Cache.put refuses a non-GET request outright, and the plausible bug is
 * exactly an address-keyed lookup.
 */
export async function plantAnswerOnPhone(state: SignalScenario): Promise<void> {
  const page = await phonePage(state);
  try {
    await page.evaluate(
      async ([address, mark]) => {
        const store = await caches.open('planted-by-the-acceptance-test');
        await store.put(
          address,
          new Response(JSON.stringify({ outcome: 'compared', mark }), {
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
      [WRITE_PATH, PLANTED_ANSWER_MARK] as const,
    );
  } catch (error) {
    state.failures.push({ label: 'plant an answer on the phone', error });
  }
}

export async function sendReport(state: SignalScenario): Promise<void> {
  const page = await phonePage(state);
  try {
    state.lastSend = await page.evaluate(async (address) => {
      try {
        const answer = await fetch(address, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            report_id: '01J0SIGNALSLICE01ACCEPT01',
            spot_id: 'playa-venao',
            size_band: 'waist_chest',
            wind: 'choppy',
            quality: 'good',
          }),
        });
        return { ok: answer.ok, status: answer.status, body: await answer.text(), error: null };
      } catch (error) {
        return { ok: false, status: 0, body: '', error: String(error) };
      }
    }, WRITE_PATH);
  } catch (error) {
    state.failures.push({ label: 'send a report from the phone', error });
    state.lastSend = { ok: false, status: 0, body: '', error: String(error) };
  }
}

// ---------- the helper file, as the build emitted it ----------

/**
 * Finds the helper the built home page starts, without pinning its filename:
 * the page names its own helper in the registration snippet, so the test reads
 * the name from the page the same way a browser does.
 */
export function helperUrlFromBuiltHome(): string | null {
  const home = resolve(DIST_ROOT, 'index.html');
  if (!existsSync(home)) return null;
  const html = readFileSync(home, 'utf8');
  const match = /serviceWorker\s*\.\s*register\(\s*['"`]([^'"`]+)['"`]/.exec(html);
  return match?.[1] ?? null;
}

/** The inline snippet that starts the helper, exactly as it ships inside the document. */
export function registrationSnippetFromBuiltHome(): string | null {
  const home = resolve(DIST_ROOT, 'index.html');
  if (!existsSync(home)) return null;
  const html = readFileSync(home, 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1] ?? '';
    if (/serviceWorker/.test(body)) return body;
  }
  return null;
}

export function builtFileBytes(relativePath: string): Buffer | null {
  const path = resolve(DIST_ROOT, relativePath.replace(/^\//, ''));
  if (!path.startsWith(DIST_ROOT)) return null;
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return readFileSync(path);
}

export function gzippedBytes(content: Buffer | string): number {
  return gzipSync(content).length;
}

/**
 * What the later alerts feature adds: two new listener registrations at the end
 * of the file, touching zero existing router rows and zero existing listeners
 * (the named PUSH-lane seat, feature-delta plan note). Served as an override so
 * the repository build output is never touched, which also keeps every other
 * scenario in this run reading the real emitted helper.
 */
export const ALERTS_LISTENERS = [
  '',
  '// appended by the later alerts feature: new registrations only, nothing edited',
  "self.addEventListener('push', (event) => { event.waitUntil(Promise.resolve()); });",
  "self.addEventListener('notificationclick', (event) => { event.notification.close(); });",
  '',
].join('\n');

export function appendAlertsListenersToHelper(state: SignalScenario): void {
  const url = helperUrlFromBuiltHome();
  if (url === null) {
    state.failures.push({
      label: 'find the offline helper the built home page starts',
      error: new Error('the built home page starts no offline helper'),
    });
    return;
  }
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  const emitted = builtFileBytes(path);
  if (emitted === null) {
    state.failures.push({
      label: `read the emitted offline helper at ${path}`,
      error: new Error('the build emitted no such file'),
    });
    return;
  }
  const original = emitted.toString('utf8');
  const amended = original + ALERTS_LISTENERS;
  overrideServedFile(path, amended, 'text/javascript; charset=utf-8');
  state.helperSource = { url: path, original, amended };
}
