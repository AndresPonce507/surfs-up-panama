// Slice-01 reading journey. Every step drives the production surface: the real
// `npm run build` output served over real HTTP, walked by Chromium at 390 px,
// with the signal cut at the server rather than emulated in the browser (see
// support/world.ts for why). Observation is limited to what the surfer sees on
// the screen, to the origin's Cache Storage (the helper's own store) and to
// what the site was asked for.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  OFFLINE_SENTENCE_ONE_PREFIX,
  OFFLINE_SENTENCE_TWO,
  READING_SESSION_REQUEST_CEILING,
  UNVISITED_SPOT,
  VISITED_SPOT,
  assertBuiltSite,
  failureContext,
  goTo,
  helperStatus,
  keptOnPhone,
  normalise,
  openReportScreenWithSignal,
  phonePage,
  readHomeWithSignal,
  requestsAsked,
  scenarioState,
  setSignal,
  settleHelper,
  startCountingRequests,
  visibleText,
  type SignalScenario,
} from './support/world';

/** An address every built route asks for on first visit, so it is the small part every page draws with. */
const SMALL_PART = '/favicon.svg';

/** Machine text a Spanish surface may never show (project CLAUDE.md copy rules, R41). */
const MACHINE_TEXT = [
  { name: 'a raw timestamp', pattern: /\d{4}-\d{2}-\d{2}T/ },
  { name: 'a placeholder token', pattern: /[{}]/ },
  { name: 'a machine word', pattern: /\b(undefined|null|NaN)\b/ },
  { name: 'English', pattern: /\b(the|signal|Offline|Retry|Reload)\b/ },
];

async function screenText(state: SignalScenario): Promise<string> {
  return normalise(await visibleText(state));
}

// ---------- Givens ----------

Given(
  'the built site is running as it would be at the beach',
  { timeout: 300_000 },
  async function (this: object) {
    scenarioState(this);
    await assertBuiltSite();
  },
);

// Pillar-2 composition: this Given is the Given + When of the walking skeleton
// above it, reusing the same journey function rather than restating fixtures.
Given(
  'a surfer has read the home page with signal',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await readHomeWithSignal(state);
  },
);

Given(
  'the surfer has opened the report screen for Playa Venao with signal',
  { timeout: 120_000 },
  async function (this: object) {
    await openReportScreenWithSignal(scenarioState(this), VISITED_SPOT);
  },
);

// ---------- Whens ----------

When(
  'a surfer reads the home page with signal',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await readHomeWithSignal(state);
  },
);

When(
  'the signal drops and the surfer opens the home page again',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    setSignal(state, 'blackout');
    await goTo(state, '/', 'open the home page with the signal cut');
  },
);

When(
  'the network stalls and the surfer opens the home page again',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    setSignal(state, 'stall');
    // Eight seconds of patience, so a helper that gives up at three has room to
    // be seen giving up and a helper that never gives up is seen not to.
    await goTo(state, '/', 'open the home page with the network stalled', {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    });
    setSignal(state, 'online');
  },
);

When(
  'the signal drops and the surfer opens a spot they have never opened',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    setSignal(state, 'blackout');
    await goTo(state, `/spots/${UNVISITED_SPOT}`, `open ${UNVISITED_SPOT} with the signal cut`);
  },
);

When(
  'the signal drops and the surfer opens the report screen for Playa Venao again',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    setSignal(state, 'blackout');
    await goTo(state, `/spots/${VISITED_SPOT}/reportar`, 'open the report screen with the signal cut');
  },
);

When(
  'the signal drops and the surfer opens the report screen for a spot they have never opened',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    setSignal(state, 'blackout');
    await goTo(
      state,
      `/spots/${UNVISITED_SPOT}/reportar`,
      `open the report screen for ${UNVISITED_SPOT} with the signal cut`,
    );
  },
);

When(
  'a surfer reads the home page, opens Playa Venao and comes back to the home page',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await phonePage(state);
    setSignal(state, 'online');
    startCountingRequests();
    await goTo(state, '/', 'read the home page');
    await settleHelper(state);
    await goTo(state, `/spots/${VISITED_SPOT}`, 'open Playa Venao');
    await goTo(state, '/', 'come back to the home page');
  },
);

// ---------- Thens ----------

