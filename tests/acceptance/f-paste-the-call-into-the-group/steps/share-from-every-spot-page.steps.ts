// Slice-05 acceptance steps for f-paste-the-call-into-the-group. The surfer
// stands on a spot page — reached the way a surfer reaches it, tapping that
// spot's row on the built home — and shares that spot's own call. The second
// ranked spot is the fixture on purpose: any leak of the home card's values
// into the message or the announcement turns these oracles red.

import { After, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  peekStash,
  requiredExpected,
  requiredHome,
  requiredRoot,
  stash,
  type PasteWorld,
  type Stash,
} from './support/share-stash';
import {
  assertBehavior,
  expectedShare,
  messageContentFindings,
  prewrittenMessage,
  type ExpectedShare,
} from './support/built-share-surface';
import {
  announcedContent,
  clipboardText,
  expectedShareForRank,
  firstFlightGzBytes,
  openBuiltSpotSurface,
  sevenPointAuditIn,
  sevenPointFindings,
  stopPreviewDaemon,
  whatsappActionsIn,
} from './support/preview-surface';

const MISSING_SPOT_ACTION =
  'la página del spot no ofrece ninguna acción de WhatsApp con su llamado';

const HOW_SPOT_SHARE =
  'poner en cada página de spot la misma acción de compartir de la home, con el llamado de ese spot y el enlace a su propia página (decisión 30).';

function requiredSpotExpected(state: Stash): ExpectedShare {
  assert.ok(state.spotExpected !== undefined, 'test fixture error: falta la expectativa del spot visitado');
  return state.spotExpected;
}

async function openSecondSpotPage(world: PasteWorld, theme: string, motion: string, javaScript: boolean): Promise<void> {
  const state = stash(world);
  const root = requiredRoot(state);
  // astro preview, not vite preview: spot routes use directory-style hrefs
  // that vite's SPA fallback silently redirects to the home (keystone
  // slice-06 precedent, verified empirically there).
  const surface = await openBuiltSpotSurface(root, {
    width: 390,
    theme,
    motion,
    javaScript,
    clipboard: 'granted',
  });
  state.home = surface.home;
  state.previewDaemonPid = surface.daemonPid;
  state.expected = expectedShare(root);
  state.spotExpected = expectedShareForRank(root, 1);
  assert.notEqual(
    state.spotExpected.spotId,
    state.expected.spotId,
    'test fixture error: el segundo spot del día es el mismo que el primero',
  );
  const page = state.home.page;
  const row = page.locator(`ol.ranked > li a[href="/spots/${state.spotExpected.spotId}/"]`);
  const count = await row.count();
  assert.equal(
    count,
    1,
    `superficie no alcanzada: la home construida no ofrece la fila de /spots/${state.spotExpected.spotId}/; esto es un problema de test o de build, no un RED de comportamiento`,
  );
  await row.click();
  await page.waitForLoadState('domcontentloaded');
  const heading = (await page.locator('h1').first().textContent({ timeout: 10_000 }))?.trim() ?? '';
  assert.ok(
    heading.toLocaleLowerCase('es-PA').includes(state.spotExpected.spotName.toLocaleLowerCase('es-PA')),
    `superficie no alcanzada: la página abierta se titula "${heading}" y el spot visitado es ${state.spotExpected.spotName}; esto es un problema de test o de build, no un RED de comportamiento`,
  );
  state.spotPagePath = new URL(page.url()).pathname;
}

// The daemonised astro preview outlives its spawned child; the shared After
// in whatsapp-call-from-home.steps.ts disposes browser and root, this one
// kills the daemon pid. Both run for every scenario; each is a no-op when
// its half is absent.
After({ timeout: 10_000 }, function (this: PasteWorld) {
  stopPreviewDaemon(peekStash(this)?.previewDaemonPid);
});

// ---------- Whens ----------

When(
  'el surfista abre la página del segundo spot del día a {int} px, con tema {string} y movimiento {string}',
  { timeout: 120_000 },
  async function (this: PasteWorld, _width: number, theme: string, motion: string) {
    await openSecondSpotPage(this, theme, motion, true);
  },
);

When(
  'el surfista abre la página del segundo spot del día sin JavaScript a {int} px',
  { timeout: 120_000 },
  async function (this: PasteWorld, _width: number) {
    await openSecondSpotPage(this, 'claro', 'normal', false);
  },
);

// ---------- Thens ----------

