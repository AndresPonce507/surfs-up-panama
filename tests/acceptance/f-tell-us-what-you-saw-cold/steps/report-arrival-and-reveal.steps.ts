// Slice-03 through Slice-05 acceptance vocabulary. Each journey drives the
// configured production report page in a real browser. No request is
// intercepted and no receipt is manufactured by this suite.

import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const SPOT = 'playa-venao';
const states = new WeakMap<object, JourneyState>();

type JourneyState = {
  origin: string | null;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  sentText: string;
  clockOffsetMs: number;
  queuedReport: Record<string, unknown> | null;
  handlerResults: { status: number; body: Record<string, unknown> }[];
  handlerCredential: string | null;
  handlerMode: 'standard' | 'quota' | 'unknown';
};

Before({ tags: '@requires_external' }, function (this: object) {
  states.set(this, { origin: null, browser: null, context: null, page: null, sentText: '', clockOffsetMs: 0, queuedReport: null, handlerResults: [], handlerCredential: null, handlerMode: 'standard' });
});

// Scoped to THIS feature: other features also tag @requires_external (the
// push follow-up scenarios) and own their prerequisites themselves; this gate
// must never decide for them.
Before({ tags: '@requires_external and @feature-f-tell-us-what-you-saw-cold' }, function (this: object) {
  // Slice-03 to Slice-05 arrival, refusal and quota evidence is true only
  // against the real write handler at an explicitly supplied origin
  // (docs/architecture/atdd-infrastructure-policy.md "Report journey";
  // distill/red-classification.md: no default local route, mock or fake).
  // Until an owner supplies one -- deploy the guarded write stack, or run
  // `npx tsx scripts/report-acceptance-host.ts` (the locally run PRODUCTION
  // handler composed with its real local store) and export the variables it
  // prints -- these scenarios are prerequisite-blocked, not product failures,
  // and skip the same way @blocked-on-real-reports and @indeterminate do.
  if (!process.env.REPORT_ACCEPTANCE_ORIGIN?.trim()) return 'skipped';
  return undefined;
});

Before({ tags: '@indeterminate' }, function () {
  // Real compared/no-call artifacts are launch-environment evidence. Until an
  // owner supplies one, this is neither a product failure nor a fake test.
  if (!process.env.REPORT_ACCEPTANCE_PUBLISHED_ARTIFACT?.trim()) return 'skipped';
  return undefined;
});

After({ tags: '@requires_external' }, async function (this: object) {
  const state = states.get(this);
  await state?.context?.close();
  await state?.browser?.close();
});

function stateOf(world: object): JourneyState {
  const state = states.get(world);
  assert.ok(state, 'test setup did not create the external report journey state');
  return state;
}

async function realPage(world: object): Promise<Page> {
  const state = stateOf(world);
  if (state.page) return state.page;
  const supplied = process.env.REPORT_ACCEPTANCE_ORIGIN?.trim();
  assert.ok(
    supplied,
    'WHAT: no real report journey is available for this slice. WHY: arrival, comparison and a '
      + 'clock refusal are true only when the report page reaches the production write handler; '
      + 'the static site alone must never pretend to have sent a report. HOW: deploy the guarded '
      + 'write stack or run the production handler with its real local store, then set '
      + 'REPORT_ACCEPTANCE_ORIGIN. A fake or intercepted endpoint is not valid evidence.',
  );
  const origin = new URL(supplied).origin;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-PA',
    colorScheme: 'light',
  });
  if (state.clockOffsetMs !== 0) {
    // Passed as a STRING, not a function reference, for the reason world.ts
    // documents at its storage-refusal init script: tsx/esbuild compiles a
    // named inner binding (the class expression here) into a `__name(...)`
    // helper call, and `addInitScript(fn)` serialises only the function body,
    // so the injected script threw `ReferenceError: __name is not defined`
    // and aborted before Object.defineProperty ever ran. The clock was never
    // shifted, the handler honestly accepted the report, and the wrong-clock
    // scenarios failed while the product's 15-minute skew refusal sat unused.
    await context.addInitScript(
      `(() => {
        const offsetMs = ${state.clockOffsetMs};
        const NativeDate = Date;
        class ShiftedDate extends NativeDate {
          constructor() {
            super(NativeDate.now() + offsetMs);
          }
          static now() { return NativeDate.now() + offsetMs; }
        }
        Object.defineProperty(window, 'Date', { value: ShiftedDate });
      })();`,
    );
  }
  const page = await context.newPage();
  state.origin = origin;
  state.browser = browser;
  state.context = context;
  state.page = page;
  try {
    await page.goto(`${origin}/spots/${SPOT}/reportar/`, { waitUntil: 'load', timeout: 20_000 });
  } catch (error) {
    throw new assert.AssertionError({
      message: `WHAT: the supplied real report journey could not be opened at ${origin}. WHY: this acceptance contract must drive a real report page, not a substitute. HOW: start the production composition or deploy the guarded write stack, then retry. (${error instanceof Error ? error.message : String(error)})`,
    });
  }
  return page;
}

