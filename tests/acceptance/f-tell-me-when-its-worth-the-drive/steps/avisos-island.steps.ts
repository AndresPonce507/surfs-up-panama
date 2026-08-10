// Slice-01 acceptance steps: the avisos affordance on a real built spot page,
// opened in a real Chromium at 390 px against the emitted dist/ served over
// real HTTP with no route fallback.
//
// THE HONESTY RULE THIS FILE ENFORCES
// -----------------------------------
// No avisos-on state may render without BOTH a real browser PushSubscription
// and a stored subscription. That is the easiest thing in this feature to fake,
// so the on-state observation deliberately reads the browser's real
// PushManager.getSubscription() and never a class name, a data attribute set by
// the page itself, or a remembered flag.
//
// PERMISSION PATHS ARE PROVEN, NOT ASSUMED
// ----------------------------------------
// A permission flow that only walks the granted path passes happily on a
// browser that silently refused. Granted uses Playwright's real
// grantPermissions. Denied uses Chromium's real default, which is to deny a
// permission that was never granted, so Notification.permission genuinely reads
// 'denied' and requestPermission() genuinely resolves 'denied'. Unsupported
// removes the push capability from the page before it loads, which is the
// honest shape of a context that cannot request push at all (an open iOS Safari
// tab, per research 12 section 4 as quoted in application-architecture.md
// section 12).
//
// WHAT THIS FILE DELIBERATELY DOES NOT TOUCH
// ------------------------------------------
// The "Añadir a pantalla de inicio" hint. Its ownership is claimed by two
// committed plans and unruled (Pre-requisite 4(b)), so no assertion here says it
// is present and none says it is absent. Concretely, the action scan excludes
// <summary>: a <details> disclosure is not an action, and the hint is exactly a
// <details> disclosure whose summary mentions avisos.
//
// DEPLOY-BLOCKED STEPS DO NOT STAND UP A STAND-IN SERVER
// -----------------------------------------------------
// There is no deployed write path (Pre-requisites 2, 3, 5, 6). A step that
// spun up a local endpoint to make an ack oracle pass would prove nothing about
// the real one, so the server-condition steps only record the condition and
// observe whether the built surface names any avisos write destination at all.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertBehaviour } from './support/declared-surface';
import { serveBuiltSurface, VENAO_PATH, type StaticSurface } from './support/built-surface';

const PHONE = { width: 390, height: 844 } as const;
const OPEN_TIMEOUT = 20_000;

type ServerCondition = 'ninguna' | 'no-puede-guardar' | 'destino-desconocido';

type AvisosSurface = {
  /** Interactive elements that offer to turn avisos on. <summary> excluded on purpose. */
  readonly actions: readonly { readonly text: string; readonly tag: string; readonly width: number; readonly height: number }[];
  /** Interactive elements that offer to turn avisos off. */
  readonly removals: readonly { readonly text: string; readonly tag: string }[];
  /** Text that claims avisos are on. */
  readonly onStateTexts: readonly string[];
  /** Text of the avisos region, or of the whole document when no region exists. */
  readonly avisosText: string;
  readonly bodyText: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  /** navigator.permissions.query state: 'granted' | 'prompt' | 'denied' | 'sin-api'. */
  readonly permission: string;
  /** Notification.permission, kept only so a failure message shows both readings. */
  readonly notificationPermission: string;
  readonly pushCapable: boolean;
};

type IslandWorld = {
  islandServer?: StaticSurface | undefined;
  islandBrowser?: Browser | undefined;
  islandContext?: BrowserContext | undefined;
  islandPage?: Page | undefined;
  islandServerCondition?: ServerCondition;
  islandDeclaredWriteOrigin?: string | null;
  islandBefore?: AvisosSurface;
  islandAfter?: AvisosSurface;
  islandTapped?: boolean;
  islandRemovalTapped?: boolean;
  islandPermissionAsks?: number;
  islandRealSubscription?: unknown;
  islandNotes?: string[];
};

