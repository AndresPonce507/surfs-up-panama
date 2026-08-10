// Slice-01 acceptance steps: the day-one track-record box on every spot page.
//
// Zero surf reports have ever been filed and no write store is deployed, so
// the only thing this feature can honestly ship today is the settled empty
// state. Every step below observes it through a production entry point: the
// real `npm run build`, the emitted `dist/` served over real HTTP, and
// Chromium at 390 px. No step names a payload field, because the producer to
// page wire for this block does not exist yet and inventing it here would put
// a design decision in a test.
//
// World: this file deliberately does NOT call setWorldConstructor. The sibling
// lane's steps/support/world.ts already sets one, cucumber loads every step
// file globally, and last loaded wins, so a second constructor would silently
// take out 78 passing scenarios. Per scenario state lives in the module below
// and is reset by a hook scoped to this feature's own tags. cucumber.mjs
// declares no parallelism, so scenarios run one at a time.

import { After, AfterAll, Before, Given, Then, When } from '@cucumber/cucumber';
import type { Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { builtSurface, openAt390, releaseBuiltSurface, type BuiltSurface } from './support/built-surface';
import {
  contrastRatio,
  normalise,
  observeBox,
  SETTLED_EMPTY_STATE_ES,
  stripTags,
  THRESHOLD,
  type BoxObservation,
} from './support/track-record-box';

const SCOPE = '@feature-f-show-our-track-record and @slice-01';

type SweepResult = {
  readonly inspected: readonly string[];
  readonly missing: readonly string[];
  readonly wrongNumbers: readonly { readonly route: string; readonly digits: readonly string[] }[];
};

type Slice01State = {
  surface: BuiltSurface | null;
  route: string | null;
  page: Page | null;
  box: BoxObservation | null;
  movement: string;
  servedBody: string | null;
  document: { readonly path: string; readonly html: string; readonly bytes: number } | null;
  sweep: SweepResult | null;
};

let state: Slice01State;

function reset(): void {
  state = {
    surface: null,
    route: null,
    page: null,
    box: null,
    movement: 'normal',
    servedBody: null,
    document: null,
    sweep: null,
  };
}

reset();

function requiredSurface(): BuiltSurface {
  assert.ok(state.surface, 'test harness error: no built surface for this scenario');
  return state.surface;
}

function requiredBox(): BoxObservation {
  assert.ok(state.box, 'test harness error: no spot page has been opened yet');
  assert.ok(
    state.box.found,
    `the spot page ${String(state.route)} renders no track-record box: no element carrying the shipped ` +
      '`.scorecard` or `.state-empty` recipe (src/styles/recipes.css 61-116) exists on the built page. ' +
      'Decision 13 puts the track record inline on every spot; today the page renders score, size, ' +
      'window and the report call to action, and nothing about how often we have been right.',
  );
  return state.box;
}

Before({ tags: SCOPE }, function () {
  reset();
});

After({ tags: SCOPE }, async function () {
  await state.page?.close().catch(() => undefined);
  state.page = null;
});

AfterAll({ timeout: 30_000 }, async function () {
  await releaseBuiltSurface();
});

// ---------------------------------------------------------------- Given

Given('una superficie construida desde el repositorio real, sin nube ni red', { timeout: 900_000 }, async function () {
  state.surface = await builtSurface();
  assert.ok(
    state.surface.spotRoutes.length > 0,
    'test harness error: the build emitted no spot detail pages at all, so there is nothing to observe',
  );
});

// ----------------------------------------------------------------- When

When('el surfista abre la página de un spot a 390 px', { timeout: 120_000 }, async function () {
  const built = requiredSurface();
  const route = built.spotRoutes[0]!;
  state.route = route;
  const opened = await openAt390(built, route);
  state.page = opened.page;
  state.box = await observeBox(opened.page);
});

When(
  'el surfista abre la página de un spot a 390 px, con tema {string} y movimiento {string}',
  { timeout: 120_000 },
  async function (theme: string, movement: string) {
    const built = requiredSurface();
    const route = built.spotRoutes[0]!;
    state.route = route;
    state.movement = movement;
    const opened = await openAt390(built, route, { theme, movement });
    state.page = opened.page;
    state.box = await observeBox(opened.page);
  },
);

When('se revisan todas las páginas de spot que el sitio emitió', { timeout: 180_000 }, async function () {
  const built = requiredSurface();
  const inspected: string[] = [];
  const missing: string[] = [];
  const wrongNumbers: { route: string; digits: string[] }[] = [];
  for (const route of built.spotRoutes) {
    const response = await fetch(`${built.url}${route}`);
    assert.equal(response.status, 200, `test harness error: ${route} answered ${response.status} from the built surface`);
    const text = normalise(stripTags(await response.text()));
    inspected.push(route);
    if (!text.includes(SETTLED_EMPTY_STATE_ES)) {
      missing.push(route);
      const near = /Van\s+(\d+)\s+reportes\s+de\s+los\s+(\d+)/.exec(text);
      if (near !== null) wrongNumbers.push({ route, digits: [near[1]!, near[2]!] });
    }
  }
  state.sweep = { inspected, missing, wrongNumbers };
});

When('el teléfono pide la página de un spot y no ejecuta nada', { timeout: 60_000 }, async function () {
  const built = requiredSurface();
  const route = built.spotRoutes[0]!;
  state.route = route;
  const response = await fetch(`${built.url}${route}`);
  assert.equal(response.status, 200, `test harness error: ${route} answered ${response.status} from the built surface`);
  state.servedBody = await response.text();
});

When('se revisa el documento que el sitio emitió para un spot', function () {
  const built = requiredSurface();
  const route = built.spotRoutes[0]!;
  state.route = route;
  const slug = route.replace(/^\/spots\//, '').replace(/\/$/, '');
  const path = join(built.dist, 'spots', `${slug}.html`);
  state.document = { path, html: readFileSync(path, 'utf8'), bytes: statSync(path).size };
});

// ----------------------------------------------------------------- Then

Then('debajo del pronóstico aparece el recuadro del historial con la frase asentada palabra por palabra', function () {
  const box = requiredBox();
  assert.equal(
    normalise(box.text).includes(SETTLED_EMPTY_STATE_ES),
    true,
    `the track-record box on ${String(state.route)} does not carry the settled day-one sentence.\n` +
      `  expected to contain: ${SETTLED_EMPTY_STATE_ES}\n` +
      `  box reads:           ${normalise(box.text) || '(empty)'}\n` +
      'The Spanish is settled word for word in application-architecture.md section 10 and must not be reworded.',
  );
});

Then('el recuadro va después del pronóstico de mañana y antes del llamado a reportar', function () {
  const box = requiredBox();
  assert.ok(box.tomorrowSectionPresent, `test harness error: ${String(state.route)} has no tomorrow forecast section to position against`);
  assert.ok(box.reportCtaPresent, `test harness error: ${String(state.route)} has no report call to action to position against`);
  assert.ok(
    box.followsTomorrowSection && box.precedesReportCta,
    `the track-record box on ${String(state.route)} is not where a surfer reads it: decision 13 and the ` +
      'section 14 wireframe put it under the forecast and above the report call to action. ' +
      `Observed: after the tomorrow forecast = ${box.followsTomorrowSection}, before the report call to action = ${box.precedesReportCta}.`,
  );
});

Then('la revisión dice cuántas páginas miró, y cero páginas miradas es una falla', function () {
  const sweep = state.sweep;
  assert.ok(sweep, 'test harness error: the sweep did not run');
  assert.ok(
    sweep.inspected.length > 0,
    'the sweep inspected zero spot pages, so it proves nothing. A sweep that can pass on an empty set ' +
      'is the exact shape of the bug this repository already shipped, where nineteen of twenty spots ' +
      'were missing a field and all ten CI jobs passed.',
  );
});

Then('todas las páginas revisadas traen la frase asentada con sus dos números, cero y treinta', function () {
  const sweep = state.sweep;
  assert.ok(sweep, 'test harness error: the sweep did not run');
  const detail = sweep.wrongNumbers
    .map((row) => `      ${row.route} reads "Van ${row.digits[0]} reportes de los ${row.digits[1]}"`)
    .join('\n');
  assert.equal(
    sweep.missing.length,
    0,
    `${sweep.missing.length} of ${sweep.inspected.length} spot pages do not carry the settled day-one sentence.\n` +
      `  expected on every page: ${SETTLED_EMPTY_STATE_ES}\n` +
      `  first pages without it: ${sweep.missing.slice(0, 5).join(', ')}\n` +
      (detail === '' ? '' : `  pages with the sentence but different numbers:\n${detail}\n`) +
      `  inspected ${sweep.inspected.length} page(s) in total; the threshold is ${THRESHOLD} and no report has ever been filed, so every page owes 0 of ${THRESHOLD}.`,
  );
});

Then('lo que llega ya trae la frase asentada con sus dos números', function () {
  const body = state.servedBody;
  assert.ok(body, 'test harness error: nothing was fetched');
  assert.equal(
    normalise(stripTags(body)).includes(SETTLED_EMPTY_STATE_ES),
    true,
    `the bytes served for ${String(state.route)} do not contain the settled day-one sentence.\n` +
      `  expected to contain: ${SETTLED_EMPTY_STATE_ES}\n` +
      'The frontend renders and never computes statistics (application-architecture.md section 7, P5), ' +
      'so the sentence and its two numbers have to arrive already written, not be assembled on the phone.',
  );
});

Then('dentro del recuadro los únicos números son el cero y el treinta de la frase', function () {
  const box = requiredBox();
  assert.deepEqual(
    [...box.digits],
    ['0', String(THRESHOLD)],
    `the track-record box on ${String(state.route)} shows numbers other than its own counter.\n` +
      `  numbers found in the box: ${box.digits.join(', ') || '(none)'}\n` +
      `  box reads:                ${normalise(box.text) || '(empty)'}\n` +
      'No report has ever been filed, so no gate can be passed and no accuracy figure may appear ' +
      'anywhere in this box (domain-model.md section 9; 06-learning-layer.md section 10).',
  );
});

Then('dentro del recuadro no hay porcentaje, ni margen con más y menos, ni metros de error', function () {
  const box = requiredBox();
  const text = normalise(box.text);
  const offences: string[] = [];
  if (text.includes('%')) offences.push('a percentage sign');
  if (text.includes('±')) offences.push('a plus-minus margin');
  if (/\d+[.,]\d+\s*m\b/.test(text)) offences.push('a metre figure');
  if (/\bsesgo\b|\bacierto del\b|\bprecisión\b/i.test(text)) offences.push('claim wording');
  assert.deepEqual(
    offences,
    [],
    `the track-record box on ${String(state.route)} reads like a claim, and no spot can have earned one: ` +
      `${offences.join(', ')}.\n  box reads: ${text}`,
  );
});

Then('el recuadro trae la frase asentada exacta, sin raya larga ni marcadores de relleno', function () {
  const box = requiredBox();
  const text = normalise(box.text);
  assert.equal(
    text.includes(SETTLED_EMPTY_STATE_ES),
    true,
    `the box sentence on ${String(state.route)} is not the settled one, word for word.\n` +
      `  expected: ${SETTLED_EMPTY_STATE_ES}\n  box reads: ${text || '(empty)'}`,
  );
  const offences: string[] = [];
  if (text.includes('—')) offences.push('an em dash');
  if (/\{n\}|\{threshold\}|\{\{|\[[A-Za-z]/.test(text)) offences.push('an unreplaced placeholder token');
  assert.deepEqual(offences, [], `the box copy on ${String(state.route)} breaks the project copy rules: ${offences.join(', ')}.\n  box reads: ${text}`);
});

Then('dentro del recuadro no hay texto en inglés ni texto técnico', function () {
  const box = requiredBox();
  const text = normalise(box.text);
  const offences: string[] = [];
  if (/\breports?\b|\bwe need\b|\btrack record\b|\bcan't tell\b/i.test(text)) offences.push('English copy');
  if (/\bnull\b|\bundefined\b|\bNaN\b|claim_ok|n_obs|n_reporters|scorecard|JSON/i.test(text)) offences.push('technical text');
  assert.deepEqual(
    offences,
    [],
    `the track-record box on ${String(state.route)} shows ${offences.join(' and ')} on the Spanish surface.\n  box reads: ${text}`,
  );
});

Then('el recuadro cumple sus comprobaciones visuales sobre su propio fondo', function () {
  const box = requiredBox();
  const failures: string[] = [];

  const ratio = contrastRatio(box.color, box.background);
  if (ratio < 4.5) {
    failures.push(`U1 contrast: box text ${box.color} on its own backdrop ${box.background} measures ${ratio.toFixed(2)}:1, below 4.5:1`);
  }
  if (box.documentScrollWidth > box.viewportWidth + 1) {
    failures.push(`U2 overflow: the document scrolls to ${box.documentScrollWidth}px inside a ${box.viewportWidth}px viewport`);
  }
  if (box.boxScrollWidth > box.boxClientWidth + 1) {
    failures.push(`U2 overflow: the box scrolls to ${box.boxScrollWidth}px inside its own ${box.boxClientWidth}px width`);
  }
  if (state.movement === 'reducido' && box.animatedDescendants > 0) {
    failures.push(`U4 reduced motion: ${box.animatedDescendants} element(s) in the box still animate or transition`);
  }
  if (!box.borderStyle.includes('dashed')) {
    failures.push(
      `U5 state: the box border is "${box.borderStyle}", not the dashed treatment the shipped .state-empty recipe gives ` +
        'the day-one state so it reads as "not yet" and never as an error or a blank',
    );
  }
  if (box.dangerColor !== '' && box.color === box.dangerColor) {
    failures.push('U5 state: the box text uses the danger colour, so an honest counter reads as an error');
  }
  const flatDigits = box.digitCarriers.filter((carrier) => !carrier.fontVariantNumeric.includes('tabular-nums'));
  for (const carrier of flatDigits) {
    failures.push(`U6 numerals: "${carrier.ownText}" renders with font-variant-numeric "${carrier.fontVariantNumeric}", not the tabular-nums the shipped .scorecard .counter recipe gives the counter`);
  }
  if (box.digitCarriers.length === 0) {
    failures.push('U6 numerals: no element in the box carries the counter digits, so the counter cannot be read at all');
  }
  if (box.clippedDescendants > 0) {
    failures.push(`U6 type: ${box.clippedDescendants} element(s) in the box truncate their text with an ellipsis at 390 px`);
  }

  assert.deepEqual(
    failures,
    [],
    `the track-record box on ${String(state.route)} fails its own visual checks at 390 px:\n  - ${failures.join('\n  - ')}`,
  );
});

Then('la comprobación visual estática del sitio sigue pasando con el recuadro puesto', function () {
  requiredBox();
  const built = requiredSurface();
  assert.equal(
    built.uiGate.status,
    0,
    `the shipped UI mandate gate (scripts/check-ui-quality.mjs) no longer passes once the box is on the page:\n${built.uiGate.output}`,
  );
});

Then('el documento ya trae la frase asentada escrita', function () {
  const emitted = state.document;
  assert.ok(emitted, 'test harness error: no emitted document was read');
  assert.equal(
    normalise(stripTags(emitted.html)).includes(SETTLED_EMPTY_STATE_ES),
    true,
    `the document the build emitted for ${String(state.route)} does not contain the settled day-one sentence.\n` +
      `  file:     ${emitted.path} (${emitted.bytes} bytes)\n` +
      `  expected: ${SETTLED_EMPTY_STATE_ES}`,
  );
});

Then('el documento no trae ningún guion que la arme en el teléfono', function () {
  const emitted = state.document;
  assert.ok(emitted, 'test harness error: no emitted document was read');
  const offences: string[] = [];
  if (/<astro-island/i.test(emitted.html)) offences.push('a hydrated island (<astro-island>)');
  if (/\sclient:(load|idle|visible|media|only)\b/i.test(emitted.html)) offences.push('a client hydration directive');
  assert.deepEqual(
    offences,
    [],
    `the spot document ships ${offences.join(' and ')} to build the track-record box on the phone.\n` +
      `  file: ${emitted.path} (${emitted.bytes} bytes)\n` +
      'The frontend renders and never computes statistics (P5), and the page weight ceilings this build ' +
      'already enforces leave no room for an island that only prints one settled sentence.',
  );
});
