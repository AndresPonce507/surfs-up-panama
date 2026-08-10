// Slice-02 acceptance steps for f-paste-the-call-into-the-group. The copy
// action is observed the way the surfer uses it: the real built home over
// HTTP, Chromium at phone width, one tap, and then what the phone's
// clipboard actually holds. The Givens and the themed When are slice-01's
// own steps, reused, never re-declared (the chained-narrative rule).

import { Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

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
  expectedShare,
  messagePurityFindings,
  newHomePage,
  openBuiltHome,
  prewrittenMessage,
  whatsappActionsInTopCard,
} from './support/built-share-surface';
import {
  appearedLines,
  clipboardText,
  copyControlsIn,
  externalScriptsOf,
  fetchOverPreview,
  sevenPointAuditIn,
  sevenPointFindings,
  shareAreaText,
} from './support/preview-surface';

const TOP_CARD = 'ol.ranked > li:first-child';

const MISSING_COPY =
  'la tarjeta grande no ofrece la acción de copiar el llamado';

const HOW_COPY =
  'poner junto al ancla de WhatsApp un botón de copiar que deja el llamado completo en el portapapeles con un solo toque.';

async function anchorMessage(state: Stash): Promise<string> {
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  const action = actions[0];
  assert.ok(
    action !== undefined,
    'WHAT: la tarjeta grande perdió su acción de WhatsApp. WHY: el piso de slice-01 nunca puede desaparecer bajo la mejora. HOW: conservar el ancla wa.me/?text= junto al botón de copiar.',
  );
  return prewrittenMessage(action);
}

// ---------- Whens ----------

When(
  'el surfista abre la home para compartir a {int} px con el portapapeles negado',
  { timeout: 120_000 },
  async function (this: PasteWorld, width: number) {
    const state = stash(this);
    state.home = await openBuiltHome(requiredRoot(state), {
      width,
      theme: 'claro',
      motion: 'normal',
      javaScript: true,
      clipboard: 'denied',
    });
    state.expected = expectedShare(requiredRoot(state));
  },
);

When('se queda sin señal', async function (this: PasteWorld) {
  const state = stash(this);
  const home = requiredHome(state);
  await home.page.context().setOffline(true);
  const requests: string[] = [];
  home.page.on('request', (request) => {
    requests.push(request.url());
  });
  state.requestsAfterTap = requests;
});

When('toca la acción de copiar el llamado', { timeout: 20_000 }, async function (this: PasteWorld) {
  const state = stash(this);
  const page = requiredHome(state).page;
  const textBefore = await shareAreaText(page, 'body');
  const controls = await copyControlsIn(page, 'body');
  if (controls.length === 0) {
    state.copyTap = { controlCount: 0, tapped: false, textBefore };
    return;
  }
  await page.getByRole('button', { name: /copiar/i }).first().click({ timeout: 10_000 });
  // Give the confirmation state a moment: poll until the visible text moves
  // or the budgeted wait runs out. The oracle itself lives in the Thens.
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await shareAreaText(page, 'body')) !== textBefore) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  state.copyTap = { controlCount: controls.length, tapped: true, textBefore };
});

// ---------- Thens ----------

Then(
  'el portapapeles guarda exactamente el mismo llamado completo que lleva la acción de WhatsApp',
  { timeout: 15_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const findings: string[] = [];
    if (state.copyTap === undefined || !state.copyTap.tapped) {
      findings.push(MISSING_COPY);
    } else {
      const message = await anchorMessage(state);
      const copied = await clipboardText(requiredHome(state).page);
      if (copied.trim() === '') {
        findings.push('después del toque el portapapeles quedó vacío');
      } else if (copied.trim() !== message) {
        findings.push('lo copiado no es el mismo llamado que lleva la acción de WhatsApp');
      }
    }
    assertBehavior(findings, HOW_COPY);
  },
);

Then(
  'la página confirma a la vista, en español sencillo, que el llamado ya está copiado',
  async function (this: PasteWorld) {
    const state = stash(this);
    const findings: string[] = [];
    if (state.copyTap === undefined || !state.copyTap.tapped) {
      findings.push(MISSING_COPY);
    } else {
      const appeared = appearedLines(state.copyTap.textBefore, await shareAreaText(requiredHome(state).page, 'body'));
      if (appeared.length === 0) {
        findings.push('después del toque la página no muestra ninguna confirmación visible');
      } else {
        findings.push(...messagePurityFindings(appeared.join('\n')).map((finding) => `la confirmación no habla claro: ${finding}`));
      }
    }
    assertBehavior(findings, 'mostrar tras el toque una confirmación visible en español de a pie, solo cuando el texto ya está en el portapapeles.');
  },
);

Then(
  'la página avisa a la vista, en español sencillo, que copiar no salió',
  async function (this: PasteWorld) {
    const state = stash(this);
    const findings: string[] = [];
    if (state.copyTap === undefined || !state.copyTap.tapped) {
      findings.push(MISSING_COPY);
    } else {
      const appeared = appearedLines(state.copyTap.textBefore, await shareAreaText(requiredHome(state).page, 'body'));
      if (appeared.length === 0) {
        findings.push('el copiado negado no dejó ningún aviso visible: un fallo silencioso');
      } else {
        findings.push(...messagePurityFindings(appeared.join('\n')).map((finding) => `el aviso no habla claro: ${finding}`));
      }
    }
    assertBehavior(findings, 'cuando el teléfono niega el portapapeles, decir a la vista y en español qué pasó, nunca callar.');
  },
);

