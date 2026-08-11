// Slice-01 acceptance steps for the two server-side decisions: what the write
// surface decides when someone asks for avisos, and what the hourly run decides
// to send.
//
// Both are driven as PURE decisions, which is what the accepted architecture
// already declares them to be: 07-write-path.md section 10's component table
// lists `decide_subscribe` and `plan_notifications` as pure-function contracts
// whose declared effect universe is "none — returns a Plan value (writes to
// make + response), never executes". So there is no store to stand up and no
// endpoint to fake here: the scenarios hand the decision its declared inputs
// and read the plan it returns.
//
// THE CLOCK IS AN INPUT, NEVER AN AMBIENT READ
// --------------------------------------------
// `now` is passed in every call (src/pipeline/ports.ts house rule, clause
// contract:declared-inputs-not-ambient-reads). That is the whole reason a
// morning window can be tested at any hour of the day.
//
// THE BAR IS NEVER PINNED TO A NUMBER
// -----------------------------------
// Nobody has decided the score at which a push fires. 07-write-path.md says so
// in its own "What I am unsure about" item 4: the default 70 carried by the
// design "is an unfit prior; no research names the right default". Every bar
// that appears below is the bar of THAT scenario's subscriber, supplied by the
// scenario as declared fixture data. What is asserted is the law the design
// does fix, `score >= bar`, at three different bars, plus the fact that a
// subscriber who chose no bar is still governed by one single cut point
// somewhere in the scale. Ratifying any value leaves every assertion here
// untouched.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { assertBehaviour, callDeclared } from './support/declared-surface';

// ------------------------------------------------------- declared contracts

/** What the write surface leaves stored, as the plan reports it. */
type StoredSub = {
  spot_id: string;
  endpoint_hash: string;
  lang: string;
  threshold_score: number | null;
  last_notified_date: string | null;
  followup_date: string | null;
  device_id: string;
};

type SubscribeDecision = {
  outcome: 'subscribed' | 'unsubscribed' | 'rejected';
  stored: StoredSub[];
  rejection: { what?: string; why?: string; how?: string; reason?: string } | null;
};

type PlannedSend = {
  spot_id: string;
  endpoint_hash: string;
  lang: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl_seconds: number;
};

type NotifyPlan = {
  sends: PlannedSend[];
  deferred: number;
  events: { kind: string; deferred?: number }[];
};

type SendReactions = {
  deletions: string[];
  events: { kind: string }[];
};

const VENAO = { spot_id: 'playa-venao', slug: 'playa-venao', name: 'Playa Venao', timezone: 'America/Panama' };
/** Fixed offset, six hours ahead of Panama, so no daylight rule can move it. */
const LEJOS = { spot_id: 'spot-lejano', slug: 'spot-lejano', name: 'Spot Lejano', timezone: 'Etc/GMT-1' };
const TODAY = '2026-08-10';
const ALLOWLIST = ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com'];
const DEVICE = 'dispositivo-de-prueba';
/** Scenario harness data, never a product-ratified server threshold. */
const HARNESS_DEFAULT_THRESHOLD_SCORE = 55;

function sub(overrides: Partial<StoredSub> = {}): StoredSub {
  return {
    spot_id: VENAO.spot_id,
    endpoint_hash: 'suscriptor-1',
    lang: 'es',
    threshold_score: null,
    last_notified_date: null,
    followup_date: null,
    device_id: DEVICE,
    ...overrides,
  };
}

/** A Panama-local wall clock turned into the instant the run receives. */
function panamaLocal(hhmm: string): string {
  return `${TODAY}T${hhmm}:00-05:00`;
}

// -------------------------------------------------------------------- world

type ServerWorld = {
  pushSubs?: StoredSub[];
  pushSpots?: typeof VENAO[];
  pushScores?: Record<string, number>;
  pushNow?: string;
  pushRunCap?: number;
  pushDecision?: SubscribeDecision | null;
  pushPlan?: NotifyPlan | null;
  pushSweep?: { score: number; sent: boolean }[];
  pushReactions?: SendReactions | null;
  pushAbsences?: (string | null)[];
  pushRequest?: Record<string, unknown>;
  pushWritesToday?: number;
};

function w(self: unknown): ServerWorld {
  return self as ServerWorld;
}

