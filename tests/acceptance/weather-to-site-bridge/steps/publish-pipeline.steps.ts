// Slice-01: the publish core. Steps ACT through runPublishOnce (the driving
// port, src/pipeline/publish-site.ts, pinned in support/world.ts) and OBSERVE
// four port-exposed things only: the PublishOutcome, the argv the upload pipe
// was asked to run, the operations the object store recorded, and the bytes
// get-able at the durable archive key. Expected archives are computed through
// the REAL mergePublishedSurface — the oracle is the checked-in seam, never a
// copy of it (feature-delta: "Reuse is load-bearing").

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  BROKEN_PIPE_MESSAGE,
  DAWN_BUILD_ID,
  DAWN_INSTANT,
  EXPECTED_ALIAS_KEYS,
  expectedUploadKeys,
  FRESH_BUILD_ID,
  HOURLY_INSTANT,
  LATER_HOURLY_BUILD_ID,
  LATER_HOURLY_INSTANT,
  MISMATCHED_INVOCATION_BUILD_ID,
  PREVIEW_ORIGIN,
  PRODUCTION_BUCKET,
  PRODUCTION_ORIGIN,
  PUBLISH_REFUSED_EVENT,
  PUBLISH_SUCCESS_EVENT,
  STALE_BUILD_ID,
  STATE_KEY,
  TODAY,
  YESTERDAY,
  assertCycleTouchedNothing,
  assertHappyCycleDelta,
  derivePublishLines,
  isPutObject,
  mergePublishedSurface,
  refusalOf,
  runPublishCycle,
  scenarioState,
  stageBundle,
  stageFreshBundleForToday,
  statedAbsence,
  successOf,
  surfaceUpdateFor,
  uploadRecords,
  type PublishScenario,
  type StaticSurface,
} from './support/world';

const DAWN_STAGING = {
  buildId: DAWN_BUILD_ID,
  surfDate: TODAY,
  buildKind: 'dawn',
  publishedAt: '2026-03-10T11:22:00.000Z',
  clockInstant: DAWN_INSTANT,
} as const;

const LATER_HOURLY_STAGING = {
  buildId: LATER_HOURLY_BUILD_ID,
  surfDate: TODAY,
  buildKind: 'hourly',
  publishedAt: '2026-03-10T16:00:00.000Z',
  clockInstant: LATER_HOURLY_INSTANT,
} as const;

function archiveBytes(scenario: PublishScenario, expectation: string): string {
  const bytes = scenario.store.objectAt(STATE_KEY);
  assert.ok(
    bytes !== null,
    `WHAT: nothing is get-able at the durable archive key ${STATE_KEY}. `
      + `WHY: ${expectation} (ADR decision 2: the archive of record for the running system lives in the site bucket). `
      + `HOW: write the merged surface back through the store port after an honest merge.${statedAbsence(scenario)}`,
  );
  return bytes as string;
}

function parsedArchive(scenario: PublishScenario, expectation: string): StaticSurface {
  const bytes = archiveBytes(scenario, expectation);
  try {
    return JSON.parse(bytes) as StaticSurface;
  } catch {
    assert.fail(
      `WHAT: the durable archive holds bytes that do not read as a surface at all: ${JSON.stringify(bytes.slice(0, 120))}. `
        + `WHY: ${expectation}. `
        + `HOW: write the merged StaticSurface as its own serialization.${statedAbsence(scenario)}`,
    );
  }
}

// ---------- Givens ----------

Given("Build has just written a fresh bundle for today's Panama civil day", function (this: object) {
  stageFreshBundleForToday(scenarioState(this));
});

Given("the durable archive already holds yesterday's published surface", function (this: object) {
  const scenario = scenarioState(this);
  const previous = mergePublishedSurface(
    null,
    surfaceUpdateFor({ surfDate: YESTERDAY, buildKind: 'dawn', publishedAt: '2026-03-09T11:22:00.000Z' }),
  );
  scenario.store.seed(STATE_KEY, JSON.stringify(previous));
});

