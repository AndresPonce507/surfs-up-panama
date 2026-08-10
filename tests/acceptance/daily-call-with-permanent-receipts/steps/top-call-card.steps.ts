// Slice-04 acceptance steps. Every scenario builds an isolated copy of the
// production Astro surface, serves the emitted dist/ over HTTP, and observes
// it through Chromium. The worktree and its published data never change.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from './support/world';
import './support/world';

type StructuredCall = {
  readonly size_band: string;
  readonly size_range_m: readonly [number, number];
  readonly wind_state: string;
  readonly best_window: { readonly start: string; readonly end: string };
};

type StructuredProfile = {
  readonly spot_id?: string;
  readonly structured_call: StructuredCall;
  readonly expected_spanish: {
    readonly size: string;
    readonly wind: string;
    readonly window: string;
  };
};

type Slice04Fixture = {
  readonly profiles: Readonly<Record<string, StructuredProfile>>;
  readonly narratives: Readonly<Record<string, string>>;
};

type SurfaceCall = StructuredCall & {
  readonly spot_id: string;
  readonly score_q: number;
  readonly call_es: string;
};

type StaticSurface = {
  readonly current: { readonly calls: SurfaceCall[] };
};

type Slice04World = PipelineWorld & {
  slice04Root?: string;
  slice04HomeUrl?: string;
  slice04Preview?: ChildProcess;
  slice04Browser?: Browser;
  slice04Page?: Page;
  slice04Expected?: {
    readonly spotId: string;
    readonly spotName: string;
    readonly score: number;
    readonly structured?: StructuredCall;
    readonly expectedSpanish?: StructuredProfile['expected_spanish'];
  };
  slice04UiGate?: { readonly status: number | null; readonly output: string };
};

type RenderedRow = {
  readonly visibleText: string;
  readonly headline: string;
  readonly href: string;
  readonly score: number;
  readonly reason: string;
  readonly scoreFontPx: number;
  readonly linkWidth: number;
  readonly linkHeight: number;
};

const projectRoot = process.cwd();
const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-04-top-call-variants.json', import.meta.url),
  'utf8',
)) as Slice04Fixture;

const namesById = new Map(
  [...readFileSync(join(projectRoot, 'data/spots/pa-pacific.yaml'), 'utf8').matchAll(
    /^\s+- spot_id: ([^\n]+)\n\s+name: ([^\n]+)$/gm,
  )].map((match) => [
    match[1]!.trim(),
    match[2]!.trim().replace(/^"(.*)"$/, '$1'),
  ]),
);

function slice04World(world: PipelineWorld): Slice04World {
  return world as Slice04World;
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
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-slice-04-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    copyFileSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  // A directory junction keeps the isolated build offline while using the
  // exact installed dependency tree. Nothing is installed or downloaded.
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function preparePublishedSurface(
  root: string,
  narrativeState: string,
  profileName: string,
): NonNullable<Slice04World['slice04Expected']> {
  const narrative = fixture.narratives[narrativeState];
  assert.notEqual(
    narrative,
    undefined,
    `test fixture error: unknown Slice-04 narrative state ${narrativeState}`,
  );
  const profile = fixture.profiles[profileName];
  assert.ok(
    profile,
    `test fixture error: unknown Slice-04 structured profile ${profileName}`,
  );
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as StaticSurface;
  const top = surface.current.calls[0];
  assert.ok(top, 'test fixture error: published surface needs a top-ranked call');
  if (profile.spot_id !== undefined && profile.spot_id !== top.spot_id) {
    const sourceOwnedRow = surface.current.calls.find((call) => call.spot_id === profile.spot_id);
    assert.ok(sourceOwnedRow, `test fixture error: ${profile.spot_id} is not in the installed ranking`);
    const originalTopId = top.spot_id;
    Object.assign(top, { spot_id: sourceOwnedRow.spot_id });
    Object.assign(sourceOwnedRow, { spot_id: originalTopId });
  }
  Object.assign(top, profile.structured_call, { call_es: narrative });
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
  const spotName = namesById.get(top.spot_id);
  assert.ok(spotName, `test fixture error: ${top.spot_id} has no source-owned display name`);
  return {
    spotId: top.spot_id,
    spotName,
    score: top.score_q,
    structured: profile.structured_call,
    expectedSpanish: profile.expected_spanish,
  };
}

function observeUnmodifiedPublishedSurface(
  root: string,
): NonNullable<Slice04World['slice04Expected']> {
  const installedPath = join(projectRoot, 'data/published-surface.json');
  const copiedPath = join(root, 'data/published-surface.json');
  const installedBytes = readFileSync(installedPath);
  const copiedBytes = readFileSync(copiedPath);
  assert.deepEqual(
    copiedBytes,
    installedBytes,
    'test fixture error: the installed public input changed while creating its isolated copy',
  );
  const surface = JSON.parse(copiedBytes.toString('utf8')) as StaticSurface;
  const top = surface.current.calls[0];
  assert.ok(top, 'test fixture error: installed public input needs a top-ranked call');
  const spotName = namesById.get(top.spot_id);
  assert.ok(spotName, `test fixture error: ${top.spot_id} has no source-owned display name`);
  return {
    spotId: top.spot_id,
    spotName,
    score: top.score_q,
  };
}

function buildSurface(world: Slice04World): void {
  assert.ok(world.slice04Root, 'test fixture error: isolated Slice-04 root is required');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: world.slice04Root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`Slice-04 surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
  const gate = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: world.slice04Root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  world.slice04UiGate = {
    status: gate.status,
    output: `${gate.stdout}${gate.stderr}`,
  };
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

async function waitForPreview(url: string, process: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Slice-04 preview exited before the behavior oracle with status ${process.exitCode}`);
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
  throw new Error(`Slice-04 preview never became reachable: ${String(lastError)}`);
}