async function resetBrowser(world: object): Promise<void> {
  const state = stateOf(world);
  await state.context?.close();
  await state.browser?.close();
  state.context = null;
  state.browser = null;
  state.page = null;
  await realPage(world);
}

async function completeAndSend(world: object): Promise<void> {
  const page = await realPage(world);
  for (const label of ['Cintura a pecho', 'Picado', 'Bueno']) {
    await page.getByLabel(label, { exact: true }).check({ timeout: 10_000 });
  }
  await page.getByRole('button', { name: 'Mandar' }).click({ timeout: 10_000 });
  await page.waitForTimeout(350);
  stateOf(world).sentText = (await page.locator('body').innerText()).trim();
}

async function browserQueuedReports(world: object): Promise<Record<string, unknown>[]> {
  const page = await realPage(world);
  return page.evaluate(async () => {
    const rows: Record<string, unknown>[] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(info.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        for (const storeName of Array.from(database.objectStoreNames)) {
          const values = await new Promise<unknown[]>((resolve, reject) => {
            const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
          rows.push(...values.filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null && 'report_id' in value));
        }
      } finally { database.close(); }
    }
    return rows;
  });
}

async function createQueuedReport(world: object): Promise<Record<string, unknown>> {
  const state = stateOf(world);
  await realPage(world);
  assert.ok(state.context, 'real report context is absent');
  await state.context.setOffline(true);
  await completeAndSend(world);
  const reports = await browserQueuedReports(world);
  await state.context.setOffline(false);
  assert.equal(reports.length, 1, 'WHAT: the real offline report flow did not retain one durable report. HOW: commit the browser-created label before a send attempt.');
  state.queuedReport = reports[0]!;
  return state.queuedReport;
}

async function letRealPageHandleQueuedReport(world: object): Promise<void> {
  const state = stateOf(world);
  const page = await realPage(world);
  await page.goto(`${state.origin}/spots/${SPOT}/reportar/`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  state.sentText = await pageText(world);
}

async function sendQueuedReportThroughPublicHandler(world: object, change: Partial<Record<string, unknown>> = {}): Promise<void> {
  const state = stateOf(world);
  const row = state.queuedReport ?? await createQueuedReport(world);
  const credential = state.handlerCredential ?? process.env.REPORT_ACCEPTANCE_CREDENTIAL?.trim();
  assert.ok(credential, 'WHAT: the real public report handler has no acceptance credential. HOW: provision REPORT_ACCEPTANCE_CREDENTIAL for the real test device; do not substitute a fake handler.');
  state.handlerCredential = credential;
  const result = await (await realPage(world)).evaluate(async ({ origin, report, token }) => {
    const response = await fetch(`${origin}/api/report`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-surf-credential': token },
      body: JSON.stringify(report),
    });
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { /* front-door 429 may be bodyless */ }
    return { status: response.status, body };
  }, { origin: state.origin!, report: { ...row, ...change }, token: credential });
  state.handlerResults.push(result);
}

async function pageText(world: object): Promise<string> {
  return (await (await realPage(world)).locator('body').innerText()).trim();
}

function assertPlain(text: string, outcome: string): void {
  for (const raw of ['undefined', 'NaN', 'Error', '{"error"', 'HTTP']) {
    assert.ok(!text.includes(raw), `WHAT: ${outcome} shows raw technical text ${JSON.stringify(raw)}. HOW: render a plain Spanish state.`);
  }
}

