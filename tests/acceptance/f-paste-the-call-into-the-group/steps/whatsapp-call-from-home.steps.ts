// Slice-01 acceptance steps for f-paste-the-call-into-the-group. Every
// scenario builds an isolated copy of the production Astro surface with the
// real `npm run build`, serves the emitted dist/ over HTTP, and observes the
// home through Chromium at 390 px. Steps ACT through the production driving
// surface (the built page a surfer taps) and OBSERVE only user-facing
// outcomes: the visible action, the prewritten message, the shared address.
// State is stashed per scenario in the feature-shared WeakMap
// (steps/support/share-stash.ts) so this file never registers a second
// cucumber World beside the pipeline one, and so the later slices' steps can
// chain onto the state these steps produce.

import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  dropStash,
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
  assertIntactCopy,
  configuredSite,
  copyProjectForSurface,
  disposeHome,
  disposeRoot,
  expectedShare,
  homeDocumentGzBytes,
  messageContentFindings,
  messageLinkFindings,
  messagePurityFindings,
  newHomePage,
  openBuiltHome,
  pointCopyAtSite,
  prewrittenMessage,
  projectRoot,
  promoteLongestNameSpot,
  shareFieldFindings,
  whatsappActionsInTopCard,
} from './support/built-share-surface';

const MISSING_ACTION =
  'WHAT: la tarjeta grande no ofrece la acción de WhatsApp con el mensaje ya escrito. ' +
  'WHY: sin ese toque el surfista no puede avisar al grupo antes de manejar. ' +
  'HOW: un ancla wa.me/?text= en la tarjeta grande de la home publicada.';

async function messageOnPage(state: Stash): Promise<string> {
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  const action = actions[0];
  assert.ok(action !== undefined, MISSING_ACTION);
  return prewrittenMessage(action);
}

// ---------- Givens: the isolated production copies ----------

Given('una copia intacta de la mañana publicada instalada para compartir', function (this: PasteWorld) {
  const state = stash(this);
  state.root = copyProjectForSurface();
  assertIntactCopy(state.root);
});

Given('una mañana publicada cuyo mejor spot es el del nombre más largo', function (this: PasteWorld) {
  const state = stash(this);
  state.root = copyProjectForSurface();
  promoteLongestNameSpot(state.root);
});

Given('una copia de la mañana publicada apuntada a un dominio recién registrado', function (this: PasteWorld) {
  const state = stash(this);
  state.root = copyProjectForSurface();
  state.originalSiteHost = new URL(configuredSite(projectRoot)).host;
  pointCopyAtSite(state.root, 'https://olas-registradas.example');
});

// ---------- Whens: the real build, served and opened ----------

When(
  'el surfista abre la home para compartir a {int} px, con tema {string} y movimiento {string}',
  { timeout: 120_000 },
  async function (this: PasteWorld, width: number, theme: string, motion: string) {
    const state = stash(this);
    // The clipboard permission is granted so later-slice Then oracles can read
    // what the copy action wrote. Slice-01's own scenarios never touch it.
    state.home = await openBuiltHome(requiredRoot(state), { width, theme, motion, javaScript: true, clipboard: 'granted' });
    state.expected = expectedShare(requiredRoot(state));
  },
);

When(
  'el surfista abre la home para compartir sin JavaScript a {int} px',
  { timeout: 120_000 },
  async function (this: PasteWorld, width: number) {
    const state = stash(this);
    state.home = await openBuiltHome(requiredRoot(state), {
      width,
      theme: 'claro',
      motion: 'normal',
      javaScript: false,
    });
    state.expected = expectedShare(requiredRoot(state));
  },
);

// ---------- Thens: the individual behavior oracles ----------

Then('los cinco campos del llamado están poblados para el mejor spot del día', function (this: PasteWorld) {
  const state = stash(this);
  assertBehavior(
    shareFieldFindings(requiredRoot(state)),
    'el productor publica score_q, size_band, size_range_m, wind_state y conf_level para el spot compartido, y las dos copias de hoy coinciden (HANDOFF sección 10).',
  );
});

