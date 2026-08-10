type PushCapableWindow = {
  PushManager?: unknown;
  ServiceWorkerRegistration?: { prototype: { pushManager?: unknown } };
  Notification?: { permission?: NotificationPermission };
  navigator: { serviceWorker?: unknown };
};

function canRequestPush(windowPort: PushCapableWindow): boolean {
  return (
    'PushManager' in windowPort
    && 'serviceWorker' in windowPort.navigator
    && 'ServiceWorkerRegistration' in windowPort
    && 'pushManager' in windowPort.ServiceWorkerRegistration.prototype
  );
}

/**
 * Reveals the already-rendered control only in a browser that can genuinely
 * request push. Unsupported contexts keep the region hidden, rather than
 * offering a tap that cannot lead anywhere.
 */
export function mountPushSettings(documentPort: Document, windowPort: PushCapableWindow): void {
  const control = documentPort.querySelector<HTMLElement>('[data-field="avisos"]');
  if (control === null || !canRequestPush(windowPort)) return;

  const action = control.querySelector<HTMLButtonElement>('[data-field="avisos-activate"]');
  const refusal = control.querySelector<HTMLElement>('[data-field="avisos-permission-refused"]');

  control.hidden = false;
  action?.addEventListener('click', () => {
    if (windowPort.Notification?.permission === 'granted') return;
    if (refusal !== null) refusal.hidden = false;
    if (action !== null) action.disabled = true;
  });
}

mountPushSettings(document, window);
