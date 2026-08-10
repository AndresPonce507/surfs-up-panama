// Slices 03 and 04: the queued report sends itself, once and only once.
//
// Steps ACT through the production surface and OBSERVE three port-exposed
// things only: what the surfer sees, what is waiting in the phone's own queue
// (the seam f-tell's capture commits into), and what actually reached the
// site (the harness server's arrival log — the driven-port observable of a
// flush). The phone's own judgment is deliberately unobservable: nothing here
// ever asks the client whether it thinks a report "already went", because the
// settled contract is that the client replays and the site decides.
//
// "The signal comes back" is the browser's own doorbell: the server starts
// answering again AND the window's online event fires, which is exactly the
// stimulus a phone walking back into coverage receives. The harness rings it
// explicitly because the signal is cut at the server, below Chromium's
// notice (see support/world.ts).

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  OFFLINE_SENTENCE_TWO,
  REFUSAL_REASON_ES,
  VISITED_SPOT,
  assertBuiltSite,
  failureContext,
  goTo,
  normalise,
  openReportScreenWithSignal,
  phonePage,
  prestoreReport,
  readHomeWithSignal,
  releaseHelper,
  scenarioState,
  setSignal,
  setWritePathBehaviour,
  settleHelper,
  visibleText,
  withholdHelper,
  writePathReceived,
  writePathStoredCount,
  type SignalScenario,
} from './support/world';

import {
  QUALITY_TOKENS,
  WIND_STATE_TOKENS,
  plantQueuedReport,
  queuedReports,
  settledQueuedReport,
  type QueuedReport,
} from './support/queue-seam';

/** Settled queued-count box, application-architecture.md section 14 wireframe. */
const QUEUE_BOX_ONE = '1 reporte guardado. Se manda al volver la señal.';

/** Settled queued variant of screen two, application-architecture.md section 10. */
const QUEUED_VARIANT_PREFIX = 'Guardado. Cuando vuelva la señal lo mandamos';

/** Words that read as a failure to a surfer. The stale "No pudimos sacar datos" line is not one. */
const FAILURE_WORDS = [/ERR_[A-Z_]+/, /\berror\b/i, /\bfalló\b/i, /\bfallo\b/i];

/** How long a flush gets to be seen happening before a Then reads the state. */
const FLUSH_PATIENCE_MS = 10_000;

/** The records each scenario planted, in planting order. */
const plantedRecords = new WeakMap<object, QueuedReport[]>();

function planted(world: object): QueuedReport[] {
  let records = plantedRecords.get(world);
  if (records === undefined) {
    records = [];
    plantedRecords.set(world, records);
  }
  return records;
}

async function screenText(state: SignalScenario): Promise<string> {
  return normalise(await visibleText(state));
}

async function plantOne(world: object, state: SignalScenario, record: QueuedReport): Promise<void> {
  const page = await phonePage(state);
  try {
    await plantQueuedReport(page, record);
    planted(world).push(record);
  } catch (error) {
    state.failures.push({ label: `commit a waiting report (${record.report_id}) into the phone's queue`, error });
  }
}

/** Rings the doorbell of returned coverage and gives a flush time to be seen. */
async function signalReturns(world: object, state: SignalScenario): Promise<void> {
  setSignal(state, 'online');
  const page = await phonePage(state);
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  } catch (error) {
    state.failures.push({ label: 'let the phone notice the signal returned', error });
  }
  const ids = new Set(planted(world).map((record) => record.report_id));
  const started = Date.now();
  const alreadyArrived = writePathReceived().length;
  while (Date.now() - started < FLUSH_PATIENCE_MS) {
    if (writePathReceived().length > alreadyArrived) break;
    if (ids.size > 0) {
      const waiting = await queuedReports(page).catch(() => null);
      if (waiting !== null && !waiting.some((record) => ids.has(record.report_id))) break;
    }
    await new Promise((tick) => setTimeout(tick, 250));
  }
}

// ---------- Givens ----------

