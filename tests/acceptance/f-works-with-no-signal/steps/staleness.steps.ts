// Slice-02: an old forecast says so. Every step drives the production surface
// (real build, real HTTP, real Chromium at 390 px) and observes only what the
// surfer sees plus the publish moment the document itself carries — the one
// port-exposed machine fact of this slice, because section 12's staleness rule
// is "truth lives in the document". Time passing is the phone's own clock
// moving (Playwright's clock, installed in the page), never a doctored
// document: the site keeps serving exactly what the build emitted, and the
// page has to notice its own age.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DIST_ROOT,
  assertBuiltSite,
  failureContext,
  goTo,
  gzippedBytes,
  normalise,
  phonePage,
  phoneWithoutJavaScript,
  registrationSnippetFromBuiltHome,
  scenarioState,
  setSignal,
  visibleText,
  type SignalScenario,
} from './support/world';

/** Settled stale line, application-architecture.md section 10, around the {hora} fill. */
const VIEJO_PREFIX = 'Viejo. Lo último que vimos fue a las ';
const VIEJO_SUFFIX = 'No pudimos sacar datos nuevos esta mañana.';

/** Settled absolute stamp shape: "Actualizado 6:04 a.m." (section 10). */
const STAMP_PATTERN = /Actualizado \d{1,2}:\d{2} [ap]\.m\./;

/** 0.3 KB gz, application-architecture.md section 5 line item 1 / section 6 row 4. */
const AGE_SCRIPT_CEILING_BYTES = Math.round(0.3 * 1024);

/** Just past the three-hour flip, with margin so the boundary is unambiguous. */
const HOURS_LATER_MS = Math.round(3.4 * 60 * 60 * 1000);

/** The publish moment captured before time moved, per scenario. */
const rememberedMoments = new WeakMap<object, string | null>();

/** The weighed age script, per scenario, so the Then can explain itself. */
const weighedScripts = new WeakMap<object, { found: number; gzBytes: number }>();

/**
 * The machine-readable publish moment the served home page carries inside
 * itself. The contract is the FACT (the moment is readable underneath, and it
 * never changes), not the element: a `<time datetime>` or a data slot both
 * honour it.
 */
async function publishMomentUnderneath(state: SignalScenario): Promise<string | null> {
  const page = await phonePage(state);
  try {
    return await page.evaluate(() => {
      const timed = document.querySelector('time[datetime]');
      if (timed) return timed.getAttribute('datetime');
      const slotted = document.querySelector('[data-published-at]');
      if (slotted) return slotted.getAttribute('data-published-at');
      return null;
    });
  } catch (error) {
    state.failures.push({ label: 'read the publish moment the page carries underneath', error });
    return null;
  }
}

async function screenText(state: SignalScenario): Promise<string> {
  return normalise(await visibleText(state));
}

// ---------- Givens ----------

Given(
  'a surfer whose phone runs no JavaScript reads the home page with signal',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await phoneWithoutJavaScript(state);
    setSignal(state, 'online');
    await goTo(state, '/', 'read the home page with no JavaScript');
  },
);

// ---------- Whens ----------

When(
  'more than three hours pass and the surfer looks at the forecast again',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    rememberedMoments.set(this, await publishMomentUnderneath(state));
    const page = await phonePage(state);
    try {
      await page.clock.install();
      await page.clock.fastForward(HOURS_LATER_MS);
    } catch (error) {
      state.failures.push({ label: "move the phone's clock past three hours", error });
    }
    await goTo(state, '/', 'look at the forecast again, hours later');
  },
);

When(
  'the signal drops and, hours later, the surfer opens the home page again',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    rememberedMoments.set(this, await publishMomentUnderneath(state));
    const page = await phonePage(state);
    try {
      await page.clock.install();
      await page.clock.fastForward(HOURS_LATER_MS);
    } catch (error) {
      state.failures.push({ label: "move the phone's clock past three hours", error });
    }
    setSignal(state, 'blackout');
    await goTo(state, '/', 'open the home page hours later with the signal cut');
  },
);

When(
  'the site owner weighs the script that admits a forecast is old',
  { timeout: 300_000 },
  async function (this: object) {
    scenarioState(this);
    await assertBuiltSite();
    const home = resolve(DIST_ROOT, 'index.html');
    assert.ok(existsSync(home), 'test bug: the built home page is missing after a green build');
    const html = readFileSync(home, 'utf8');
    const registration = registrationSnippetFromBuiltHome();
    const inline: string[] = [];
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const body = match[1] ?? '';
      if (body.trim().length === 0) continue;
      if (registration !== null && body === registration) continue;
      if (/serviceWorker/.test(body)) continue;
      inline.push(body);
    }
    weighedScripts.set(this, {
      found: inline.length,
      gzBytes: inline.length === 0 ? 0 : gzippedBytes(inline.join('\n')),
    });
  },
);

// ---------- Thens ----------

