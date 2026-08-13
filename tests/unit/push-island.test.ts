// Slice-01 step 01-20 unit tests: capability detection and reveal wiring for
// the avisos control island.
//
// DOM-wiring exemption, same reasoning as the shipped precedent
// (tests/unit/report-island.test.ts): these are two-branch pure decisions
// taking ports as parameters (documentPort, windowPort), single-shot by
// nature. Examples covering every branch are the honest test here; a
// property would be tautological ("capable in, revealed out"). The roadmap
// marks this step's UI states EXEMPT FROM THE PBT PARADIGM for exactly this
// reason.
//
// The capability probe below mirrors the acceptance harness's own oracle
// verbatim (tests/acceptance/.../steps/avisos-island.steps.ts,
// READ_AVISOS_SURFACE): 'PushManager' in window && 'serviceWorker' in
// navigator && 'ServiceWorkerRegistration' in window && 'pushManager' in
// ServiceWorkerRegistration.prototype.

import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
  canRequestPush,
  describePermissionOutcome,
  mountPushSettings,
  type PushCapableWindow,
} from '../../src/push/island';
import { pushCopy } from '../../src/push/copy';

function capableWindow(): PushCapableWindow {
  return {
    PushManager: function PushManager(): void {},
    ServiceWorkerRegistration: { prototype: { pushManager: {} } },
    navigator: { serviceWorker: {} },
  };
}

/** The honest shape of a context that never had a push API at all -- an
 * open iOS Safari tab, per research 12 section 4 as quoted in
 * application-architecture.md section 12. */
function incapableWindow(): PushCapableWindow {
  return { navigator: {} };
}

describe('canRequestPush', () => {
  it('reads true only when every one of the four real capability markers is present, false when any single one is missing', () => {
    assert.equal(canRequestPush(capableWindow()), true, 'a fully capable browser must read as capable');
    assert.equal(canRequestPush(incapableWindow()), false, 'a browser with none of the markers must read as incapable');

    const missingPushManager = capableWindow();
    delete missingPushManager.PushManager;
    assert.equal(canRequestPush(missingPushManager), false, 'missing PushManager alone must already read as incapable');

    const missingServiceWorker = capableWindow();
    missingServiceWorker.navigator = {};
    assert.equal(canRequestPush(missingServiceWorker), false, 'missing navigator.serviceWorker alone must already read as incapable');

    const missingRegistration = capableWindow();
    delete missingRegistration.ServiceWorkerRegistration;
    assert.equal(canRequestPush(missingRegistration), false, 'missing ServiceWorkerRegistration alone must already read as incapable');

    const missingPushManagerOnPrototype = capableWindow();
    missingPushManagerOnPrototype.ServiceWorkerRegistration = { prototype: {} };
    assert.equal(
      canRequestPush(missingPushManagerOnPrototype),
      false,
      'missing ServiceWorkerRegistration.prototype.pushManager alone must already read as incapable',
    );
  });
});

describe('mountPushSettings', () => {
  function fakeDocumentWithControl(hidden: boolean): {
    control: { hidden: boolean; dataset: Record<string, string> };
    documentPort: Pick<Document, 'querySelector'>;
  } {
    const control = { hidden, dataset: {} as Record<string, string> };
    return {
      control,
      documentPort: {
        querySelector: ((selector: string) =>
          selector === '[data-field="avisos"]' ? control : null) as Document['querySelector'],
      },
    };
  }

  it('reveals the pre-rendered control for a capable browser, and leaves it hidden for an incapable one', () => {
    const capable = fakeDocumentWithControl(true);
    mountPushSettings(capable.documentPort, capableWindow());
    assert.equal(capable.control.hidden, false, 'a capable browser must see the avisos action, never a hidden region');

    const incapable = fakeDocumentWithControl(true);
    mountPushSettings(incapable.documentPort, incapableWindow());
    assert.equal(
      incapable.control.hidden,
      true,
      'an incapable browser must never reveal an action that cannot lead anywhere',
    );
  });

  it('does nothing and never throws when the page has no avisos control to reveal', () => {
    const nowhere: Pick<Document, 'querySelector'> = {
      querySelector: (() => null) as Document['querySelector'],
    };
    assert.doesNotThrow(() => mountPushSettings(nowhere, capableWindow()));
    assert.doesNotThrow(() => mountPushSettings(nowhere, incapableWindow()));
  });
});