function absences(self: unknown): (string | null)[] {
  return w(self).pushAbsences ?? [];
}

function record(self: unknown, absence: string | null): void {
  (w(self).pushAbsences ??= []).push(absence);
}

async function decide(self: unknown, request: Record<string, unknown>): Promise<void> {
  const world = w(self);
  world.pushRequest = request;
  const call = await callDeclared<SubscribeDecision>('decideSubscribe', request);
  world.pushDecision = call.value;
  record(self, call.absence);
}

async function plan(self: unknown, overrides: Record<string, unknown> = {}): Promise<NotifyPlan | null> {
  const world = w(self);
  const call = await callDeclared<NotifyPlan>('planNotifications', {
    now: world.pushNow ?? panamaLocal('07:25'),
    spots: world.pushSpots ?? [VENAO],
    scores: world.pushScores ?? {},
    subscriptions: world.pushSubs ?? [],
    default_threshold_score: HARNESS_DEFAULT_THRESHOLD_SCORE,
    run_cap: world.pushRunCap ?? 10_000,
    ...overrides,
  });
  record(self, call.absence);
  return call.value;
}

function sends(self: unknown): PlannedSend[] {
  return w(self).pushPlan?.sends ?? [];
}

// ----------------------------------------------- la suscripción guardada

Given(
  'un surfista que pide avisos de Playa Venao en español desde su teléfono',
  async function () {
    await decide(this, {
      action: 'subscribe',
      spot_id: VENAO.spot_id,
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/token-de-prueba',
        keys: { p256dh: 'clave-publica', auth: 'clave-auth' },
      },
      lang: 'es',
      device_id: DEVICE,
      now: panamaLocal('18:00'),
      existing: [],
      writes_today: 0,
      allowlist: ALLOWLIST,
    });
    w(this).pushSubs = w(this).pushDecision?.stored ?? [];
  },
);

When('ese mismo teléfono vuelve a pedir avisos del mismo spot', async function () {
  await decide(this, {
    action: 'subscribe',
    spot_id: VENAO.spot_id,
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-de-prueba',
      keys: { p256dh: 'clave-publica', auth: 'clave-auth' },
    },
    lang: 'es',
    device_id: DEVICE,
    now: panamaLocal('18:05'),
    existing: w(this).pushSubs ?? [],
    writes_today: 1,
    allowlist: ALLOWLIST,
  });
});

Then('queda una sola suscripción para ese spot y ese teléfono', function () {
  const stored = w(this).pushDecision?.stored ?? [];
  const mine = stored.filter((s) => s.spot_id === VENAO.spot_id && s.device_id === DEVICE);
  assertBehaviour(
    mine.length === 1 ? [] : [`quedaron ${mine.length} suscripciones donde tiene que quedar exactamente una`],
    'la identidad es (spot_id, endpoint_hash) y pedirlo de nuevo actualiza esa misma fila, no crea otra (07-write-path.md sección 8.1).',
    absences(this),
  );
});

Then(
  'esa suscripción guarda el idioma del surfista, su barra, el día del último aviso, el día del último seguimiento, y de qué teléfono vino',
  function () {
    const stored = (w(this).pushDecision?.stored ?? [])[0];
    const missing = stored === undefined
      ? ['no quedó ninguna suscripción guardada']
      : (['lang', 'threshold_score', 'last_notified_date', 'followup_date', 'device_id'] as const)
        .filter((field) => !(field in stored))
        .map((field) => `la suscripción no guarda ${field}`);
    assertBehaviour(
      missing,
      'los cinco atributos tienen consumidor nombrado: el idioma compone la copia del aviso, la barra decide el envío, las dos fechas hacen el tope de uno al día y el seguimiento, y el teléfono permite la limpieza (07-write-path.md sección 8.1).',
      absences(this),
    );
  },
);

Given(
  'un surfista que pide avisos de Playa Venao desde un destino que no es de ningún servicio de avisos conocido',
  async function () {
    await decide(this, {
      action: 'subscribe',
      spot_id: VENAO.spot_id,
      subscription: {
        endpoint: 'https://servidor-de-la-victima.example/recibe',
        keys: { p256dh: 'clave-publica', auth: 'clave-auth' },
      },
      lang: 'es',
      device_id: DEVICE,
      now: panamaLocal('18:00'),
      existing: [],
      writes_today: 0,
      allowlist: ALLOWLIST,
    });
  },
);