function assertVisible(text: string, alternatives: readonly string[], outcome: string): void {
  assert.ok(
    alternatives.some((word) => text.toLocaleLowerCase('es').includes(word.toLocaleLowerCase('es'))),
    `WHAT: the surfer cannot see ${outcome}. Screen text: ${JSON.stringify(text.slice(0, 500))}. HOW: render the settled receipt from the real report response.`,
  );
}

type VisibleStateInspection = {
  scrollWidth: number;
  clientWidth: number;
  targets: { label: string; width: number; height: number }[];
  minimumContrast: number;
};

async function assertVisibleStateQuality(world: object): Promise<void> {
  const page = await realPage(world);
  // Evaluated from a STRING for the same tsx/esbuild `__name` reason as the
  // clock init script above: the compiled inner helper bindings (rgb,
  // luminance, contrast) reference a `__name` helper that does not exist in
  // the page global, so the function form threw ReferenceError inside
  // page.evaluate on every quality inspection.
  const inspect = async (): Promise<VisibleStateInspection> => page.evaluate(`(() => {
    const rgb = (value) => {
      const match = value.match(/^rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
    };
    const luminance = ([red, green, blue]) => [red, green, blue]
      .map((part) => {
        const channel = part / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const textRatios = Array.from(document.querySelectorAll('body, body *')).flatMap((element) => {
      if (!element.innerText || !element.innerText.trim()) return [];
      const foreground = rgb(getComputedStyle(element).color);
      let backdrop = null;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.backgroundImage !== 'none') continue;
        const candidate = rgb(style.backgroundColor);
        if (candidate && !/^rgba?\\(0,\\s*0,\\s*0,\\s*0\\)$/.test(style.backgroundColor)) {
          backdrop = candidate;
          break;
        }
      }
      return foreground && backdrop ? [contrast(foreground, backdrop)] : [];
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      targets: Array.from(document.querySelectorAll('button, a, input, select, textarea'))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { label: (element.textContent || element.getAttribute('aria-label') || element.tagName).trim(), width: box.width, height: box.height };
        }),
      minimumContrast: textRatios.length ? Math.min(...textRatios) : 0,
    };
  })()`) as Promise<VisibleStateInspection>;
  const light = await inspect();
  assert.ok(light.scrollWidth <= light.clientWidth, `WHAT: the visible report state scrolls sideways at 390 px (${light.scrollWidth}px). HOW: keep the state inside the phone width.`);
  assert.ok(light.minimumContrast >= 4.5, `WHAT: visible report text is below WCAG AA against its rendered light backdrop (${light.minimumContrast.toFixed(2)}:1). HOW: use a readable foreground/background pair.`);
  for (const target of light.targets) {
    assert.ok(target.width >= 44 && target.height >= 44, `WHAT: ${JSON.stringify(target.label)} is ${target.width}×${target.height}px. HOW: visible report actions need 44 px targets.`);
  }
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const dark = { ...(await inspect()), moving: await page.evaluate(`Array.from(document.querySelectorAll('body, body *')).filter((element) => {
      const style = getComputedStyle(element);
      return style.animationName !== 'none' && style.animationDuration !== '0s';
    }).length`) as number };
  assert.ok(dark.scrollWidth <= dark.clientWidth, `WHAT: the visible report state scrolls sideways in dark theme at 390 px (${dark.scrollWidth}px). HOW: keep the state inside the phone width.`);
  assert.ok(dark.minimumContrast >= 4.5, `WHAT: visible report text is below WCAG AA against its rendered dark backdrop (${dark.minimumContrast.toFixed(2)}:1). HOW: use a readable foreground/background pair.`);
  assert.equal(dark.moving, 0, 'WHAT: the visible report state still animates with reduced motion requested. HOW: disable its animation in that preference.');
}

Given('Playa Venao can receive reports now', async function (this: object) {
  await realPage(this);
});

Given('a surfer opens the real report screen for Playa Venao', async function (this: object) {
  await realPage(this);
});

