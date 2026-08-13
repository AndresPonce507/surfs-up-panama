// Slice-02, Build's half of the seam: the hourly cycle hands the fresh bundle
// to the publisher and waits for the answer.
//
// The steps drive `runBuild(overrides)` -- Build's own production composition
// root -- and OBSERVE only port-exposed things: what the injected publisher
// port was handed, what the hour printed, and what runBuild answered. Nothing
// reaches inside build-handler.ts.
//
// The whole file is example-based on purpose. Sad paths are enumerated one by
// one (Mandate 11); the generative exploration of Build's scoring space is
// already the unit layer's job in this repo.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  BUILD_REFUSED_EVENT,
  BUILD_SUCCESS_EVENT,
  BUNDLE_KEY,
  UNREACHABLE_PUBLISHER_MESSAGE,
  assertHourDelta,
  captureHour,
  handoffFailedEventName,
  handoffLabel,
  message,
  runOneHourlyCycle,
  slice02,
  statedAbsence,
  type LoggedLine,
  type Slice02Scenario,
} from './support/slice-02-world';
import { setTo } from '../../../common/state_delta';

const HOUR_BUDGET = { timeout: 30_000 };

function eventsThisHour(scenario: Slice02Scenario): LoggedLine[] {
  return scenario.logbook.slice(scenario.logbookBeforeThisHour);
}

function handoffsThisHour(scenario: Slice02Scenario) {
  return scenario.handoffs.slice(scenario.handoffsBeforeThisHour);
}

function linesNamed(scenario: Slice02Scenario, event: string): LoggedLine[] {
  return eventsThisHour(scenario).filter((line) => line['event'] === event);
}

function printedThisHour(scenario: Slice02Scenario): string {
  return JSON.stringify(eventsThisHour(scenario).map((line) => line['event']));
}

function publishedBuildId(scenario: Slice02Scenario, expectation: string): string {
  if (scenario.buildFailure !== null && scenario.buildFailure !== undefined) {
    assert.fail(
      `WHAT: Build's hour exploded instead of finishing (${message(scenario.buildFailure)}). `
        + `WHY: ${expectation}. `
        + `HOW: only a harness bug may throw here; an honest hour answers a BuildOutcome.${statedAbsence(scenario)}`,
    );
  }
  const outcome = scenario.buildOutcome;
  assert.ok(
    outcome !== null && outcome['published'] === true,
    `WHAT: Build did not finish an honest cycle: ${JSON.stringify(outcome)}. `
      + `WHY: ${expectation}. `
      + `HOW: the fixture readings are usable, so this hour must publish a bundle before anything is handed over.${statedAbsence(scenario)}`,
  );
  return String((outcome as Record<string, unknown>)['build_id']);
}

// ---------- Givens ----------

Given('Build has a fresh hour\'s worth of readings for the Pacific', function (this: object) {
  const scenario = slice02(this);
  scenario.readings.seedPacific();
  scenario.before = captureHour(scenario);
});

Given('Build already handed this morning\'s bundle to the publisher', HOUR_BUDGET, async function (this: object) {
  const scenario = slice02(this);
  scenario.readings.seedPacific();
  await runOneHourlyCycle(scenario);
  // The chained baseline: whatever this morning left behind is where the
  // hour under test starts. It is snapshotted, never asserted here -- the
  // scenario that owns the morning cycle is the one above.
  scenario.before = captureHour(scenario);
});

Given('this hour there is not one usable reading anywhere', function (this: object) {
  slice02(this).readings.predictions.clear();
});

Given('this hour\'s fresh pages never turn up publicly', function (this: object) {
  slice02(this).freshPagesTurnUpPublicly = false;
});

Given('the publisher cannot be reached this hour', function (this: object) {
  slice02(this).publisherAnswer = { kind: 'unreachable' };
});

Given('the publisher answers that it published nothing this hour', function (this: object) {
  slice02(this).publisherAnswer = { kind: 'refused' };
});

// ---------- When ----------

When('Build runs its hourly cycle', HOUR_BUDGET, async function (this: object) {
  await runOneHourlyCycle(slice02(this));
});

// ---------- Thens ----------

Then('the publisher is asked exactly once, for the build Build just finished and the bundle it just wrote', function (this: object) {
  const scenario = slice02(this);
  const buildId = publishedBuildId(scenario, 'the handover is the only way into the publisher, so an honest hour must make it');
  const handoffs = handoffsThisHour(scenario);
  assert.equal(
    handoffs.length,
    1,
    `WHAT: the publisher was asked ${handoffs.length} time(s) this hour, not once. `
      + `WHY: one bounded publication per hourly cycle is the whole recorded decision; zero leaves the site stale forever, twice pays twice for the same hour. `
      + `HOW: after the build lines are printed, call the injected invokePublisher override exactly once, then check its fresh public pages.${statedAbsence(scenario)}`,
  );
  assert.deepEqual(
    { build_id: handoffs[0]?.build_id, bundle_key: handoffs[0]?.bundle_key },
    { build_id: buildId, bundle_key: BUNDLE_KEY },
    `WHAT: the publisher was handed ${JSON.stringify(handoffs[0])}. `
      + `WHY: the publisher answers only its build -- a different id or key publishes a bundle nobody asked for, and the publisher refuses it. `
      + `HOW: hand over the build's own id, and beside it the region bundle key composed as pub/v1/regions/ then REGION_ID then /bundle.json, built from the region constant, never a second literal.${statedAbsence(scenario)}`,
  );
});

