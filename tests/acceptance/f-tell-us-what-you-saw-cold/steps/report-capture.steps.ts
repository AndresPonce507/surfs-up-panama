// Slice-01 capture journey. Every step drives the production surface: the
// real `npm run build` output served over real HTTP, walked by Chromium at
// 390 px. Observation is limited to what the surfer sees and to the durable
// on-phone queue, the driven storage port of domain-model.md section 7.4.
//
// The three concrete answers used everywhere are Cintura a pecho, Picado,
// Bueno, whose canonical tokens are waist_chest / choppy / good — one shared
// vocabulary, src/data/size-bands.ts and src/data/report-vocab.ts
// (Pre-requisite 1, decided 2026-08-09).

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { QUALITY_TOKENS, WIND_STATE_TOKENS } from '../../../../src/data/report-vocab';
import { sizeBands } from '../../../../src/data/size-bands';
import {
  REPORTED_PATHNAME_PATTERN,
  SPOT_ID,
  answerThreeQuestions,
  assertBuiltSite,
  failureContext,
  followReportCta,
  openReportScreenDirectly,
  openSpotPage,
  phonePage,
  queuedReports,
  scenarioState,
  setSignal,
  tapMandar,
  visibleText,
  type QueuedReport,
  type ReportFlowScenario,
} from './support/world';

/** Crockford base32, 26 characters: the shape of a client-minted ULID. */
const ULID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i;

const EXPECTED_ANSWER = { size_band: 'waist_chest', wind: 'choppy', quality: 'good' } as const;

function pathnameOf(url: string): string {
  return new URL(url).pathname;
}

async function assertSavedConfirmation(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  const pathname = pathnameOf(page.url());
  assert.match(
    pathname,
    REPORTED_PATHNAME_PATTERN,
    'WHAT: after Mandar the screen never became the saved confirmation '
      + `(still at ${pathname}). WHY: the whole slice is that the label locks and the screen `
      + 'changes, commit first, then the address swap, then the render '
      + '(application-architecture.md section 8 L3). HOW: commit the record durably, swap the '
      + `history entry for the reportado address, then render the confirmation.${failureContext(state)}`,
  );
  const editableControls = await page.locator('form, input, select, textarea').count();
  assert.equal(
    editableControls,
    0,
    `WHAT: the saved confirmation still shows ${editableControls} editable control(s). `
      + 'WHY: no way back to an editable form may exist for a saved label (decision 28). '
      + `HOW: render the confirmation without any form.${failureContext(state)}`,
  );
  const text = (await visibleText(state)).trim();
  assert.ok(
    text.length > 0,
    `WHAT: the saved confirmation shows no words at all. WHY: a surfer must read that the label was saved. HOW: render the queued confirmation copy.${failureContext(state)}`,
  );
}

async function assertNoForecastOnConfirmation(state: ReportFlowScenario): Promise<void> {
  const text = await visibleText(state);
  assert.ok(
    !/\d/.test(text),
    'WHAT: the saved confirmation shows a number, and slice-01 has no honest number to show: '
      + `${JSON.stringify(text.slice(0, 200))}. WHY: any score, band or count here reads as our `
      + 'numbers arriving before or with the label, the exact anchoring leak decision 28 closes. '
      + `HOW: keep every slice-01 confirmation state number-free.${failureContext(state)}`,
  );
  for (const marker of ['Dijimos', 'puntos', 'confianza', 'Ventana']) {
    assert.ok(
      !text.includes(marker),
      `WHAT: the saved confirmation carries forecast language: ${JSON.stringify(marker)}. `
        + 'WHY: the reveal belongs to a later slice and renders only from the write path answer. '
        + `HOW: keep the confirmation free of any comparison.${failureContext(state)}`,
    );
  }
}

async function assertBlankReport(state: ReportFlowScenario): Promise<void> {
  const page = await phonePage(state);
  const checked = await page.locator('input[type="radio"]:checked').count();
  assert.equal(
    checked,
    0,
    `WHAT: the report screen opened with ${checked} answer(s) already picked. `
      + 'WHY: reopening the report screen starts a blank report; a prefilled form is a saved '
      + 'label leaking back into an editable state (application-architecture.md section 8 L3). '
      + `HOW: start every visit blank with a fresh identity.${failureContext(state)}`,
  );
}

function reportOf(entry: QueuedReport): Record<string, unknown> {
  return entry.row;
}

// ---------- Givens ----------

Given('the built site is running as it would be at the beach', { timeout: 240_000 }, async function (this: object) {
  const state = scenarioState(this);
  await assertBuiltSite(state.endpointMode);
});

