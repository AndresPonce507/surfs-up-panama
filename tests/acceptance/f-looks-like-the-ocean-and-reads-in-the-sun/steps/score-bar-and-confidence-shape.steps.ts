// Slice-05 accepts the score bar and confidence shape through the actual
// production build. The browser sees only the emitted home and tomorrow
// pages. The published-surface input supplies the pre-existing numbers and
// confidence levels, so this contract can reject a presentation change that
// quietly rewrites the forecast.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

type RankingWorld = object;
type Theme = 'claro' | 'oscuro';
type RankingRoute = '/' | '/manana.html';
type PublishedCall = { score_q: number; conf_level?: 'high' | 'medium' | 'low' };
type PreparedSurface = { buildOutput: string; regression?: 'barless' | 'dotless' };
type OpenedSurface = { browser: Browser; preview: ChildProcess; page: Page; baseUrl: string };
type RouteAudit = {
  route: RankingRoute;
  theme: Theme;
  scores: number[];
  confidenceLevels: Array<'high' | 'medium' | 'low'>;
  findings: string[];
};

const projectRoot = process.cwd();
const prepared = new WeakMap<RankingWorld, PreparedSurface>();
const opened = new WeakMap<RankingWorld, OpenedSurface>();
const audits = new WeakMap<RankingWorld, RouteAudit[]>();
const hueRemovedFindings = new WeakMap<RankingWorld, string[]>();

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) delete environment[key];
  }
  return environment;
}

function expectedCalls(): Record<RankingRoute, PublishedCall[]> {
  const surface = JSON.parse(readFileSync(join(projectRoot, 'data/published-surface.json'), 'utf8')) as {
    current: { calls: PublishedCall[]; days: [unknown, { spots: PublishedCall[] }] };
  };
  return { '/': surface.current.calls, '/manana.html': surface.current.days[1].spots };
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
        const request = get(url, (response) => {
          response.resume();
          resolve((response.statusCode ?? 500) < 400);
        });
        request.once('error', reject);
        request.setTimeout(500, () => request.destroy(new Error('la vista previa tardó demasiado')));
      });
      if (ready) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`test fixture error: la vista previa no abrió: ${String(lastError)}`);
}

