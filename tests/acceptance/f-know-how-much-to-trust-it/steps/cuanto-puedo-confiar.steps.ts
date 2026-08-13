// Slice-01 acceptance steps for F-KNOW-HOW-MUCH-TO-TRUST-IT.
//
// Same isolation contract slice-07 established: every scenario builds an
// isolated copy of the production Astro surface, injects controlled
// `confidence_reason.spread_terms` (and the matching `conf_level`) into ITS
// OWN copy of data/published-surface.json, serves the emitted dist/ over
// HTTP, and observes it through Chromium. The shared, committed surface is
// read but never written.
//
// Step text is deliberately worded differently from slice-07's structurally
// identical steps ("el surfista abre {string} buscando la confianza, ..."):
// Cucumber's step registry is global, so a near-duplicate phrase would
// silently bind to the other feature's step and this feature would test
// nothing.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';

type ConfidenceLevel = 'high' | 'medium' | 'low';
type SpreadTerms = { height: number; period: number; direction: number };

type ConfidenceReason = {
  dominant: string | null;
  spread_terms: SpreadTerms;
  track_state: string;
};

type SurfaceCall = {
  spot_id: string;
  score_q: number;
  call_es: string;
  conf_level?: ConfidenceLevel;
  confidence_reason?: ConfidenceReason;
};

type PublishedDay = { date: string; spots: SurfaceCall[] };

type StaticSurface = {
  current: {
    calls: SurfaceCall[];
    days: [PublishedDay, PublishedDay];
  };
};

type Variant = {
  readonly label: string;
  readonly conf_level: ConfidenceLevel;
  readonly spread_terms: SpreadTerms;
};

type Fixture = {
  readonly difference_cycle: readonly Variant[];
  readonly single_opinion: Variant;
  readonly real_agreement: Variant;
  readonly long_name_spot_id: string;
};

type ObservedRow = {
  readonly spotId: string;
  readonly reasonText: string;
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-01-agreement-variants.json', import.meta.url),
  'utf8',
)) as Fixture;

const projectRoot = process.cwd();

type TrustWorld = PipelineWorld & {
  trustRoot?: string;
  trustPreview?: ChildProcess;
  trustBrowser?: Browser;
  trustPage?: Page;
  trustObserved?: ObservedRow[];
  trustSingleOpinionSpotId?: string;
  trustRealAgreementSpotId?: string;
};

