// Slice-04/04-01 binds the design-system contrast table to the same built
// home document a surfer reads. It intentionally does not change a token or
// CSS selector: the first RED is the stale, neutral-palette prose in the
// design system, not a broken fixture or an invented implementation seam.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

type ContrastWorld = object;
type Theme = 'claro' | 'oscuro';
type OpenedHome = { browser: Browser; page: Page; preview: ChildProcess };
type RenderedPalette = {
  bodyColor: string;
  bodyBackground: string;
  titleColor: string;
  callColor: string;
  heroBackground: string;
  visibleOpaqueBackgrounds: string[];
  tokenValues: string[];
};
type ExpectedPalette = Omit<RenderedPalette, 'tokenValues' | 'visibleOpaqueBackgrounds'>;

const projectRoot = process.cwd();
const designSystemPath = join(projectRoot, 'docs/product/architecture/09-design-system.md');
const ciCorePath = join(projectRoot, 'scripts/ci-local-core.mjs');
const cucumberConfigPath = join(projectRoot, 'cucumber.mjs');
const featureOwnedAuditPath = join(projectRoot, 'tests/e2e/f-looks-like-the-ocean-and-reads-in-the-sun/contrast-and-touch-audit.spec.ts');
const openedHomes = new WeakMap<ContrastWorld, OpenedHome>();
const copiedTables = new WeakMap<ContrastWorld, string>();
const driftedRecords = new WeakMap<ContrastWorld, { original: string; drifted: string }>();

const expectedRows = {
  claro: [
    ['#FFFFFF', '#0D5866', '8.06', 'AAA'],
    ['#E8F7FA', '#0D5866', '7.34', 'AAA'],
    ['#08252E', '#F2F8FA', '14.90', 'AAA'],
    ['#3B5A63', '#F2F8FA', '6.92', 'AA'],
    ['#9E1C23', '#F2F8FA', '7.41', 'AAA'],
    ['#0B5F6A', '#F2F8FA', '6.85', 'AA'],
    ['#FFFFFF', '#0A6A2D', '6.75', 'AA'],
    ['#7A5200', '#F2F8FA', '6.45', 'AA'],
  ],
  oscuro: [
    ['#FFFFFF', '#0C5866', '8.07', 'AAA'],
    ['#E8F7FA', '#0C5866', '7.34', 'AAA'],
    ['#E4F2F5', '#0C5866', '7.04', 'AAA'],
    ['#E4F2F5', '#061A21', '15.56', 'AAA'],
    ['#9DBAC2', '#061A21', '8.69', 'AAA'],
    ['#F2848D', '#061A21', '7.19', 'AAA'],
    ['#6FCFDD', '#061A21', '9.89', 'AAA'],
    ['#04240F', '#6ED694', '9.26', 'AAA'],
    ['#E3A85F', '#061A21', '8.52', 'AAA'],
  ],
} as const satisfies Record<Theme, readonly (readonly [string, string, string, string])[]>;

const unpaintedCardPairs = {
  claro: [
    ['#08252E', '#FFFFFF'],
    ['#3B5A63', '#FFFFFF'],
  ],
  oscuro: [
    ['#E4F2F5', '#0C2830'],
    ['#9DBAC2', '#0C2830'],
  ],
} as const satisfies Record<Theme, readonly (readonly [string, string])[]>;

const obsoletePaletteValues = ['#14181D', '#F7FAFC', '#EAF1F5', '#EDF1F4', '#1E2A36'];

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
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
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('test fixture error: no se pudo reservar un puerto para la portada publicada'));
        return;
      }
      server.close((error) => error === undefined ? resolve(address.port) : reject(error));
    });
  });
}

