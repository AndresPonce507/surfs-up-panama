// Slice-03 acceptance steps: the counter counts real reports.
//
// Every scenario in this slice is skip-gated by @blocked-on-real-reports
// (see blocked-gate.steps.ts). The Given steps below are fail-loud on
// purpose: if someone removes the tag before the block clears, the run does
// not silently invent a store — it names the exact open pre-requisite.
//
// What is already implementable is implemented: every Then that reads the
// built page goes through the same observeBox oracle slice-01 shipped, so
// the vocabulary is shared at the support layer. What cannot be implemented
// yet (reading the real deployed store, driving the real updater) fails
// naming what DISTILL re-entry must wire. NOTHING here may seed data: the
// Given for "una playa guarda tres reportes de verdad" VERIFIES real state
// when it is completed at re-entry; it never creates it.

import { After, Given, Then, When } from '@cucumber/cucumber';
import type { Page } from '@playwright/test';
import assert from 'node:assert/strict';

import { builtSurface, openAt390, type BuiltSurface } from './support/built-surface';
import { normalise, observeBox, THRESHOLD, type BoxObservation } from './support/track-record-box';

const SCOPE = '@feature-f-show-our-track-record and @slice-03';

const DEPLOY_BLOCK =
  'HARD BLOCK, still standing: the report write path is not deployed and zero surf reports ' +
  'exist anywhere (F-TELL-US-WHAT-YOU-SAW-COLD slice-03 unshipped; feature-delta.md ' +
  'Pre-requisites 5 and 6). This step is completed at DISTILL re-entry, when it will VERIFY ' +
  'the real store state — it never seeds, fabricates or demo-fills a report.';

type Slice03State = {
  surface: BuiltSurface | null;
  page: Page | null;
  box: BoxObservation | null;
  route: string | null;
  movement: string;
};

let state: Slice03State = { surface: null, page: null, box: null, route: null, movement: 'normal' };

After({ tags: SCOPE }, async function () {
  await state.page?.close().catch(() => undefined);
  state = { surface: null, page: null, box: null, route: null, movement: 'normal' };
});

// ---------------------------------------------------------------- Given

Given('el camino de reportes está desplegado y una playa guarda tres reportes de verdad', function () {
  assert.fail(DEPLOY_BLOCK);
});

Given('el actualizador ya emparejó los tres una vez', function () {
  assert.fail(DEPLOY_BLOCK);
});

Given(
  'el camino de reportes está desplegado y una playa guarda tres reportes mientras otra no guarda ninguno',
  function () {
    assert.fail(DEPLOY_BLOCK);
  },
);

Given('el camino de reportes está desplegado y el historial de pronto no se puede leer', function () {
  assert.fail(
    DEPLOY_BLOCK +
      ' Additionally this scenario needs the Pre-requisite 7 amendment signed off (domain and ' +
      'frontend lanes): from the day the store exists, an unreadable scorecard source fails the ' +
      'publish LOUD and the prior page stands.',
  );
});

Given('el camino de reportes está desplegado y una playa acaba de recibir un reporte', function () {
  assert.fail(
    DEPLOY_BLOCK +
      ' Additionally the counter semantics pin (Pre-requisite 4a: stored reports vs verified ' +
      'pairs at spot grain) must be settled by the domain lane before this scenario asserts.',
  );
});

// ----------------------------------------------------------------- When

When('el surfista abre la página de esa playa a 390 px', { timeout: 120_000 }, async function () {
  const built = (state.surface ??= await builtSurface());
  const route = state.route ?? built.spotRoutes[0]!;
  state.route = route;
  const opened = await openAt390(built, route);
  state.page = opened.page;
  state.box = await observeBox(opened.page);
});

When('el surfista abre la página de la playa sin reportes a 390 px', { timeout: 120_000 }, async function () {
  assert.fail(
    'completed at DISTILL re-entry: selecting the zero-report spot needs the real store to ' +
      'name which spot holds nothing; today every spot holds nothing because no store exists.',
  );
});

When(
  'el surfista abre la página de esa playa a 390 px, en tema {string} y con movimiento {string}',
  { timeout: 120_000 },
  async function (theme: string, movement: string) {
    const built = (state.surface ??= await builtSurface());
    const route = state.route ?? built.spotRoutes[0]!;
    state.route = route;
    state.movement = movement;
    const opened = await openAt390(built, route, { theme, movement });
    state.page = opened.page;
    state.box = await observeBox(opened.page);
  },
);

When('el actualizador vuelve a correr sobre los mismos reportes', function () {
  assert.fail(
    'completed at DISTILL re-entry: driving the real hourly updater (cursor-tracked ' +
      'exactly-once, adr-scorecard-incremental decision 3) needs its stack home named first ' +
      '(feature-delta.md Pre-requisites 5 and 6, both open).',
  );
});

When('se intenta publicar el sitio', function () {
  assert.fail(
    'completed at DISTILL re-entry: the loud-failure publish path (Pre-requisite 7) is a ' +
      'DESIGN amendment to the P1 degrade row and must be settled before a test drives it.',
  );
});

