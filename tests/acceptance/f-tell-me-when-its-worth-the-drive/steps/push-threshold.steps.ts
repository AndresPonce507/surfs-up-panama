// Slice-04 acceptance steps. Updates drive the existing idempotent
// decideSubscribe production port. Later-send and return-page outcomes drive
// their real ports too; no local flag or test sender is accepted as evidence.

import { Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

import { assertBehaviour, callDeclared } from './support/declared-surface';
import { serveBuiltSurface, VENAO_PATH, type StaticSurface } from './support/built-surface';

type StoredSub = { spot_id: string; endpoint_hash: string; lang: string; threshold_score: number | null; last_notified_date: string | null; followup_date: string | null; device_id: string };
type Decision = { outcome: string; stored: StoredSub[]; rejection: unknown };
type Plan = { sends: { endpoint_hash: string }[] };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/threshold-device';
const VENAO = { spot_id: 'playa-venao', slug: 'playa-venao', name: 'Playa Venao', timezone: 'America/Panama' };
const ALLOWLIST = ['fcm.googleapis.com'];

type ReadSubscription = { active: boolean; threshold_score: number | null; browser_subscription: boolean };
type Visual = { width: number; client: number; text: string; tokens: Record<string, string>; control?: { width: number; height: number; color: string; background: string; transition: string; lineHeight: string; labelOverflow: boolean } | null; reduced: boolean; states: string[]; contrast: number; tokenBacked: boolean };
type World = { prior?: StoredSub[]; decision?: Decision | null; plan?: Plan | null; absences?: string[]; browser?: Browser; page?: Page; server?: StaticSurface; seenBar?: string | null; returned?: ReadSubscription | null; visual?: Visual | null; externalNotes?: string[] };
function w(self: unknown): World { return self as World; }
function note(self: unknown, absence: string | null): void { if (absence) (w(self).absences ??= []).push(absence); }
function absences(self: unknown): readonly string[] { return w(self).absences ?? []; }
function external(self: unknown, note: string): void { (w(self).externalNotes ??= []).push(note); }
function before(bar: number | null = 70): StoredSub[] { return [
  { spot_id: VENAO.spot_id, endpoint_hash: createHash('sha256').update(ENDPOINT).digest('hex').slice(0, 32), lang: 'es', threshold_score: bar, last_notified_date: '2026-08-10', followup_date: '2026-08-09', device_id: 'telefono-04' },
  { spot_id: 'otro-spot', endpoint_hash: 'ajena', lang: 'es', threshold_score: 42, last_notified_date: null, followup_date: null, device_id: 'otro-telefono' },
]; }
async function choose(self: unknown, raw: number | undefined): Promise<void> {
  const result = await callDeclared<Decision>('decideSubscribe', { action: 'subscribe', spot_id: VENAO.spot_id,
    subscription: { endpoint: ENDPOINT, keys: { p256dh: 'clave', auth: 'auth' } }, lang: 'es', threshold_score: raw,
    device_id: 'telefono-04', now: '2026-08-10T07:25:00-05:00', existing: w(self).prior ?? before(), writes_today: 0, allowlist: ALLOWLIST });
  w(self).decision = result.value; note(self, result.absence);
}
async function later(self: unknown, score: number): Promise<void> {
  const result = await callDeclared<Plan>('planNotifications', { now: '2026-08-10T07:25:00-05:00', spots: [VENAO], scores: { [VENAO.spot_id]: score }, subscriptions: w(self).decision?.stored ?? [], run_cap: 10_000 });
  w(self).plan = result.value; note(self, result.absence);
}

Given('una surfista de Playa Venao con avisos guardados elige la barra {int}', async function (bar: number) { w(this).prior = before(); await choose(this, bar); });
Given('una surfista de Playa Venao con avisos guardados', function () { w(this).prior = before(67); });
Given('en Playa Venao son las siete y veinticinco de la mañana', function () { /* declared at later-send port */ });
When('la mañana puntúa {int}', async function (score: number) { await later(this, score); });
Then('sus avisos guardados conservan exactamente la barra {int}', function (bar: number) {
  const stored = w(this).decision?.stored ?? [];
  const mine = stored.filter((sub) => sub.spot_id === VENAO.spot_id && sub.device_id === 'telefono-04');
  const other = stored.find((sub) => sub.spot_id === 'otro-spot');
  const findings: string[] = [];
  if (mine.length !== 1) findings.push(`quedaron ${mine.length} avisos de Playa Venao donde tenía que quedar uno`);
  if (mine[0]?.threshold_score !== bar) findings.push(`la barra guardada es ${String(mine[0]?.threshold_score)} y no ${bar}`);
  if (mine[0]?.last_notified_date !== '2026-08-10' || mine[0]?.followup_date !== '2026-08-09') findings.push('cambiar la barra borró el historial de aviso o de pregunta');
  if (other?.threshold_score !== 42 || other?.device_id !== 'otro-telefono') findings.push('cambiar Playa Venao alteró los avisos de otro spot');
  assertBehaviour(findings, 'volver a pedir avisos actualiza la misma suscripción con el número entero exacto, sin tocar sus fechas ni los avisos ajenos.', absences(this));
});
Then('no sale ningún aviso para esa surfista', function () {
  const plan = w(this).plan;
  assertBehaviour(plan === null || plan === undefined ? ['la mañana no llegó a decidir nada, así que no avisar todavía no prueba la barra'] : plan.sends.length === 0 ? [] : ['salió un aviso por debajo de la barra elegida'], 'la barra propia gobierna las mañanas posteriores.', absences(this));
});
Then('sale exactamente un aviso para esa surfista', function () { assertBehaviour((w(this).plan?.sends.length ?? 0) === 1 ? [] : [`salieron ${w(this).plan?.sends.length ?? 0} avisos donde tenía que salir uno`], 'la mañana que alcanza la barra exacta sí avisa.', absences(this)); });
When('intenta elegir la barra {string}', async function (raw: string) { await choose(this, Number(raw)); });
Then('sus avisos guardados conservan la barra que tenían antes', function () { const actual = w(this).decision?.stored.find((sub) => sub.spot_id === VENAO.spot_id)?.threshold_score; assertBehaviour(actual === 67 ? [] : ['una barra inválida cambió los avisos guardados'], 'solo un número entero entre 0 y 100 puede cambiar la barra.', absences(this)); });
Then('la página le explica en español que elija un número entero entre 0 y 100', function () {
  const rejection = w(this).decision?.rejection as { what?: string; why?: string; how?: string } | null | undefined;
  const words = [rejection?.what, rejection?.why, rejection?.how].filter((value): value is string => typeof value === 'string').join(' ');
  const explainsRange = /entero/i.test(words) && /0/.test(words) && /100/.test(words) && !/\b(api|http|json|error|status)\b/i.test(words);
  assertBehaviour(w(this).decision?.outcome === 'rejected' && explainsRange ? [] : ['la elección inválida no fue rechazada con una explicación en español de la escala'], 'la escala protege una elección que el aviso pueda respetar.', absences(this));
});

Given('una visita anterior dejó recordada la barra 88', function () { /* planted only as a hostile client memory */ });
Given('los avisos guardados de verdad dicen que la barra es 67', function () { /* requires deployed subscription read boundary */ });
When('la surfista vuelve a abrir Playa Venao', async function () {
  try {
    w(this).server = await serveBuiltSurface(); w(this).browser = await chromium.launch();
    const page = await w(this).browser!.newPage({ viewport: { width: 390, height: 844 } }); w(this).page = page;
    await page.addInitScript(() => localStorage.setItem('push-threshold', '88'));
    await page.goto(`${w(this).server!.origin}${VENAO_PATH}`, { waitUntil: 'load' });
    w(this).seenBar = await page.locator('body').textContent();
  } catch (error) { note(this, `la superficie publicada no quedó disponible: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
  const receipt = process.env.PUSH_REAL_SUBSCRIPTION_RECEIPT;
  if (receipt === undefined) external(this, 'falta el recibo de la suscripción activa en el sitio desplegado');
  else try { w(this).returned = JSON.parse(receipt) as ReadSubscription; } catch { external(this, 'el recibo de la suscripción activa no se pudo leer'); }
});
Then('la página muestra la barra 67', function () { const returned = w(this).returned; assertBehaviour(returned?.active === true && returned.browser_subscription === true && returned.threshold_score === 67 && /\b67\b/.test(w(this).seenBar ?? '') ? [] : ['la página no muestra la barra de la suscripción activa guardada de verdad'], 'el regreso debe comparar el recibo de la suscripción activa del sitio desplegado con lo que muestra la página, no una marca del teléfono.', [...absences(this), ...(w(this).externalNotes ?? [])]); });
Then('la página no muestra la barra 88', function () { const returned = w(this).returned; assertBehaviour(returned?.threshold_score === 67 && !/\b88\b/.test(w(this).seenBar ?? '') ? [] : ['la página repite la barra recordada del teléfono'], 'un recuerdo local nunca prueba qué avisos siguen guardados.', [...absences(this), ...(w(this).externalNotes ?? [])]); });

Given('Playa Venao está abierta a 390 px con tema {string} y movimiento {string}', async function (theme: string, motion: string) {
  try {
    w(this).server = await serveBuiltSurface(); w(this).browser = await chromium.launch();
    const context = await w(this).browser!.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme === 'oscuro' ? 'dark' : 'light', reducedMotion: motion === 'reducido' ? 'reduce' : 'no-preference' });
    w(this).page = await context.newPage(); await w(this).page!.goto(`${w(this).server!.origin}${VENAO_PATH}`, { waitUntil: 'load' });
  } catch (error) { note(this, `la superficie publicada no quedó disponible: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
});
When('la surfista abre la elección de su barra', async function () {
  const page = w(this).page;
  if (page === undefined) return;
  w(this).visual = await page.evaluate(() => {
    const control = Array.from(document.querySelectorAll('input[type="number"], input[type="range"], select, [data-field*="threshold"], [data-field*="barra"]')).find((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const r = control?.getBoundingClientRect(); const cs = control ? getComputedStyle(control) : null; const root = getComputedStyle(document.documentElement);
    const rgb = (value: string): number[] => (value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
    const luminance = (value: string): number => rgb(value).map((n: number) => n / 255).map((n: number) => n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum: number, n: number, i: number) => sum + n * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const label = control?.closest('label') || control?.parentElement;
    const labelOverflow = label ? label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight * 2 : true;
    const className = control?.getAttribute('class') || '';
    const tokenBacked = Array.from(document.styleSheets).some((sheet) => { try { return Array.from(sheet.cssRules).some((rule) => rule.cssText.includes('--color-') && rule.cssText.includes('--space-') && rule.cssText.includes('--radius') && (className === '' || rule.cssText.includes(className.split(' ')[0] || ''))); } catch { return false; } });
    const contrast = r && cs ? (Math.max(luminance(cs.color), luminance(cs.backgroundColor)) + 0.05) / (Math.min(luminance(cs.color), luminance(cs.backgroundColor)) + 0.05) : 0;
    return { width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, text: document.body.textContent ?? '', tokens: { ink: root.getPropertyValue('--color-ink'), space: root.getPropertyValue('--space-1'), radius: root.getPropertyValue('--radius') }, control: r && cs ? { width: r.width, height: r.height, color: cs.color, background: cs.backgroundColor, transition: cs.transitionDuration, lineHeight: cs.lineHeight, labelOverflow } : null, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, states: Array.from(document.querySelectorAll('[data-state], [role="alert"]')).map((node) => `${node.getAttribute('data-state') ?? ''} ${node.textContent ?? ''}`), contrast, tokenBacked };
  }) as Visual;
});
Then('la elección de la barra cumple las siete comprobaciones visuales', async function () {
  const page = w(this).page;
  if (page === undefined) {
    assertBehaviour(['la superficie construida no llegó a ofrecer una elección de barra'], 'la elección debe existir en la superficie construida antes de que sus estados visuales puedan pasar.', absences(this));
    return;
  }
  const data = w(this).visual;
  const findings: string[] = [];
  if (data === null || data === undefined) findings.push('la página no ofrece una elección de barra terminada para examinar');
  else {
    if (!data.control || data.contrast < 4.5) findings.push('U1: la elección no alcanza contraste AA contra su fondo real');
    if (data.width > data.client) findings.push('U2: la elección hace que la página se desplace de lado');
    if (!data.control || data.control.width < 44 || data.control.height < 44) findings.push('U3: la elección no alcanza un toque cómodo de 44 px');
    if (data.reduced && data.control?.transition !== '0s') findings.push('U4: el movimiento reducido no tiene una salida comprobable');
    const stateWords = data.states.join(' ').toLowerCase();
    if (!/guardad|listo/.test(stateWords) || !/inválid|entero/.test(stateWords) || !/sin avisos|no.*avisos/.test(stateWords)) findings.push('U5: faltan estados diseñados de guardado, elección inválida y sin avisos');
    if (!/barra|puntaje/i.test(data.text) || !data.control || data.control.labelOverflow || data.control.lineHeight === 'normal') findings.push('U6: la escala no conserva tipografía y texto sin cortar');
    if (!(data.tokens.ink ?? '').trim() || !(data.tokens.space ?? '').trim() || !(data.tokens.radius ?? '').trim() || !data.tokenBacked) findings.push('U7: la elección no traza color, espacio y radio a tokens declarados');
  }
  assertBehaviour(findings, 'la elección debe existir en la superficie construida con las siete comprobaciones antes de que sus estados visuales puedan pasar.', absences(this));
});