Given(
  'un surfista que pide avisos de Playa Venao desde un destino sin conexión segura',
  async function () {
    await decide(this, {
      action: 'subscribe',
      spot_id: VENAO.spot_id,
      subscription: {
        endpoint: 'http://fcm.googleapis.com/fcm/send/token-de-prueba',
        keys: { p256dh: 'clave-publica', auth: 'clave-auth' },
      },
      lang: 'es',
      device_id: DEVICE,
      now: panamaLocal('18:00'),
      existing: [],
      writes_today: 0,
      allowlist: ALLOWLIST,
    });
  },
);

Then('el servidor rechaza la petición', function () {
  const decision = w(this).pushDecision;
  assertBehaviour(
    decision?.outcome === 'rejected' ? [] : [`el servidor contestó ${decision?.outcome ?? 'nada'} donde tenía que rechazar`],
    'sin lista de destinos permitidos, la corrida se vuelve un lanzador de tráfico contra la dirección que le pongan (adr-push-vapid-direct.md, alternativa rechazada).',
    absences(this),
  );
});

Then('el rechazo nombra el destino, dice por qué se rechaza, y dice cómo suscribirse de verdad', function () {
  const rejection = w(this).pushDecision?.rejection ?? null;
  const joined = JSON.stringify(rejection ?? {});
  const findings: string[] = [];
  if (rejection === null) findings.push('el rechazo no trae ninguna explicación');
  if (!/servidor-de-la-victima\.example/.test(joined)) findings.push('el rechazo no nombra el destino que rechazó');
  if (rejection !== null && (rejection.why ?? '').trim() === '') findings.push('el rechazo no dice por qué');
  if (rejection !== null && (rejection.how ?? '').trim() === '') findings.push('el rechazo no dice cómo suscribirse de verdad');
  assertBehaviour(
    findings,
    'el rechazo es ruidoso y nombra el host, porque así el hueco de la lista se auto-reporta en vez de dejar a un navegador nuevo fuera en silencio (07-write-path.md sección 8.4).',
    absences(this),
  );
});

Then('nada queda guardado', function () {
  const decision = w(this).pushDecision;
  const findings: string[] = [];
  if (decision === null || decision === undefined) {
    findings.push('el servidor no llegó a decidir nada, así que un cero de suscripciones guardadas todavía no prueba la regla');
  } else if (decision.stored.length !== 0) {
    findings.push(`quedaron ${decision.stored.length} suscripciones guardadas después de un rechazo`);
  }
  assertBehaviour(findings, 'un rechazo no escribe.', absences(this));
});

Given('un teléfono que ya usó su cupo de escrituras de suscripción del día', function () {
  w(this).pushWritesToday = 20;
});

When('ese teléfono pide avisos de Playa Venao una vez más', async function () {
  await decide(this, {
    action: 'subscribe',
    spot_id: VENAO.spot_id,
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/token-de-prueba',
      keys: { p256dh: 'clave-publica', auth: 'clave-auth' },
    },
    lang: 'es',
    device_id: DEVICE,
    now: panamaLocal('18:00'),
    existing: [],
    writes_today: w(this).pushWritesToday ?? 20,
    allowlist: ALLOWLIST,
  });
});

Then('el servidor rechaza la petición por cupo del día', function () {
  const decision = w(this).pushDecision;
  const joined = JSON.stringify(decision?.rejection ?? {});
  const findings: string[] = [];
  if (decision?.outcome !== 'rejected') findings.push(`el servidor contestó ${decision?.outcome ?? 'nada'} donde tenía que rechazar por cupo`);
  if (!/cupo|quota|l[íi]mite/i.test(joined)) findings.push('el rechazo no dice que fue por el cupo del día');
  assertBehaviour(
    findings,
    'cupo de 20 escrituras de suscripción por día por dispositivo (07-write-path.md sección 8.4).',
    absences(this),
  );
});

Given('un surfista que ya quitó sus avisos de Playa Venao', async function () {
  await decide(this, {
    action: 'unsubscribe',
    spot_id: VENAO.spot_id,
    endpoint: 'https://fcm.googleapis.com/fcm/send/token-de-prueba',
    device_id: DEVICE,
    now: panamaLocal('18:00'),
    existing: [],
    writes_today: 1,
    allowlist: ALLOWLIST,
  });
});