Given(
  'a surfer walks off the water at Playa Venao and opens its spot page',
  { timeout: 60_000 },
  async function (this: object) {
    await openSpotPage(scenarioState(this));
  },
);

Given('a surfer has the report screen open for Playa Venao', { timeout: 240_000 }, async function (this: object) {
  const state = scenarioState(this);
  await assertBuiltSite(state.endpointMode);
  await openSpotPage(state);
  await followReportCta(state);
});

Given('the signal drops before they answer', { timeout: 30_000 }, async function (this: object) {
  await setSignal(scenarioState(this), false);
});

Given('the signal returns', { timeout: 30_000 }, async function (this: object) {
  await setSignal(scenarioState(this), true);
});

// Pillar-2 composition: the Given of this scenario is the Given + When of the
// offline scenario before it, reusing the same journey functions.
Given(
  'a surfer saved a report for Playa Venao with the signal cut',
  { timeout: 240_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite(state.endpointMode);
    await openSpotPage(state);
    await followReportCta(state);
    await setSignal(state, false);
    await answerThreeQuestions(state);
    await tapMandar(state);
  },
);

Given("the surfer's phone refuses to keep anything saved", async function (this: object) {
  scenarioState(this).flags.storageRefused = true;
});

// ---------- Whens ----------

When('the surfer follows {string}', { timeout: 60_000 }, async function (this: object, cta: string) {
  assert.equal(cta, '¿ESTUVISTE? CUÉNTANOS', 'the walk-in is the settled spot-page CTA');
  await followReportCta(scenarioState(this));
});

When(
  'the surfer answers waist to chest, choppy wind and a good session',
  { timeout: 60_000 },
  async function (this: object) {
    await answerThreeQuestions(scenarioState(this));
  },
);

When('the surfer taps Mandar', { timeout: 60_000 }, async function (this: object) {
  await tapMandar(scenarioState(this));
});

When('a surfer opens the report screen for Playa Venao', { timeout: 240_000 }, async function (this: object) {
  const state = scenarioState(this);
  await assertBuiltSite(state.endpointMode);
  await openReportScreenDirectly(state);
});

When('the surfer presses back from the confirmation', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  if (!REPORTED_PATHNAME_PATTERN.test(pathnameOf(page.url()))) {
    state.failures.push({
      label: 'press back from the confirmation',
      error: new Error(`the confirmation never rendered; back was pressed from ${pathnameOf(page.url())}`),
    });
  }
  await page.goBack({ waitUntil: 'load' }).catch((error: unknown) => {
    state.failures.push({ label: 'navigate back', error });
  });
});

When('the surfer opens the report screen again', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  await openSpotPage(state);
  await followReportCta(state);
});

// ---------- Thens ----------

