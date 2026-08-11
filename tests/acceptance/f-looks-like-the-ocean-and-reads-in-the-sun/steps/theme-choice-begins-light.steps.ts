// Slice-07 acceptance boundary. This drives the built public site, never a
// theme helper: a visitor's first paint, control, saved choice, and browser
// chrome are the observable contract. One compact browser matrix proves the
// environments; the route sweep reads every emitted document so it does not
// multiply full E2E journeys by route count.
import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';

type ThemeWorld = object;
type Visit = { browser: Browser; page: Page; label: string };
type Publication = { preview: ChildProcess; previewRoot: string; daemonPid: number; url: string; visits: Visit[]; copiedDist?: string };
type Paint = { background: string; firstPaint: string | undefined; themeColor: string | undefined; scrollWidth: number; clientWidth: number };

const projectRoot = process.cwd();
const publications = new WeakMap<ThemeWorld, Publication>();
const invalidChoices = new WeakMap<ThemeWorld, string>();

function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) delete environment[key];
  }
  return environment;
}

async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close();
      if (address === null || typeof address === 'string') reject(new Error('test fixture error: no se pudo reservar un puerto local'));
      else resolve(address.port);
    });
  });
}

async function waitFor(url: string, output: () => string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* preview is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`test fixture error: la publicación no se abrió a tiempo:\n${output()}`);
}

function buildPublication(): void {
  const result = spawnSync('npm', ['run', 'build'], { cwd: projectRoot, env: cleanEnvironment(), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, `test fixture error: la construcción publicada falló antes de observar el tema:\n${output}`);
  assert.match(output, /page weight|page-weight|weight gate/i, `test fixture error: la construcción no informó su límite de peso:\n${output}`);
}

async function publish(world: ThemeWorld): Promise<Publication> {
  buildPublication();
  // Astro preview deliberately daemonises. Give every scenario its own small
  // root so one browser proof never takes over another scenario's preview
  // daemon or the user's working tree.
  const previewRoot = mkdtempSync(join(tmpdir(), 'surf-theme-preview-'));
  cpSync(join(projectRoot, 'dist'), join(previewRoot, 'dist'), { recursive: true });
  symlinkSync(join(projectRoot, 'node_modules'), join(previewRoot, 'node_modules'), 'dir');
  writeFileSync(join(previewRoot, 'package.json'), '{"private":true,"type":"module"}\n');
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const preview = spawn(join(projectRoot, 'node_modules/.bin/astro'), ['preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: previewRoot,
    env: cleanEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let daemonPid: number | undefined;
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    const match = /\(pid (\d+)\)/.exec(output);
    if (match?.[1] !== undefined) daemonPid = Number(match[1]);
  };
  preview.stdout.on('data', capture);
  preview.stderr.on('data', capture);
  await waitFor(url, () => output);
  const pidDeadline = Date.now() + 5_000;
  while (daemonPid === undefined && Date.now() < pidDeadline) await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(daemonPid !== undefined, `test fixture error: la publicación llegó, pero Astro no informó su pid:\n${output}`);
  const publication = { preview, previewRoot, daemonPid, url, visits: [] };
  publications.set(world, publication);
  return publication;
}

function required(world: ThemeWorld): Publication {
  const publication = publications.get(world);
  assert.ok(publication, 'test fixture error: falta la publicación construida');
  return publication;
}

async function visit(
  world: ThemeWorld,
  engine: BrowserType,
  label: string,
  path: string,
  width: number,
  scheme: 'light' | 'dark',
  javaScriptEnabled = true,
  storedChoice?: string,
): Promise<Page> {
  const publication = required(world);
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: 'reduce', javaScriptEnabled });
  await context.addInitScript((choice) => {
    if (choice !== undefined) localStorage.setItem('surfs-up-theme', choice);
    const firstFrame = () => {
      if (document.body === null) requestAnimationFrame(firstFrame);
      else (window as Window & { __firstThemePaint?: string }).__firstThemePaint = getComputedStyle(document.body).backgroundColor;
    };
    requestAnimationFrame(firstFrame);
  }, storedChoice);
  const page = await context.newPage();
  const response = await page.goto(`${publication.url}${path}`, { waitUntil: 'domcontentloaded' });
  assert.ok(response?.ok(), `${label}: la ruta ${path} no llegó como publicación`);
  publication.visits.push({ browser, page, label });
  return page;
}