async function waitForPreview(url: string, preview: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`test fixture error: la portada dejó de servir antes de abrirse (${preview.exitCode})`);
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const request = get(url, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        request.once('error', reject);
      });
      if (status >= 200 && status < 300) return;
      lastError = new Error(`la portada respondió ${status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`test fixture error: la portada publicada no llegó a abrirse: ${String(lastError)}`);
}

async function openPublishedHome(world: ContrastWorld, theme: Theme): Promise<void> {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(build.status, 0, `test fixture error: la construcción publicada falló antes de comparar la tabla:\n${build.stdout}${build.stderr}`);

  const port = await unusedPort();
  const preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/`;
  // A failure between the spawn above and openedHomes.set below must not
  // strand the preview or the browser: a stranded child process keeps
  // cucumber's event loop referenced after the summary and hangs the suite.
  let browser: Browser | null = null;
  try {
    await waitForPreview(url, preview);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
    if (theme === 'oscuro') await page.addInitScript(() => localStorage.setItem('surfs-up-theme', 'dark'));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    openedHomes.set(world, { browser, page, preview });
  } catch (error) {
    await browser?.close().catch(() => undefined);
    if (preview.exitCode === null) preview.kill('SIGTERM');
    throw error;
  }
}

function requiredHome(world: ContrastWorld): OpenedHome {
  const home = openedHomes.get(world);
  assert.ok(home, 'test fixture error: la portada todavía no fue abierta');
  return home;
}

