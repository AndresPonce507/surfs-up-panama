// The R4/R26 reconciliation, decided 2026-08-13 (see
// docs/feature/f-tell-us-what-you-saw-cold/deliver/wave-decisions.md).
//
// R26 keeps its trigger: opening the report screen still sends a report that
// was waiting, once and only once. R4 keeps its surface: that screen is still
// a blank form with a fresh identity, and Back still never lands on an
// editable form. The rule that decides between them is the feature's own core
// law, the RESOLVED anchoring section of docs/DISCUSS-decisions.md: cold
// absolute capture before any reveal. So the flushed report's RESULT may not
// render on the form screen. It is acknowledged by a neutral, number-free
// line in the existing notice surface, and its receipt is reachable only by
// an explicit link.
//
// These steps drive the same production surface every other slice-01/03 step
// drives (support/world.ts): the real `npm run build` output over real HTTP,
// walked by Chromium at 390 px, with the real local write adapter mounted at
// /api/mint and /api/report. Observation is limited to what the surfer sees,
// to the durable on-phone queue, and to browser-observed write traffic. No
// step here routes, intercepts, or manufactures a request.

import { Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { QUALITY_TOKENS, WIND_STATE_TOKENS } from '../../../../src/data/report-vocab';
import { sizeBands } from '../../../../src/data/size-bands';
import { strings } from '../../../../src/i18n/strings';
import {
  SPOT_ID,
  failureContext,
  observedWriteResponse,
  phonePage,
  queuedReports,
  scenarioState,
  visibleText,
  type ReportFlowScenario,
} from './support/world';

const REPORTAR_PATHNAME_PATTERN = new RegExp(`^/spots/${SPOT_ID}/reportar/?$`);

/** Crockford base32, 26 characters: the shape of a client-minted ULID. */
const ULID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i;

/**
 * Every word an arrival or a reveal surface is allowed to use, and therefore
 * every word the form screen may not show after a flush. Sourced from the two
 * modules that own that copy: src/report/reveal.ts (RECEIVED_*, COMPARED_*,
 * NO_CALL_*, DEAD_ON_*, the said/saw/difference/count line templates) and
 * src/report/island.ts (CONFIRMED_HEADING). Matching is case-insensitive and
 * accent-exact, the same way the shipped oracles in
 * report-arrival-and-reveal.steps.ts match arrival wording.
 */
const REVEAL_WORDING: readonly string[] = [
  'Reporte recibido',
  'Recibimos',
  'llegó',
  'Así nos fue',
  'Dijimos',
  'Tú viste',
  'punto',
  'Le dimos justo',
  'Nos pasamos',
  'Nos quedamos cortos',
  'pronosticada',
  'Reporte guardado',
];

/** The one shared vocabulary, in the words a surfer reads. A flush acknowledgement
 * may not repeat any of them: naming the size the phone already sent is the
 * anchor the cold-capture rule exists to remove. */
const REPORT_VOCABULARY_WORDS: readonly string[] = [
  ...sizeBands.map((band) => band.label.es),
  ...strings.es.report.windOptions.map((option) => option.label),
  ...strings.es.report.qualityOptions.map((option) => option.label),
  ...WIND_STATE_TOKENS,
  ...QUALITY_TOKENS,
];

function pathnameOf(url: string): string {
  return new URL(url).pathname;
}

function includesWord(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase('es').includes(needle.toLocaleLowerCase('es'));
}

/**
 * The report_id each observed POST to /api/report carried. Read off the
 * browser-observed request body, never off a helper that sent anything.
 */
function sentReportIdentities(state: ReportFlowScenario): string[] {
  return state.writeAttempts.flatMap((attempt) => {
    if (pathnameOf(attempt.url) !== '/api/report') return [];
    try {
      const identity = (JSON.parse(attempt.body ?? '') as { report_id?: unknown }).report_id;
      return typeof identity === 'string' ? [identity] : [];
    } catch {
      return [];
    }
  });
}

/**
 * The accepted answer for a flushed report, not merely the first one. A first
 * report attempt on a fresh phone legitimately comes back 401, which the
 * island answers with a silent mint-and-retry (R22, 07-write-path.md section
 * 3): asserting on the first observed response would read that designed
 * recovery as a failure.
 */
async function acceptedReportResponse(
  state: ReportFlowScenario,
  timeoutMilliseconds = 8_000,
): Promise<{ readonly status: number; readonly seen: readonly number[] }> {
  const deadline = Date.now() + timeoutMilliseconds;
  const answers = (): readonly number[] => state.captured
    .filter((response) => pathnameOf(response.url) === '/api/report')
    .map((response) => response.status);
  let seen = answers();
  while (!seen.includes(200) && Date.now() < deadline) {
    await new Promise<void>((resolvePause) => { setTimeout(resolvePause, 25); });
    seen = answers();
  }
  return { status: seen.includes(200) ? 200 : (seen.at(-1) ?? 0), seen };
}

async function waitForDrainedQueue(state: ReportFlowScenario, timeoutMilliseconds = 5_000): Promise<number> {
  const deadline = Date.now() + timeoutMilliseconds;
  let remaining = (await queuedReports(state)).length;
  while (remaining > 0 && Date.now() < deadline) {
    await new Promise<void>((resolvePause) => { setTimeout(resolvePause, 25); });
    remaining = (await queuedReports(state)).length;
  }
  return remaining;
}

async function noticeText(state: ReportFlowScenario): Promise<string> {
  const page = await phonePage(state);
  const notice = page.locator('[data-storage-notice]');
  const visible = await notice.isVisible().catch(() => false);
  if (!visible) return '';
  return ((await notice.textContent()) ?? '').trim();
}

// ---------------------------------------------------------------------------
// The deciding rule, as one negative oracle.
// ---------------------------------------------------------------------------

Then(
  'the earlier report goes through and leaves no reveal on the form screen',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const page = await phonePage(state);

    // Vacuity guard first. This negative is only worth anything if the flush
    // actually fired: a screen that shows no reveal because it never sent
    // anything would satisfy every assertion below and prove nothing.
    const sent = await observedWriteResponse(state, '/api/report', 5_000);
    assert.ok(
      sent,
      'WHAT: opening the report screen sent nothing, so there is no flush to judge. WHY: R26 keeps '
        + 'the page-open flush trigger; a queued report sends itself once, and only once. HOW: send '
        + `the waiting report when the report screen opens.${failureContext(state)}`,
    );
    const accepted = await acceptedReportResponse(state);
    assert.equal(
      accepted.status,
      200,
      `WHAT: the waiting report was never accepted (answers seen: ${accepted.seen.join(', ')}). HOW: send the durable record unchanged, minting silently on a 401.${failureContext(state)}`,
    );
    const remaining = await waitForDrainedQueue(state);
    assert.equal(
      remaining,
      0,
      `WHAT: ${remaining} acknowledged report(s) stayed in the durable queue after the flush. WHY: a `
        + `report that went through must not send itself twice. HOW: discard it on its matching receipt.${failureContext(state)}`,
    );

    // R4's surface, unchanged by R26's trigger.
    const pathname = pathnameOf(page.url());
    assert.match(
      pathname,
      REPORTAR_PATHNAME_PATTERN,
      `WHAT: the flush moved the screen to ${pathname}. WHY: the surfer opened the report screen to `
        + 'file today\'s report, and yesterday\'s delivery must never take that screen away from '
        + `them (R4, application-architecture.md section 8 L3). HOW: acknowledge the flush in place.${failureContext(state)}`,
    );
    const forms = await page.locator('[data-report-form]').count();
    assert.equal(
      forms,
      1,
      `WHAT: the form screen carries ${forms} report form(s) after the flush. WHY: a surfer filing `
        + `today's report must never be blocked by yesterday's delivery (R4). HOW: leave the form standing.${failureContext(state)}`,
    );
    const checked = await page.locator('input[type="radio"]:checked').count();
    assert.equal(
      checked,
      0,
      `WHAT: the form screen opened with ${checked} answer(s) already picked after the flush. WHY: `
        + `every visit is a blank report with a fresh identity (R4).${failureContext(state)}`,
    );

    // The deciding rule: cold absolute capture before any reveal.
    const text = await visibleText(state);
    for (const wording of REVEAL_WORDING) {
      assert.ok(
        !includesWord(text, wording),
        `WHAT: the form screen shows reveal wording ${JSON.stringify(wording)} after a flush. WHY: `
          + 'rendering the prior report\'s result above a fresh blank form anchors the new capture to '
          + 'our own answer, the exact bias the RESOLVED anchoring section of docs/DISCUSS-decisions.md '
          + 'removes. HOW: acknowledge the flush neutrally and put the receipt behind an explicit link.'
          + `${failureContext(state)}\nscreen said: ${JSON.stringify(text.slice(0, 400))}`,
      );
    }
    assert.ok(
      !/\d/.test(text),
      'WHAT: the form screen shows a number after a flush. WHY: a score, a metre range, a points '
        + 'difference or a report count is our number arriving before the surfer answers cold, which '
        + 'is the anchoring leak decision 28 closes. HOW: keep every flush acknowledgement number-free.'
        + `${failureContext(state)}\nscreen said: ${JSON.stringify(text.slice(0, 400))}`,
    );
  },
);