When('se leen el contador de la página de esa playa y el mensaje de gracias del reporte', function () {
  assert.fail(
    'completed at DISTILL re-entry: the reveal counter belongs to F-TELL slice-04 and the ' +
      'coherence pin is feature-delta.md Pre-requisite 4a; this step reads both surfaces once ' +
      'both exist.',
  );
});

// ----------------------------------------------------------------- Then

function requiredBox(): BoxObservation {
  assert.ok(state.box, 'test harness error: no spot page has been opened yet');
  assert.ok(state.box.found, `the spot page ${String(state.route)} renders no track-record box at all`);
  return state.box;
}

Then('el recuadro dice, palabra por palabra, que van 3 reportes de los 30 que hacen falta', function () {
  const box = requiredBox();
  const expected = `Van 3 reportes de los ${THRESHOLD} que hacen falta.`;
  assert.ok(
    normalise(box.text).includes(expected),
    `the box on ${String(state.route)} does not carry the settled counting sentence.\n` +
      `  expected to contain: ${expected}\n  box reads: ${normalise(box.text) || '(empty)'}\n` +
      'The sentence is the section 10 template with the block\'s own integers; the three MUST ' +
      'be the real stored count, never typed into copy.',
  );
});

Then('ese tres viene contado del registro real, nunca escrito a mano', function () {
  assert.fail(
    'completed at DISTILL re-entry: proving computed-not-asserted (requirement R3) needs input ' +
      'variation against the real store — file one more real report, rebuild, watch the counter ' +
      'move to 4. That falsifiability is exactly what slice-01 refused to fake and slice-03 owns.',
  );
});

Then('el recuadro dice que van 0 reportes de los 30 que hacen falta', function () {
  const box = requiredBox();
  const expected = `Van 0 reportes de los ${THRESHOLD} que hacen falta.`;
  assert.ok(
    normalise(box.text).includes(expected),
    `the zero-report spot's box does not carry the honest zero.\n  expected: ${expected}\n  box reads: ${normalise(box.text)}`,
  );
});

Then('ese cero viene de leer el registro real, no de suponer que no existe', function () {
  assert.fail(
    'completed at DISTILL re-entry: from the day the store exists, the slice-01 ' +
      'zero-from-absence emission is illegal (feature-delta.md slice-01 constraint a). This ' +
      'step must observe that the producer read the store and counted zero, not that it ' +
      'defaulted on absence.',
  );
});

Then('las cuentas de esa playa quedan exactamente como estaban', function () {
  assert.fail('completed at DISTILL re-entry, with the real updater and real aggregates to compare.');
});

Then('ningún día ya contado cambia', function () {
  assert.fail('completed at DISTILL re-entry: the ScorecardDay complement invariant, observed on real items.');
});

Then('la publicación falla en voz alta nombrando la fuente del historial', function () {
  assert.fail('completed at DISTILL re-entry, once the Pre-requisite 7 loud-failure rule is settled and built.');
});

Then('la página anterior sigue sirviendo, sin ningún cero fabricado encima de reportes reales', function () {
  assert.fail('completed at DISTILL re-entry: the refused-build behaviour keeps the prior dated page standing.');
});

Then('los dos cuentan la misma historia sobre esa playa', function () {
  assert.fail('completed at DISTILL re-entry, under the Pre-requisite 4a semantics pin.');
});

Then('ningún reporte aceptado puede hacer que una frase diga más que la otra', function () {
  assert.fail('completed at DISTILL re-entry: the builder-down-hour case from Pre-requisite 4a, on real surfaces.');
});

Then('el recuadro contando cumple sus comprobaciones visuales sobre su propio fondo', function () {
  const box = requiredBox();
  const failures: string[] = [];
  if (box.textCarriers.length === 0) failures.push('U1: no element in the box carries visible text');
  if (box.documentScrollWidth > box.viewportWidth + 1) {
    failures.push(`U2: the document scrolls to ${box.documentScrollWidth}px inside ${box.viewportWidth}px`);
  }
  if (state.movement === 'reducido' && box.animatedDescendants > 0) {
    failures.push(`U4: ${box.animatedDescendants} element(s) still animate under reduced motion`);
  }
  if (!box.borderStyle.includes('dashed')) {
    failures.push(`U5: the counting state must keep the dashed not-yet treatment, got "${box.borderStyle}"`);
  }
  const flat = box.digitCarriers.filter((c) => !c.fontVariantNumeric.includes('tabular-nums'));
  if (flat.length > 0) failures.push(`U6: ${flat.length} digit carrier(s) without tabular-nums`);
  if (box.clippedDescendants > 0) failures.push(`U6: ${box.clippedDescendants} element(s) truncate at 390 px`);
  assert.deepEqual(failures, [], `the counting box fails its visual checks:\n  - ${failures.join('\n  - ')}`);
});

Then('la comprobación visual estática del sitio sigue pasando con el contador en marcha', function () {
  requiredBox();
  assert.ok(state.surface, 'test harness error: no built surface');
  assert.equal(
    state.surface.uiGate.status,
    0,
    `the shipped UI gate no longer passes with the counting box on the page:\n${state.surface.uiGate.output}`,
  );
});
