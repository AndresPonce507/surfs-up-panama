// Shared machinery for the paste-the-call slice-02..05 acceptance scenarios.
//
// Same discipline as built-share-surface.ts (the slice-01 precedent): every
// observation happens against the real `npm run build` output, served over
// HTTP and read the way its consumer reads it — the surfer through Chromium
// at phone width, WhatsApp's preview crawler through the addresses the page
// head declares, the group through the text the clipboard actually holds.
// Nothing here reads production source to decide what "should" happen.

import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  credentialFreeEnvironment,
  configuredSite,
  displayNameOf,
  newHomePage,
  spanishConfidence,
  spanishSizeBand,
  spanishWind,
  type ExpectedShare,
  type HomeOptions,
  type OpenHome,
} from './built-share-surface';

type ShareCall = {
  spot_id: string;
  score_q: number;
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

function readCopySurface(root: string): StaticSurfaceFile {
  return JSON.parse(readFileSync(join(root, 'data/published-surface.json'), 'utf8')) as StaticSurfaceFile;
}

function writeCopySurface(root: string, surface: StaticSurfaceFile): void {
  writeFileSync(join(root, 'data/published-surface.json'), `${JSON.stringify(surface, null, 2)}\n`);
}

function buildStampOf(publishedAt: string): string {
  const utc = new Date(publishedAt).toISOString();
  return `b_${utc.slice(0, 10)}T${utc.slice(11, 13)}Z`;
}

// ---------- Publishing without a browser (builder-artifact scenarios) ----------

export type PublishOutcome = { readonly status: number | null; readonly output: string };

/** The real `npm run build`, output captured for the gap-log oracles. */
export function publishSurface(root: string): PublishOutcome {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return { status: build.status, output: `${build.stdout}${build.stderr}` };
}

// ---------- Surface mutations (the P7 degrade and freshness fixtures) ----------

/**
 * A new morning arrives: the publish hour moves and the top spot's score
 * changes, in BOTH published copies of today. The civil day never changes, so
 * the producer's own verification still passes. Returns the two build stamps
 * so the freshness oracle can name them.
 */
export function arriveNewMorning(root: string): { previousStamp: string; freshStamp: string; freshScore: number } {
  const surface = readCopySurface(root);
  const previousStamp = buildStampOf(surface.current.published_at);
  const published = new Date(surface.current.published_at);
  assert.ok(!Number.isNaN(published.getTime()), 'test fixture error: published_at ilegible en la superficie publicada');
  const shifted = new Date(published.getTime());
  // Stay inside the same UTC date so the stamp's date half never moves.
  shifted.setUTCHours(published.getUTCHours() === 23 ? 22 : published.getUTCHours() + 1);
  surface.current.published_at = shifted.toISOString();
  const today = surface.current.days[0];
  assert.ok(today !== undefined && today.spots.length > 0, 'test fixture error: the published surface needs a ranked today');
  let freshScore = 0;
  for (const rows of [surface.current.calls, today.spots]) {
    const top = rows[0];
    assert.ok(top !== undefined, 'test fixture error: the ranking lost its first place while a new morning arrived');
    top.score_q = top.score_q >= 99 ? top.score_q - 1 : top.score_q + 1;
    freshScore = top.score_q;
  }
  writeCopySurface(root, surface);
  return { previousStamp, freshStamp: buildStampOf(surface.current.published_at), freshScore };
}

/**
 * Two non-first ranked spots lose their call fields (`conf_level`,
 * `wind_state`) in BOTH published copies of today: the exact P7 gap the
 * generic card is the declared answer to. Never the top spot — the home's
 * own call keeps its honest fields. Returns the two spot ids.
 */
export function stripCallFieldsOfTwoSpots(root: string): string[] {
  const surface = readCopySurface(root);
  const today = surface.current.days[0];
  assert.ok(today !== undefined && today.spots.length >= 3, 'test fixture error: the degrade fixture needs at least three ranked spots');
  const stripped: string[] = [];
  for (const rows of [surface.current.calls, today.spots]) {
    for (const index of [1, 2]) {
      const row = rows[index];
      assert.ok(row !== undefined, 'test fixture error: the ranking lost rows while stripping call fields');
      delete row.conf_level;
      delete row.wind_state;
      if (!stripped.includes(row.spot_id)) stripped.push(row.spot_id);
    }
  }
  writeCopySurface(root, surface);
  return stripped;
}

/**
 * The share expectation for the ranked spot at `rank` (0 = the day's best,
 * exactly what built-share-surface's expectedShare computes; 1 = the second
 * spot, the slice-05 fixture that catches home-values leakage).
 */
export function expectedShareForRank(root: string, rank: number): ExpectedShare {
  const surface = readCopySurface(root).current;
  const row = surface.days[0]?.spots[rank];
  assert.ok(row !== undefined, `la superficie publicada no trae un spot en el puesto ${rank + 1} de hoy`);
  const { size_band, wind_state, best_window, conf_level } = row;
  assert.ok(
    size_band !== undefined && wind_state !== undefined && best_window !== undefined && conf_level !== undefined,
    `el spot ${row.spot_id} llega sin los campos estructurados del llamado (HANDOFF seccion 10)`,
  );
  const sizeEs = spanishSizeBand[size_band];
  const windEs = spanishWind[wind_state];
  const confidenceEs = spanishConfidence[conf_level];
  assert.ok(
    sizeEs !== undefined && windEs !== undefined && confidenceEs !== undefined,
    `vocabulario sin traducción canónica para ${size_band}/${wind_state}/${conf_level}`,
  );
  const published = new Date(surface.published_at);
  assert.ok(!Number.isNaN(published.getTime()), 'published_at ilegible en la superficie publicada');
  return {
    spotId: row.spot_id,
    spotName: displayNameOf(row.spot_id),
    score: row.score_q,
    sizeEs,
    windEs,
    windowStart: best_window.start,
    windowEnd: best_window.end,
    confidenceEs,
    surfDayOfMonth: Number(surface.surf_date.slice(8, 10)),
    buildStamp: buildStampOf(surface.published_at),
    site: configuredSite(root),
  };
}

// ---------- The daemonising preview for spot routes (keystone precedent) ----------

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

export type BuiltSpotSurface = { readonly home: OpenHome; readonly daemonPid: number };

/**
 * Build the copy, run the UI gate, and serve dist/ through `astro preview` —
 * NOT `vite preview`. The keystone slice-06 steps verified empirically that
 * raw vite preview SPA-falls-back to the home for a spot's directory-style
 * href, masking both the routing and any missing page. astro preview
 * resolves build.format:'file' hrefs correctly, but daemonises: the spawned
 * child exits immediately and the server keeps running under the pid it
 * prints. The caller keeps that pid and kills it in an After hook.
 */
export async function openBuiltSpotSurface(root: string, options: HomeOptions): Promise<BuiltSpotSurface> {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`paste-the-call spot surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
  const gate = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  const uiGate = { status: gate.status, output: `${gate.stdout}${gate.stderr}` };
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
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
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  let reachable = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        reachable = true;
        break;
      }
      lastError = new Error(`preview returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!reachable) {
    if (pid !== null) stopPreviewDaemon(pid);
    throw new Error(`paste-the-call spot preview never became reachable: ${String(lastError)}\n${output}`);
  }
  // The port can become reachable before the piped "(pid NNNN)" line lands
  // on this event loop — a real race the keystone observed. Poll briefly.
  const pidDeadline = Date.now() + 5_000;
  while (pid === null && Date.now() < pidDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (pid === null) {
    throw new Error(`test fixture error: astro preview became reachable but never reported a pid.\n${output}`);
  }
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await newHomePage(browser, url, options);
    return { home: { url, preview: child, browser, page, uiGate }, daemonPid: pid };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    stopPreviewDaemon(pid);
    throw error;
  }
}