Then(
  'esa página ofrece una sola acción de WhatsApp con el llamado de ese spot ya escrito',
  async function (this: PasteWorld) {
    const state = stash(this);
    const actions = await whatsappActionsIn(requiredHome(state).page, 'body');
    const findings: string[] = [];
    if (actions.length === 0) findings.push(MISSING_SPOT_ACTION);
    if (actions.length > 1) findings.push(`hay ${actions.length} acciones de WhatsApp en la página del spot y debe haber una sola`);
    const action = actions[0];
    if (action !== undefined && (action.width < 44 || action.height < 44)) {
      findings.push(`la acción mide ${Math.round(action.width)}x${Math.round(action.height)} px y el mínimo del pulgar es 44x44`);
    }
    assertBehavior(findings, HOW_SPOT_SHARE);
  },
);

Then(
  'ese mensaje trae el nombre, el puntaje y las condiciones de ese spot',
  async function (this: PasteWorld) {
    const state = stash(this);
    const actions = await whatsappActionsIn(requiredHome(state).page, 'body');
    const action = actions[0];
    const findings: string[] = [];
    if (action === undefined) {
      findings.push(MISSING_SPOT_ACTION);
    } else {
      findings.push(...messageContentFindings(prewrittenMessage(action), requiredSpotExpected(state)));
    }
    assertBehavior(findings, 'llenar la plantilla de la sección 10 con los campos de days[0] de ese spot, nunca con los del mejor del día.');
  },
);

Then(
  'el mensaje termina con la dirección de la página de ese spot sellada con el build',
  async function (this: PasteWorld) {
    const state = stash(this);
    const spotExpected = requiredSpotExpected(state);
    const actions = await whatsappActionsIn(requiredHome(state).page, 'body');
    const action = actions[0];
    const findings: string[] = [];
    if (action === undefined) {
      findings.push(MISSING_SPOT_ACTION);
    } else {
      const message = prewrittenMessage(action);
      const last = message.split('\n').map((line) => line.trim()).filter((line) => line !== '').at(-1) ?? '';
      const shared = (() => {
        try {
          return new URL(last);
        } catch {
          return null;
        }
      })();
      if (shared === null) {
        findings.push(`el mensaje no termina con una dirección completa: "${last}"`);
      } else {
        if (shared.origin !== new URL(spotExpected.site).origin) {
          findings.push(`la dirección no deriva del sitio configurado: dice ${shared.origin}`);
        }
        if (!shared.pathname.includes(`/spots/${spotExpected.spotId}`)) {
          findings.push(`la dirección lleva a "${shared.pathname}" y no a la página de ${spotExpected.spotName}`);
        }
        const stamp = shared.searchParams.get('b');
        if (stamp === null || stamp === '') {
          findings.push('la dirección no lleva el sello ?b= del build');
        } else if (stamp !== spotExpected.buildStamp) {
          findings.push(`el sello "${stamp}" no es el de la mañana publicada (${spotExpected.buildStamp})`);
        }
      }
    }
    assertBehavior(findings, 'enlazar la propia página del spot, derivada del site configurado y sellada con la mañana publicada.');
  },
);

Then(
  'el portapapeles guarda exactamente el llamado de ese spot que lleva su acción de WhatsApp',
  { timeout: 15_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const findings: string[] = [];
    if (state.copyTap === undefined || !state.copyTap.tapped) {
      findings.push('la página del spot no ofrece la acción de copiar el llamado');
    } else {
      const actions = await whatsappActionsIn(requiredHome(state).page, 'body');
      const action = actions[0];
      if (action === undefined) {
        findings.push(MISSING_SPOT_ACTION);
      } else {
        const message = prewrittenMessage(action);
        const copied = await clipboardText(requiredHome(state).page);
        if (copied.trim() === '') {
          findings.push('después del toque el portapapeles quedó vacío');
        } else if (copied.trim() !== message) {
          findings.push('lo copiado no es el llamado de ese spot que lleva su acción de WhatsApp');
        }
      }
    }
    assertBehavior(findings, 'la misma acción de copiar de la home, a escala del spot: un toque y su llamado queda en el portapapeles.');
  },
);

Then(
  'el mensaje de esa página nombra a ese spot y nunca al mejor del día',
  async function (this: PasteWorld) {
    const state = stash(this);
    const spotExpected = requiredSpotExpected(state);
    const homeExpected = requiredExpected(state);
    const actions = await whatsappActionsIn(requiredHome(state).page, 'body');
    const action = actions[0];
    const findings: string[] = [];
    if (action === undefined) {
      findings.push(MISSING_SPOT_ACTION);
    } else {
      const message = prewrittenMessage(action);
      const lower = (value: string): string => value.toLocaleLowerCase('es-PA');
      if (!lower(message).includes(lower(spotExpected.spotName))) {
        findings.push(`el mensaje no nombra a ${spotExpected.spotName}`);
      }
      if (lower(message).includes(lower(homeExpected.spotName))) {
        findings.push(`el mensaje de ${spotExpected.spotName} cuenta la historia de la portada: nombra a ${homeExpected.spotName}`);
      }
    }
    assertBehavior(findings, 'componer el mensaje desde los datos de ese spot; los valores de la portada no se cuelan jamás.');
  },
);

