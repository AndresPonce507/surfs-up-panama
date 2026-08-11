// Slice-03 enters through the production Astro build and observes emitted
// documents. It never mounts an internal component or imports the forecast
// module, which keeps visual work away from the report-flow boundary.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';

type SurfaceWorld = object;
type Mode = 'normal' | 'wrong-card-palette' | 'raw-unknown-page' | 'forecast-before-report';
type Palette = { bodyBackground: string; bg: string; ink: string; surface: string };
type VisibleFact = Record<string, string>;
type VisibleBaseline = {
  today: VisibleFact;
  tomorrow: VisibleFact;
  yesterday: VisibleFact;
  backHref: string;
  reportHref: string;
  spotPath: string;
  yesterdayPath: string;
};
type PageAudit = { findings: string[]; hasHomePalette: boolean };
type OpenedSurface = {
  root: string;
  spotUrl: string;
  yesterdayUrl: string;
  preview: ChildProcess;
  browser: Browser;
  page: Page;
  homePalette: Palette;
  baseline: VisibleBaseline;
  spotAudit: PageAudit;
  yesterdayAudit: PageAudit;
};
type ReportAudit = { findings: string[]; hasHomePalette: boolean };
type ReportState = { selectionIsVisible: boolean; disabledActionIsVisible: boolean; findings: string[] };
type OpenedReportSurfaces = {
  unknownUrl: string;
  captureUrl: string;
  revealUrl: string;
  preview: ChildProcess;
  browser: Browser;
  page: Page;
  unknownAudit: ReportAudit;
  captureAudit: ReportAudit;
  revealAudit: ReportAudit;
  reportState: ReportState;
};

const projectRoot = process.cwd();
const prepared = new WeakMap<SurfaceWorld, { root: string; mode: Mode }>();
const opened = new WeakMap<SurfaceWorld, OpenedSurface>();
const openedReports = new WeakMap<SurfaceWorld, OpenedReportSurfaces>();

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) delete environment[key];
  }
  return environment;
}

function isolatedRoot(mode: Mode): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-03-'));
  for (const file of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) copyFileSync(join(projectRoot, file), join(root, file));
  for (const directory of ['data', 'public', 'scripts', 'src']) cpSync(join(projectRoot, directory), join(root, directory), { recursive: true });
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  if (mode === 'wrong-card-palette') {
    const components = join(root, 'src/styles/components.css');
    writeFileSync(components, `${readFileSync(components, 'utf8')}\nsection[data-day] { background: #220000; }\n`);
  }
  if (mode === 'raw-unknown-page') {
    writeFileSync(join(root, 'src/pages/404.astro'), `---\nimport Base from '../layouts/Base.astro';\n---\n<Base locale="es" title="Error" currentPath="/404/">\n  <h1>AccessDenied</h1>\n</Base>\n`);
  }
  if (mode === 'forecast-before-report') {
    const capture = join(root, 'src/components/ReportCapture.astro');
    const forecastCall = visibleBaseline(root).today.call;
    writeFileSync(capture, readFileSync(capture, 'utf8').replace(
      '  <noscript>',
      `  <p>${forecastCall}</p>\n  <noscript>`,
    ));
  }
  return root;
}