When('ese mismo surfista vuelve a quitarlos', async function () {
  await decide(this, {
    action: 'unsubscribe',
    spot_id: VENAO.spot_id,
    endpoint: 'https://fcm.googleapis.com/fcm/send/token-de-prueba',
    device_id: DEVICE,
    now: panamaLocal('18:01'),
    existing: [],
    writes_today: 2,
    allowlist: ALLOWLIST,
  });
});

Then('el servidor responde que quedó sin avisos, sin tratarlo como un error', function () {
  const decision = w(this).pushDecision;
  assertBehaviour(
    decision?.outcome === 'unsubscribed'
      ? []
      : [`el servidor contestó ${decision?.outcome ?? 'nada'} al quitar algo que ya no estaba`],
    'quitar es idempotente por contrato (07-write-path.md sección 8.1).',
    absences(this),
  );
});

// -------------------------------------------------------- el aviso de la mañana

Given(
  'un suscriptor de Playa Venao con su barra puesta en {int}, que hoy no ha recibido nada',
  function (barra: number) {
    w(this).pushSpots = [VENAO];
    w(this).pushSubs = [sub({ threshold_score: barra })];
  },
);

Given(
  'un suscriptor de Playa Venao que no eligió ninguna barra, que hoy no ha recibido nada',
  function () {
    w(this).pushSpots = [VENAO];
    w(this).pushSubs = [sub({ threshold_score: null })];
  },
);

Given('en Playa Venao son las siete de la mañana de su propio huso', function () {
  w(this).pushNow = panamaLocal('07:25');
});

Given('en Playa Venao es la hora {string} de su propio huso', function (hora: string) {
  w(this).pushNow = panamaLocal(hora);
});

Given(
  'un spot cuyo huso va seis horas por delante de Panamá, con un suscriptor cuya barra está en {int}',
  function (barra: number) {
    w(this).pushSpots = [LEJOS];
    w(this).pushSubs = [sub({ spot_id: LEJOS.spot_id, threshold_score: barra })];
  },
);

Given('en Panamá son las siete de la mañana, y en ese spot ya pasó del mediodía', function () {
  w(this).pushNow = panamaLocal('07:25');
});

When('la mañana de ese spot puntúa {int}', async function (puntaje: number) {
  const world = w(this);
  const spot = (world.pushSpots ?? [VENAO])[0]!;
  world.pushScores = { [spot.spot_id]: puntaje };
  world.pushPlan = await plan(this);
});

When(
  'ese suscriptor ya recibió su aviso de hoy y la corrida vuelve a pasar una hora después',
  async function () {
    const world = w(this);
    world.pushSubs = (world.pushSubs ?? []).map((s) => ({ ...s, last_notified_date: TODAY }));
    world.pushNow = panamaLocal('08:25');
    world.pushPlan = await plan(this);
  },
);

When('se recorre toda la escala de puntajes posibles de esa mañana', { timeout: 60_000 }, async function () {
  const world = w(this);
  const sweep: { score: number; sent: boolean }[] = [];
  for (let score = 0; score <= 100; score += 1) {
    world.pushScores = { [VENAO.spot_id]: score };
    const observed = await plan(this);
    sweep.push({ score, sent: (observed?.sends ?? []).length > 0 });
  }
  world.pushSweep = sweep;
});

Then('sale exactamente un aviso para ese suscriptor', function () {
  const planned = sends(this);
  assertBehaviour(
    planned.length === 1 ? [] : [`salieron ${planned.length} avisos donde tenía que salir exactamente uno`],
    'dentro de la ventana de la mañana, y desde la barra del suscriptor hacia arriba, sale un aviso y solo uno (07-write-path.md sección 8.2).',
    absences(this),
  );
});

