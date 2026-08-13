// Slice-01: the publisher's front door (the Lambda composition root seam,
// src/pipeline/lambda/publish-handler.ts, not existing yet). Pinned contract,
// mirroring build-handler.ts's runBuild(overrides) pattern plus the project
// policy's explicit read-only environment input:
//
//   runPublish(event: { build_id, bundle_key }, overrides?: {
//     environment?: Record<string, string | undefined>;
//     publish?: (invocation) => Promise<PublishOutcome>;
//   }): Promise<{ statusCode: number }>
//
//   - the event payload is handed to the publish port UNCHANGED;
//   - the answer mirrors build-handler's outcome mapping:
//     statusCode 200 when published, 204 when refused;
//   - required settings are validated BEFORE any port is called, and a
//     missing one refuses in the house WHAT/WHY/HOW shape (the exact
//     precedent is build-handler.ts's requiredEnv).
//
// The steps OBSERVE only: what the injected publish port received, the
// resolved answer, and the captured refusal. A missing module or export
// fails inside a Then as a stated absence, never as a broken import.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BUNDLE_KEY,
  FRESH_BUILD_ID,
  LATER_HOURLY_BUILD_ID,
  PRODUCTION_BUCKET,
  PRODUCTION_ORIGIN,
  REPOSITORY_ROOT,
  scenarioState,
  statedAbsence,
  type PublishInvocation,
  type PublishOutcome,
  type PublishScenario,
} from './support/world';

const SUCCESSFUL_KNOCK: PublishInvocation = { build_id: FRESH_BUILD_ID, bundle_key: BUNDLE_KEY };
const REFUSED_KNOCK: PublishInvocation = { build_id: LATER_HOURLY_BUILD_ID, bundle_key: BUNDLE_KEY };

const CANNED_SUCCESS: PublishOutcome = {
  published: true,
  build_id: FRESH_BUILD_ID,
  uploaded_objects: 5,
  directory_aliases: 2,
};

const CANNED_REFUSAL: PublishOutcome = {
  published: false,
  reason: 'acceptance harness: this cycle refuses on purpose',
};

function pinnedMessage(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error);
}

async function knockOnFrontDoor(
  scenario: PublishScenario,
  event: PublishInvocation,
  outcomeToReturn: PublishOutcome,
): Promise<void> {
  scenario.handlerEvents.push(event);
  let module: Record<string, unknown>;
  try {
    module = (await import(
      pathToFileURL(resolve(REPOSITORY_ROOT, 'src/pipeline/lambda/publish-handler.ts')).href
    )) as Record<string, unknown>;
  } catch (error) {
    scenario.absences.push(`src/pipeline/lambda/publish-handler.ts does not exist yet (${pinnedMessage(error)})`);
    return;
  }
  const runPublish = module['runPublish'];
  if (typeof runPublish !== 'function') {
    scenario.absences.push('src/pipeline/lambda/publish-handler.ts exists but exports no runPublish function');
    return;
  }
  const publish = async (invocation: unknown): Promise<PublishOutcome> => {
    scenario.handlerReceived.push(invocation);
    return outcomeToReturn;
  };
  try {
    scenario.handlerAnswers.push(
      await (runPublish as (
        e: PublishInvocation,
        overrides: { environment: Record<string, string>; publish: typeof publish },
      ) => Promise<unknown>)(event, { environment: scenario.handlerEnvironment, publish }),
    );
  } catch (error) {
    scenario.handlerRefusal = error;
  }
}

function answerAt(scenario: PublishScenario, index: number, expectation: string): { statusCode?: unknown } {
  if (scenario.handlerRefusal !== null && scenario.handlerRefusal !== undefined) {
    assert.fail(
      `WHAT: the front door threw instead of answering (${pinnedMessage(scenario.handlerRefusal)}). `
        + `WHY: ${expectation}. `
        + `HOW: with its settings complete, the door maps the outcome to its answer and never throws.${statedAbsence(scenario)}`,
    );
  }
  const answer = scenario.handlerAnswers[index];
  assert.ok(
    answer !== undefined,
    `WHAT: the front door gave no answer to knock ${index + 1}. `
      + `WHY: ${expectation}. `
      + `HOW: implement runPublish in src/pipeline/lambda/publish-handler.ts, overrides-injectable like build-handler's runBuild.${statedAbsence(scenario)}`,
  );
  return answer as { statusCode?: unknown };
}

// ---------- Givens ----------

Given('the publisher\'s front door has every setting it needs', function (this: object) {
  scenarioState(this).handlerEnvironment = {
    BUCKET_NAME: PRODUCTION_BUCKET,
    PUBLIC_SITE_ORIGIN: PRODUCTION_ORIGIN,
  };
});

