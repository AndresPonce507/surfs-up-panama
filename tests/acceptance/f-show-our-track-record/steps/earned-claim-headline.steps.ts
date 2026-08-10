// Slice-04 acceptance steps: the earned claim headline.
//
// Skip-gated whole by @blocked-on-real-reports (blocked-gate.steps.ts). Two
// separate blocks stand behind the tag, and the Given steps name each:
//   1. DATA: no spot can pass the gate for months (n >= 10 pairs, 5 distinct
//      trust-eligible reporters, |bias| > 2*se_gate; zero reports exist).
//   2. COPY: the Spanish claim sentence is NOT settled anywhere. The
//      06-learning-layer.md section 11 sentence ("corre chico aqui: 0.18 m de
//      menos (n=22, 7 personas, +/-0.09)") is a worked example inside a
//      design document, not approved copy. Settling it is Andres's, through
//      the cousin's crew channel (feature-delta.md Pre-requisite 1b). No test
//      may promote a worked example into copy.
//
// At DISTILL re-entry (copy settled + Pre-requisite 4b key-selection rule
// pinned) the render path may be fixture-proven through the producer's
// injection seam — proving the box can DRAW a claim is not pretending a spot
// EARNED one — while the real-data examination stays recorded as deferred
// until the first morning a real spot passes the gate.

import { After, Given, Then, When } from '@cucumber/cucumber';
import type { Page } from '@playwright/test';
import assert from 'node:assert/strict';

import { builtSurface, openAt390, type BuiltSurface } from './support/built-surface';
import { normalise, observeBox, type BoxObservation } from './support/track-record-box';

const SCOPE = '@feature-f-show-our-track-record and @slice-04';

const DATA_BLOCK =
  'HARD BLOCK, still standing: no spot has passed the claim gate and none can for months — ' +
  'zero surf reports exist and organic accumulation to n >= 10 pairs from 5 distinct ' +
  'trust-eligible reporters at one (spot, source, lead) key is a matter of months at launch ' +
  'volumes (feature-delta.md slice-04 row; 06-learning-layer.md section 10: both claim ' +
  'ladders fail everywhere at launch by construction).';

const COPY_BLOCK =
  'HARD BLOCK, still standing: the Spanish claim copy has never been settled. The 06 section ' +
  '11 sentence is a worked example inside a design document, and the fitted-on-good-days ' +
  'caveat copy "nobody has designed" (06 section 14 item 6). Both route through the cousin\'s ' +
  'crew channel and need Andres (feature-delta.md Pre-requisite 1b). A test must not promote ' +
  'a worked example into settled copy.';

type Slice04State = {
  surface: BuiltSurface | null;
  page: Page | null;
  box: BoxObservation | null;
  route: string | null;
  movement: string;
};

let state: Slice04State = { surface: null, page: null, box: null, route: null, movement: 'normal' };

After({ tags: SCOPE }, async function () {
  await state.page?.close().catch(() => undefined);
  state = { surface: null, page: null, box: null, route: null, movement: 'normal' };
});

// ---------------------------------------------------------------- Given

Given('una playa que de verdad pasó la reja con 22 pares de 7 personas', function () {
  assert.fail(DATA_BLOCK);
});

Given('una playa gateada cuyo error de muestra quedó por debajo del piso físico', function () {
  assert.fail(
    DATA_BLOCK +
      ' At re-entry this precondition may be fixture-driven through the producer seam: the ' +
      'floored-margin law (stored se carries se_gate, 06 section 7 G3) is about the compose ' +
      'path, not about who earned what.',
  );
});

Given('la frase de la afirmación quedó asentada por Andres y su gente', function () {
  assert.fail(COPY_BLOCK);
});

Given('una playa donde más de una combinación de fuente y horizonte pasó la reja', function () {
  assert.fail(
    DATA_BLOCK +
      ' Additionally the key-to-spot selection rule (which (source, lead_bucket) key\'s claim a ' +
      'spot page shows when several pass) is pinned NOWHERE in the corpus: feature-delta.md ' +
      'Pre-requisite 4b, a domain-lane call this test refuses to invent.',
  );
});

Given('una playa gateada y otra que sigue debajo de la reja', function () {
  assert.fail(DATA_BLOCK);
});

Given('el sitio construido con playas gateadas y playas debajo de la reja', function () {
  assert.fail(DATA_BLOCK);
});

// ----------------------------------------------------------------- When

When('se compone la afirmación de esa playa', function () {
  assert.fail('completed at DISTILL re-entry: the headline composer lands with the settled copy (Pre-requisite 1b).');
});

When('se compone la afirmación con los números de una playa gateada', function () {
  assert.fail('completed at DISTILL re-entry: the headline composer lands with the settled copy (Pre-requisite 1b).');
});

When('se decide qué afirmación muestra la página de esa playa', function () {
  assert.fail('completed at DISTILL re-entry: needs the Pre-requisite 4b key-selection pin, a domain-lane call.');
});

When('se revisan las páginas de las dos playas', function () {
  assert.fail('completed at DISTILL re-entry: needs a real gated spot beside a sub-gate one.');
});

When('se revisan todas las páginas de spot que el sitio emitió con sus recuadros', function () {
  assert.fail('completed at DISTILL re-entry: the sweep re-runs slice-01\'s enumeration once claim states exist.');
});