Then(
  'the acknowledgement carries no number, no size, no wind, no quality word and no comparison',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const acknowledgement = await noticeText(state);
    assert.ok(
      acknowledgement.length > 0,
      'WHAT: the flush left the screen silent. WHY: a report that sent itself must say so, or the '
        + 'surfer cannot tell whether the phone still holds it. HOW: acknowledge it in the existing '
        + `notice surface, in plain Spanish.${failureContext(state)}`,
    );
    assert.ok(
      !/\d/.test(acknowledgement),
      `WHAT: the flush acknowledgement carries a number: ${JSON.stringify(acknowledgement)}. HOW: keep it number-free.`,
    );
    for (const word of REPORT_VOCABULARY_WORDS) {
      assert.ok(
        !includesWord(acknowledgement, word),
        `WHAT: the flush acknowledgement repeats the report vocabulary word ${JSON.stringify(word)} in `
          + `${JSON.stringify(acknowledgement)}. WHY: naming the size, wind or quality the phone just sent `
          + 'anchors the next cold answer to the previous one. HOW: say only that the earlier report went through.',
      );
    }
    for (const wording of REVEAL_WORDING) {
      assert.ok(
        !includesWord(acknowledgement, wording),
        `WHAT: the flush acknowledgement carries reveal wording ${JSON.stringify(wording)} in `
          + `${JSON.stringify(acknowledgement)}. HOW: keep the reveal behind its explicit link.`,
      );
    }
    for (const technical of ['IndexedDB', 'Error', 'undefined', 'NaN', 'JSON', 'null']) {
      assert.ok(
        !acknowledgement.includes(technical),
        `WHAT: the flush acknowledgement leaks technical wording ${JSON.stringify(technical)} in ${JSON.stringify(acknowledgement)}. HOW: plain surfer Spanish only.`,
      );
    }
  },
);

