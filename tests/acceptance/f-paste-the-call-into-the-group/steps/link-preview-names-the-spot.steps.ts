// Slice-03 acceptance steps for f-paste-the-call-into-the-group. The link's
// announcement is read exactly the way WhatsApp's preview crawler reads it:
// off the published page itself, served over HTTP. The Givens and Whens are
// slice-01's steps, reused; only the announcement oracles are new.

import { Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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
  messagePurityFindings,
  prewrittenMessage,
  whatsappActionsInTopCard,
} from './support/built-share-surface';
import {
  allAnnouncements,
  announcedContent,
  permanentAddress,
  publishSurface,
} from './support/preview-surface';

const MISSING_ANNOUNCEMENT =
  'la página publicada no anuncia su enlace: la vista previa quedaría como una dirección pelada';

const HOW_ANNOUNCE =
  'anunciar el enlace en la propia página publicada: título con el mejor spot, descripción con su puntaje, dirección absoluta del sitio configurado y es_PA declarado (sección 13).';

type PreparedAnnouncement = {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly locale: string;
};

const BASE_PROBE_PATH = 'index.html';

// Slice-03 is authored ahead of its implementation. Loading the owned public
// boundary inside the When keeps the intended RED an assertion failure, not a
// Cucumber collection failure while link-announcement.ts is still absent.
async function composeAnnouncement(input: { readonly spotName: string; readonly score: number; readonly site: string }): Promise<PreparedAnnouncement> {
  let boundary: Record<string, unknown>;
  try {
    boundary = await import(new URL('../../../../src/share/link-announcement.ts', import.meta.url).href) as Record<string, unknown>;
  } catch {
    assert.fail('falta el anuncio escrito del enlace: crear la frontera pública composeLinkAnnouncement en src/share/link-announcement.ts');
  }
  const compose = boundary?.composeLinkAnnouncement;
  assert.equal(
    typeof compose,
    'function',
    'el anuncio escrito debe ofrecer composeLinkAnnouncement para que la página y el mensaje compartan una sola historia',
  );
  const announced = await (compose as (value: typeof input) => PreparedAnnouncement | Promise<PreparedAnnouncement>)(input);
  return announced;
}

