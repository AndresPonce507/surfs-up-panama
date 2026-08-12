// The notification seat: what the browser does with a push once it lands, and
// what a tap on that notification does. Slice-01 steps 01-15 to 01-19.
//
// THIS MODULE IS THIS LANE'S. THE SERVICE WORKER FILE IS NOT.
// -------------------------------------------------------------------------
// `src/sw/**` and `public/sw.js` belong to F-WORKS-WITH-NO-SIGNAL. Their
// committed plan (674c3ce, build/f2-signal) grants this lane a NAMED ADDITIVE
// SEAT on their terms: a `push` and a `notificationclick` listener added as new
// registrations at the END of that file, touching zero existing router rows and
// zero existing listeners, coordinated as a serial append. So the logic ships
// here and the two registration lines are handed over as a contract. Nothing in
// this lane writes to that file.
//
// EVERYTHING IS INJECTED, NOTHING IS AMBIENT
// -------------------------------------------------------------------------
// Both handlers take `(event, scope)`. The service worker global is passed in
// rather than read, which is what keeps the seat unit-testable off a browser
// and keeps the module honest about what it touches.
//
// STATELESSNESS IS LOAD-BEARING, NOT AESTHETIC
// -------------------------------------------------------------------------
// Nothing here fetches, caches, opens IndexedDB, or reads localStorage.
// Everything a notification needs arrives in its payload. That is exactly what
// makes the two UNVERIFIED iOS behaviours in application-architecture.md §12
// (Background Sync support, service worker storage eviction windows)
// irrelevant to push correctness: an evicted worker costs a re-registration on
// the next visit and never a wrong behaviour. Caching "just the last payload"
// would quietly reintroduce both risks. No analytics, no open tracking, no
// click-through measurement, ever (BRIEF constraint 3).

/**
 * What a planned send carries onto the wire. The grouping field is `tag`, and
 * its value is the spot: that is the field name `PlannedSend` composes in
 * plan-notifications.ts and the field name the acceptance payload carries.
 * `spot_id` is a plan-side field, next to `endpoint_hash` and `ttl_seconds`,
 * which route the send and never reach the notification.
 */
export type NotificationSeatPayload = {
  v: number;
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type ShowNotificationOptions = {
  body: string;
  tag: string;
  data: { url: string };
};

export type ServiceWorkerScopeLike = {
  registration: {
    showNotification: (title: string, options: ShowNotificationOptions) => Promise<unknown>;
  };
  clients: {
    matchAll: (options: {
      type: 'window';
      includeUncontrolled: boolean;
    }) => Promise<readonly WindowClientLike[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
};

export type WindowClientLike = {
  url: string;
  focus: () => Promise<unknown>;
};

export type PushEventLike = {
  data?: { json: () => unknown } | null | undefined;
  waitUntil: (work: Promise<unknown>) => void;
};

export type NotificationClickEventLike = {
  notification: {
    close: () => void;
    data?: unknown;
  };
  waitUntil: (work: Promise<unknown>) => void;
};

/**
 * What a push that cannot be read still says. A push the browser delivered and
 * the seat could not parse is a real event, so it gets a real notification that
 * states the absence instead of inventing a spot, a score, or a favourable
 * reading of nothing.
 */
const UNREADABLE_PUSH_COPY_ES = {
  title: 'Aviso de Surfs Up Panamá',
  body: 'Llegó un aviso pero no se pudo leer su contenido. Abrí la app para ver tus spots.',
} as const;

/** Groups every unreadable aviso together, so they replace rather than pile up. */
const UNREADABLE_PUSH_TAG = 'aviso';
const SITE_ROOT_PATH = '/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function textField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Read the push payload without ever throwing. `event.data.json()` throws on a
 * non-JSON body, and a throw here is a silent push, which browsers punish by
 * revoking the subscription. A subscription revoked this way is a broken
 * promise nobody sees, so unreadable is a value, never an exception.
 */
function readPayload(event: PushEventLike): Record<string, unknown> | null {
  try {
    const parsed = event.data?.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Compose what to show. The tag is the spot carried in the payload, never a
 * per-message identifier: a same-spot aviso must replace the one already in the
 * tray rather than stack on it (decision 23, no nagging). Replacement itself is
 * the browser's job given a shared tag; this seat adds no de-duplication of its
 * own, because suppressing a second push would show the surfer stale conditions.
 */
function composeNotification(payload: Record<string, unknown> | null): {
  title: string;
  options: ShowNotificationOptions;
} {
  const fields = payload ?? {};
  return {
    title: textField(fields, 'title') ?? UNREADABLE_PUSH_COPY_ES.title,
    options: {
      body: textField(fields, 'body') ?? UNREADABLE_PUSH_COPY_ES.body,
      tag: textField(fields, 'tag') ?? UNREADABLE_PUSH_TAG,
      data: { url: textField(fields, 'url') ?? SITE_ROOT_PATH },
    },
  };
}

/**
 * Show every push that arrives. `waitUntil` holds the event open until the
 * notification is actually on screen: a bare `showNotification` lets the worker
 * be torn down mid-push, which the browser sees as a silent push.
 */
export function handlePush(event: PushEventLike, scope: ServiceWorkerScopeLike): void {
  const { title, options } = composeNotification(readPayload(event));
  event.waitUntil(scope.registration.showNotification(title, options));
}

/** The path a client and a target must share to count as the same page. Query
 *  and hash are deliberately excluded: `?t=ps` marks how a report was solicited
 *  and never makes it a different page. */
function pathOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl, 'https://surfs-up-panama.invalid').pathname;
  } catch {
    return null;
  }
}

function targetUrlOf(event: NotificationClickEventLike): string {
  const data = event.notification.data;
  if (!isRecord(data)) return SITE_ROOT_PATH;
  return textField(data, 'url') ?? SITE_ROOT_PATH;
}

function clientAlreadyAt(
  clients: readonly WindowClientLike[],
  targetUrl: string,
): WindowClientLike | undefined {
  const targetPath = pathOf(targetUrl);
  if (targetPath === null) return undefined;
  return clients.find((client) => pathOf(client.url) === targetPath);
}

/**
 * Close the aviso, THEN decide where the surfer lands. The order is observable:
 * a handler that focuses without closing leaves the notification sitting in the
 * tray after it was tapped. The choice between focusing and opening comes from
 * the real client list, never assumed, and the enumeration is awaited inside
 * `waitUntil` so the worker is not torn down mid-decision.
 */
export function handleNotificationClick(
  event: NotificationClickEventLike,
  scope: ServiceWorkerScopeLike,
): void {
  event.notification.close();
  const targetUrl = targetUrlOf(event);
  event.waitUntil(
    scope.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clientAlreadyAt(clients, targetUrl);
        return existing === undefined ? scope.clients.openWindow(targetUrl) : existing.focus();
      }),
  );
}