Then('la tarjeta grande ofrece una sola acción de WhatsApp que se toca una vez', async function (this: PasteWorld) {
  const state = stash(this);
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  const findings: string[] = [];
  if (actions.length === 0) findings.push('la tarjeta grande no ofrece ninguna acción de WhatsApp');
  if (actions.length > 1) findings.push(`hay ${actions.length} acciones de WhatsApp en la tarjeta y debe haber una sola`);
  const action = actions[0];
  if (action !== undefined && (action.width < 44 || action.height < 44)) {
    findings.push(`la acción mide ${Math.round(action.width)}x${Math.round(action.height)} px y el mínimo del pulgar es 44x44`);
  }
  assertBehavior(
    findings,
    'poner en la tarjeta grande un único ancla de WhatsApp de al menos 44 px que abre el chat con el mensaje ya escrito, sin pasos intermedios.',
  );
});

Then(
  'el mensaje ya escrito trae el llamado completo: la fecha, el mejor spot con su puntaje, el tamaño y el viento, la ventana y la confianza',
  async function (this: PasteWorld) {
    const state = stash(this);
    const message = await messageOnPage(state);
    assertBehavior(
      messageContentFindings(message, requiredExpected(state)),
      'llenar la plantilla verbatim de la sección 10 con los campos de days[0] del mejor spot publicado.',
    );
  },
);

Then('el mensaje termina con la dirección completa del sitio sellada con el build', async function (this: PasteWorld) {
  const state = stash(this);
  const message = await messageOnPage(state);
  assertBehavior(
    messageLinkFindings(message, requiredExpected(state)),
    'derivar la dirección del site configurado en Astro y sellarla con el ?b= de la mañana publicada.',
  );
});

Then('la acción de WhatsApp sigue presente como un enlace normal', async function (this: PasteWorld) {
  const state = stash(this);
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  const findings: string[] = [];
  if (actions.length !== 1) {
    findings.push(`sin JavaScript hay ${actions.length} acciones de WhatsApp y debe haber exactamente una`);
  }
  const href = actions[0]?.href ?? '';
  if (!href.startsWith('https://wa.me/')) {
    findings.push('la acción no es un ancla normal hacia wa.me con el texto ya escrito');
  }
  assertBehavior(findings, 'servir la acción como un ancla del HTML publicado, sin depender de ningún script.');
});

Then(
  'ese enlace lleva el mismo mensaje completo que con JavaScript encendido',
  { timeout: 30_000 },
  async function (this: PasteWorld) {
    const state = stash(this);
    const offMessage = await messageOnPage(state);
    const home = requiredHome(state);
    const onPage = await newHomePage(home.browser, home.url, {
      width: 390,
      theme: 'claro',
      motion: 'normal',
      javaScript: true,
    });
    const onActions = await whatsappActionsInTopCard(onPage);
    const onAction = onActions[0];
    assert.ok(onAction !== undefined, MISSING_ACTION);
    const onMessage = prewrittenMessage(onAction);
    assert.equal(
      offMessage,
      onMessage,
      'WHAT: el mensaje sin JavaScript difiere del mensaje con JavaScript. ' +
        'WHY: apagar los scripts nunca puede cambiar el llamado que llega al grupo. ' +
        'HOW: una única ancla en el HTML publicado, la misma para ambos mundos.',
    );
  },
);

Then('el spot y el puntaje del mensaje son exactamente los de la tarjeta grande', async function (this: PasteWorld) {
  const state = stash(this);
  const message = await messageOnPage(state);
  const card = await requiredHome(state).page.evaluate(() => {
    const hero = document.querySelector('ol.ranked > li:first-child');
    const anchor = hero?.querySelector('a');
    const score = hero?.querySelector('strong');
    return {
      headline: anchor?.textContent?.trim() ?? '',
      score: Number(score?.textContent?.trim()),
    };
  });
  const findings: string[] = [];
  const cardSpot = card.headline.replace(/^VE A\s+/i, '').trim();
  if (cardSpot === '') {
    findings.push('la tarjeta grande no nombra su destino');
  } else if (!message.toLocaleLowerCase('es-PA').includes(cardSpot.toLocaleLowerCase('es-PA'))) {
    findings.push(`el mensaje no cuenta la historia de la tarjeta: no nombra "${cardSpot}"`);
  }
  if (!Number.isFinite(card.score)) {
    findings.push('la tarjeta grande no muestra puntaje');
  } else if (!new RegExp(`\\b${card.score}\\b`).test(message)) {
    findings.push(`el mensaje no lleva el puntaje ${card.score} que muestra la tarjeta`);
  }
  assertBehavior(
    findings,
    'componer el mensaje desde la misma entrada de datos que pinta la tarjeta, nunca desde una copia aparte.',
  );
});

