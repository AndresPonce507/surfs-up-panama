// Browser-side boundary for one opt-in. It creates or reuses the browser's
// real PushSubscription, then treats the write response as the only evidence
// that the page may say the subscription is active.

export type PushBrowserConfig = {
  readonly push_url: string;
  readonly mint_url: string;
  readonly vapid_public_key: string;
};

type BrowserSubscription = {
  readonly endpoint: string;
  toJSON(): unknown;
};

type BrowserRegistration = {
  readonly pushManager: {
    getSubscription(): Promise<BrowserSubscription | null>;
    subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<BrowserSubscription>;
  };
};

export type SubscribeBrowserInput = {
  readonly config: PushBrowserConfig;
  readonly spotId: string;
  readonly lang: 'es' | 'en';
  readonly credential: () => Promise<string>;
  readonly registration: BrowserRegistration;
  readonly fetcher: (url: string, init: RequestInit) => Promise<Response>;
};

export async function subscribeBrowserToSpot(input: SubscribeBrowserInput): Promise<{ kind: 'subscribed' } | { kind: 'refused' }> {
  const key = decodeVapidPublicKey(input.config.vapid_public_key);
  if (key === null || !isHttpUrl(input.config.push_url)) return { kind: 'refused' };
  let subscription: BrowserSubscription;
  try {
    subscription = await input.registration.pushManager.getSubscription()
      ?? await input.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    return { kind: 'refused' };
  }
  const serialised = subscriptionPayload(subscription);
  if (serialised === null) return { kind: 'refused' };
  try {
    const response = await input.fetcher(input.config.push_url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-surf-credential': await input.credential() },
      body: JSON.stringify({ action: 'subscribe', spot_id: input.spotId, subscription: serialised, lang: input.lang }),
    });
    const body = await response.json().catch(() => undefined) as { status?: unknown } | undefined;
    return response.ok && body?.status === 'subscribed' ? { kind: 'subscribed' } : { kind: 'refused' };
  } catch {
    return { kind: 'refused' };
  }
}

export async function readStoredPushStatus(input: {
  readonly config: PushBrowserConfig;
  readonly spotId: string;
  readonly subscription: BrowserSubscription;
  readonly credential: () => Promise<string>;
  readonly fetcher: (url: string, init: RequestInit) => Promise<Response>;
}): Promise<{ kind: 'subscribed'; thresholdScore: number | null } | { kind: 'inactive' }> {
  if (!isHttpUrl(input.config.push_url)) return { kind: 'inactive' };
  try {
    const response = await input.fetcher(input.config.push_url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-surf-credential': await input.credential() },
      body: JSON.stringify({ action: 'status', spot_id: input.spotId, endpoint: input.subscription.endpoint }),
    });
    const body = await response.json().catch(() => undefined) as { status?: unknown; threshold_score?: unknown } | undefined;
    if (!response.ok || body?.status !== 'subscribed') return { kind: 'inactive' };
    return { kind: 'subscribed', thresholdScore: typeof body.threshold_score === 'number' ? body.threshold_score : null };
  } catch {
    return { kind: 'inactive' };
  }
}

function subscriptionPayload(subscription: BrowserSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const value = subscription.toJSON();
  if (!isRecord(value) || typeof value.endpoint !== 'string' || !isRecord(value.keys)
    || typeof value.keys.p256dh !== 'string' || typeof value.keys.auth !== 'string') return null;
  return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

function decodeVapidPublicKey(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytes.length === 65 && bytes[0] === 4 ? bytes : null;
  } catch {
    return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
