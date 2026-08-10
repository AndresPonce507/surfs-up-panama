// Slice-04 acceptance steps for f-paste-the-call-into-the-group. The preview
// card is a builder artifact fetched only by WhatsApp's crawler, so the
// oracles read it the way the crawler does: the address the published page
// head declares, fetched over the same preview that serves the publication.
// The per-spot-per-build cadence (Pre-requisite 3, settled 2026-08-10:
// per-spot cards regenerated on EVERY build) is observed as behaviour: a new
// morning changes the card; a spot with missing fields gets the generic face.

import { Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  requiredExpected,
  requiredHome,
  requiredRoot,
  stash,
  type PasteWorld,
  type Stash,
} from './support/share-stash';
import {
  assertBehavior,
  disposeHome,
  expectedShare,
  openBuiltHome,
  prewrittenMessage,
  whatsappActionsInTopCard,
} from './support/built-share-surface';
import {
  arriveNewMorning,
  downloadedImageAddresses,
  fetchOverPreview,
  identicalCardGroups,
  jpegDimensions,
  PREVIEW_CARD,
  previewCardsIn,
  publishSurface,
  stripCallFieldsOfTwoSpots,
} from './support/preview-surface';

const MISSING_CARD_ADDRESS =
  'el anuncio no declara ninguna tarjeta de imagen: la vista previa quedaría sin cara';

type PreviewCardInput = Readonly<{
  spot_id: string;
  spot_name: string;
  score_q: number;
  size_band?: string;
  size_range_m?: readonly [number, number];
  wind_state?: string;
  conf_level?: string;
}>;

type PreviewCardSelection = Readonly<{
  kind: 'spot' | 'generic';
  spot_id?: string;
  missing_fields: readonly string[];
}>;

const previewInputs = new WeakMap<PasteWorld, PreviewCardInput>();
const previewSelections = new WeakMap<PasteWorld, PreviewCardSelection>();

async function selectPreviewCard(input: PreviewCardInput): Promise<PreviewCardSelection> {
  let boundary: Record<string, unknown>;
  try {
    boundary = await import(new URL('../../../../src/share/preview-card.ts', import.meta.url).href) as Record<string, unknown>;
  } catch {
    assert.fail('falta la selección pública selectPreviewCard en src/share/preview-card.ts');
  }
  const select = boundary?.selectPreviewCard;
  assert.equal(
    typeof select,
    'function',
    'la selección de tarjeta debe ofrecer selectPreviewCard para que la publicación use la misma degradación honesta',
  );
  return await (select as (value: PreviewCardInput) => PreviewCardSelection | Promise<PreviewCardSelection>)(input);
}

function completePreviewInput(): PreviewCardInput {
  return {
    spot_id: 'playa-venao',
    spot_name: 'Playa Venao',
    score_q: 76,
    size_band: 'waist_chest',
    size_range_m: [0.7, 1.1],
    wind_state: 'clean',
    conf_level: 'high',
  };
}

// Slice-04 is authored ahead of its implementation. Individual DELIVER steps
// activate only their named scenario set with PASTE_JIT=1, keeping future
// publication REDs out of the normal acceptance run.
Before({ tags: '@jit' }, function () {
  if (process.env.PASTE_JIT === '1') return;
  return 'skipped';
});

// ---------- 04-01: pure preview-card selection boundary ----------

Given(
  'una tarjeta lista para el spot {string} con {int} puntos y todos sus campos',
  function (this: PasteWorld, spotName: string, score: number) {
    previewInputs.set(this, { ...completePreviewInput(), spot_name: spotName, score_q: score });
  },
);

Given(
  'una tarjeta lista para el spot {string} con {int} puntos pero sin {string}',
  function (this: PasteWorld, spotName: string, score: number, missingField: string) {
    const complete = completePreviewInput();
    const input = { ...complete, spot_name: spotName, score_q: score } as Record<string, unknown>;
    delete input[missingField];
    previewInputs.set(this, input as PreviewCardInput);
  },
);

When('se elige la tarjeta de vista previa para ese spot', async function (this: PasteWorld) {
  const input = previewInputs.get(this);
  assert.ok(input !== undefined, 'test fixture error: la tarjeta de vista previa requiere una entrada');
  previewSelections.set(this, await selectPreviewCard(input));
});