Then('Build waited for the publisher before its hour ended', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    scenario.handoffResolvedBeforeHourEnded,
    true,
    `WHAT: Build's hour ended without the handover having settled (${String(scenario.handoffResolvedBeforeHourEnded)}). `
      + `WHY: the handover is synchronous by decision -- Build waits for the answer, which is exactly why its reviewed time limit grows in this same slice. `
      + `HOW: await the invokePublisher call inside runBuild; never fire it and walk away.${statedAbsence(scenario)}`,
  );
});

Then('the day\'s log claims the build succeeded, exactly once', function (this: object) {
  const scenario = slice02(this);
  const buildId = publishedBuildId(scenario, 'an hour that really built must say so, exactly once, for the dead-man chain to count it');
  const successes = linesNamed(scenario, BUILD_SUCCESS_EVENT);
  assert.equal(
    successes.length,
    1,
    `WHAT: this hour printed ${successes.length} success line(s): ${printedThisHour(scenario)}. `
      + `WHY: the metric behind the dead-man alarm counts these lines; two claims for one hour is a false all-clear. `
      + `HOW: leave deriveBuildLogLines as the only thing that prints build.success.${statedAbsence(scenario)}`,
  );
  assert.equal(
    successes[0]?.['build_id'],
    buildId,
    `WHAT: the success line names ${String(successes[0]?.['build_id'])}, not the build ${buildId} this hour actually finished. `
      + `WHY: the line is how a human ties the published pages back to the cycle that made them. `
      + `HOW: print the outcome's own build_id.${statedAbsence(scenario)}`,
  );
  assertHourAgrees(scenario);
});

Then('the publisher was asked once before its fresh pages were checked', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    handoffsThisHour(scenario).length,
    1,
    `WHAT: this hour handed the publisher ${handoffsThisHour(scenario).length} bundle(s), not one. `
      + `WHY: verification can only check a page after Publisher emitted it, but the one bounded handover must never duplicate spend. `
      + `HOW: await exactly one Publisher handover before the public-manifest probe.${statedAbsence(scenario)}`,
  );
});

Then('the publisher was asked for the morning\'s bundle only, never for this hour\'s', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    scenario.handoffsBeforeThisHour,
    1,
    `WHAT: this morning's honest cycle handed the publisher ${scenario.handoffsBeforeThisHour} bundle(s), not one. `
      + `WHY: this scenario only means something once the handover exists; without a morning handover there is nothing for this hour to refrain from repeating. `
      + `HOW: implement the handover first (the scenario above pins it), then keep it out of this hour.${statedAbsence(scenario)}`,
  );
  assert.deepEqual(
    handoffsThisHour(scenario),
    [],
    `WHAT: this hour handed the publisher ${JSON.stringify(handoffsThisHour(scenario))}. `
      + `WHY: an hour that published nothing has no fresh bundle to publish; waking the publisher would republish the previous surface for no reason and spend a whole publisher cycle on it. `
      + `HOW: only hand over when the outcome published.${statedAbsence(scenario)}`,
  );
});

Then('the hour\'s log says the build refused, and never claims success', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    linesNamed(scenario, BUILD_REFUSED_EVENT).length,
    1,
    `WHAT: this hour printed ${printedThisHour(scenario)}, with no single refusal line. `
      + `WHY: a human reading the log at 3 a.m. must be able to see why an hour produced no new page, without archaeology. `
      + `HOW: leave deriveBuildLogLines printing build.refused with its reason.${statedAbsence(scenario)}`,
  );
  assert.deepEqual(
    linesNamed(scenario, BUILD_SUCCESS_EVENT),
    [],
    `WHAT: this hour claimed success as well: ${printedThisHour(scenario)}. `
      + `WHY: the one rule the whole product rests on -- never claim more certainty than the data earned. `
      + `HOW: never print build.success for an outcome that did not publish.${statedAbsence(scenario)}`,
  );
});

Then('Build\'s hour records that its fresh pages could not be confirmed publicly', function (this: object) {
  const scenario = slice02(this);
  assert.ok(
    scenario.buildFailure !== null && scenario.buildFailure !== undefined,
    `WHAT: Build's hour finished normally and answered ${JSON.stringify(scenario.buildOutcome)}. `
      + `WHY: pages that cannot be confirmed public mean the release chain is broken, even after Publisher emitted them. `
      + `HOW: run the public page check after the Publisher handover and surface its mismatch.${statedAbsence(scenario)}`,
  );
  assert.match(
    message(scenario.buildFailure),
    /health\.publish\.mismatch/,
    `WHAT: Build failed with ${message(scenario.buildFailure)}, not its explicit public-page mismatch. `
      + `HOW: preserve probePublicManifest's mismatch error after the Publisher handover.${statedAbsence(scenario)}`,
  );
});