Then('el portapapeles queda sin el llamado', { timeout: 15_000 }, async function (this: PasteWorld) {
  const state = stash(this);
  const findings: string[] = [];
  if (state.copyTap === undefined || !state.copyTap.tapped) {
    findings.push(MISSING_COPY);
  } else {
    const copied = await clipboardText(requiredHome(state).page);
    const expected = requiredExpected(state);
    if (copied.includes(expected.spotName) && copied.includes('SURF')) {
      findings.push('la página celebró un copiado que el teléfono había negado');
    }
  }
  assertBehavior(findings, 'con el permiso negado no hay copia: el aviso lo dice y nada finge que sí.');
});

Then('la acción de WhatsApp sigue ofrecida como salida', async function (this: PasteWorld) {
  const state = stash(this);
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  assertBehavior(
    actions.length === 1 ? [] : [`la tarjeta ofrece ${actions.length} acciones de WhatsApp y debe seguir ofreciendo exactamente una`],
    'dejar siempre el ancla de WhatsApp como salida cuando el portapapeles no se puede usar.',
  );
});

Then('copiar no pidió nada por la red', function (this: PasteWorld) {
  const state = stash(this);
  const findings: string[] = [];
  if (state.copyTap === undefined || !state.copyTap.tapped) {
    findings.push(MISSING_COPY);
  } else {
    const requests = state.requestsAfterTap ?? [];
    if (requests.length > 0) {
      findings.push(`al copiar la página pidió por la red: ${requests.slice(0, 3).join(', ')}`);
    }
  }
  assertBehavior(findings, 'componer y copiar todo en la propia página publicada; compartir no habla con ningún servidor (07-write-path línea 90).');
});

Then('la tarjeta grande ofrece la acción de copiar el llamado', async function (this: PasteWorld) {
  const state = stash(this);
  const controls = await copyControlsIn(requiredHome(state).page, TOP_CARD);
  const findings: string[] = [];
  if (controls.length === 0) findings.push(MISSING_COPY);
  if (controls.length > 1) findings.push(`hay ${controls.length} acciones de copiar en la tarjeta y debe haber una sola`);
  assertBehavior(findings, HOW_COPY);
});

Then(
  'la mejora de copiar pesa a lo sumo lo acordado y nunca frena el primer pintado',
  { timeout: 30_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const home = requiredHome(state);
    const findings: string[] = [];
    const controls = await copyControlsIn(home.page, TOP_CARD);
    if (controls.length === 0) {
      findings.push(MISSING_COPY);
    } else {
      const scripts = await externalScriptsOf(home.page);
      let totalGz = 0;
      for (const script of scripts) {
        const fetched = await fetchOverPreview(home, new URL(script.src, `${home.url}/`).toString());
        if (fetched.status !== 200) {
          findings.push(`la página pide un guion que lo publicado no trae: ${script.src}`);
          continue;
        }
        totalGz += gzipSync(fetched.bytes).length;
        const nonBlocking = script.type === 'module' || script.defer || script.async;
        if (!nonBlocking) {
          findings.push(`el guion ${script.src} frena el primer pintado en vez de llegar después`);
        }
      }
      const ceiling = 1024;
      if (totalGz > ceiling) {
        findings.push(`los guiones que la home descarga pesan ${totalGz} B y la línea del presupuesto es ${ceiling} B (partida 3, sección 5)`);
      }
    }
    assertBehavior(findings, 'servir la mejora como carga diferida de a lo sumo 1.0 KB, sin tocar el primer render (sección 5, partida 3).');
  },
);

Then(
  'sin JavaScript el ancla de WhatsApp sigue y ningún botón muerto se ofrece',
  { timeout: 30_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const home = requiredHome(state);
    const offPage = await newHomePage(home.browser, home.url, {
      width: 390,
      theme: 'claro',
      motion: 'normal',
      javaScript: false,
    });
    const findings: string[] = [];
    const anchors = await whatsappActionsInTopCard(offPage);
    if (anchors.length !== 1) {
      findings.push(`sin JavaScript hay ${anchors.length} acciones de WhatsApp y el piso pide exactamente una`);
    }
    const controls = await copyControlsIn(offPage, 'body');
    const visibleDead = controls.filter((control) => control.width > 0 && control.height > 0);
    if (visibleDead.length > 0) {
      findings.push(`sin JavaScript se ofrecen ${visibleDead.length} botones de copiar que no pueden funcionar`);
    }
    assertBehavior(findings, 'con los scripts apagados queda el ancla de siempre y ningún control que finja funcionar (estado U5 declarado).');
  },
);

Then(
  'la acción de copiar cumple las siete comprobaciones visuales de la superficie publicada',
  { timeout: 30_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const home = requiredHome(state);
    const audit = await sevenPointAuditIn(home.page, TOP_CARD, 'copy');
    assert.ok(
      audit.surfacePresent,
      'superficie no alcanzada: la home construida no muestra su tarjeta grande de primer lugar; esto es un problema de test o de build, no un RED de comportamiento',
    );
    assertBehavior(
      sevenPointFindings(audit, 'la acción de copiar', home.uiGate),
      'renderizar el botón de copiar con los tokens existentes, geometría de pulgar, estados honestos y las preferencias del sistema.',
    );
  },
);