Given(
  'a report is waiting on the phone because it was filed with no signal',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await phonePage(state);
    await plantOne(this, state, settledQueuedReport());
  },
);

Given(
  'two reports are waiting on the phone because they were filed with no signal',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await phonePage(state);
    await plantOne(this, state, settledQueuedReport({ report_id: '01J0SIGNALSLICE04TWICE001' }));
    await plantOne(
      this,
      state,
      settledQueuedReport({ report_id: '01J0SIGNALSLICE04TWICE002', quality: QUALITY_TOKENS[1], wind: WIND_STATE_TOKENS[0] }),
    );
  },
);

Given(
  'a report is waiting on a phone that has never had the offline helper',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    withholdHelper(state);
    setSignal(state, 'online');
    await goTo(state, '/', 'read the home page on a phone the helper never reached');
    await plantOne(this, state, settledQueuedReport({ report_id: '01J0SIGNALSLICE03WAKEUP01' }));
  },
);

Given('the site is answering sends with a throttled door', function (this: object) {
  scenarioState(this);
  setWritePathBehaviour('throttled');
});

Given('the site is refusing sends with a reason', function (this: object) {
  scenarioState(this);
  setWritePathBehaviour('refused');
});

Given('the site already has that report from an earlier send', function (this: object) {
  const state = scenarioState(this);
  const records = planted(this);
  assert.ok(records.length > 0, `test bug: no report was planted before prestoring it.${failureContext(state)}`);
  prestoreReport(records[0]!.report_id);
});

Given('the site already has one of them from an earlier send', function (this: object) {
  const state = scenarioState(this);
  const records = planted(this);
  assert.ok(records.length > 0, `test bug: no report was planted before prestoring one.${failureContext(state)}`);
  prestoreReport(records[0]!.report_id);
});

Given(
  'the site will hear the first send but the answer will never reach the phone',
  function (this: object) {
    scenarioState(this);
    setWritePathBehaviour('lose-answer-once');
  },
);

// ---------- Whens ----------

When('the signal comes back', { timeout: 60_000 }, async function (this: object) {
  await signalReturns(this, scenarioState(this));
});

When('the signal comes back again later', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  setSignal(state, 'blackout');
  await new Promise((tick) => setTimeout(tick, 500));
  await signalReturns(this, state);
});

When(
  'the surfer opens the site with signal and the helper arrives',
  { timeout: 120_000 },
  async function (this: object) {
    const state = scenarioState(this);
    releaseHelper();
    setSignal(state, 'online');
    await goTo(state, '/', 'open the site with signal, helper now available');
    await settleHelper(state);
    // Activation is the trigger under test; give the flush time to be seen.
    const started = Date.now();
    const page = await phonePage(state);
    const ids = new Set(planted(this).map((record) => record.report_id));
    while (Date.now() - started < FLUSH_PATIENCE_MS) {
      if (writePathReceived().length > 0) break;
      const waiting = await queuedReports(page).catch(() => null);
      if (waiting !== null && !waiting.some((record) => ids.has(record.report_id))) break;
      await new Promise((tick) => setTimeout(tick, 250));
    }
  },
);

/** The filing journey itself, shared by the When and the chained Given below. */
async function fileReportWithNoSignal(state: SignalScenario): Promise<void> {
  setSignal(state, 'blackout');
  const page = await phonePage(state);
  for (const answer of ['Cintura a pecho', 'Picado', 'Bueno']) {
    try {
      await page.getByText(answer, { exact: true }).first().click({ timeout: 3000 });
    } catch (error) {
      state.failures.push({ label: `answer "${answer}" on the report screen`, error });
    }
  }
  try {
    await page.getByText('Mandar', { exact: true }).first().click({ timeout: 3000 });
  } catch (error) {
    state.failures.push({ label: 'tap Mandar with the signal gone', error });
  }
  await new Promise((tick) => setTimeout(tick, 1000));
}

When(
  'the signal drops and the surfer files their report anyway',
  { timeout: 120_000 },
  async function (this: object) {
    await fileReportWithNoSignal(scenarioState(this));
  },
);