Given("Build hands the publisher a bundle for a civil day that is not today's", function (this: object) {
  stageBundle(scenarioState(this), {
    buildId: STALE_BUILD_ID,
    surfDate: YESTERDAY,
    buildKind: 'hourly',
    publishedAt: '2026-03-09T15:00:00.000Z',
    // The injected instant says Panama is living TODAY; the bundle says yesterday.
    clockInstant: HOURLY_INSTANT,
  });
});

Given('the rendered site carries a receipt for the preview origin, not production', function (this: object) {
  scenarioState(this).rendererOrigin = PREVIEW_ORIGIN;
});

Given('the publisher is invoked for a build the bundle does not carry', function (this: object) {
  scenarioState(this).invocationBuildId = MISMATCHED_INVOCATION_BUILD_ID;
});

Given('one upload in the middle of the batch will fail', function (this: object) {
  scenarioState(this).runner.failOnPutNumber(3);
});

Given('the durable archive does not exist yet', function (this: object) {
  const scenario = scenarioState(this);
  assert.equal(
    scenario.store.objectAt(STATE_KEY),
    null,
    'test bug: the archive was seeded although this scenario starts from a first-ever run',
  );
});

// Pillar-2 composition: this Given IS the Given + When of the walking
// skeleton, replayed through the same journey functions rather than restated
// fixtures, so the PUT-only proof reads as the next line of the same story.
Given('the publisher has completed a cycle for a fresh bundle', { timeout: 30_000 }, async function (this: object) {
  const scenario = scenarioState(this);
  stageFreshBundleForToday(scenario);
  await runPublishCycle(scenario);
});

// ---------- Whens ----------

When('the publisher runs its cycle for that bundle', { timeout: 30_000 }, async function (this: object) {
  await runPublishCycle(scenarioState(this));
});

When('the publisher runs a first-ever dawn cycle', { timeout: 30_000 }, async function (this: object) {
  const scenario = scenarioState(this);
  stageBundle(scenario, DAWN_STAGING);
  await runPublishCycle(scenario);
});

When("the publisher runs the day's next hourly cycle", { timeout: 30_000 }, async function (this: object) {
  const scenario = scenarioState(this);
  scenario.invocationBuildId = null;
  stageBundle(scenario, LATER_HOURLY_STAGING);
  await runPublishCycle(scenario);
});

// ---------- Thens: the walking skeleton ----------

Then('every page is uploaded and each one also lands at its directory address', function (this: object) {
  const scenario = scenarioState(this);
  successOf(scenario, 'a fresh bundle for today must republish the whole site unattended');
  const uploads = uploadRecords(scenario.runner);
  const keys = uploads.map((upload) => upload.key).sort();
  assert.deepEqual(
    keys,
    expectedUploadKeys(),
    `WHAT: the uploaded keys are not the rendered pages plus their directory aliases. `
      + `Uploaded: ${JSON.stringify(keys)}. `
      + `WHY: every x.html must also land at the literal key x/ because the origin serves no index document — `
      + `the directory-key double-write is a seam commitment preserved by reusing the checked-in publication code, never re-implemented. `
      + `HOW: run the bundle through the real publishBuild against the rendered directory.${statedAbsence(scenario)}`,
  );
  for (const alias of EXPECTED_ALIAS_KEYS) {
    const upload = uploads.find((candidate) => candidate.key === alias);
    assert.equal(
      upload?.contentType,
      'text/html',
      `WHAT: the directory address ${alias} was not uploaded as a page (content type ${JSON.stringify(upload?.contentType)}). `
        + `WHY: the alias IS the page under its directory address; anything else serves a download instead of a reading surface. `
        + `HOW: let the checked-in publishBuild write the alias with the page's own content type.${statedAbsence(scenario)}`,
    );
  }
  for (const upload of uploads) {
    assert.equal(
      upload.bucket,
      PRODUCTION_BUCKET,
      `WHAT: an upload targeted ${JSON.stringify(upload.bucket)} instead of the production site bucket. `
        + `WHY: the bridge publishes production and only production (${PRODUCTION_ORIGIN}); the target is fixed by decision, never injected. `
        + `HOW: pin the publication target to production inside the publish port.${statedAbsence(scenario)}`,
    );
  }
});

