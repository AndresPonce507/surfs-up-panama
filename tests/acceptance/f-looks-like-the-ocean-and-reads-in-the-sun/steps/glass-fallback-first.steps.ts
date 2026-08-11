// Slice-02 accepts the real, built spot page.  It never mounts a synthetic
// language pill: Base.astro currently emits none, so F-READ-IT-IN-YOUR-LANGUAGE
// owns that markup.  The test makes only contained copies of the real project
// to emulate unavailable glass and reduced transparency, then builds and serves
// those copies over HTTP before Chromium observes the actual route.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { join } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';

type GlassWorld = object;
type Mode = 'supports-off' | 'reduced-transparency' | 'glass-first' | 'normal';
type OpenedSurface = { root: string; preview: ChildProcess; browser: Browser; page: Page };

const projectRoot = process.cwd();
const COMPONENTS = 'src/styles/components.css';
const opened = new WeakMap<GlassWorld, OpenedSurface>();
const prepared = new WeakMap<GlassWorld, { root: string; mode: Mode }>();

function credentialFreeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...extra };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) delete environment[key];
  }
  return environment;
}

function removeSupportsBlocks(css: string): string {
  const marker = '@supports (backdrop-filter: blur(1px))';
  let output = css;
  let start = output.indexOf(marker);
  while (start !== -1) {
    const brace = output.indexOf('{', start);
    assert.ok(brace !== -1, 'test fixture error: glass @supports has no opening brace');
    let depth = 1;
    let cursor = brace + 1;
    while (depth > 0 && cursor < output.length) {
      if (output[cursor] === '{') depth += 1;
      if (output[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, 'test fixture error: glass @supports has no closing brace');
    output = output.slice(0, start) + output.slice(cursor);
    start = output.indexOf(marker);
  }
  return output;
}

function selectorMutation(css: string, selector: string, from: string, to: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start !== -1, `test fixture error: selector ${selector} is absent`);
  const end = css.indexOf('}', start);
  assert.ok(end !== -1, `test fixture error: selector ${selector} has no closing brace`);
  const block = css.slice(start, end + 1);
  const replaced = block.replace(from, to);
  assert.notEqual(replaced, block, `test fixture error: ${from} is absent from ${selector}`);
  return css.slice(0, start) + replaced + css.slice(end + 1);
}

function isolatedRoot(mode: Mode): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-02-'));
  for (const file of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) copyFileSync(join(projectRoot, file), join(root, file));
  for (const directory of ['data', 'public', 'scripts', 'src']) cpSync(join(projectRoot, directory), join(root, directory), { recursive: true });
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  const path = join(root, COMPONENTS);
  let css = readFileSync(path, 'utf8');
  if (mode === 'supports-off') css = removeSupportsBlocks(css);
  if (mode === 'reduced-transparency') css = css.replace('@media (prefers-reduced-transparency: reduce)', '@media all');
  if (mode === 'glass-first') css = selectorMutation(removeSupportsBlocks(css), 'p:has(> a.cta)', 'background: var(--bg);', 'background: var(--glass);');
  writeFileSync(path, css);
  return root;
}

function build(root: string): void {
  // Run the same Astro production compiler directly. `npm run build` first
  // invokes the publish verifier through tsx, whose IPC socket is unrelated
  // to this contained visual build and is denied in restricted test runners.
  const result = spawnSync(join(projectRoot, 'node_modules/.bin/astro'), ['build'], { cwd: root, env: credentialFreeEnvironment(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, `test fixture error: real Astro build failed before the browser oracle:\n${result.stdout}${result.stderr}`);
}

function spotRoute(root: string): string {
  const spots = join(root, 'dist', 'spots');
  const page = readdirSync(spots).find((entry) => entry.endsWith('.html') && entry !== 'index.html');
  assert.ok(page, 'test fixture error: built surface contains no spot route');
  return `/spots/${page}`;
}

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') return reject(new Error('test fixture error: could not allocate a preview port'));
      server.close((error) => error === undefined ? resolve(address.port) : reject(error));
    });
  });
}

async function waitFor(url: string, process: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`test fixture error: preview stopped with ${process.exitCode}`);
    try {
      const ready = await new Promise<boolean>((resolve, reject) => {
        const request = get(url, (response) => {
          response.resume();
          resolve((response.statusCode ?? 500) < 400);
        });
        request.once('error', reject);
        request.setTimeout(500, () => request.destroy(new Error('preview health request timed out')));
      });
      if (ready) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`test fixture error: preview did not open: ${String(lastError)}`);
}

