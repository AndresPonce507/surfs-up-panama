// Adapter around the maintained Web Push implementation. The library owns
// RFC 8291 payload encryption and ES256 VAPID signing; this wrapper owns the
// narrow app payload and TTL contract.

export type WebPushSubscription = {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
};

export type WebPushPayload = {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly tag: string;
  readonly ttl_seconds: number;
};

export type WebPushPort = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { TTL: number },
  ): Promise<{ statusCode: number }>;
};

export type WebPushSender = {
  send(subscription: WebPushSubscription, payload: WebPushPayload): Promise<{ status: number }>;
};

export function createWebPushSender(
  webPush: WebPushPort,
  vapid: { readonly subject: string; readonly publicKey: string; readonly privateKey: string },
): WebPushSender {
  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return {
    async send(subscription, payload) {
      try {
        const response = await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag }),
          { TTL: payload.ttl_seconds },
        );
        return { status: response.statusCode };
      } catch (error) {
        // `web-push` rejects for non-2xx service replies. Keep the observable
        // status so Notify can make the settled 403/404/410 pruning decision;
        // transport failures remain errors and therefore make no persistence
        // claim.
        const status = typeof error === 'object' && error !== null
          ? (error as { statusCode?: unknown }).statusCode
          : undefined;
        if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) return { status };
        throw error;
      }
    },
  };
}