Then('every upload carries the freshness mark that keeps a stale copy from lingering', function (this: object) {
  const scenario = scenarioState(this);
  const uploads = uploadRecords(scenario.runner);
  assert.ok(
    uploads.length > 0,
    `WHAT: no upload was recorded at all, so there is no freshness mark to inspect. `
      + `WHY: the happy cycle must upload the rendered site. `
      + `HOW: implement the publish walk first.${statedAbsence(scenario)}`,
  );
  for (const upload of uploads) {
    assert.equal(
      upload.cacheControl,
      'no-cache',
      `WHAT: the upload of ${JSON.stringify(upload.key)} carries cache-control ${JSON.stringify(upload.cacheControl)}. `
        + `WHY: no-cache on every put is how the site refreshes with zero routine invalidations — the recorded freshness design. `
        + `HOW: reuse the checked-in put, which already sets it.${statedAbsence(scenario)}`,
    );
  }
});

Then('the durable archive now holds the merged surface the site was rendered from', function (this: object) {
  const scenario = scenarioState(this);
  assertHappyCycleDelta(scenario);
  const expected = mergePublishedSurface(
    null,
    surfaceUpdateFor({ surfDate: TODAY, buildKind: 'hourly', publishedAt: '2026-03-10T15:00:00.000Z' }),
  );
  const archive = parsedArchive(scenario, 'the merged surface is the archive of record dawn receipts survive in');
  assert.deepEqual(
    archive,
    expected,
    `WHAT: the durable archive is not the real merge of (no previous surface, this bundle's update). `
      + `WHY: mergePublishedSurface is imported and reused, never re-implemented; any other archive shape is drift. `
      + `HOW: merge the incoming update against the previous archive and write exactly that back.${statedAbsence(scenario)}`,
  );
  const rendered = scenario.renderer.receivedSurfaces();
  assert.equal(
    rendered.length,
    1,
    `WHAT: the site was rendered ${rendered.length} times in one cycle. `
      + `WHY: one bundle, one merge, one render. `
      + `HOW: hand the renderer the merged surface exactly once.${statedAbsence(scenario)}`,
  );
  assert.deepEqual(
    JSON.parse(rendered[0]!) as unknown,
    expected,
    `WHAT: the renderer was handed something other than the merged surface. `
      + `WHY: the pages must be rendered from the same archive the system records, or the site and its archive drift apart. `
      + `HOW: render from the merge result itself.${statedAbsence(scenario)}`,
  );
});

Then('the cycle answers that it published', function (this: object) {
  const scenario = scenarioState(this);
  const outcome = successOf(scenario, 'an honest cycle answers published with its own build');
  assert.equal(
    outcome.build_id,
    FRESH_BUILD_ID,
    `WHAT: the outcome names build ${JSON.stringify(outcome.build_id)}, not the bundle's own ${FRESH_BUILD_ID}. `
      + `WHY: the answer is Build's receipt for the exact bundle it handed over. `
      + `HOW: carry the verified bundle build_id onto the outcome.${statedAbsence(scenario)}`,
  );
  assert.equal(
    outcome.uploaded_objects,
    5,
    `WHAT: the outcome counts ${outcome.uploaded_objects} uploaded objects where the rendered site has 5. `
      + `WHY: the count is the honest tally of what actually landed, receipt included. `
      + `HOW: report the checked-in walk's own canonical count.${statedAbsence(scenario)}`,
  );
  assert.equal(
    outcome.directory_aliases,
    2,
    `WHAT: the outcome counts ${outcome.directory_aliases} directory aliases where the rendered site has 2. `
      + `WHY: same honest tally, alias half. `
      + `HOW: report the checked-in walk's own alias count.${statedAbsence(scenario)}`,
  );
});

