// Slice-03 acceptance steps.  The planner is driven through its declared
// production port; it is never replaced by a test-owned notification sender.
// The final journey deliberately calls the real report-boundary contract. A
// deployed write path is not available here, so the scenario remains RED at
// its own outcome oracle instead of pretending that a local substitute proves
// storage or direct-web-push delivery.

import { Given, Then, When } from '@cucumber/cucumber';

import { assertBehaviour, callDeclared } from './support/declared-surface';

type PlannedFollowup = { spot_id: string; url: string; title: string; body: string; kind?: string };
type NotifyPlan = { sends: PlannedFollowup[]; deferred: number; events: { kind: string }[] };
type StoredSub = {
  spot_id: string; endpoint_hash: string; lang: string; threshold_score: number | null;
  last_notified_date: string | null; followup_date: string | null; device_id: string;
};

const VENAO = { spot_id: 'playa-venao', slug: 'playa-venao', name: 'Playa Venao', timezone: 'America/Panama' };
const TODAY = '2026-08-10';

type World = {
  followupSub?: StoredSub;
  followupNow?: string;
  followupPlan?: NotifyPlan | null;
  followupAbsences?: string[];
  report?: { stored?: boolean; trigger?: string } | null;
  realDelivery?: { received_count?: number; url?: string } | null;
  externalNotes?: string[];
};

function w(self: unknown): World { return self as World; }
function remember(self: unknown, absence: string | null): void { if (absence) (w(self).followupAbsences ??= []).push(absence); }
function absences(self: unknown): readonly string[] { return w(self).followupAbsences ?? []; }
function external(self: unknown, note: string): void { (w(self).externalNotes ??= []).push(note); }

function subscription(overrides: Partial<StoredSub> = {}): StoredSub {
  return { spot_id: VENAO.spot_id, endpoint_hash: 'suscriptora-03', lang: 'es', threshold_score: 70,
    last_notified_date: TODAY, followup_date: null, device_id: 'telefono-03', ...overrides };
}

async function runPlanner(self: unknown): Promise<void> {
  const result = await callDeclared<NotifyPlan>('planNotifications', {
    now: w(self).followupNow ?? `${TODAY}T15:25:00-05:00`, spots: [VENAO],
    scores: { [VENAO.spot_id]: 0 }, subscriptions: [w(self).followupSub ?? subscription()], run_cap: 10_000,
  });
  w(self).followupPlan = result.value;
  remember(self, result.absence);
}

function questions(self: unknown): PlannedFollowup[] {
  return (w(self).followupPlan?.sends ?? []).filter((send) => send.url === '/spots/playa-venao/reportar?t=ps' || send.kind === 'followup');
}

Given('una surfista de Playa Venao recibió su aviso esta mañana y todavía no contó cómo estuvo hoy', function () {
  w(this).followupSub = subscription();
});
Given('una surfista de Playa Venao recibió su aviso esta mañana y ya contó cómo estuvo hoy', function () {
  w(this).followupSub = subscription({ followup_date: TODAY });
});
Given('una surfista de Playa Venao no recibió ningún aviso esta mañana', function () {
  w(this).followupSub = subscription({ last_notified_date: null });
});
Given('ahora Playa Venao está mala para surfear', function () { /* score 0 is supplied to the production port */ });
Given('en Playa Venao son las tres y veinticinco de la tarde', function () { w(this).followupNow = `${TODAY}T15:25:00-05:00`; });
Given('la tarde de Playa Venao marca {string} en su propio huso', function (hour: string) { w(this).followupNow = `${TODAY}T${hour}:00-05:00`; });
When('pasa la corrida de la tarde', async function () { await runPlanner(this); });
Then('sale una sola pregunta de cómo estuvo para esa surfista', function () {
  const found = questions(this);
  assertBehaviour(found.length === 1 ? [] : [`salieron ${found.length} preguntas donde tenía que salir una sola`],
    'la tarde solo pregunta tras un aviso de esta mañana, una vez por día, aunque el mar haya cambiado.', absences(this));
});
Then('la pregunta lleva a contar cómo estuvo Playa Venao', function () {
  const send = questions(this)[0];
  assertBehaviour(send?.url === '/spots/playa-venao/reportar?t=ps' ? [] : ['la pregunta no lleva a contar cómo estuvo Playa Venao'],
    'la pregunta abre el camino de contar cómo estuvo con la marca de que fue solicitada.', absences(this));
});
Then('no sale ninguna pregunta de cómo estuvo', function () {
  const findings = w(this).followupPlan === null || w(this).followupPlan === undefined
    ? ['la corrida no llegó a decidir nada, así que no preguntar todavía no prueba la regla']
    : questions(this).length === 0 ? [] : ['salió una pregunta de tarde cuando no correspondía'];
  assertBehaviour(findings,
    'sin aviso de la mañana, fuera de la tarde o después de ya contar, no se vuelve a preguntar.', absences(this));
});
Given('una surfista recibió la pregunta de cómo estuvo de Playa Venao', function () { /* external journey precondition */ });
Given('un teléfono real recibió el aviso de la mañana de Playa Venao', function () { /* external prerequisite, never faked */ });
When('pasa la corrida de la tarde en el sitio publicado', async function () {
  const raw = process.env.PUSH_REAL_DEVICE_FOLLOWUP_RECEIPT;
  if (raw === undefined) { external(this, 'falta el recibo del teléfono real y de la corrida desplegada'); return; }
  try { w(this).realDelivery = JSON.parse(raw) as { received_count?: number; url?: string }; }
  catch { external(this, 'el recibo del teléfono real no se pudo leer'); }
});
Then('ese teléfono recibe una sola pregunta de cómo estuvo Playa Venao', function () {
  const delivery = w(this).realDelivery;
  assertBehaviour(delivery?.received_count === 1 ? [] : ['el teléfono no recibió exactamente una pregunta de la tarde'], 'la entrega solo se prueba con el recibo del envío VAPID y teléfono reales; ninguna entrega local sustituye esa prueba.', w(this).externalNotes);
});
Then('la pregunta abre el camino de contar cómo estuvo Playa Venao', function () {
  const delivery = w(this).realDelivery;
  assertBehaviour(delivery?.url === '/spots/playa-venao/reportar?t=ps' ? [] : ['la pregunta no abrió el camino de contar cómo estuvo Playa Venao'], 'la pregunta de tarde lleva al mismo camino de reportar con la marca de que se pidió.', w(this).externalNotes);
});
When('cuenta que las olas estaban de dos a tres pies y que el viento estaba limpio', async function () {
  const raw = process.env.PUSH_REAL_SOLICITED_REPORT_RECEIPT;
  if (raw === undefined) { external(this, 'falta el recibo del reporte guardado por el sitio desplegado'); return; }
  try { w(this).report = JSON.parse(raw) as { stored?: boolean; trigger?: string }; }
  catch { external(this, 'el recibo del reporte guardado no se pudo leer'); }
});
Then('su observación queda guardada como una respuesta a la pregunta', function () {
  const result = w(this).report;
  assertBehaviour(result?.stored === true && result.trigger === 'push_solicited' ? [] : ['la observación no quedó guardada como respuesta solicitada'],
    'esta prueba solo puede volverse verde contra el límite real de guardar observaciones; no hay un sustituto local.', w(this).externalNotes);
});
