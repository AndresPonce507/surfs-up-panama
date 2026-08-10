// The service worker owns registration. This module owns only the pure
// event-to-browser handoffs that may later be appended at its push seat.

type NotificationPayload = {
  title: string;
  body: string;
  url: string;
  /** The notify planner supplies the spot_id here, never a message id. */
  tag: string;
};

type PushEventPort = {
  data: { json: () => NotificationPayload };
  waitUntil: (promise: Promise<unknown>) => void;
};

type PushScopePort = {
  registration: {
    showNotification: (title: string, options: NotificationOptions) => Promise<unknown>;
  };
};

type NotificationOptions = {
  body: string;
  tag: string;
  data: { url: string };
};

type NotificationClickEventPort = Record<string, never>;
type NotificationClickScopePort = Record<string, never>;

function notificationOptions(payload: NotificationPayload): NotificationOptions {
  return {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
  };
}

/**
 * Shows exactly the content the notify job encrypted into the received push.
 * In particular, the payload's spot tag reaches the browser unchanged: the
 * browser replaces a prior same-spot notification, while this handler still
 * shows every received push.
 * The caller owns the service-worker global, so this handler never reaches for
 * ambient `self`, network, storage, cache, or background-sync state.
 */
export function handlePush(event: PushEventPort, scope: PushScopePort): void {
  const payload = event.data.json();
  event.waitUntil(scope.registration.showNotification(payload.title, notificationOptions(payload)));
}

/**
 * The click entry point shares this module so the later serial service-worker
 * append has one explicit handler home. Its behaviour belongs to step 01-16.
 */
export function handleNotificationClick(
  _event: NotificationClickEventPort,
  _scope: NotificationClickScopePort,
): void {}