async function openSurface(
  world: Slice04World,
  width: number,
  theme: string,
  movement: string,
): Promise<void> {
  buildSurface(world);
  const port = await unusedPort();
  const url = `http://127.0.0.1:${port}`;
  const vite = join(projectRoot, 'node_modules/.bin/vite');
  const preview = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: world.slice04Root,
    env: credentialFreeEnvironment(),
    stdio: 'ignore',
  });
  world.slice04Preview = preview;
  await waitForPreview(url, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  world.slice04Browser = browser;
  world.slice04Page = page;
  world.slice04HomeUrl = url;
}

function requiredPage(world: Slice04World): Page {
  assert.ok(world.slice04Page, 'test fixture error: the published home must be open');
  return world.slice04Page;
}

function requiredExpected(world: Slice04World): NonNullable<Slice04World['slice04Expected']> {
  assert.ok(world.slice04Expected, 'test fixture error: the controlled top call is required');
  return world.slice04Expected;
}

async function renderedRows(page: Page): Promise<RenderedRow[]> {
  return page.locator('ol.ranked > li').evaluateAll((rows) => rows.map((row) => {
    const anchor = row.querySelector<HTMLElement>('a');
    const score = row.querySelector<HTMLElement>('strong');
    const reason = [...row.querySelectorAll<HTMLElement>('p')]
      .map((paragraph) => paragraph.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    const linkRect = anchor?.getBoundingClientRect();
    return {
      visibleText: (row as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      headline: anchor?.textContent?.trim() ?? '',
      href: anchor?.getAttribute('href') ?? '',
      score: Number(score?.textContent?.trim()),
      reason,
      scoreFontPx: score === null ? 0 : Number.parseFloat(getComputedStyle(score).fontSize),
      linkWidth: linkRect?.width ?? 0,
      linkHeight: linkRect?.height ?? 0,
    };
  }));
}

function repeatableReasonFindings(
  reason: string,
  expected?: NonNullable<Slice04World['slice04Expected']>['expectedSpanish'],
): string[] {
  const findings: string[] = [];
  if (!/(?:Plano|Tobillo a rodilla|Rodilla a cintura|Cintura a pecho|Pecho a cabeza|Cabeza a un metro más|Doble o más)/i.test(reason)) {
    findings.push('la razón no nombra el tamaño con palabras del cuerpo');
  }
  if (!/(?:viento\s+)?(?:limpio|picado|destrozado)/i.test(reason)) {
    findings.push('la razón no nombra el estado del viento');
  }
  if (!/\b\d{1,2}:\d{2}\s*(?:a|hasta|[-–])\s*\d{1,2}:\d{2}\b/i.test(reason)) {
    findings.push('la razón no nombra una ventana con hora inicial y final');
  }
  if (hasTechnicalLeak(reason)) {
    findings.push('la razón expone nombres de modelos, campos internos o texto de relleno');
  }
  if (expected !== undefined) {
    const visible = reason.toLocaleLowerCase('es-PA');
    for (const [field, value] of [
      ['size_band', expected.size],
      ['wind_state', expected.wind],
      ['best_window', expected.window],
    ] as const) {
      if (!visible.includes(value.toLocaleLowerCase('es-PA'))) {
        findings.push(`${field} no se refleja como "${value}"`);
      }
    }
  }
  return findings;
}

function hasTechnicalLeak(reason: string): boolean {
  return /\b(?:ncep|gfs|dwd|ecmwf)(?:[_-]?[a-z0-9]+)*\b|\b(?:score_q|best_window|json|undefined|nan|error|placeholder)\b/i.test(reason);
}

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: el surfista decide en segundos y debe poder repetir el llamado sin volver a mirar. HOW: ${how}`,
  );
}

Given(
  'una mañana publicada cuyo mejor spot conserva tamaño, viento y ventana, con relato {string}',
  function (this: PipelineWorld, narrativeState: string) {
    const world = slice04World(this);
    world.slice04Root = copyProjectForSurface();
    world.slice04Expected = preparePublishedSurface(world.slice04Root, narrativeState, 'primera-luz');
  },
);

Given(
  'una mañana publicada con el perfil estructurado {string} y relato {string}',
  function (this: PipelineWorld, profileName: string, narrativeState: string) {
    const world = slice04World(this);
    world.slice04Root = copyProjectForSurface();
    world.slice04Expected = preparePublishedSurface(world.slice04Root, narrativeState, profileName);
  },
);

Given('una copia intacta de la mañana publicada instalada', function (this: PipelineWorld) {
  const world = slice04World(this);
  world.slice04Root = copyProjectForSurface();
  world.slice04Expected = observeUnmodifiedPublishedSurface(world.slice04Root);
});

When(
  'el surfista abre la home publicada a {int} px, con tema {string} y movimiento {string}',
  { timeout: 30_000 },
  async function (this: PipelineWorld, width: number, theme: string, movement: string) {
    await openSurface(slice04World(this), width, theme, movement);
  },
);

Then('ve un solo llamado del día antes de las filas compactas', async function (this: PipelineWorld) {
  const rows = await renderedRows(requiredPage(slice04World(this)));
  const dailyCalls = rows.filter((row) => /\bVE A\s+/i.test(row.visibleText));
  const findings: string[] = [];
  if (rows.length !== 20) findings.push(`la home tiene ${rows.length} filas, no veinte`);
  if (dailyCalls.length !== 1) findings.push(`hay ${dailyCalls.length} llamados que empiezan con VE A, no uno`);
  if ((rows[0]?.scoreFontPx ?? 0) < 48) findings.push('el puntaje del primer lugar no está sobredimensionado');
  if ((rows[1]?.scoreFontPx ?? Number.POSITIVE_INFINITY) > 28) findings.push('la segunda fila no conserva el tratamiento compacto');
  assertBehavior(findings, 'hacer de la primera fila la única tarjeta grande y titularla VE A {spot}.');
});

Then('el llamado dice VE A, nombra el mejor spot y muestra su mismo puntaje', async function (this: PipelineWorld) {
  const world = slice04World(this);
  const expected = requiredExpected(world);
  const top = (await renderedRows(requiredPage(world)))[0];
  const findings: string[] = [];
  const expectedHeadline = `VE A ${expected.spotName.toLocaleUpperCase('es-PA')}`;
  if (!top?.visibleText.toLocaleUpperCase('es-PA').includes(expectedHeadline)) {
    findings.push(`la tarjeta no contiene el titular "${expectedHeadline}"`);
  }
  if (top?.score !== expected.score) findings.push(`la tarjeta muestra ${String(top?.score)}, no ${expected.score}`);
  assertBehavior(findings, 'derivar el titular y el puntaje de la primera entrada del ranking publicado.');
});

Then('la razón nombra tamaño, viento y una ventana de horas en español', async function (this: PipelineWorld) {
  const world = slice04World(this);
  const top = (await renderedRows(requiredPage(world)))[0];
  assertBehavior(
    repeatableReasonFindings(top?.reason ?? '', requiredExpected(world).expectedSpanish),
    'componer una frase breve con tamaño corporal, estado del viento y ventana HH:MM a HH:MM.',
  );
});

Then('el destino y el puntaje del llamado son los del primer lugar de la lista', async function (this: PipelineWorld) {
  const world = slice04World(this);
  const expected = requiredExpected(world);
  const top = (await renderedRows(requiredPage(world)))[0];
  const findings: string[] = [];
  if (!top?.visibleText.toLocaleUpperCase('es-PA').includes(`VE A ${expected.spotName.toLocaleUpperCase('es-PA')}`)) findings.push('el primer lugar no se presenta como llamado con VE A');
  if (!top?.href.replace(/\/$/, '').endsWith(`/spots/${expected.spotId}`)) findings.push('el destino enlazado por el llamado no es el primer spot publicado');
  if (top?.score !== expected.score) findings.push('el puntaje del llamado no es el puntaje del primer spot publicado');
  assertBehavior(findings, 'usar la misma entrada de datos para la tarjeta y el primer lugar, sin una copia separada.');
});

Then('ningún segundo spot se presenta como otro llamado del día', async function (this: PipelineWorld) {
  const rows = await renderedRows(requiredPage(slice04World(this)));
  const extraCalls = rows.slice(1).filter((row) => /\bVE A\s+/i.test(row.visibleText));
  assertBehavior(
    extraCalls.map((row) => `${row.visibleText} también se presenta como llamado`),
    'reservar el verbo VE A y la escala heroica para la primera fila solamente.',
  );
});

Then('la tarjeta conserva una razón segura y repetible en español', async function (this: PipelineWorld) {
  const world = slice04World(this);
  const top = (await renderedRows(requiredPage(world)))[0];
  assertBehavior(
    repeatableReasonFindings(top?.reason ?? '', requiredExpected(world).expectedSpanish),
    'usar los campos estructurados de tamaño, viento y ventana cuando el relato falte o no sea apto para personas.',
  );
});

Then('el destino y la razón reflejan ese perfil y caben completos en el teléfono', async function (this: PipelineWorld) {
  const world = slice04World(this);
  const expected = requiredExpected(world);
  const page = requiredPage(world);
  const top = (await renderedRows(page))[0];
  const geometry = await page.locator('ol.ranked > li').first().evaluate((hero) => {
    const headline = hero.querySelector<HTMLElement>('a');
    const reason = hero.querySelector<HTMLElement>('p');
    const heroRect = hero.getBoundingClientRect();
    const headlineRect = headline?.getBoundingClientRect();
    const reasonRect = reason?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      heroLeft: heroRect.left,
      heroRight: heroRect.right,
      headlineWidth: headlineRect?.width ?? 0,
      headlineScrollWidth: headline?.scrollWidth ?? Number.POSITIVE_INFINITY,
      reasonHeight: reasonRect?.height ?? 0,
      reasonScrollHeight: reason?.scrollHeight ?? Number.POSITIVE_INFINITY,
    };
  });
  const findings = repeatableReasonFindings(top?.reason ?? '', expected.expectedSpanish);
  if (!top?.headline.includes(expected.spotName)) findings.push(`la tarjeta no nombra ${expected.spotName}`);
  if (geometry.scrollWidth > geometry.clientWidth || geometry.heroLeft < 0 || geometry.heroRight > geometry.clientWidth) {
    findings.push('U2: la tarjeta del destino largo desborda 390 px');
  }
  if (geometry.headlineScrollWidth > geometry.headlineWidth + 1 || geometry.reasonScrollHeight > geometry.reasonHeight + 1) {
    findings.push('U6: el destino o la razón quedan recortados');
  }
  assertBehavior(
    findings,
    'derivar la frase del size_band, wind_state y best_window de esa fila, y permitir que el español largo ajuste sin recorte.',
  );
});

Then('la tarjeta no muestra nombres de modelos, campos internos ni texto vacío', async function (this: PipelineWorld) {
  const top = (await renderedRows(requiredPage(slice04World(this))))[0];
  const reason = top?.reason.trim() ?? '';
  const findings: string[] = [];
  if (reason.length === 0) findings.push('la razón está vacía');
  if (hasTechnicalLeak(reason)) {
    findings.push(`la razón expone datos crudos: "${reason}"`);
  }
  assertBehavior(findings, 'degradar a la frase estructurada y nunca imprimir datos crudos en la tarjeta.');
});

Then('el llamado cumple las siete comprobaciones visuales de la superficie publicada', async function (this: PipelineWorld) {
  const world = slice04World(this);
  const page = requiredPage(world);
  const expected = requiredExpected(world);
  const expectedHeadline = `VE A ${expected.spotName.toLocaleUpperCase('es-PA')}`;
  const audit = await page.evaluate(`(() => {
    const expectedHeadline = ${JSON.stringify(expectedHeadline)};
    const parse = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/i);
      if (!match || match[1] === undefined) return null;
      const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
      return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
    };
    const luminance = ([r, g, b]) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const hero = document.querySelector('ol.ranked > li:first-child');
    const headline = hero?.querySelector('a') ?? null;
    const score = hero?.querySelector('strong') ?? null;
    const reason = hero?.querySelector('p') ?? null;
    const background = hero === null
      ? []
      : [...getComputedStyle(hero).backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)]
        .map((match) => parse(match[0]))
        .filter((color) => color !== null);
    const textElements = hero === null
      ? []
      : [...hero.querySelectorAll('a, strong, p, span')]
        .filter((element) => element.textContent?.trim() && element.getBoundingClientRect().width > 0);
    // The backdrop a surfer's eye actually receives, which is not always the
    // card's gradient. An element painting its own OPAQUE background (a solid
    // button) hides the gradient completely, so measuring its text against the
    // gradient measures a combination that is never on screen: white on --go
    // reads 6.75:1 to a person and 1.05:1 to a naive walk.
    //
    // Anything less than fully opaque still measures against the gradient, and
    // that is the point. A translucent surface lets the gradient through, so it
    // owes the same 4.5:1 every stop of the gradient owes. This is the rule
    // that keeps a future glass element honest, and it is why the fix belongs
    // here rather than in the button: the check was measuring the wrong
    // backdrop, not enforcing too strict a bar.
    const opaqueBackdropOf = (element) => {
      let node = element;
      while (node !== null && node !== hero) {
        const own = parse(getComputedStyle(node).backgroundColor);
        // parse() yields null for fully transparent; a 4th channel below 1 is
        // translucent and deliberately does NOT count as a backdrop.
        if (own !== null && (own.length < 4 || own[3] >= 1)) return own;
        node = node.parentElement;
      }
      return null;
    };
    const contrastFailures = textElements.flatMap((element) => {
      if (element === null) return ['falta un texto principal de la tarjeta'];
      const foreground = parse(getComputedStyle(element).color);
      if (foreground === null || background.length === 0) return ['no se pudo medir texto contra el fondo real de la tarjeta'];
      const ownBackdrop = opaqueBackdropOf(element);
      const backdrops = ownBackdrop === null ? background : [ownBackdrop];
      return backdrops
        .filter((stop) => contrast(foreground, stop) < 4.5)
        .map((stop) => element.tagName.toLowerCase() + ' queda en ' + contrast(foreground, stop).toFixed(2) + ':1');
    });
    const heroRect = hero?.getBoundingClientRect();
    const headlineRect = headline?.getBoundingClientRect();
    const actionTargets = [...(hero?.querySelectorAll('a, button, summary') ?? [])]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: element.textContent?.trim() ?? '', width: rect.width, height: rect.height };
      });
    const moving = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? [...(hero?.querySelectorAll('*') ?? [])]
        .filter((element) => getComputedStyle(element).transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0))
        .map((element) => element.textContent?.trim() ?? element.tagName.toLowerCase())
      : [];
    const heroComputed = hero === null ? null : getComputedStyle(hero);
    return {
      headline: hero?.innerText.replace(/\s+/g, ' ').trim() ?? '',
      expectedHeadline,
      contrastFailures,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      heroLeft: heroRect?.left ?? -1,
      heroRight: heroRect?.right ?? Number.POSITIVE_INFINITY,
      headlineWidth: headlineRect?.width ?? 0,
      headlineScrollWidth: headline?.scrollWidth ?? Number.POSITIVE_INFINITY,
      actionTargets,
      moving,
      loadingCount: hero?.querySelectorAll('[role="progressbar"], [data-reading-state="loading"], .spinner, .skeleton').length ?? 0,
      scoreFontPx: score === null ? 0 : Number.parseFloat(getComputedStyle(score).fontSize),
      reasonFontPx: reason === null ? 0 : Number.parseFloat(getComputedStyle(reason).fontSize),
      reasonHeight: reason?.getBoundingClientRect().height ?? 0,
      reasonScrollHeight: reason?.scrollHeight ?? Number.POSITIVE_INFINITY,
      heroStyleSource: [...document.querySelectorAll('style')].map((style) => style.textContent ?? '').join('\\n'),
      heroTransitionDurations: heroComputed?.transitionDuration ?? '',
      heroAnimationNames: heroComputed?.animationName ?? '',
    };
  })()` ) as {
    readonly headline: string;
    readonly expectedHeadline: string;
    readonly contrastFailures: string[];
    readonly scrollWidth: number;
    readonly clientWidth: number;
    readonly heroLeft: number;
    readonly heroRight: number;
    readonly headlineWidth: number;
    readonly headlineScrollWidth: number;
    readonly actionTargets: { readonly text: string; readonly width: number; readonly height: number }[];
    readonly moving: string[];
    readonly loadingCount: number;
    readonly scoreFontPx: number;
    readonly reasonFontPx: number;
    readonly reasonHeight: number;
    readonly reasonScrollHeight: number;
    readonly heroStyleSource: string;
    readonly heroTransitionDurations: string;
    readonly heroAnimationNames: string;
  };

  const findings: string[] = [];
  if (!audit.headline.toLocaleUpperCase('es-PA').includes(audit.expectedHeadline)) findings.push(`U5: falta el llamado visible "${audit.expectedHeadline}"`);
  findings.push(...audit.contrastFailures.map((finding) => `U1: ${finding}`));
  if (audit.scrollWidth > audit.clientWidth || audit.heroLeft < 0 || audit.heroRight > audit.clientWidth) findings.push('U2: la tarjeta desborda el teléfono de 390 px');
  if (audit.headlineScrollWidth > audit.headlineWidth + 1) findings.push('U2: el nombre del destino queda recortado');
  for (const target of audit.actionTargets) {
    if (target.width < 44 || target.height < 44) findings.push(`U3: "${target.text}" mide ${Math.round(target.width)}x${Math.round(target.height)} px`);
  }
  if (audit.moving.length > 0) findings.push(`U4: el movimiento reducido deja transiciones en ${audit.moving.join(', ')}`);
  if (audit.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial');
  if (audit.scoreFontPx < 48 || audit.reasonFontPx < 16 || audit.reasonScrollHeight > audit.reasonHeight + 1) findings.push('U6: la escala o el ajuste del texto español no conserva la jerarquía completa');
  const heroRule = audit.heroStyleSource.match(/ol\.ranked li:first-child\{([^}]*)\}/)?.[1] ?? '';
  const requiredHeroTokens = [
    ['fondo', /background:var\(--hero-grad\)/],
    ['espaciado exterior', /margin-bottom:var\(--sp-4\)/],
    ['espaciado interior', /padding:var\(--sp-4\)/],
    ['radio', /border-radius:var\(--r-l\)/],
    ['elevación', /box-shadow:var\(--shadow-1\)/],
  ] as const;
  for (const [label, tokenPattern] of requiredHeroTokens) {
    if (!tokenPattern.test(heroRule)) findings.push(`U7: ${label} no usa el token nombrado de la tarjeta`);
  }
  if (/#[0-9a-f]{3,8}\b/i.test(heroRule)) findings.push('U7: la tarjeta introduce un color hexadecimal fuera de sus tokens');
  const heroHasTransition = audit.heroTransitionDurations
    .split(',')
    .some((duration) => Number.parseFloat(duration) > 0);
  const heroHasAnimation = audit.heroAnimationNames
    .split(',')
    .some((name) => name.trim() !== '' && name.trim() !== 'none');
  if (heroHasTransition || heroHasAnimation) findings.push('U7: el llamado debe ser estático; movimiento no aplica a esta tarjeta');
  if (world.slice04UiGate?.status !== 0) findings.push(`U2/U4/U6/U7: el gate de la superficie falló: ${world.slice04UiGate?.output.trim() ?? ''}`);
  assertBehavior(findings, 'renderizar el llamado con los tokens existentes, geometría móvil, estados honestos y preferencias del sistema.');
});

After({ tags: '@slice-04', timeout: 15_000 }, async function (this: PipelineWorld) {
  const world = slice04World(this);
  await world.slice04Browser?.close();
  if (world.slice04Preview !== undefined && world.slice04Preview.exitCode === null) {
    world.slice04Preview.kill('SIGTERM');
  }
  if (world.slice04Root !== undefined) {
    rmSync(world.slice04Root, { recursive: true, force: true });
  }
});