Then(
  'la selección conserva la tarjeta propia de {string} y no inventa huecos',
  function (this: PasteWorld, spotName: string) {
    const selection = previewSelections.get(this);
    assert.ok(selection !== undefined, 'test fixture error: la selección de tarjeta es requerida');
    const findings: string[] = [];
    if (selection.kind !== 'spot') findings.push(`la selección eligió ${selection.kind}, no la tarjeta propia`);
    if (selection.spot_id !== 'playa-venao') findings.push(`la selección perdió el spot de ${spotName}`);
    if (selection.missing_fields.length !== 0) findings.push(`la selección inventó huecos: ${selection.missing_fields.join(', ')}`);
    assertBehavior(findings, 'conservar la tarjeta propia cuando los cinco campos P7 están completos.');
  },
);

Then(
  'la selección usa la tarjeta genérica y anota que falta {string}',
  function (this: PasteWorld, missingField: string) {
    const selection = previewSelections.get(this);
    assert.ok(selection !== undefined, 'test fixture error: la selección de tarjeta es requerida');
    const findings: string[] = [];
    if (selection.kind !== 'generic') findings.push(`la selección eligió ${selection.kind}, no la tarjeta genérica`);
    if (!selection.missing_fields.includes(missingField)) {
      findings.push(`la selección no anotó el campo faltante ${missingField}`);
    }
    assertBehavior(findings, 'degradar a la tarjeta genérica y exponer el hueco para que la publicación lo anote, nunca inventar datos.');
  },
);

async function announcedCardAddress(state: Stash): Promise<string | null> {
  return requiredHome(state).page.evaluate(`(() => {
    const meta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    return meta === null ? null : meta.getAttribute('content');
  })()`) as Promise<string | null>;
}

async function sharedLinkStamp(state: Stash): Promise<string | null> {
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  const action = actions[0];
  assert.ok(
    action !== undefined,
    'WHAT: la tarjeta grande perdió su acción de WhatsApp. WHY: la frescura se observa en el enlace que esa acción reparte. HOW: conservar el ancla wa.me/?text= de slice-01.',
  );
  const message = prewrittenMessage(action);
  const last = message.split('\n').map((line) => line.trim()).filter((line) => line !== '').at(-1) ?? '';
  try {
    return new URL(last).searchParams.get('b');
  } catch {
    return null;
  }
}

// ---------- Whens ----------

When('se publica la mañana completa', { timeout: 180_000 }, function (this: PasteWorld) {
  const state = stash(this);
  const root = requiredRoot(state);
  const run = publishSurface(root);
  assert.equal(
    run.status,
    0,
    `test fixture error: la mañana intacta no se pudo publicar; esto es un problema de build, no un RED de comportamiento:\n${run.output.slice(-2000)}`,
  );
  state.intactPublish = run;
  state.intactCards = previewCardsIn(root);
});

When(
  'dos spots pierden sus campos del llamado y se vuelve a publicar',
  { timeout: 180_000 },
  function (this: PasteWorld) {
    const state = stash(this);
    const root = requiredRoot(state);
    state.strippedSpotIds = stripCallFieldsOfTwoSpots(root);
    const run = publishSurface(root);
    state.degradedPublish = run;
    state.degradedCards = run.status === 0 ? previewCardsIn(root) : [];
  },
);

When(
  'llega una mañana nueva con otro puntaje y se vuelve a publicar',
  { timeout: 240_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const root = requiredRoot(state);
    // Remember what the previous morning's preview looked like before it is
    // replaced: the shared stamp always, the card when one was announced.
    state.previousStamp = requiredExpected(state).buildStamp;
    const previousAddress = await announcedCardAddress(state);
    if (previousAddress !== null && previousAddress.trim() !== '') {
      const fetched = await fetchOverPreview(requiredHome(state), previousAddress);
      if (fetched.status === 200) {
        state.previousCard = { address: previousAddress, bytes: fetched.bytes };
      }
    }
    await disposeHome(state.home);
    arriveNewMorning(root);
    state.home = await openBuiltHome(root, {
      width: 390,
      theme: 'claro',
      motion: 'normal',
      javaScript: true,
      clipboard: 'granted',
    });
    state.expected = expectedShare(root);
  },
);

// ---------- Thens ----------