function contentOf(html: string, property: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)=(['"])(.*?)\1/i.exec(tag)?.[2];
    if (name !== property) continue;
    return /\bcontent=(['"])(.*?)\1/i.exec(tag)?.[2] ?? null;
  }
  return null;
}

function buildBaseProbe(root: string, announcement: PreparedAnnouncement | undefined): string {
  const prepared = announcement === undefined
    ? "const baseProps = { locale: 'es', title: 'La mañana publicada', currentPath: '/' };"
    : `const baseProps = { locale: 'es', title: 'La mañana publicada', currentPath: '/', announcement: ${JSON.stringify(announcement)} };`;
  writeFileSync(
    join(root, 'src/pages/index.astro'),
    `---\nimport Base from '../layouts/Base.astro';\n${prepared}\n---\n<Base {...(baseProps as any)}><main>La mañana publicada</main></Base>\n`,
  );
  const published = publishSurface(root);
  assert.equal(
    published.status,
    0,
    `la prueba no pudo publicar la página base antes de alcanzar su oráculo:\n${published.output}`,
  );
  return readFileSync(join(root, 'dist', BASE_PROBE_PATH), 'utf8');
}

// DISTILL scenarios stay present but dormant until DELIVER deliberately opens
// one named step. This keeps the normal acceptance command free of future
// REDs while allowing PASTE_JIT=1 plus one @jit-03-NN tag to prove its RED.
Before({ tags: '@jit' }, function () {
  if (process.env.PASTE_JIT === '1') return;
  return 'skipped';
});

// ---------- 03-01: pure link-announcement boundary ----------

Given(
  'un llamado listo para anunciar nombra {string} con {int} puntos',
  function (this: PasteWorld, spotName: string, score: number) {
    stash(this).announcementInput = { spotName, score, site: '' };
  },
);

When('se prepara el anuncio para el sitio {string}', async function (this: PasteWorld, site: string) {
  const state = stash(this);
  const input = state.announcementInput;
  assert.ok(input !== undefined, 'test fixture error: el llamado listo para anunciar es requerido');
  state.announcementInput = { ...input, site };
  state.announcement = await composeAnnouncement(state.announcementInput);
});

Then(
  'el anuncio nombra {string} y sus {int} puntos en el título y la descripción',
  function (this: PasteWorld, spotName: string, score: number) {
    const announced = stash(this).announcement;
    assert.ok(announced !== undefined, 'test fixture error: el anuncio preparado es requerido');
    const findings: string[] = [];
    for (const [place, words] of [['título', announced.title], ['descripción', announced.description]] as const) {
      if (!words.toLocaleLowerCase('es-PA').includes(spotName.toLocaleLowerCase('es-PA'))) {
        findings.push(`el ${place} no nombra ${spotName}: dice "${words}"`);
      }
      if (!new RegExp(`\\b${score}\\b`).test(words)) {
        findings.push(`el ${place} no trae los ${score} puntos: dice "${words}"`);
      }
    }
    assertBehavior(findings, 'componer título y descripción desde el mismo llamado, sin dos historias que puedan divergir.');
  },
);

Then('el anuncio habla en español claro, sin texto técnico', function (this: PasteWorld) {
  const announced = stash(this).announcement;
  assert.ok(announced !== undefined, 'test fixture error: el anuncio preparado es requerido');
  assertBehavior(
    messagePurityFindings(`${announced.title}\n${announced.description}`),
    'usar español de a pie para el título y la descripción, igual que el mensaje que se pega.',
  );
});

Then('la dirección del anuncio usa el sitio {string}', function (this: PasteWorld, site: string) {
  const announced = stash(this).announcement;
  assert.ok(announced !== undefined, 'test fixture error: el anuncio preparado es requerido');
  const findings: string[] = [];
  try {
    if (new URL(announced.url).origin !== new URL(site).origin) {
      findings.push(`la dirección anuncia ${announced.url}, no el sitio configurado ${site}`);
    }
  } catch {
    findings.push(`la dirección del anuncio no es completa: "${announced.url}"`);
  }
  assertBehavior(findings, 'derivar la dirección del anuncio del sitio configurado, nunca de un nombre fijo.');
});

// ---------- 03-02: Base.astro publication boundary ----------

Given(
  'un anuncio listo para publicar sobre {string} con {int} puntos',
  function (this: PasteWorld, spotName: string, score: number) {
    stash(this).announcement = {
      title: `${spotName}: ${score} puntos`,
      description: `${spotName} tiene ${score} puntos para hoy.`,
      url: 'https://olas-registradas.example/',
      locale: 'es_PA',
    };
  },
);

When('la página base publica ese anuncio', function (this: PasteWorld) {
  const state = stash(this);
  const announced = state.announcement;
  assert.ok(announced !== undefined, 'test fixture error: el anuncio listo para publicar es requerido');
  state.announcementProbeHtml = buildBaseProbe(requiredRoot(state), announced);
});

Then('la publicación lleva el título, la descripción, la dirección y el idioma del anuncio', function (this: PasteWorld) {
  const state = stash(this);
  const announced = state.announcement;
  const html = state.announcementProbeHtml;
  assert.ok(announced !== undefined && html !== undefined, 'test fixture error: la publicación del anuncio es requerida');
  const findings: string[] = [];
  for (const [property, expected] of [
    ['og:title', announced.title],
    ['og:description', announced.description],
    ['og:url', announced.url],
    ['og:locale', announced.locale],
  ] as const) {
    if (contentOf(html, property) !== expected) findings.push(`${property} no publica el anuncio preparado`);
  }
  assertBehavior(findings, 'Base.astro publica los cuatro datos del anuncio cuando una página se los entrega.');
});

When('la página base publica una página sin anuncio', function (this: PasteWorld) {
  stash(this).bareProbeHtml = buildBaseProbe(requiredRoot(stash(this)), undefined);
});

Then('la publicación conserva su título y no inventa un anuncio', function (this: PasteWorld) {
  const html = stash(this).bareProbeHtml;
  assert.ok(html !== undefined, 'test fixture error: la publicación sin anuncio es requerida');
  const findings: string[] = [];
  if (!html.includes('<title>La mañana publicada</title>')) findings.push('la página sin anuncio perdió su título existente');
  for (const property of ['og:title', 'og:description', 'og:url', 'og:locale']) {
    if (contentOf(html, property) !== null) findings.push(`la página sin anuncio inventa ${property}`);
  }
  assertBehavior(findings, 'conservar la cabecera existente cuando una página no entrega un anuncio.');
});

async function anchorMessage(state: Stash): Promise<string> {
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  const action = actions[0];
  assert.ok(
    action !== undefined,
    'WHAT: la tarjeta grande perdió su acción de WhatsApp. WHY: el anuncio existe para el enlace que esa acción reparte. HOW: conservar el ancla wa.me/?text= de slice-01.',
  );
  return prewrittenMessage(action);
}

Then(
  'la página publicada anuncia su enlace con el mejor spot del día en el título',
  async function (this: PasteWorld) {
    const state = stash(this);
    const expected = requiredExpected(state);
    const title = await announcedContent(requiredHome(state).page, 'og:title');
    const findings: string[] = [];
    if (title === null || title.trim() === '') {
      findings.push(MISSING_ANNOUNCEMENT);
    } else if (!title.toLocaleLowerCase('es-PA').includes(expected.spotName.toLocaleLowerCase('es-PA'))) {
      findings.push(`el título del anuncio no nombra el mejor spot ${expected.spotName}: dice "${title}"`);
    }
    assertBehavior(findings, HOW_ANNOUNCE);
  },
);

Then('el anuncio trae el puntaje del día en su descripción', async function (this: PasteWorld) {
  const state = stash(this);
  const expected = requiredExpected(state);
  const description = await announcedContent(requiredHome(state).page, 'og:description');
  const findings: string[] = [];
  if (description === null || description.trim() === '') {
    findings.push('el anuncio no trae descripción');
  } else if (!new RegExp(`\\b${expected.score}\\b`).test(description)) {
    findings.push(`la descripción del anuncio no trae el puntaje ${expected.score} tal cual: dice "${description}"`);
  }
  assertBehavior(findings, HOW_ANNOUNCE);
});

Then('el anuncio declara que habla el español de Panamá', async function (this: PasteWorld) {
  const state = stash(this);
  const locale = await announcedContent(requiredHome(state).page, 'og:locale');
  const findings: string[] = [];
  if (locale === null) {
    findings.push('el anuncio no declara idioma');
  } else if (locale !== 'es_PA') {
    findings.push(`el anuncio declara "${locale}" y la página habla es_PA`);
  }
  assertBehavior(findings, HOW_ANNOUNCE);
});

Then(
  'el anuncio nombra el mismo spot y el mismo puntaje que el mensaje de WhatsApp',
  async function (this: PasteWorld) {
    const state = stash(this);
    const expected = requiredExpected(state);
    const page = requiredHome(state).page;
    const message = await anchorMessage(state);
    const title = await announcedContent(page, 'og:title');
    const description = await announcedContent(page, 'og:description');
    const findings: string[] = [];
    if (title === null || description === null) {
      findings.push(MISSING_ANNOUNCEMENT);
    } else {
      const lower = (value: string): string => value.toLocaleLowerCase('es-PA');
      if (!lower(message).includes(lower(expected.spotName)) || !lower(title).includes(lower(expected.spotName))) {
        findings.push(`mensaje y anuncio no cuentan la misma historia: el spot ${expected.spotName} falta en alguno`);
      }
      const scorePattern = new RegExp(`\\b${expected.score}\\b`);
      if (!scorePattern.test(message) || !scorePattern.test(description)) {
        findings.push(`mensaje y anuncio no cuentan la misma historia: el puntaje ${expected.score} falta en alguno`);
      }
    }
    assertBehavior(findings, 'componer mensaje y anuncio desde la misma entrada de datos publicada, nunca desde copias separadas.');
  },
);

Then(
  'ningún anuncio muestra nombres de modelos, campos técnicos, llaves de plantilla ni inglés',
  async function (this: PasteWorld) {
    const state = stash(this);
    const announcements = await allAnnouncements(requiredHome(state).page);
    const findings: string[] = [];
    if (announcements.length === 0) {
      findings.push(MISSING_ANNOUNCEMENT);
    } else {
      const spoken = announcements
        .filter((entry) => entry.property === 'og:title' || entry.property === 'og:description')
        .map((entry) => entry.content)
        .join('\n');
      if (spoken.trim() === '') {
        findings.push('el anuncio no dice nada legible en título ni descripción');
      } else {
        findings.push(...messagePurityFindings(spoken).map((finding) => `el anuncio: ${finding}`));
      }
    }
    assertBehavior(findings, 'mantener el anuncio en español de a pie, igual que el mensaje pegado (R28).');
  },
);

Then(
  'la dirección que el anuncio declara deriva del sitio configurado en esa copia',
  async function (this: PasteWorld) {
    const state = stash(this);
    const expected = requiredExpected(state);
    const declared = await announcedContent(requiredHome(state).page, 'og:url');
    const findings: string[] = [];
    if (declared === null || declared.trim() === '') {
      findings.push('el anuncio no declara ninguna dirección');
    } else {
      const parsed = (() => {
        try {
          return new URL(declared);
        } catch {
          return null;
        }
      })();
      if (parsed === null) {
        findings.push(`la dirección del anuncio no es una dirección completa: "${declared}"`);
      } else if (parsed.origin !== new URL(expected.site).origin) {
        findings.push(`la dirección del anuncio no deriva del sitio configurado: dice ${parsed.origin} y la configuración dice ${new URL(expected.site).origin}`);
      }
    }
    assertBehavior(findings, 'derivar la dirección del anuncio del site configurado en Astro, nunca de un nombre escrito a mano.');
  },
);

Then('el nombre del sitio original no aparece en ningún anuncio de la página', async function (this: PasteWorld) {
  const state = stash(this);
  const host = state.originalSiteHost;
  assert.ok(host !== undefined, 'test fixture error: falta el host original configurado');
  const page = requiredHome(state).page;
  const announcements = await allAnnouncements(page);
  const address = await permanentAddress(page);
  const findings: string[] = [];
  for (const entry of announcements) {
    if (entry.content.includes(host)) {
      findings.push(`${entry.property} sigue nombrando ${host} con el sitio ya reconfigurado`);
    }
  }
  if (address !== null && address.includes(host)) {
    findings.push(`la dirección permanente sigue nombrando ${host} con el sitio ya reconfigurado`);
  }
  assertBehavior(findings, 'ningún componente ni plantilla lleva el hostname escrito a mano; todos leen la configuración.');
});

Then(
  'la página declara su dirección permanente limpia, sin el sello del build',
  async function (this: PasteWorld) {
    const state = stash(this);
    const expected = requiredExpected(state);
    const address = await permanentAddress(requiredHome(state).page);
    const findings: string[] = [];
    if (address === null || address.trim() === '') {
      findings.push('la página no declara su dirección permanente');
    } else {
      const parsed = (() => {
        try {
          return new URL(address);
        } catch {
          return null;
        }
      })();
      if (parsed === null) {
        findings.push(`la dirección permanente no es una dirección completa: "${address}"`);
      } else {
        if (parsed.origin !== new URL(expected.site).origin) {
          findings.push(`la dirección permanente no deriva del sitio configurado: dice ${parsed.origin}`);
        }
        if (parsed.searchParams.has('b')) {
          findings.push('la dirección permanente carga el sello ?b= que pertenece solo al enlace compartido');
        }
      }
    }
    assertBehavior(findings, 'declarar la dirección permanente limpia; el sello ?b= vive únicamente en el enlace que se comparte (sección 13).');
  },
);

Then('el sello del build viaja solamente en el enlace que se comparte', async function (this: PasteWorld) {
  const state = stash(this);
  const message = await anchorMessage(state);
  const lines = message.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const last = lines.at(-1) ?? '';
  const findings: string[] = [];
  const shared = (() => {
    try {
      return new URL(last);
    } catch {
      return null;
    }
  })();
  if (shared === null || !shared.searchParams.has('b')) {
    findings.push('el enlace que se comparte perdió su sello ?b= del build');
  }
  assertBehavior(findings, 'sellar cada enlace compartido con el ?b= de su mañana; así cada pegada es una dirección fresca para la vista previa.');
});