Given('a surfer has just seen their report arrive at Playa Venao', async function (this: object) {
  await createQueuedReport(this);
  await sendQueuedReportThroughPublicHandler(this);
  assert.equal(stateOf(this).handlerResults[0]?.status, 200, 'WHAT: the browser-created report did not reach the real public handler. HOW: make the real receipt available.');
});

Given('a surfer has a saved report for Playa Venao', async function (this: object) {
  await createQueuedReport(this);
});

Given('a real report device has reached its daily allowance', async function (this: object) {
  const credential = process.env.REPORT_ACCEPTANCE_QUOTA_CREDENTIAL?.trim();
  assert.ok(credential, 'WHAT: no real quota-exhausted report device is provisioned. HOW: provide REPORT_ACCEPTANCE_QUOTA_CREDENTIAL for a real device already at its daily allowance; do not forge a quota response.');
  stateOf(this).handlerCredential = credential;
  stateOf(this).handlerMode = 'quota';
});

Given('a surfer has a saved report for a beach Surfs Up Panama does not know', async function (this: object) {
  await createQueuedReport(this);
  stateOf(this).handlerMode = 'unknown';
});

Given('a call is available for the surfer\'s report at Playa Venao', async function (this: object) {
  await realPage(this);
});

Given('no call is available for the surfer\'s report at Playa Venao', async function (this: object) {
  await realPage(this);
});

Given('the surfer\'s phone clock is far ahead', async function (this: object) {
  stateOf(this).clockOffsetMs = 20 * 60 * 1000;
});

Given('a surfer has just been told their phone clock is wrong', async function (this: object) {
  stateOf(this).clockOffsetMs = 20 * 60 * 1000;
  await resetBrowser(this);
  await completeAndSend(this);
  assertVisible(await pageText(this), ['hora', 'reloj'], 'a plain clock refusal');
});

Given('the surfer corrects the phone clock', async function (this: object) {
  stateOf(this).clockOffsetMs = 0;
  await resetBrowser(this);
});

When('the surfer completes and sends a waist to chest, choppy and good report', async function (this: object) {
  await completeAndSend(this);
});

When('the surfer completes and sends a fresh waist to chest, choppy and good report', async function (this: object) {
  await completeAndSend(this);
});

When('the surfer sends the same report again', async function (this: object) {
  await sendQueuedReportThroughPublicHandler(this);
});

When('the surfer sends the saved report', async function (this: object) {
  if (stateOf(this).handlerMode === 'quota') {
    await sendQueuedReportThroughPublicHandler(this);
  } else if (stateOf(this).handlerMode === 'unknown') {
    await sendQueuedReportThroughPublicHandler(this, { spot_id: 'not-a-known-spot' });
  } else {
    await sendQueuedReportThroughPublicHandler(this);
  }
});

When('the surfer opens the report screen with signal', async function (this: object) {
  const state = stateOf(this);
  await (await realPage(this)).goto(`${state.origin}/spots/${SPOT}/reportar/`, { waitUntil: 'load' });
  await (await realPage(this)).waitForTimeout(500);
  state.sentText = await pageText(this);
});

When('a visitor opens the reported screen without sending a report', async function (this: object) {
  const page = await realPage(this);
  await page.goto(`${stateOf(this).origin}/spots/${SPOT}/reportado/`, { waitUntil: 'load' });
});

When('the surfer waits without changing the clock', async function (this: object) {
  await (await realPage(this)).waitForTimeout(1_000);
});