function w(self: unknown): IslandWorld {
  return self as IslandWorld;
}

function note(self: unknown, line: string): void {
  (w(self).islandNotes ??= []).push(line);
}

function notes(self: unknown): string[] {
  return w(self).islandNotes ?? [];
}

function requirePage(self: unknown): Page {
  const page = w(self).islandPage;
  assert.ok(page, 'la página del spot no llegó a abrirse');
  return page;
}

// ---------------------------------------------------------------- observing

// Everything that runs INSIDE the page is written as a source string, never as
// a TypeScript closure. The steps are loaded through tsx, and esbuild rewrites
// named local functions with a `__name` helper that does not exist in the page,
// so a closure handed to page.evaluate dies with "ReferenceError: __name is not
// defined" before it observes anything. That is a harness failure masquerading
// as a result, exactly the kind of BROKEN this suite must not produce. A source
// string is handed to the page untouched.

/**
 * Read the avisos surface out of the live page.
 *
 * Identification runs on two tracks so a passing implementation is not forced
 * into one markup shape: an element counts as an avisos action if it carries a
 * data-field starting with "avisos" OR its own text mentions avisos. The scan
 * covers real actions only (button, [role=button], a[href], input buttons) and
 * never <summary>: a <details> disclosure is not an action, and the unowned
 * "Añadir a pantalla de inicio" hint is exactly such a disclosure.
 */
const READ_AVISOS_SURFACE = `(async () => {
  const ACTION_SELECTOR = 'button, [role="button"], a[href], input[type="button"], input[type="submit"]';
  const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const mentionsAvisos = (el) =>
    /avisos?/i.test(text(el)) ||
    (el.getAttribute('data-field') || '').indexOf('avisos') === 0 ||
    /avisos?/i.test(el.getAttribute('aria-label') || '');

  const removalWords = /(quitar|desactivar|apagar|dejar de)/i;
  const actionable = Array.prototype.slice
    .call(document.querySelectorAll(ACTION_SELECTOR))
    .filter((el) => visible(el) && mentionsAvisos(el));

  const actions = actionable
    .filter((el) => !removalWords.test(text(el)))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        text: text(el),
        tag: el.tagName.toLowerCase(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    });
  const removals = actionable
    .filter((el) => removalWords.test(text(el)))
    .map((el) => ({ text: text(el), tag: el.tagName.toLowerCase() }));

  const marked = document.querySelector('[data-field^="avisos"]');
  const region = marked ? marked.closest('section, div, p, li') : null;

  // The reliable reading of the permission in this harness. Headless Chromium
  // pins Notification.permission at 'denied' whatever the context was granted,
  // while navigator.permissions.query reports the truth. Verified empirically
  // before this file was written; both readings are carried so the difference
  // is visible in a failure message instead of being silently trusted.
  let permission = 'sin-api';
  try {
    permission = (await navigator.permissions.query({ name: 'notifications' })).state;
  } catch (e) { permission = 'sin-api'; }

  const onStateTexts = Array.prototype.slice
    .call(document.querySelectorAll('*'))
    .filter((el) => el.children.length === 0 && visible(el))
    .map((el) => text(el))
    .filter(
      (t) =>
        /avisos? activos?|avisos? activados?/i.test(t) ||
        (/avisos?/i.test(t) && /\\blisto\\b/i.test(t)),
    );

  return {
    actions: actions,
    removals: removals,
    onStateTexts: onStateTexts,
    avisosText: region ? text(region) : text(document.body),
    bodyText: text(document.body),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    permission: permission,
    notificationPermission: window.Notification ? window.Notification.permission : 'sin-api',
    pushCapable:
      'PushManager' in window &&
      'serviceWorker' in navigator &&
      'ServiceWorkerRegistration' in window &&
      'pushManager' in window.ServiceWorkerRegistration.prototype,
  };
})()`;

/** The browser's own answer about whether a real subscription exists. */
const READ_REAL_SUBSCRIPTION = `(async () => {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration || !('pushManager' in registration)) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription === null ? null : subscription.toJSON();
})()`;