async function paint(page: Page): Promise<Paint> {
  return page.evaluate(() => {
    const background = getComputedStyle(document.body).backgroundColor;
    const active = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
      .find((meta) => meta.media === '' || matchMedia(meta.media).matches)?.content;
    return {
      background,
      firstPaint: (window as Window & { __firstThemePaint?: string }).__firstThemePaint,
      themeColor: active,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

async function themeButton(page: Page) {
  const button = page.locator('[data-theme-toggle]');
  assert.equal(await button.count(), 1, 'la publicación todavía no ofrece un único control de tema arriba a la izquierda');
  return button;
}

async function assertControl(page: Page, expectedName: string): Promise<void> {
  const button = await themeButton(page);
  await assert.doesNotReject(async () => button.getAttribute('aria-label'));
  assert.equal(await button.getAttribute('aria-label'), expectedName, `el control debe anunciar “${expectedName}”`);
  const box = await button.boundingBox();
  assert.ok(box !== null, 'el control de tema no está visible');
  assert.ok(box.width >= 44 && box.height >= 44, `el control mide ${Math.round(box.width)}×${Math.round(box.height)}; necesita al menos 44×44`);
  assert.ok(box.x <= 32 && box.y <= 32, `el control quedó en ${Math.round(box.x)},${Math.round(box.y)}; debe empezar arriba a la izquierda`);
}

async function assertReadableStaticControl(page: Page): Promise<void> {
  const button = await themeButton(page);
  const quality = await button.evaluate((element) => {
    const parse = (value: string): [number, number, number] | null => {
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const values = match[1]!.split(',').slice(0, 3).map(Number);
      return values.length === 3 && values.every(Number.isFinite) ? [values[0]!, values[1]!, values[2]!] : null;
    };
    const luminosity = ([r, g, b]: [number, number, number]) => {
      const channel = (n: number) => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const text = parse(getComputedStyle(element).color);
    let background: [number, number, number] | null = null;
    for (let parent: Element | null = element; parent !== null && background === null; parent = parent.parentElement) {
      const candidate = parse(getComputedStyle(parent).backgroundColor);
      if (candidate !== null && getComputedStyle(parent).backgroundColor !== 'rgba(0, 0, 0, 0)') background = candidate;
    }
    if (text === null || background === null) return { ratio: 0, moving: true };
    const ratio = (Math.max(luminosity(text), luminosity(background)) + 0.05) / (Math.min(luminosity(text), luminosity(background)) + 0.05);
    const style = getComputedStyle(element);
    return { ratio, moving: style.animationName !== 'none' || style.transitionDuration !== '0s' };
  });
  assert.ok(quality.ratio >= 4.5, `el texto del control queda en ${quality.ratio.toFixed(2)}:1; necesita 4.5:1`);
  assert.equal(quality.moving, false, 'con movimiento reducido el control no puede animarse');
}

function emittedHtml(): string[] {
  const dist = join(projectRoot, 'dist');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.html')) files.push(path);
    }
  };
  walk(dist);
  return files;
}

function assertRouteSweep(): string[] {
  const routes = emittedHtml();
  const english = routes.filter((path) => relative(join(projectRoot, 'dist'), path).startsWith('en/'));
  assert.ok(english.length > 0, 'la publicación todavía no contiene sus rutas inglesas');
  for (const path of routes) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /data-theme-toggle/, `${relative(projectRoot, path)} perdió el control de tema que debe existir sin JavaScript`);
    if (relative(join(projectRoot, 'dist'), path).startsWith('en/')) {
      assert.match(html, /aria-label="Switch to dark mode"|aria-label="Switch to light mode"/, `${relative(projectRoot, path)} no anuncia el control en inglés`);
    } else {
      assert.match(html, /aria-label="Activar modo oscuro"|aria-label="Activar modo claro"/, `${relative(projectRoot, path)} no anuncia el control en español`);
    }
  }
  return routes.map((path) => {
    const relativePath = relative(join(projectRoot, 'dist'), path);
    if (relativePath === 'index.html') return '/';
    if (relativePath.endsWith('/index.html')) return `/${relativePath.slice(0, -'index.html'.length)}`;
    return `/${relativePath.replace(/\.html$/, '')}`;
  });
}

function themeColorMatches(surface: Paint): string | undefined {
  if (surface.themeColor === undefined) return 'no hay un borde del navegador para el tema visible';
  const normalised = surface.themeColor.toLowerCase();
  const rgb = normalised.match(/^#([0-9a-f]{6})$/i);
  const expected = rgb === null ? surface.background : `rgb(${parseInt(rgb[1]!.slice(0, 2), 16)}, ${parseInt(rgb[1]!.slice(2, 4), 16)}, ${parseInt(rgb[1]!.slice(4, 6), 16)})`;
  return expected === surface.background ? undefined : `el borde pinta ${surface.themeColor}, pero la lectura pinta ${surface.background}`;
}

Given('la publicación real se construye y se abre en los entornos de lectura admitidos', { timeout: 120_000 }, async function (this: ThemeWorld) {
  await publish(this);
});

When('la surfista abre la portada sin haber elegido un tema', { timeout: 120_000 }, async function (this: ThemeWorld) {
  const matrix: Array<[BrowserType, string, number]> = [
    [chromium, 'teléfono Chromium 390', 390], [chromium, 'teléfono Chromium 320', 320], [chromium, 'escritorio Chromium', 1440],
    [webkit, 'teléfono Safari/WebKit', 390], [webkit, 'escritorio Safari/WebKit', 1280],
  ];
  for (const [engine, label, width] of matrix) await visit(this, engine, label, '/', width, 'dark');
  await visit(this, chromium, 'teléfono Chromium claro de referencia', '/', 390, 'light');
});

Then('la página empieza clara aunque el teléfono prefiera oscuro, sin una pantalla de otro tema antes de leer', async function (this: ThemeWorld) {
  const publication = required(this);
  const dark = await paint(publication.visits[0]!.page);
  const clear = await paint(publication.visits.at(-1)!.page);
  assert.equal(dark.background, clear.background, `el teléfono oscuro empieza con ${dark.background}, distinto del primer fondo claro ${clear.background}`);
  assert.equal(dark.firstPaint, clear.background, `el primer cuadro oscuro fue ${dark.firstPaint ?? 'ausente'}, distinto de la lectura clara ${clear.background}`);
  const chromeFinding = themeColorMatches(dark);
  assert.equal(chromeFinding, undefined, chromeFinding ?? 'el borde del navegador no siguió la lectura');
});

Then('el control de tema queda arriba a la izquierda, mide por lo menos 44 píxeles y anuncia "Activar modo oscuro"', async function (this: ThemeWorld) {
  const page = required(this).visits[0]!.page;
  await assertControl(page, 'Activar modo oscuro');
});

Then('el control y cada ruta publicada conservan texto legible, ritmo de lectura, movimiento reducido y ningún desborde a 390 y 320 píxeles', async function (this: ThemeWorld) {
  const publication = required(this);
  for (const visit of publication.visits) {
    const surface = await paint(visit.page);
    assert.ok(surface.scrollWidth <= surface.clientWidth, `${visit.label}: la lectura se desborda horizontalmente`);
  }
  await assertReadableStaticControl(publication.visits[0]!.page);
  const routes = assertRouteSweep();
  const routePage = publication.visits[0]!.page;
  const lightBackground = (await paint(publication.visits.at(-1)!.page)).background;
  for (const route of routes) {
    const response = await routePage.goto(`${publication.url}${route}`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), `la ruta publicada ${route} no llegó durante el recorrido completo`);
    const surface = await paint(routePage);
    assert.equal(surface.background, lightBackground, `${route} vuelve a ${surface.background} en un teléfono oscuro sin elección`);
    assert.ok(surface.scrollWidth <= surface.clientWidth, `${route} se desborda a su ancho de lectura`);
  }
});

When('la surfista activa el modo oscuro, recarga y sigue una ruta en español y su gemela en inglés', { timeout: 120_000 }, async function (this: ThemeWorld) {
  const page = await visit(this, chromium, 'teléfono para recordar la elección', '/', 390, 'dark');
  await (await themeButton(page)).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.goto(`${required(this).url}/manana/`, { waitUntil: 'domcontentloaded' });
});

Then('la lectura y el borde del navegador siguen el modo oscuro elegido en cada ruta', async function (this: ThemeWorld) {
  const page = required(this).visits[0]!.page;
  const chosen = await paint(page);
  const lightReference = await visit(this, chromium, 'referencia clara', '/', 390, 'light');
  assert.notEqual(chosen.background, (await paint(lightReference)).background, 'el modo oscuro elegido se perdió al recargar o navegar');
  const chromeFinding = themeColorMatches(chosen);
  assert.equal(chromeFinding, undefined, chromeFinding ?? 'el borde del navegador no siguió la lectura');
});

Then('el control anuncia "Activar modo claro" en español y "Switch to light mode" en inglés', async function (this: ThemeWorld) {
  const page = required(this).visits[0]!.page;
  await assertControl(page, 'Activar modo claro');
  await page.goto(`${required(this).url}/en/tomorrow/`, { waitUntil: 'domcontentloaded' });
  const english = await paint(page);
  const finding = themeColorMatches(english);
  assert.equal(finding, undefined, finding ?? 'el borde del navegador no siguió la lectura inglesa');
  await assertControl(page, 'Switch to light mode');
});

Then('al volver a claro la elección se conserva después de otra recarga', async function (this: ThemeWorld) {
  const page = required(this).visits[0]!.page;
  await (await themeButton(page)).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  const selected = await paint(page);
  const lightReference = await visit(this, chromium, 'referencia clara al volver', '/', 390, 'light');
  assert.equal(selected.background, (await paint(lightReference)).background, 'la elección clara se perdió al recargar');
  const finding = themeColorMatches(selected);
  assert.equal(finding, undefined, finding ?? 'el borde del navegador no siguió la lectura clara');
  await assertControl(page, 'Switch to dark mode');
});

Given('la publicación real se construye para leer sin automatismos y el teléfono prefiere oscuro', { timeout: 120_000 }, async function (this: ThemeWorld) {
  await publish(this);
});

When('la surfista abre la portada y una ruta de playa', { timeout: 120_000 }, async function (this: ThemeWorld) {
  await visit(this, chromium, 'portada sin automatismos en teléfono oscuro', '/', 390, 'dark', false);
  await visit(this, chromium, 'playa sin automatismos en teléfono oscuro', '/spots/playa-venao/', 390, 'dark', false);
  await visit(this, chromium, 'portada clara de referencia', '/', 390, 'light', false);
  await visit(this, chromium, 'playa clara de referencia', '/spots/playa-venao/', 390, 'light', false);
});

Then('ambas llegan listas, claras, legibles y sin movimiento antes de que exista una elección guardada', async function (this: ThemeWorld) {
  const publication = required(this);
  const [darkHome, darkBeach, lightHome, lightBeach] = await Promise.all(publication.visits.map(({ page }) => paint(page)));
  assert.ok(darkHome && darkBeach && lightHome && lightBeach, 'test fixture error: faltan las cuatro lecturas sin automatismos');
  for (const [label, dark, light] of [
    ['la portada', darkHome, lightHome],
    ['la playa', darkBeach, lightBeach],
  ] as const) {
    assert.equal(dark.background, light.background, `${label} sin automatismos vuelve a ${dark.background} en el teléfono oscuro en vez de conservar la lectura clara ${light.background}`);
    assert.ok(dark.scrollWidth <= dark.clientWidth, `${label} sin automatismos se desborda`);
    const chromeFinding = themeColorMatches(dark);
    assert.equal(chromeFinding, undefined, chromeFinding ?? `el borde del navegador no siguió ${label}`);
  }
});

Given('la surfista trae una elección anterior que el sitio no entiende y el teléfono prefiere oscuro', { timeout: 120_000 }, async function (this: ThemeWorld) {
  await publish(this);
  invalidChoices.set(this, 'no-es-un-modo');
});

When('la surfista abre la portada', async function (this: ThemeWorld) {
  const choice = invalidChoices.get(this);
  assert.ok(choice, 'test fixture error: falta la elección anterior para observar su recuperación');
  await visit(this, chromium, 'teléfono con elección anterior inválida', '/', 390, 'dark', true, choice);
  await visit(this, chromium, 'referencia clara de elección inválida', '/', 390, 'light');
});

Then('la portada vuelve a una lectura clara y el control ofrece activar oscuro', async function (this: ThemeWorld) {
  const publication = required(this);
  const invalid = await paint(publication.visits[0]!.page);
  const clear = await paint(publication.visits[1]!.page);
  assert.equal(invalid.background, clear.background, `una elección anterior inválida dejó ${invalid.background} en vez de recuperar ${clear.background}`);
  await assertControl(publication.visits[0]!.page, 'Activar modo oscuro');
});

Given('una copia aislada de la publicación conserva la lectura oscura pero pinta un borde claro', { timeout: 120_000 }, async function (this: ThemeWorld) {
  await publish(this);
  const copied = join(required(this).previewRoot, 'dist/index.html');
  const html = readFileSync(copied, 'utf8');
  const darkTag = html.match(/<meta[^>]*name=["']theme-color["'][^>]*prefers-color-scheme:\s*dark[^>]*>/i)?.[0];
  assert.ok(darkTag, 'test fixture error: no se encontró el borde oscuro para alterar');
  writeFileSync(copied, html.replace(darkTag, darkTag.replace(/#[0-9a-f]{6}/i, '#f2f8fa')));
  required(this).copiedDist = copied;
  const altered = readFileSync(copied, 'utf8');
  assert.match(altered, /#f2f8fa/i, 'test fixture error: la copia no cambió el borde');
});

When('la surfista abre esa copia en oscuro', { timeout: 120_000 }, async function (this: ThemeWorld) {
  assert.ok(required(this).copiedDist, 'test fixture error: falta la copia aislada');
  await visit(this, chromium, 'copia con borde abandonado', '/', 390, 'dark');
});

Then('la comprobación rechaza la copia y nombra el fondo de lectura que el borde abandonó', async function (this: ThemeWorld) {
  const altered = await paint(required(this).visits[0]!.page);
  const finding = themeColorMatches(altered);
  assert.ok(finding, 'la comprobación debía rechazar el borde claro de la copia oscura');
  assert.match(finding, /lectura pinta|borde pinta/, 'la comprobación debe nombrar el fondo de lectura que la copia abandonó');
});

After(async function (this: ThemeWorld) {
  const publication = publications.get(this);
  if (publication === undefined) return;
  await Promise.all(publication.visits.map(async ({ browser }) => browser.close()));
  try {
    process.kill(publication.daemonPid, 'SIGKILL');
  } catch {
    // The preview may already have stopped after a failed scenario.
  }
  rmSync(publication.previewRoot, { recursive: true, force: true });
});
