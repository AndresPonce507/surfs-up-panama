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

type NotificationClickEventPort = {
  notification: {
    data: { url: string };
    close: () => void;
  };
  waitUntil: (promise: Promise<unknown>) => void;
};

type NotificationClient = {
  url: string;
  focus: () => Promise<unknown>;
};

type NotificationClickScopePort = {
  clients: {
    matchAll: () => Promise<readonly NotificationClient[]>;
    openWindow: (url: string) => Promise<unknown>;
  };
};

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
 * A tap first removes the notification, then brings forward an already-open
 * page for the spot. When no client already has that site-relative URL, it
 * opens exactly the URL from the notification data.
 */
export function handleNotificationClick(
  event: NotificationClickEventPort,
  scope: NotificationClickScopePort,
): void {
  const targetUrl = event.notification.data.url;
  event.notification.close();
  event.waitUntil(
    scope.clients
      .matchAll()
      .then((clients) => {
        const matchingClient = clients.find((client) => relativeUrl(client.url) === targetUrl);
        return matchingClient ? matchingClient.focus() : scope.clients.openWindow(targetUrl);
      }),
  );
}

function relativeUrl(absoluteUrl: string): string {
  const url = new URL(absoluteUrl);
  return `${url.pathname}${url.search}${url.hash}`;
}