Then('the offline helper is running on their phone', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const helper = await helperStatus(state);
  assert.ok(
    helper.supported,
    'WHAT: this browser has no service worker support at all, so nothing about offline reading '
      + 'can be observed. WHY: the whole slice is a service worker. HOW: run the suite on the '
      + `Chromium the harness launches.${failureContext(state)}`,
  );
  assert.ok(
    helper.installed,
    'WHAT: the phone has no offline helper installed after reading the site with signal. '
      + 'WHY: without one, nothing can be served when the signal drops, and the surfer at Venao '
      + 'gets a browser error instead of the last forecast that loaded. '
      + 'HOW: ship the helper and start it from the inline snippet on every page '
      + `(application-architecture.md section 6, section 12).${failureContext(state)}`,
  );
  assert.ok(
    helper.inCharge,
    'WHAT: an offline helper is installed but is not in charge of the page the surfer is looking '
      + 'at, so every request still goes straight to the network. WHY: a helper that handles '
      + 'nothing keeps nothing and serves nothing. '
      + `HOW: let the helper take charge of the pages it is registered for.${failureContext(state)}`,
  );
});

Then(
  'the same forecast is on the screen, with the time stamp it already carried',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const seen = state.lastSeen;
    assert.ok(
      seen,
      `test bug: no forecast was read with signal before this check.${failureContext(state)}`,
    );
    const stampLine = seen.stampLine;
    const topCallLine = seen.topCallLine;
    assert.ok(
      stampLine,
      'WHAT: the forecast read with signal showed no "Actualizado" line, so there is no time '
        + 'stamp to compare against. WHY: the stamp travels inside the document it describes, '
        + 'which is the whole reason a cached copy can be honest about its age. '
        + `HOW: render the publish stamp in the document.${failureContext(state)}`,
    );
    const now = await screenText(state);
    assert.ok(
      now.includes(stampLine),
      `WHAT: the screen does not carry the time stamp the forecast already had (${JSON.stringify(stampLine)}). `
        + `On screen now: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: a surfer parked at Venao with one bar must get the last forecast that loaded, '
        + 'stamped with when we actually saw it, not a fresh-looking page and not a browser error. '
        + 'HOW: serve reading pages network-first with a three-second timeout and fall back to the '
        + `copy kept on the phone (application-architecture.md section 12, row 1).${failureContext(state)}`,
    );
    assert.ok(
      topCallLine !== null && now.includes(topCallLine),
      `WHAT: the call the surfer read with signal (${JSON.stringify(topCallLine)}) is not on the screen. `
        + 'WHY: the same forecast means the same forecast, not an empty shell of the page. '
        + `HOW: serve the kept copy of the document whole.${failureContext(state)}`,
    );
  },
);

Then('nothing on the screen is a browser error page', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const now = await screenText(state);
  assert.ok(
    !/ERR_[A-Z_]+/.test(now),
    `WHAT: the screen is the browser's own error page: ${JSON.stringify(now.slice(0, 200))}. `
      + 'WHY: the promise of this feature is that no signal lands on our words, never on a raw '
      + 'browser or origin error. HOW: answer the request from the helper, from the kept copy or '
      + `from the precached sin señal page.${failureContext(state)}`,
  );
  assert.ok(
    now.length > 20,
    'WHAT: the screen has essentially nothing on it. WHY: a blank screen is the same failure as '
      + 'an error page to somebody standing on the sand. '
      + `HOW: serve real words.${failureContext(state)}`,
  );
});

Then('the forecast is on the screen inside six seconds', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const took = state.lastNavigationMs;
  assert.ok(took !== null, `test bug: no navigation was timed.${failureContext(state)}`);
  assert.ok(
    took < 6000,
    `WHAT: the stalled network kept the surfer waiting ${took} ms and the page never arrived in `
      + 'time. WHY: reading pages are network-first with a three-second timeout precisely so a '
      + 'network that has gone to sleep costs three seconds and not the browser\'s own patience. '
      + 'HOW: give up on the network after three seconds and serve the copy kept on the phone '
      + `(application-architecture.md section 12, row 1).${failureContext(state)}`,
  );
});