function trustWorld(world: PipelineWorld): TrustWorld {
  return world as TrustWorld;
}

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function copyProjectForSurface(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-trust-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    cpSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function readSurface(root: string): { path: string; surface: StaticSurface } {
  const path = join(root, 'data/published-surface.json');
  return { path, surface: JSON.parse(readFileSync(path, 'utf8')) as StaticSurface };
}

function writeSurface(path: string, surface: StaticSurface): void {
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
}

function applyVariant(call: SurfaceCall, variant: Variant): void {
  call.conf_level = variant.conf_level;
  call.confidence_reason = {
    dominant: 'missing_data',
    spread_terms: { ...variant.spread_terms },
    track_state: 'unverified',
  };
}

/** Cycles the three disagreement shapes across both days' rows. */
function injectDifferenceCycle(root: string, promoteLongName: boolean): void {
  const { path, surface } = readSurface(root);
  const cycle = fixture.difference_cycle;
  assert.ok(cycle.length >= 3, 'test fixture error: need at least three disagreement shapes');
  surface.current.calls.forEach((call, index) => {
    applyVariant(call, cycle[index % cycle.length]!);
  });
  surface.current.days[1].spots.forEach((spot, index) => {
    // A different phase, so tomorrow is not a copy of today's pattern.
    applyVariant(spot, cycle[(index + 1) % cycle.length]!);
  });
  if (promoteLongName) promoteToTop(surface.current.calls, fixture.long_name_spot_id);
  writeSurface(path, surface);
}

/**
 * Row 0 gets zero spread terms with a LOW level: the ambiguous shape that
 * means "fewer than two models could see this spot" and must never render as
 * agreement. Row 1 gets the same zero terms with a level above low, which
 * proves at least two members participated (a single member caps c_spread at
 * 0.4, so it could not have reached medium).
 */
function injectSingleOpinionAgainstRealAgreement(root: string): { single: string; real: string } {
  const { path, surface } = readSurface(root);
  const calls = surface.current.calls;
  assert.ok(calls.length >= 2, 'test fixture error: need at least two ranked rows');
  const single = calls[0]!;
  const real = calls[1]!;
  applyVariant(single, fixture.single_opinion);
  applyVariant(real, fixture.real_agreement);
  for (const call of calls.slice(2)) applyVariant(call, fixture.difference_cycle[0]!);
  writeSurface(path, surface);
  return { single: single.spot_id, real: real.spot_id };
}

function promoteToTop(calls: SurfaceCall[], spotId: string): void {
  const index = calls.findIndex((call) => call.spot_id === spotId);
  assert.ok(index >= 0, `test fixture error: ${spotId} is not in the installed ranking`);
  const [row] = calls.splice(index, 1);
  assert.ok(row, `test fixture error: could not promote ${spotId}`);
  calls.unshift(row);
}

function buildSurface(world: TrustWorld): void {
  assert.ok(world.trustRoot, 'test fixture error: isolated root is required');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: world.trustRoot,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`Trust slice-01 surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
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
      throw new Error(`Trust slice-01 preview exited before the behavior oracle with status ${proc.exitCode}`);
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
  throw new Error(`Trust slice-01 preview never became reachable: ${String(lastError)}`);
}

function routeFor(ruta: string): string {
  if (ruta === 'la home') return '/';
  if (ruta === 'Mañana') return '/manana/';
  throw new Error(`test fixture error: unknown route "${ruta}"`);
}

async function openAndTapEveryReason(
  world: TrustWorld,
  route: string,
  theme: string,
  movement: string,
): Promise<void> {
  buildSurface(world);
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const vite = join(projectRoot, 'node_modules/.bin/vite');
  const preview = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: world.trustRoot,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  world.trustPreview = preview;
  await waitForPreview(url, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  await page.goto(`${url}${route}`, { waitUntil: 'domcontentloaded' });
  world.trustBrowser = browser;
  world.trustPage = page;

  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  const observed: ObservedRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const spotId = (await row.getAttribute('data-spot-id')) ?? (await row.locator('a').first().getAttribute('href')) ?? '';
    const summary = row.locator('details.confidence summary');
    let reasonText = '';
    if ((await summary.count()) > 0) {
      await summary.click();
      reasonText = ((await row.locator('details.confidence > div').textContent()) ?? '').trim();
      await summary.click();
    }
    observed.push({ spotId, reasonText });
  }
  world.trustObserved = observed;
}

function requiredPage(world: TrustWorld): Page {
  assert.ok(world.trustPage, 'test fixture error: the published surface must be open');
  return world.trustPage;
}

function requiredObserved(world: TrustWorld): ObservedRow[] {
  assert.ok(world.trustObserved, 'test fixture error: open a route and tap every reason first');
  return world.trustObserved;
}

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: un surfista sabe que un swell de 15 s y uno de 10 s son dos días distintos, y una razón que no nombra en cuál cosa fallan los modelos no le sirve para decidir si maneja dos horas. HOW: ${how}`,
  );
}

/** The three things a surfer can act on. A reason that names none of them is
 * the generic "conditions may vary" research 09 section 14.4 forbids. */
const NAMES_A_VARIABLE = /tamaño|per[íi]odo|direcci[óo]n/iu;
/** Naming a variable as one the models do NOT agree on. Both shapes the copy
 * can take: "no coinciden en el período" and "..., pero no en el período". */
const NAMES_A_DISAGREEMENT = /no\s+coinciden\s+en|pero\s+no\s+en/iu;
const CLAIMS_AGREEMENT = /modelos\s+coinciden/iu;
const NOTHING_TO_COMPARE = /no\s+hay\s+con\s+qu[ée]\s+comparar/iu;
const SAYS_NOBODY_REPORTED = /nadie.*playa|playa.*nadie/isu;
/** Any calibrated-looking figure. Research 09 section 3.6: a qualitative flag,
 * never a number. The `%` and digit classes both fire. */
const SHOWS_A_FIGURE = /\d|%/u;
const TECHNICAL_LEAK = /\b(?:ncep|gfs|dwd|ecmwf|meteofrance|gfswave|gwam|wam)(?:[_-]?[a-z0-9]+)*\b|\b(?:score_q|conf_value|conf_level|spread_terms|json|undefined|nan|null)\b/iu;

// ---------- Given ----------

Given('una mañana publicada donde los modelos difieren en cosas distintas según la playa', function (this: PipelineWorld) {
  const world = trustWorld(this);
  world.trustRoot = copyProjectForSurface();
  injectDifferenceCycle(world.trustRoot, false);
});

Given(
  'una mañana publicada donde los modelos difieren en cosas distintas según la playa, con un destino de nombre largo',
  function (this: PipelineWorld) {
    const world = trustWorld(this);
    world.trustRoot = copyProjectForSurface();
    injectDifferenceCycle(world.trustRoot, true);
  },
);