Then(
  'the page carries its publish stamp as a plain clock time',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      STAMP_PATTERN.test(now),
      `WHAT: the page shows no plain-clock publish stamp. On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: every reading document shows its absolute publish time in the settled shape, true '
        + 'with JavaScript off and true for a copy served from the phone, because the stamp '
        + 'travels inside the document it describes. '
        + `HOW: render the settled "Actualizado {hora}" stamp in the document (application-architecture.md sections 10 and 12).${failureContext(state)}`,
    );
  },
);

Then(
  'the page keeps the exact publish moment underneath where the phone can read it',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const moment = await publishMomentUnderneath(state);
    assert.ok(
      moment !== null && !Number.isNaN(Date.parse(moment)),
      `WHAT: the page carries no machine-readable publish moment underneath (found: ${JSON.stringify(moment)}). `
        + 'WHY: the amber Viejo flip can only be computed from the moment the document itself '
        + 'carries; without it the page cannot know its own age and a stale copy could pass for '
        + 'fresh. The moment lives underneath, never as visible text: the surfer reads the plain '
        + 'clock, the phone reads the instant. '
        + `HOW: embed the publish instant in the document, for instance a time element's datetime.${failureContext(state)}`,
    );
  },
);

Then('the page does not call the forecast old', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const now = await screenText(state);
  assert.ok(
    !now.includes('Viejo'),
    `WHAT: a fresh forecast is being called old: ${JSON.stringify(now.slice(0, 240))}. `
      + 'WHY: honesty cuts both ways. A stale forecast must look stale, and a fresh one must '
      + 'never be dressed down as old; a page that cries Viejo at every hour teaches surfers to '
      + 'ignore the one warning that matters. '
      + `HOW: flip the Viejo line only past three hours (application-architecture.md section 12).${failureContext(state)}`,
  );
});

Then(
  'the page says Viejo, with the hour we last saw and that no new data came',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      now.includes(VIEJO_PREFIX),
      `WHAT: a forecast more than three hours old does not say ${JSON.stringify(VIEJO_PREFIX.trim())}. `
        + `On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: a stale forecast must LOOK stale. The amber line is the settled, verbatim way '
        + 'this site refuses to dress an old score up as a new call; without it a surfer plans '
        + 'their morning on numbers we saw half a day ago. '
        + `HOW: past three hours, flip the stamp to the settled Viejo line (application-architecture.md sections 10 and 12).${failureContext(state)}`,
    );
    const afterPrefix = now.slice(now.indexOf(VIEJO_PREFIX) + VIEJO_PREFIX.length);
    assert.ok(
      /^\d{1,2}:\d{2}/.test(afterPrefix),
      `WHAT: the Viejo line does not name the hour we last saw: ${JSON.stringify(afterPrefix.slice(0, 60))}. `
        + 'WHY: "a las {hora}" is what tells the surfer HOW old; Viejo alone is a shrug. '
        + `HOW: fill the hour from the publish moment the document itself carries.${failureContext(state)}`,
    );
    assert.ok(
      now.includes(VIEJO_SUFFIX),
      `WHAT: the stale line does not say that no new data could be obtained. On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: the stale document says both Viejo and WHY it is old, so the surfer knows the '
        + 'site tried and failed rather than quietly gave up. The sentence is verbatim from '
        + 'application-architecture.md section 10 and may not be reworded. '
        + `HOW: render the settled line whole.${failureContext(state)}`,
    );
  },
);

Then(
  'the publish moment the page carries underneath is the one it always had',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const before = rememberedMoments.get(this);
    assert.ok(
      before !== undefined && before !== null,
      'WHAT: no publish moment was readable underneath the page before time moved, so there is '
        + 'nothing to compare against. WHY: the never-rewritten guarantee needs the moment to '
        + 'exist in the first place. '
        + `HOW: embed the publish instant in the document, then rerun.${failureContext(state)}`,
    );
    const after = await publishMomentUnderneath(state);
    assert.equal(
      after,
      before,
      `WHAT: the publish moment underneath changed from ${JSON.stringify(before)} to ${JSON.stringify(after)}. `
        + 'WHY: the original machine-readable publish moment is never rewritten, by the helper or '
        + 'by any script: an old score with a refreshed stamp IS the lie this whole slice exists '
        + 'to make impossible. '
        + `HOW: flip only the words the surfer reads; leave the moment untouched (application-architecture.md section 12).${failureContext(state)}`,
    );
  },
);

Then('the age script weighs 0.3 KB gzipped or less', function (this: object) {
  const state = scenarioState(this);
  const weighed = weighedScripts.get(this);
  assert.ok(weighed, `test bug: nothing was weighed before this check.${failureContext(state)}`);
  assert.ok(
    weighed.found > 0,
    'WHAT: the built home page carries no inline script beyond the helper registration, so there '
      + 'is no age script to weigh. WHY: the Viejo flip is a small script that lives inline in '
      + 'the reading document; until it ships, a forecast more than three hours old still reads '
      + 'as fresh. '
      + `HOW: ship the inline age script (application-architecture.md section 6 row 4).${failureContext(state)}`,
  );
  assert.ok(
    weighed.gzBytes <= AGE_SCRIPT_CEILING_BYTES,
    `WHAT: the age script weighs ${weighed.gzBytes} bytes gzipped, over its ${AGE_SCRIPT_CEILING_BYTES} byte ceiling. `
      + 'WHY: the budget is contractual, booked in DESIGN inside line item 1 of the section 5 '
      + 'table; the reading page has no headroom to donate. '
      + `HOW: trim the script; the flip needs one comparison and one settled string.${failureContext(state)}`,
  );
});