Then("the day's log claims success exactly once", async function (this: object) {
  const scenario = scenarioState(this);
  successOf(scenario, 'only a fully completed cycle may put publish.success on the log');
  const lines = await derivePublishLines(scenario);
  assert.ok(
    lines !== null,
    `WHAT: there is no pure derivation to turn the outcome into log lines. `
      + `WHY: the dead-man alarm chain watches the exact publish.success string; the derivation must be pure and importable on both sides so the strings can never drift. `
      + `HOW: export derivePublishLogLines from src/pipeline/lambda/log-events.ts in the deriveBuildLogLines pattern.${statedAbsence(scenario)}`,
  );
  const successes = lines!.filter((line) => line['event'] === PUBLISH_SUCCESS_EVENT);
  const refusals = lines!.filter((line) => line['event'] === PUBLISH_REFUSED_EVENT);
  assert.equal(
    successes.length,
    1,
    `WHAT: the derivation yields ${successes.length} ${PUBLISH_SUCCESS_EVENT} lines for one fully completed cycle. `
      + `WHY: exactly one success line per honest cycle is what the metric filter counts. `
      + `HOW: derive one success line from a published outcome.${statedAbsence(scenario)}`,
  );
  assert.equal(
    successes[0]!['build_id'],
    FRESH_BUILD_ID,
    `WHAT: the success line names build ${JSON.stringify(successes[0]!['build_id'])}, not ${FRESH_BUILD_ID}. `
      + `WHY: a success claim that cannot be traced to its build is not evidence. `
      + `HOW: carry the outcome's build_id onto the line, as build.success does.${statedAbsence(scenario)}`,
  );
  assert.equal(
    refusals.length,
    0,
    `WHAT: a fully completed cycle also derived ${refusals.length} ${PUBLISH_REFUSED_EVENT} line(s). `
      + `WHY: one outcome speaks once; success and refusal are mutually exclusive claims. `
      + `HOW: derive from the outcome alone.${statedAbsence(scenario)}`,
  );
});

// ---------- Thens: the refusals ----------

Then('the cycle refuses naming both civil days', function (this: object) {
  const scenario = scenarioState(this);
  const { reason } = refusalOf(scenario, "a surface that is not Panama's current civil day must never publish");
  for (const date of [YESTERDAY, TODAY]) {
    assert.ok(
      reason.includes(date),
      `WHAT: the refusal reason does not name ${date}: ${JSON.stringify(reason)}. `
        + `WHY: the midnight rule refuses by naming what the surface is for and what Panama's day actually is, against the injected instant, never the wall clock. `
        + `HOW: state both civil days in the reason, the way publish:surface --verify already speaks.${statedAbsence(scenario)}`,
    );
  }
});

Then('not one object was uploaded', function (this: object) {
  const scenario = scenarioState(this);
  const uploads = uploadRecords(scenario.runner);
  assert.equal(
    uploads.length,
    0,
    `WHAT: ${uploads.length} object(s) were uploaded on a refused cycle: ${JSON.stringify(uploads.map((upload) => upload.key))}. `
      + `WHY: a refusal is total — a dishonest input uploads nothing, and the previous pages keep serving. `
      + `HOW: refuse before the publish walk starts.${statedAbsence(scenario)}`,
  );
});

Then('the durable archive is byte-identical to what it held before', function (this: object) {
  const scenario = scenarioState(this);
  assertCycleTouchedNothing(
    scenario,
    'a refused cycle leaves the archive of record exactly as it found it, dawn receipts and all',
  );
  assert.equal(
    scenario.store.putsTo(STATE_KEY),
    0,
    `WHAT: the refused cycle wrote the durable archive key ${scenario.store.putsTo(STATE_KEY)} time(s). `
      + `WHY: even a byte-identical rewrite is a write the refusal never earned; the store's recorded operations are the proof. `
      + `HOW: verify the civil day and the invocation before persisting any merge.${statedAbsence(scenario)}`,
  );
});

Then('the cycle refuses naming the origin the site was really rendered for', function (this: object) {
  const scenario = scenarioState(this);
  const { reason } = refusalOf(scenario, 'a site rendered for another origin must never be relabelled production');
  assert.ok(
    reason.includes(PREVIEW_ORIGIN),
    `WHAT: the refusal reason does not name the origin the receipt really carries (${PREVIEW_ORIGIN}): ${JSON.stringify(reason)}. `
      + `WHY: the origin receipt guard speaks the artifact's own truth; hiding it makes the refusal unactionable. `
      + `HOW: reuse assertPublicationArtifactOrigin's message as the reason.${statedAbsence(scenario)}`,
  );
});