Then(
  'el anuncio de esa página declara ese spot con su puntaje, nunca los de la portada',
  async function (this: PasteWorld) {
    const state = stash(this);
    const spotExpected = requiredSpotExpected(state);
    const homeExpected = requiredExpected(state);
    const page = requiredHome(state).page;
    const title = await announcedContent(page, 'og:title');
    const description = await announcedContent(page, 'og:description');
    const findings: string[] = [];
    if (title === null || description === null) {
      findings.push('la página del spot no anuncia su enlace: la vista previa quedaría como una dirección pelada');
    } else {
      const lower = (value: string): string => value.toLocaleLowerCase('es-PA');
      if (!lower(title).includes(lower(spotExpected.spotName))) {
        findings.push(`el título del anuncio no nombra a ${spotExpected.spotName}: dice "${title}"`);
      }
      if (lower(title).includes(lower(homeExpected.spotName))) {
        findings.push(`el anuncio de ${spotExpected.spotName} nombra al de la portada: ${homeExpected.spotName}`);
      }
      if (!new RegExp(`\\b${spotExpected.score}\\b`).test(description)) {
        findings.push(`la descripción no trae el puntaje ${spotExpected.score} de ese spot: dice "${description}"`);
      }
      if (homeExpected.score !== spotExpected.score && new RegExp(`\\b${homeExpected.score}\\b`).test(description)) {
        findings.push(`la descripción trae el puntaje ${homeExpected.score} de la portada`);
      }
    }
    assertBehavior(findings, 'el mismo anuncio de la home, a escala del spot: su nombre y su puntaje, jamás los del mejor del día.');
  },
);

Then(
  'la acción de WhatsApp de esa página sigue presente como un enlace normal con el llamado de ese spot',
  async function (this: PasteWorld) {
    const state = stash(this);
    const spotExpected = requiredSpotExpected(state);
    const actions = await whatsappActionsIn(requiredHome(state).page, 'body');
    const findings: string[] = [];
    if (actions.length !== 1) {
      findings.push(`sin JavaScript hay ${actions.length} acciones de WhatsApp en la página del spot y debe haber exactamente una`);
    }
    const action = actions[0];
    if (action !== undefined) {
      if (!action.href.startsWith('https://wa.me/')) {
        findings.push('la acción no es un ancla normal hacia wa.me con el texto ya escrito');
      } else {
        const message = prewrittenMessage(action);
        const lower = (value: string): string => value.toLocaleLowerCase('es-PA');
        if (!lower(message).includes(lower(spotExpected.spotName))) {
          findings.push(`el mensaje sin JavaScript no nombra a ${spotExpected.spotName}`);
        }
      }
    }
    assertBehavior(findings, 'servir la acción como un ancla del HTML publicado del spot, sin depender de ningún script.');
  },
);

Then('la página del spot queda dentro de su techo del primer vuelo', { timeout: 60_000 }, async function (this: PasteWorld) {
  const state = stash(this);
  const home = requiredHome(state);
  const pagePath = state.spotPagePath;
  assert.ok(pagePath !== undefined, 'test fixture error: falta la ruta de la página del spot');
  const measured = await firstFlightGzBytes(home, pagePath);
  const ceiling = 100 * 1024;
  assertBehavior(
    measured <= ceiling ? [] : [`el primer vuelo de la página del spot pesa ${measured} B gz y su techo es ${ceiling} B`],
    'mantener la página del spot con su acción de compartir dentro del techo de 100 KB del primer vuelo (sección 5).',
  );
});

Then(
  'las dos acciones de compartir del spot cumplen las siete comprobaciones visuales de la superficie publicada',
  { timeout: 60_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const home = requiredHome(state);
    const findings: string[] = [];
    const whatsappAudit = await sevenPointAuditIn(home.page, 'body', 'whatsapp');
    findings.push(...sevenPointFindings(whatsappAudit, 'la acción de WhatsApp', home.uiGate).map((finding) => `WhatsApp: ${finding}`));
    const copyAudit = await sevenPointAuditIn(home.page, 'body', 'copy');
    findings.push(...sevenPointFindings(copyAudit, 'la acción de copiar', { status: 0, output: '' }).map((finding) => `Copiar: ${finding}`));
    assertBehavior(
      findings,
      'renderizar las dos acciones del spot con los tokens existentes, geometría de pulgar, estados honestos y las preferencias del sistema.',
    );
  },
);
