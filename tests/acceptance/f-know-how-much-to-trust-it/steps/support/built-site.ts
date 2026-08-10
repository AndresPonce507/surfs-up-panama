// Shared reading-half harness for f-know-how-much-to-trust-it slices 02-05.
// JIT DISTILL 2026-08-10.
//
// Same discipline as slice-01's reading half, factored so later slices can
// plant their own published shapes without touching slice-01's mid-DELIVER
// file: copy the project to a temp root, plant ONLY producer-shaped values on
// that copy's data/published-surface.json, run the real `npm run build`,
// serve the emitted dist/ over real HTTP with the exact build.format:'file'
// mapping (no SPA fallback, no directory index), and read it in Chromium at
// 390 px. The shared, committed published surface is never written.
//
// One built site per fixture key, cached for the whole run. Each fixture is a
// different planted morning, so slices do not share a site.

import { AfterAll } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

import type { PipelineWorld } from '../../../daily-call-with-permanent-receipts/steps/support/world';
import { LEVEL_WORD, LONG_DASH, REASON_MAX_CHARS } from './trust-observables';

export type PlantProfile = {
  readonly conf_level: 'low' | 'medium' | 'high';
  readonly reason_es: string | null;
};

export type PlantFixture = {
  readonly default_profile: string;
  readonly by_spot: Readonly<Record<string, { today: string; tomorrow: string }>>;
  readonly profiles: Readonly<Record<string, PlantProfile>>;
  readonly required_spot_ids: readonly string[];
};

export type BuiltSite = {
  readonly root: string;
  readonly distRoot: string;
  readonly baseUrl: string;
  readonly server: http.Server;
  readonly planted: Map<string, PlantProfile>;
};

export function loadPlantFixture(url: URL): PlantFixture {
  const fixture = JSON.parse(readFileSync(url, 'utf8')) as PlantFixture;
  for (const [name, profile] of Object.entries(fixture.profiles)) {
    const reason = profile.reason_es;
    if (reason === null) continue;
    assert.ok(
      [...reason].length <= REASON_MAX_CHARS,
      `test fixture error: planted profile "${name}" is ${[...reason].length} characters, over the ${REASON_MAX_CHARS} the published reason is allowed`,
    );
    assert.ok(!LONG_DASH.test(reason), `test fixture error: planted profile "${name}" contains a long dash`);
  }
  return fixture;
}