When(
  'el surfista abre la página de esa playa a 390 px, en tema {string} y con el movimiento {string}',
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

// ----------------------------------------------------------------- Then

function requiredBox(): BoxObservation {
  assert.ok(state.box, 'test harness error: no spot page has been opened yet');
  assert.ok(state.box.found, `the spot page ${String(state.route)} renders no track-record box at all`);
  return state.box;
}

Then('el recuadro trae la afirmación en lugar del contador, nunca los dos', function () {
  const box = requiredBox();
  const text = normalise(box.text);
  const carriesCounter = /Van\s+\d+\s+reportes\s+de\s+los\s+\d+/.test(text);
  const carriesClaim = /±/.test(text) || /\(n=\d+/.test(text);
  assert.ok(
    carriesClaim && !carriesCounter,
    `the box on ${String(state.route)} does not show exactly the claim state.\n` +
      `  claim present: ${carriesClaim}, counter present: ${carriesCounter}\n  box reads: ${text}\n` +
      'P5: claim_ok true renders the headline IN PLACE of the counter — one state, never both ' +
      '(Definition of Done row 1). The exact sentence is asserted separately against the ' +
      'settled copy.',
  );
});

Then('la afirmación llega compuesta de fábrica y el teléfono no calcula nada', function () {
  assert.fail(
    'completed at DISTILL re-entry: the headline is display-ready, composed producer-side (P5); ' +
      'this step re-runs the served-bytes and no-island oracles slice-01 shipped, on the claim state.',
  );
});

Then('el más-menos impreso es el margen con piso', function () {
  assert.fail(
    'completed at DISTILL re-entry: the printed se is se_gate, never raw se_sample (06 section ' +
      '7 G3, field semantics pinned; Definition of Done row 4).',
  );
});

Then('ninguna superficie puede imprimir una precisión que el ruido físico desmiente', function () {
  assert.fail('completed at DISTILL re-entry, together with the floored-margin compose law above.');
});

Then('la frase es la asentada exacta con sus números en su sitio', function () {
  assert.fail(COPY_BLOCK);
});

Then('no trae raya larga, ni inglés, ni texto técnico, ni marcador de relleno', function () {
  assert.fail(
    'completed at DISTILL re-entry: the copy rules (no em dash, no English, no technical text, ' +
      'no unreplaced placeholder) re-run against the settled claim sentence once it exists.',
  );
});

Then('la elegida es la que manda la regla asentada por el carril del dominio', function () {
  assert.fail('completed at DISTILL re-entry: asserts the Pre-requisite 4b rule once the domain lane pins it.');
});

Then('ninguna prueba inventa esa regla por su cuenta', function () {
  assert.fail(
    'standing refusal, kept executable: until Pre-requisite 4b is pinned, any assertion about ' +
      'which key\'s claim a spot shows would be a test inventing design. This step exists so ' +
      'the refusal is visible in the run, not buried in a document.',
  );
});

Then('la playa debajo de la reja muestra solo su contador honesto', function () {
  assert.fail('completed at DISTILL re-entry: the sub-gate spot keeps the counter state, never claim wording.');
});

Then('cada página muestra exactamente uno de los dos estados, nunca ambos, nunca ninguno', function () {
  assert.fail(
    'completed at DISTILL re-entry: Definition of Done row 1, observed across pages — exactly ' +
      'one of counter or claim on every spot page, never both, never neither.',
  );
});

Then('ninguna página cuya playa siga debajo de la reja insinúa porcentaje, margen ni metros de error', function () {
  assert.fail(
    'completed at DISTILL re-entry: re-runs slice-01\'s no-invented-number oracle across every ' +
      'sub-gate page while gated pages legitimately carry their claim.',
  );
});

Then('la revisión dice cuántas páginas miró, y cero miradas es una falla', function () {
  assert.fail('completed at DISTILL re-entry: the sweep must report its inspected count and fail at zero.');
});

Then('la afirmación cumple sus comprobaciones visuales sobre su propio fondo', function () {
  const box = requiredBox();
  const failures: string[] = [];
  if (box.textCarriers.length === 0) failures.push('U1: no element in the box carries visible text');
  if (box.documentScrollWidth > box.viewportWidth + 1) {
    failures.push(`U2: the document scrolls to ${box.documentScrollWidth}px inside ${box.viewportWidth}px`);
  }
  if (state.movement === 'reducido' && box.animatedDescendants > 0) {
    failures.push(`U4: ${box.animatedDescendants} element(s) still animate under reduced motion`);
  }
  if (box.borderStyle.includes('dashed')) {
    failures.push(
      'U5: the claim state still wears the dashed not-yet treatment; a claim must read as a ' +
        'quiet finished card (.scorecard), visually distinct from the counter state (R35)',
    );
  }
  if (box.dangerColor !== '' && box.color === box.dangerColor) {
    failures.push('U5: the claim text uses the danger colour');
  }
  const flat = box.digitCarriers.filter((c) => !c.fontVariantNumeric.includes('tabular-nums'));
  if (flat.length > 0) failures.push(`U6: ${flat.length} digit carrier(s) without tabular-nums`);
  if (box.clippedDescendants > 0) failures.push(`U6: ${box.clippedDescendants} element(s) truncate at 390 px`);
  assert.deepEqual(failures, [], `the claim box fails its visual checks:\n  - ${failures.join('\n  - ')}`);
});

Then('la afirmación se ve como una nota medida, nunca como un anuncio', function () {
  const box = requiredBox();
  const text = normalise(box.text);
  assert.ok(
    /\(n=\d+.*persona/i.test(text) || /±/.test(text),
    `the claim on ${String(state.route)} states no evidence beside its number.\n  box reads: ${text}\n` +
      'A trustworthy claim states its number quietly and ties it to how many observations and ' +
      'how many people back it; a confident sentence with no evidence is marketing, not measurement.',
  );
});
