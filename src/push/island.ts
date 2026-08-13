// Avisos control island, step 01-20: capability detection and mount only.
// Deliberately stops at "reveal the pre-rendered control" -- the tap does not
// request permission or subscribe yet (that is step 01-21's own AT gate, not
// this one's). Both functions are pure and take their environment as
// parameters (documentPort, windowPort) rather than reading `document` /
// `window` ambiently, so 01-21 can extend the click behaviour without
// rewriting the capability check or the mount wiring.
//
// The capability probe mirrors the acceptance harness's own oracle verbatim
// (tests/acceptance/f-tell-me-when-its-worth-the-drive/steps/
// avisos-island.steps.ts, READ_AVISOS_SURFACE): 'PushManager' in window &&
// 'serviceWorker' in navigator && 'ServiceWorkerRegistration' in window &&
// 'pushManager' in ServiceWorkerRegistration.prototype. A context missing
// any one of the four (an open iOS Safari tab, research 12 section 4 as
// quoted in application-architecture.md section 12) is incapable, and the
// pre-rendered control stays hidden -- never a tap that cannot lead anywhere.

export type PushCapableWindow = {
  PushManager?: unknown;
  ServiceWorkerRegistration?: { prototype: { pushManager?: unknown } };
  navigator: { serviceWorker?: unknown };
};

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
 * Reveals the already server-rendered control only in a browser that can
 * genuinely request push. Incapable contexts keep the region hidden, which
 * is the honest shape of "no action offered", not an empty page pretending
 * nothing could ever be there.
 */
export function mountPushSettings(
  documentPort: Pick<Document, 'querySelector'>,
  windowPort: PushCapableWindow,
): void {
  if (!canRequestPush(windowPort)) return;
  const control = documentPort.querySelector<HTMLElement>('[data-field="avisos"]');
  if (control === null) return;
  control.hidden = false;
}