Then('the publisher was asked once and never asked again', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    handoffsThisHour(scenario).length,
    1,
    `WHAT: the publisher was asked ${handoffsThisHour(scenario).length} time(s) this hour. `
      + `WHY: a failed handover is never retried in-cycle -- the next hourly cycle republishes everything anyway, because publication only ever adds. `
      + `HOW: catch the rejection; do not loop, do not back off, do not re-invoke.${statedAbsence(scenario)}`,
  );
});

Then('the hour\'s log writes down the failed handover, naming the build and what went wrong', HOUR_BUDGET, async function (this: object) {
  const scenario = slice02(this);
  const buildId = publishedBuildId(scenario, 'a failed handover must not erase a build that really happened');
  const eventName = await handoffFailedEventName();
  const failures = linesNamed(scenario, eventName);
  assert.equal(
    failures.length,
    1,
    `WHAT: this hour printed ${printedThisHour(scenario)}, with no single "${eventName}" line. `
      + `WHY: a publisher that could not be reached leaves the site stale; if nobody writes it down, the staleness is invisible until a surfer notices. `
      + `HOW: export PUBLISH_HANDOFF_FAILED_EVENT = '${eventName}' from src/pipeline/lambda/log-events.ts, informational only like build.refused, and print { event, build_id, reason }.${statedAbsence(scenario)}`,
  );
  const line = failures[0] ?? {};
  assert.equal(
    line['build_id'],
    buildId,
    `WHAT: the failed-handover line names ${String(line['build_id'])}, not the build ${buildId} whose bundle went unhanded. `
      + `WHY: without the id nobody can tell which hour's pages are the stale ones. `
      + `HOW: put the outcome's build_id on the line.${statedAbsence(scenario)}`,
  );
  assert.ok(
    String(line['reason'] ?? '').includes(UNREACHABLE_PUBLISHER_MESSAGE),
    `WHAT: the failed-handover line's reason is ${JSON.stringify(line['reason'])}, which does not carry what actually went wrong. `
      + `WHY: a reason that swallows its own cause turns a five-minute diagnosis into an afternoon. `
      + `HOW: put the rejection's own message on the line.${statedAbsence(scenario)}`,
  );
});

Then('the day\'s log still claims the build itself succeeded', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    linesNamed(scenario, BUILD_SUCCESS_EVENT).length,
    1,
    `WHAT: this hour printed ${printedThisHour(scenario)}, without exactly one build success line. `
      + `WHY: the build DID succeed -- it wrote its bundle. Withholding build.success because the handover failed would page a human about a build that worked and hide the thing that actually broke. `
      + `HOW: print the build lines before handing over, and never let the handover's fate rewrite them.${statedAbsence(scenario)}`,
  );
});

Then('Build still answers that it published', function (this: object) {
  const scenario = slice02(this);
  assert.equal(
    scenario.buildOutcome?.['published'],
    true,
    `WHAT: Build answered ${JSON.stringify(scenario.buildOutcome)} after a failed handover. `
      + `WHY: Build's answer is about Build's own work; a failed handover must never turn a real publication into a reported refusal. `
      + `HOW: swallow the handover rejection after writing it down, and return the outcome unchanged.${statedAbsence(scenario)}`,
  );
  assert.equal(
    scenario.buildFailure,
    null,
    `WHAT: the failed handover escaped and broke Build's hour (${message(scenario.buildFailure)}). `
      + `HOW: catch it.${statedAbsence(scenario)}`,
  );
});

Then('the hour\'s log writes down no failed handover', HOUR_BUDGET, async function (this: object) {
  const scenario = slice02(this);
  const eventName = await handoffFailedEventName();
  assert.deepEqual(
    linesNamed(scenario, eventName),
    [],
    `WHAT: this hour wrote down a failed handover: ${printedThisHour(scenario)}. `
      + `WHY: the handover did not fail -- the publisher answered. A publisher that refuses already said so itself, in its own words, in its own log; repeating it here in Build's log would make the publisher's own honesty gate ambiguous. `
      + `HOW: write down only a REJECTED handover, never an answer whose contents you did not like.${statedAbsence(scenario)}`,
  );
});

// ---------- the declared delta over the hour's universe (Mandate 8) ----------
//
// Declared on the honest hour, where there IS a delta to declare. The refusal
// scenarios assert their own fail-closed shape through the Thens above, which
// name the exact list each one must leave behind.

function assertHourAgrees(scenario: Slice02Scenario): void {
  const buildId = publishedBuildId(scenario, 'the declared delta describes an hour that really built');
  assertHourDelta(
    scenario,
    {
      'publisher.handoffs': setTo([
        ...(scenario.before?.['publisher.handoffs'] as readonly string[] | undefined ?? []),
        handoffLabel({ build_id: buildId, bundle_key: BUNDLE_KEY }),
      ]),
      'logbook.events': setTo([
        ...(scenario.before?.['logbook.events'] as readonly string[] | undefined ?? []),
        BUILD_SUCCESS_EVENT,
      ]),
    },
    'one honest hour hands over exactly one bundle and claims success exactly once, and touches nothing else a reader can see',
  );
}