async function openSpot(world: GlassWorld, width: number, theme: string): Promise<void> {
  const fixture = prepared.get(world);
  assert.ok(fixture, 'test fixture error: no prepared build; run the Given first');
  build(fixture.root);
  const port = await unusedPort();
  const preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: fixture.root, env: credentialFreeEnvironment(), stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
  await page.goto(`${base}${spotRoute(fixture.root)}`, { waitUntil: 'domcontentloaded' });
  opened.set(world, { root: fixture.root, preview, browser, page });
}

async function openHome(world: GlassWorld, width: number, theme: string): Promise<void> {
  const fixture = prepared.get(world);
  assert.ok(fixture, 'test fixture error: no prepared build; run the Given first');
  build(fixture.root);
  const port = await unusedPort();
  const preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: fixture.root, env: credentialFreeEnvironment(), stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
  await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  opened.set(world, { root: fixture.root, preview, browser, page });
}

function pageFor(world: GlassWorld): Page {
  const surface = opened.get(world);
  assert.ok(surface, 'test fixture error: no opened browser surface');
  return surface.page;
}

type TrayAudit = { findings: string[]; isGlass: boolean; isReady: boolean; hasLanguagePill: boolean };

async function audit(page: Page, expectation: 'solid' | 'glass', selector = 'p:has(> a.cta)', buttonSelector = 'a.cta'): Promise<TrayAudit> {
  return page.evaluate(`(() => {
    const required = '${expectation}';
    const selector = '${selector}';
    const buttonSelector = '${buttonSelector}';
    const parse = (value) => (value.match(/rgba?\\(([^)]+)\\)/i)?.[1] ?? '0,0,0,1').split(',').map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((n) => { const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const tray = document.querySelector(selector);
    const button = tray?.querySelector(buttonSelector);
    const findings = [];
    if (!tray || !button) return { findings: ['la página no contiene la bandeja ni su botón: selector ' + selector + ', botón ' + buttonSelector], isGlass: false, isReady: false, hasLanguagePill: false };
    const trayStyle = getComputedStyle(tray);
    const buttonStyle = getComputedStyle(button);
    const background = parse(trayStyle.backgroundColor);
    const overlayStyle = getComputedStyle(tray, '::before');
    const overlayBackground = parse(overlayStyle.backgroundColor);
    const filter = overlayStyle.backdropFilter;
    const glass = filter !== 'none' && overlayBackground[3] !== undefined && overlayBackground[3] < 1;
    if (required === 'solid' && (filter !== 'none' || (background[3] ?? 1) < 1)) findings.push('bandeja: fondo ' + trayStyle.backgroundColor + ', filtro ' + filter + '; se esperaba respaldo sólido sin filtro');
    const hasWaterField = trayStyle.backgroundImage.includes('linear-gradient');
    if (required === 'glass' && !glass) findings.push('bandeja: fondo ' + trayStyle.backgroundColor + ', filtro ' + filter + '; se esperaba vidrio mejorado');
    if (required === 'glass' && !hasWaterField) findings.push('bandeja: fondo ' + trayStyle.backgroundColor + ', agua detrás ' + trayStyle.backgroundImage + '; el vidrio no tiene el campo de agua aprobado detrás');
    const buttonBackground = parse(buttonStyle.backgroundColor);
    const buttonText = parse(buttonStyle.color);
    if (ratio(buttonBackground, buttonText) < 4.5) findings.push('botón: contraste ' + ratio(buttonBackground, buttonText).toFixed(2) + ':1, piso 4.5:1');
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) findings.push('la página tiene scroll horizontal');
    const box = button.getBoundingClientRect();
    if (box.width < 44 || box.height < 44) findings.push('botón: objetivo ' + box.width.toFixed(0) + 'x' + box.height.toFixed(0) + 'px, piso 44x44px');
    const trayBox = tray.getBoundingClientRect();
    if (required === 'glass' && selector === '.home-primary' && (box.left - trayBox.left < 24 || trayBox.right - box.right < 24 || box.top - trayBox.top < 16 || trayBox.bottom - box.bottom < 16)) {
      findings.push('bandeja: el marco de agua visible mide izquierda ' + (box.left - trayBox.left).toFixed(0) + ', derecha ' + (trayBox.right - box.right).toFixed(0) + ', arriba ' + (box.top - trayBox.top).toFixed(0) + ', abajo ' + (trayBox.bottom - box.bottom).toFixed(0) + 'px; el vidrio debe enmarcar visiblemente la acción sólida');
    }
    window.scrollTo(0, 0);
    const beforeScroll = tray.getBoundingClientRect();
    const beforeScrollY = window.scrollY;
    const maximumScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const requestedScroll = Math.min(480, maximumScroll);
    window.scrollBy(0, requestedScroll);
    const afterScroll = tray.getBoundingClientRect();
    const actualScroll = window.scrollY - beforeScrollY;
    if (maximumScroll >= 120 && actualScroll < 120) findings.push('la portada no llegó a desplazarse de forma significativa: pidió ' + requestedScroll.toFixed(0) + 'px y avanzó ' + actualScroll.toFixed(0) + 'px');
    if (trayStyle.position !== 'fixed' || afterScroll.bottom < innerHeight - 1 || afterScroll.top < 0 || Math.abs(beforeScroll.top - afterScroll.top) > 1) findings.push('bandeja: posición ' + trayStyle.position + ', antes ' + beforeScroll.top.toFixed(0) + ', después ' + afterScroll.top.toFixed(0) + ', scroll ' + actualScroll.toFixed(0) + 'px; se esperaba fija y visible tras scroll');
    if (buttonStyle.transitionDuration !== '0s' || buttonStyle.animationName !== 'none') findings.push('el botón declara movimiento bajo movimiento reducido');
    if (!getComputedStyle(document.documentElement).getPropertyValue('--tap').trim() || !getComputedStyle(document.documentElement).getPropertyValue('--sp-3').trim()) findings.push('faltan tokens de toque o espaciado');
    return {
      findings,
      isGlass: glass,
      isReady: document.readyState === 'complete' && !document.querySelector('[aria-busy="true"]'),
      hasLanguagePill: document.querySelector('.lang-toggle') !== null,
    };
  })()`) as Promise<TrayAudit>;
}