function contrastTableRows(table: string): string[] {
  const section = table.match(/^### 3\. Measured contrast[\s\S]*?(?=^### 4\.)/m)?.[0] ?? '';
  assert.ok(section.length > 0, 'la tabla no contiene una sección 3 de contraste separada de la siguiente sección');
  return section.split('\n').filter((line) => line.trimStart().startsWith('|'));
}

function tableFindings(table: string, theme: Theme): string[] {
  const rows = contrastTableRows(table).map((row) => row.toUpperCase());
  const findings: string[] = [];
  for (const [foreground, background, ratio, floor] of expectedRows[theme]) {
    const expectedFacts = [foreground, background, ratio, floor];
    if (!rows.some((row) => expectedFacts.every((fact) => row.includes(fact)))) {
      findings.push(`falta la pareja tropical ${foreground} sobre ${background}, ${ratio}:1, ${floor}`);
    }
  }
  for (const [foreground, background] of unpaintedCardPairs[theme]) {
    if (rows.some((row) => row.includes(foreground) && row.includes(background))) {
      findings.push(`conserva la pareja de tarjeta no pintada ${foreground} sobre ${background}`);
    }
  }
  return findings;
}

function contrastRatio(foreground: string, background: string): number {
  const rgb = (hex: string): number[] => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = (hex: string): number => {
    const [red, green, blue] = rgb(hex).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const [one, two] = [luminance(foreground), luminance(background)];
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

function renderedPairFindings(tokenValues: readonly string[], theme: Theme): string[] {
  const renderedTokens = tokenValues.join(' ').toUpperCase();
  const findings: string[] = [];
  for (const [foreground, background, ratio] of expectedRows[theme]) {
    if (!renderedTokens.includes(foreground) || !renderedTokens.includes(background)) {
      findings.push(`la portada no resuelve ${foreground} y ${background} desde sus valores cascados`);
      continue;
    }
    const measured = contrastRatio(foreground, background).toFixed(2);
    if (measured !== ratio) findings.push(`${foreground} sobre ${background} mide ${measured}:1, no ${ratio}:1`);
  }
  return findings;
}

function unpaintedBackgroundFindings(backgrounds: readonly string[], theme: Theme): string[] {
  return [...new Set(unpaintedCardPairs[theme]
    .map(([, background]) => background)
    .filter((background) => backgrounds.some((painted) => computedColorHex(painted) === background)))];
}

function computedColorHex(color: string): string {
  const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return color.toUpperCase();
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

async function renderedPalette(page: Page): Promise<RenderedPalette> {
  return page.evaluate(`(() => {
    const style = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('no se encontró ' + selector);
      return getComputedStyle(element);
    };
    const body = style('body');
    const title = style('ol.ranked li:first-child > a');
    const call = style('ol.ranked li:first-child > p');
    const hero = style('ol.ranked li:first-child');
    const root = getComputedStyle(document.documentElement);
    const visibleOpaqueBackgrounds = [...document.querySelectorAll('body *')]
      .filter((element) => element.offsetParent !== null)
      .map((element) => getComputedStyle(element).backgroundColor)
      .filter((color) => !/^rgba\(0, 0, 0, 0\)$/.test(color));
    return {
      bodyColor: body.color,
      bodyBackground: body.backgroundColor,
      titleColor: title.color,
      callColor: call.color,
      heroBackground: hero.backgroundImage,
      visibleOpaqueBackgrounds,
      tokenValues: ['--ink', '--ink-2', '--bg', '--surface', '--go', '--on-go', '--warn', '--danger', '--accent', '--hero-grad', '--hero-ink', '--hero-ink-2']
        .map((name) => root.getPropertyValue(name).trim()),
    };
  })()`) as Promise<RenderedPalette>;
}

function expectedRenderedPalette(theme: Theme): ExpectedPalette {
  return theme === 'claro'
    ? {
      bodyColor: 'rgb(8, 37, 46)', bodyBackground: 'rgb(242, 248, 250)', titleColor: 'rgb(255, 255, 255)', callColor: 'rgb(232, 247, 250)', heroBackground: 'rgb(13, 88, 102)',
    }
    : {
      bodyColor: 'rgb(228, 242, 245)', bodyBackground: 'rgb(6, 26, 33)', titleColor: 'rgb(255, 255, 255)', callColor: 'rgb(232, 247, 250)', heroBackground: 'rgb(12, 88, 102)',
    };
}

Given('la tabla de contraste y la portada publicada están listas para compararse', function () {
  assert.ok(readFileSync(designSystemPath, 'utf8').includes('### 3. Measured contrast'), 'test fixture error: falta la tabla de contraste del sistema de diseño');
  const ciCore = readFileSync(ciCorePath, 'utf8');
  const cucumber = readFileSync(cucumberConfigPath, 'utf8');
  assert.match(ciCore, /name: 'at'[\s\S]*?npm', \['run', 'test:at'\]/, 'test fixture error: la revisión local ya no llama las pruebas de aceptación');
  assert.match(cucumber, /paths: \['tests\/\*\*\/\*\.feature'\]/, 'test fixture error: la revisión de aceptación ya no descubre los contratos');
});

When('el surfista abre para comparar la portada a 390 px, con tema {string}', async function (this: ContrastWorld, value: string) {
  assert.ok(value === 'claro' || value === 'oscuro', `test fixture error: tema inesperado ${value}`);
  await openPublishedHome(this, value);
});

Then('la tabla nombra las parejas de lectura que la portada realmente pinta en tema {string}, con su proporción y su piso', async function (this: ContrastWorld, value: string) {
  assert.ok(value === 'claro' || value === 'oscuro', `test fixture error: tema inesperado ${value}`);
  const theme = value;
  const rendered = await renderedPalette(requiredHome(this).page);
  const expected = expectedRenderedPalette(theme);
  assert.equal(rendered.bodyColor, expected.bodyColor, `la portada dejó de pintar la tinta esperada para ${theme}: ${rendered.bodyColor}`);
  assert.equal(rendered.bodyBackground, expected.bodyBackground, `la portada dejó de pintar el fondo esperado para ${theme}: ${rendered.bodyBackground}`);
  assert.equal(rendered.titleColor, expected.titleColor, `la portada dejó de pintar el título esperado para ${theme}: ${rendered.titleColor}`);
  assert.equal(rendered.callColor, expected.callColor, `la portada dejó de pintar el texto de llamada esperado para ${theme}: ${rendered.callColor}`);
  const expectedHeroBackground = expected.heroBackground;
  assert.ok(expectedHeroBackground, `test fixture error: falta el punto de agua esperado para ${theme}`);
  assert.ok(rendered.heroBackground.toLowerCase().includes(expectedHeroBackground), `la portada dejó de pintar el punto más claro del agua esperado para ${theme}: ${rendered.heroBackground}`);

  const renderedFindings = renderedPairFindings(rendered.tokenValues, theme);
  assert.deepEqual(renderedFindings, [], `las parejas medidas no son las de la portada publicada: ${renderedFindings.join('; ')}`);
  const forbiddenBackgrounds = unpaintedBackgroundFindings(rendered.visibleOpaqueBackgrounds, theme);
  assert.deepEqual(forbiddenBackgrounds, [], `la portada todavía pinta un fondo de tarjeta que esta ruta no usa: ${forbiddenBackgrounds.join(', ')}`);
  const findings = tableFindings(readFileSync(designSystemPath, 'utf8'), theme);
  assert.deepEqual(findings, [], `la tabla no describe la portada publicada: ${findings.join('; ')}`);
});

Then('la tabla no conserva los valores de la paleta gris que ya fue reemplazada', function () {
  const rows = contrastTableRows(readFileSync(designSystemPath, 'utf8')).join('\n').toUpperCase();
  const stale = obsoletePaletteValues.filter((value) => rows.includes(value));
  assert.deepEqual(stale, [], `la tabla conserva valor(es) de la paleta gris reemplazada: ${stale.join(', ')}`);
});

When('una copia visual de la portada pinta el fondo de tarjeta claro que esta ruta no usa', async function (this: ContrastWorld) {
  await requiredHome(this).page.addStyleTag({ content: 'ol.ranked > li:not(:first-child) { background: #FFFFFF !important; }' });
});

Then('la comprobación rechaza el fondo de tarjeta claro no pintado', async function (this: ContrastWorld) {
  const rendered = await renderedPalette(requiredHome(this).page);
  assert.deepEqual(
    unpaintedBackgroundFindings(rendered.visibleOpaqueBackgrounds, 'claro'),
    ['#FFFFFF'],
    'la comprobación no nombró el fondo de tarjeta claro que la copia visual volvió a pintar',
  );
});

Then('la portada cabe en el teléfono, conserva controles alcanzables y llega lista para leer', async function (this: ContrastWorld) {
  const page = requiredHome(this).page;
  const audit = await page.evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    rows: document.querySelectorAll('ol.ranked > li').length,
    tooSmall: [...document.querySelectorAll('a, button, summary')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      })
      .map((element) => element.textContent?.trim() || element.tagName),
  }))()`) as { overflow: boolean; rows: number; tooSmall: string[] };
  assert.equal(audit.overflow, false, 'la portada tiene scroll horizontal a 390 px');
  assert.ok(audit.rows > 0, 'la portada llega sin playas para leer');
  assert.deepEqual(audit.tooSmall, [], `control(es) menores que 44 px: ${audit.tooSmall.join(', ')}`);
});

Then('al pedir quietud, la portada no se mueve', async function (this: ContrastWorld) {
  const moving = await requiredHome(this).page.evaluate(`(() => [...document.querySelectorAll('*')]
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.animationName !== 'none' || style.transitionDuration !== '0s';
    })
    .map((element) => element.tagName.toLowerCase()))()`) as string[];
  assert.deepEqual(moving, [], `la portada conserva movimiento con quietud pedida: ${moving.join(', ')}`);
});

Then('las palabras de la portada conservan la escala y el ritmo que la tabla promete', async function (this: ContrastWorld) {
  const type = await requiredHome(this).page.evaluate(`(() => {
    const style = getComputedStyle(document.body);
    return { family: style.fontFamily, size: style.fontSize, leading: style.lineHeight };
  })()`) as { family: string; size: string; leading: string };
  assert.match(type.family, /system-ui/i, `la portada no usa la familia declarada: ${type.family}`);
  assert.equal(type.size, '17px', `la portada no conserva el cuerpo de 17 px: ${type.size}`);
  assert.equal(type.leading, '25.5px', `la portada no conserva el ritmo de 1.5: ${type.leading}`);
});

Then('los colores, espacios, bordes, sombras y movimiento que la portada usa tienen nombre en el sistema', function () {
  const tokens = readFileSync(join(projectRoot, 'src/styles/tokens.css'), 'utf8');
  const base = readFileSync(join(projectRoot, 'src/styles/base.css'), 'utf8');
  const components = readFileSync(join(projectRoot, 'src/styles/components.css'), 'utf8');
  for (const token of ['--ink', '--bg', '--sp-4', '--r-l', '--shadow-1', '--dur-1']) {
    assert.match(tokens, new RegExp(`${token}:`), `falta el nombre ${token} en el sistema`);
  }
  for (const source of [base, components]) assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, 'una superficie publicada usa un color sin nombre');
  const emittedHome = readFileSync(join(projectRoot, 'dist/index.html'), 'utf8');
  for (const declaration of [
    'background:var(--bg)',
    'padding:var(--sp-4)',
    'border-radius:var(--r-l)',
    'box-shadow:var(--shadow-1)',
    'transition:transform var(--dur-1) var(--ease)',
  ]) {
    assert.ok(emittedHome.includes(declaration), `la portada emitida no conserva la declaración con nombre ${declaration}`);
  }
});

Then('la comprobación viaja por la misma revisión local que protege la publicación', async function () {
  const { runLocalCi } = await import('../../../../scripts/ci-local.mjs');
  const commands: string[] = [];
  const output: string[] = [];
  const exit = await runLocalCi({
    argv: ['--job=at', '--job=budget'],
    repoRoot: projectRoot,
    output: { write: (line) => output.push(line), error: (line) => output.push(line) },
    commandRunner: async (command, args) => {
      commands.push([command, ...args].join(' '));
      return { status: 0, out: 'captured production CI command' };
    },
  });
  assert.equal(exit, 0, `la revisión local no terminó con éxito en su recorrido acotado: ${output.join('\n')}`);
  assert.ok(commands.some((command) => command === 'npm run test:at'), `la revisión local no ejecutó aceptación: ${commands.join(' | ')}`);
  assert.ok(commands.some((command) => command.includes('npm run build') && command.includes('--outDir .ci-local-logs/budget-dist')), `la revisión local no ejecutó la construcción y peso publicados: ${commands.join(' | ')}`);
});

Given('una copia aislada de la tabla corregida vuelve a guardar una pareja de la paleta gris reemplazada', function (this: ContrastWorld) {
  // Build the correct record from the same rows the positive scenario
  // requires, then corrupt only this memory copy. Starting from the current
  // production prose would make the negative go stale as soon as 04-01
  // correctly rewrites that prose and would wrongly require an AT edit in
  // GREEN.
  const corrected = [
    '### 3. Measured contrast',
    '| Pair | Ratio | Clears |',
    '|---|---:|---|',
    ...Object.values(expectedRows).flat().map((row) => `| ${row.join(' | ')} |`),
    '### 4. Boundaries',
  ].join('\n');
  const stale = `${corrected.replaceAll('#E8F7FA', '#EDF1F4')}\n#14181D`;
  copiedTables.set(this, stale);
});