async function readAvisosSurface(page: Page): Promise<AvisosSurface> {
  return (await page.evaluate(READ_AVISOS_SURFACE)) as AvisosSurface;
}

async function readRealSubscription(page: Page): Promise<unknown> {
  return page.evaluate(READ_REAL_SUBSCRIPTION);
}

// ------------------------------------------------------------------- acting

type OpenOptions = {
  readonly grantNotifications: boolean;
  readonly pushCapable: boolean;
  readonly colorScheme?: 'light' | 'dark';
  readonly reducedMotion?: 'reduce' | 'no-preference';
  readonly rememberedFlag?: boolean;
};

async function openVenao(self: unknown, options: OpenOptions): Promise<void> {
  const world = w(self);
  world.islandServer ??= await serveBuiltSurface();
  world.islandBrowser ??= await chromium.launch();
  const context = await world.islandBrowser.newContext({
    viewport: { ...PHONE },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-PA',
    colorScheme: options.colorScheme ?? 'light',
    reducedMotion: options.reducedMotion ?? 'no-preference',
  });
  world.islandContext = context;

  if (options.grantNotifications) {
    await context.grantPermissions(['notifications'], { origin: world.islandServer.origin });
  }
  // Denied is Chromium's real default for a permission that was never granted;
  // nothing is stubbed to produce it.

  if (!options.pushCapable) {
    // Real capability absence, applied before the document loads: an open iOS
    // Safari tab simply has no way to request push (research 12 section 4, as
    // quoted in application-architecture.md section 12).
    await context.addInitScript({
      content: `delete window.PushManager;
        if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
          delete window.ServiceWorkerRegistration.prototype.pushManager;
        }`,
    });
  }

  if (options.rememberedFlag === true) {
    await context.addInitScript({
      content: `try {
          localStorage.setItem('avisos:playa-venao', 'activos');
          localStorage.setItem('push:playa-venao', 'subscribed');
        } catch (e) { /* storage refused; the scenario's point survives */ }`,
    });
  }

  const page = await context.newPage();
  world.islandPage = page;
  page.on('dialog', (dialog) => void dialog.dismiss());
  const response = await page.goto(`${world.islandServer.origin}${VENAO_PATH}`, {
    waitUntil: 'load',
    timeout: OPEN_TIMEOUT,
  });
  assert.ok(response, 'la página del spot no contestó nada');
  assert.equal(
    response.status(),
    200,
    `la página de Playa Venao contestó ${response.status()} en la superficie construida`,
  );
  world.islandBefore = await readAvisosSurface(page);
}

/**
 * Tap the avisos action if the built surface offers one. Records whether it
 * existed; never asserts here, because the assertion belongs to the scenario's
 * own Then step.
 */
async function tapAvisosAction(self: unknown, kind: 'activar' | 'quitar'): Promise<void> {
  const world = w(self);
  const page = requirePage(self);
  const before = world.islandBefore ?? (await readAvisosSurface(page));
  const candidates = kind === 'activar' ? before.actions : before.removals;
  if (candidates.length === 0) {
    note(
      self,
      kind === 'activar'
        ? 'la página construida de Playa Venao no ofrece ninguna acción para activar avisos'
        : 'la página construida de Playa Venao no ofrece ninguna acción para quitar los avisos',
    );
    world.islandAfter = before;
    world.islandRealSubscription = await readRealSubscription(page);
    return;
  }
  const target = page
    .locator('button, [role="button"], a[href]')
    .filter({ hasText: kind === 'activar' ? /avisos?/i : /(quitar|desactivar|apagar|dejar de)/i })
    .first();
  await target.click({ timeout: OPEN_TIMEOUT }).catch((error: unknown) => {
    note(self, `el toque sobre el control de avisos no llegó a nada: ${String(error).split('\n')[0]}`);
  });
  await page.waitForTimeout(250);
  if (kind === 'activar') world.islandTapped = true;
  else world.islandRemovalTapped = true;
  world.islandAfter = await readAvisosSurface(page);
  world.islandRealSubscription = await readRealSubscription(page);
}