Then('ese aviso nombra el spot y su puntaje, en el idioma de ese suscriptor', function () {
  const planned = sends(this)[0];
  const subscriber = (w(this).pushSubs ?? [])[0];
  const score = Object.values(w(this).pushScores ?? {})[0];
  const findings: string[] = [];
  if (planned === undefined) {
    findings.push('no hay ningún aviso cuyo texto se pueda leer');
  } else {
    const text = `${planned.title} ${planned.body}`;
    if (!text.includes('Playa Venao')) findings.push('el aviso no nombra el spot');
    if (score !== undefined && !text.includes(String(score))) findings.push('el aviso no trae el puntaje de esa mañana');
    if (planned.lang !== (subscriber?.lang ?? 'es')) findings.push(`el aviso salió en ${planned.lang} y no en el idioma del suscriptor`);
  }
  assertBehaviour(
    findings,
    'la copia se compone desde el idioma guardado en la suscripción, que es el consumidor nombrado de ese campo.',
    absences(this),
  );
});

Then(
  'ese aviso lleva a la página de ese spot, se agrupa por spot, y se vence a las cuatro horas',
  function () {
    const planned = sends(this)[0];
    const findings: string[] = [];
    if (planned === undefined) {
      findings.push('no hay ningún aviso cuyo destino, agrupación ni vencimiento se pueda leer');
    } else {
      if (planned.url !== `/spots/${VENAO.slug}/`) findings.push(`el aviso lleva a ${planned.url} en vez de a la página del spot`);
      if (planned.tag !== VENAO.spot_id) findings.push(`el aviso se agrupa por ${planned.tag} en vez de por el spot`);
      if (planned.ttl_seconds !== 4 * 60 * 60) findings.push(`el aviso se vence a los ${planned.ttl_seconds} segundos en vez de a las cuatro horas`);
    }
    assertBehaviour(
      findings,
      'una llamada de surf vieja no vale nada, por eso el vencimiento a las cuatro horas; y la agrupación por spot es la regla de no fastidiar llevada a la bandeja.',
      absences(this),
    );
  },
);

/**
 * A "no aviso" oracle is only worth something once the run actually decided.
 * With no decision at all, "salieron cero avisos" is trivially true and the
 * scenario would pass for the wrong reason, which is the false green this
 * suite exists to refuse.
 */
Then('no sale ningún aviso', function () {
  const planned = sends(this);
  const findings: string[] = [];
  if (w(this).pushPlan === null || w(this).pushPlan === undefined) {
    findings.push('la corrida no llegó a decidir nada, así que un cero de avisos todavía no prueba la regla');
  } else if (planned.length !== 0) {
    findings.push(`salieron ${planned.length} avisos donde no tenía que salir ninguno`);
  }
  assertBehaviour(
    findings,
    'por debajo de la barra, fuera de la mañana del propio spot, o ya avisado hoy: no se avisa.',
    absences(this),
  );
});

Then(
  'hay un solo punto de corte: por debajo nunca sale aviso, y de ahí hacia arriba siempre sale',
  function () {
    const sweep = w(this).pushSweep ?? [];
    const findings: string[] = [];
    if (sweep.length === 0) {
      findings.push('no se llegó a recorrer ningún puntaje');
    } else if (!sweep.some((s) => s.sent)) {
      findings.push('en toda la escala no salió ni un aviso, así que no hay ninguna barra gobernando');
    } else {
      const first = sweep.findIndex((s) => s.sent);
      const rupturas = sweep.slice(first).filter((s) => !s.sent);
      if (rupturas.length > 0) {
        findings.push(`por encima del corte hay puntajes que no avisan: ${rupturas.map((r) => r.score).join(', ')}`);
      }
      const antes = sweep.slice(0, first).filter((s) => s.sent);
      if (antes.length > 0) findings.push(`por debajo del corte hay puntajes que sí avisan: ${antes.map((a) => a.score).join(', ')}`);
    }
    assertBehaviour(
      findings,
      'una suscripción sin barra elegida igual se rige por una barra del servidor. Esta comprobación no dice cuál es, a propósito: nadie la ha decidido (Pre-requisito 1).',
      absences(this),
    );
  },
);

Then('ese punto de corte cae dentro de la escala de puntajes', function () {
  const sweep = w(this).pushSweep ?? [];
  const first = sweep.findIndex((s) => s.sent);
  assertBehaviour(
    first >= 0 && first <= 100 ? [] : ['no hay ningún punto de corte dentro de la escala de puntajes'],
    'el rango de la barra es 0 a 100 (07-write-path.md sección 8.1). El valor concreto sigue sin decidirse y este archivo no lo afirma.',
    absences(this),
  );
});