// The R4/R26 reconciliation, 2026-08-13 (deliver/wave-decisions.md). A report
// that sends itself when the screen opens is acknowledged neutrally in place;
// its result is reached by an explicit choice. The local twin of this oracle,
// which also proves the send really happened, is
// steps/report-flush.steps.ts.
Then('the report that was waiting goes through with the form still blank', async function (this: object) {
  const page = await realPage(this);

  // Vacuity guard, mirroring the local twin. This oracle is only worth
  // something if the flush actually fired: a screen showing no reveal because
  // it never sent anything would satisfy every assertion below. The
  // acknowledgement and its link are the visible proof the send completed, and
  // the drained durable row is the proof it will not send itself twice. Awaited
  // rather than read off a fixed 500 ms snapshot, because a slow real handler
  // would otherwise let the wording assertions pass before the flush lands.
  await page.locator('[data-storage-notice] a').first().waitFor({ state: 'visible', timeout: 15_000 });
  const deadline = Date.now() + 5_000;
  let remaining = (await browserQueuedReports(this)).length;
  while (remaining > 0 && Date.now() < deadline) {
    await page.waitForTimeout(50);
    remaining = (await browserQueuedReports(this)).length;
  }
  assert.equal(
    remaining,
    0,
    `WHAT: ${remaining} acknowledged report(s) stayed in the durable queue after the flush. WHY: a report that went through must not send itself twice. HOW: discard it on its matching receipt.`,
  );

  assert.match(
    new URL(page.url()).pathname,
    new RegExp(`^/spots/${SPOT}/reportar/?$`),
    `WHAT: the flush moved the screen off the report form (now ${new URL(page.url()).pathname}). WHY: a surfer filing today's report must never be blocked by yesterday's delivery (R4). HOW: acknowledge the flush in place.`,
  );
  assert.equal(
    await page.locator('[data-report-form]').count(),
    1,
    'WHAT: the flush took the report form off the screen. WHY: reopening the report screen starts a blank report (R4). HOW: leave the form standing.',
  );
  assert.equal(
    await page.locator('input[type="radio"]:checked').count(),
    0,
    'WHAT: the form screen opened with answers already picked after the flush. WHY: every visit is a blank report with a fresh identity (R4).',
  );
  const text = await pageText(this);
  for (const wording of ['Reporte recibido', 'Recibimos', 'llegó', 'Así nos fue', 'Dijimos', 'Tú viste', 'punto']) {
    assert.ok(
      !text.toLocaleLowerCase('es').includes(wording.toLocaleLowerCase('es')),
      `WHAT: the form screen shows reveal wording ${JSON.stringify(wording)} after a flush. WHY: the prior report's result above a fresh blank form anchors the new capture to our own answer (docs/DISCUSS-decisions.md, RESOLVED anchoring). HOW: put the receipt behind an explicit link.`,
    );
  }
  assert.ok(
    !/\d/.test(text),
    `WHAT: the form screen shows a number after a flush: ${JSON.stringify(text.slice(0, 300))}. WHY: our number arriving before the surfer answers cold is the anchoring leak decision 28 closes. HOW: keep the acknowledgement number-free.`,
  );
  assert.equal(
    await page.locator('[data-storage-notice] a').count(),
    1,
    'WHAT: the acknowledgement offers no single explicit way to see how that report went. WHY: the receipt stays reachable, but only by choice. HOW: render exactly one link to it.',
  );
});

When('the surfer opens the earlier report', async function (this: object) {
  const page = await realPage(this);
  await page.locator('[data-storage-notice] a').first().click({ timeout: 5_000 });
  await page.waitForTimeout(250);
});

Then('the surfer sees that their report arrived', async function (this: object) {
  const text = await pageText(this);
  assertVisible(text, ['llegó', 'recibido', 'recibimos'], 'that their report arrived');
  assertPlain(text, 'the arrival state');
  await assertVisibleStateQuality(this);
});

Then('the arrival says nothing about our forecast', async function (this: object) {
  const text = await pageText(this);
  for (const leak of ['Dijimos', 'puntos', 'pronóstico', 'score']) {
    assert.ok(!text.includes(leak), `WHAT: the arrival leaks ${JSON.stringify(leak)} before Slice-04. HOW: keep arrival separate from comparison.`);
  }
});

Then('nothing in the arrival reads as an error', async function (this: object) {
  assertPlain(await pageText(this), 'the arrival state');
});

Then('the surfer sees one arrival, not two', async function (this: object) {
  const results = stateOf(this).handlerResults;
  assert.equal(results.length, 2, 'WHAT: the exact browser-created report was not sent twice to the real handler. HOW: retry its durable identity, never compose a new form submission.');
  assert.equal(results[0]!.body.report_id, results[1]!.body.report_id, 'WHAT: the retry changed report identity. HOW: resend the durable browser-created report byte-for-byte.');
  assert.equal(results[1]!.body.outcome, 'queued_duplicate', 'WHAT: the second real-handler receipt did not recognize the same report. HOW: return the original receipt without storing another report.');
  await letRealPageHandleQueuedReport(this);
  assertVisible(await pageText(this), ['llegó', 'recibido', 'recibimos'], 'the single settled arrival after retry');
});

