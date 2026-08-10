// Slice-03 acceptance steps for f-paste-the-call-into-the-group. The link's
// announcement is read exactly the way WhatsApp's preview crawler reads it:
// off the published page itself, served over HTTP. The Givens and Whens are
// slice-01's steps, reused; only the announcement oracles are new.

import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  requiredExpected,
  requiredHome,
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
} from './support/preview-surface';

const MISSING_ANNOUNCEMENT =
  'la página publicada no anuncia su enlace: la vista previa quedaría como una dirección pelada';

const HOW_ANNOUNCE =
  'anunciar el enlace en la propia página publicada: título con el mejor spot, descripción con su puntaje, dirección absoluta del sitio configurado y es_PA declarado (sección 13).';

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