// Pillar-2 composition: this Given IS the Given + When of "Filed on the sand,
// the report is saved for the road", replayed through the same journey
// functions rather than restated fixtures, so the two scenarios read as one
// story without either compounding behaviours.
Given(
  'a surfer filed their report at the beach with no signal',
  { timeout: 300_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await assertBuiltSite();
    await readHomeWithSignal(state);
    await openReportScreenWithSignal(state, VISITED_SPOT);
    await fileReportWithNoSignal(state);
  },
);

// ---------- Thens ----------

Then(
  'the report reaches the site by itself, exactly as it was filed',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const arrived = writePathReceived();
    assert.ok(
      arrived.length > 0,
      'WHAT: nothing reached the site; the report is still only on the phone. '
        + 'WHY: a report filed with no signal must send ITSELF when coverage returns — the '
        + 'surfer already did their part on the sand, and signal is worst exactly where reports '
        + 'happen. '
        + `HOW: flush the queue when the signal returns (07-write-path.md section 5; application-architecture.md section 12).${failureContext(state)}`,
    );
    const records = planted(this);
    const latest = arrived[arrived.length - 1]!;
    let sent: Record<string, unknown>;
    try {
      sent = JSON.parse(latest.body) as Record<string, unknown>;
    } catch {
      assert.fail(
        `WHAT: what reached the site is not a readable report: ${JSON.stringify(latest.body.slice(0, 120))}. `
          + `WHY: the flush re-sends the committed record itself, nothing else.${failureContext(state)}`,
      );
    }
    if (records.length > 0) {
      const filed = records[0]!;
      assert.deepEqual(
        sent,
        filed,
        `WHAT: the report that reached the site is not the report that was filed. `
          + `Filed: ${JSON.stringify(filed)}. Sent: ${JSON.stringify(sent)}. `
          + 'WHY: retry re-sends the byte-identical record — the name is never re-minted and the '
          + 'observation time is never touched, because the site dedups on that name and joins '
          + 'on that time. Any difference breaks once-and-only-once. '
          + `HOW: send the committed record exactly as the queue holds it (07-write-path.md section 5).${failureContext(state)}`,
      );
    }
    const wind = String(sent['wind'] ?? '');
    const quality = String(sent['quality'] ?? '');
    assert.ok(
      (WIND_STATE_TOKENS as readonly string[]).includes(wind),
      `WHAT: the sent report's wind word ${JSON.stringify(wind)} is not one of the settled words `
        + `${JSON.stringify(WIND_STATE_TOKENS)}. WHY: a made-up token queued today is a refused send later; `
        + `the vocabulary has one home, src/data/report-vocab.ts.${failureContext(state)}`,
    );
    assert.ok(
      (QUALITY_TOKENS as readonly string[]).includes(quality),
      `WHAT: the sent report's quality word ${JSON.stringify(quality)} is not one of the settled words `
        + `${JSON.stringify(QUALITY_TOKENS)}. WHY: same vocabulary, same single home.${failureContext(state)}`,
    );
  },
);

Then('the report is no longer waiting on the phone', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const ids = new Set(planted(this).map((record) => record.report_id));
  const waiting = await queuedReports(page).catch((error) => {
    state.failures.push({ label: "read the phone's queue", error });
    return null;
  });
  assert.ok(waiting !== null, `WHAT: the phone's queue cannot be read at all.${failureContext(state)}`);
  const still = ids.size > 0 ? waiting.filter((record) => ids.has(record.report_id)) : waiting;
  assert.ok(
    still.length === 0,
    `WHAT: ${still.length} report(s) are still waiting on the phone after the site answered: `
      + `${JSON.stringify(still.map((record) => record.report_id))}. `
      + 'WHY: any answer that counts as received deletes the entry — compared, nothing to '
      + 'compare, or already-had-it alike. An entry that survives its own ack will replay '
      + 'forever. '
      + `HOW: delete the queue entry on any 200-class answer (07-write-path.md section 5).${failureContext(state)}`,
  );
});