function buildPublishedSurface(): PreparedSurface {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${build.stdout}${build.stderr}`;
  assert.equal(build.status, 0, `test fixture error: la construcción publicada falló antes de observar el ranking:\n${output}`);
  assert.match(output, /page weight|page-weight|weight gate/i, `test fixture error: la construcción no informó el límite de peso:\n${output}`);
  return { buildOutput: output };
}

function resolvedCustomProperty(page: Page, name: string): Promise<string> {
  return page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);
}

async function openAndAudit(world: RankingWorld): Promise<void> {
  const preparedSurface = prepared.get(world);
  assert.ok(preparedSurface, 'test fixture error: falta la construcción publicada');
  assert.ok(preparedSurface.buildOutput.length > 0, 'test fixture error: falta el resultado de la construcción');
  const port = await unusedPort();
  const preview = spawn(join(projectRoot, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: projectRoot,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  // A failure between the spawn above and opened.set below must not strand
  // the preview or the browser: a stranded child process keeps cucumber's
  // event loop referenced after the summary and hangs the whole suite.
  let browser: Browser;
  try {
    await waitFor(baseUrl, preview);
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (preview.exitCode === null) preview.kill('SIGTERM');
    throw error;
  }
  let page: Page;
  try {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  } catch (error) {
    await browser.close().catch(() => undefined);
    if (preview.exitCode === null) preview.kill('SIGTERM');
    throw error;
  }
  opened.set(world, { browser, preview, page, baseUrl });

  const allAudits: RouteAudit[] = [];
  for (const theme of ['claro', 'oscuro'] as const) {
    await page.emulateMedia({ colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce' });
    if (theme === 'oscuro') await page.addInitScript(() => localStorage.setItem('surfs-up-theme', 'dark'));
    for (const route of ['/', '/manana.html'] as const) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      if (preparedSurface.regression !== undefined) {
        await page.evaluate(`(() => document.querySelectorAll(${JSON.stringify(preparedSurface.regression === 'barless' ? '.bars' : '.dots')}).forEach((item) => item.remove()))()`);
      }
      const expected = expectedCalls()[route];
      const audit = await page.evaluate(`(() => {
        const expectedScores = ${JSON.stringify(expected.map((call) => call.score_q))};
        const expectedLevels = ${JSON.stringify(expected.map((call) => call.conf_level))};
        const route = ${JSON.stringify(route)};
        const theme = ${JSON.stringify(theme)};
        const ratio = (first, second) => {
          const luminance = ([red, green, blue]) => [red, green, blue]
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            })
            .reduce((total, channel, index) => total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
          return (Math.max(luminance(first), luminance(second)) + 0.05) / (Math.min(luminance(first), luminance(second)) + 0.05);
        };
        const rgb = (value) => {
          const match = value.match(/rgba?\\(([^)]+)\\)/i)?.[1];
          if (match === undefined) return undefined;
          const channels = match.split(',').slice(0, 3).map(Number);
          if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return undefined;
          return [channels[0], channels[1], channels[2]];
        };
        const glyphs = { high: '●●●', medium: '●●○', low: '●○○' };
        const findings = [];
        const rows = [...document.querySelectorAll('ol.ranked > li')];
        if (rows.length !== expectedScores.length) findings.push(route + ': publicó ' + rows.length + ' filas, esperaba ' + expectedScores.length);
        const actualScores = rows.map((row) => Number(row.querySelector('strong')?.textContent?.trim()));
        if (actualScores.some((score, index) => score !== expectedScores[index])) findings.push(route + ': los puntajes publicados cambiaron de su orden o valor');
        if (actualScores.some((score, index) => index > 0 && score > (actualScores[index - 1] ?? score))) findings.push(route + ': los puntajes ya no bajan de arriba hacia abajo');
        const fillColours = new Set();
        const fillWidths = [];
        for (const [index, row] of rows.entries()) {
          const rowBox = row.getBoundingClientRect();
          if (rowBox.left < -0.5 || rowBox.right > document.documentElement.clientWidth + 0.5) findings.push(route + ': la fila ' + (index + 1) + ' sale del ancho del teléfono');
          const bar = row.querySelector('.bars .bar');
          const track = row.querySelector('.bars .bar .track');
          const fill = row.querySelector('.bars .bar .fill');
          if (!bar || !track || !fill) {
            findings.push(route + ': la fila ' + (index + 1) + ' no tiene una barra completa');
          } else {
            if (bar.closest('a, button, input, summary') !== null) findings.push(route + ': la barra de la fila ' + (index + 1) + ' añadió una acción');
            const trackBox = track.getBoundingClientRect();
            const fillBox = fill.getBoundingClientRect();
            if (trackBox.width === 0) findings.push(route + ': la barra de la fila ' + (index + 1) + ' no tiene espacio para mostrar su longitud');
            fillWidths[index] = fillBox.width;
            const trackColor = rgb(getComputedStyle(track).backgroundColor);
            const fillColor = rgb(getComputedStyle(fill).backgroundColor);
            if (trackColor === undefined || fillColor === undefined || ratio(trackColor, fillColor) < 3) findings.push(route + ': la barra de la fila ' + (index + 1) + ' no despeja 3:1 sobre su fondo');
            fillColours.add(getComputedStyle(fill).backgroundColor);
            if (getComputedStyle(fill).transitionDuration !== '0s' || getComputedStyle(fill).animationName !== 'none') findings.push(route + ': la barra de la fila ' + (index + 1) + ' se mueve con movimiento reducido');
          }

          const level = row.querySelector('details.confidence')?.dataset.level;
          const summary = row.querySelector('details.confidence > summary');
          const dots = row.querySelector('details.confidence .dots');
          const expectedLevel = expectedLevels[index];
          if (expectedLevel !== undefined && level !== expectedLevel) findings.push(route + ': la confianza de la fila ' + (index + 1) + ' cambió de nivel');
          if (level !== undefined) {
            if (!summary || !dots) {
              findings.push(route + ': la confianza de la fila ' + (index + 1) + ' no conserva palabra y puntos');
            } else {
              const expectedGlyph = glyphs[level];
              if (dots.textContent?.trim() !== expectedGlyph) findings.push(route + ': la confianza ' + level + ' de la fila ' + (index + 1) + ' no muestra ' + expectedGlyph);
              if (!summary.textContent?.includes('Confianza ' + (level === 'high' ? 'alta' : level === 'medium' ? 'media' : 'baja'))) findings.push(route + ': la confianza de la fila ' + (index + 1) + ' no conserva su palabra completa');
              const summaryBox = summary.getBoundingClientRect();
              if (summaryBox.width < 44 || summaryBox.height < 44) findings.push(route + ': el toque de confianza de la fila ' + (index + 1) + ' mide ' + summaryBox.width.toFixed(0) + 'x' + summaryBox.height.toFixed(0) + 'px, piso 44x44px');
              if (getComputedStyle(summary).color !== getComputedStyle(dots).color) findings.push(route + ': palabra y puntos de confianza usan colores distintos');
              const confidenceColor = rgb(getComputedStyle(summary).color);
              const pageBackground = rgb(getComputedStyle(document.body).backgroundColor);
              if (index > 0 && (confidenceColor === undefined || pageBackground === undefined || ratio(confidenceColor, pageBackground) < 4.5)) findings.push(route + ': la confianza de la fila ' + (index + 1) + ' no despeja 4.5:1 sobre su fondo');
              if (getComputedStyle(dots).transitionDuration !== '0s' || getComputedStyle(dots).animationName !== 'none') findings.push(route + ': los puntos de confianza de la fila ' + (index + 1) + ' se mueven con movimiento reducido');
            }
          }
        }
        if (fillWidths.length === expectedScores.length) {
          for (let first = 0; first < expectedScores.length; first += 1) {
            for (let second = first + 1; second < expectedScores.length; second += 1) {
              if ((expectedScores[first] ?? 0) > (expectedScores[second] ?? 0) && (fillWidths[first] ?? 0) <= (fillWidths[second] ?? 0) + 0.5) findings.push(route + ': una barra de puntaje mayor no supera la de puntaje menor');
            }
          }
        }
        if (fillColours.size > 1) findings.push(route + ': el color de la barra cambia con el puntaje; la longitud debe contar esa historia');
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth) findings.push(route + ': la lista tiene scroll horizontal a 390px');
        if (document.readyState !== 'complete' || document.querySelector('[aria-busy="true"]') !== null) findings.push(route + ': la lista no llegó lista para leer');
        return { route, theme, scores: actualScores, confidenceLevels: expectedLevels.filter((level) => level !== undefined), findings };
      })()`) as RouteAudit;
      allAudits.push(audit);
    }
  }
  audits.set(world, allAudits);
  const colourlessFindings: string[] = [];
  for (const route of ['/', '/manana.html'] as const) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: 'html { filter: grayscale(1) saturate(0); }' });
    const observations = await page.evaluate(`(() => ({
      filter: getComputedStyle(document.documentElement).filter,
      bars: [...document.querySelectorAll('ol.ranked > li .bars .bar .track .fill')].map((fill) => fill.getBoundingClientRect().width),
      confidence: [...document.querySelectorAll('ol.ranked > li details.confidence')].map((item) => ({ word: item.querySelector('summary')?.textContent?.trim(), dots: item.querySelector('.dots')?.textContent?.trim() }))
    }))()`) as { filter: string; bars: number[]; confidence: Array<{ word?: string; dots?: string }> };
    if (!/grayscale\(1\).*saturate\(0\)|saturate\(0\).*grayscale\(1\)/.test(observations.filter)) colourlessFindings.push(`${route}: no se aplicó la simulación sin matiz`);
    if (observations.bars.length !== expectedCalls()[route].length) colourlessFindings.push(`${route}: al quitar el matiz faltan barras visibles`);
    if (observations.bars.length > 0 && Math.max(...observations.bars) <= Math.min(...observations.bars)) colourlessFindings.push(`${route}: al quitar el matiz las barras no conservan longitudes distintas`);
    if (observations.confidence.some((item) => !item.word?.includes('Confianza') || !item.dots)) colourlessFindings.push(`${route}: al quitar el matiz falta la palabra o los puntos de confianza`);
  }
  hueRemovedFindings.set(world, colourlessFindings);
}

function allAudits(world: RankingWorld): RouteAudit[] {
  const result = audits.get(world);
  assert.ok(result && result.length === 4, 'test fixture error: faltan las listas publicadas para revisar');
  return result;
}

function allFindings(world: RankingWorld): string[] {
  return allAudits(world).flatMap((audit) => audit.findings);
}

Given('la costa publicada está lista para leer', function (this: RankingWorld) {
  prepared.set(this, buildPublishedSurface());
});

Given('una costa publicada a la que se le quitan las barras', function (this: RankingWorld) {
  prepared.set(this, { ...buildPublishedSurface(), regression: 'barless' });
});

Given('una costa publicada a la que se le quitan los puntos de confianza', function (this: RankingWorld) {
  prepared.set(this, { ...buildPublishedSurface(), regression: 'dotless' });
});

When('la surfista recorre las listas de hoy y mañana a 390 px, con los dos temas', async function (this: RankingWorld) {
  await openAndAudit(this);
});

Then('cada puntaje publicado conserva su número y obtiene una barra proporcional a su propio valor', function (this: RankingWorld) {
  const findings = allFindings(this).filter((finding) => /barra completa|no tiene espacio|puntaje mayor|puntajes publicados|ya no bajan/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('las barras se distinguen por longitud, se leen sobre su fondo y no cambian el orden ni el fondo de las playas', function (this: RankingWorld) {
  const findings = allFindings(this).filter((finding) => /3:1|color de la barra|puntajes publicados|ya no bajan/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('las barras no añaden una acción ni movimiento, y la lista conserva su ritmo y su ancho en el teléfono', function (this: RankingWorld) {
  const findings = allFindings(this).filter((finding) => /barra.*acción|barra.*mueve|scroll horizontal|sale del ancho/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('cada confianza publicada conserva su palabra completa y muestra sus puntos correspondientes', function (this: RankingWorld) {
  const findings = allFindings(this).filter((finding) => /confianza.*(?:palabra|puntos|muestra)|cambió de nivel/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('los puntos y las palabras se leen igual sin usar el color para separar los niveles', function (this: RankingWorld) {
  const findings = allFindings(this).filter((finding) => /palabra y puntos|confianza.*4\.5:1/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('la misma historia se conserva cuando se quita el matiz de los colores', function (this: RankingWorld) {
  const findings = hueRemovedFindings.get(this);
  assert.ok(findings !== undefined, 'test fixture error: falta la simulación sin matiz');
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('la comprobación rechaza las filas que pierden su barra proporcional', function (this: RankingWorld) {
  assert.ok(allFindings(this).some((finding) => finding.includes('no tiene una barra completa')), 'la comprobación debe nombrar la ausencia de una barra visible');
});

Then('la comprobación rechaza las filas que pierden los puntos de confianza', function (this: RankingWorld) {
  assert.ok(allFindings(this).some((finding) => finding.includes('no conserva palabra y puntos')), 'la comprobación debe nombrar la ausencia de puntos de confianza');
});

Then('la confianza sigue siendo un toque alcanzable, no añade movimiento y la lista cabe en el teléfono', function (this: RankingWorld) {
  const findings = allFindings(this).filter((finding) => /toque de confianza|puntos de confianza.*mueven|scroll horizontal|sale del ancho/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

Then('las listas llegan completas con las medidas nombradas del producto', async function (this: RankingWorld) {
  const surface = opened.get(this);
  assert.ok(surface, 'test fixture error: falta la superficie abierta');
  const namedMeasures = await Promise.all(['--sp-1', '--r-full', '--text-caption', '--ink-2', '--sunken'].map((property) => resolvedCustomProperty(surface.page, property)));
  assert.ok(namedMeasures.every((measure) => measure.length > 0), 'las listas deben resolver las medidas nombradas de espaciado, radio, tipo y color');
  const findings = allFindings(this).filter((finding) => /no llegó lista|publicó/.test(finding));
  assert.deepEqual(findings, [], findings.join('; '));
});

After(async function (this: RankingWorld) {
  const surface = opened.get(this);
  await surface?.browser.close();
  if (surface?.preview.exitCode === null) {
    await new Promise<void>((resolve) => {
      surface.preview.once('exit', () => resolve());
      surface.preview.kill();
      setTimeout(resolve, 1_000).unref();
    });
  }
});