const projectRoot = process.cwd();
const sites = new Map<string, Promise<BuiltSite>>();
let browserPromise: Promise<Browser> | null = null;

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function copyProject(slug: string): string {
  const root = mkdtempSync(join(tmpdir(), `surfs-up-trust-${slug}-`));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    cpSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function panamaCivilDate(offsetDays: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function plantKey(spotId: string, day: 0 | 1): string {
  return `${spotId}::${day}`;
}

function plantPerRowValues(root: string, fixture: PlantFixture): Map<string, PlantProfile> {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as {
    current: {
      surf_date: string;
      calls: Record<string, unknown>[];
      days: [{ date: string; spots: Record<string, unknown>[] }, { date: string; spots: Record<string, unknown>[] }];
    };
  };
  const dates = [panamaCivilDate(0), panamaCivilDate(1)] as const;
  surface.current.surf_date = dates[0];
  surface.current.days[0].date = dates[0];
  surface.current.days[1].date = dates[1];

  const planted = new Map<string, PlantProfile>();
  const profileFor = (spotId: string, day: 0 | 1): PlantProfile => {
    const assignment = fixture.by_spot[spotId];
    const name = assignment === undefined
      ? fixture.default_profile
      : (day === 0 ? assignment.today : assignment.tomorrow);
    const profile = fixture.profiles[name];
    assert.ok(profile, `test fixture error: unknown profile "${name}"`);
    return profile;
  };
  const apply = (row: Record<string, unknown>, day: 0 | 1): void => {
    const spotId = String(row.spot_id);
    const profile = profileFor(spotId, day);
    row.conf_level = profile.conf_level;
    if (profile.reason_es === null) delete row.confidence_reason_es;
    else row.confidence_reason_es = profile.reason_es;
    planted.set(plantKey(spotId, day), profile);
  };
  for (const row of surface.current.calls) apply(row, 0);
  for (const row of surface.current.days[0].spots) apply(row, 0);
  for (const row of surface.current.days[1].spots) apply(row, 1);

  for (const spotId of fixture.required_spot_ids) {
    assert.ok(
      planted.has(plantKey(spotId, 0)),
      `test fixture error: ${spotId} is not in the installed ranking`,
    );
  }
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
  return planted;
}

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
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveDocument(distRoot: string, pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;
  const candidates: string[] = [];
  if (safe === '/' || safe === '') candidates.push('index.html');
  else if (safe.endsWith('/')) candidates.push(`${safe.replace(/\/+$/, '')}.html`, `${safe}index.html`);
  else candidates.push(safe, `${safe}.html`, `${safe}/index.html`);
  for (const candidate of candidates) {
    const path = resolve(distRoot, candidate.replace(/^\//, ''));
    if (!path.startsWith(distRoot)) return null;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

async function startStaticServer(distRoot: string): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolveServer, rejectServer) => {
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const document = resolveDocument(distRoot, pathname);
      if (document === null) {
        response.writeHead(404, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': CONTENT_TYPES[extname(document)] ?? 'application/octet-stream',
      });
      response.end(readFileSync(document));
    });
    server.on('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        rejectServer(new Error('test fixture error: the static server reported no port'));
        return;
      }
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

export function ensureSite(slug: string, fixture: PlantFixture): Promise<BuiltSite> {
  let promise = sites.get(slug);
  if (promise === undefined) {
    promise = (async (): Promise<BuiltSite> => {
      const root = copyProject(slug);
      const planted = plantPerRowValues(root, fixture);
      const build = spawnSync('npm', ['run', 'build'], {
        cwd: root,
        env: credentialFreeEnvironment(),
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      if (build.status !== 0) {
        throw new Error(`test fixture error: the published surface failed to build before any behavior oracle:\n${build.stdout}\n${build.stderr}`);
      }
      const distRoot = resolve(root, 'dist');
      const { server, baseUrl } = await startStaticServer(distRoot);
      return { root, distRoot, baseUrl, server, planted };
    })();
    sites.set(slug, promise);
  }
  return promise;
}

function ensureBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ headless: true });
  return browserPromise;
}

type PageWorld = PipelineWorld & {
  trustContext?: Awaited<ReturnType<Browser['newContext']>>;
  trustPage?: Page;
};

/** Opens a route at 390 px. Reuses slice-01's world property names so its
 * tagged After hook closes the context for these slices too. */
export async function openBuiltPage(
  world: PipelineWorld,
  site: BuiltSite,
  route: string,
  theme: string,
  movement: string,
): Promise<Page> {
  const browser = await ensureBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const response = await page.goto(`${site.baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  assert.ok(
    response !== null && response.status() === 200,
    `test fixture error: ${route} answered ${response === null ? 'nothing' : response.status()}; the oracle never ran`,
  );
  const shared = world as PageWorld;
  shared.trustContext = context;
  shared.trustPage = page;
  return page;
}

/** What one confidence block actually shows a person. innerText on purpose:
 * markup that never renders visibly reads as an empty box, never as a pass. */
export type ObservedConfidence = {
  readonly label: string;
  readonly spot_id: string;
  readonly day: 0 | 1;
  readonly closedText: string;
  readonly wordText: string;
  readonly reasonText: string;
  readonly hasDisclosure: boolean;
};

async function observeConfidence(
  page: Page,
  containerSelector: string,
  label: string,
  spotId: string,
  day: 0 | 1,
): Promise<ObservedConfidence> {
  const container = page.locator(containerSelector);
  if ((await container.count()) === 0) {
    return { label, spot_id: spotId, day, closedText: '', wordText: '', reasonText: '', hasDisclosure: false };
  }
  const closedText = (await container.innerText()).trim();
  const summary = container.locator('details.confidence summary');
  const hasDisclosure = (await summary.count()) > 0;
  let reasonText = '';
  let wordText = '';
  if (hasDisclosure) {
    wordText = (await summary.innerText()).trim();
    await summary.click();
    const opened = (await container.locator('details.confidence').innerText()).trim();
    reasonText = opened.startsWith(wordText) ? opened.slice(wordText.length).trim() : opened;
    await summary.click();
  } else {
    const match = LEVEL_WORD.exec(closedText);
    wordText = match === null ? '' : match[0];
  }
  return { label, spot_id: spotId, day, closedText, wordText, reasonText, hasDisclosure };
}

export async function observeRankedRows(page: Page, day: 0 | 1): Promise<ObservedConfidence[]> {
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  assert.ok(count > 0, 'test fixture error: the published ranking rendered no rows at all');
  const observed: ObservedConfidence[] = [];
  for (let index = 0; index < count; index += 1) {
    const href = await rows.nth(index).locator('a[href^="/spots/"]').first().getAttribute('href');
    assert.ok(href, `test fixture error: row ${index + 1} has no link to its spot page`);
    const spotId = href.replace(/^\/spots\//, '').replace(/\/$/, '');
    observed.push(await observeConfidence(page, `ol.ranked > li >> nth=${index}`, `la fila ${index + 1} (${spotId})`, spotId, day));
  }
  return observed;
}

// Passed to evaluate() as a STRING: tsx wraps named bindings in a __name
// helper that does not exist inside Playwright's isolated realm. Walks to the
// first painting ancestor and returns the worst-case ratio against the real
// rendered backdrop, never against white.
const CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT = `(el) => {
  const parseColor = (value) => {
    const match = value.match(/rgba?\\(([^)]+)\\)/i);
    if (!match || match[1] === undefined) return null;
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    const r = parts[0], g = parts[1], b = parts[2], a = parts[3];
    if (r === undefined || g === undefined || b === undefined) return null;
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  };
  const luminance = (c) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };
  const contrast = (fg, bg) => {
    const first = luminance(fg);
    const second = luminance(bg);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };
  const foreground = parseColor(getComputedStyle(el).color);
  if (foreground === null) return null;
  let node = el;
  while (node !== null) {
    const computed = getComputedStyle(node);
    const backgrounds = [];
    const solid = parseColor(computed.backgroundColor);
    if (solid !== null && solid.a > 0.99) backgrounds.push(solid);
    for (const match of computed.backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)) {
      const stop = parseColor(match[0]);
      if (stop !== null) backgrounds.push(stop);
    }
    if (backgrounds.length > 0) return Math.min(...backgrounds.map((background) => contrast(foreground, background)));
    node = node.parentElement;
  }
  return null;
}`;

/** The declared type scale (09-design-system.md section 5), in px. */
const DECLARED_TYPE_SIZES_PX = [52, 28, 22, 22, 19, 17, 14, 13];

/**
 * The seven measured checks (U1-U7) over ONE ranked row's confidence block,
 * against the real rendered backdrop. Counts the block FIRST: a visual audit
 * over an empty set is the vacuous pass this repository has already shipped
 * once. Returns findings; the calling step turns them into the assertion.
 */
export async function sevenChecksOnRankedRow(page: Page, spotId: string): Promise<string[]> {
  const findings: string[] = [];
  const row = page.locator(`ol.ranked > li:has(a[href^="/spots/${spotId}"])`);
  if ((await row.count()) === 0) {
    findings.push(`"${spotId}" no aparece en la lista: no hay nada que medir contra el fondo real`);
    return findings;
  }
  const block = row.locator('details.confidence');
  const count = await block.count();
  if (count !== 1) {
    findings.push(`la fila de "${spotId}" trae ${count} bloques de confianza y se esperaba exactamente 1: no hay nada que medir contra el fondo real`);
    return findings;
  }
  const label = `el bloque de confianza de "${spotId}"`;
  const summary = block.locator('summary');

  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (geometry.scrollWidth > geometry.clientWidth) {
    findings.push(`U2: la página se desborda: scrollWidth ${geometry.scrollWidth} > clientWidth ${geometry.clientWidth}`);
  }

  const summaryContrast: unknown = await summary.evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT);
  if (typeof summaryContrast === 'number' && summaryContrast < 4.5) {
    findings.push(`U1: ${label} deja la palabra en ${summaryContrast.toFixed(2)}:1 contra su fondo real`);
  }

  const trigger = await summary.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const computed = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      right: rect.right,
      left: rect.left,
      fontSizePx: Number.parseFloat(computed.fontSize),
      transitionDuration: computed.transitionDuration,
      animationName: computed.animationName,
      inlineStyle: el.getAttribute('style') ?? '',
      clientWidth: document.documentElement.clientWidth,
    };
  });
  if (trigger.width < 44 || trigger.height < 44) {
    findings.push(`U3: ${label} mide ${Math.round(trigger.width)}x${Math.round(trigger.height)} px, por debajo de 44`);
  }
  const moves = trigger.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
    || (trigger.animationName.trim() !== '' && trigger.animationName.trim() !== 'none');
  if (moves) {
    findings.push(`U4: ${label} conserva movimiento con la preferencia del sistema puesta`);
  }
  if (!DECLARED_TYPE_SIZES_PX.some((size) => Math.abs(size - trigger.fontSizePx) < 0.6)) {
    findings.push(`U6: ${label} usa ${trigger.fontSizePx.toFixed(1)} px, que no está en la escala declarada`);
  }
  if (/#[0-9a-f]{3,8}\b/iu.test(trigger.inlineStyle)) {
    findings.push(`U7: ${label} lleva un color crudo en su atributo style: "${trigger.inlineStyle}"`);
  }
  if (trigger.right > trigger.clientWidth + 1 || trigger.left < -1) {
    findings.push(`U2: ${label} se sale de los 390 px`);
  }

  await summary.click();
  const opened = await block.evaluate((el) => {
    const panel = el.querySelector(':scope > *:not(summary)') ?? el;
    const rect = panel.getBoundingClientRect();
    const computed = getComputedStyle(panel as Element);
    return {
      text: (panel as HTMLElement).innerText.trim(),
      clipped: panel.scrollHeight > rect.height + 1 || panel.scrollWidth > rect.width + 1,
      right: rect.right,
      left: rect.left,
      fontSizePx: Number.parseFloat(computed.fontSize),
      lineHeightPx: Number.parseFloat(computed.lineHeight),
      inlineStyle: (panel as HTMLElement).getAttribute('style') ?? '',
      clientWidth: document.documentElement.clientWidth,
    };
  });
  const measuredReasonContrast: unknown = await block
    .locator(':scope > *:not(summary)')
    .first()
    .evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT)
    .catch(() => null);
  await summary.click();

  if (opened.text === '') {
    findings.push(`U5: ${label} abre una caja vacía en vez de un estado diseñado`);
  }
  if (opened.clipped) {
    findings.push(`U6: ${label} recorta su razón en vez de dejarla envolver`);
  }
  if (opened.right > opened.clientWidth + 1 || opened.left < -1) {
    findings.push(`U2: ${label} abre su razón fuera de los 390 px`);
  }
  if (typeof measuredReasonContrast === 'number' && measuredReasonContrast < 4.5) {
    findings.push(`U1: ${label} deja su razón en ${measuredReasonContrast.toFixed(2)}:1 contra su fondo real`);
  }
  if (Number.isFinite(opened.lineHeightPx) && opened.lineHeightPx < opened.fontSizePx * 1.2) {
    findings.push(`U6: ${label} aprieta la razón a ${opened.lineHeightPx.toFixed(1)} px de interlínea sobre ${opened.fontSizePx.toFixed(1)} px de texto`);
  }
  if (/#[0-9a-f]{3,8}\b/iu.test(opened.inlineStyle)) {
    findings.push(`U7: ${label} lleva un color crudo en el atributo style de su razón`);
  }
  return findings;
}

AfterAll({ timeout: 60_000 }, async function () {
  if (browserPromise !== null) {
    await (await browserPromise).close().catch(() => undefined);
    browserPromise = null;
  }
  for (const [slug, promise] of sites) {
    const site = await promise.catch(() => null);
    sites.delete(slug);
    if (site !== null) {
      await new Promise<void>((done) => site.server.close(() => done()));
      rmSync(site.root, { recursive: true, force: true });
    }
  }
});
