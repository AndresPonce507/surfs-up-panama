// Slice-01 acceptance steps for what happens when the aviso reaches the phone.
//
// WHAT THIS DRIVES, AND WHAT IT DELIBERATELY DOES NOT TOUCH
// ---------------------------------------------------------
// The service worker file belongs to F-WORKS-WITH-NO-SIGNAL. Their committed
// plan grants this feature a named additive seat: two listener registrations
// appended at the end of the file, zero edits to any existing router row or
// listener. That seat is STRUCTURAL only ("where the listener goes"), so the
// obligations of what lands there are this feature's own contract of record,
// written in its feature-delta seam section. These scenarios drive those
// obligations and touch no file of theirs. The append itself stays seam-gated
// on Pre-requisite 4(a), whose payload-contract acknowledgement is still owed.
//
// The handler is called with the scope it runs in, which is what makes the
// statelessness obligation observable: the scope handed in carries traps for
// network and storage, and the scenario watches whether the handler reaches for
// any of them. One honest limit, recorded rather than hidden: a handler that
// called a bare global instead of the scope it was given would slip past these
// traps. The stateless obligation is therefore also a review obligation.

import { Given, Then, When } from '@cucumber/cucumber';

import { assertBehaviour, callDeclared } from './support/declared-surface';

const SPOT = 'playa-venao';
const URL_DEL_SPOT = `/spots/${SPOT}/`;
const ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';

type Payload = { v: number; title: string; body: string; url: string; tag: string };

type ShownNotification = { title: string; options: { body?: string; tag?: string; data?: { url?: string } } };

type ScopeTraps = {
  shown: ShownNotification[];
  waited: number;
  reached: string[];
  focused: string[];
  opened: string[];
};

function payload(overrides: Partial<Payload> = {}): Payload {
  return {
    v: 1,
    title: 'Mejor: Playa Venao, 91',
    body: 'Cintura a pecho y limpio. Ventana 6:20 a 8:40.',
    url: URL_DEL_SPOT,
    tag: SPOT,
    ...overrides,
  };
}