Then('no report is waiting on the phone afterwards', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const waiting = await queuedReports(page).catch((error) => {
    state.failures.push({ label: "read the phone's queue", error });
    return null;
  });
  assert.ok(waiting !== null, `WHAT: the phone's queue cannot be read at all.${failureContext(state)}`);
  assert.ok(
    waiting.length === 0,
    `WHAT: the queue still holds ${JSON.stringify(waiting.map((record) => record.report_id))}. `
      + `WHY: every answered report leaves the queue; a leftover entry means a lost ack path.${failureContext(state)}`,
  );
});

Then('the report stays waiting on the phone', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const ids = new Set(planted(this).map((record) => record.report_id));
  const waiting = await queuedReports(page).catch((error) => {
    state.failures.push({ label: "read the phone's queue", error });
    return null;
  });
  assert.ok(waiting !== null, `WHAT: the phone's queue cannot be read at all.${failureContext(state)}`);
  assert.ok(
    waiting.some((record) => ids.has(record.report_id)),
    'WHAT: the report is gone from the queue although the site never accepted it. '
      + 'WHY: a throttled or failing door means WAIT, not forget: deleting an unaccepted entry '
      + 'silently drops a label a surfer stood on the sand to give us. '
      + `HOW: keep the entry queued on any 429, failure or timeout (07-write-path.md section 5).${failureContext(state)}`,
  );
});

Then('the label stays on the phone', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const page = await phonePage(state);
  const ids = new Set(planted(this).map((record) => record.report_id));
  const waiting = await queuedReports(page).catch(() => []);
  assert.ok(
    waiting.some((record) => ids.has(record.report_id)),
    'WHAT: the label is gone from the phone although the site refused it. '
      + 'WHY: a refusal surfaces its reason and KEEPS the label — the surfer\'s observation is '
      + 'theirs, and silently dropping it is the one queue behaviour the design bans outright. '
      + `HOW: keep the record locally on any refusal (07-write-path.md sections 4.3 and 5).${failureContext(state)}`,
  );
});

Then('the phone does not hammer the throttled door', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const arrived = writePathReceived();
  assert.ok(
    arrived.length >= 1,
    'WHAT: the phone never even knocked: no send reached the throttled door. '
      + 'WHY: backing off means try, hear 429, wait longer; it never means give up before the '
      + 'first try. '
      + `HOW: flush on the signal's return, then back off on 429.${failureContext(state)}`,
  );
  if (arrived.length > 1) {
    const gaps = arrived.slice(1).map((send, index) => send.at - arrived[index]!.at);
    const tightest = Math.min(...gaps);
    assert.ok(
      tightest >= 5000,
      `WHAT: the phone re-knocked ${arrived.length - 1} time(s) with only ${tightest} ms between knocks. `
        + 'WHY: the settled ladder starts at thirty seconds and doubles; a tight retry loop is '
        + 'exactly the burst the free front door exists to shed, and it drains the battery of a '
        + 'phone that is trying to leave the beach. '
        + `HOW: exponential backoff, base 30 s, doubling, with jitter (07-write-path.md section 5).${failureContext(state)}`,
    );
  }
});

Then(
  'the phone does not try the same send again by itself',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    await new Promise((tick) => setTimeout(tick, 3000));
    const arrived = writePathReceived();
    assert.ok(
      arrived.length >= 1,
      'WHAT: no send ever reached the site, so there is no refusal to honour. '
        + `WHY: this scenario needs the flush to try once and hear the reason.${failureContext(state)}`,
    );
    assert.ok(
      arrived.length === 1,
      `WHAT: the phone sent the refused report ${arrived.length} times. `
        + 'WHY: a report the site refused for its shape will not become valid by waiting; '
        + 'mechanical retries of a refusal are noise for the site and false hope for the surfer. '
        + `HOW: surface the reason, keep the label, retry nothing (07-write-path.md section 5).${failureContext(state)}`,
    );
  },
);