function prepare(world: GlassWorld, mode: Mode): void { prepared.set(world, { root: isolatedRoot(mode), mode }); }

Given('una construcción real de una página de spot con las reglas de vidrio retiradas', function (this: GlassWorld) { prepare(this, 'supports-off'); });
Given('una construcción real de una página de spot con la regla de transparencia reducida forzada', function (this: GlassWorld) { prepare(this, 'reduced-transparency'); });
Given('una construcción real de una página de spot cuya bandeja comienza en vidrio sin respaldo sólido', function (this: GlassWorld) { prepare(this, 'glass-first'); });
Given('una construcción real de una página de spot, sin ninguna modificación', function (this: GlassWorld) { prepare(this, 'normal'); });
Given('una construcción real, sin ninguna modificación', function (this: GlassWorld) { prepare(this, 'normal'); });
Given('una construcción real de la portada con modo de vidrio {string}', function (this: GlassWorld, mode: string) {
  assert.ok(mode === 'normal' || mode === 'sin-soporte', `test fixture error: modo de vidrio desconocido ${mode}`);
  prepare(this, mode === 'sin-soporte' ? 'supports-off' : 'normal');
});
Given('una construcción real de la portada con transparencia reducida', function (this: GlassWorld) { prepare(this, 'reduced-transparency'); });

When('el surfista abre esa página de spot a {int} px, con tema {string}', async function (this: GlassWorld, width: number, theme: string) { await openSpot(this, width, theme); });
When('el surfista abre la portada para comprobar su bandeja a {int} px, con tema {string}', async function (this: GlassWorld, width: number, theme: string) { await openHome(this, width, theme); });