// Step 01-21: the tap requests the real permission, and a refusal is said in
// words instead of ever showing an avisos-active state.

// `NotificationPermission` is a closed three-value DOM union ('granted' |
// 'denied' | 'default'). Enumerating all three is the entire domain, so a
// property here would just re-encode the same ternary as a generator --
// the same tautology this file's header already flags for canRequestPush.
describe('describePermissionOutcome', () => {
  it('reads granted only for the literal granted permission, and refused for every other value the DOM can report', () => {
    assert.equal(describePermissionOutcome('granted'), 'granted', 'the literal granted permission must read as granted');
    assert.equal(describePermissionOutcome('denied'), 'refused', 'a hard denial must read as refused');
    assert.equal(describePermissionOutcome('default'), 'refused', 'a dismissed prompt must read as refused, the same as a hard denial');
  });
});

describe('mountPushSettings tap handling', () => {
  function fakeAvisosDom(options: { withMessage?: boolean } = {}): {
    documentPort: Pick<Document, 'querySelector'>;
    activate: { click: () => unknown; disabled: boolean };
    message: { hidden: boolean; textContent: string | null };
  } {
    const withMessage = options.withMessage ?? true;
    let clickHandler: (() => unknown) | undefined;
    const control = { hidden: true, dataset: {} as Record<string, string> };
    const message: { hidden: boolean; textContent: string | null } = { hidden: true, textContent: null };
    const activate = {
      disabled: false,
      addEventListener: ((type: string, handler: () => unknown) => {
        if (type === 'click') clickHandler = handler;
      }) as unknown,
      click: () => clickHandler?.(),
    };
    const documentPort: Pick<Document, 'querySelector'> = {
      querySelector: ((selector: string) => {
        if (selector === '[data-field="avisos"]') return control;
        if (selector === '[data-field="avisos-activate"]') return activate;
        if (selector === '[data-field="avisos-message"]') return withMessage ? message : null;
        return null;
      }) as Document['querySelector'],
    };
    return { documentPort, activate, message };
  }

  function windowWithPermission(requestPermission: () => Promise<NotificationPermission>): PushCapableWindow {
    return { ...capableWindow(), Notification: { requestPermission } };
  }

  it('asks for the real permission on tap and says the refusal in words when it is not granted', async () => {
    const { documentPort, activate, message } = fakeAvisosDom();
    let asks = 0;
    mountPushSettings(
      documentPort,
      windowWithPermission(async () => {
        asks += 1;
        return 'denied';
      }),
    );
    await activate.click();
    assert.equal(asks, 1, 'the tap must actually reach the permission request for a refusal to mean anything');
    assert.equal(message.hidden, false, 'a refused permission must reveal the message in place');
    assert.equal(message.textContent, pushCopy.refused, 'the shown text must be the settled refusal copy, never an invented string');
  });

  it('leaves the message hidden and empty when the permission is granted', async () => {
    const { documentPort, activate, message } = fakeAvisosDom();
    mountPushSettings(documentPort, windowWithPermission(async () => 'granted'));
    await activate.click();
    assert.equal(message.hidden, true, 'a granted permission must never reveal the refusal message');
    assert.equal(message.textContent, null, 'a granted permission must never write refusal text into the page');
  });

  it('never throws on a refused tap when the page has an action but no message element to fill', async () => {
    const { documentPort, activate, message } = fakeAvisosDom({ withMessage: false });
    mountPushSettings(documentPort, windowWithPermission(async () => 'denied'));
    await assert.doesNotReject(() => Promise.resolve(activate.click()));
    assert.equal(message.hidden, true, 'the message element that was never wired must stay exactly as it started');
  });

  /**
   * Regression for the surfer-facing defect Vera found by spying on the real
   * Notification.requestPermission API from the page: the control asked on
   * every tap, and only looked correct in Chromium because that browser
   * happens to auto-suppress a repeat prompt once permission is explicitly
   * 'denied'. This project's own harness note (avisos-island.steps.ts) records
   * that a refusal here usually surfaces as a dismissal ('default'), not a
   * hard 'denied' -- and browsers do not reliably suppress a second prompt for
   * a dismissal. So the resolved value under test is 'default', the exact
   * state that would mask the bug if the code relied on the browser instead
   * of tracking its own "already asked" state.
   */
  it('asks for the real permission at most once per page visit, and visibly quiets the control once refused', async () => {
    const { documentPort, activate, message } = fakeAvisosDom();
    let asks = 0;
    mountPushSettings(
      documentPort,
      windowWithPermission(async () => {
        asks += 1;
        return 'default';
      }),
    );

    await activate.click();
    await activate.click();
    await activate.click();
    await activate.click();

    assert.equal(
      asks,
      1,
      'a control that keeps calling requestPermission after a dismissal is exactly the nagging decision 23 forbids',
    );
    assert.equal(message.hidden, false, 'the refusal said on the first tap must still stand');
    assert.equal(message.textContent, pushCopy.refused, 'the refusal copy must still be the settled string, unchanged by later taps');
    assert.equal(
      activate.disabled,
      true,
      'once refused, the control must visibly stop being an invitation instead of silently doing nothing',
    );
  });
});

