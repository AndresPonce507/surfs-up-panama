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

import { canRequestPush, mountPushSettings, type PushCapableWindow } from '../../src/push/island';

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
    control: { hidden: boolean };
    documentPort: Pick<Document, 'querySelector'>;
  } {
    const control = { hidden };
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