Then(
  "the surfer is shown the site's reason in plain Spanish",
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      now.includes(REFUSAL_REASON_ES),
      `WHAT: the site's reason (${JSON.stringify(REFUSAL_REASON_ES)}) is nowhere the surfer can see it. `
        + `On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: a refusal the surfer never learns about is a label they think was delivered. The '
        + 'site already speaks its reasons in plain words; the phone\'s only job is to show them. '
        + `HOW: surface the refusal reason where the queued report is shown.${failureContext(state)}`,
    );
  },
);

Then('nothing the surfer sees reads as a failure', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const now = await screenText(state);
  for (const pattern of FAILURE_WORDS) {
    const hit = pattern.exec(now);
    assert.equal(
      hit,
      null,
      `WHAT: the screen reads as a failure: ${JSON.stringify(hit?.[0] ?? '')} in ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: a throttled door and a waiting queue are the same calm pending state as no '
        + 'signal — never an error, never a red word. A surfer who sees failure re-taps, and '
        + 're-taps are the duplicates this feature exists to prevent. '
        + `HOW: render waiting as waiting (research 15 section 5.5; 07-write-path.md section 4.3).${failureContext(state)}`,
    );
  }
});

Then(
  'it went out without any help the phone was not guaranteed to have',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const page = await phonePage(state);
    const backgroundErrands = await page
      .evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const sync = (registration as unknown as { sync?: { getTags(): Promise<string[]> } })?.sync;
        if (!sync) return [];
        return sync.getTags();
      })
      .catch(() => [] as string[]);
    assert.ok(
      backgroundErrands.length === 0,
      `WHAT: the flush leans on background machinery (${JSON.stringify(backgroundErrands)}) whose `
        + 'availability on iPhones is unverified. WHY: every flush trigger must work everywhere; '
        + 'anything unverified may be a bonus, never a dependency. '
        + `HOW: flush on the signal's return and on the helper's arrival; register nothing (application-architecture.md section 12).${failureContext(state)}`,
    );
  },
);

Then('the site is asked about both reports', { timeout: 60_000 }, async function (this: object) {
  const state = scenarioState(this);
  const records = planted(this);
  const askedIds = new Set(
    writePathReceived().map((send) => {
      try {
        return String((JSON.parse(send.body) as { report_id?: string }).report_id ?? '');
      } catch {
        return '';
      }
    }),
  );
  const missing = records.filter((record) => !askedIds.has(record.report_id));
  assert.ok(
    missing.length === 0,
    `WHAT: the site was never asked about ${JSON.stringify(missing.map((record) => record.report_id))} `
      + `(asked: ${JSON.stringify([...askedIds])}). `
      + 'WHY: the phone never decides a report already went. It replays every waiting record and '
      + 'lets the site\'s memory of the name decide — client-side "already sent" guesses are '
      + 'exactly the trust this design refuses. '
      + `HOW: flush every queued entry; the site answers each one (07-write-path.md sections 4.4 and 5).${failureContext(state)}`,
  );
});

Then('the site still holds each report exactly once', function (this: object) {
  const state = scenarioState(this);
  const distinct = new Set(planted(this).map((record) => record.report_id)).size;
  const held = writePathStoredCount();
  assert.equal(
    held,
    distinct,
    `WHAT: the site holds ${held} report(s) where exactly ${distinct} were ever filed. `
      + 'WHY: once, and only once — a replay that raced an earlier success must land on the '
      + 'site\'s memory of the name, never become a second record, and never move a counter. '
      + `HOW: replay the identical record and let the site dedup on its name (07-write-path.md section 4.4).${failureContext(state)}`,
  );
});

