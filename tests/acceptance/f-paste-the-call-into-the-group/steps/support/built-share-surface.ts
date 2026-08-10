// Shared machinery for the paste-the-call slice-01 acceptance scenarios.
// Every scenario copies the production project into an isolated root, runs the
// real `npm run build` over the installed public input, serves the emitted
// dist/ over HTTP, and observes the home through Chromium at phone width. The
// worktree and its published data never change. The pattern is the shipped
// slice-04 precedent in
// tests/acceptance/daily-call-with-permanent-receipts/steps/top-call-card.steps.ts.

import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const projectRoot = process.cwd();

type ShareCall = {
  spot_id: string;
  score_q: number;
  call_es?: string;
  conf_level?: string;
  size_band?: string;
  size_range_m?: readonly [number, number];
  wind_state?: string;
  best_window?: { readonly start: string; readonly end: string };
};

type SurfaceUpdate = {
  surf_date: string;
  published_at: string;
  calls: ShareCall[];
  days: { date: string; spots: ShareCall[] }[];
};

type StaticSurfaceFile = { current: SurfaceUpdate };

// Canonical Spanish vocabulary (application-architecture.md section 10; size
// words are the v1 band table of domain model section 7.2). The test mirrors
// the published constants; it never mints size, wind or confidence words.
const spanishSizeBand: Readonly<Record<string, string>> = {
  flat: 'Plano',
  ankle_knee: 'Tobillo a rodilla',
  knee_waist: 'Rodilla a cintura',
  waist_chest: 'Cintura a pecho',
  chest_head: 'Pecho a cabeza',
  head_overhead: 'Cabeza a un metro más',
  double_overhead_plus: 'Doble o más',
};

const spanishWind: Readonly<Record<string, string>> = {
  clean: 'limpio',
  choppy: 'picado',
  blown_out: 'destrozado',
};

const spanishConfidence: Readonly<Record<string, string>> = {
  low: 'baja',
  medium: 'media',
  high: 'alta',
};

const namesById = new Map(
  [...readFileSync(join(projectRoot, 'data/spots/pa-pacific.yaml'), 'utf8').matchAll(
    /^\s+- spot_id: ([^\n]+)\n\s+name: ([^\n]+)$/gm,
  )].map((match) => [
    match[1]!.trim(),
    match[2]!.trim().replace(/^"(.*)"$/, '$1'),
  ]),
);

export function displayNameOf(spotId: string): string {
  const name = namesById.get(spotId);
  assert.ok(name !== undefined, `test fixture error: ${spotId} has no source-owned display name`);
  return name;
}

export function credentialFreeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

export function copyProjectForSurface(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-paste-01-'));
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

export function assertIntactCopy(root: string): void {
  const installedBytes = readFileSync(join(projectRoot, 'data/published-surface.json'));
  const copiedBytes = readFileSync(join(root, 'data/published-surface.json'));
  assert.deepEqual(
    copiedBytes,
    installedBytes,
    'test fixture error: the installed public input changed while creating its isolated copy',
  );
}

/**
 * The single owner of the absolute host is `site` in astro.config.mjs. The
 * test derives every expected hostname from the configuration and never
 * hardcodes one (feature-delta Done row 3, HANDOFF section 10).
 */
export function configuredSite(root: string): string {
  const source = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
  const site = source.match(/\bsite:\s*'([^']+)'/)?.[1];
  assert.ok(site !== undefined && site !== '', 'astro.config.mjs declares no site: the absolute-host owner is missing');
  return site.replace(/\/$/, '');
}