Given('the publisher\'s front door is missing a setting it needs', function (this: object) {
  scenarioState(this).handlerEnvironment = {};
});

// ---------- Whens ----------

When('Build knocks with a call to publish and the cycle succeeds', { timeout: 15_000 }, async function (this: object) {
  await knockOnFrontDoor(scenarioState(this), SUCCESSFUL_KNOCK, CANNED_SUCCESS);
});

When('Build knocks with a call to publish and the cycle refuses', { timeout: 15_000 }, async function (this: object) {
  await knockOnFrontDoor(scenarioState(this), REFUSED_KNOCK, CANNED_REFUSAL);
});

When('Build knocks with a call to publish', { timeout: 15_000 }, async function (this: object) {
  await knockOnFrontDoor(scenarioState(this), SUCCESSFUL_KNOCK, CANNED_SUCCESS);
});

// ---------- Thens ----------

Then('the exact call Build made is what the cycle received, unchanged', function (this: object) {
  const scenario = scenarioState(this);
  assert.ok(
    scenario.handlerReceived.length > 0,
    `WHAT: the cycle behind the door never received anything. `
      + `WHY: the door's whole job is to pass Build's call through to the publish port. `
      + `HOW: call the injected publish port with the invocation payload.${statedAbsence(scenario)}`,
  );
  assert.deepEqual(
    scenario.handlerReceived[0],
    scenario.handlerEvents[0],
    `WHAT: the call the cycle received is not the call Build made. `
      + `Build made: ${JSON.stringify(scenario.handlerEvents[0])}. Received: ${JSON.stringify(scenario.handlerReceived[0])}. `
      + `WHY: the publisher answers only its build — a reshaped or re-minted payload publishes a bundle nobody asked for. `
      + `HOW: pass { build_id, bundle_key } through untouched.${statedAbsence(scenario)}`,
  );
});

Then('the answer tells Build the site published', function (this: object) {
  const scenario = scenarioState(this);
  const answer = answerAt(scenario, 0, 'Build waits synchronously and must read success from the answer');
  assert.equal(
    answer.statusCode,
    200,
    `WHAT: the answer to a published cycle is ${JSON.stringify(answer)}. `
      + `WHY: Build reads the outcome from the synchronous answer; 200-for-published is the build-handler precedent this door mirrors. `
      + `HOW: map { published: true } to statusCode 200.${statedAbsence(scenario)}`,
  );
});

Then('the answer tells Build nothing was published', function (this: object) {
  const scenario = scenarioState(this);
  const answer = answerAt(scenario, 1, 'a refused cycle must be readable from the answer, never mistaken for success');
  assert.equal(
    answer.statusCode,
    204,
    `WHAT: the answer to a refused cycle is ${JSON.stringify(answer)}. `
      + `WHY: a refusal that answers like a success would let Build believe the site refreshed; 204-for-refused is the build-handler precedent. `
      + `HOW: map { published: false } to statusCode 204.${statedAbsence(scenario)}`,
  );
});

Then('the door refuses saying what is missing, why it matters and how to fix it', function (this: object) {
  const scenario = scenarioState(this);
  const refusal = scenario.handlerRefusal;
  assert.ok(
    refusal !== null && refusal !== undefined,
    `WHAT: the door answered as if it could run: ${JSON.stringify(scenario.handlerAnswers)}. `
      + `WHY: a missing required setting means the composition root cannot honestly wire itself; running anyway publishes with a half-wired door. `
      + `HOW: refuse before any port is called, the way build-handler's requiredEnv already refuses.${statedAbsence(scenario)}`,
  );
  const refusalText = pinnedMessage(refusal);
  assert.ok(
    /WHAT\b[\s\S]*WHY\b[\s\S]*HOW\b/.test(refusalText),
    `WHAT: the refusal does not speak the house shape: ${JSON.stringify(refusalText)}. `
      + `WHY: every refusal in this pipeline says WHAT is wrong, WHY it matters and HOW to fix it, so 3 a.m. log reading needs no archaeology. `
      + `HOW: follow build-handler.ts's requiredEnv message shape.${statedAbsence(scenario)}`,
  );
});

Then('the cycle behind the door was never started', function (this: object) {
  const scenario = scenarioState(this);
  assert.equal(
    scenario.handlerReceived.length,
    0,
    `WHAT: the cycle was started ${scenario.handlerReceived.length} time(s) although a required setting is missing. `
      + `WHY: settings are validated before any port is touched; a half-configured door that still publishes is the defect this scenario exists to ban. `
      + `HOW: check the environment first, then wire ports.${statedAbsence(scenario)}`,
  );
});