Given('más suscriptores en su mañana buena de los que caben en una corrida', function () {
  const world = w(this);
  world.pushSpots = [VENAO];
  world.pushNow = panamaLocal('07:25');
  world.pushScores = { [VENAO.spot_id]: 95 };
  world.pushRunCap = 3;
  world.pushSubs = Array.from({ length: 7 }, (_, i) =>
    sub({ endpoint_hash: `suscriptor-${i + 1}`, threshold_score: 55 }),
  );
});

When('la corrida arma sus avisos', async function () {
  w(this).pushPlan = await plan(this);
});

Then('arma como mucho el tope de esa corrida', function () {
  const cap = w(this).pushRunCap ?? 10_000;
  const planned = sends(this);
  assertBehaviour(
    planned.length > 0 && planned.length <= cap
      ? []
      : [`la corrida armó ${planned.length} avisos con un tope de ${cap}`],
    'el tope por corrida es el control que acota el peor caso, no un medidor de dólares (07-write-path.md sección 8.4).',
    absences(this),
  );
});

Then('queda anunciado en voz alta cuántos quedaron para después', function () {
  const world = w(this);
  const cap = world.pushRunCap ?? 10_000;
  const total = (world.pushSubs ?? []).length;
  const observed = world.pushPlan;
  const findings: string[] = [];
  const loud = (observed?.events ?? []).filter((e) => /cap|tope|skip|omit/i.test(e.kind));
  if (loud.length === 0) findings.push('la corrida no anunció nada al pasar del tope');
  if ((observed?.deferred ?? 0) !== total - cap) {
    findings.push(`anunció ${observed?.deferred ?? 0} diferidos donde quedaron ${total - cap}`);
  }
  assertBehaviour(
    findings,
    'pasado el tope, un evento RUIDOSO nombra lo que quedó para después; un tope silencioso es un aviso perdido sin testigo.',
    absences(this),
  );
});

Given('un aviso armado para un suscriptor de Playa Venao', async function () {
  const world = w(this);
  world.pushSpots = [VENAO];
  world.pushNow = panamaLocal('07:25');
  world.pushScores = { [VENAO.spot_id]: 95 };
  world.pushSubs = [sub({ threshold_score: 55 })];
  world.pushPlan = await plan(this);
});

const RESPUESTAS: Readonly<Record<string, number>> = {
  'no encontrado': 404,
  'ya no existe': 410,
  prohibido: 403,
  'ahora no puedo': 503,
};

When('el servicio de avisos contesta {string} a ese envío', async function (respuesta: string) {
  const status = RESPUESTAS[respuesta];
  assert.ok(status !== undefined, `la prueba no sabe traducir la respuesta "${respuesta}"`);
  const world = w(this);
  const planned = sends(this);
  const endpointHash = planned[0]?.endpoint_hash ?? (world.pushSubs ?? [])[0]?.endpoint_hash ?? 'suscriptor-1';
  const call = await callDeclared<SendReactions>('planSendReactions', {
    sends: planned.length > 0 ? planned : [{ ...sub({ threshold_score: 55 }), endpoint_hash: endpointHash }],
    responses: [{ endpoint_hash: endpointHash, status }],
  });
  record(this, call.absence);
  world.pushReactions = call.value;
});

Then('esa suscripción queda marcada para borrarse', function () {
  const deletions = w(this).pushReactions?.deletions ?? [];
  assertBehaviour(
    deletions.length === 1 ? [] : [`quedaron ${deletions.length} suscripciones marcadas para borrarse donde tenía que quedar una`],
    'un 404, un 410 o un 403 borran la suscripción al primer fallo: ese destino ya no existe y seguir insistiendo es gastar sin destinatario (07-write-path.md sección 8.4).',
    absences(this),
  );
});

Then('ninguna suscripción queda marcada para borrarse', function () {
  const deletions = w(this).pushReactions?.deletions ?? null;
  const findings: string[] = [];
  if (deletions === null) findings.push('la corrida no llegó a decidir nada sobre ese fallo pasajero');
  else if (deletions.length > 0) findings.push(`borró ${deletions.length} suscripciones por un fallo pasajero`);
  assertBehaviour(
    findings,
    'solo los tres rechazos definitivos podan; un fallo pasajero no le cuesta la suscripción a nadie. Sin esta comprobación, "borrar siempre" también pasaría el escenario de arriba.',
    absences(this),
  );
});