Then('la bandeja de reportar es sólida, no usa filtro de vidrio y el botón conserva contraste real', async function (this: GlassWorld) {
  const result = await audit(pageFor(this), 'solid');
  assert.deepEqual(result.findings, [], `WHAT: ${result.findings.join('; ')}. WHY: el respaldo sólido es el diseño que un teléfono barato realmente necesita. HOW: declarar --bg antes de la mejora de vidrio.`);
});
Then('la bandeja y el botón caben sin scroll horizontal, el botón alcanza el tamaño de toque y nada nuevo se mueve', async function (this: GlassWorld) {
  const result = await audit(pageFor(this), 'solid');
  assert.deepEqual(result.findings, [], result.findings.join('; '));
});
Then('la bandeja usa los tokens de tipo, color y espaciado del producto', function () {
  const css = readFileSync(join(projectRoot, COMPONENTS), 'utf8');
  const tray = css.slice(css.indexOf('p:has(> a.cta) {'), css.indexOf('}', css.indexOf('p:has(> a.cta) {')) + 1);
  assert.match(tray, /padding: var\(--sp-3\) var\(--sp-4\)/, 'la bandeja debe usar tokens de espaciado');
  assert.match(tray, /background: var\(--bg\)/, 'la bandeja debe usar el token de fondo sólido');
  assert.match(readFileSync(join(projectRoot, 'src/styles/tokens.css'), 'utf8'), /--tap:/, 'el sistema debe declarar el token de toque');
});
Then('la comprobación de respaldo sólido falla nombrando la bandeja y su fondo medido', async function (this: GlassWorld) {
  const result = await audit(pageFor(this), 'solid');
  assert.ok(result.findings.some((finding) => finding.startsWith('bandeja:')), `se esperaba rechazo de bandeja sin respaldo sólido; se obtuvo ${result.findings.join('; ')}`);
});
Then('ningún elemento con la clase lang-toggle aparece en ninguna página construida', async function (this: GlassWorld) {
  await openSpot(this, 390, 'claro');
  const result = await audit(pageFor(this), 'solid');
  assert.equal(result.hasLanguagePill, false, 'F-READ-IT-IN-YOUR-LANGUAGE todavía posee el marcado de .lang-toggle; este slice no debe inventarlo');
});
Then('la bandeja de reportar usa vidrio como mejora y el botón conserva contraste real', async function (this: GlassWorld) {
  const result = await audit(pageFor(this), 'glass');
  assert.deepEqual(result.findings, [], result.findings.join('; '));
});
Then('la bandeja principal permanece fija, visible y en modo {word} sobre el contenido que se desplaza', async function (this: GlassWorld, expected: string) {
  assert.ok(expected === 'vidrio' || expected === 'solido', `test fixture error: expectativa desconocida ${expected}`);
  const result = await audit(pageFor(this), expected === 'vidrio' ? 'glass' : 'solid', '.home-primary', 'a[data-primary-action]');
  assert.deepEqual(result.findings, [], result.findings.join('; '));
});
Then('la bandeja opaca de transparencia reducida forma un marco distinguible detrás de la acción sólida', async function (this: GlassWorld) {
  const result = await pageFor(this).evaluate(`(() => {
    const tray = document.querySelector('.home-primary');
    const button = tray?.querySelector('a[data-primary-action]');
    if (!tray || !button) return ['la portada no contiene la bandeja principal ni su acción'];
    const trayStyle = getComputedStyle(tray);
    const pageBackground = getComputedStyle(document.body).backgroundColor;
    const trayBox = tray.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const frame = [buttonBox.left - trayBox.left, trayBox.right - buttonBox.right, buttonBox.top - trayBox.top, trayBox.bottom - buttonBox.bottom];
    const findings = [];
    if (trayStyle.backgroundColor === pageBackground) findings.push('bandeja opaca: fondo ' + trayStyle.backgroundColor + ' igual a la página; el marco desaparece');
    if (trayStyle.backdropFilter !== 'none' || getComputedStyle(tray, '::before').display !== 'none') findings.push('bandeja opaca: conserva vidrio o pseudo-capa bajo transparencia reducida');
    if (frame[0] < 24 || frame[1] < 24 || frame[2] < 16 || frame[3] < 16) findings.push('bandeja opaca: marco visible ' + frame.map((value) => value.toFixed(0)).join('/') + 'px; se esperaba 24/24/16/16px como mínimo');
    return findings;
  })()`) as string[];
  assert.deepEqual(result, [], result.join('; '));
});
Then('la tarjeta grande del primer spot permanece sólida, nunca de vidrio', async function (this: GlassWorld) {
  const page = pageFor(this);
  await page.goto(new URL('/', page.url()).toString(), { waitUntil: 'domcontentloaded' });
  const hero = await page.evaluate(`(() => {
    const card = document.querySelector('ol.ranked > li:first-child');
    if (!card) return { found: false, filter: '', image: '' };
    const style = getComputedStyle(card);
    return { found: true, filter: style.backdropFilter, image: style.backgroundImage };
  })()`) as { found: boolean; filter: string; image: string };
  assert.equal(hero.found, true, 'la página de inicio debe tener una tarjeta de primer spot para comprobar el límite de diseño');
  assert.equal(hero.filter, 'none', 'la tarjeta grande del primer spot es el puntaje que se lee al sol y debe seguir siendo un degradado sólido');
  assert.match(hero.image, /linear-gradient/, 'la tarjeta grande debe conservar el degradado sólido aprobado, no un fondo de vidrio');
});
Then('la ruta de reportar está lista sin estado de carga ni control de idioma inventado', async function (this: GlassWorld) {
  const result = await audit(pageFor(this), 'glass');
  assert.equal(result.isReady, true, 'la página publicada debe llegar lista, sin una espera inventada');
  assert.equal(result.hasLanguagePill, false, 'no se debe fabricar la píldora de idioma antes de su feature');
  const href = await pageFor(this).locator('a.cta').getAttribute('href');
  assert.match(href ?? '', /\/spots\/[^/]+\/reportar\/$/, 'la acción primaria debe declarar la ruta real de reportar');
});

After(async function (this: GlassWorld) {
  const surface = opened.get(this);
  await surface?.browser.close();
  if (surface?.preview.exitCode === null) {
    await new Promise<void>((resolve) => {
      surface.preview.once('exit', () => resolve());
      surface.preview.kill();
      setTimeout(resolve, 1_000).unref();
    });
  }
  const fixture = prepared.get(this);
  if (fixture) rmSync(fixture.root, { recursive: true, force: true });
});