function build(root: string): void {
  const result = spawnSync(join(projectRoot, 'node_modules/.bin/astro'), ['build'], {
    cwd: root, env: credentialFreeEnvironment(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `test fixture error: la construcción real falló antes de la observación:\n${result.stdout}${result.stderr}`);
}

function playaVenaoRoute(root: string, yesterday = false): string {
  const file = readdirSync(join(root, 'dist', 'spots')).find((entry) => entry === 'playa-venao.html');
  assert.ok(file, 'test fixture error: la construcción real no contiene la página de Playa Venao');
  return yesterday ? `/spots/${file.replace('.html', '/ayer.html')}` : `/spots/${file}`;
}

function visibleBaseline(root: string): VisibleBaseline {
  type Call = {
    spot_id: string;
    score_q: number;
    call_es: string;
    size_band?: 'flat' | 'ankle_knee' | 'knee_waist' | 'waist_chest' | 'chest_head' | 'head_overhead' | 'double_overhead_plus';
    size_range_m?: [number, number];
    wind_state?: 'clean' | 'choppy' | 'blown_out';
    best_window?: { start: string; end: string };
  };
  const surface = JSON.parse(readFileSync(join(root, 'data/published-surface.json'), 'utf8')) as {
    current: { surf_date: string; calls: Call[]; days: [unknown, { spots: Call[] }] };
    dawn_receipts: { surf_date: string; calls: Call[] }[];
  };
  const labels = {
    flat: 'Plano', ankle_knee: 'Tobillo a rodilla', knee_waist: 'Rodilla a cintura', waist_chest: 'Cintura a pecho',
    chest_head: 'Pecho a cabeza', head_overhead: 'Cabeza a un metro más', double_overhead_plus: 'Doble o más',
  } as const;
  const wind = { clean: 'viento limpio', choppy: 'viento picado', blown_out: 'viento destrozado' } as const;
  const hour = (value: string) => value.replace(/^0(\d:)/, '$1');
  const find = (calls: Call[], day: string, detailed: boolean): VisibleFact => {
    const call = calls.find((candidate) => candidate.spot_id === 'playa-venao');
    assert.ok(call, `test fixture error: falta Playa Venao en el llamado de ${day}`);
    const fact: VisibleFact = { score: String(call.score_q), call: call.call_es };
    if (!detailed) return fact;
    assert.ok(call.size_band && call.size_range_m && call.wind_state && call.best_window, `test fixture error: faltan los detalles de ${day}`);
    fact.size = call.size_band === 'double_overhead_plus'
      ? `${labels[call.size_band]} ≈${call.size_range_m[0].toFixed(1)} m o más`
      : `${labels[call.size_band]} ≈${call.size_range_m[0].toFixed(1)}–${call.size_range_m[1].toFixed(1)} m`;
    fact.wind = wind[call.wind_state];
    fact.window = `Ventana ${hour(call.best_window.start)}–${hour(call.best_window.end)}`;
    return fact;
  };
  const previous = new Date(`${surface.current.surf_date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const priorDate = previous.toISOString().slice(0, 10);
  const receipt = surface.dawn_receipts.find((candidate) => candidate.surf_date === priorDate);
  assert.ok(receipt, `test fixture error: falta el recibo público de ${priorDate}`);
  return {
    today: find(surface.current.calls, 'hoy', true),
    tomorrow: find(surface.current.days[1].spots, 'mañana', true),
    yesterday: find(receipt.calls, 'ayer', false),
    backHref: '/',
    reportHref: '/spots/playa-venao/reportar/',
    spotPath: '/spots/playa-venao/',
    yesterdayPath: '/spots/playa-venao/ayer/',
  };
}

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') return reject(new Error('test fixture error: no se pudo reservar un puerto'));
      server.close((error) => error === undefined ? resolve(address.port) : reject(error));
    });
  });
}

async function waitFor(url: string, preview: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`test fixture error: la vista previa terminó con ${preview.exitCode}`);
    try {
      const ready = await new Promise<boolean>((resolve, reject) => {
        const request = get(url, (response) => { response.resume(); resolve((response.statusCode ?? 500) < 400); });
        request.once('error', reject);
        request.setTimeout(500, () => request.destroy(new Error('la vista previa tardó demasiado')));
      });
      if (ready) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`test fixture error: la vista previa no abrió: ${String(lastError)}`);
}

async function paletteOf(page: Page): Promise<Palette> {
  return page.evaluate(`(() => {
    const resolve = (name) => {
      const marker = document.createElement('i');
      marker.style.backgroundColor = 'var(' + name + ')';
      document.body.append(marker);
      const value = getComputedStyle(marker).backgroundColor;
      marker.remove();
      return value;
    };
    const root = getComputedStyle(document.documentElement);
    return { bodyBackground: getComputedStyle(document.body).backgroundColor, bg: resolve('--bg'), ink: resolve('--ink'), surface: resolve('--surface') };
  })()`) as Promise<Palette>;
}

async function audit(page: Page, kind: 'spot' | 'ayer', expected: Palette, baseline: VisibleBaseline): Promise<PageAudit> {
  return page.evaluate(`(() => {
    const expected = ${JSON.stringify(expected)};
    const baseline = ${JSON.stringify(baseline)};
    const parse = (value) => (value.match(/rgba?\\(([^)]+)\\)/i)?.[1] ?? '0,0,0,1').split(',').map(Number);
    const compact = (value) => value.replace(/\\s+/g, ' ').trim();
    const same = (a, b) => a.length === b.length && a.every((value, index) => Math.round(value) === Math.round(b[index]));
    const luminance = ([r, g, b]) => [r, g, b].map((n) => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const resolved = (name) => { const marker = document.createElement('i'); marker.style.backgroundColor = 'var(' + name + ')'; document.body.append(marker); const value = getComputedStyle(marker).backgroundColor; marker.remove(); return value; };
    const backdropFor = (element) => {
      let current = element;
      while (current) {
        const colour = parse(getComputedStyle(current).backgroundColor);
        if ((colour[3] ?? 1) > 0) return colour;
        current = current.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor);
    };
    const findings = [];
    const bodyBackground = getComputedStyle(document.body).backgroundColor;
    const rootPaletteMatches = bodyBackground === expected.bodyBackground && resolved('--bg') === expected.bg && resolved('--ink') === expected.ink;
    const cards = [...document.querySelectorAll('section')];
    const cardsMatch = cards.every((card) => same(parse(getComputedStyle(card).backgroundColor), parse(expected.surface)));
    const hasHomePalette = rootPaletteMatches && cardsMatch;
    if (!hasHomePalette) findings.push('la tarjeta o el fondo no conservan la paleta exacta de la portada');
    const reading = [...document.querySelectorAll('h1, h2, section p, section time')].filter((element) => compact(element.textContent || '').length > 0);
    if (reading.length === 0) findings.push('la página no muestra palabras para leer');
    for (const element of reading) {
      const ratio = contrast(parse(getComputedStyle(element).color), backdropFor(element));
      if (ratio < 7) findings.push('lectura: "' + compact(element.textContent || '').slice(0, 42) + '" queda en ' + ratio.toFixed(2) + ':1 contra su fondo real, piso 7:1');
    }
    const controls = [...document.querySelectorAll('a, button')].filter((element) => compact(element.textContent || '').length > 0);
    for (const control of controls) {
      const box = control.getBoundingClientRect();
      if (box.width < 44 || box.height < 44) findings.push('control: "' + compact(control.textContent || '') + '" mide ' + box.width.toFixed(0) + 'x' + box.height.toFixed(0) + 'px, piso 44x44px');
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) findings.push('la página tiene scroll horizontal');
    if (document.readyState !== 'complete' || document.querySelector('[aria-busy="true"]')) findings.push('la página no llega lista');
    if ('${kind}' === 'spot') {
      for (const [day, fact] of Object.entries({ today: baseline.today, tomorrow: baseline.tomorrow })) {
        const card = document.querySelector('section[data-day="' + day + '"]');
        const text = compact(card?.textContent || '');
        for (const [name, value] of Object.entries(fact)) {
          if (!text.includes(value)) findings.push('la referencia pública de ' + day + ' cambió en ' + name);
        }
      }
      const report = document.querySelector('a.cta');
      if (report?.getAttribute('href') !== baseline.reportHref) findings.push('la acción de reportar cambió de ruta');
      if (document.querySelector('[data-field="back-to-list"]')?.getAttribute('href') !== baseline.backHref) findings.push('el enlace de vuelta cambió de ruta');
      if (document.querySelector('link[rel="alternate"][hreflang="es"]')?.getAttribute('href') !== baseline.spotPath) findings.push('la ruta pública de Playa Venao cambió');
    } else {
      const text = compact(document.body.textContent || '');
      for (const [name, value] of Object.entries(baseline.yesterday)) {
        if (!text.includes(value)) findings.push('el recibo de ayer cambió en ' + name);
      }
      if (document.querySelector('link[rel="alternate"][hreflang="es"]')?.getAttribute('href') !== baseline.yesterdayPath) findings.push('la ruta pública del recibo de ayer cambió');
    }
    return { findings, hasHomePalette };
  })()`) as Promise<PageAudit>;
}

async function auditReportSurface(page: Page, kind: 'unknown' | 'capture' | 'reveal', expected: Palette): Promise<ReportAudit> {
  return page.evaluate(`(() => {
    const expected = ${JSON.stringify(expected)};
    const kind = '${kind}';
    const forecastValues = JSON.parse(document.documentElement.dataset.testForecastValues || '[]');
    const parse = (value) => (value.match(/rgba?\\(([^)]+)\\)/i)?.[1] ?? '0,0,0,1').split(',').map(Number);
    const compact = (value) => value.replace(/\\s+/g, ' ').trim();
    const luminance = (rgb) => rgb.map((n = 0) => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const resolve = (name) => { const marker = document.createElement('i'); marker.style.backgroundColor = 'var(' + name + ')'; document.body.append(marker); const value = getComputedStyle(marker).backgroundColor; marker.remove(); return value; };
    const backdropFor = (element) => {
      let current = element;
      while (current) {
        const colour = parse(getComputedStyle(current).backgroundColor);
        if ((colour[3] ?? 1) > 0) return colour;
        current = current.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor);
    };
    const findings = [];
    const hasHomePalette = getComputedStyle(document.body).backgroundColor === expected.bodyBackground
      && resolve('--bg') === expected.bg && resolve('--ink') === expected.ink;
    if (!hasHomePalette) findings.push('el fondo no conserva la paleta exacta de la portada');
    const reading = [...document.querySelectorAll('h1, h2, p, legend, label, a, button')]
      .filter((element) => compact(element.textContent || '').length > 0);
    if (reading.length === 0) findings.push('la página llega en blanco');
    for (const element of reading) {
      const ratio = contrast(parse(getComputedStyle(element).color), backdropFor(element));
      if (ratio < 4.5) findings.push('lectura: "' + compact(element.textContent || '').slice(0, 42) + '" queda en ' + ratio.toFixed(2) + ':1 contra su fondo real, piso 4.5:1');
    }
    for (const control of [...document.querySelectorAll('a, button, label:has(input)')]) {
      const box = control.getBoundingClientRect();
      if (box.width < 44 || box.height < 44) findings.push('control: "' + compact(control.textContent || '') + '" mide ' + box.width.toFixed(0) + 'x' + box.height.toFixed(0) + 'px, piso 44x44px');
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) findings.push('la página tiene scroll horizontal');
    if (document.readyState !== 'complete' || document.querySelector('[aria-busy="true"]')) findings.push('la página no llega lista');
    const words = compact(document.body.textContent || '');
    if (kind === 'unknown') {
      if (!words.includes('No encontramos esa playa')) findings.push('la playa inexistente no explica qué pasó');
      if (/(AccessDenied|NoSuchKey|Internal Server Error|^Not Found$)/iu.test(words)) findings.push('la playa inexistente muestra un error crudo');
      const back = document.querySelector('[data-field="back-to-list"]');
      if (back?.getAttribute('href') !== '/') findings.push('la playa inexistente no ofrece volver a la lista');
    }
    if (kind === 'reveal') {
      const shell = document.querySelector('[data-reveal-shell]');
      if (!shell) findings.push('la pantalla posterior al reporte no ofrece su lugar para la respuesta');
      if (compact(shell?.textContent || '').length === 0) findings.push('la pantalla posterior al reporte llega vacía');
    }
    if (kind !== 'unknown' && (document.querySelector('[data-forecast-score], [data-forecast-call], [data-forecast-size], [data-forecast-wind]') || forecastValues.some((value) => words.includes(value)))) {
      findings.push('la pantalla de reportar adelanta la llamada del pronóstico');
    }
    return { findings, hasHomePalette };
  })()`) as Promise<ReportAudit>;
}

async function placeForecastOracle(page: Page, forecastValues: string[]): Promise<void> {
  await page.evaluate((values) => { document.documentElement.dataset.testForecastValues = JSON.stringify(values); }, forecastValues);
}

async function reportState(page: Page): Promise<ReportState> {
  return page.evaluate(`(() => {
    const findings = [];
    const choice = document.querySelector('input[type="radio"]');
    const label = choice?.closest('label');
    const action = document.querySelector('button[type="submit"]');
    if (!(choice instanceof HTMLInputElement) || !(label instanceof HTMLLabelElement)) {
      findings.push('la pantalla de reportar no ofrece una selección visible');
      return { selectionIsVisible: false, disabledActionIsVisible: false, findings };
    }
    const before = {
      borderColor: getComputedStyle(label).borderColor,
      backgroundColor: getComputedStyle(label).backgroundColor,
      boxShadow: getComputedStyle(label).boxShadow,
    };
    choice.click();
    const after = {
      borderColor: getComputedStyle(label).borderColor,
      backgroundColor: getComputedStyle(label).backgroundColor,
      boxShadow: getComputedStyle(label).boxShadow,
    };
    const nativeMark = getComputedStyle(choice).appearance !== 'none';
    const labelChanged = before.borderColor !== after.borderColor || before.backgroundColor !== after.backgroundColor || before.boxShadow !== after.boxShadow;
    const selectionIsVisible = choice.checked && nativeMark && labelChanged && label.getBoundingClientRect().height >= 44;
    const disabledActionIsVisible = action instanceof HTMLButtonElement && action.disabled && action.getBoundingClientRect().height >= 44;
    if (!selectionIsVisible) findings.push('la selección de reportar depende solo del color o no se puede tocar');
    if (!disabledActionIsVisible) findings.push('la acción todavía no disponible no se entiende ni se puede leer');
    return { selectionIsVisible, disabledActionIsVisible, findings };
  })()`) as Promise<ReportState>;
}

function openedSurface(world: SurfaceWorld): OpenedSurface {
  const surface = opened.get(world);
  assert.ok(surface, 'test fixture error: todavía no se abrió una superficie');
  return surface;
}

function openedReportSurfaces(world: SurfaceWorld): OpenedReportSurfaces {
  const surfaces = openedReports.get(world);
  assert.ok(surfaces, 'test fixture error: todavía no se abrieron las pantallas de reportar');
  return surfaces;
}

async function assertStill(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  const moving = await page.evaluate(`(() => [...document.querySelectorAll('*')].filter((element) => { const style = getComputedStyle(element); return style.transitionDuration !== '0s' || style.animationName !== 'none'; }).map((element) => element.tagName.toLowerCase()))()`) as string[];
  assert.deepEqual(moving, [], `movimiento bajo preferencia reducida: ${moving.join(', ')}`);
}

function prepare(world: SurfaceWorld, mode: Mode): void { prepared.set(world, { root: isolatedRoot(mode), mode }); }

Given('el sitio de Playa Venao está listo para visitar', function (this: SurfaceWorld) { prepare(this, 'normal'); });
Given('una copia del sitio de Playa Venao con sus tarjetas pintadas de otro color', function (this: SurfaceWorld) { prepare(this, 'wrong-card-palette'); });
Given('el sitio de Playa Venao y la página que no existe están listos para visitar', function (this: SurfaceWorld) { prepare(this, 'normal'); });
Given('una copia del sitio donde una playa inexistente no explica qué pasó', function (this: SurfaceWorld) { prepare(this, 'raw-unknown-page'); });
Given('una copia del sitio donde reportar recibe la llamada del pronóstico antes de tiempo', function (this: SurfaceWorld) { prepare(this, 'forecast-before-report'); });

When('el surfista abre la página de Playa Venao y su recibo de ayer a {int} px, con tema {string}', async function (this: SurfaceWorld, width: number, theme: string) {
  const fixture = prepared.get(this);
  assert.ok(fixture, 'test fixture error: falta el sitio preparado');
  build(fixture.root);
  const port = await unusedPort();
  const preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: fixture.root, env: credentialFreeEnvironment(), stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'load' });
  const homePalette = await paletteOf(page);
  const baseline = visibleBaseline(fixture.root);
  const spotUrl = `${base}${playaVenaoRoute(fixture.root)}`;
  const yesterdayUrl = `${base}${playaVenaoRoute(fixture.root, true)}`;
  await page.goto(spotUrl, { waitUntil: 'load' });
  const spotAudit = await audit(page, 'spot', homePalette, baseline);
  await page.goto(yesterdayUrl, { waitUntil: 'load' });
  const yesterdayAudit = await audit(page, 'ayer', homePalette, baseline);
  opened.set(this, { root: fixture.root, spotUrl, yesterdayUrl, preview, browser, page, homePalette, baseline, spotAudit, yesterdayAudit });
});

Then('las dos páginas conservan el agua tropical y el margen de lectura bajo el sol', function (this: SurfaceWorld) {
  const surface = openedSurface(this);
  assert.deepEqual(surface.spotAudit.findings, [], surface.spotAudit.findings.join('; '));
  assert.deepEqual(surface.yesterdayAudit.findings, [], surface.yesterdayAudit.findings.join('; '));
});

Then('la página de Playa Venao conserva sus llamados de hoy y mañana, su tamaño y su ventana', function (this: SurfaceWorld) {
  const { spotAudit } = openedSurface(this);
  assert.deepEqual(spotAudit.findings, [], spotAudit.findings.join('; '));
});

Then('las dos páginas caben en el teléfono, conservan controles alcanzables y llegan listas', function (this: SurfaceWorld) {
  const surface = openedSurface(this);
  assert.deepEqual(surface.spotAudit.findings, [], surface.spotAudit.findings.join('; '));
  assert.deepEqual(surface.yesterdayAudit.findings, [], surface.yesterdayAudit.findings.join('; '));
});

Then('con el movimiento reducido activado, las dos páginas se quedan quietas', async function (this: SurfaceWorld) {
  const surface = openedSurface(this);
  await assertStill(surface.page, surface.spotUrl);
  await assertStill(surface.page, surface.yesterdayUrl);
});

Then('la comprobación rechaza las tarjetas porque ya no conservan la paleta de la portada', function (this: SurfaceWorld) {
  const { spotAudit } = openedSurface(this);
  assert.ok(spotAudit.findings.some((finding) => finding.includes('no conservan la paleta exacta de la portada')), `se esperaba el rechazo de paleta; se obtuvo ${spotAudit.findings.join('; ')}`);
});

When('el surfista abre la página que no existe y las dos pantallas de reportar de Playa Venao en un teléfono estrecho, con tema {string}', async function (this: SurfaceWorld, theme: string) {
  const fixture = prepared.get(this);
  assert.ok(fixture, 'test fixture error: falta el sitio preparado');
  build(fixture.root);
  const port = await unusedPort();
  const preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: fixture.root, env: credentialFreeEnvironment(), stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'load' });
  const homePalette = await paletteOf(page);
  const baseline = visibleBaseline(fixture.root);
  const forecastValues = [...new Set([...Object.values(baseline.today), ...Object.values(baseline.tomorrow)].filter((value) => value.length > 1))];
  const unknownUrl = `${base}/404.html`;
  const captureUrl = `${base}/spots/playa-venao/reportar.html`;
  const revealUrl = `${base}/spots/playa-venao/reportado.html`;
  await page.goto(unknownUrl, { waitUntil: 'load' });
  await placeForecastOracle(page, forecastValues);
  const unknownAudit = await auditReportSurface(page, 'unknown', homePalette);
  await page.goto(captureUrl, { waitUntil: 'load' });
  await placeForecastOracle(page, forecastValues);
  const captureAudit = await auditReportSurface(page, 'capture', homePalette);
  const reportStateResult = await reportState(page);
  await page.goto(revealUrl, { waitUntil: 'load' });
  await placeForecastOracle(page, forecastValues);
  const revealAudit = await auditReportSurface(page, 'reveal', homePalette);
  openedReports.set(this, {
    unknownUrl, captureUrl, revealUrl, preview, browser, page,
    unknownAudit, captureAudit, revealAudit, reportState: reportStateResult,
  });
});

Then('las tres pantallas conservan el agua tropical, la lectura bajo el sol y una llegada honesta', function (this: SurfaceWorld) {
  const surfaces = openedReportSurfaces(this);
  for (const audit of [surfaces.unknownAudit, surfaces.captureAudit, surfaces.revealAudit]) {
    assert.deepEqual(audit.findings, [], audit.findings.join('; '));
  }
});

Then('los controles de reportar muestran la selección y la indisponibilidad sin depender solo del color', function (this: SurfaceWorld) {
  const state = openedReportSurfaces(this).reportState;
  assert.ok(state.selectionIsVisible && state.disabledActionIsVisible, state.findings.join('; '));
});

Then('las pantallas de reportar no adelantan la llamada del pronóstico', function (this: SurfaceWorld) {
  const { captureAudit, revealAudit } = openedReportSurfaces(this);
  assert.deepEqual(captureAudit.findings, [], captureAudit.findings.join('; '));
  assert.deepEqual(revealAudit.findings, [], revealAudit.findings.join('; '));
});

Then('con el movimiento reducido activado, las tres pantallas se quedan quietas', async function (this: SurfaceWorld) {
  const surfaces = openedReportSurfaces(this);
  for (const url of [surfaces.unknownUrl, surfaces.captureUrl, surfaces.revealUrl]) await assertStill(surfaces.page, url);
});

Then('la comprobación rechaza la página porque deja al surfista sin una explicación humana', function (this: SurfaceWorld) {
  const { unknownAudit } = openedReportSurfaces(this);
  assert.ok(unknownAudit.findings.some((finding) => finding.includes('no explica qué pasó') || finding.includes('error crudo')), `se esperaba el rechazo de la página desconocida; se obtuvo ${unknownAudit.findings.join('; ')}`);
});

Then('la comprobación rechaza las pantallas de reportar antes de que adelanten la llamada', function (this: SurfaceWorld) {
  const { captureAudit, revealAudit } = openedReportSurfaces(this);
  const findings = [...captureAudit.findings, ...revealAudit.findings];
  assert.ok(findings.some((finding) => finding.includes('adelanta la llamada del pronóstico')), `se esperaba el rechazo de adelantar la llamada; se obtuvo ${findings.join('; ')}`);
});

After(async function (this: SurfaceWorld) {
  const surface = opened.get(this);
  await surface?.browser.close();
  if (surface?.preview.exitCode === null) {
    await new Promise<void>((resolve) => { surface.preview.once('exit', () => resolve()); surface.preview.kill(); setTimeout(resolve, 1_000).unref(); });
  }
  const reportSurfaces = openedReports.get(this);
  await reportSurfaces?.browser.close();
  if (reportSurfaces?.preview.exitCode === null) {
    await new Promise<void>((resolve) => { reportSurfaces.preview.once('exit', () => resolve()); reportSurfaces.preview.kill(); setTimeout(resolve, 1_000).unref(); });
  }
  const fixture = prepared.get(this);
  if (fixture) rmSync(fixture.root, { recursive: true, force: true });
});