Then(
  'el mensaje no muestra nombres de modelos, campos técnicos, llaves de plantilla ni texto de relleno',
  async function (this: PasteWorld) {
    const state = stash(this);
    assertBehavior(
      messagePurityFindings(await messageOnPage(state)),
      'mantener el mensaje en español de a pie: palabras del cuerpo, viento, horas, confianza y el enlace, nada más.',
    );
  },
);

Then('la dirección dentro del mensaje nunca es relativa ni apunta a localhost', async function (this: PasteWorld) {
  const state = stash(this);
  assertBehavior(
    messageLinkFindings(await messageOnPage(state), requiredExpected(state)),
    'derivar la dirección absoluta del site configurado; nunca una ruta relativa ni el host local de la vista previa.',
  );
});

Then('la dirección del mensaje deriva del sitio configurado en esa copia', async function (this: PasteWorld) {
  const state = stash(this);
  assertBehavior(
    messageLinkFindings(await messageOnPage(state), requiredExpected(state)),
    'leer el site configurado para la línea {url} del mensaje; cambiado el dominio de la copia, el mensaje cambia solo, sin tocar componentes.',
  );
});

Then('el nombre del sitio original no aparece por ningún lado del mensaje', async function (this: PasteWorld) {
  const state = stash(this);
  const host = state.originalSiteHost;
  assert.ok(host !== undefined, 'test fixture error: falta el host original configurado');
  const message = await messageOnPage(state);
  assertBehavior(
    message.includes(host) ? [`el mensaje sigue nombrando ${host} con el sitio ya reconfigurado`] : [],
    'ningún componente ni plantilla lleva el hostname escrito a mano; todos leen la configuración.',
  );
});

Then('el documento de la home queda dentro de su techo del primer vuelo', function (this: PasteWorld) {
  const state = stash(this);
  const measured = homeDocumentGzBytes(requiredRoot(state));
  const ceiling = 14 * 1024;
  assertBehavior(
    measured <= ceiling ? [] : [`la home pesa ${measured} B gz y su techo del primer vuelo es ${ceiling} B`],
    'mantener el ancla de WhatsApp dentro del techo de 14 KB gz del documento de la home (sección 5).',
  );
});

Then('el mensaje nombra ese spot completo con su puntaje', async function (this: PasteWorld) {
  const state = stash(this);
  const expected = requiredExpected(state);
  const message = await messageOnPage(state);
  const findings: string[] = [];
  if (!message.toLocaleLowerCase('es-PA').includes(expected.spotName.toLocaleLowerCase('es-PA'))) {
    findings.push(`el mensaje no nombra completo a ${expected.spotName}`);
  }
  if (!new RegExp(`\\b${expected.score}\\b`).test(message)) {
    findings.push(`el mensaje no trae el puntaje ${expected.score}`);
  }
  assertBehavior(findings, 'nombrar el destino completo aunque sea el más largo de la costa, sin recortarlo.');
});

Then('la acción de compartir cabe completa a {int} px sin recortes', async function (this: PasteWorld, width: number) {
  const state = stash(this);
  const actions = await whatsappActionsInTopCard(requiredHome(state).page);
  assert.ok(actions[0] !== undefined, MISSING_ACTION);
  const geometry = await requiredHome(state).page.evaluate(() => {
    const hero = document.querySelector('ol.ranked > li:first-child');
    const anchors = hero === null
      ? []
      : [...hero.querySelectorAll('a')].filter((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        const label = `${anchor.textContent ?? ''} ${anchor.getAttribute('aria-label') ?? ''} ${anchor.getAttribute('title') ?? ''}`;
        return href.startsWith('https://wa.me/') || /whatsapp/i.test(label);
      });
    const target = anchors[0] ?? null;
    const rect = target?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      left: rect?.left ?? -1,
      right: rect?.right ?? Number.POSITIVE_INFINITY,
      labelWidth: rect?.width ?? 0,
      labelScrollWidth: target?.scrollWidth ?? Number.POSITIVE_INFINITY,
    };
  });
  const findings: string[] = [];
  if (geometry.scrollWidth > geometry.clientWidth) findings.push(`U2: la home desborda los ${width} px`);
  if (geometry.left < 0 || geometry.right > geometry.clientWidth) findings.push('U2: la acción queda fuera del teléfono');
  if (geometry.labelScrollWidth > geometry.labelWidth + 1) findings.push('U6: el texto de la acción queda recortado');
  assertBehavior(findings, 'dejar que la acción ajuste su texto al ancho del teléfono sin desbordar ni recortar.');
});

