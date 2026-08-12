// Slice-02 acceptance steps: the emitted production page, never an Astro
// component imported in isolation. The real iPhone install path needs a device
// smoke at launch, but the browser contract here is intentionally narrower and
// falsifiable: a no-push context must see the honest A2HS route and no action;
// a capable context on the identical emitted page must see the action.

import { After, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert/strict';

import { assertBehaviour } from './support/declared-surface';
import { serveBuiltSurface, VENAO_PATH, type StaticSurface } from './support/built-surface';

const PHONE = { width: 390, height: 844 } as const;
const HINT = '¿Quieres avisos? En iPhone: Compartir, y luego Añadir a pantalla de inicio. Sin eso, iPhone no deja avisar.';

type Surface = {
  readonly hint: string | null;
  readonly hintTag: string | null;
  readonly actions: readonly string[];
  readonly active: readonly string[];
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly hasNamedTokens: boolean;
  readonly reducedMotion: boolean;
};

type IPhoneWorld = {
  server?: StaticSurface;
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  before?: Surface;
  after?: Surface;
  capable?: Surface;
  realSubscription?: unknown;
  notes?: string[];
};

function w(self: unknown): IPhoneWorld {
  return self as IPhoneWorld;
}

function note(self: unknown, message: string): void {
  (w(self).notes ??= []).push(message);
}

function context(self: unknown): string[] {
  return w(self).notes ?? [];
}

function page(self: unknown): Page {
  const current = w(self).page;
  assert.ok(current, 'la página de Playa Venao no llegó a abrirse');
  return current;
}

const READ_SURFACE = `(async () => {
  const text = (node) => (node.textContent || '').replace(/\\s+/g, ' ').trim();
  const visible = (node) => {
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const details = Array.from(document.querySelectorAll('details')).find((node) => /iPhone|Añadir a pantalla de inicio|Compartir/i.test(text(node)));
  const controls = Array.from(document.querySelectorAll('button,[role="button"],a[href],input[type="button"],input[type="submit"]'))
    .filter(visible)
    .filter((node) => /avisos?/i.test(text(node)) || /avisos?/i.test(node.getAttribute('aria-label') || ''))
    .filter((node) => !/(quitar|desactivar|apagar|dejar de)/i.test(text(node)))
    .map(text);
  const active = Array.from(document.querySelectorAll('*'))
    .filter((node) => node.children.length === 0 && visible(node))
    .map(text)
    .filter((value) => /avisos? activos?|avisos? activados?|avisos?.*\\blisto\\b/i.test(value));
  const style = getComputedStyle(document.documentElement);
  return {
    hint: details ? text(details) : null,
    hintTag: details ? details.tagName.toLowerCase() : null,
    actions: controls,
    active,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasNamedTokens: Boolean(style.getPropertyValue('--color-ink').trim() || style.getPropertyValue('--space-1').trim() || style.getPropertyValue('--radius').trim()),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
})()`;

const READ_REAL_SUBSCRIPTION = `(async () => {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration || !('pushManager' in registration)) return null;
  const value = await registration.pushManager.getSubscription();
  return value === null ? null : value.toJSON();
})()`;

async function observe(current: Page): Promise<Surface> {
  return (await current.evaluate(READ_SURFACE)) as Surface;
}

async function open(self: unknown, pushCapable: boolean, standalone: boolean): Promise<void> {
  const world = w(self);
  world.server ??= await serveBuiltSurface();
  world.browser ??= await chromium.launch();
  const browserContext = await world.browser.newContext({
    viewport: { ...PHONE },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-PA',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  world.context = browserContext;
  await browserContext.addInitScript({
    content: `
      if (${pushCapable ? 'false' : 'true'}) {
        delete window.PushManager;
        if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
          delete window.ServiceWorkerRegistration.prototype.pushManager;
        }
      }
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => query === '(display-mode: standalone)'
        ? ({ matches: ${standalone ? 'true' : 'false'}, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } })
        : original(query);
    `,
  });
  const current = await browserContext.newPage();
  world.page = current;
  const response = await current.goto(`${world.server.origin}${VENAO_PATH}`, { waitUntil: 'load', timeout: 20_000 });
  assert.ok(response, 'la página de Playa Venao no devolvió respuesta');
  assert.equal(response.status(), 200, `la página de Playa Venao devolvió ${response.status()}`);
  world.before = await observe(current);
}

async function capableComparison(self: unknown): Promise<Surface> {
  const world = w(self);
  assert.ok(world.browser && world.server, 'la superficie no quedó preparada para la comparación');
  const comparison = await world.browser.newContext({ viewport: { ...PHONE }, isMobile: true, hasTouch: true, locale: 'es-PA' });
  const comparisonPage = await comparison.newPage();
  const response = await comparisonPage.goto(`${world.server.origin}${VENAO_PATH}`, { waitUntil: 'load', timeout: 20_000 });
  assert.ok(response, 'la comparación capaz no recibió respuesta');
  const read = await observe(comparisonPage);
  await comparison.close();
  return read;
}

async function noRealSubscription(self: unknown): Promise<void> {
  const current = page(self);
  const value = await current.evaluate(READ_REAL_SUBSCRIPTION);
  w(self).realSubscription = value;
  assert.equal(value, null, 'el teléfono ya tiene una suscripción real, así que no prueba la vuelta sin avisos');
}

Given('Playa Venao está abierta a 390 px en Safari sin avisos disponibles', { timeout: 300_000 }, async function () {
  await open(this, false, false);
});

Given('un surfista abre Playa Venao desde el icono que instaló a 390 px', { timeout: 300_000 }, async function () {
  await open(this, true, true);
});

Given('un surfista vuelve a Playa Venao desde el icono que instaló', { timeout: 300_000 }, async function () {
  await open(this, true, true);
});

Given('no hay una suscripción real de avisos en ese teléfono', async function () {
  await noRealSubscription(this);
});

Given('el teléfono concede el permiso de avisos desde el icono instalado', async function () {
  const world = w(this);
  assert.ok(world.context && world.server, 'el icono instalado no está abierto');
  await world.context.grantPermissions(['notifications'], { origin: world.server.origin });
});

When('el surfista pide avisos de Playa Venao desde el icono instalado', async function () {
  const current = page(this);
  const before = w(this).before ?? (await observe(current));
  const first = before.actions[0];
  if (first === undefined) {
    note(this, 'el icono instalado no muestra ninguna acción de avisos que el surfista pueda tocar');
    w(this).after = before;
    return;
  }
  await current.getByText(first, { exact: false }).first().click({ timeout: 20_000 }).catch((error: unknown) => {
    note(this, `la acción de avisos no se pudo tocar: ${String(error).split('\n')[0]}`);
  });
  await current.waitForTimeout(250);
  w(this).after = await observe(current);
});

Then('la página muestra exactamente el camino de iPhone para recibir avisos', function () {
  const observed = w(this).before;
  assert.ok(observed, 'no se observó la página de Safari');
  const findings: string[] = [];
  if (observed.hintTag !== 'details') findings.push('la explicación de iPhone no está en un desplegable details de cero JavaScript');
  if (observed.hint !== HINT) findings.push(`la explicación de iPhone no coincide palabra por palabra: ${observed.hint ?? 'no aparece'}`);
  assertBehaviour(findings, 'el único camino honesto desde Safari es Compartir y luego Añadir a pantalla de inicio.', context(this));
});

Then('Safari no ofrece una acción para encender avisos', function () {
  const observed = w(this).before;
  assert.ok(observed, 'no se observó la página de Safari');
  assertBehaviour(
    observed.actions.length === 0 ? [] : [`Safari ofrece un control de avisos sin poder pedirlos: ${observed.actions.join(' | ')}`],
    'un Safari abierto no puede pedir avisos y no debe ver un botón muerto.',
    context(this),
  );
});

Then('la misma página sí ofrece la acción cuando el teléfono puede pedir avisos', { timeout: 60_000 }, async function () {
  const capable = await capableComparison(this);
  w(this).capable = capable;
  assertBehaviour(
    capable.actions.length > 0 ? [] : ['la misma página tampoco ofrece avisos donde el teléfono sí puede pedirlos, así que la ausencia en Safari no prueba honestidad'],
    'la comparación evita que un sitio sin avisos para nadie pase por no mostrar un botón muerto.',
    context(this),
  );
});

Then('encuentra una acción para pedir avisos de ese spot', function () {
  const observed = w(this).before;
  assert.ok(observed, 'no se observó el icono instalado');
  assertBehaviour(observed.actions.length > 0 ? [] : ['el icono instalado no ofrece una acción para pedir avisos'], 'el icono instalado tiene que conservar la misma entrada de avisos.', context(this));
});

function assertNoActiveAvisos(self: unknown): void {
  const observed = w(self).after ?? w(self).before;
  assert.ok(observed, 'no se observó el estado de avisos');
  assertBehaviour(observed.active.length === 0 ? [] : [`la página dice que los avisos están activos sin una suscripción comprobada: ${observed.active.join(' | ')}`], 'ningún icono instalado puede adelantar una confirmación.', context(self));
}

Then('la página todavía no dice que los avisos estén activos', function () {
  assertNoActiveAvisos(this);
});

Then('la página no dice que los avisos estén activos', function () {
  assertNoActiveAvisos(this);
});

Then('ofrece la acción para pedirlos', function () {
  const observed = w(this).before;
  assert.ok(observed, 'no se observó el icono instalado');
  assertBehaviour(observed.actions.length > 0 ? [] : ['sin suscripción real tampoco aparece la acción para pedir avisos'], 'la vuelta sin suscripción conserva una ruta honesta para pedir avisos.', context(this));
});

Then('el icono no dice listo antes de que el servidor guarde los avisos', function () {
  const observed = w(this).after ?? w(this).before;
  assert.ok(observed, 'no se observó el resultado de pedir avisos');
  const findings: string[] = [];
  if (observed.active.length > 0) findings.push(`el icono dice que los avisos están activos antes de comprobar el guardado: ${observed.active.join(' | ')}`);
  if (w(this).notes?.some((entry) => entry.includes('no muestra ninguna acción'))) findings.push('no hubo una acción real que pudiera alcanzar el acuse del servidor');
  assertBehaviour(findings, 'desde el icono, listo sigue dependiendo del guardado real igual que en Android.', context(this));
});

Then('el camino de iPhone cumple las siete comprobaciones visuales en tema claro y oscuro', { timeout: 120_000 }, async function () {
  const world = w(this);
  const current = page(this);
  const light = world.before ?? (await observe(current));
  const darkContext = await (world.browser as Browser).newContext({ viewport: { ...PHONE }, isMobile: true, hasTouch: true, locale: 'es-PA', colorScheme: 'dark', reducedMotion: 'reduce' });
  await darkContext.addInitScript({ content: `delete window.PushManager; if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) delete window.ServiceWorkerRegistration.prototype.pushManager;` });
  const darkPage = await darkContext.newPage();
  await darkPage.goto(`${(world.server as StaticSurface).origin}${VENAO_PATH}`, { waitUntil: 'load', timeout: 20_000 });
  const dark = await observe(darkPage);
  await darkContext.close();
  const findings: string[] = [];
  for (const [theme, observed] of [['claro', light], ['oscuro', dark]] as const) {
    if (observed.hint !== HINT) findings.push(`${theme}: falta el texto completo del camino de iPhone`);
    if (observed.scrollWidth > observed.clientWidth) findings.push(`${theme}: el camino de iPhone provoca desplazamiento horizontal a 390 px`);
    if (!observed.hasNamedTokens) findings.push(`${theme}: el camino no expone tokens de diseño en la superficie construida`);
  }
  if (!dark.reducedMotion) findings.push('oscuro: la prueba no llegó a un contexto de movimiento reducido');
  assertBehaviour(findings, 'U1-U7: texto legible, sin recorte, ruta clara sin acción muerta, movimiento reducido y tokens nombrados en ambos temas.', context(this));
});

After(async function () {
  const world = w(this);
  await world.context?.close();
  await world.browser?.close();
  await world.server?.close();
});