export function stopPreviewDaemon(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

// ---------- The page's own announcement (what the preview crawler reads) ----------

/** One named announcement entry from the served page's head, or null. */
export async function announcedContent(page: Page, property: string): Promise<string | null> {
  const selector = `meta[property=${JSON.stringify(property)}], meta[name=${JSON.stringify(property)}]`;
  return page.evaluate(`(() => {
    const meta = document.querySelector(${JSON.stringify(selector)});
    return meta === null ? null : meta.getAttribute('content');
  })()`) as Promise<string | null>;
}

/** Every announcement entry of the page head, serialized for purity oracles. */
export async function allAnnouncements(page: Page): Promise<{ property: string; content: string }[]> {
  return page.evaluate(`(() =>
    [...document.querySelectorAll('meta[property^="og:"], meta[name^="og:"]')]
      .map((meta) => ({
        property: meta.getAttribute('property') ?? meta.getAttribute('name') ?? '',
        content: meta.getAttribute('content') ?? '',
      }))
  )()`) as Promise<{ property: string; content: string }[]>;
}

/** The page's permanent address declaration, or null when it makes none. */
export async function permanentAddress(page: Page): Promise<string | null> {
  return page.evaluate(`(() => {
    const link = document.querySelector('link[rel="canonical"]');
    return link === null ? null : link.getAttribute('href');
  })()`) as Promise<string | null>;
}

/**
 * Fetch a site-absolute address through the local preview that serves the
 * same publication, the way the crawler would fetch it once deployed.
 */
export async function fetchOverPreview(
  home: OpenHome,
  siteAbsolute: string,
): Promise<{ status: number; bytes: Buffer; contentType: string }> {
  const parsed = new URL(siteAbsolute);
  const response = await fetch(`${home.url}${parsed.pathname}${parsed.search}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes, contentType: response.headers.get('content-type') ?? '' };
}

// ---------- Preview cards (the crawler-facing image artifacts) ----------

/** JPEG pixel size read from the file's own frame header. */
export function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export const PREVIEW_CARD = { width: 1200, height: 630, maxBytes: 60 * 1024 } as const;

export type PreviewCard = { readonly path: string; readonly bytes: Buffer };

/**
 * Every preview-sized card the publication emitted, found by what it IS (a
 * JPEG at the agreed preview size) rather than by where an implementation
 * chose to put it.
 */
export function previewCardsIn(root: string): PreviewCard[] {
  const dist = join(root, 'dist');
  const cards: PreviewCard[] = [];
  for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const bytes = readFileSync(path);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
    const dims = jpegDimensions(bytes);
    if (dims !== null && dims.width === PREVIEW_CARD.width && dims.height === PREVIEW_CARD.height) {
      cards.push({ path: path.slice(dist.length + 1), bytes });
    }
  }
  return cards;
}

/** Groups of byte-identical cards, largest first. A couple dozen cards at most: plain comparison. */
export function identicalCardGroups(cards: readonly PreviewCard[]): PreviewCard[][] {
  const groups: PreviewCard[][] = [];
  for (const card of cards) {
    const group = groups.find((candidates) => candidates[0]!.bytes.equals(card.bytes));
    if (group === undefined) groups.push([card]);
    else group.push(card);
  }
  return groups.sort((a, b) => b.length - a.length);
}

// ---------- What the first flight downloads ----------

export type PageScript = { readonly src: string; readonly type: string; readonly defer: boolean; readonly async: boolean };

/** The scripts the served document asks the phone to fetch. */
export async function externalScriptsOf(page: Page): Promise<PageScript[]> {
  const scripts = (await page.evaluate(`(() =>
    [...document.querySelectorAll('script')].map((script) => ({
      src: script.getAttribute('src') ?? '',
      type: script.getAttribute('type') ?? '',
      defer: script.defer === true,
      async: script.async === true,
    }))
  )()`)) as PageScript[];
  return scripts.filter((script) => script.src !== '');
}

/** Everything the document itself references for its first visit, gzip-weighed over the preview. */
export async function firstFlightGzBytes(home: OpenHome, pagePath: string): Promise<number> {
  const references = (await home.page.evaluate(`(() => {
    const collected = [];
    for (const script of document.querySelectorAll('script[src]')) collected.push(script.getAttribute('src'));
    for (const link of document.querySelectorAll('link[rel="stylesheet"][href], link[rel="preload"][href], link[rel="modulepreload"][href]')) {
      collected.push(link.getAttribute('href'));
    }
    for (const image of document.querySelectorAll('img[src]')) collected.push(image.getAttribute('src'));
    return collected.filter((value) => value !== null && !value.startsWith('data:'));
  })()`)) as string[];
  const documentResponse = await fetch(`${home.url}${pagePath}`);
  let total = gzipSync(Buffer.from(await documentResponse.arrayBuffer())).length;
  for (const reference of references) {
    const path = /^https?:\/\//.test(reference) ? new URL(reference).pathname : reference;
    const response = await fetch(new URL(path, `${home.url}/`));
    if (!response.ok) continue;
    total += gzipSync(Buffer.from(await response.arrayBuffer())).length;
  }
  return total;
}

/** Addresses the document would make a phone download (never the crawler-only card). */
export async function downloadedImageAddresses(page: Page): Promise<string[]> {
  return page.evaluate(`(() =>
    [
      ...[...document.querySelectorAll('img[src]')].map((image) => image.getAttribute('src') ?? ''),
      ...[...document.querySelectorAll('link[rel="preload"][href], link[rel="prefetch"][href]')].map((link) => link.getAttribute('href') ?? ''),
    ].filter((value) => value !== '')
  )()`) as Promise<string[]>;
}

// ---------- The copy action (slice-02 and slice-05) ----------

export type CopyControlObservation = { readonly label: string; readonly width: number; readonly height: number };

/**
 * The one-tap copy control inside a container, identified only through
 * user-facing observables: a button-like control whose visible or accessible
 * name says copiar.
 */
export async function copyControlsIn(page: Page, containerSelector: string): Promise<CopyControlObservation[]> {
  return page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(containerSelector)}) ?? document.body;
    return [...scope.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
      .filter((control) => {
        const label = (control.textContent ?? '') + ' ' + (control.getAttribute('aria-label') ?? '') + ' ' + (control.getAttribute('title') ?? '') + ' ' + (control.getAttribute('value') ?? '');
        return /copiar/i.test(label);
      })
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          label: (control.getAttribute('aria-label') ?? control.textContent ?? control.getAttribute('value') ?? '').trim(),
          width: rect.width,
          height: rect.height,
        };
      });
  })()`) as Promise<CopyControlObservation[]>;
}

/** Visible text of the share area, for the appeared-notice diff. */
export async function shareAreaText(page: Page, containerSelector: string): Promise<string> {
  return page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(containerSelector)}) ?? document.body;
    return scope.innerText ?? scope.textContent ?? '';
  })()`) as Promise<string>;
}

/** Lines visible now that were not visible before the tap. */
export function appearedLines(before: string, after: string): string[] {
  const previous = new Set(before.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
  return after
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !previous.has(line));
}

/** What the phone's clipboard actually holds, read with the granted permission. */
export async function clipboardText(page: Page): Promise<string> {
  try {
    return (await page.evaluate('navigator.clipboard.readText()')) as string;
  } catch {
    return '';
  }
}

// ---------- The WhatsApp action outside the home top card (slice-05) ----------

export type ShareActionObservation = { readonly href: string; readonly label: string; readonly width: number; readonly height: number };

export async function whatsappActionsIn(page: Page, containerSelector: string): Promise<ShareActionObservation[]> {
  return page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(containerSelector)}) ?? document.body;
    return [...scope.querySelectorAll('a')]
      .filter((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        const label = (anchor.textContent ?? '') + ' ' + (anchor.getAttribute('aria-label') ?? '') + ' ' + (anchor.getAttribute('title') ?? '');
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
  })()`) as Promise<ShareActionObservation[]>;
}