// Step 01-22: on a return visit the state must be derived from the browser's
// own PushManager.getSubscription() result, never a remembered local flag.
// This DOM-wiring seam is an explicit example-based exception: null and an
// actual subscription object are the complete meaningful boundary values.
describe('mountPushSettings on-load subscription read', () => {
  function controlDocument(control: { hidden: boolean; dataset: Record<string, string> }): Pick<Document, 'querySelector'> {
    return {
      querySelector: ((selector: string) =>
        selector === '[data-field="avisos"]' ? control : null) as Document['querySelector'],
    };
  }

  function browserWithSubscription(subscription: unknown, rememberedFlag: string | null): {
    windowPort: PushCapableWindow;
    reads: { subscription: number; rememberedFlag: number };
  } {
    const reads = { subscription: 0, rememberedFlag: 0 };
    const windowPort = {
      ...capableWindow(),
      navigator: {
        serviceWorker: {
          getRegistration: async () => ({
            pushManager: {
              getSubscription: async () => {
                reads.subscription += 1;
                return subscription;
              },
            },
          }),
        },
      },
      localStorage: {
        getItem: () => {
          reads.rememberedFlag += 1;
          return rememberedFlag;
        },
      },
    } as PushCapableWindow;
    return { windowPort, reads };
  }

  it('reads PushManager.getSubscription on mount and ignores a remembered avisos flag', async () => {
    const offControl = { hidden: true, dataset: {} as Record<string, string> };
    const offBrowser = browserWithSubscription(null, 'activos');
    await mountPushSettings(controlDocument(offControl), offBrowser.windowPort);
    assert.equal(
      offBrowser.reads.subscription,
      1,
      'the mount must call PushManager.getSubscription(), not assume a value from a prior visit',
    );
    assert.equal(
      offBrowser.reads.rememberedFlag,
      0,
      'a remembered avisos flag must never be read to decide the mounted state',
    );
    assert.equal(
      offControl.dataset.avisosState,
      'inactivo',
      'no real subscription must render as an honest inactive state despite the planted flag',
    );

    const onControl = { hidden: true, dataset: {} as Record<string, string> };
    const onBrowser = browserWithSubscription({ endpoint: 'https://push.example/abc' }, null);
    await mountPushSettings(controlDocument(onControl), onBrowser.windowPort);
    assert.equal(onBrowser.reads.subscription, 1, 'each capable return visit needs its own real subscription read');
    assert.equal(onControl.dataset.avisosState, 'activo', 'a real subscription object must be the only active-state source');
  });
});
