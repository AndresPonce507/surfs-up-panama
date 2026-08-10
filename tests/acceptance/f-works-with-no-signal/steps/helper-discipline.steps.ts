// Slice-01 helper discipline: what the offline helper may never keep, what it
// may weigh, and the seat it leaves for the later alerts feature. Every step
// drives the production surface: the real `npm run build` and its printed
// measurement, the emitted dist/ served over real HTTP, and Chromium at 390 px
// sending a real POST through the real registered helper.
//
// The planted answer is the deliberately poisoned fixture of
// application-architecture.md section 9 (clause check:unfired-is-not-evidence)
// carried onto the real surface instead of a unit fixture: the poison is real,
// it is present on the phone, and the helper is watched refusing to serve it.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  HELPER_CEILING_BYTES,
  LIVE_ANSWER_MARK,
  OFFLINE_PAGE_CEILING_BYTES,
  PLANTED_ANSWER_MARK,
  REGISTRATION_CEILING_BYTES,
  WRITE_PATH,
  appendAlertsListenersToHelper,
  assertBuiltSite,
  builtFileBytes,
  ensureBuiltSite,
  failureContext,
  freshPhone,
  gzippedBytes,
  helperUrlFromBuiltHome,
  keptOnPhone,
  plantAnswerOnPhone,
  registrationSnippetFromBuiltHome,
  scenarioState,
  sendReport,
  setSignal,
} from './support/world';

/** The document the offline fallback is built as, per the section 4 route map. */
const OFFLINE_PAGE_DOCUMENT = 'sin-senal.html';
const OFFLINE_PAGE_ROUTE = '/sin-senal';

/** What the build printed the last time a step asked it. */
let measurement = '';

function pathOf(url: string): string {
  return url.startsWith('http') ? new URL(url).pathname : url;
}

// ---------- Givens ----------

Given('an answer to a sent report has been planted on the phone', { timeout: 60_000 }, async function (this: object) {
  await plantAnswerOnPhone(scenarioState(this));
});

// ---------- Whens ----------

When("the surfer's phone sends a report while the signal holds", { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  setSignal(state, 'online');
  await sendReport(state);
});

When("the signal drops and the surfer's phone tries to send a report", { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  setSignal(state, 'blackout');
  await sendReport(state);
});

When(
  'a later alerts feature adds its own listeners to the end of the helper',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    appendAlertsListenersToHelper(state);
    // A brand new phone, so the amended helper is the one that installs. The
    // repository build output is never touched: the amended helper is served
    // from memory for this scenario only.
    await freshPhone(state);
  },
);

When('the site owner weighs everything this slice adds', { timeout: 300_000 }, async function (this: object) {
  scenarioState(this);
  await assertBuiltSite();
});

When('the site owner reads the weight measurement the build printed', { timeout: 300_000 }, async function (this: object) {
  scenarioState(this);
  const build = await ensureBuiltSite();
  measurement = build.output;
});

// ---------- Thens ----------

Then('the answer comes from the site, not from the phone', function (this: object) {
  const state = scenarioState(this);
  const sent = state.lastSend;
  assert.ok(sent, `test bug: no report was sent before this check.${failureContext(state)}`);
  assert.ok(
    sent.body.includes(LIVE_ANSWER_MARK),
    `WHAT: the answer to the sent report did not come from the site. Status ${sent.status}, `
      + `answer ${JSON.stringify(sent.body.slice(0, 200))}, error ${sent.error ?? 'none'}. `
      + 'WHY: the write path is network-only, and its answer is the one thing that must always be '
      + 'the live one. HOW: let a sent report go straight to the network and hand back what the '
      + `site said (application-architecture.md section 12, rows 5 and 6).${failureContext(state)}`,
  );
  assert.ok(
    !sent.body.includes(PLANTED_ANSWER_MARK),
    'WHAT: the answer to the sent report was the copy sitting on the phone, not the site\'s. '
      + 'WHY: an answer served from a copy is a report that reads as sent when it was not. '
      + `HOW: never answer the write path from anything kept on the phone.${failureContext(state)}`,
  );
});