Then(
  'the screen says plainly that the earlier report already went through',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const acknowledgement = await noticeText(state);
    assert.ok(
      acknowledgement.length > 0,
      'WHAT: the screen says nothing about the report it just sent. WHY: the surfer left a report '
        + 'waiting and is entitled to know it went through, without being shown its result. HOW: '
        + `render a neutral acknowledgement in the notice surface.${failureContext(state)}`,
    );
    const page = await phonePage(state);
    const receiptLinks = await page.locator('[data-storage-notice] a').count();
    assert.equal(
      receiptLinks,
      1,
      `WHAT: the acknowledgement offers ${receiptLinks} way(s) to see how that report went. WHY: the `
        + 'receipt must be reachable, but only by an explicit choice, never inline above a blank form. '
        + `HOW: render exactly one link to it.${failureContext(state)}`,
    );
    const label = ((await page.locator('[data-storage-notice] a').first().textContent()) ?? '').trim();
    assert.ok(
      label.length > 0,
      'WHAT: the way to the earlier report has no words. HOW: label it in plain Spanish.',
    );
  },
);

When(
  'the surfer follows the way to see how that earlier report went',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const page = await phonePage(state);
    await page.locator('[data-storage-notice] a').first().click({ timeout: 5_000 }).catch((error: unknown) => {
      state.failures.push({ label: 'follow the way to the earlier report', error });
    });
    await page.waitForTimeout(250);
  },
);

Then('the surfer sees that the earlier report arrived', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const text = await visibleText(state);
  assert.ok(
    /llegó|recibido|recibimos/i.test(text),
    `WHAT: following the way to the earlier report shows no arrival. WHY: the receipt is not hidden, `
      + 'only moved behind an explicit choice. HOW: render the arrival the receipt already carries.'
      + `${failureContext(state)}\nscreen said: ${JSON.stringify(text.slice(0, 400))}`,
  );
  for (const raw of ['undefined', 'NaN', 'Error', '{"']) {
    assert.ok(
      !text.includes(raw),
      `WHAT: the earlier report's arrival shows raw technical text ${JSON.stringify(raw)}. HOW: render a plain Spanish state.`,
    );
  }
});

// ---------------------------------------------------------------------------
// R4's identity promise, observed on the wire.
// ---------------------------------------------------------------------------

Then(
  'the two reports that left the phone carry two different identities',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const deadline = Date.now() + 5_000;
    let identities = new Set(sentReportIdentities(state));
    while (identities.size < 2 && Date.now() < deadline) {
      await new Promise<void>((resolvePause) => { setTimeout(resolvePause, 25); });
      identities = new Set(sentReportIdentities(state));
    }
    assert.equal(
      identities.size,
      2,
      `WHAT: ${identities.size} distinct report identit(y/ies) left the phone across two separate `
        + 'reports. WHY: every visit to the report screen is a new report with its own identity, and '
        + 'a report that already went through must never be resent under the second visit\'s label '
        + `(R4, application-architecture.md section 8 L3).${failureContext(state)}`,
    );
    for (const identity of identities) {
      assert.match(
        identity,
        ULID_PATTERN,
        `WHAT: ${JSON.stringify(identity)} is not a client-minted ULID. HOW: mint a ULID at each commit.`,
      );
    }
  },
);