Then(
  'el anuncio declara una tarjeta de imagen con dirección absoluta del sitio configurado',
  async function (this: PasteWorld) {
    const state = stash(this);
    const expected = requiredExpected(state);
    const address = await announcedCardAddress(state);
    const findings: string[] = [];
    if (address === null || address.trim() === '') {
      findings.push(MISSING_CARD_ADDRESS);
    } else {
      const parsed = (() => {
        try {
          return new URL(address);
        } catch {
          return null;
        }
      })();
      if (parsed === null) {
        findings.push(`la dirección de la tarjeta no es una dirección completa: "${address}"`);
      } else if (parsed.origin !== new URL(expected.site).origin) {
        findings.push(`la tarjeta no deriva del sitio configurado: dice ${parsed.origin} y la configuración dice ${new URL(expected.site).origin}`);
      }
    }
    assertBehavior(findings, 'declarar en el anuncio la tarjeta 1200x630 del mejor spot, con dirección absoluta derivada del site configurado (sección 13).');
  },
);

Then(
  'esa tarjeta existe en lo publicado, con las medidas de vista previa y dentro de su techo de peso',
  { timeout: 30_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const address = await announcedCardAddress(state);
    const findings: string[] = [];
    if (address === null || address.trim() === '') {
      findings.push(MISSING_CARD_ADDRESS);
    } else {
      const fetched = await fetchOverPreview(requiredHome(state), address);
      if (fetched.status !== 200) {
        findings.push(`la tarjeta anunciada no existe en lo publicado: pedirla responde ${fetched.status}`);
      } else {
        const dims = jpegDimensions(fetched.bytes);
        if (dims === null) {
          findings.push('la tarjeta anunciada no es la imagen JPEG que la vista previa entiende');
        } else if (dims.width !== PREVIEW_CARD.width || dims.height !== PREVIEW_CARD.height) {
          findings.push(`la tarjeta mide ${dims.width}x${dims.height} y la medida de vista previa es ${PREVIEW_CARD.width}x${PREVIEW_CARD.height}`);
        }
        if (fetched.bytes.length > PREVIEW_CARD.maxBytes) {
          findings.push(`la tarjeta pesa ${fetched.bytes.length} B y su techo es ${PREVIEW_CARD.maxBytes} B`);
        }
      }
    }
    assertBehavior(findings, 'emitir la tarjeta JPEG 1200x630 de a lo sumo 60 KB en cada publicación (sección 13).');
  },
);

Then('lo publicado trae una tarjeta de vista previa por cada spot del día', function (this: PasteWorld) {
  const state = stash(this);
  const spotCount = (() => {
    const root = requiredRoot(state);
    return expectedSpotCount(root);
  })();
  const cards = state.intactCards ?? [];
  assertBehavior(
    cards.length >= spotCount
      ? []
      : [`hoy hay ${spotCount} spots publicados y lo publicado trae ${cards.length} tarjetas de vista previa`],
    'generar la tarjeta de cada spot en cada publicación (cadencia por spot por build, Pre-requisito 3 resuelto).',
  );
});

Then('cada tarjeta cuenta la historia de su propio spot, ninguna cara repetida', function (this: PasteWorld) {
  const state = stash(this);
  const cards = state.intactCards ?? [];
  const findings: string[] = [];
  if (cards.length === 0) {
    findings.push('lo publicado no trae ninguna tarjeta de vista previa');
  } else {
    const repeated = identicalCardGroups(cards).filter((group) => group.length > 1);
    for (const group of repeated) {
      findings.push(`estas tarjetas comparten exactamente la misma cara: ${group.map((card) => card.path).join(', ')}`);
    }
  }
  assertBehavior(findings, 'con la mañana completa, cada spot recibe una tarjeta con sus propios números; ninguna cara repetida.');
});

Then(
  'el enlace que se comparte lleva el sello de la mañana nueva, nunca el anterior',
  async function (this: PasteWorld) {
    const state = stash(this);
    const stamp = await sharedLinkStamp(state);
    const fresh = requiredExpected(state).buildStamp;
    const previous = state.previousStamp;
    assert.ok(previous !== undefined, 'test fixture error: falta el sello de la mañana anterior');
    const findings: string[] = [];
    if (stamp === null) {
      findings.push('el enlace que se comparte perdió su sello ?b=');
    } else {
      if (stamp !== fresh) findings.push(`el enlace lleva el sello "${stamp}" y la mañana nueva es "${fresh}"`);
      if (stamp === previous) findings.push('el enlace sigue sellado con la mañana anterior');
    }
    assertBehavior(findings, 'sellar el enlace con la mañana publicada vigente; cada pegada es una dirección fresca para la vista previa.');
  },
);

