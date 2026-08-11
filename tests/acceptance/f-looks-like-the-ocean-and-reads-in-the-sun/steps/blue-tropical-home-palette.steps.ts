// Slice-01 acceptance steps: the token-only repaint to the blue-tropical
// palette (adr-blue-tropical-glass-palette.md). Every scenario builds a real
// Astro surface and measures the rendered document through Chromium -- never
// a unit test on tokens.css in isolation. Two exceptions run against the
// real, git-tracked tokens.css on purpose (the falsifiability scenario),
// everything else runs against an isolated tmpdir copy so the real dist/ and
// working tree are never touched by a normal assertion pass.
//
// Colour parsing keeps the alpha channel deliberately: an earlier bug in the
// sibling contrast oracle (tests/acceptance/daily-call-with-permanent-receipts)
// dropped alpha and turned every transparent background into opaque black,
// producing three different elements reporting the same impossible 1.18:1.
// parseColor here always returns [r, g, b, a] and compositeOverBase is used
// whenever a<1, even though every colour this slice measures happens to be
// fully opaque today.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectRoot = process.cwd();
const TOKENS_RELATIVE = 'src/styles/tokens.css';
const TOKENS_PATH = join(projectRoot, TOKENS_RELATIVE);

// ---------- real data: the longest published spot name ----------
// Computed from the real seed + the real published surface, never hardcoded,
// so a future data change cannot silently make this constant stale.
type PublishedCall = { spot_id: string; score_q: number };
type PublishedSurface = { current: { calls: PublishedCall[] } };

const namesById = new Map(
  [...readFileSync(join(projectRoot, 'data/spots/pa-pacific.yaml'), 'utf8').matchAll(
    /^\s+- spot_id: ([^\n]+)\n\s+name: ([^\n]+)$/gm,
  )].map((match) => [
    match[1]!.trim(),
    match[2]!.trim().replace(/^"(.*)"$/, '$1'),
  ]),
);

function realPublishedSurface(): PublishedSurface {
  return JSON.parse(readFileSync(join(projectRoot, 'data/published-surface.json'), 'utf8')) as PublishedSurface;
}

const publishedCalls = realPublishedSurface().current.calls;
const LONGEST_NAME = publishedCalls
  .map((c) => namesById.get(c.spot_id) ?? '')
  .reduce((longest, name) => (name.length > longest.length ? name : longest), '');
assert.ok(LONGEST_NAME.length > 0, 'test fixture error: could not derive the longest published spot name');

// ---------- world (no custom World class: WeakMap-keyed state, matching
// tests/acceptance/f-bill-stays-zero-and-stays-up's convention, so this
// feature never contends with daily-call-with-permanent-receipts' own
// setWorldConstructor(PipelineWorld)) ----------
type PaletteWorld = object;

type OpenedSurface = {
  readonly root: string;
  readonly cleanupRoot: string | null; // set only for tmpdir copies
  readonly preview: ChildProcess;
  readonly browser: Browser;
  readonly page: Page;
};

const openedSurfaces = new WeakMap<PaletteWorld, OpenedSurface>();
const uiGateResults = new WeakMap<PaletteWorld, { status: number | null; output: string }>();
const tokensBackups = new WeakMap<PaletteWorld, string>();
const gitStatusBaselines = new WeakMap<PaletteWorld, string>();

/** Safety net: if a scenario mutates the REAL tokens.css and dies before its
 * own revert step runs, this After hook restores it regardless of outcome. */
let pendingRealMutation: string | null = null;

function credentialFreeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

/** Isolated tmpdir copy of the real project, optionally mutated before the
 * caller builds it. Never touches the real dist/ or working tree. */
function prepareIsolatedRoot(mutate?: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-01-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    copyFileSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  mutate?.(root);
  return root;
}

function buildDist(root: string): { status: number | null; output: string } {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return { status: build.status, output: `${build.stdout}${build.stderr}` };
}

function runUiQualityGate(root: string): { status: number | null; output: string } {
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

async function waitForPreview(url: string, proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`slice-01 preview exited before the behaviour oracle with status ${proc.exitCode}`);
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
  throw new Error(`slice-01 preview never became reachable: ${String(lastError)}`);
}

/** Builds `root` for real, serves the real dist/ over HTTP, and opens it in
 * a real Chromium page at the given viewport, theme and motion preference.
 * Stores the opened surface on the world so every Then step can reuse it. */