Then(
  'the sin señal page reads the settled first sentence with the hour we last saw',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      now.includes(OFFLINE_SENTENCE_ONE_PREFIX),
      `WHAT: the screen does not carry the settled offline sentence ${JSON.stringify(OFFLINE_SENTENCE_ONE_PREFIX)}. `
        + `On screen now: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: with nothing kept for what the surfer asked for, no signal has to land on plain '
        + 'Spanish words, precached so it works with no origin at all. The sentence is verbatim '
        + 'from application-architecture.md section 10 and may not be reworded. '
        + `HOW: precache the sin señal page and serve it as the failure branch of the reading and report rows.${failureContext(state)}`,
    );
    const after = now.slice(now.indexOf(OFFLINE_SENTENCE_ONE_PREFIX) + OFFLINE_SENTENCE_ONE_PREFIX.length);
    assert.ok(
      /^\d{1,2}:\d{2}/.test(after),
      `WHAT: the offline sentence is not followed by an hour a person can read: ${JSON.stringify(after.slice(0, 60))}. `
        + 'WHY: "de las {hora}" is the whole point of the sentence, it tells the surfer how old '
        + 'the last thing we saw is. HOW: fill the hour from the publish stamp of the forecast '
        + `the phone is holding, as a plain clock time.${failureContext(state)}`,
    );
  },
);

Then('the page does not promise that reports get saved', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const now = await screenText(state);
  assert.ok(
    !now.includes(OFFLINE_SENTENCE_TWO),
    `WHAT: the page says ${JSON.stringify(OFFLINE_SENTENCE_TWO)} and that is not true yet. `
      + 'WHY: no report can be saved until the queue exists, and no slice ships a sentence that '
      + 'is untrue at the moment it ships. This is deliberate staging, not a missing string: '
      + 'sentence one lands here, sentence two lands with the queue in slice-03, both word for '
      + 'word from application-architecture.md section 10. '
      + `HOW: render sentence one only until the queue is real.${failureContext(state)}`,
  );
});

Then(
  'nothing on the page is English, machine text or a raw timestamp',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    for (const { name, pattern } of MACHINE_TEXT) {
      const hit = pattern.exec(now);
      assert.equal(
        hit,
        null,
        `WHAT: the Spanish surface shows ${name}: ${JSON.stringify(hit?.[0] ?? '')} in ${JSON.stringify(now.slice(0, 240))}. `
          + 'WHY: zero technical text on the Spanish surface is a standing project rule; a raw '
          + 'timestamp, a leftover placeholder or an English word all read as the machine showing '
          + `through. HOW: render settled Spanish copy and a plain clock time.${failureContext(state)}`,
      );
    }
  },
);

Then(
  'the report screen asks the same questions it asked with signal',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const before = state.lastSeenReportScreen;
    assert.ok(
      before !== null && before.length > 20,
      `test bug: the report screen was never read with signal before this check.${failureContext(state)}`,
    );
    const now = await screenText(state);
    assert.equal(
      now,
      before,
      'WHAT: with the signal cut the report screen is not the screen the surfer already had. '
        + `On screen now: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: the report screen is static and forecast-free by construction, so it is kept on '
        + 'the phone and served from there first; staleness is harmless on this one document. '
        + `HOW: serve the report screen from the phone's copy first (application-architecture.md section 12, row 2).${failureContext(state)}`,
    );
  },
);

Then('the small parts the page asked for come from the phone', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const kept = await keptOnPhone(state);
  assert.ok(
    kept.some((address) => address.endsWith(SMALL_PART)),
    `WHAT: the phone is holding no copy of ${SMALL_PART}, one of the small parts every page asks `
      + `for on first visit. It is holding: ${JSON.stringify(kept.slice(0, 10))}. `
      + 'WHY: the page\'s own small parts are kept on the phone and served from there first, so a '
      + 'second visit with no signal costs the network nothing. '
      + `HOW: keep them, and serve them from the phone before the network (application-architecture.md section 12, row 3).${failureContext(state)}`,
  );
  const page = await phonePage(state);
  const answered = await page
    .evaluate(async (address) => {
      try {
        const answer = await fetch(address);
        return answer.ok;
      } catch {
        return false;
      }
    }, SMALL_PART)
    .catch(() => false);
  assert.ok(
    answered,
    `WHAT: with the signal cut, asking for ${SMALL_PART} got nothing back. `
      + 'WHY: a part that is kept but not served is not kept for any purpose. '
      + `HOW: answer it from the phone's copy while the origin is unreachable.${failureContext(state)}`,
  );
});

Then('the whole reading asked the site for ten things or fewer', function (this: object) {
  const state = scenarioState(this);
  const asked = requestsAsked();
  assert.ok(
    asked.length <= READING_SESSION_REQUEST_CEILING,
    `WHAT: reading the home page, a spot and the home page again asked the site for ${asked.length} `
      + `things, over the ${READING_SESSION_REQUEST_CEILING} a session is allowed: ${JSON.stringify(asked)}. `
      + 'WHY: requests per session, not bytes, are the binding cost constraint on this site, and '
      + 'the whole per-route strategy table exists to hold a typical session at eight to ten. A '
      + 'change that inflates request count is a regression even with every byte gate green. '
      + `HOW: serve repeat reads from the phone instead of the network.${failureContext(state)}`,
  );
});