Then(
  'la tarjeta del anuncio trae los números nuevos, no los de la mañana anterior',
  { timeout: 30_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const address = await announcedCardAddress(state);
    const findings: string[] = [];
    if (address === null || address.trim() === '') {
      findings.push(MISSING_CARD_ADDRESS);
    } else {
      const fetched = await fetchOverPreview(requiredHome(state), address);
      if (fetched.status !== 200) {
        findings.push(`la tarjeta anunciada no existe en lo publicado: pedirla responde ${fetched.status}`);
      } else if (state.previousCard !== undefined && fetched.bytes.equals(state.previousCard.bytes)) {
        findings.push('la mañana nueva cambió el puntaje y la tarjeta sigue mostrando la cara anterior');
      }
    }
    assertBehavior(findings, 'rehacer la tarjeta del mejor spot en cada publicación, para que un enlace pegado por la tarde nunca presuma los números del alba.');
  },
);

Then('la mañana con huecos se publica igual, sin caerse', function (this: PasteWorld) {
  const state = stash(this);
  const run = state.degradedPublish;
  assert.ok(run !== undefined, 'test fixture error: falta la publicación con huecos');
  assertBehavior(
    run.status === 0 ? [] : [`la publicación se cayó con campos faltantes en vez de degradar con honestidad:\n${run.output.slice(-800)}`],
    'los campos P7 faltantes degradan a la tarjeta genérica y anotan el hueco; nunca tumban la publicación (sección 7).',
  );
});

Then(
  'los spots sin campos comparten la misma cara genérica, cosa que la mañana completa nunca hace',
  function (this: PasteWorld) {
    const state = stash(this);
    const intact = state.intactCards ?? [];
    const degraded = state.degradedCards ?? [];
    const findings: string[] = [];
    if (degraded.length === 0) {
      findings.push('la publicación con huecos no trae ninguna tarjeta de vista previa');
    } else {
      const intactRepeats = identicalCardGroups(intact).filter((group) => group.length > 1);
      if (intactRepeats.length > 0) {
        findings.push('la mañana completa ya traía caras repetidas, así que la cara genérica no se puede distinguir');
      }
      const degradedRepeats = identicalCardGroups(degraded).filter((group) => group.length > 1);
      if (degradedRepeats.length === 0) {
        findings.push('ningún par de tarjetas comparte la cara genérica con dos spots sin campos');
      }
    }
    assertBehavior(findings, 'darle a cada spot sin campos la misma tarjeta genérica declarada, nunca una cara con números inventados.');
  },
);

Then('la publicación deja anotado qué spot llegó sin sus campos', function (this: PasteWorld) {
  const state = stash(this);
  const run = state.degradedPublish;
  const stripped = state.strippedSpotIds ?? [];
  assert.ok(run !== undefined && stripped.length > 0, 'test fixture error: falta la publicación con huecos o los spots sin campos');
  const missing = stripped.filter((spotId) => !run.output.includes(spotId));
  assertBehavior(
    missing.length === 0 ? [] : [`la publicación no anota el hueco de: ${missing.join(', ')}`],
    'anotar en la salida de la publicación cada spot que llegó sin sus campos (la conducta declarada de P7: degradar Y anotar).',
  );
});

Then(
  'abrir la home no descarga ninguna tarjeta de vista previa',
  async function (this: PasteWorld) {
    const state = stash(this);
    const address = await announcedCardAddress(state);
    const findings: string[] = [];
    if (address === null || address.trim() === '') {
      findings.push(MISSING_CARD_ADDRESS);
    } else {
      const cardPath = (() => {
        try {
          return new URL(address).pathname;
        } catch {
          return address;
        }
      })();
      const downloaded = await downloadedImageAddresses(requiredHome(state).page);
      const offending = downloaded.filter((entry) => entry.includes(cardPath));
      if (offending.length > 0) {
        findings.push(`la home descarga la tarjeta que es solo para la vista previa: ${offending.join(', ')}`);
      }
    }
    assertBehavior(findings, 'la tarjeta la pide solamente el rastreador de la vista previa; el primer vuelo del surfista no la carga jamás (sección 5).');
  },
);

function expectedSpotCount(root: string): number {
  const surface = JSON.parse(readFileSync(join(root, 'data/published-surface.json'), 'utf8')) as {
    current: { days: { spots: unknown[] }[] };
  };
  return surface.current.days[0]?.spots.length ?? 0;
}