async function openSurface(
  world: PaletteWorld,
  root: string,
  cleanupRoot: string | null,
  width: number,
  theme: 'claro' | 'oscuro',
  movement: 'normal' | 'reducido' = 'normal',
): Promise<{ buildStatus: number | null; buildOutput: string }> {
  const build = buildDist(root);
  if (build.status !== 0) {
    throw new Error(`slice-01 surface setup failed before the behaviour oracle:\n${build.output}`);
  }
  uiGateResults.set(world, runUiQualityGate(root));
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const vite = join(projectRoot, 'node_modules/.bin/vite');
  const preview = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  await waitForPreview(url, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  openedSurfaces.set(world, { root, cleanupRoot, preview, browser, page });
  return { buildStatus: build.status, buildOutput: build.output };
}

function requiredSurface(world: PaletteWorld): OpenedSurface {
  const surface = openedSurfaces.get(world);
  assert.ok(surface, 'test fixture error: no surface has been opened yet');
  return surface;
}

function requiredPage(world: PaletteWorld): Page {
  return requiredSurface(world).page;
}

// ---------- browser-context colour math (self-contained per eval; alpha
// kept throughout, gradient sampled by real interpolation, never just the
// two declared stop hexes) ----------
type ContrastAudit = {
  readonly findings: string[];
  readonly stopHexes: string[];
  readonly elementCount: number;
};

async function contrastFindings(page: Page): Promise<ContrastAudit> {
  return page.evaluate(`(() => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) return [0, 0, 0, 1];
      const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts.length > 3 ? parts[3] ?? 1 : 1];
    };
    const compositeOverBase = ([r, g, b, a], base) => (a >= 1
      ? [r, g, b]
      : [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)]);
    const luminance = ([r, g, b]) => {
      const c = (v) => { const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
    };
    const contrast = (fg, bg) => {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const parseGradientStops = (image) => [...image.matchAll(/rgba?\\([^)]+\\)\\s*([\\d.]+)%/g)].map((m) => ({
      pct: parseFloat(m[1]),
      rgba: parseColor(m[0]),
    })).sort((a, b) => a.pct - b.pct);
    const sampleGradient = (stops, steps) => {
      const out = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * 100;
        let lo = stops[0];
        let hi = stops[stops.length - 1];
        for (let s = 0; s < stops.length - 1; s += 1) {
          if (t >= stops[s].pct && t <= stops[s + 1].pct) { lo = stops[s]; hi = stops[s + 1]; break; }
        }
        const span = hi.pct - lo.pct;
        const f = span === 0 ? 0 : (t - lo.pct) / span;
        const rgba = [0, 1, 2, 3].map((c) => lo.rgba[c] + (hi.rgba[c] - lo.rgba[c]) * f);
        out.push(rgba);
      }
      return out;
    };

    const hero = document.querySelector('ol.ranked > li:first-child');
    if (!hero) return { findings: ['no se encontró la tarjeta destacada ol.ranked > li:first-child'], stopHexes: [], elementCount: 0 };
    const bodyBgRgb = parseColor(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    const backgroundImage = getComputedStyle(hero).backgroundImage;
    const stops = parseGradientStops(backgroundImage);
    if (stops.length < 2) {
      return { findings: ['el fondo de la tarjeta destacada no es un degradado de varios puntos: ' + backgroundImage], stopHexes: [], elementCount: 0 };
    }
    const samples = sampleGradient(stops, 100).map((rgba) => compositeOverBase(rgba, bodyBgRgb));
    const stopHexes = stops.map((s) => rgbToHex(compositeOverBase(s.rgba, bodyBgRgb)));

    // The whole ranked list, not only the hero: "cada palabra del cuerpo,
    // en la tarjeta y en la lista, sigue leyéndose con margen de sobra"
    // (charter). Hero text sits on the sampled gradient (worst point wins);
    // list-row text sits on the flat page background (rows declare no
    // background of their own -- confirmed in components.css, they inherit
    // document.body's --bg). Row reason text (<p>, secondary/--ink-2 role)
    // is held to the ADR's own approved secondary-text floor (its table
    // accepts ~6.92 for that pairing, i.e. AA, not AAA) rather than the
    // stricter 7:1 body floor that only the hero's primary call text and
    // every --ink-toned element carry.
    const paintsOwnText = (element) => [...element.childNodes]
      .some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim().length > 0);
    const elements = [...document.querySelectorAll('ol.ranked > li a, ol.ranked > li strong, ol.ranked > li p, ol.ranked > li details.confidence > summary, ol.ranked > li details.confidence > div')]
      .filter((el) => paintsOwnText(el));
    const opaqueBackdropOf = (element) => {
      let node = element;
      while (node !== null && node !== hero) {
        const own = parseColor(getComputedStyle(node).backgroundColor);
        if ((own[3] ?? 0) >= 1) return own.slice(0, 3);
        node = node.parentElement;
      }
      return null;
    };
    const findings = [];
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      const isHero = el.closest('li:first-child') !== null;
      const isRowReason = tag === 'p' && !isHero;
      const role = tag === 'p' && isHero ? 'cuerpo' : (isRowReason ? 'fila-secundario' : 'texto');
      const floor = tag === 'p' && isHero ? 7.0 : 4.5;
      const fgRgba = parseColor(getComputedStyle(el).color);
      const fg = compositeOverBase(fgRgba, bodyBgRgb);
      let worstRatio;
      let worstBgHex;
      if (isHero) {
        const ownBackdrop = opaqueBackdropOf(el);
        const backdrops = ownBackdrop === null ? samples : [ownBackdrop];
        worstRatio = Infinity;
        worstBgHex = '';
        for (const bg of backdrops) {
          const ratio = contrast(fg, bg);
          if (ratio < worstRatio) { worstRatio = ratio; worstBgHex = rgbToHex(bg); }
        }
      } else {
        worstRatio = contrast(fg, bodyBgRgb);
        worstBgHex = rgbToHex(bodyBgRgb);
      }
      if (worstRatio < floor) {
        findings.push(
          tag + ' (' + role + ') queda en ' + worstRatio.toFixed(2) + ':1 contra ' + worstBgHex
          + ', color de texto ' + rgbToHex(fg) + ', piso requerido ' + floor.toFixed(1) + ':1',
        );
      }
      const requiresHeroSecondaryInk = isHero && ['p', 'summary', 'div'].includes(tag);
      if (requiresHeroSecondaryInk && rgbToHex(fg).toLowerCase() !== '#e8f7fa') {
        findings.push(tag + ' (' + role + ') usa ' + rgbToHex(fg) + ' en vez de la tinta secundaria hero #e8f7fa');
      }
    }
    return { findings, stopHexes, elementCount: elements.length };
  })()`) as unknown as ContrastAudit;
}

type HeroIdentity = {
  readonly isGradient: boolean;
  readonly maxStopLuminance: number;
  readonly stopHexes: string[];
  readonly stopLuminances: number[];
  readonly isDark: boolean;
};

async function heroIdentity(page: Page): Promise<HeroIdentity> {
  return page.evaluate(`(() => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) return [0, 0, 0, 1];
      const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts.length > 3 ? parts[3] ?? 1 : 1];
    };
    const luminance = ([r, g, b]) => {
      const c = (v) => { const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
    };
    const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const hero = document.querySelector('ol.ranked > li:first-child');
    if (!hero) return { isGradient: false, maxStopLuminance: 1, stopHexes: [], stopLuminances: [], isDark };
    const image = getComputedStyle(hero).backgroundImage;
    const stops = [...image.matchAll(/rgba?\\([^)]+\\)\\s*([\\d.]+)%/g)].map((m) => parseColor(m[0]));
    if (stops.length < 2) return { isGradient: false, maxStopLuminance: 1, stopHexes: [], stopLuminances: [], isDark };
    const lums = stops.map((s) => luminance(s));
    return {
      isGradient: true,
      maxStopLuminance: Math.max(...lums),
      stopHexes: stops.map(rgbToHex),
      stopLuminances: lums,
      isDark,
    };
  })()`) as unknown as HeroIdentity;
}

// The ADR's own floor, computed once at module load from its literal hex
// values (day #0D5866, dark's own analogous floor #0C5866 -- tokens.css's
// own comment establishes this as dark theme's real lightest/floor value).
// Per-theme, never a single bare threshold: day's real 100%-stop (#10707F,
// luminance 0.1323) and the historically-rejected #0E5E70 (0.0927) must both
// exceed the day floor (0.0802) and fail; dark's real lightest stop
// (#0C5866, 0.0802) sits AT its own floor and must pass. The two floors
// differ by under 0.0001, so the epsilon has to be wide enough to clear
// floating rounding yet far short of the ~0.05 gap to either violating
// value -- 0.002 clears both bars with margin to spare.
function referenceLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = rgb as [number, number, number];
  const channel = (v: number): number => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
const DAY_STOP_FLOOR_LUM = referenceLuminance('#0d5866');
const DARK_STOP_FLOOR_LUM = referenceLuminance('#0c5866');
const STOP_FLOOR_EPSILON = 0.002;

// Theme-agnostic on purpose: "rows stay light" cannot mean literal high
// luminance in dark theme (the whole theme is dark by definition). What the
// ADR and charter actually forbid is the band leaking onto the page itself,
// so this checks (a) the gradient never paints document.body, and (b) the
// rows' real background is not the same colour as the hero's own darkest
// stop -- the exact "whole page as dark as the deepest water" mistake the
// charter's negative observation names, in either theme.
type BandVsPage = {
  readonly bodyHasGradient: boolean;
  readonly rowHex: string;
  readonly darkestStopHex: string;
  readonly distanceToDarkestStop: number;
};

async function bandVsPage(page: Page): Promise<BandVsPage> {
  return page.evaluate(`(() => {
    const parseColor = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) return [0, 0, 0, 1];
      const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts.length > 3 ? parts[3] ?? 1 : 1];
    };
    const luminance = ([r, g, b]) => {
      const c = (v) => { const n = v / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
    };
    const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const hero = document.querySelector('ol.ranked > li:first-child');
    const image = hero ? getComputedStyle(hero).backgroundImage : '';
    const stops = [...image.matchAll(/rgba?\\([^)]+\\)\\s*([\\d.]+)%/g)].map((m) => parseColor(m[0]));
    let darkest = stops[0] ?? [0, 0, 0, 1];
    for (const s of stops) { if (luminance(s) < luminance(darkest)) darkest = s; }
    const rowRgb = parseColor(getComputedStyle(document.body).backgroundColor);
    const distance = Math.sqrt(
      (rowRgb[0] - darkest[0]) ** 2 + (rowRgb[1] - darkest[1]) ** 2 + (rowRgb[2] - darkest[2]) ** 2,
    );
    const bodyImage = getComputedStyle(document.body).backgroundImage;
    return {
      bodyHasGradient: /rgba?\\(/.test(bodyImage),
      rowHex: rgbToHex(rowRgb),
      darkestStopHex: rgbToHex(darkest),
      distanceToDarkestStop: distance,
    };
  })()`) as unknown as BandVsPage;
}

async function bandVsPageFindings(page: Page): Promise<string[]> {
  const data = await bandVsPage(page);
  const findings: string[] = [];
  if (data.bodyHasGradient) {
    findings.push('el fondo de la página completa (document.body) pinta un degradado; el degradado debe vivir solo detrás de la tarjeta destacada');
  }
  // A tolerance wide enough to clear real browser rounding, tight enough
  // that only a near-exact colour match (the "whole page as dark as the
  // hero" mistake) trips it: a legitimate dark-theme page background sits
  // well clear of this by design (measured ~13 units on the real palette).
  if (data.distanceToDarkestStop < 6) {
    findings.push(`el fondo real de las filas (${data.rowHex}) es prácticamente el mismo color que el punto más oscuro de la tarjeta destacada (${data.darkestStopHex}), a distancia ${data.distanceToDarkestStop.toFixed(1)}`);
  }
  return findings;
}

type LayoutAudit = { readonly overflowX: boolean; readonly wrappedLinks: string[]; readonly longestNamePresent: boolean };

// `ol.ranked li > a` is `display: inline-flex` with no `white-space:
// nowrap`, so a name too wide for its column WRAPS to a second line rather
// than clipping or overflowing -- confirmed empirically: scrollWidth ===
// clientWidth even for the longest published name, so that comparison can
// never fire. The charter names the wrap itself as the failure mode
// ("sin cortarse ni empujar la fila a un segundo renglón desprolijo"), so
// this counts line boxes via Range.getClientRects() on the text node
// (verified to report >1 once the viewport is narrow enough to force a
// wrap, and exactly 1 for every real row at 320px today).
async function layoutFindings(page: Page, longestName: string): Promise<LayoutAudit> {
  return page.evaluate(([name]: [string]) => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth > doc.clientWidth;
    const links = [...document.querySelectorAll<HTMLAnchorElement>('ol.ranked > li:not(:first-child) > a')];
    const wrappedLinks = links
      .filter((a) => {
        const textNode = [...a.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        if (!textNode) return false;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return range.getClientRects().length > 1;
      })
      .map((a) => (a.textContent ?? '').trim());
    const longestNamePresent = links.some((a) => (a.textContent ?? '').trim() === name);
    return { overflowX, wrappedLinks, longestNamePresent };
  }, [longestName] as [string]);
}

type MotionAudit = { readonly moving: string[] };

async function motionFindings(page: Page): Promise<MotionAudit> {
  return page.evaluate(() => {
    const scope = [...document.querySelectorAll('ol.ranked, ol.ranked *')];
    const moving = scope
      .filter((el) => {
        const style = getComputedStyle(el);
        const hasTransition = style.transitionDuration.split(',').some((d) => Number.parseFloat(d) > 0);
        const hasAnimation = style.animationName.split(',').some((n) => n.trim() !== '' && n.trim() !== 'none');
        return hasTransition || hasAnimation;
      })
      .map((el) => el.tagName.toLowerCase() + (el.className ? `.${String(el.className)}` : ''));
    return { moving };
  });
}

type RenderedRow = { readonly href: string; readonly score: number };

async function renderedRows(page: Page): Promise<RenderedRow[]> {
  return page.evaluate(() => [...document.querySelectorAll('ol.ranked > li')].map((li) => {
    const a = li.querySelector('a');
    const strong = li.querySelector('strong');
    return { href: a?.getAttribute('href') ?? '', score: Number((strong?.textContent ?? '').trim()) };
  }));
}

// ---------- Given ----------

Given('la superficie publicada real, sin modificar', function (this: PaletteWorld) {
  const root = prepareIsolatedRoot();
  openedSurfaces.set(this, {
    root,
    cleanupRoot: root,
    // placeholders replaced once openSurface() runs in the When step
    preview: null as unknown as ChildProcess,
    browser: null as unknown as Browser,
    page: null as unknown as Page,
  });
});

Given('una copia aislada de la portada cuyo fondo de página se oscurece igual que la tarjeta destacada', function (this: PaletteWorld) {
  const root = prepareIsolatedRoot((copyRoot) => {
    const tokensCopyPath = join(copyRoot, TOKENS_RELATIVE);
    const original = readFileSync(tokensCopyPath, 'utf8');
    // The hero band's own darkest declared stop (day theme, 0%): making the
    // page background and card surfaces match it is exactly the mistake the
    // ADR refuses -- "saturating the whole page would be worse, not better".
    const mutated = original
      .replace('--bg: #f2f8fa;', '--bg: #0a3a46;')
      .replace('--surface: #ffffff;', '--surface: #0a3a46;')
      .replace('--sunken: #e3eff3;', '--sunken: #0a3a46;');
    assert.notEqual(mutated, original, 'test fixture error: could not find the day-theme --bg/--surface/--sunken declarations to mutate');
    writeFileSync(tokensCopyPath, mutated);
  });
  openedSurfaces.set(this, {
    root,
    cleanupRoot: root,
    preview: null as unknown as ChildProcess,
    browser: null as unknown as Browser,
    page: null as unknown as Page,
  });
});

Given('una copia aislada cuyo archivo de componentes introduce un color fuera de los tokens con nombre', function (this: PaletteWorld) {
  const root = prepareIsolatedRoot((copyRoot) => {
    const componentsCopyPath = join(copyRoot, 'src/styles/components.css');
    const original = readFileSync(componentsCopyPath, 'utf8');
    // scripts/check-ui-quality.mjs's U7 check only fires above 4 DISTINCT
    // raw hex colours outside a token declaration (its own comment: noise
    // tolerance), so this needs five, not one, to trip the real gate.
    const leak = '\n.qa-raw-color-leak{color:#ff00aa;background:#123456;border-color:#abcdef;outline-color:#7f00ff;box-shadow:0 0 0 1px #00ffee;}\n';
    writeFileSync(componentsCopyPath, `${original}${leak}`);
  });
  openedSurfaces.set(this, {
    root,
    cleanupRoot: root,
    preview: null as unknown as ChildProcess,
    browser: null as unknown as Browser,
    page: null as unknown as Page,
  });
});

Given('una copia aislada cuyo alcance de tokens de la tarjeta destacada vuelve a heredar la tinta pensada para fondos claros', function (this: PaletteWorld) {
  const root = prepareIsolatedRoot((copyRoot) => {
    const tokensCopyPath = join(copyRoot, TOKENS_RELATIVE);
    const original = readFileSync(tokensCopyPath, 'utf8');
    // Recreates the daylight defect without editing a component. The hero's
    // scope is part of the token surface: removing it makes the pre-existing
    // component rules resolve to page ink on deep water.
    const mutated = original
      .replace(/\n:root ol\.ranked li:first-child \{[\s\S]*?\n\}\n\n:root ol\.ranked li:first-child > p \{[\s\S]*?\n\}\n\n:root ol\.ranked li:first-child > details\.confidence > summary,[\s\S]*?\n\}\n/, '\n');
    assert.notEqual(mutated, original, 'test fixture error: no se encontró el alcance de tokens de la tarjeta para retirarlo');
    writeFileSync(tokensCopyPath, mutated);
  });
  openedSurfaces.set(this, {
    root,
    cleanupRoot: root,
    preview: null as unknown as ChildProcess,
    browser: null as unknown as Browser,
    page: null as unknown as Page,
  });
});