export function pointCopyAtSite(root: string, site: string): void {
  const path = join(root, 'astro.config.mjs');
  const source = readFileSync(path, 'utf8');
  assert.match(source, /\bsite:\s*'[^']*'/, 'test fixture error: astro.config.mjs has no site line to repoint');
  writeFileSync(path, source.replace(/\bsite:\s*'[^']*'/, `site: '${site}'`));
}

function readInstalledCopySurface(root: string): SurfaceUpdate {
  const parsed = JSON.parse(readFileSync(join(root, 'data/published-surface.json'), 'utf8')) as StaticSurfaceFile;
  return parsed.current;
}

/**
 * Promote the ranked spot with the longest display name to today's first
 * place by swapping spot identities only, in BOTH published copies of today,
 * exactly the slice-04 mutation pattern. Scores and structured fields keep
 * their positions, so the surface stays a coherent ranking.
 */
export function promoteLongestNameSpot(root: string): void {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as StaticSurfaceFile;
  const today = surface.current.days[0];
  assert.ok(today !== undefined && today.spots.length > 0, 'test fixture error: the published surface needs a ranked today');
  const longest = [...today.spots]
    .map((call) => ({ spotId: call.spot_id, name: displayNameOf(call.spot_id) }))
    .sort((a, b) => b.name.length - a.name.length)[0]!;
  for (const rows of [surface.current.calls, today.spots]) {
    const top = rows[0];
    const owned = rows.find((call) => call.spot_id === longest.spotId);
    assert.ok(top !== undefined && owned !== undefined, 'test fixture error: the ranking lost rows while promoting the longest name');
    if (top === owned) continue;
    const originalTop = top.spot_id;
    top.spot_id = owned.spot_id;
    owned.spot_id = originalTop;
  }
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
}

/**
 * R4 oracle input: the five share fields must be populated for the shared
 * spot, and the two published copies of today must agree (HANDOFF section 10
 * recorded 19 of 20 calls shipping without them while every gate stayed
 * green; this makes the check executable, never assumed).
 */
export function shareFieldFindings(root: string): string[] {
  const current = readInstalledCopySurface(root);
  const findings: string[] = [];
  const today = current.days[0];
  if (today === undefined || today.spots.length === 0) {
    return ['la superficie publicada no trae el día de hoy'];
  }
  const top = today.spots[0]!;
  for (const field of ['score_q', 'size_band', 'size_range_m', 'wind_state', 'conf_level'] as const) {
    if (top[field] === undefined || top[field] === null) {
      findings.push(`el mejor spot ${top.spot_id} llega sin ${field}`);
    }
  }
  const flatTop = current.calls[0];
  if (flatTop === undefined) {
    findings.push('la lista compacta de hoy está vacía');
  } else {
    try {
      assert.deepEqual(flatTop, top);
    } catch {
      findings.push('las dos copias publicadas de hoy no cuentan la misma historia para el mejor spot');
    }
  }
  return findings;
}

export type ExpectedShare = {
  readonly spotId: string;
  readonly spotName: string;
  readonly score: number;
  readonly sizeEs: string;
  readonly windEs: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly confidenceEs: string;
  readonly surfDayOfMonth: number;
  readonly buildStamp: string;
  readonly site: string;
};

export function expectedShare(root: string): ExpectedShare {
  const current = readInstalledCopySurface(root);
  const top = current.days[0]?.spots[0];
  assert.ok(top !== undefined, 'la superficie publicada no trae un mejor spot para hoy');
  const { size_band, wind_state, best_window, conf_level } = top;
  assert.ok(
    size_band !== undefined && wind_state !== undefined && best_window !== undefined && conf_level !== undefined,
    `el mejor spot ${top.spot_id} llega sin los campos estructurados del llamado (HANDOFF seccion 10)`,
  );
  const sizeEs = spanishSizeBand[size_band];
  const windEs = spanishWind[wind_state];
  const confidenceEs = spanishConfidence[conf_level];
  assert.ok(
    sizeEs !== undefined && windEs !== undefined && confidenceEs !== undefined,
    `vocabulario sin traducción canónica para ${size_band}/${wind_state}/${conf_level}`,
  );
  const published = new Date(current.published_at);
  assert.ok(!Number.isNaN(published.getTime()), 'published_at ilegible en la superficie publicada');
  const stampDate = current.published_at.slice(0, 10);
  const stampHour = String(published.getUTCHours()).padStart(2, '0');
  return {
    spotId: top.spot_id,
    spotName: displayNameOf(top.spot_id),
    score: top.score_q,
    sizeEs,
    windEs,
    windowStart: best_window.start,
    windowEnd: best_window.end,
    confidenceEs,
    surfDayOfMonth: Number(current.surf_date.slice(8, 10)),
    // P1 header contract: build_id is `b_<YYYY-MM-DDTHH>Z`; the published
    // surface's stamp is its published_at build hour (src/pipeline/build.ts).
    buildStamp: `b_${stampDate}T${stampHour}Z`,
    site: configuredSite(root),
  };
}

export type UiGateResult = { readonly status: number | null; readonly output: string };

function buildSurface(root: string): UiGateResult {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`paste-the-call surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
  const gate = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return { status: gate.status, output: `${gate.stdout}${gate.stderr}` };
}

/**
 * Same measurement semantics as the production page-weight gate
 * (scripts/page-weight-core.mjs): gzip the emitted document at the default
 * level; KB means 1024 B, so the home ceiling is 14336 B.
 */
export function homeDocumentGzBytes(root: string): number {
  return gzipSync(readFileSync(join(root, 'dist/index.html'))).length;
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
      server.close((error) => error === undefined ? resolve(address.port) : reject(error));
    });
  });
}

async function waitForPreview(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`paste-the-call preview exited before the behavior oracle with status ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`preview returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`paste-the-call preview never became reachable: ${String(lastError)}`);
}

export type HomeOptions = {
  readonly width: number;
  readonly theme: string;
  readonly motion: string;
  readonly javaScript: boolean;
};

export type OpenHome = {
  readonly url: string;
  readonly preview: ChildProcess;
  readonly browser: Browser;
  readonly page: Page;
  readonly uiGate: UiGateResult;
};

export async function newHomePage(browser: Browser, url: string, options: HomeOptions): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: 844 },
    javaScriptEnabled: options.javaScript,
  });
  const page = await context.newPage();
  await page.emulateMedia({
    colorScheme: options.theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: options.motion === 'reducido' ? 'reduce' : 'no-preference',
  });
  // 60 s: the first navigation of a run pays Chromium and tsx cold starts on
  // top of the preview server; the Playwright default of 30 s has flaked here.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  return page;
}

export async function openBuiltHome(root: string, options: HomeOptions): Promise<OpenHome> {
  const uiGate = buildSurface(root);
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const vite = join(projectRoot, 'node_modules/.bin/vite');
  const preview = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  let browser: Browser | null = null;
  try {
    await waitForPreview(url, preview);
    browser = await chromium.launch({ headless: true });
    const page = await newHomePage(browser, url, options);
    return { url, preview, browser, page, uiGate };
  } catch (error) {
    // A setup failure must not strand a preview server or a browser: the
    // After hook only sees a fully opened home.
    await browser?.close().catch(() => undefined);
    if (preview.exitCode === null) preview.kill('SIGTERM');
    throw error;
  }
}

export async function disposeHome(home: OpenHome | undefined): Promise<void> {
  if (home === undefined) return;
  await home.browser.close().catch(() => undefined);
  if (home.preview.exitCode === null) home.preview.kill('SIGTERM');
}

export function disposeRoot(root: string | undefined): void {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
}

export type ShareActionObservation = {
  readonly href: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
};

/**
 * The one-tap WhatsApp action on the home top card. Identified only through
 * user-facing observables: an anchor inside the top card whose destination is
 * the number-less WhatsApp carrier or whose visible/accessible name says
 * WhatsApp. Works identically with page JavaScript disabled.
 *
 * The top card itself is asserted first: a blank or unrendered page must fail
 * as a surface-not-reached test problem (BROKEN), never masquerade as the
 * missing-action behavior RED.
 */
export async function whatsappActionsInTopCard(page: Page): Promise<ShareActionObservation[]> {
  const observed = await page.evaluate(() => {
    const card = document.querySelector('ol.ranked > li:first-child');
    if (card === null) return { cardPresent: false, actions: [] as { href: string; label: string; width: number; height: number }[] };
    const actions = [...card.querySelectorAll('a')]
      .filter((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        const label = `${anchor.textContent ?? ''} ${anchor.getAttribute('aria-label') ?? ''} ${anchor.getAttribute('title') ?? ''}`;
        return href.startsWith('https://wa.me/') || /whatsapp/i.test(label);
      })
      .map((anchor) => {
        const rect = anchor.getBoundingClientRect();
        return {
          href: anchor.href,
          label: (anchor.getAttribute('aria-label') ?? anchor.textContent ?? '').trim(),
          width: rect.width,
          height: rect.height,
        };
      });
    return { cardPresent: true, actions };
  });
  assert.ok(
    observed.cardPresent,
    'superficie no alcanzada: la home construida no muestra su tarjeta grande de primer lugar; esto es un problema de test o de build, no un RED de comportamiento',
  );
  return observed.actions;
}

/**
 * Decode the prewritten message carried by the number-less anchor
 * (`https://wa.me/?text=`, application-architecture.md section 13; the live
 * branch of the R5 check recorded in this feature's red-classification).
 */
export function prewrittenMessage(action: ShareActionObservation): string {
  const parsed = (() => {
    try {
      return new URL(action.href);
    } catch {
      return null;
    }
  })();
  assert.ok(parsed !== null, `la acción de WhatsApp no lleva una dirección válida: "${action.href}"`);
  const findings: string[] = [];
  if (parsed.protocol !== 'https:') findings.push('el enlace de la acción no es https');
  if (parsed.host !== 'wa.me') findings.push(`el enlace apunta a ${parsed.host}, no al portador sin número wa.me`);
  const text = parsed.searchParams.get('text');
  if (text === null || text.trim() === '') findings.push('el enlace no lleva el mensaje ya escrito');
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: un toque debe abrir WhatsApp con el llamado ya escrito y dejar elegir el chat, sin número fijo. HOW: un ancla https://wa.me/?text= con el mensaje completo urlencoded.`,
  );
  return (text ?? '').trim();
}

/** The 5-line share template of application-architecture.md section 10, filled. */
export function messageContentFindings(message: string, expected: ExpectedShare): string[] {
  const lines = message.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const findings: string[] = [];
  if (lines.length !== 5) findings.push(`el mensaje tiene ${lines.length} líneas y la plantilla del llamado tiene 5`);
  const [dateLine, bestLine, conditionsLine, confidenceLine] = lines;
  const lower = (value: string): string => value.toLocaleLowerCase('es-PA');
  if (dateLine === undefined || !/^SURF\s+\S/.test(dateLine)) {
    findings.push('la primera línea no arranca con SURF y la fecha');
  } else if (!new RegExp(`\\b0?${expected.surfDayOfMonth}\\b`).test(dateLine)) {
    findings.push(`la fecha del mensaje no nombra el día ${expected.surfDayOfMonth} de la mañana publicada`);
  }
  if (bestLine === undefined || !/^Mejor:\s+\S/.test(bestLine)) {
    findings.push('la segunda línea no arranca con Mejor: y el spot');
  } else {
    if (!lower(bestLine).includes(lower(expected.spotName))) findings.push(`el mensaje no nombra el mejor spot ${expected.spotName}`);
    if (!new RegExp(`\\b${expected.score}\\b`).test(bestLine)) findings.push(`el mensaje no trae el puntaje ${expected.score} tal cual`);
  }
  if (conditionsLine === undefined) {
    findings.push('falta la línea del tamaño, el viento y la ventana');
  } else {
    if (!lower(conditionsLine).includes(lower(expected.sizeEs))) findings.push(`el mensaje no dice el tamaño con "${expected.sizeEs}"`);
    if (!lower(conditionsLine).includes(lower(expected.windEs))) findings.push(`el mensaje no nombra el viento "${expected.windEs}"`);
    if (!conditionsLine.includes(expected.windowStart) || !conditionsLine.includes(expected.windowEnd)) {
      findings.push(`el mensaje no trae la ventana de ${expected.windowStart} a ${expected.windowEnd}`);
    }
  }
  if (confidenceLine === undefined || !/^Confianza\s+\S/.test(confidenceLine)) {
    findings.push('la cuarta línea no arranca con Confianza');
  } else if (!lower(confidenceLine).includes(lower(expected.confidenceEs))) {
    findings.push(`la confianza del mensaje no es "${expected.confidenceEs}"`);
  }
  return findings;
}

/** The `{url}?b={build_id}` line: absolute, from the configured site, stamped. */
export function messageLinkFindings(message: string, expected: ExpectedShare): string[] {
  const findings: string[] = [];
  const lines = message.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const last = lines.at(-1);
  if (last === undefined || !/^https:\/\//.test(last)) {
    findings.push('el mensaje no termina con una dirección completa que empiece con https://');
    return findings;
  }
  const url = (() => {
    try {
      return new URL(last);
    } catch {
      return null;
    }
  })();
  if (url === null) {
    findings.push(`la última línea no es una dirección válida: "${last}"`);
    return findings;
  }
  if (/^(?:localhost|127\.)/.test(url.hostname)) {
    findings.push('la dirección apunta a localhost y no al sitio público configurado');
  }
  if (url.origin !== new URL(expected.site).origin) {
    findings.push(`la dirección no deriva del sitio configurado: dice ${url.origin} y la configuración dice ${new URL(expected.site).origin}`);
  }
  const stamp = url.searchParams.get('b');
  if (stamp === null || stamp === '') {
    findings.push('la dirección no lleva el sello ?b= del build');
  } else {
    if (!/^b_\d{4}-\d{2}-\d{2}T\d{2}Z$/.test(stamp)) {
      findings.push(`el sello del build "${stamp}" no tiene la forma b_AAAA-MM-DDTHHZ del contrato`);
    }
    if (stamp !== expected.buildStamp) {
      findings.push(`el sello "${stamp}" no es el de la mañana publicada (${expected.buildStamp})`);
    }
    if (!last.endsWith(`?b=${stamp}`)) {
      findings.push('la dirección no termina en su sello ?b=');
    }
  }
  return findings;
}

/** Zero technical text on the Spanish paste surface (feature R28, slice-01 half). */
export function messagePurityFindings(message: string): string[] {
  const findings: string[] = [];
  if (/[{}[\]]/.test(message)) findings.push('el mensaje conserva llaves o corchetes de plantilla');
  if (/\b(?:ncep|gfs|dwd|ecmwf)(?:[_-]?[a-z0-9]+)*\b/i.test(message)) findings.push('el mensaje nombra modelos meteorológicos');
  if (/\b(?:score_q|size_band|size_range_m|wind_state|best_window|conf_level|build_id|build_kind|spot_id|call_es|json|undefined|placeholder|lorem)\b/i.test(message)) {
    findings.push('el mensaje expone campos internos o texto de relleno');
  }
  if (/\bNaN\b|\bnull\b/.test(message)) findings.push('el mensaje imprime valores vacíos crudos');
  if (/\bBest:|\bconfidence\b|\bUpdated\b/.test(message)) findings.push('el mensaje cae al inglés');
  return findings;
}

export function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: el surfista avisa al grupo con un solo toque y el mensaje debe contar exactamente la verdad de la tarjeta. HOW: ${how}`,
  );
}
