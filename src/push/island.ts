// Avisos control island. Step 01-20 wired capability detection and mount
// only. Step 01-21 extends the tap: requesting the real permission and
// saying the refusal in words when it is not granted, without ever asking a
// second time (decision 23). Both mount and the tap handler are pure/DI
// shaped -- they take their environment as parameters (documentPort,
// windowPort) rather than reading `document` / `window` ambiently.
//
// The capability probe mirrors the acceptance harness's own oracle verbatim
// (tests/acceptance/f-tell-me-when-its-worth-the-drive/steps/
// avisos-island.steps.ts, READ_AVISOS_SURFACE): 'PushManager' in window &&
// 'serviceWorker' in navigator && 'ServiceWorkerRegistration' in window &&
// 'pushManager' in ServiceWorkerRegistration.prototype. A context missing
// any one of the four (an open iOS Safari tab, research 12 section 4 as
// quoted in application-architecture.md section 12) is incapable, and the
// pre-rendered control stays hidden -- never a tap that cannot lead anywhere.

import { pushCopy } from './copy';

type PushRegistrationPort = {
  pushManager?: { getSubscription?: () => Promise<unknown> };
};

export type PushCapableWindow = {
  PushManager?: unknown;
  ServiceWorkerRegistration?: { prototype: { pushManager?: unknown } };
  navigator: {
    serviceWorker?: { getRegistration?: () => Promise<PushRegistrationPort | undefined> };
  };
  Notification?: { requestPermission: () => Promise<NotificationPermission> };
  localStorage?: { getItem: (key: string) => string | null };
};

export type PermissionOutcome = 'granted' | 'refused';
export type AvisosSubscriptionState = 'activo' | 'inactivo';

export function canRequestPush(windowPort: PushCapableWindow): boolean {
  return (
    'PushManager' in windowPort
    && 'serviceWorker' in windowPort.navigator
    && 'ServiceWorkerRegistration' in windowPort
    && windowPort.ServiceWorkerRegistration !== undefined
    && 'pushManager' in windowPort.ServiceWorkerRegistration.prototype
  );
}

/**
 * Browsers do not always surface a hard 'denied' for a refusal -- a
 * dismissed prompt reads back as 'default', the same as a permission that
 * was never asked at all. Branch on the one question that is always
 * answerable honestly: was it granted, or not. Both a dismissal and a hard
 * denial owe the surfer the exact same refusal state (roadmap step 01-21).
 */
export function describePermissionOutcome(permission: NotificationPermission): PermissionOutcome {
  return permission === 'granted' ? 'granted' : 'refused';
}

/**
 * A browser is active only when its own PushManager.getSubscription() read
 * returns a subscription. Remembered client state is never evidence here.
 */
export function deriveAvisosState(subscription: unknown): AvisosSubscriptionState {
  return subscription === null || subscription === undefined ? 'inactivo' : 'activo';
}

async function readRealSubscription(windowPort: PushCapableWindow): Promise<unknown> {
  const getRegistration = windowPort.navigator.serviceWorker?.getRegistration;
  if (getRegistration === undefined) return null;
  try {
    const registration = await getRegistration();
    const subscription = await registration?.pushManager?.getSubscription?.();
    return subscription ?? null;
  } catch {
    return null;
  }
}

/**
 * Handles one tap on the avisos action: requests the real permission and,
 * when it is not granted, says the refusal in words. Returns the outcome so
 * the caller can decide whether the control has anything left to ask for --
 * a dismissed prompt ('default') is not reliably suppressed by every browser
 * the way a hard 'denied' one is, so the "ask at most once" guard lives in
 * the caller (mountPushSettings), not here (decision 23, step 01-21).
 */
async function handleAvisosActivateTap(
  documentPort: Pick<Document, 'querySelector'>,
  requestPermission: () => Promise<NotificationPermission>,
): Promise<PermissionOutcome> {
  const permission = await requestPermission();
  const outcome = describePermissionOutcome(permission);
  if (outcome === 'granted') return outcome;
  const message = documentPort.querySelector<HTMLElement>('[data-field="avisos-message"]');
  if (message !== null) {
    message.textContent = pushCopy.refused;
    message.hidden = false;
  }
  return outcome;
}

/**
 * Reveals the already server-rendered control only in a browser that can
 * genuinely request push. Incapable contexts keep the region hidden, which
 * is the honest shape of "no action offered", not an empty page pretending
 * nothing could ever be there. Once revealed, a tap on the activate action
 * requests the real permission and reports a refusal in words (step 01-21).
 *
 * A tap only ever asks once: the first tap's outcome is remembered for the
 * rest of the page visit, so later taps never call requestPermission again --
 * a dismissed prompt is not reliably suppressed by every browser, so this
 * control cannot lean on browser behaviour the way a hard 'denied' would let
 * it. A refusal additionally disables the action itself, so the surfer sees
 * the control visibly stop inviting another tap instead of it silently doing
 * nothing (roadmap step 01-21).
 */
export function mountPushSettings(
  documentPort: Pick<Document, 'querySelector'>,
  windowPort: PushCapableWindow,
): void | Promise<void> {
  if (!canRequestPush(windowPort)) return undefined;
  const control = documentPort.querySelector<HTMLElement>('[data-field="avisos"]');
  if (control === null) return undefined;
  control.hidden = false;

  const subscriptionRead = readRealSubscription(windowPort).then((subscription) => {
    control.dataset.avisosState = deriveAvisosState(subscription);
  });

  const activate = documentPort.querySelector<HTMLButtonElement>('[data-field="avisos-activate"]');
  const notificationApi = windowPort.Notification;
  if (activate === null || notificationApi === undefined) return subscriptionRead;

  let permissionAlreadyAsked = false;
  activate.addEventListener('click', () => {
    if (permissionAlreadyAsked) return undefined;
    permissionAlreadyAsked = true;
    return handleAvisosActivateTap(documentPort, () => notificationApi.requestPermission()).then(
      (outcome) => {
        if (outcome === 'refused') activate.disabled = true;
      },
    );
  });

  return subscriptionRead;
}