Then(
  'the report screen asks exactly the three settled questions and nothing else',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const page = await phonePage(state);
    const pathname = pathnameOf(page.url());
    assert.match(
      pathname,
      new RegExp(`^/spots/${SPOT_ID}/reportar/?$`),
      `WHAT: the CTA did not land on the report screen (at ${pathname}). HOW: keep the spot-page button a plain link to the reportar route.${failureContext(state)}`,
    );

    const heading = (await page.locator('h1').first().textContent())?.trim();
    assert.equal(heading, '¿Cómo estuvo Playa Venao?', 'the settled screen-one title, verbatim');

    const legends = await page.locator('fieldset legend').allTextContents();
    assert.deepEqual(
      legends.map((legend) => legend.trim()),
      ['¿Qué tan grande?', '¿El viento?', '¿Cómo estuvo?'],
      'WHAT: the three settled questions are not the three shown. WHY: the form is settled '
        + 'application-architecture.md section 10 copy. HOW: render exactly Q1 to Q3, verbatim.',
    );

    const sizeValues = await page.locator('input[name="size_band"]').evaluateAll(
      (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
    );
    assert.deepEqual(
      sizeValues,
      sizeBands.map((band) => band.value),
      'the seven size options ARE the canonical v1 size_band tokens, in order (domain-model.md section 7.2)',
    );
    const windValues = await page.locator('input[name="wind"]').evaluateAll(
      (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
    );
    assert.deepEqual(windValues, [...WIND_STATE_TOKENS], 'the three wind options carry the canonical tokens, in order');
    const qualityValues = await page.locator('input[name="quality"]').evaluateAll(
      (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
    );
    assert.deepEqual(qualityValues, [...QUALITY_TOKENS], 'the four quality options carry the canonical tokens, in order');

    const radios = await page.locator('input[type="radio"]').count();
    assert.equal(radios, 14, 'seven size, three wind, four quality: fourteen answers, nothing more');
    const otherControls = await page
      .locator('input:not([type="radio"]), select, textarea')
      .count();
    assert.equal(
      otherControls,
      0,
      'WHAT: the report screen carries a control beyond the three questions and Mandar. '
        + 'WHY: no fourth control and no time selector exist in this product (feature-delta '
        + 'Pre-requisite 9, D19 recommendation). HOW: keep the flow three questions plus Mandar.',
    );
    await page.getByRole('button', { name: 'Mandar' }).waitFor({ state: 'visible', timeout: 5000 });
  },
);

Then('the screen changes to the saved confirmation', { timeout: 60_000 }, async function (this: object) {
  await assertSavedConfirmation(scenarioState(this));
});

Then('the confirmation carries no score, no forecast and no comparison', { timeout: 60_000 }, async function (this: object) {
  await assertNoForecastOnConfirmation(scenarioState(this));
});

Then('the confirmation offers no way back to an editable form', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const editableControls = await page.locator('form, input, select, textarea').count();
  assert.equal(
    editableControls,
    0,
    `WHAT: the confirmation still carries ${editableControls} editable control(s).${failureContext(state)}`,
  );
  const backIntoForm = await page.locator(`a[href*="/reportar"]`).count();
  assert.equal(
    backIntoForm,
    0,
    'WHAT: the confirmation links back into the report form. WHY: a saved label must never '
      + 'round-trip back to an editable state (decision 28, adr-report-label-immutability). '
      + `HOW: offer only the way back to the spot page.${failureContext(state)}`,
  );
});

Then(
  'the saved confirmation reads exactly {string}',
  { timeout: 60_000 },
  async function (this: object, copy: string) {
    const state = scenarioState(this);
    const text = await visibleText(state);
    assert.ok(
      text.includes(copy),
      `WHAT: the saved confirmation does not say ${JSON.stringify(copy)}. WHY: that sentence is `
        + 'the settled queued-variant copy, verbatim application-architecture.md section 10, and '
        + 'with the signal cut it is the only honest thing to say. HOW: render it word for word.'
        + `${failureContext(state)}\nscreen said: ${JSON.stringify(text.slice(0, 300))}`,
    );
  },
);

Then('nothing on the screen reads as an error', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const text = await visibleText(state);
  for (const raw of ['undefined', 'NaN', 'Error', '{"']) {
    assert.ok(
      !text.includes(raw),
      `WHAT: the screen shows raw technical text: ${JSON.stringify(raw)}. WHY: waiting never reads `
        + `as an error, and no surfer reads stack traces (charter negative). HOW: keep every state in plain Spanish.${failureContext(state)}`,
    );
  }
  assert.deepEqual(
    state.pageErrors,
    [],
    `WHAT: the page threw uncaught errors. WHY: a broken screen loses labels silently. HOW: handle every failure into a designed state.${failureContext(state)}`,
  );
});

Then('the phone holds exactly one saved report', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const reports = await queuedReports(state);
  assert.equal(
    reports.length,
    1,
    `WHAT: the phone holds ${reports.length} saved report(s) after Mandar. WHY: the label must be `
      + 'durably on the phone BEFORE any network attempt, and with the signal cut the queue is '
      + 'the only place it can live (domain-model.md section 7.4). HOW: commit the full record '
      + `to durable storage at Mandar, before anything else.${failureContext(state)}`,
  );
});

Then(
  'the saved report says waist to chest, choppy and good in the one shared vocabulary',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const reports = await queuedReports(state);
    assert.ok(reports.length > 0, `WHAT: no saved report exists to read.${failureContext(state)}`);
    const row = reportOf(reports[0]!);
    for (const [field, token] of Object.entries(EXPECTED_ANSWER)) {
      assert.equal(
        row[field],
        token,
        `WHAT: the saved report's ${field} is ${JSON.stringify(row[field])}, not `
          + `${JSON.stringify(token)}. WHY: the queued record replays byte-identical, so only the `
          + 'canonical tokens of the one shared vocabulary may ever be committed '
          + '(domain-model.md section 7.4, Pre-requisite 1). HOW: write the canonical token the '
          + 'surfer picked, straight from the constants file.',
      );
    }
  },
);