Then('the refusal happened before a single upload', function (this: object) {
  const scenario = scenarioState(this);
  refusalOf(scenario, 'the receipt is read before the bucket is ever touched');
  const uploads = uploadRecords(scenario.runner);
  assert.equal(
    uploads.length,
    0,
    `WHAT: ${uploads.length} upload(s) happened before the origin refusal: ${JSON.stringify(uploads.map((upload) => upload.key))}. `
      + `WHY: the receipt guard exists so a preview artifact can never leak a single object into production. `
      + `HOW: keep assertPublicationArtifactOrigin ahead of the first put, as the checked-in walk already does.${statedAbsence(scenario)}`,
  );
});

Then('the cycle refuses because the bundle is not the build it was asked to publish', function (this: object) {
  const scenario = scenarioState(this);
  const { reason } = refusalOf(scenario, 'the publisher never publishes a bundle it was not asked to publish');
  for (const buildId of [MISMATCHED_INVOCATION_BUILD_ID, FRESH_BUILD_ID]) {
    assert.ok(
      reason.includes(buildId),
      `WHAT: the refusal reason does not name ${buildId}: ${JSON.stringify(reason)}. `
        + `WHY: naming the build Build asked for and the build the bundle carries is what makes the mismatch diagnosable from one log line. `
        + `HOW: state both builds in the reason.${statedAbsence(scenario)}`,
    );
  }
});

Then('the site was never rendered', function (this: object) {
  const scenario = scenarioState(this);
  const rendered = scenario.renderer.receivedSurfaces();
  assert.equal(
    rendered.length,
    0,
    `WHAT: the site was rendered ${rendered.length} time(s) for a bundle that failed the build match. `
      + `WHY: the build_id check is the first guard; work done after a failed identity check is work done on the wrong bundle. `
      + `HOW: verify invocation build_id against the bundle before merging or rendering anything.${statedAbsence(scenario)}`,
  );
});

// ---------- Thens: PUT-only, receipts, honest success ----------

Then('nothing in the whole cycle ever listed or deleted anything, anywhere', function (this: object) {
  const scenario = scenarioState(this);
  successOf(scenario, 'the PUT-only proof observes a completed cycle, never a vacuously idle one');
  const strays = scenario.runner.calls().filter((call) => !isPutObject(call));
  assert.equal(
    strays.length,
    0,
    `WHAT: the cycle asked the pipe to run ${strays.length} command(s) that are not a plain put: `
      + `${JSON.stringify(strays.map((call) => [call.command, ...call.args.slice(0, 3)].join(' ')))}. `
      + `WHY: publication is additive PUT-only — no list, no delete, ever — so raw captures and prediction logs stay outside its blast radius (DoD row 3). `
      + `HOW: reuse the checked-in publishBuild, which only ever puts.${statedAbsence(scenario)}`,
  );
  const kinds = [...new Set(scenario.store.operations().map((operation) => operation.kind))];
  assert.ok(
    kinds.every((kind) => kind === 'get' || kind === 'put'),
    `WHAT: the store recorded operation kinds ${JSON.stringify(kinds)}. `
      + `WHY: the durable side of the cycle also only reads and adds; anything else breaks the never-delete contract. `
      + `HOW: keep the store port at get/put.${statedAbsence(scenario)}`,
  );
});