Then('nothing about the sent report is kept on the phone', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const kept = await keptOnPhone(state);
  const offenders = kept.filter((address) => {
    try {
      return new URL(address).pathname === WRITE_PATH;
    } catch {
      return address.includes(WRITE_PATH);
    }
  });
  assert.deepEqual(
    offenders,
    [],
    `WHAT: the phone is holding a copy of the sent report's address: ${JSON.stringify(offenders)}. `
      + 'WHY: the write path is never cached, by fixed contract, because a neighbouring feature '
      + 'depends on that row and will never edit this helper. A kept answer is a reveal that can '
      + 'be served again to somebody who never sent anything. '
      + `HOW: keep the write path out of every store the helper writes to.${failureContext(state)}`,
  );
});

Then('the phone never answers with the planted copy', function (this: object) {
  const state = scenarioState(this);
  const sent = state.lastSend;
  assert.ok(sent, `test bug: no report was sent before this check.${failureContext(state)}`);
  assert.ok(
    !sent.body.includes(PLANTED_ANSWER_MARK),
    `WHAT: with no signal, sending a report was answered from a copy planted on the phone: `
      + `${JSON.stringify(sent.body.slice(0, 200))}. `
      + 'WHY: this is the deliberately poisoned case the router has to refuse. A helper that '
      + 'matches on the address, or that looks a request up ignoring its method, or that lets the '
      + 'write path fall through to a cache-first branch, hands this back and the surfer is told '
      + 'their report went out when it never left the phone. '
      + `HOW: the write path is network-only: never kept, never served from a copy.${failureContext(state)}`,
  );
});

Then('not one line the helper already had has changed', function (this: object) {
  const state = scenarioState(this);
  const source = state.helperSource;
  assert.ok(
    source,
    'WHAT: the built site starts no offline helper, so there is nothing for a later alerts '
      + 'feature to be added to. WHY: the seat for the alerts feature is a promise this slice '
      + 'makes to the lane that comes next: it adds two new listener registrations at the end of '
      + 'the file and edits nothing. HOW: ship the helper as one router table plus independent '
      + `listener registrations.${failureContext(state)}`,
  );
  assert.ok(
    source.amended.startsWith(source.original),
    'WHAT: adding the alerts listeners did not leave the helper it already had byte for byte '
      + 'intact. WHY: the seat is only real if adding to it is an append. '
      + `HOW: append the new registrations at the end of the file.${failureContext(state)}`,
  );
  assert.ok(
    source.amended.length > source.original.length,
    `test bug: the alerts listeners added nothing.${failureContext(state)}`,
  );
});

Then('the offline helper weighs 3 KB gzipped or less', function (this: object) {
  const state = scenarioState(this);
  const url = helperUrlFromBuiltHome();
  assert.ok(
    url,
    'WHAT: the built home page starts no offline helper, so there is nothing to weigh. '
      + 'WHY: the helper is a booked line item of the home page\'s first visit, not headroom. '
      + `HOW: ship the helper and start it from the inline snippet.${failureContext(state)}`,
  );
  const bytes = builtFileBytes(pathOf(url));
  assert.ok(
    bytes,
    `WHAT: the home page starts an offline helper at ${pathOf(url)} and the build emitted no such file. `
      + 'WHY: a helper the page asks for and the build does not emit is a request that fails on '
      + `every first visit. HOW: emit it in the build output.${failureContext(state)}`,
  );
  const measured = gzippedBytes(bytes);
  assert.ok(
    measured <= HELPER_CEILING_BYTES,
    `WHAT: the offline helper at ${pathOf(url)} weighs ${measured} B gz, over its ceiling of `
      + `${HELPER_CEILING_BYTES} B gz. WHY: the helper spends booked budget on the home page's `
      + 'first visit; over the ceiling it eats the two-second beach-3G promise. '
      + `HOW: cut the helper back under 3 KB gzipped.${failureContext(state)}`,
  );
});