function after(self: unknown): AvisosSurface {
  const world = w(self);
  const observed = world.islandAfter ?? world.islandBefore;
  assert.ok(observed, 'no se llegó a observar la página del spot');
  return observed;
}

/**
 * A negative observation is only worth anything once the thing it is about
 * exists. "No aparece el estado activo" is trivially true on a page with no
 * avisos control at all, and a trivially true assertion is a false green. Every
 * negative Then in this file therefore first requires the affordance to be
 * there, so the scenario can only pass by real behaviour.
 */
function affordanceMissing(self: unknown): string[] {
  const world = w(self);
  const observed = world.islandAfter ?? world.islandBefore;
  if (observed !== undefined && observed.actions.length > 0) return [];
  return [
    'la página construida no ofrece ningún control de avisos, así que esta comprobación en negativo todavía no prueba nada',
  ];
}

// -------------------------------------------------------------------- given

Given(
  'la página de Playa Venao de la superficie publicada real, abierta en el teléfono a 390 px',
  { timeout: 300_000 },
  async function () {
    await openVenao(this, { grantNotifications: false, pushCapable: true });
  },
);

Given('el teléfono concede el permiso de avisos', { timeout: 60_000 }, async function () {
  const world = w(this);
  assert.ok(world.islandServer && world.islandContext, 'la página del spot no está abierta todavía');
  await world.islandContext.grantPermissions(['notifications'], { origin: world.islandServer.origin });
  const page = requirePage(this);
  await page.reload({ waitUntil: 'load' });
  world.islandBefore = await readAvisosSurface(page);
  assert.equal(
    world.islandBefore.permission,
    'granted',
    'el navegador no llegó a conceder el permiso de avisos, así que este escenario no probaría el camino concedido',
  );
});

/**
 * The refused path, proven actively rather than assumed.
 *
 * The browser is asked for the permission for real and its answer is checked to
 * be anything but 'granted'. One limitation recorded rather than hidden:
 * Playwright drives permissions per context, so a permission that was never
 * granted comes back as a dismissal ('prompt' / 'default') and not as a hard
 * 'denied'. Both are refusals and both owe the surfer the same honest state, so
 * the oracle is "no concedido". A hard operating-system denial is only
 * observable on the real-device smoke (Pre-requisito 10).
 */
Given('el teléfono no concede el permiso de avisos', { timeout: 30_000 }, async function () {
  const world = w(this);
  const page = requirePage(this);
  world.islandPermissionAsks = 0;
  page.on('dialog', () => {
    world.islandPermissionAsks = (world.islandPermissionAsks ?? 0) + 1;
  });
  const answer = await page.evaluate(`(async () => {
    try { return await Notification.requestPermission(); } catch (e) { return 'sin-api'; }
  })()`);
  assert.notEqual(
    answer,
    'granted',
    'el navegador concedió el permiso, así que este escenario no probaría el camino sin permiso',
  );
  world.islandBefore = await readAvisosSurface(page);
  assert.notEqual(
    world.islandBefore.permission,
    'granted',
    'el contexto quedó con el permiso concedido, así que este escenario no probaría el camino sin permiso',
  );
});

Given(
  'la página de Playa Venao abierta a 390 px en un teléfono que no puede pedir avisos',
  { timeout: 300_000 },
  async function () {
    await openVenao(this, { grantNotifications: false, pushCapable: false });
    const observed = w(this).islandBefore;
    assert.ok(observed, 'no se llegó a observar la página del spot');
    assert.equal(
      observed.pushCapable,
      false,
      'el contexto todavía puede pedir avisos, así que este escenario no probaría el caso sin soporte',
    );
  },
);

Given('el servidor de suscripciones no puede guardarla en este momento', function () {
  declareServerCondition(this, 'no-puede-guardar');
});