Given('el valor real de tokens.css en disco, capturado antes de tocarlo', function (this: PaletteWorld) {
  const original = readFileSync(TOKENS_PATH, 'utf8');
  tokensBackups.set(this, original);
  pendingRealMutation = original;
  const status = spawnSync('git', ['status', '--porcelain', '--', TOKENS_RELATIVE], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  gitStatusBaselines.set(this, status.stdout);
});

// ---------- When ----------

When('el surfista abre la portada a {int} px, con tema {string}', async function (this: PaletteWorld, width: number, tema: string) {
  const surface = requiredSurface(this);
  await openSurface(this, surface.root, surface.cleanupRoot, width, tema === 'oscuro' ? 'oscuro' : 'claro');
});

When(
  'el surfista abre la portada a {int} px, con tema {string} y movimiento {string}',
  async function (this: PaletteWorld, width: number, tema: string, movimiento: string) {
    const surface = requiredSurface(this);
    await openSurface(
      this,
      surface.root,
      surface.cleanupRoot,
      width,
      tema === 'oscuro' ? 'oscuro' : 'claro',
      movimiento === 'reducido' ? 'reducido' : 'normal',
    );
  },
);

When('esa copia se abre a {int} px, con tema {string}', async function (this: PaletteWorld, width: number, tema: string) {
  const surface = requiredSurface(this);
  await openSurface(this, surface.root, surface.cleanupRoot, width, tema === 'oscuro' ? 'oscuro' : 'claro');
});

When('esa copia se reconstruye', function (this: PaletteWorld) {
  const surface = requiredSurface(this);
  const build = buildDist(surface.root);
  uiGateResults.set(this, runUiQualityGate(surface.root));
  assert.ok(build.status !== null, 'test fixture error: the isolated build did not run');
});

When(
  'el punto más claro del degradado del tema oscuro se aclara a {string}, por debajo de su piso, y la portada se reconstruye',
  async function (this: PaletteWorld, hex: string) {
    const original = tokensBackups.get(this);
    assert.ok(original, 'test fixture error: no tokens.css backup captured; run the Given step first');
    const mutated = original.replace('#0c5866 100%', `${hex.toLowerCase()} 100%`);
    assert.notEqual(mutated, original, 'test fixture error: the dark-theme lightest gradient stop (#0c5866 100%) was not found to mutate');
    writeFileSync(TOKENS_PATH, mutated);
    // The isolated copy picks up the now-mutated real tokens.css; the build
    // and preview run entirely inside the tmpdir, so the real dist/ is
    // never touched even while the real source file carries the mutation.
    const root = prepareIsolatedRoot();
    openedSurfaces.set(this, {
      root,
      cleanupRoot: root,
      preview: null as unknown as ChildProcess,
      browser: null as unknown as Browser,
      page: null as unknown as Page,
    });
    await openSurface(this, root, root, 390, 'oscuro');
  },
);

When('el valor de tokens.css se revierte a su original', function (this: PaletteWorld) {
  const original = tokensBackups.get(this);
  assert.ok(original, 'test fixture error: no tokens.css backup to revert to');
  writeFileSync(TOKENS_PATH, original);
  pendingRealMutation = null;
});

// ---------- Then ----------

Then('el fondo de la tarjeta destacada es el degradado de agua tropical profundo del sistema de diseño, no la lista casi blanca de antes', async function (this: PaletteWorld) {
  const identity = await heroIdentity(requiredPage(this));
  assert.ok(identity.isGradient, `la tarjeta destacada no tiene un degradado de varios puntos: ${JSON.stringify(identity)}`);
  // The old near-white hero (#F7FAFC to #EAF1F5) sits around luminance
  // 0.88-0.93; the ADR's deep-water stops sit around 0.03-0.13. 0.20 is a
  // wide, unambiguous margin between the two, never a fine calibration.
  assert.ok(
    identity.maxStopLuminance < 0.2,
    `el punto más claro del degradado mide luminancia ${identity.maxStopLuminance.toFixed(3)} (esperado < 0.2, agua tropical profunda). Puntos: ${identity.stopHexes.join(', ')}`,
  );
  // The ADR's named floor, checked per rendered stop, not just the two
  // declared endpoints: "the gradient's lightest stop is #0D5866 or darker"
  // (day) / its own analogous #0C5866 floor (dark). #0E5E70 is the recorded
  // rejected value and must never pass; this also catches a stop lighter
  // than the ADR's own claim even when nobody touched tokens.css, which is
  // exactly what the real day-theme 100%-stop (#10707F) does today.
  const floorHex = identity.isDark ? '#0C5866' : '#0D5866';
  const floorLum = identity.isDark ? DARK_STOP_FLOOR_LUM : DAY_STOP_FLOOR_LUM;
  const tooLight = identity.stopHexes.filter((_, i) => identity.stopLuminances[i]! > floorLum + STOP_FLOOR_EPSILON);
  assert.deepEqual(
    tooLight,
    [],
    `punto(s) del degradado más claro(s) que el piso de la ADR ${floorHex} (luminancia ${floorLum.toFixed(4)}): ${tooLight.join(', ')}. Puntos completos: ${identity.stopHexes.join(', ')}`,
  );
});

Then('el fondo de las filas de la lista, debajo de la tarjeta destacada, se mantiene claro y distinto del fondo de la tarjeta', async function (this: PaletteWorld) {
  const findings = await bandVsPageFindings(requiredPage(this));
  assert.deepEqual(findings, [], `WHAT: ${findings.join('; ')}. WHY: colour behind veinte filas de texto pequeño cuesta legibilidad y no compra nada (ADR). HOW: la banda de agua profunda vive solo detrás de la tarjeta destacada.`);
});

Then('ningún color de la interfaz aparece fuera de los tokens con nombre', function (this: PaletteWorld) {
  const gate = uiGateResults.get(this);
  assert.ok(gate, 'test fixture error: no ui-quality gate result captured');
  assert.equal(gate.status, 0, `el gate de calidad de interfaz falló: ${gate.output}`);
});

Then('la portada publicada llega lista con su ranking, sin una espera, vacío o error inventado', async function (this: PaletteWorld) {
  const state = await requiredPage(this).evaluate(() => ({
    ready: document.readyState,
    rows: document.querySelectorAll('ol.ranked > li').length,
    busy: document.querySelectorAll('[aria-busy="true"]').length,
    visibleErrors: [...document.querySelectorAll('body *:not(script):not(style)')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(' ')
        .trim())
      .filter((text) => text.length > 0)
      .filter((text) => /\b(error|loading|cargando)\b/i.test(text)),
  }));
  assert.equal(state.ready, 'complete', `la portada no llegó lista: ${state.ready}`);
  assert.ok(state.rows > 0, 'la portada llegó vacía en vez de mostrar el ranking publicado');
  assert.equal(state.busy, 0, 'la portada declara una espera artificial después de publicar el ranking');
  assert.deepEqual(state.visibleErrors, [], `la portada visible muestra estado no diseñado: ${state.visibleErrors.join(' | ')}`);
});

Then('la comprobación de banda-no-página falla nombrando el fondo medido de las filas de la lista', async function (this: PaletteWorld) {
  const findings = await bandVsPageFindings(requiredPage(this));
  assert.ok(findings.length > 0, 'se esperaba que la comprobación de banda-no-página fallara con el fondo oscurecido, pero pasó');
  assert.ok(
    findings.some((f) => /#[0-9a-f]{6}/i.test(f)),
    `las fallas no nombran el fondo medido: ${findings.join(' | ')}`,
  );
});

Then('la comprobación de tokens falla nombrando el archivo y el color que no viene de un token', function (this: PaletteWorld) {
  const gate = uiGateResults.get(this);
  assert.ok(gate, 'test fixture error: no ui-quality gate result captured');
  assert.notEqual(gate.status, 0, `se esperaba que el gate de tokens fallara, pero pasó: ${gate.output}`);
  assert.match(gate.output, /U7/, `la salida del gate no nombra U7: ${gate.output}`);
  assert.match(gate.output, /colou?rs? (used )?outside the token system/i, `la salida del gate no nombra el color fuera de tokens: ${gate.output}`);
});

Then('cada texto de la tarjeta destacada se mide contra el fondo real muestreado del degradado, incluido su punto más claro interpolado', async function (this: PaletteWorld) {
  const audit = await contrastFindings(requiredPage(this));
  assert.ok(audit.elementCount > 0, 'no se encontró ningún texto dentro de la tarjeta destacada para medir');
  assert.ok(audit.stopHexes.length >= 2, `el degradado no tiene al menos dos puntos muestreables: ${JSON.stringify(audit)}`);
});

Then('el texto del cuerpo despeja 7 a 1, todo el texto despeja 4.5 a 1', async function (this: PaletteWorld) {
  const audit = await contrastFindings(requiredPage(this));
  assert.deepEqual(audit.findings, [], `WHAT: ${audit.findings.join('; ')}. WHY: el surfista lee esto al amanecer o al mediodía en pleno sol. HOW: medir cada texto contra el punto real muestreado del degradado que le da menos contraste, nunca contra blanco.`);
});

Then('una pareja que no despeja se nombra con su proporción exacta y sus dos valores hexadecimales, nunca redondeada', async function (this: PaletteWorld) {
  const audit = await contrastFindings(requiredPage(this));
  for (const finding of audit.findings) {
    assert.match(
      finding,
      /\d+\.\d{2}:1 contra #[0-9a-f]{6}.*color de texto #[0-9a-f]{6}/i,
      `la falla no nombra la proporción exacta y los dos valores hexadecimales: "${finding}"`,
    );
  }
});

Then('el texto del cuerpo de la tarjeta destacada no despeja 7 a 1 contra su fondo real, y la medición nombra el color y la proporción exactos', async function (this: PaletteWorld) {
  const audit = await contrastFindings(requiredPage(this));
  const bodyFindings = audit.findings.filter((f) => f.startsWith('p (cuerpo)'));
  assert.ok(
    bodyFindings.length > 0,
    `se esperaba que el texto de cuerpo de la tarjeta destacada fallara 7:1 en tema claro (el color hereda --ink, pensado para fondos claros, sobre el degradado oscuro), pero no hubo fallas: ${JSON.stringify(audit)}`,
  );
  assert.match(bodyFindings[0]!, /\d+\.\d{2}:1 contra #[0-9a-f]{6}/i, `la falla no nombra la proporción y el color exactos: "${bodyFindings[0]}"`);
});

Then('la medición de contraste en tema {string} falla nombrando la proporción y el valor exacto que no despeja', async function (this: PaletteWorld, _tema: string) {
  const audit = await contrastFindings(requiredPage(this));
  assert.ok(audit.findings.length > 0, `se esperaba que la medición fallara con el punto más claro aclarado por debajo de su piso, pero pasó: ${JSON.stringify(audit)}`);
  assert.ok(
    audit.findings.some((f) => f.toLowerCase().includes('0d5e6a')),
    `las fallas no nombran el valor mutado #0D5E6A: ${audit.findings.join(' | ')}`,
  );
});

Then('git diff confirma que tokens.css no deja ningún rastro del cambio', function (this: PaletteWorld) {
  const before = gitStatusBaselines.get(this);
  assert.ok(before !== undefined, 'test fixture error: no git status baseline captured before the mutation');
  const after = spawnSync('git', ['status', '--porcelain', '--', TOKENS_RELATIVE], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(
    after.stdout,
    before,
    `tokens.css dejó rastro tras la reversión. Antes de tocarlo: "${before}". Después de revertir: "${after.stdout}".`,
  );
});

Then('ninguna fila se desborda el ancho de la pantalla ni recorta el nombre de playa más largo', async function (this: PaletteWorld) {
  const layout = await layoutFindings(requiredPage(this), LONGEST_NAME);
  assert.deepEqual(layout.wrappedLinks, [], `filas cuyo nombre se empuja a un segundo renglón desprolijo: ${layout.wrappedLinks.join(', ')}`);
  assert.ok(layout.longestNamePresent, `el nombre de playa más largo ("${LONGEST_NAME}") no aparece completo en la lista`);
});

Then('no hay scroll horizontal en ningún punto de la portada', async function (this: PaletteWorld) {
  const layout = await layoutFindings(requiredPage(this), LONGEST_NAME);
  assert.equal(layout.overflowX, false, 'la portada tiene scroll horizontal');
});

Then('ni la tarjeta destacada ni ninguna fila de la lista tienen transición o animación activa', async function (this: PaletteWorld) {
  const motion = await motionFindings(requiredPage(this));
  assert.deepEqual(motion.moving, [], `elementos con movimiento activo pese al movimiento reducido: ${motion.moving.join(', ')}`);
});

Then('cada fila de la lista muestra el mismo spot y el mismo puntaje que la superficie publicada real, en el mismo orden', async function (this: PaletteWorld) {
  const rows = await renderedRows(requiredPage(this));
  assert.equal(rows.length, publishedCalls.length, `la portada muestra ${rows.length} filas, la superficie publicada real tiene ${publishedCalls.length}`);
  const mismatches: string[] = [];
  rows.forEach((row, index) => {
    const expected = publishedCalls[index]!;
    if (!row.href.replace(/\/$/, '').endsWith(`/spots/${expected.spot_id}`)) {
      mismatches.push(`fila ${index}: destino "${row.href}" no termina en /spots/${expected.spot_id}`);
    }
    if (row.score !== expected.score_q) {
      mismatches.push(`fila ${index}: puntaje mostrado ${row.score}, esperado ${expected.score_q}`);
    }
  });
  assert.deepEqual(mismatches, [], mismatches.join(' | '));
});

// ---------- cleanup ----------

After(async function (this: PaletteWorld) {
  const surface = openedSurfaces.get(this);
  if (surface) {
    await surface.browser?.close?.();
    if (surface.preview && surface.preview.exitCode === null) {
      surface.preview.kill('SIGTERM');
    }
    if (surface.cleanupRoot !== null) {
      rmSync(surface.cleanupRoot, { recursive: true, force: true });
    }
  }
  // Safety net: never leave the real, git-tracked tokens.css mutated, even
  // if a scenario threw before reaching its own revert step.
  if (pendingRealMutation !== null) {
    writeFileSync(TOKENS_PATH, pendingRealMutation);
    pendingRealMutation = null;
  }
});
