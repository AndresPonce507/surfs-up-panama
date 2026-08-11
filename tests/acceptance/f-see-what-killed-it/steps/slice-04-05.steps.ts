// Slice-04/05 acceptance driving adapter.  The test builds a copied production
// tree, serves its emitted HTML over HTTP, and reads it in Chromium.  It never
// writes the worktree or manufactures rendered markup.
import { AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
type Surface = { readonly current: { readonly calls: readonly { readonly spot_id: string }[] } };
type BuiltSurface = { readonly root: string; readonly url: string; readonly server: Server; readonly spotId: string };
let built: BuiltSurface | undefined;

const mornings = [
  'una mañana publicada con las cuatro razones de cada hora',
  'una mañana publicada con el viento ausente en la hora elegida',
  'una mañana publicada con horas distintas alrededor de su mejor ventana',
  'una mañana publicada donde la marea es menor pero el viento fue el punto débil',
  'una mañana publicada con cuatro razones para hoy y mañana',
  'una mañana publicada con una ventana ausente y otra con un dato ausente',
  'una mañana publicada con la orientación declarada de una playa',
  'una mañana publicada con un diagrama local de orientación',
  'dos playas publicadas con orientaciones distintas',
];
for (const sentence of mornings) Given(sentence, function () {});

When('el surfista abre la playa con sus cuatro razones a {int} px', function (_width: number) {});
When('el surfista abre la playa con su diagrama a {int} px', function (_width: number) {});

function freePort(): Promise<number> {
  return new Promise((ready, fail) => {
    const probe = createNetServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      assert.ok(address && typeof address !== 'string', 'test setup error: no local port');
      probe.close((error) => error ? fail(error) : ready(address.port));
    });
  });
}