Given('una mañana publicada donde una playa tiene una sola opinión y otra tiene acuerdo real', function (this: PipelineWorld) {
  const world = trustWorld(this);
  world.trustRoot = copyProjectForSurface();
  const ids = injectSingleOpinionAgainstRealAgreement(world.trustRoot);
  world.trustSingleOpinionSpotId = ids.single;
  world.trustRealAgreementSpotId = ids.real;
});

// ---------- When ----------

When(
  'el surfista abre {string} a 390 px y toca la razón de confianza de cada fila',
  { timeout: 180_000 },
  async function (this: PipelineWorld, ruta: string) {
    await openAndTapEveryReason(trustWorld(this), routeFor(ruta), 'claro', 'normal');
  },
);

When(
  'el surfista abre {string} a 390 px, con tema {string} y movimiento {string}, y toca la razón de confianza de cada fila',
  { timeout: 180_000 },
  async function (this: PipelineWorld, ruta: string, theme: string, movement: string) {
    await openAndTapEveryReason(trustWorld(this), routeFor(ruta), theme, movement);
  },
);

// ---------- Then ----------

Then('alguna razón nombra la cosa en la que los modelos no coinciden', function (this: PipelineWorld) {
  const observed = requiredObserved(trustWorld(this));
  const named = observed.filter((row) => NAMES_A_DISAGREEMENT.test(row.reasonText) && NAMES_A_VARIABLE.test(row.reasonText));
  const findings = named.length > 0
    ? []
    : [`ninguna de las ${observed.length} razones nombra en cuál cosa fallan los modelos (primera: "${observed[0]?.reasonText ?? ''}")`];
  assertBehavior(
    findings,
    'componer la razón desde confidence_reason.spread_terms, nombrando el tamaño, el período o la dirección segun cuál pasó el umbral de desacuerdo.',
  );
});

Then('ninguna razón se queda solo en una frase genérica sin nombrar ninguna cosa', function (this: PipelineWorld) {
  const observed = requiredObserved(trustWorld(this));
  const findings = observed
    .filter((row) => !NAMES_A_VARIABLE.test(row.reasonText) && !NOTHING_TO_COMPARE.test(row.reasonText))
    .map((row) => `una razón no nombra ni el tamaño, ni el período, ni la dirección: "${row.reasonText}"`);
  assertBehavior(findings, 'nombrar siempre las tres cosas concretas, o decir que no hay con qué comparar; nunca una frase vaga.');
});

Then('cada razón sigue diciendo que todavía nadie reportó desde la playa', function (this: PipelineWorld) {
  const observed = requiredObserved(trustWorld(this));
  const findings = observed
    .filter((row) => !SAYS_NOBODY_REPORTED.test(row.reasonText))
    .map((row) => `una razón perdió la frase honesta de la falta de reportes: "${row.reasonText}"`);
  assertBehavior(findings, 'conservar la frase de "todavía nadie ha mandado un reporte desde la playa" en toda razón.');
});

function rowFor(observed: readonly ObservedRow[], spotId: string): ObservedRow {
  const row = observed.find((candidate) => candidate.spotId.includes(spotId));
  assert.ok(row, `test fixture error: no se encontró la fila de ${spotId} entre ${observed.map((r) => r.spotId).join(', ')}`);
  return row;
}

Then('la fila de la playa con una sola opinión dice que no hay con qué comparar', function (this: PipelineWorld) {
  const world = trustWorld(this);
  const observed = requiredObserved(world);
  const row = rowFor(observed, world.trustSingleOpinionSpotId ?? '');
  const findings = NOTHING_TO_COMPARE.test(row.reasonText)
    ? []
    : [`la fila con una sola opinión no dice que no hay con qué comparar: "${row.reasonText}"`];
  assertBehavior(findings, 'tratar spread_terms en cero con nivel bajo como "no comparable", nunca como acuerdo.');
});

Then('esa razón nunca dice que los modelos coinciden', function (this: PipelineWorld) {
  const world = trustWorld(this);
  const row = rowFor(requiredObserved(world), world.trustSingleOpinionSpotId ?? '');
  const findings = CLAIMS_AGREEMENT.test(row.reasonText)
    ? [`la fila con una sola opinión reclama acuerdo entre modelos: "${row.reasonText}"`]
    : [];
  assertBehavior(findings, 'nunca escribir "los modelos coinciden" cuando solo hubo una opinión: es la certeza que los datos no ganaron.');
});

Then('la fila con acuerdo real sí dice que los modelos coinciden', function (this: PipelineWorld) {
  const world = trustWorld(this);
  const row = rowFor(requiredObserved(world), world.trustRealAgreementSpotId ?? '');
  const findings = CLAIMS_AGREEMENT.test(row.reasonText)
    ? []
    : [`la fila con acuerdo real no lo dice: "${row.reasonText}"`];
  assertBehavior(findings, 'con spread_terms en cero y nivel por encima de bajo, hubo dos o más modelos y el acuerdo es real: decirlo.');
});