// ---------- The seven visual checks, generalized (slice-02 and slice-05) ----------

export type SevenPointAudit = {
  readonly surfacePresent: boolean;
  readonly present: boolean;
  readonly count: number;
  readonly label: string;
  readonly contrastFailures: string[];
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
  readonly labelScrollWidth: number;
  readonly labelClientWidth: number;
  readonly fontPx: number;
  readonly movingUnderReduce: string[];
  readonly loadingCount: number;
  readonly hexInMatchedRules: string[];
  readonly untokenedDeclarations: string[];
  readonly matchedRuleCount: number;
};

/**
 * The U1-U7 audit of one share control, the shipped slice-01 pattern
 * generalized over its container and over which control it measures.
 * String-form evaluate, the shipped precedent: tsx keep-names injects a
 * `__name` helper into serialized function bodies, which does not exist
 * inside the page and breaks a function-form evaluate.
 */
export async function sevenPointAuditIn(page: Page, containerSelector: string, kind: 'whatsapp' | 'copy'): Promise<SevenPointAudit> {
  return page.evaluate(`(() => {
      const parse = (value) => {
        const match = value.match(/rgba?\\(([^)]+)\\)/i);
        if (!match || match[1] === undefined) return null;
        const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
        return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
      };
      const alphaOf = (value) => {
        const match = value.match(/rgba\\([^)]*,\\s*([\\d.]+)\\s*\\)/i);
        if (match && match[1] !== undefined) return Number(match[1]);
        return value === 'transparent' ? 0 : 1;
      };
      const luminance = ([r, g, b]) => {
        const channel = (value) => {
          const normalized = value / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const contrast = (a, b) => {
        const first = luminance(a);
        const second = luminance(b);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      const scope = document.querySelector(${JSON.stringify(containerSelector)});
      const wantCopy = ${JSON.stringify(kind)} === 'copy';
      const matches = wantCopy
        ? (scope === null ? [] : [...scope.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
            .filter((control) => /copiar/i.test((control.textContent ?? '') + ' ' + (control.getAttribute('aria-label') ?? '') + ' ' + (control.getAttribute('title') ?? '') + ' ' + (control.getAttribute('value') ?? ''))))
        : (scope === null ? [] : [...scope.querySelectorAll('a')]
            .filter((anchor) => {
              const href = anchor.getAttribute('href') ?? '';
              const label = (anchor.textContent ?? '') + ' ' + (anchor.getAttribute('aria-label') ?? '') + ' ' + (anchor.getAttribute('title') ?? '');
              return href.startsWith('https://wa.me/') || /whatsapp/i.test(label);
            }));
      const action = matches[0];
      const result = {
        surfacePresent: scope !== null,
        present: action !== undefined,
        count: matches.length,
        label: '',
        contrastFailures: [],
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        labelScrollWidth: 0,
        labelClientWidth: 0,
        fontPx: 0,
        movingUnderReduce: [],
        loadingCount: scope === null ? 0 : scope.querySelectorAll('[role="progressbar"], [data-reading-state="loading"], .spinner, .skeleton').length,
        hexInMatchedRules: [],
        untokenedDeclarations: [],
        matchedRuleCount: 0,
      };
      if (action === undefined) return result;
      result.label = (action.getAttribute('aria-label') ?? action.textContent ?? action.getAttribute('value') ?? '').trim();
      const rect = action.getBoundingClientRect();
      result.left = rect.left;
      result.right = rect.right;
      result.width = rect.width;
      result.height = rect.height;
      result.labelScrollWidth = action.scrollWidth;
      result.labelClientWidth = rect.width;
      result.fontPx = Number.parseFloat(getComputedStyle(action).fontSize);
      const stops = [];
      let node = action;
      while (node !== null) {
        const styles = getComputedStyle(node);
        for (const match of styles.backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)) {
          const stop = parse(match[0]);
          if (stop !== null) stops.push(stop);
        }
        const backdrop = parse(styles.backgroundColor);
        if (backdrop !== null && alphaOf(styles.backgroundColor) >= 0.99) {
          stops.push(backdrop);
          break;
        }
        node = node.parentElement;
      }
      if (stops.length === 0) {
        const bodyBackdrop = parse(getComputedStyle(document.body).backgroundColor);
        if (bodyBackdrop !== null) stops.push(bodyBackdrop);
      }
      const foreground = parse(getComputedStyle(action).color);
      if (foreground === null || stops.length === 0) {
        result.contrastFailures.push('no se pudo medir el texto de la acción contra su fondo real');
      } else {
        for (const stop of stops) {
          const measured = contrast(foreground, stop);
          if (measured < 4.5) result.contrastFailures.push('el texto queda en ' + measured.toFixed(2) + ':1 contra su fondo real');
        }
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        result.movingUnderReduce = [action, ...action.querySelectorAll('*')]
          .filter((element) => {
            const styles = getComputedStyle(element);
            return styles.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
              || styles.animationName.split(',').some((name) => name.trim() !== '' && name.trim() !== 'none');
          })
          .map((element) => element.tagName.toLowerCase());
      }
      const walk = (list) => {
        for (const rule of [...list]) {
          if (rule instanceof CSSMediaRule) {
            walk(rule.cssRules);
            continue;
          }
          if (!(rule instanceof CSSStyleRule)) continue;
          let ruleMatches = false;
          try {
            ruleMatches = action.matches(rule.selectorText);
          } catch {
            ruleMatches = false;
          }
          if (!ruleMatches) continue;
          result.matchedRuleCount += 1;
          if (/#[0-9a-f]{3,8}\\b/i.test(rule.cssText)) result.hexInMatchedRules.push(rule.selectorText);
          for (const property of ['color', 'background', 'background-color', 'background-image', 'border-radius', 'box-shadow']) {
            const value = rule.style.getPropertyValue(property);
            if (value === '') continue;
            if (/#[0-9a-f]{3,8}\\b|rgba?\\(|hsla?\\(/i.test(value) && !value.includes('var(')) {
              result.untokenedDeclarations.push(rule.selectorText + ' ' + property);
            }
          }
        }
      };
      for (const sheet of [...document.styleSheets]) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        walk(rules);
      }
      return result;
    })()`) as Promise<SevenPointAudit>;
}