Then(
  'the saved report carries a fresh identity, an empty photo list and no placeholder wording',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const reports = await queuedReports(state);
    assert.ok(reports.length > 0, `WHAT: no saved report exists to read.${failureContext(state)}`);
    const row = reportOf(reports[0]!);
    assert.match(
      String(row['report_id'] ?? ''),
      ULID_PATTERN,
      `WHAT: the saved report's identity ${JSON.stringify(row['report_id'])} is not a fresh `
        + 'client-minted ULID. WHY: the identity is minted once at commit and is the dedup key '
        + 'forever (domain-model.md section 7.3). HOW: mint a ULID at Mandar, before any network attempt.',
    );
    assert.deepEqual(
      row['photo_ids'],
      [],
      'WHAT: the saved report does not carry an empty photo list. WHY: photos are not in this '
        + 'slice, and photo_ids: [] is the settled record shape (feature-delta Pre-requisite 9a). '
        + 'HOW: commit photo_ids as an empty list.',
    );
    assert.ok(
      !JSON.stringify(row).includes('placeholder'),
      `WHAT: the saved report carries placeholder wording: ${JSON.stringify(row)}. WHY: a `
        + 'placeholder token committed today becomes a schema-invalid send the day the endpoint '
        + 'exists (domain-model.md section 7.4). HOW: commit canonical tokens only.',
    );
  },
);

Then(
  'the surfer lands on the spot page, never on an editable form',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const page = await phonePage(state);
    const pathname = pathnameOf(page.url());
    assert.match(
      pathname,
      new RegExp(`^/spots/${SPOT_ID}/?$`),
      `WHAT: back landed on ${pathname}, not the spot page. WHY: the history entry for the form is `
        + 'swapped away before the confirmation renders, so back always lands on the spot page '
        + `(application-architecture.md section 8 L3). HOW: replace the history entry at commit.${failureContext(state)}`,
    );
    const radios = await page.locator('input[type="radio"]').count();
    assert.equal(
      radios,
      0,
      `WHAT: back landed on an editable form. WHY: a saved label must never come back editable (decision 28).${failureContext(state)}`,
    );
  },
);

Then('a blank new report starts', { timeout: 60_000 }, async function (this: object) {
  await assertBlankReport(scenarioState(this));
});

// The on-phone cardinality oracle that used to live here ("the phone holds two
// saved reports with two different identities") was replaced on 2026-08-13 by
// "the two reports that left the phone carry two different identities"
// (steps/report-flush.steps.ts). Reason, recorded in deliver/wave-decisions.md:
// R26's page-open flush sends the first report and discards it on its matching
// receipt, so two saved rows can no longer coexist on a phone that has signal.
// R4's actual promise -- every visit starts blank with a FRESH report_id -- is
// unchanged and is now observed on the wire, where both identities are visible.

Then(
  'the screen says plainly that the report cannot be saved on this phone',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const page = await phonePage(state);
    // The exact Spanish is pending sign-off (feature-delta Pre-requisite 8a),
    // so this oracle is behavioural: a storage notice is visible before the
    // surfer answers, in plain words, with no technical vocabulary. The
    // [data-storage-notice] seam mirrors the shipped [data-reveal-shell]
    // convention for island mount points.
    const notice = page.locator('[data-storage-notice]');
    const visible = await notice.isVisible().catch(() => false);
    assert.ok(
      visible,
      'WHAT: the phone refuses durable storage and the screen says nothing. WHY: accepting a '
        + 'report that would be lost in silence is the exact "silent queue that drops labels" '
        + 'application-architecture.md section 12 forbids; the sentinel probe exists to catch '
        + 'this before the surfer answers. HOW: probe storage with a write, read and delete of a '
        + `sentinel before showing the form, and on refusal say so plainly in a visible storage notice.${failureContext(state)}`,
    );
    const noticeText = ((await notice.textContent()) ?? '').trim();
    assert.ok(noticeText.length > 0, 'WHAT: the storage notice is empty. HOW: say it in plain Spanish.');
    for (const technical of ['IndexedDB', 'Error', 'undefined', 'NaN', 'storage', 'JSON']) {
      assert.ok(
        !noticeText.includes(technical),
        `WHAT: the storage notice leaks technical wording: ${JSON.stringify(technical)} in ${JSON.stringify(noticeText)}. HOW: plain surfer Spanish only.`,
      );
    }
  },
);

Then('the screen never claims the label was saved', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const text = await visibleText(state);
  assert.ok(
    !text.includes('Guardado'),
    `WHAT: the screen claims "Guardado" on a phone that cannot save. WHY: a false saved claim is a dropped label with extra cruelty. HOW: never claim saved unless the commit succeeded.${failureContext(state)}`,
  );
  assert.ok(
    !REPORTED_PATHNAME_PATTERN.test(pathnameOf(page.url())),
    `WHAT: the screen moved to the saved confirmation on a phone that cannot save.${failureContext(state)}`,
  );
});