Then('the report is deferred until the next day', async function (this: object) {
  const state = stateOf(this);
  assert.equal(state.handlerResults.at(-1)?.status, 429, 'WHAT: the real quota boundary did not say the report must wait. HOW: return the real 429 receipt.');
});

Then('the report is refused because the named beach is not known', async function (this: object) {
  const result = stateOf(this).handlerResults.at(-1);
  assert.equal(result?.status, 400, 'WHAT: an unknown beach did not receive the real public-handler refusal. HOW: reject it before storage.');
  assert.equal(result?.body.error && typeof result.body.error === 'object' && (result.body.error as Record<string, unknown>).code, 'unknown_spot', 'WHAT: the public refusal does not name the unknown beach. HOW: return the settled reason.');
});

Then('the surfer sees what we said and what they saw', async function (this: object) {
  const text = await pageText(this);
  assertVisible(text, ['Dijimos'], 'what we said');
  assertVisible(text, ['Tú viste'], 'what the surfer saw');
  await assertVisibleStateQuality(this);
});

Then('the surfer sees whether we ran big or small in points', async function (this: object) {
  assertVisible(await pageText(this), ['Nos pasamos', 'nos quedamos cortos'], 'the signed difference');
});

Then('the surfer sees the report count for Playa Venao', async function (this: object) {
  assert.match(await pageText(this), /Reporte\s+\d+\s+de\s+\d+/i, 'WHAT: the reveal has no report count. HOW: render the count returned with the real receipt.');
});

Then('the surfer is told there is nothing to compare', async function (this: object) {
  assert.ok((await pageText(this)).includes('Gracias. Esa hora no la teníamos pronosticada, así que no hay comparación.'), 'WHAT: the real no-call result is not the settled honest sentence. HOW: render it verbatim.');
});

Then('the screen invents no number or partial comparison', async function (this: object) {
  const text = await pageText(this);
  assert.ok(!/\d/.test(text) && !text.includes('Dijimos'), 'WHAT: a no-call state invents a number or partial comparison. HOW: show only the honest sentence.');
});

Then('the visitor sees only a general thanks', async function (this: object) {
  assertVisible(await pageText(this), ['Gracias'], 'a general thanks');
});

Then('the visitor sees no comparison or way to edit a label', async function (this: object) {
  const page = await realPage(this);
  const text = await pageText(this);
  assert.ok(!text.includes('Dijimos'), 'WHAT: direct navigation reveals a comparison. HOW: reserve the reveal for the sent report response.');
  assert.equal(await page.locator('form, input, select, textarea, a[href*="reportar"]').count(), 0, 'WHAT: a direct visitor can edit a label. HOW: show no edit path.');
});

Then('the surfer sees a plain explanation and keeps the label', async function (this: object) {
  const text = await pageText(this);
  assertVisible(text, ['hora', 'reloj'], 'a plain clock explanation');
  assertVisible(text, ['Cintura a pecho', 'Picado', 'Bueno'], 'the retained label');
  assertPlain(text, 'the clock refusal');
  await assertVisibleStateQuality(this);
});

Then('the refusal says nothing about our forecast', async function (this: object) {
  assert.ok(!['Dijimos', 'puntos', 'score'].some((leak) => (stateOf(this).sentText || '').includes(leak)), 'WHAT: a refusal leaks forecast information. HOW: keep it forecast-free.');
});

Then('the surfer still sees the same refusal and the same label', async function (this: object) {
  const text = await pageText(this);
  assertVisible(text, ['hora', 'reloj'], 'the same refusal');
  assertVisible(text, ['Cintura a pecho', 'Picado', 'Bueno'], 'the same label');
});

Then('the report does not try itself again', async function (this: object) {
  assert.equal(await pageText(this), stateOf(this).sentText, 'WHAT: waiting changed a clock refusal. HOW: keep a permanent refusal settled without automatic retry.');
});