When('esa tabla se compara con la portada publicada', function () {
  // The copy is intentionally not written to disk. The same table validator
  // sees its old claim, proving the contract can fail without mutating a
  // production document or relying on a browser/setup failure.
});

Then('la comprobación rechaza la tabla nombrando el color gris viejo y la pareja tropical que falta', function (this: ContrastWorld) {
  const copy = copiedTables.get(this);
  assert.ok(copy, 'test fixture error: falta la copia de la tabla');
  const stale = obsoletePaletteValues.find((value) => copy.toUpperCase().includes(value));
  const missing = tableFindings(copy, 'claro')[0];
  assert.ok(stale, 'la copia deliberadamente vieja dejó de contener un color gris conocido');
  assert.ok(missing, 'la copia deliberadamente vieja dejó de omitir una pareja tropical requerida');
  assert.match(`${stale}; ${missing}`, /#[0-9A-F]{6}.*pareja tropical/i, 'la negativa no nombra a la vez el color gris viejo y la pareja tropical ausente');
});

Given('las rutas que el surfista puede abrir están listas para recorrer', function () {
  assert.ok(existsSync(featureOwnedAuditPath), 'la ruta de auditoría propia de esta función todavía no existe');
  const audit = readFileSync(featureOwnedAuditPath, 'utf8');
  for (const route of ['/', '/manana/', '/spots/playa-venao/', '/spots/playa-venao/ayer/', '/spots/playa-venao/reportar/', '/spots/playa-venao/reportado/', '/404']) {
    assert.ok(audit.includes(`path: '${route}'`), `la auditoría propia no recorre ${route}`);
  }
  assert.match(audit, /getComputedStyle/, 'la auditoría no pregunta al navegador qué ruta realmente pinta');
  assert.doesNotMatch(audit, /expectedRows|#(?:[0-9A-F]{3}){1,2}\b/i, 'la auditoría conserva una lista de parejas o colores, en vez de recorrer la cascada real');
});

When('el surfista las recorre a 390 px, con tema claro y oscuro, y pide quietud', function () {
  const result = spawnSync('npm', ['run', 'test:e2e', '--', '--grep', 'a surfer can read and tap every feature-owned route in both themes'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `el recorrido de navegador no terminó bien:\n${result.stdout}${result.stderr}`);
});

Then('las palabras, los controles y el ancho de cada ruta publicada conservan un margen de lectura cómodo', function () {
  // The preceding production browser run is the observable proof. This
  // follow-up makes the static U2/U4/U6/U7 gate part of the same journey.
  const result = spawnSync('npm', ['run', 'test:ui'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `la comprobación de presentación no terminó bien:\n${result.stdout}${result.stderr}`);
});

Then('la revisión local publica ese recorrido dentro de su aceptación de navegador sin inventar otra revisión', function () {
  const ciCore = readFileSync(ciCorePath, 'utf8');
  const e2eJobs = ciCore.match(/name: 'e2e'/g) ?? [];
  assert.equal(e2eJobs.length, 1, `la revisión local debe tener exactamente una aceptación de navegador; encontró ${e2eJobs.length}`);
  assert.match(ciCore, /name: 'e2e'[\s\S]*?steps: \[\['browser acceptance', 'npm', \['run', 'test:e2e'\]\]\]/, 'la aceptación de navegador existente no ejecuta el recorrido propio');
});

Given('la promesa de contraste publicada tiene su pareja clara de agua más exigente', function (this: ContrastWorld) {
  const original = readFileSync(designSystemPath, 'utf8');
  assert.match(original, /\| hero title `#FFFFFF` on worst hero stop `#0D5866` \| 8\.06:1 \| AAA \(≥7:1\) \|/, 'test fixture error: la promesa publicada ya no contiene la pareja clara que debe protegerse');
  driftedRecords.set(this, { original, drifted: '' });
});

When('una copia aislada anota esa pareja como menos legible de lo que la página pinta', function (this: ContrastWorld) {
  const record = driftedRecords.get(this);
  assert.ok(record, 'test fixture error: falta la promesa original antes de ensayar la alarma');
  const drifted = record.original.replace(
    '| hero title `#FFFFFF` on worst hero stop `#0D5866` | 8.06:1 | AAA (≥7:1) |',
    '| hero title `#FFFFFF` on worst hero stop `#0D5866` | 4.00:1 | AA (≥4.5:1) |',
  );
  assert.notEqual(drifted, record.original, 'test fixture error: la deriva deliberada no alteró la pareja clara');
  driftedRecords.set(this, { original: record.original, drifted });
});

Then('la alarma nombra la pareja de agua que dejó de coincidir', function (this: ContrastWorld) {
  const record = driftedRecords.get(this);
  assert.ok(record?.drifted, 'test fixture error: falta la copia deliberadamente desviada');
  const findings = tableFindings(record.drifted, 'claro');
  assert.ok(
    findings.includes('falta la pareja tropical #FFFFFF sobre #0D5866, 8.06:1, AAA'),
    `la alarma no nombró la pareja desviada #FFFFFF sobre #0D5866: ${findings.join('; ')}`,
  );
});

Then('el documento publicado queda exactamente como estaba antes de probar la alarma', function (this: ContrastWorld) {
  const record = driftedRecords.get(this);
  assert.ok(record, 'test fixture error: falta el documento original para comprobar su regreso');
  assert.equal(readFileSync(designSystemPath, 'utf8'), record.original, 'la alarma dejó una edición en el documento publicado');
  const diff = spawnSync('git', ['diff', '--exit-code', '--', 'docs/product/architecture/09-design-system.md'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(diff.status, 0, `la pareja desviada no volvió limpia al documento publicado:\n${diff.stdout}${diff.stderr}`);
});

Then('la revisión local termina sus comprobaciones de presentación y navegador sin omitir ninguna', function () {
  const result = spawnSync('npm', ['run', 'ci:local', '--', '--job=ui', '--job=e2e'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `la revisión local de presentación y navegador falló:\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /2 passed \/ 0 failed \/ 0 skipped/, `la revisión local omitió una comprobación:\n${result.stdout}`);
});

After(async function (this: ContrastWorld) {
  const home = openedHomes.get(this);
  if (!home) return;
  await home.browser.close();
  if (home.preview.exitCode === null) home.preview.kill('SIGTERM');
});