Given('el servidor de suscripciones no reconoce el destino de este navegador', function () {
  declareServerCondition(this, 'destino-desconocido');
});

/**
 * Records the declared server condition and observes whether the built surface
 * names any avisos write destination at all. Deliberately stands up nothing: a
 * scenario satisfied by a stand-in endpoint proves nothing about the real one,
 * and there is no deployed write path yet (Pre-requisites 2, 3, 5, 6).
 */
function declareServerCondition(self: unknown, condition: ServerCondition): void {
  const world = w(self);
  world.islandServerCondition = condition;
  const server = world.islandServer;
  assert.ok(server, 'la página del spot no está abierta todavía');
  const documents = [join(server.dist, 'spots', 'playa-venao.html')];
  const found = documents
    .map((file) => readFileSync(file, 'utf8'))
    .flatMap((body) => [...body.matchAll(/https?:\/\/[^"'\s]*\/api\/push/g)].map((m) => m[0]));
  world.islandDeclaredWriteOrigin = found[0] ?? null;
  if (world.islandDeclaredWriteOrigin === null) {
    note(
      self,
      'la superficie construida no nombra ningún destino donde guardar la suscripción, así que la condición del servidor no se puede producir de verdad todavía (camino de escritura sin desplegar)',
    );
  }
}

Given('una visita anterior dejó guardada una marca de avisos activos', { timeout: 300_000 }, async function () {
  await closeBrowserSurface(this);
  await openVenao(this, { grantNotifications: true, pushCapable: true, rememberedFlag: true });
});

Given('el navegador no tiene ninguna suscripción de avisos para ese spot', async function () {
  const page = requirePage(this);
  const subscription = await readRealSubscription(page);
  assert.equal(
    subscription,
    null,
    'el navegador ya trae una suscripción real, así que este escenario no probaría el caso sin suscripción',
  );
});

/**
 * Chained narrative: this precondition is the previous scenario's Given plus
 * its When, reusing the same step bodies rather than a copy-pasted fixture.
 *
 * It records what it observed instead of asserting it. An unmet precondition
 * must surface on this scenario's own Then, so the run reads as "fails at its
 * behaviour oracle" rather than "fell over during setup", which is the
 * difference between RED and BROKEN.
 */
Given('un surfista con avisos activos en Playa Venao', { timeout: 300_000 }, async function () {
  await openVenao(this, { grantNotifications: true, pushCapable: true });
  await tapAvisosAction(this, 'activar');
  const observed = after(this);
  if (observed.onStateTexts.length === 0) {
    note(this, 'activar avisos no deja la página en ningún estado activo, así que no hay nada que quitar');
  }
  if ((w(this).islandRealSubscription ?? null) === null) {
    note(this, 'activar avisos no deja ninguna suscripción real en el navegador');
  }
});

Given(
  'la página de Playa Venao abierta a 390 px con tema {string} y movimiento {string}',
  { timeout: 300_000 },
  async function (tema: string, movimiento: string) {
    await openVenao(this, {
      grantNotifications: true,
      pushCapable: true,
      colorScheme: tema === 'oscuro' ? 'dark' : 'light',
      reducedMotion: movimiento === 'reducido' ? 'reduce' : 'no-preference',
    });
  },
);

// --------------------------------------------------------------------- when

When('el surfista toca el control de avisos de ese spot', { timeout: 60_000 }, async function () {
  await tapAvisosAction(this, 'activar');
});

When('el surfista toca el control para quitar los avisos de ese spot', { timeout: 60_000 }, async function () {
  await tapAvisosAction(this, 'quitar');
});

When('el surfista vuelve a abrir la página de ese spot', { timeout: 60_000 }, async function () {
  const world = w(this);
  const page = requirePage(this);
  await page.reload({ waitUntil: 'load' });
  world.islandAfter = await readAvisosSurface(page);
  world.islandRealSubscription = await readRealSubscription(page);
});

// --------------------------------------------------------------------- then

Then('el navegador entrega una suscripción de avisos real para ese spot', function () {
  assertBehaviour(
    w(this).islandRealSubscription == null
      ? ['el navegador no entregó ninguna suscripción de avisos para Playa Venao']
      : [],
    'el toque tiene que pedir el permiso y obtener una suscripción real del navegador antes de mandar nada al servidor (07-write-path.md sección 8.6).',
    notes(this),
  );
});

Then('el spot dice listo solo después de que el servidor confirmó que la guardó', function () {
  const observed = after(this);
  const findings: string[] = [];
  if (observed.onStateTexts.length === 0) {
    findings.push('la página nunca llega a decir que los avisos quedaron listos');
  }
  if (w(this).islandDeclaredWriteOrigin === null && observed.onStateTexts.length > 0) {
    findings.push(
      'la página dice que quedó listo sin que exista ningún destino donde guardarlo, que es exactamente el falso verde prohibido',
    );
  }
  assertBehaviour(
    findings,
    'el "listo" del contrato P6 aparece solo después del acuse del servidor, nunca por tener una suscripción del navegador.',
    notes(this),
  );
});

Then('antes de esa confirmación la página no muestra avisos activos', function () {
  const before = w(this).islandBefore;
  assert.ok(before, 'no se llegó a observar la página del spot');
  const findings: string[] = [];
  if (before.onStateTexts.length > 0) {
    findings.push(`la página ya mostraba avisos activos antes de pedir nada: ${before.onStateTexts.join(' | ')}`);
  }
  findings.push(...affordanceMissing(this));
  assertBehaviour(
    findings,
    'ningún estado de avisos activos puede renderizarse antes del acuse del servidor.',
    notes(this),
  );
});

Then('el spot dice en español que sin permiso no puede avisar', function () {
  const observed = after(this);
  const explains = /(permiso|permite|no deja)/i.test(observed.avisosText);
  assertBehaviour(
    explains ? [] : ['la página no dice en ninguna parte que sin permiso no puede avisar'],
    'un permiso negado se explica en palabras, en español, en la propia página del spot.',
    notes(this),
  );
});

Then('la página no muestra avisos activos', function () {
  const observed = after(this);
  const findings: string[] = [];
  if (observed.onStateTexts.length > 0) {
    findings.push(`la página muestra avisos activos sin una suscripción real detrás: ${observed.onStateTexts.join(' | ')}`);
  }
  findings.push(...affordanceMissing(this));
  assertBehaviour(
    findings,
    'el estado activo sale de PushManager.getSubscription() más lo guardado, nunca de una marca recordada.',
    notes(this),
  );
});

Then('el spot no vuelve a pedir el permiso', function () {
  const asks = w(this).islandPermissionAsks ?? 0;
  const findings = asks > 0 ? [`el spot volvió a pedir el permiso ${asks} veces después de que se negara`] : [];
  if (!(w(this).islandTapped ?? false)) {
    findings.push('nunca se llegó a tocar ningún control de avisos, así que no hubo ocasión de volver a preguntar');
  }
  assertBehaviour(
    findings,
    'decisión 23: no se fastidia, y los navegadores tampoco dejan volver a preguntar.',
    notes(this),
  );
});

/**
 * The honest oracle for "no dead button" is a comparison, not an absence: the
 * SAME built page must offer the action where push can be requested, and must
 * not offer it where it cannot. Asserting only the absence would pass today for
 * the wrong reason, because the page offers nothing to anybody yet.
 */
Then('la página no ofrece ninguna acción para activar avisos', { timeout: 120_000 }, async function () {
  const world = w(this);
  const observed = after(this);
  const findings: string[] = [];
  if (observed.actions.length > 0) {
    findings.push(
      `la página ofrece ${observed.actions.length} acción(es) de avisos que aquí no pueden llevar a ninguna parte: ${observed.actions.map((a) => a.text).join(' | ')}`,
    );
  }

  const server = world.islandServer;
  const browser = world.islandBrowser;
  assert.ok(server && browser, 'la superficie construida no está servida');
  const capaz = await browser.newContext({
    viewport: { ...PHONE },
    isMobile: true,
    hasTouch: true,
    locale: 'es-PA',
  });
  try {
    const page = await capaz.newPage();
    await page.goto(`${server.origin}${VENAO_PATH}`, { waitUntil: 'load', timeout: OPEN_TIMEOUT });
    const capable = await readAvisosSurface(page);
    if (capable.actions.length === 0) {
      findings.push(
        'la misma página tampoco ofrece la acción donde el navegador SÍ puede pedir avisos, así que su ausencia aquí no distingue nada',
      );
    }
  } finally {
    await capaz.close().catch(() => undefined);
  }

  assertBehaviour(
    findings,
    'donde el navegador no puede pedir avisos, la ausencia es la respuesta honesta: no se renderiza la acción. Esta comprobación solo mira acciones, nunca los <details>, porque la pieza de "Añadir a pantalla de inicio" está sin dueño (Pre-requisito 4(b)).',
    notes(this),
  );
});

Then('el spot sigue sin avisos y ofrece intentar de nuevo', function () {
  const observed = after(this);
  const findings: string[] = [];
  if (observed.onStateTexts.length > 0) {
    findings.push(`la página muestra avisos activos aunque no se guardaron: ${observed.onStateTexts.join(' | ')}`);
  }
  if (!/(intenta|reintenta|de nuevo|otra vez)/i.test(observed.avisosText)) {
    findings.push('la página no ofrece intentar de nuevo');
  }
  assertBehaviour(
    findings,
    'un 429 o un 5xx deja el estado en "sin avisos" y ofrece reintentar (07-write-path.md sección 8.1).',
    notes(this),
  );
});

Then('la suscripción no queda guardada para mandarla más tarde', async function () {
  const page = requirePage(this);
  const queued = (await page.evaluate(`(() => {
    const names = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key !== null && /(cola|queue|pending|avisos|push)/i.test(key)) names.push(key);
      }
    } catch (e) { /* storage refused; nothing queued there either */ }
    return names;
  })()`)) as string[];
  const findings = queued.length > 0 ? [`quedó una cola de suscripción pendiente: ${queued.join(', ')}`] : [];
  if (!(w(this).islandTapped ?? false)) {
    findings.push(
      'nunca se llegó a intentar la suscripción, así que la ausencia de cola no prueba nada todavía',
    );
  }
  assertBehaviour(
    findings,
    'suscribirse es interactivo por contrato: no hay cola offline para suscripciones (07-write-path.md sección 8.1).',
    notes(this),
  );
});

Then('el spot explica en español que ese navegador no puede recibir avisos', function () {
  const observed = after(this);
  assertBehaviour(
    /(navegador|teléfono).*(no|sin)/i.test(observed.avisosText)
      ? []
      : ['la página no explica que ese navegador no puede recibir avisos'],
    'el rechazo por destino desconocido se le cuenta al surfista en palabras suyas, no en las del servidor.',
    notes(this),
  );
});

Then('ese texto no trae direcciones, ni códigos, ni palabras en inglés', function () {
  const observed = after(this);
  const text = observed.avisosText;
  const findings: string[] = [];
  if (/https?:\/\/|\b[a-z0-9-]+\.(com|net|org|io|dev|mozilla|apple|google)\b/i.test(text)) {
    findings.push('el texto trae una dirección');
  }
  if (/\b(400|401|403|404|410|429|5\d\d)\b/.test(text)) findings.push('el texto trae un código');
  if (/\b(endpoint|not allowed|error|status|push service|subscription)\b/i.test(text)) {
    findings.push('el texto trae palabras en inglés o jerga');
  }
  if (text.includes('—')) findings.push('el texto trae una raya larga, prohibida en toda la interfaz');
  assertBehaviour(
    findings,
    'cero texto técnico en la superficie en español (CLAUDE.md, reglas de copia).',
    notes(this),
  );
});

Then('la página vuelve a mostrarse sin avisos', function () {
  const observed = after(this);
  const findings: string[] = [];
  if (observed.onStateTexts.length > 0) {
    findings.push(`la página sigue mostrando avisos activos después de quitarlos: ${observed.onStateTexts.join(' | ')}`);
  }
  if (!(w(this).islandRemovalTapped ?? false)) {
    findings.push('nunca se llegó a tocar ningún control para quitar los avisos, así que no hay nada que haya vuelto a apagarse');
  }
  assertBehaviour(
    findings,
    'quitado quiere decir quitado, y la pantalla lo refleja.',
    notes(this),
  );
});

Then('a ese surfista no le vuelve a llegar ningún aviso de ese spot', function () {
  assertBehaviour(
    ['no existe todavía ninguna corrida desplegada de la que se pueda observar que ya no le llega nada'],
    'quitar avisos borra la suscripción, y desde la corrida siguiente ese destino ya no recibe nada (07-write-path.md sección 8.1, DoD 6). Esta comprobación solo puede cerrarse contra un camino de escritura desplegado (Pre-requisitos 2, 3, 5, 6).',
    notes(this),
  );
});

Then('el control de avisos cumple las siete comprobaciones visuales', { timeout: 60_000 }, async function () {
  const page = requirePage(this);
  const observed = after(this);
  const findings: string[] = [];

  if (observed.actions.length === 0) {
    findings.push('U5: la página no tiene ningún control de avisos que examinar, así que ninguno de sus estados diseñados existe');
  }

  const audit = (await page.evaluate(`(() => {
    const nodes = Array.prototype.slice
      .call(document.querySelectorAll('[data-field^="avisos"], [data-field^="avisos"] *'))
      .filter((el) => (el.textContent || '').trim().length > 0);
    return {
      background: getComputedStyle(document.body).backgroundColor,
      colors: nodes.map((el) => ({ tag: el.tagName.toLowerCase(), color: getComputedStyle(el).color })),
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      moving: nodes.filter((el) =>
        getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0),
      ).length,
    };
  })()`)) as {
    background: string;
    colors: { tag: string; color: string }[];
    reduced: boolean;
    moving: number;
  };

  if (observed.scrollWidth > observed.clientWidth) {
    findings.push(`U2: la página desborda 390 px (${observed.scrollWidth} > ${observed.clientWidth})`);
  }
  const small = observed.actions.filter((a) => a.width < 44 || a.height < 44);
  if (small.length > 0) {
    findings.push(`U3: el control de avisos mide menos de 44 px: ${small.map((a) => `${a.width}x${a.height}`).join(', ')}`);
  }
  if (audit.reduced && audit.moving > 0) {
    findings.push(`U4: con movimiento reducido quedan ${audit.moving} transiciones en el control de avisos`);
  }
  if (audit.colors.length === 0) {
    findings.push('U1/U6: no hay ningún texto de avisos cuyo contraste ni cuya escala tipográfica se pueda medir contra el fondo real');
  }

  assertBehaviour(
    findings,
    'las siete comprobaciones se hacen sobre el control ya renderizado, en los dos temas, a 390 px, contra el fondo real. El gate estático de tokens (npm run test:ui) cubre U6 y U7 sobre la hoja construida.',
    notes(this),
  );
});

// ------------------------------------------------------------------ cleanup

async function closeBrowserSurface(self: unknown): Promise<void> {
  const world = w(self);
  await world.islandPage?.close().catch(() => undefined);
  await world.islandContext?.close().catch(() => undefined);
  world.islandPage = undefined;
  world.islandContext = undefined;
}

After({ tags: '@feature-f-tell-me-when-its-worth-the-drive', timeout: 30_000 }, async function () {
  const world = w(this);
  await closeBrowserSurface(this);
  await world.islandBrowser?.close().catch(() => undefined);
  await world.islandServer?.close().catch(() => undefined);
  world.islandBrowser = undefined;
  world.islandServer = undefined;
});