Then(
  "the phone accepts the site's first answer as the answer",
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const arrived = writePathReceived();
    assert.ok(
      arrived.length >= 1,
      'WHAT: the phone never asked the site, so there was no answer to accept. '
        + `WHY: the replay must happen for the original answer to come back.${failureContext(state)}`,
    );
    const page = await phonePage(state);
    const ids = new Set(planted(this).map((record) => record.report_id));
    const waiting = await queuedReports(page).catch(() => []);
    assert.ok(
      !waiting.some((record) => ids.has(record.report_id)),
      'WHAT: the site answered with its first answer and the phone kept the entry queued anyway. '
        + 'WHY: already-had-it IS an acceptance: the original reveal comes back, the surfer is '
        + 'shown what they were always going to be shown, and the entry\'s work is done. An '
        + 'entry kept past that ack replays forever. '
        + `HOW: treat the already-had-it answer exactly like the first ack (07-write-path.md section 5).${failureContext(state)}`,
    );
  },
);

Then(
  'the site was asked twice and answered the second ask with its first answer',
  function (this: object) {
    const state = scenarioState(this);
    const arrived = writePathReceived();
    assert.equal(
      arrived.length,
      2,
      `WHAT: the site was asked ${arrived.length} time(s); this journey needs exactly two — the send `
        + 'whose answer died on the way back, and the replay. '
        + 'WHY: after a lost answer the entry MUST stay queued (the phone heard nothing) and the '
        + 'next return of the signal MUST replay it (the phone never guesses). Zero asks means no '
        + 'flush; one ask means the entry was dropped on a dead socket; more than two means '
        + 'hammering. '
        + `HOW: keep the entry on a dead answer, replay identically on the next trigger (07-write-path.md section 5).${failureContext(state)}`,
    );
    assert.equal(
      arrived[1]!.body,
      arrived[0]!.body,
      `WHAT: the replay is not the same report: first ${JSON.stringify(arrived[0]!.body.slice(0, 120))}, `
        + `then ${JSON.stringify(arrived[1]!.body.slice(0, 120))}. `
        + 'WHY: only a byte-identical replay lands on the site\'s memory of the name; a re-minted '
        + 'or edited record becomes a SECOND report and double-counts the surfer. '
        + `HOW: re-send the committed record untouched (07-write-path.md section 5).${failureContext(state)}`,
    );
  },
);

Then(
  'the screen says the report is saved for when the signal returns',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      now.includes(QUEUED_VARIANT_PREFIX),
      `WHAT: the screen does not carry the settled saved-for-later words (${JSON.stringify(QUEUED_VARIANT_PREFIX)}). `
        + `On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: a surfer who filed with no signal must be told their report is safe and will '
        + 'send itself — the words are settled in application-architecture.md section 10 and the '
        + 'capture journey that renders them is F-TELL-US-WHAT-YOU-SAW-COLD slice-01\'s. This '
        + 'scenario is the two features meeting; it stays RED until both sides exist. '
        + `HOW: commit the label, then render the queued variant of screen two.${failureContext(state)}`,
    );
  },
);

Then(
  'the sin señal page now promises that reports get saved',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      now.includes(OFFLINE_SENTENCE_TWO),
      `WHAT: the sin señal page still does not say ${JSON.stringify(OFFLINE_SENTENCE_TWO)}. `
        + `On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: the second settled sentence was deliberately withheld while it was untrue; the '
        + 'moment a real queue holds real reports, the promise is true and the page owes it. '
        + 'Landing this sentence also amends the slice-01 scenario that asserted its absence — '
        + 'that amendment is owed in the same change, per the slice-03 roadmap step. '
        + `HOW: render section 10's second sentence now that the queue exists.${failureContext(state)}`,
    );
  },
);

Then(
  'the page counts one waiting report in the settled words',
  { timeout: 60_000 },
  async function (this: object) {
    const state = scenarioState(this);
    const now = await screenText(state);
    assert.ok(
      now.includes(QUEUE_BOX_ONE),
      `WHAT: the sin señal page does not show ${JSON.stringify(QUEUE_BOX_ONE)}. `
        + `On screen: ${JSON.stringify(now.slice(0, 240))}. `
        + 'WHY: the queued-count box counts REAL queue entries — one waiting report reads "1 '
        + 'reporte guardado", never a guess, never a stale count. The words are the section 14 '
        + 'wireframe\'s, verbatim. '
        + `HOW: count the queue at serve time and render the settled box.${failureContext(state)}`,
    );
  },
);
