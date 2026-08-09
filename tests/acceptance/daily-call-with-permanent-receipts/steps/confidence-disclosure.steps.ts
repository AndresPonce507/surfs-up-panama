// Slice-07 acceptance steps. Every scenario builds an isolated copy of the
// production Astro surface, injects controlled conf_level values into ITS
// OWN copy of data/published-surface.json (never the shared committed
// file — a dedicated producer lane on build/producer owns regenerating that
// one with real values), serves the emitted dist/ over HTTP, and observes it
// through Chromium. The worktree and its published data never change.
//
// Step text is deliberately worded differently from slice-04's identically
// shaped "el surfista abre la home publicada a {int} px..." step: Cucumber's
// step registry is global, and an Outline example substituting "la home"
// verbatim would otherwise collide with (or silently reuse) slice-04's step.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from './support/world';
import './support/world';

type ConfidenceLevel = 'high' | 'medium' | 'low';

type SurfaceCall = {
  spot_id: string;
  score_q: number;
  call_es: string;
  conf_level?: ConfidenceLevel;
};

type PublishedDay = { date: string; spots: SurfaceCall[] };

type StaticSurface = {
  current: {
    calls: SurfaceCall[];
    days: [PublishedDay, PublishedDay];
  };
};

type Fixture = {
  readonly today_level_cycle: readonly ConfidenceLevel[];
  readonly tomorrow_level_cycle: readonly ConfidenceLevel[];
  readonly long_name_spot_id: string;
};

type ObservedRow = {
  readonly summaryTextBeforeOpen: string;
  readonly reasonTextAfterOpen: string;
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-07-confidence-variants.json', import.meta.url),
  'utf8',
)) as Fixture;

const projectRoot = process.cwd();

type Slice07World = PipelineWorld & {
  slice07Root?: string;
  slice07Preview?: ChildProcess;
  slice07Browser?: Browser;
  slice07Page?: Page;
  slice07Observed?: ObservedRow[];
};

function slice07World(world: PipelineWorld): Slice07World {
  return world as Slice07World;
}

function credentialFreeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function copyProjectForSurface(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-07-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    cpSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  // A directory junction keeps the isolated build offline while using the
  // exact installed dependency tree. Nothing is installed or downloaded.
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

/**
 * Injects conf_level into THIS ISOLATED COPY of the published surface only.
 * The shared, committed data/published-surface.json is never read from here
 * for writing and never modified: build/producer owns regenerating it.
 */
function injectConfidenceLevels(root: string, promoteLongName: boolean): void {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as StaticSurface;

  // Today's page reads current.calls (forecast.ts's documented legacy alias
  // for days[0]), tomorrow's reads current.days[1].spots. Cycling through
  // all three levels on both, with a different phase, gives conf_level a
  // real chance to differ per spot across days -- confirmed below, not just
  // asserted in this comment, since conf_level is documented as a DAY field
  // (the same spot's level can legitimately differ tomorrow).
  surface.current.calls.forEach((call, index) => {
    call.conf_level = cycleAt(fixture.today_level_cycle, index);
  });
  surface.current.days[1].spots.forEach((spot, index) => {
    spot.conf_level = cycleAt(fixture.tomorrow_level_cycle, index);
  });
  const todayLevelBySpot = new Map(surface.current.calls.map((call) => [call.spot_id, call.conf_level]));
  const differsTomorrow = surface.current.days[1].spots.some(
    (spot) => todayLevelBySpot.get(spot.spot_id) !== undefined && todayLevelBySpot.get(spot.spot_id) !== spot.conf_level,
  );
  assert.ok(differsTomorrow, 'test fixture error: the level cycles never produce a spot with a different level tomorrow than today');

  if (promoteLongName) {
    // Reorders current.calls only. forecast.ts's days[0] (today's page)
    // reads current.calls, never current.days[0].spots -- reordering that
    // second array too would be dead work with nothing left to read it.
    promoteToTop(surface.current.calls, fixture.long_name_spot_id);
  }

  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
}

function cycleAt(levels: readonly ConfidenceLevel[], index: number): ConfidenceLevel {
  const level = levels[index % levels.length];
  assert.ok(level !== undefined, 'test fixture error: empty level cycle');
  return level;
}

function promoteToTop(calls: SurfaceCall[], spotId: string): void {
  const index = calls.findIndex((call) => call.spot_id === spotId);
  assert.ok(index >= 0, `test fixture error: ${spotId} is not in the installed ranking`);
  const [row] = calls.splice(index, 1);
  assert.ok(row, `test fixture error: could not promote ${spotId}`);
  calls.unshift(row);
}

function buildSurface(world: Slice07World): void {
  assert.ok(world.slice07Root, 'test fixture error: isolated Slice-07 root is required');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: world.slice07Root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`Slice-07 surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
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

async function waitForPreview(url: string, proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Slice-07 preview exited before the behavior oracle with status ${proc.exitCode}`);
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
  throw new Error(`Slice-07 preview never became reachable: ${String(lastError)}`);
}