Then('the archive seeds from that dawn call alone without inventing history', function (this: object) {
  const scenario = scenarioState(this);
  const expected = mergePublishedSurface(
    null,
    surfaceUpdateFor({ surfDate: TODAY, buildKind: 'dawn', publishedAt: '2026-03-10T11:22:00.000Z' }),
  );
  const archive = parsedArchive(scenario, 'a first-ever run has no previous surface and must seed honestly from the incoming update');
  assert.deepEqual(
    archive,
    expected,
    `WHAT: the first-ever archive is not the real merge of (nothing, this dawn update). `
      + `WHY: a missing state object seeds from the incoming update alone — the same null-previous path the manual chain already has — never from invented history. `
      + `HOW: treat a missing archive as previous = null and merge.${statedAbsence(scenario)}`,
  );
  assert.equal(
    archive.dawn_receipts.length,
    1,
    `WHAT: the first-ever archive holds ${archive.dawn_receipts.length} dawn receipt(s). `
      + `WHY: one dawn cycle earned exactly one receipt; more is invented history, fewer is a lost morning. `
      + `HOW: let the real merge retain the incoming dawn update as the day's receipt.${statedAbsence(scenario)}`,
  );
});

Then('the archive still holds the dawn receipt beside the fresh hourly surface', function (this: object) {
  const scenario = scenarioState(this);
  const dawn = surfaceUpdateFor({ surfDate: TODAY, buildKind: 'dawn', publishedAt: '2026-03-10T11:22:00.000Z' });
  const hourly = surfaceUpdateFor({ surfDate: TODAY, buildKind: 'hourly', publishedAt: '2026-03-10T16:00:00.000Z' });
  const expected = mergePublishedSurface(mergePublishedSurface(null, dawn), hourly);
  const archive = parsedArchive(scenario, "the dawn receipt is the morning's evidence and must survive every later cycle of the day");
  assert.deepEqual(
    archive,
    expected,
    `WHAT: after the hourly cycle the archive is not the real merge of (the dawn archive, the hourly update). `
      + `WHY: dawn receipts survive cold starts precisely because the durable archive is read back and merged, not rebuilt; losing the receipt silently rewrites the morning. `
      + `HOW: read the previous archive from the store, merge the hourly update into it, write the result back.${statedAbsence(scenario)}`,
  );
  assert.ok(
    archive.dawn_receipts.some((receipt) => receipt.surf_date === TODAY && receipt.build_kind === 'dawn'),
    `WHAT: the day's dawn receipt is gone from the archive after the hourly cycle. `
      + `WHY: the receipt is what the evening comparison joins against; an hourly cycle updates the current surface and touches nothing else. `
      + `HOW: retain receipts through the real merge.${statedAbsence(scenario)}`,
  );
});

Then('the cycle does not claim it published', function (this: object) {
  refusalOf(
    scenarioState(this),
    'a publish that could not finish every upload is not a publish, whatever fraction landed',
  );
});

Then("the day's log never claims success", async function (this: object) {
  const scenario = scenarioState(this);
  const lines = await derivePublishLines(scenario);
  assert.ok(
    lines !== null,
    `WHAT: there is no pure derivation to turn the outcome into log lines. `
      + `WHY: publish.success must be impossible to log when any upload failed, and that impossibility lives in one pure function. `
      + `HOW: export derivePublishLogLines from src/pipeline/lambda/log-events.ts.${statedAbsence(scenario)}`,
  );
  const successes = lines!.filter((line) => line['event'] === PUBLISH_SUCCESS_EVENT);
  assert.equal(
    successes.length,
    0,
    `WHAT: a cycle with a broken upload still derived ${successes.length} ${PUBLISH_SUCCESS_EVENT} line(s). `
      + `WHY: the one rule the whole product rests on — never claim more than the data earned. A partial upload earned nothing. `
      + `HOW: derive success only from { published: true }.${statedAbsence(scenario)}`,
  );
});

Then('the refusal names the upload that broke', function (this: object) {
  const scenario = scenarioState(this);
  const { reason } = refusalOf(scenario, 'a broken batch refuses with the failure itself, never a shrug');
  assert.ok(
    reason.includes(BROKEN_PIPE_MESSAGE),
    `WHAT: the refusal reason does not carry the failure that actually broke the batch: ${JSON.stringify(reason)}. `
      + `WHY: a refusal that swallows its cause cannot be acted on from the log line; the pipeline's refusals always name their reason. `
      + `HOW: put the failed upload's own error message on the refusal outcome.${statedAbsence(scenario)}`,
  );
});