Then('the sin señal page weighs 3 KB gzipped or less', function (this: object) {
  const state = scenarioState(this);
  const bytes = builtFileBytes(OFFLINE_PAGE_DOCUMENT);
  assert.ok(
    bytes,
    `WHAT: the build emitted no ${OFFLINE_PAGE_DOCUMENT}, so ${OFFLINE_PAGE_ROUTE} does not exist. `
      + 'WHY: it is the page a surfer with nothing kept on their phone lands on, and it is '
      + 'precached so it works with no origin at all. '
      + `HOW: build the route with its settled Spanish copy and no JavaScript.${failureContext(state)}`,
  );
  const measured = gzippedBytes(bytes);
  assert.ok(
    measured <= OFFLINE_PAGE_CEILING_BYTES,
    `WHAT: ${OFFLINE_PAGE_ROUTE} weighs ${measured} B gz, over its ceiling of ${OFFLINE_PAGE_CEILING_BYTES} B gz. `
      + 'WHY: the route map gives this document 3 KB and a phone with no signal is the worst '
      + `moment to be heavy. HOW: cut it back under 3 KB gzipped.${failureContext(state)}`,
  );
});

Then('the line that starts the helper weighs 0.2 KB or less', function (this: object) {
  const state = scenarioState(this);
  const snippet = registrationSnippetFromBuiltHome();
  assert.ok(
    snippet,
    'WHAT: the built home page carries no inline line that starts the offline helper. '
      + 'WHY: the site works fully without the helper and the helper is enhancement only, so it '
      + 'is started by one small inline line after load, not by a downloaded script. '
      + `HOW: add the inline registration snippet (application-architecture.md section 6).${failureContext(state)}`,
  );
  const measured = Buffer.byteLength(snippet);
  assert.ok(
    measured <= REGISTRATION_CEILING_BYTES,
    `WHAT: the line that starts the helper weighs ${measured} B, over its ceiling of `
      + `${REGISTRATION_CEILING_BYTES} B. WHY: it sits inside the home document's 14 KB and its `
      + 'booked size is 0.2 KB. HOW: cut it back.'
      + failureContext(state),
  );
});

Then('the sin señal page is measured by name with its bytes and its 3 KB ceiling', function (this: object) {
  const state = scenarioState(this);
  const line = measurement
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`route ${OFFLINE_PAGE_ROUTE} `) || entry.startsWith(`route ${OFFLINE_PAGE_ROUTE}(`));
  assert.ok(
    line,
    `WHAT: the weight measurement the build printed never names ${OFFLINE_PAGE_ROUTE} as a route it measured. `
      + 'WHY: this slice builds that page, and an emitted route nobody weighed is a promise nobody '
      + 'kept. HOW: build the page and declare its 3 KB ceiling alongside the other routes in '
      + `scripts/page-weight-core.mjs.${failureContext(state)}`,
  );
  assert.ok(
    /document [\d,]+ B gz/.test(line) && /ceiling 3 KB/.test(line),
    `WHAT: ${OFFLINE_PAGE_ROUTE} is named but not measured against its declared ceiling: ${JSON.stringify(line)}. `
      + 'WHY: a passing result has to be evidence, which means measured bytes beside the ceiling '
      + `they were compared to. HOW: measure it like every other declared route.${failureContext(state)}`,
  );
});

Then(
  'the measurement no longer lists the sin señal page among the routes it does not build',
  function (this: object) {
    const state = scenarioState(this);
    const line = measurement
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('not measured, declared in section 4 but not built'));
    assert.ok(
      line,
      `WHAT: the weight measurement printed no line naming the routes it does not build. `
        + 'WHY: a reader has to see the edge of what was measured. '
        + `HOW: keep that line and take the offline page out of it.${failureContext(state)}`,
    );
    assert.ok(
      !line.includes(OFFLINE_PAGE_ROUTE),
      `WHAT: the measurement still calls ${OFFLINE_PAGE_ROUTE} a route this site does not build: ${JSON.stringify(line)}. `
        + 'WHY: this slice builds it, so that sentence is now false, and a gate that states a '
        + 'falsehood about its own coverage is worse than one that fails. '
        + 'HOW: drop it from DECLARED_BUT_UNBUILT in scripts/page-weight-core.mjs and from '
        + `DECLARED_BUT_UNBUILT_ROUTES in the keystone's page-weight steps, in the same change.${failureContext(state)}`,
    );
  },
);