function copiedProductionTree(): string {
  const target = mkdtempSync(join(tmpdir(), 'surfs-up-slice-04-05-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', 'data', 'public', 'scripts', 'src']) {
    cpSync(join(root, name), join(target, name), { recursive: true });
  }
  symlinkSync(join(root, 'node_modules'), join(target, 'node_modules'), 'dir');
  // The checked-in sample is deliberately yesterday's receipt.  Make the
  // copied reading surface a fresh civil morning so the production verifier is
  // exercised and failures reach the Slice-04/05 oracle rather than staleness.
  const path = join(target, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as { current: { surf_date: string; published_at: string; days: [{ date: string }, { date: string }] } };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tomorrow = new Date(`${today}T12:00:00.000Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  surface.current.surf_date = today;
  surface.current.published_at = `${today}T12:05:00.000Z`;
  surface.current.days[0].date = today;
  surface.current.days[1].date = tomorrow.toISOString().slice(0, 10);
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
  return target;
}

function emittedFile(dist: string, request: string): string | undefined {
  const clean = normalize(request.replace(/^\/+/, '')).replace(/^\.\.(?:[/\\]|$)/, '');
  const base = resolve(dist, clean);
  if (!base.startsWith(`${resolve(dist)}${sep}`)) return undefined;
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    try { return readFileSync(candidate, 'utf8') && candidate; } catch { /* try next */ }
  }
  return undefined;
}

async function buildAndServe(): Promise<BuiltSurface> {
  if (built) return built;
  const copy = copiedProductionTree();
  const result = spawnSync('npm', ['run', 'build'], { cwd: copy, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, `test setup error: production build failed before an acceptance oracle:\n${result.stdout}\n${result.stderr}`);
  const surface = JSON.parse(readFileSync(join(copy, 'data/published-surface.json'), 'utf8')) as Surface;
  const spotId = surface.current.calls[0]?.spot_id;
  assert.ok(spotId, 'test setup error: the published morning contains no spot to read');
  const dist = join(copy, 'dist');
  const server = createServer((request, response) => {
    const file = emittedFile(dist, new URL(request.url ?? '/', 'http://local').pathname);
    if (!file) { response.writeHead(404).end('not found'); return; }
    response.writeHead(200, { 'content-type': extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  const port = await freePort();
  await new Promise<void>((ready, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ready); });
  built = { root: copy, url: `http://127.0.0.1:${port}`, server, spotId };
  return built;
}

async function reading(): Promise<{ readonly page: Page; readonly browser: Browser; readonly built: BuiltSurface }> {
  const active = await buildAndServe();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const response = await page.goto(`${active.url}/spots/${active.spotId}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'test setup error: emitted spot page did not arrive over HTTP');
  return { page, browser, built: active };
}

async function assertVisible(selector: string, how: string): Promise<void> {
  const { page, browser } = await reading();
  try {
    const observation = await page.locator(selector).count();
    assert.ok(observation > 0, `WHAT: falta ${selector} en la página ya publicada. WHY: el surfista necesita esta explicación para decidir. HOW: ${how}`);
  } finally { await browser.close(); }
}

Then('la playa no recibe un desglose inventado cuando la mañana todavía no lo publicó', async function () {
  await assertVisible('[data-field="breakdown"]', 'X9 debe publicar las cuatro razones por hora antes de que la página las muestre.');
});
Then('el viento ausente no se convierte en una razón buena ni en una cifra', async function () {
  await assertVisible('[data-field="breakdown"] [data-factor="wind"][data-state="missing"]', 'la ausencia publicada debe quedar escrita como ausencia, sin barra ni cifra.');
});
Then('cada día puede mostrar solo las cuatro razones de su propia ventana', async function () {
  await assertVisible('section[data-day="today"] [data-field="breakdown"] [data-hour]', 'el lector de publicación debe conservar una sola hora ya elegida por la mañana.');
});
Then('la flecha no cambia el punto débil que publicó la mañana', async function () {
  await assertVisible('[data-field="breakdown"] [data-weakest="true"]', 'la flecha debe seguir el punto débil publicado, no una barra menor.');
});
Then('el surfista puede leer las cuatro razones de cada día y su punto débil escrito', async function () {
  await assertVisible('section[data-day="today"] [data-field="breakdown"] [data-factor]', 'el componente estático debe mostrar cuatro filas con palabras y la flecha escrita.');
});
Then('la ausencia se lee como ausencia y el día sin ventana no deja un desglose vacío', async function () {
  await assertVisible('section[data-day="tomorrow"] [data-field="breakdown"]', 'el documento emitido debe tener el desglose sólo en los días que lo pueden explicar.');
});
Then('la playa no recibe un diagrama si falta la procedencia que lo hace honesto', async function () {
  await assertVisible('[data-field="orientation-diagram"][data-attribution]', 'el manifiesto aprobado debe emparejar procedencia visible y activo local.');
});
Then('la playa no recibe un mapa que dependa de otra visita', async function () {
  await assertVisible('[data-field="orientation-diagram"] img[loading="lazy"][src^="/maps/"]', 'el activo debe llegar local y ya preparado, sin mosaicos ni librería de mapa.');
});
Then('ninguna playa recibe la orientación de la otra', async function () {
  await assertVisible('[data-field="orientation-diagram"] [data-orientation]', 'el diagrama emitido debe declarar la orientación que corresponde sólo a esa playa.');
});
Then('el surfista ve un diagrama tranquilo con su explicación escrita', async function () {
  await assertVisible('[data-field="orientation-diagram"] figcaption', 'la figura debe reservar su lugar y explicar la orientación en español.');
});
Then('el diagrama espera fuera de la primera mirada sin tapar la página', async function () {
  await assertVisible('[data-field="orientation-diagram"] img[loading="lazy"]', 'el diagrama local debe cargar tarde sin añadir una ruta ni tapar el llamado a reportar.');
});
Then('aun sin su imagen la playa conserva un cuadro explicado y tranquilo', async function () {
  await assertVisible('[data-field="orientation-diagram"] [data-frame="reserved"]', 'el marco reservado y el texto alternativo deben sobrevivir a una imagen no disponible.');
});

export async function disposeSlice0405Harness(): Promise<void> {
  if (!built) return;
  const active = built; built = undefined;
  await new Promise<void>((done) => active.server.close(() => done()));
  rmSync(active.root, { recursive: true, force: true });
}

AfterAll({ timeout: 30_000 }, disposeSlice0405Harness);