Then(
  'la acción de WhatsApp cumple las siete comprobaciones visuales de la superficie publicada',
  async function (this: PasteWorld) {
    const state = stash(this);
    const home = requiredHome(state);
    // String-form evaluate, the shipped slice-04 precedent: tsx keep-names
    // injects a `__name` helper into serialized function bodies, which does
    // not exist inside the page and breaks a function-form evaluate.
    const audit = await home.page.evaluate(`(() => {
      const parse = (value) => {
        const match = value.match(/rgba?\\(([^)]+)\\)/i);
        if (!match || match[1] === undefined) return null;
        const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
        return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
      };
      const alphaOf = (value) => {
        const match = value.match(/rgba\\([^)]*,\\s*([\\d.]+)\\s*\\)/i);
        if (match && match[1] !== undefined) return Number(match[1]);
        return value === 'transparent' ? 0 : 1;
      };
      const luminance = ([r, g, b]) => {
        const channel = (value) => {
          const normalized = value / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const contrast = (a, b) => {
        const first = luminance(a);
        const second = luminance(b);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      const hero = document.querySelector('ol.ranked > li:first-child');
      const anchors = hero === null
        ? []
        : [...hero.querySelectorAll('a')].filter((anchor) => {
          const href = anchor.getAttribute('href') ?? '';
          const label = (anchor.textContent ?? '') + ' ' + (anchor.getAttribute('aria-label') ?? '') + ' ' + (anchor.getAttribute('title') ?? '');
          return href.startsWith('https://wa.me/') || /whatsapp/i.test(label);
        });
      const action = anchors[0];
      const result = {
        heroPresent: hero !== null,
        present: action !== undefined,
        count: anchors.length,
        label: '',
        contrastFailures: [],
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        labelScrollWidth: 0,
        labelClientWidth: 0,
        fontPx: 0,
        movingUnderReduce: [],
        loadingCount: hero === null ? 0 : hero.querySelectorAll('[role="progressbar"], [data-reading-state="loading"], .spinner, .skeleton').length,
        hexInMatchedRules: [],
        untokenedDeclarations: [],
        matchedRuleCount: 0,
      };
      if (action === undefined) return result;
      result.label = (action.getAttribute('aria-label') ?? action.textContent ?? '').trim();
      const rect = action.getBoundingClientRect();
      result.left = rect.left;
      result.right = rect.right;
      result.width = rect.width;
      result.height = rect.height;
      result.labelScrollWidth = action.scrollWidth;
      result.labelClientWidth = rect.width;
      result.fontPx = Number.parseFloat(getComputedStyle(action).fontSize);
      const stops = [];
      let node = action;
      while (node !== null) {
        const styles = getComputedStyle(node);
        for (const match of styles.backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)) {
          const stop = parse(match[0]);
          if (stop !== null) stops.push(stop);
        }
        const backdrop = parse(styles.backgroundColor);
        if (backdrop !== null && alphaOf(styles.backgroundColor) >= 0.99) {
          stops.push(backdrop);
          break;
        }
        node = node.parentElement;
      }
      if (stops.length === 0) {
        const bodyBackdrop = parse(getComputedStyle(document.body).backgroundColor);
        if (bodyBackdrop !== null) stops.push(bodyBackdrop);
      }
      const foreground = parse(getComputedStyle(action).color);
      if (foreground === null || stops.length === 0) {
        result.contrastFailures.push('no se pudo medir el texto de la acción contra su fondo real');
      } else {
        for (const stop of stops) {
          const measured = contrast(foreground, stop);
          if (measured < 4.5) result.contrastFailures.push('el texto queda en ' + measured.toFixed(2) + ':1 contra su fondo real');
        }
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        result.movingUnderReduce = [action, ...action.querySelectorAll('*')]
          .filter((element) => {
            const styles = getComputedStyle(element);
            return styles.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
              || styles.animationName.split(',').some((name) => name.trim() !== '' && name.trim() !== 'none');
          })
          .map((element) => element.tagName.toLowerCase());
      }
      const walk = (list) => {
        for (const rule of [...list]) {
          if (rule instanceof CSSMediaRule) {
            walk(rule.cssRules);
            continue;
          }
          if (!(rule instanceof CSSStyleRule)) continue;
          let matches = false;
          try {
            matches = action.matches(rule.selectorText);
          } catch {
            matches = false;
          }
          if (!matches) continue;
          result.matchedRuleCount += 1;
          if (/#[0-9a-f]{3,8}\\b/i.test(rule.cssText)) result.hexInMatchedRules.push(rule.selectorText);
          for (const property of ['color', 'background', 'background-color', 'background-image', 'border-radius', 'box-shadow']) {
            const value = rule.style.getPropertyValue(property);
            if (value === '') continue;
            if (/#[0-9a-f]{3,8}\\b|rgba?\\(|hsla?\\(/i.test(value) && !value.includes('var(')) {
              result.untokenedDeclarations.push(rule.selectorText + ' ' + property);
            }
          }
        }
      };
      for (const sheet of [...document.styleSheets]) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        walk(rules);
      }
      return result;
    })()`) as {
      readonly heroPresent: boolean;
      readonly present: boolean;
      readonly count: number;
      readonly label: string;
      readonly contrastFailures: string[];
      readonly scrollWidth: number;
      readonly clientWidth: number;
      readonly left: number;
      readonly right: number;
      readonly width: number;
      readonly height: number;
      readonly labelScrollWidth: number;
      readonly labelClientWidth: number;
      readonly fontPx: number;
      readonly movingUnderReduce: string[];
      readonly loadingCount: number;
      readonly hexInMatchedRules: string[];
      readonly untokenedDeclarations: string[];
      readonly matchedRuleCount: number;
    };

    assert.ok(
      audit.heroPresent,
      'superficie no alcanzada: la home construida no muestra su tarjeta grande de primer lugar; esto es un problema de test o de build, no un RED de comportamiento',
    );
    const findings: string[] = [];
    if (!audit.present) {
      findings.push('U5: la tarjeta grande no ofrece la acción de WhatsApp');
    } else {
      if (audit.count !== 1) findings.push(`U5: hay ${audit.count} acciones de WhatsApp y debe haber una sola`);
      findings.push(...audit.contrastFailures.map((finding) => `U1: ${finding}`));
      if (audit.scrollWidth > audit.clientWidth) findings.push('U2: la home desborda el teléfono de 390 px');
      if (audit.left < 0 || audit.right > audit.clientWidth) findings.push('U2: la acción queda fuera de la pantalla');
      if (audit.width < 44 || audit.height < 44) {
        findings.push(`U3: la acción mide ${Math.round(audit.width)}x${Math.round(audit.height)} px y el mínimo es 44x44`);
      }
      if (audit.movingUnderReduce.length > 0) {
        findings.push(`U4: con movimiento reducido siguen animados: ${audit.movingUnderReduce.join(', ')}`);
      }
      if (audit.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial junto a la acción');
      if (audit.label === '') findings.push('U5: la acción no tiene nombre legible');
      if (audit.fontPx < 16) findings.push(`U6: el texto de la acción mide ${audit.fontPx}px y la escala legible arranca en 16px`);
      if (audit.labelScrollWidth > audit.labelClientWidth + 1) findings.push('U6: el texto de la acción queda recortado');
      if (audit.matchedRuleCount === 0) {
        findings.push('U7: la acción no recibe ninguna regla de estilo propia de la superficie construida');
      }
      findings.push(...audit.hexInMatchedRules.map((selector) => `U7: ${selector} introduce un color hexadecimal fuera de tokens`));
      findings.push(...audit.untokenedDeclarations.map((declaration) => `U7: ${declaration} no usa el token nombrado`));
    }
    if (home.uiGate.status !== 0) {
      findings.push(`U1-U7: el gate de la superficie construida falló: ${home.uiGate.output.trim()}`);
    }
    assertBehavior(
      findings,
      'renderizar la acción con los tokens existentes, geometría de pulgar, estados honestos y las preferencias del sistema.',
    );
  },
);

After({ timeout: 20_000 }, async function (this: PasteWorld) {
  const state = peekStash(this);
  if (state === undefined) return;
  await disposeHome(state.home);
  disposeRoot(state.root);
  dropStash(this);
});