async function openRoute(
  world: Slice07World,
  route: string,
  width: number,
  theme: string,
  movement: string,
): Promise<void> {
  buildSurface(world);
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const vite = join(projectRoot, 'node_modules/.bin/vite');
  const preview = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: world.slice07Root,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  world.slice07Preview = preview;
  await waitForPreview(url, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  await page.goto(`${url}${route}`, { waitUntil: 'domcontentloaded' });
  world.slice07Browser = browser;
  world.slice07Page = page;
}

function requiredPage(world: Slice07World): Page {
  assert.ok(world.slice07Page, 'test fixture error: the published surface must be open');
  return world.slice07Page;
}

function requiredObserved(world: Slice07World): ObservedRow[] {
  assert.ok(world.slice07Observed, 'test fixture error: run "el surfista toca la razón de confianza de cada fila" first');
  return world.slice07Observed;
}

function routeFor(ruta: string): string {
  if (ruta === 'la home') return '/';
  if (ruta === 'Mañana') return '/manana/';
  throw new Error(`test fixture error: unknown route "${ruta}"`);
}

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: un surfista decide en segundos si le apuesta al número, y la confianza no puede prometer más certeza de la que hay. HOW: ${how}`,
  );
}

// The visible trigger text is the bare level word ("baja"), not "Confianza
// baja": at real published call lengths (up to 65 chars) the "Confianza "
// prefix cost more width than the row's second line could spare without
// clipping the call -- see Confidence.astro's header comment for the
// measured numbers. The charter's hard rule is the level word itself
// ("sin la palabra, es FALLA"), not "confianza" as a visible prefix, so
// full "Confianza {word}" context lives in aria-label instead, checked
// separately below.
const LEVEL_WORD_PATTERN = /\b(alta|media|baja)\b/iu;
const ACCESSIBLE_LEVEL_LABEL_PATTERN = /confianza\s+(alta|media|baja)/iu;

/** The exact regression the honesty negative test guards against: a reason
 * that claims or implies anyone checked the actual waves. Zero beach
 * reports exist in this system today (HANDOFF.md section 5). */
const CLAIMS_BEACH_CONFIRMATION =
  /(alguien|un\s+surfista|un\s+reporte)\s+(confirm\w*|vio|report[oó])|confirmad[oa]\s+desde\s+la\s+playa|reporte\w*\s+desde\s+la\s+playa\s+confirm\w*/iu;

function hasTechnicalLeak(reason: string): boolean {
  return /\b(?:ncep|gfs|dwd|ecmwf)(?:[_-]?[a-z0-9]+)*\b|\b(?:score_q|conf_value|conf_level|json|undefined|nan|null)\b/iu.test(reason);
}

// ---------- Given ----------

Given('una mañana publicada con spots de confianza alta, media y baja para hoy y mañana', function (this: PipelineWorld) {
  const world = slice07World(this);
  world.slice07Root = copyProjectForSurface();
  injectConfidenceLevels(world.slice07Root, false);
});

Given(
  'una mañana publicada con spots de confianza alta, media y baja para hoy y mañana, con un destino de nombre largo',
  function (this: PipelineWorld) {
    const world = slice07World(this);
    world.slice07Root = copyProjectForSurface();
    injectConfidenceLevels(world.slice07Root, true);
  },
);

// ---------- When ----------

When(
  'el surfista abre {string} buscando la confianza, a {int} px, con tema {string} y movimiento {string}',
  { timeout: 30_000 },
  async function (this: PipelineWorld, ruta: string, width: number, theme: string, movement: string) {
    await openRoute(slice07World(this), routeFor(ruta), width, theme, movement);
  },
);

When('el surfista toca la razón de confianza de cada fila', async function (this: PipelineWorld) {
  const world = slice07World(this);
  const page = requiredPage(world);
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  const observed: ObservedRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const summary = row.locator('details.confidence summary');
    const summaryText = (await summary.count()) === 0 ? '' : ((await summary.textContent()) ?? '').trim();
    const reasonDiv = row.locator('details.confidence > div');
    let reasonText = '';
    if ((await summary.count()) > 0) {
      await summary.click();
      reasonText = (await reasonDiv.textContent()) ?? '';
      // Every disclosure on the page shares name="confidence" (an exclusive
      // HTML5 group), so it auto-closes when the NEXT row opens. Closing it
      // here too keeps this row's own dropdown from covering the next
      // row's tap target while this loop is still reading it.
      await summary.click();
    }
    observed.push({ summaryTextBeforeOpen: summaryText, reasonTextAfterOpen: reasonText.trim() });
  }
  world.slice07Observed = observed;
});

// ---------- Then ----------

Then(
  'cada fila muestra la palabra de su nivel de confianza junto al puntaje, nunca solo como color',
  async function (this: PipelineWorld) {
    const world = slice07World(this);
    const page = requiredPage(world);
    const rows = page.locator('ol.ranked > li');
    const count = await rows.count();
    const findings: string[] = [];
    if (count === 0) findings.push('la página no tiene ni una fila');
    for (let index = 0; index < count; index += 1) {
      const summary = rows.nth(index).locator('details.confidence summary');
      const summaryExists = (await summary.count()) > 0;
      const summaryText = summaryExists ? ((await summary.textContent()) ?? '').trim() : '';
      const ariaLabel = summaryExists ? ((await summary.getAttribute('aria-label')) ?? '') : '';
      if (!LEVEL_WORD_PATTERN.test(summaryText)) {
        findings.push(`la fila ${index + 1} no muestra "alta/media/baja" en su texto visible (encontrado: "${summaryText}")`);
      }
      if (!ACCESSIBLE_LEVEL_LABEL_PATTERN.test(ariaLabel)) {
        findings.push(`la fila ${index + 1} no da contexto de accesibilidad "Confianza alta/media/baja" (aria-label encontrado: "${ariaLabel}")`);
      }
    }
    assertBehavior(
      findings,
      'renderizar <Confidence level={summary.conf_level} /> en cada fila, con la palabra dentro del texto de <summary> y el contexto completo en aria-label, nunca solo un color o un atributo data-level.',
    );
  },
);

Then(
  'la razón de cada fila explica qué tanto acuerdan los modelos, en palabras que un surfista entiende',
  function (this: PipelineWorld) {
    const observed = requiredObserved(slice07World(this));
    const findings = observed
      .filter((row) => !/modelo/iu.test(row.reasonTextAfterOpen))
      .map((row) => `una razón no menciona a los modelos: "${row.reasonTextAfterOpen}"`);
    assertBehavior(findings, 'derivar la razón de confidenceReasonEs(level), que siempre nombra el acuerdo entre modelos.');
  },
);

Then('la razón de cada fila dice que todavía nadie reportó desde la playa', function (this: PipelineWorld) {
  const observed = requiredObserved(slice07World(this));
  const findings = observed
    .filter((row) => !/nadie.*playa|playa.*nadie/isu.test(row.reasonTextAfterOpen))
    .map((row) => `una razón no dice honestamente que nadie reportó desde la playa: "${row.reasonTextAfterOpen}"`);
  assertBehavior(findings, 'incluir la frase honesta de la falta de reportes desde la playa en confidenceReasonEs.');
});

Then('ninguna razón reclama ni sugiere una confirmación desde la playa', function (this: PipelineWorld) {
  const observed = requiredObserved(slice07World(this));
  const findings = observed
    .filter((row) => CLAIMS_BEACH_CONFIRMATION.test(row.reasonTextAfterOpen))
    .map((row) => `una razón reclama o sugiere una confirmación desde la playa: "${row.reasonTextAfterOpen}"`);
  assertBehavior(
    findings,
    'nunca escribir que alguien confirmó o vio las condiciones desde la playa: cero reportes existen hoy en el sistema.',
  );
});

Then('ninguna razón abre vacía ni con texto crudo de datos', function (this: PipelineWorld) {
  const observed = requiredObserved(slice07World(this));
  const findings: string[] = [];
  for (const row of observed) {
    if (row.reasonTextAfterOpen.length === 0) findings.push('una razón abre vacía');
    if (hasTechnicalLeak(row.reasonTextAfterOpen)) findings.push(`una razón expone datos crudos: "${row.reasonTextAfterOpen}"`);
  }
  assertBehavior(findings, 'nunca imprimir campos internos o texto vacío dentro del <details> de confianza.');
});

Then(
  'ninguna fila se desborda el ancho de 390 px ni recorta su texto al sumar la confianza',
  async function (this: PipelineWorld) {
    const world = slice07World(this);
    const page = requiredPage(world);
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const findings: string[] = [];
    if (geometry.scrollWidth > geometry.clientWidth) {
      findings.push(`U2: la página se desborda: scrollWidth ${geometry.scrollWidth} > clientWidth ${geometry.clientWidth}`);
    }
    const rows = page.locator('ol.ranked > li');
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const overflow = await rows.nth(index).evaluate((row) => {
        const rect = row.getBoundingClientRect();
        const overflowsRight = rect.right > document.documentElement.clientWidth + 1;
        const overflowsLeft = rect.left < -1;
        const reason = row.querySelector('p');
        const reasonClipped = reason !== null && reason.scrollHeight > reason.getBoundingClientRect().height + 1;
        return { overflowsRight, overflowsLeft, reasonClipped };
      });
      if (overflow.overflowsRight || overflow.overflowsLeft) findings.push(`U2: la fila ${index + 1} se desborda de 390 px`);
      if (overflow.reasonClipped) findings.push(`U6: el llamado de la fila ${index + 1} queda recortado`);
    }
    assertBehavior(
      findings,
      'mantener el badge de confianza dentro del ancho existente (grid-column: 1 / -1) y no achicar el párrafo del llamado por debajo de lo que necesita.',
    );
  },
);

Then('el puntaje y la palabra de confianza de cada fila se leen sin abrir nada', async function (this: PipelineWorld) {
  const world = slice07World(this);
  const page = requiredPage(world);
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  const findings: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const state = await rows.nth(index).evaluate((row) => {
      const score = row.querySelector('strong');
      const summary = row.querySelector('details.confidence summary');
      const details = row.querySelector('details.confidence');
      const scoreRect = score?.getBoundingClientRect();
      const summaryRect = summary?.getBoundingClientRect();
      return {
        scoreVisible: (scoreRect?.width ?? 0) > 0 && (scoreRect?.height ?? 0) > 0,
        summaryVisible: (summaryRect?.width ?? 0) > 0 && (summaryRect?.height ?? 0) > 0,
        alreadyOpen: details?.hasAttribute('open') ?? false,
      };
    });
    if (!state.scoreVisible) findings.push(`el puntaje de la fila ${index + 1} no es visible sin interacción`);
    if (!state.summaryVisible) findings.push(`la palabra de confianza de la fila ${index + 1} no es visible sin interacción`);
    if (state.alreadyOpen) findings.push(`la fila ${index + 1} abre la razón sin que nadie la toque`);
  }
  assertBehavior(findings, 'renderizar <strong> y <summary> siempre visibles y dejar <details> cerrado hasta que alguien lo toque.');
});

Then('el toque de confianza mide al menos 44 por 44 px y no tiene movimiento', async function (this: PipelineWorld) {
  const world = slice07World(this);
  const page = requiredPage(world);
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  const findings: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const state = await rows.nth(index).evaluate((row) => {
      const summary = row.querySelector('summary');
      if (summary === null) return null;
      const rect = summary.getBoundingClientRect();
      const computed = getComputedStyle(summary);
      return {
        width: rect.width,
        height: rect.height,
        transitionDuration: computed.transitionDuration,
        animationName: computed.animationName,
      };
    });
    if (state === null) {
      findings.push(`la fila ${index + 1} no tiene un toque de confianza`);
      continue;
    }
    if (state.width < 44 || state.height < 44) {
      findings.push(`el toque de confianza de la fila ${index + 1} mide ${Math.round(state.width)}x${Math.round(state.height)} px`);
    }
    const moves = state.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
      || (state.animationName.trim() !== '' && state.animationName.trim() !== 'none');
    if (moves) findings.push(`el toque de confianza de la fila ${index + 1} tiene movimiento`);
  }
  assertBehavior(findings, 'darle a <summary> min-width y min-height de var(--tap) (44px) y no declarar transition ni animation en el bloque de confianza.');
});

Then(
  'la confianza comparte la segunda línea de la fila en vez de agregar una tercera',
  async function (this: PipelineWorld) {
    const world = slice07World(this);
    const page = requiredPage(world);
    const rows = page.locator('ol.ranked > li');
    const count = await rows.count();
    const findings: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const geometry = await rows.nth(index).evaluate((row) => {
        const reason = row.querySelector('p');
        const summary = row.querySelector('details.confidence summary');
        if (reason === null || summary === null) return null;
        return {
          reasonBottom: reason.getBoundingClientRect().bottom,
          summaryTop: summary.getBoundingClientRect().top,
        };
      });
      if (geometry === null) {
        findings.push(`la fila ${index + 1} no tiene razón o confianza para comparar`);
        continue;
      }
      // The confidence badge's top must land above the reason paragraph's
      // bottom edge: they occupy the SAME visual band (the row's existing
      // second line), never a badge stacked below it as a new line.
      if (geometry.summaryTop >= geometry.reasonBottom) {
        findings.push(`la fila ${index + 1} agrega una tercera línea: la confianza empieza en ${geometry.summaryTop}, el llamado termina en ${geometry.reasonBottom}`);
      }
    }
    assertBehavior(
      findings,
      'colocar <details class="confidence"> en la misma grid-row que <p> (columna 3 en filas normales, columna 2 en el héroe), nunca en una fila propia de ancho completo.',
    );
  },
);

// Passed to locator.evaluate() as a STRING, not a function reference: this
// project's loader (tsx/esbuild) wraps NAMED function/const bindings with a
// __name(...) helper call for Function.prototype.name preservation, and
// that helper does not exist inside Playwright's isolated evaluate()
// realm — a serialized function reference carries the call across, a raw
// source string does not. Same technique slice-04's steps already use for
// its own contrast audit (page.evaluate(`(() => {...})()`)).
//
// Walks up from the element to the first ancestor that actually paints
// something (a solid backgroundColor, or gradient stops in
// backgroundImage — the hero card never has a plain color) and returns the
// worst-case (lowest) contrast ratio against the element's own text color.
// Same WCAG luminance formula as slice-04's audit, generalized to walk
// ancestors instead of assuming the hero card is the direct parent.
const CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT = `(el) => {
  const parseColor = (value) => {
    const match = value.match(/rgba?\\(([^)]+)\\)/i);
    if (!match || match[1] === undefined) return null;
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    const r = parts[0], g = parts[1], b = parts[2], a = parts[3];
    if (r === undefined || g === undefined || b === undefined || !Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
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

function contrastFindingFor(measured: number | null, threshold: number): boolean {
  return measured !== null && measured < threshold;
}

Then(
  'el texto de la confianza tiene suficiente contraste contra el fondo real de la tarjeta',
  async function (this: PipelineWorld) {
    const world = slice07World(this);
    const page = requiredPage(world);
    const rows = page.locator('ol.ranked > li');
    const count = await rows.count();
    const findings: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const summaryContrast: number | null = await row.locator('details.confidence summary').evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT);
      if (contrastFindingFor(summaryContrast, 4.5)) {
        findings.push(`fila ${index + 1}: la palabra de confianza queda en ${(summaryContrast as number).toFixed(2)}:1`);
      }
      const summary = row.locator('details.confidence summary');
      if ((await summary.count()) > 0) {
        await summary.click();
        const reasonContrast: number | null = await row.locator('details.confidence > div').evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT);
        await summary.click();
        if (contrastFindingFor(reasonContrast, 4.5)) {
          findings.push(`fila ${index + 1}: la razón abierta queda en ${(reasonContrast as number).toFixed(2)}:1`);
        }
      }
    }
    assertBehavior(
      findings,
      'usar --ink en el héroe (contraste ya probado contra --hero-grad) y --ink-2 en el resto (contraste ya probado contra --bg), nunca un color inventado.',
    );
  },
);

After({ tags: '@slice-07', timeout: 15_000 }, async function (this: PipelineWorld) {
  const world = slice07World(this);
  await world.slice07Browser?.close();
  if (world.slice07Preview !== undefined && world.slice07Preview.exitCode === null) {
    world.slice07Preview.kill('SIGTERM');
  }
  if (world.slice07Root !== undefined) {
    rmSync(world.slice07Root, { recursive: true, force: true });
  }
});