/** Fold one audit into WHAT findings, the slice-01 wording preserved. */
export function sevenPointFindings(audit: SevenPointAudit, actionName: string, uiGate: OpenHome['uiGate']): string[] {
  const findings: string[] = [];
  if (!audit.present) {
    findings.push(`U5: la superficie no ofrece ${actionName}`);
  } else {
    if (audit.count !== 1) findings.push(`U5: hay ${audit.count} de ${actionName} y debe haber una sola`);
    findings.push(...audit.contrastFailures.map((finding) => `U1: ${finding}`));
    if (audit.scrollWidth > audit.clientWidth) findings.push('U2: la página desborda el teléfono de 390 px');
    if (audit.left < 0 || audit.right > audit.clientWidth) findings.push(`U2: ${actionName} queda fuera de la pantalla`);
    if (audit.width < 44 || audit.height < 44) {
      findings.push(`U3: ${actionName} mide ${Math.round(audit.width)}x${Math.round(audit.height)} px y el mínimo es 44x44`);
    }
    if (audit.movingUnderReduce.length > 0) {
      findings.push(`U4: con movimiento reducido siguen animados: ${audit.movingUnderReduce.join(', ')}`);
    }
    if (audit.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial junto a la acción');
    if (audit.label === '') findings.push(`U5: ${actionName} no tiene nombre legible`);
    if (audit.fontPx < 16) findings.push(`U6: el texto de ${actionName} mide ${audit.fontPx}px y la escala legible arranca en 16px`);
    if (audit.labelScrollWidth > audit.labelClientWidth + 1) findings.push(`U6: el texto de ${actionName} queda recortado`);
    if (audit.matchedRuleCount === 0) {
      findings.push(`U7: ${actionName} no recibe ninguna regla de estilo propia de la superficie construida`);
    }
    findings.push(...audit.hexInMatchedRules.map((selector) => `U7: ${selector} introduce un color hexadecimal fuera de tokens`));
    findings.push(...audit.untokenedDeclarations.map((declaration) => `U7: ${declaration} no usa el token nombrado`));
  }
  if (uiGate.status !== 0) {
    findings.push(`U1-U7: el gate de la superficie construida falló: ${uiGate.output.trim()}`);
  }
  return findings;
}