Then('ninguna razón muestra un número, un porcentaje ni una barra de certeza', function (this: PipelineWorld) {
  const observed = requiredObserved(trustWorld(this));
  const findings = observed
    .filter((row) => SHOWS_A_FIGURE.test(row.reasonText))
    .map((row) => `una razón muestra una cifra: "${row.reasonText}"`);
  assertBehavior(findings, 'la confianza es una palabra y una explicación, nunca una cifra calibrada (research 09 seccion 3.6).');
});

Then('ninguna razón abre vacía ni nombra un modelo por su identificador', function (this: PipelineWorld) {
  const observed = requiredObserved(trustWorld(this));
  const findings: string[] = [];
  for (const row of observed) {
    if (row.reasonText.length === 0) findings.push('una razón abre vacía');
    if (TECHNICAL_LEAK.test(row.reasonText)) findings.push(`una razón expone datos crudos: "${row.reasonText}"`);
  }
  assertBehavior(findings, 'nunca imprimir nombres de modelos ni campos internos dentro del <details> de confianza.');
});

Then('ninguna fila se desborda el ancho de 390 px ni recorta su texto al alargarse la razón', async function (this: PipelineWorld) {
  const page = requiredPage(trustWorld(this));
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
      const reason = row.querySelector('p');
      return {
        overflowsRight: rect.right > document.documentElement.clientWidth + 1,
        overflowsLeft: rect.left < -1,
        reasonClipped: reason !== null && reason.scrollHeight > reason.getBoundingClientRect().height + 1,
      };
    });
    if (overflow.overflowsRight || overflow.overflowsLeft) findings.push(`U2: la fila ${index + 1} se desborda de 390 px`);
    if (overflow.reasonClipped) findings.push(`U6: el llamado de la fila ${index + 1} queda recortado`);
  }
  assertBehavior(findings, 'dejar que la razón abierta fluya en varias líneas dentro de grid-column: 1 / -1, sin forzar una sola línea.');
});

Then('el toque que abre la razón mide al menos 44 por 44 px y no tiene movimiento', async function (this: PipelineWorld) {
  const page = requiredPage(trustWorld(this));
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  const findings: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const state = await rows.nth(index).evaluate((row) => {
      const summary = row.querySelector('details.confidence summary');
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
      findings.push(`U3: la fila ${index + 1} no tiene un toque de confianza`);
      continue;
    }
    if (state.width < 44 || state.height < 44) {
      findings.push(`U3: el toque de la fila ${index + 1} mide ${Math.round(state.width)}x${Math.round(state.height)} px`);
    }
    const moves = state.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
      || (state.animationName.trim() !== '' && state.animationName.trim() !== 'none');
    if (moves) findings.push(`U4: el toque de la fila ${index + 1} tiene movimiento`);
  }
  assertBehavior(findings, 'mantener min-width y min-height de var(--tap) en <summary> y no declarar transition ni animation.');
});

// Passed to evaluate() as a STRING for the same loader reason slice-04 and
// slice-07 document: tsx wraps named bindings with a __name(...) helper that
// does not exist inside Playwright's isolated realm.
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

Then('el texto de la razón abierta tiene suficiente contraste contra el fondo real de la tarjeta', async function (this: PipelineWorld) {
  const page = requiredPage(trustWorld(this));
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  const findings: string[] = [];
  if (count === 0) findings.push('U1: no hay ni una fila que medir');
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const summary = row.locator('details.confidence summary');
    if ((await summary.count()) === 0) {
      findings.push(`U1: la fila ${index + 1} no tiene razón de confianza que medir`);
      continue;
    }
    await summary.click();
    const measured: number | null = await row.locator('details.confidence > div').evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT);
    await summary.click();
    if (measured !== null && measured < 4.5) {
      findings.push(`U7: la razón abierta de la fila ${index + 1} queda en ${measured.toFixed(2)}:1`);
    }
  }
  assertBehavior(findings, 'usar los tokens de tinta ya probados contra el fondo real, nunca un color inventado en el atributo style.');
});

After({ tags: '@feature-f-know-how-much-to-trust-it', timeout: 15_000 }, async function (this: PipelineWorld) {
  const world = trustWorld(this);
  await world.trustBrowser?.close();
  if (world.trustPreview !== undefined && world.trustPreview.exitCode === null) {
    world.trustPreview.kill('SIGTERM');
  }
  if (world.trustRoot !== undefined) {
    rmSync(world.trustRoot, { recursive: true, force: true });
  }
});