/** The service worker global scope, with every off-limits capability trapped. */
function makeScope(traps: ScopeTraps, openWindows: string[]): Record<string, unknown> {
  const reach = (name: string) => () => {
    traps.reached.push(name);
    return Promise.reject(new Error(`el handler no puede usar ${name}`));
  };
  return {
    registration: {
      showNotification: (title: string, options: ShownNotification['options'] = {}) => {
        traps.shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () =>
        Promise.resolve(
          openWindows.map((url) => ({
            url,
            focus: () => {
              traps.focused.push(url);
              return Promise.resolve({ url });
            },
          })),
        ),
      openWindow: (url: string) => {
        traps.opened.push(url);
        return Promise.resolve({ url });
      },
    },
    fetch: reach('fetch'),
    caches: { open: reach('caches'), match: reach('caches') },
    indexedDB: { open: reach('indexedDB') },
    localStorage: { getItem: reach('localStorage'), setItem: reach('localStorage') },
  };
}

function pushEvent(traps: ScopeTraps, body: Payload): Record<string, unknown> {
  return {
    data: { json: () => body, text: () => JSON.stringify(body) },
    waitUntil: (promise: unknown) => {
      traps.waited += 1;
      return promise;
    },
  };
}

function clickEvent(traps: ScopeTraps, url: string, closed: string[]): Record<string, unknown> {
  return {
    notification: {
      data: { url },
      tag: SPOT,
      close: () => closed.push(url),
    },
    waitUntil: (promise: unknown) => {
      traps.waited += 1;
      return promise;
    },
  };
}

type HandlerWorld = {
  seatTraps?: ScopeTraps;
  seatPayload?: Payload;
  seatOpenWindows?: string[];
  seatClosed?: string[];
  seatAbsences?: (string | null)[];
};

function w(self: unknown): HandlerWorld {
  return self as HandlerWorld;
}

function traps(self: unknown): ScopeTraps {
  return (w(self).seatTraps ??= { shown: [], waited: 0, reached: [], focused: [], opened: [] });
}

function absences(self: unknown): (string | null)[] {
  return w(self).seatAbsences ?? [];
}

async function receivePush(self: unknown, body: Payload): Promise<void> {
  const world = w(self);
  const t = traps(self);
  const scope = makeScope(t, world.seatOpenWindows ?? []);
  const call = await callDeclared<unknown>('handlePush', pushEvent(t, body), scope);
  (world.seatAbsences ??= []).push(call.absence);
}

// -------------------------------------------------------------------- given

Given('un aviso de Playa Venao llegando al teléfono', function () {
  w(this).seatPayload = payload();
  traps(this);
});

Given('el teléfono ya lo mostró', async function () {
  await receivePush(this, w(this).seatPayload ?? payload());
});

Given('un aviso de Playa Venao ya mostrado en el teléfono', async function () {
  const body = payload();
  w(this).seatPayload = body;
  await receivePush(this, body);
});

Given('el surfista ya tiene abierta la página de ese spot', function () {
  w(this).seatOpenWindows = [`${ORIGIN}${URL_DEL_SPOT}`];
});

Given('el surfista no tiene ninguna ventana abierta del sitio', function () {
  w(this).seatOpenWindows = [];
});

// --------------------------------------------------------------------- when

When('el teléfono lo recibe', async function () {
  await receivePush(this, w(this).seatPayload ?? payload());
});

When('llega un segundo aviso del mismo spot', async function () {
  await receivePush(this, payload({ title: 'Mejor: Playa Venao, 94', body: 'Mejoró.' }));
});

When('el surfista toca el aviso', async function () {
  const world = w(this);
  const t = traps(this);
  world.seatClosed = [];
  const scope = makeScope(t, world.seatOpenWindows ?? []);
  const call = await callDeclared<unknown>(
    'handleNotificationClick',
    clickEvent(t, URL_DEL_SPOT, world.seatClosed),
    scope,
  );
  (world.seatAbsences ??= []).push(call.absence);
});

// --------------------------------------------------------------------- then

Then('el teléfono muestra ese aviso con su título y su texto', function () {
  const shown = traps(this).shown;
  const esperado = w(this).seatPayload ?? payload();
  const findings: string[] = [];
  if (shown.length === 0) {
    findings.push('el aviso llegó y no se mostró ninguna notificación');
  } else {
    if (shown[0]!.title !== esperado.title) findings.push(`la notificación se tituló "${shown[0]!.title}" en vez de traer el título del aviso`);
    if (shown[0]!.options.body !== esperado.body) findings.push('la notificación no trae el texto del aviso');
  }
  assertBehaviour(
    findings,
    'un aviso recibido y no mostrado le cuesta la suscripción al surfista, porque los navegadores castigan el silencio quitándola.',
    absences(this),
  );
});

Then('el teléfono espera a que el aviso esté mostrado antes de darse por terminado', function () {
  const t = traps(this);
  assertBehaviour(
    t.waited > 0 ? [] : ['el handler terminó sin esperar a que la notificación estuviera mostrada'],
    'showNotification va dentro de la espera del evento, o el navegador puede cortar el handler antes de que aparezca nada.',
    absences(this),
  );
});

Then(
  'los dos avisos van agrupados bajo el mismo spot, así que el segundo reemplaza al primero',
  function () {
    const shown = traps(this).shown;
    const findings: string[] = [];
    if (shown.length < 2) findings.push(`se mostraron ${shown.length} notificaciones donde tenían que mostrarse dos`);
    const tags = shown.map((s) => s.options.tag);
    if (tags.some((tag) => tag !== SPOT)) {
      findings.push(`las notificaciones se agruparon como ${JSON.stringify(tags)} en vez de por el spot`);
    }
    assertBehaviour(
      findings,
      'agrupar por spot es la regla de no fastidiar llevada a la bandeja: el aviso nuevo del mismo spot reemplaza al anterior en vez de apilarse.',
      absences(this),
    );
  },
);

/**
 * Both statelessness oracles first require the handler to have actually shown
 * the notification. "No tocó la red" is trivially true of a handler that never
 * ran, and a trivially true assertion is a false green.
 */
function neverRan(self: unknown): string[] {
  return traps(self).shown.length > 0
    ? []
    : ['el aviso nunca se llegó a mostrar, así que no haber tocado nada todavía no prueba nada'];
}

Then('el teléfono no pidió nada a la red para mostrarlo', function () {
  const red = traps(this).reached.filter((name) => name === 'fetch');
  const findings = red.length === 0 ? [] : [`el handler pidió a la red ${red.length} vez(ces)`];
  findings.push(...neverRan(this));
  assertBehaviour(
    findings,
    'todo lo que el handler necesita viene dentro del propio aviso; sin red no hay nada que pueda fallar en el camino.',
    absences(this),
  );
});

Then('el teléfono no guardó ni leyó nada en su almacenamiento', function () {
  const almacen = traps(this).reached.filter((name) => name !== 'fetch');
  const findings = almacen.length === 0 ? [] : [`el handler tocó el almacenamiento: ${[...new Set(almacen)].join(', ')}`];
  findings.push(...neverRan(this));
  assertBehaviour(
    findings,
    'ser sin estado es lo que hace que las dos cosas que nadie verificó del iPhone, el Background Sync y los plazos de desalojo, no puedan romper esto: un desalojo cuesta volver a registrarse, nunca un comportamiento equivocado.',
    absences(this),
  );
});

Then('el aviso se cierra', function () {
  const closed = w(this).seatClosed ?? [];
  assertBehaviour(
    closed.length > 0 ? [] : ['el aviso siguió en la bandeja después de tocarlo'],
    'tocar el aviso lo cierra antes de llevar a ninguna parte.',
    absences(this),
  );
});

Then('el teléfono trae al frente la ventana que ya estaba en esa página, sin abrir otra', function () {
  const t = traps(this);
  const findings: string[] = [];
  if (t.focused.length === 0) findings.push('no trajo al frente la ventana que ya estaba abierta en esa página');
  if (t.opened.length > 0) findings.push(`abrió ${t.opened.length} ventana(s) de más`);
  assertBehaviour(
    findings,
    'si ya hay una ventana en esa página, se trae al frente; abrir otra deja al surfista con dos.',
    absences(this),
  );
});

Then('el teléfono abre una ventana en la página de ese spot', function () {
  const t = traps(this);
  assertBehaviour(
    t.opened.some((url) => url.includes(URL_DEL_SPOT))
      ? []
      : [`no abrió ninguna ventana en la página del spot (abrió ${JSON.stringify(t.opened)})`],
    'sin ninguna ventana abierta, tocar el aviso abre una en la página del spot que lo mandó.',
    absences(this),
  );
});
