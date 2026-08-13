// Slice-02, the infrastructure half: the deployment plan proves the publisher
// is bounded.
//
// Every scenario reads the templates the project synthesizes from
// infra/bin/app.ts with no cloud credential. Nothing here deploys, uploads,
// diffs, or consults a live console -- a plan is what a deployer can read
// before spending a cent.
//
// Layer discipline: this is a real-adapter layer (real CDK synthesis, real
// Docker asset staging), so it is EXAMPLE-ONLY -- no generated inputs, sad
// paths enumerated one by one (Mandates 9 and 11). There is no state-delta
// universe here and that is deliberate, not an omission: a plan is a
// read-only artifact and no step in this file mutates anything, so Mandate 8
// has no mutation to guard (its layer-4 traditional-assertion allowance).
//
// EVERY negative goes through `publisherIn()` first. "No timetable starts the
// publisher" and "no waiting line anywhere" are both TRUE today, for the
// uninteresting reason that there is no publisher at all; requiring the
// publisher to exist before asserting what may not touch it is what keeps
// these scenarios red now and meaningful after.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import {
  BUILD_FUNCTION_NAME,
  BUILD_TIMEOUT_SECONDS,
  METRIC_NAMESPACE,
  OPS_ALARM_TOPIC_NAME,
  PUBLISHER_RESERVED_CONCURRENCY,
  PUBLISHER_TIMEOUT_SECONDS,
  PUBLISH_SUCCESS_EVENT,
  PUBLISH_SUCCESS_METRIC,
  RESERVED_CONCURRENCY_ALREADY_THERE,
  SITE_ORIGIN_EXPORT_NAME,
  actionsOf,
  deploymentPlan,
  functionNamed,
  functionsInPlan,
  planOf,
  publisherIn,
  readReviewedBuildTimeoutSeconds,
  resourcesOfType,
  retryConfigurationFor,
  statedAbsence,
  statementsFor,
  targetsLogicalId,
  type PlannedResource,
} from './support/deployment-plan';
import { slice02, type Slice02Scenario } from './support/slice-02-world';

/** Drawing the plan up is ~2 s once the publisher's container image layers are
 * cached, and MINUTES the first time (`npm ci` inside Docker: the ADR says
 * "first synth on a machine is minutes"). A budget sized for RED alone would
 * time out during GREEN and look like a failure instead of a cold cache. */
const PLAN_BUDGET = { timeout: 900_000 };

function numberProperty(resource: PlannedResource, key: string): unknown {
  return resource.properties[key];
}

// ---------- Given / When ----------

Given('the deployment plan is drawn up with no cloud credential at all', PLAN_BUDGET, async function (this: object) {
  const scenario = slice02(this);
  scenario.plan = await deploymentPlan(scenario);
});

When('the operator reads what would be deployed', function (this: object) {
  // The plan is already drawn up; this is the operator picking it up. Reading
  // it is what every Then below does.
  slice02(this);
});

// ---------- the bounded publisher ----------

Then('the plan carries a publisher', function (this: object) {
  publisherIn(slice02(this));
});

Then('the plan carries a publisher that runs the project\'s own image on the same processor family as the rest of the pipeline', function (this: object) {
  const scenario = slice02(this);
  const publisher = publisherIn(scenario);
  assert.equal(
    publisher.properties['PackageType'],
    'Image',
    `WHAT: the publisher is packaged as ${JSON.stringify(publisher.properties['PackageType'] ?? 'a zip')}. `
      + `WHY: the render is the project's real \`npm run build\`, which needs the project tree and its real installed dependencies; a second, smaller renderer would fork the reading surface, and that drift is the worst bug this project has shipped (ADR alternatives considered). `
      + `HOW: declare it with DockerImageCode.fromImageAsset(repositoryRoot, { file: 'infra/lambda-images/publisher/Dockerfile' }) -- the image already exists and its build context is the repository root.${statedAbsence(scenario)}`,
  );
  assert.deepEqual(
    publisher.properties['Architectures'],
    ['arm64'],
    `WHAT: the publisher would run on ${JSON.stringify(publisher.properties['Architectures'])}. `
      + `WHY: every other function in this pipeline is ARM64, and the container image is proven only on linux/arm64 by the smoke script. `
      + `HOW: set architecture ARM_64, like Fetch and Build.${statedAbsence(scenario)}`,
  );
});

Then('the publisher runs one cycle at a time and is cut off after five minutes', function (this: object) {
  const scenario = slice02(this);
  const publisher = publisherIn(scenario);
  assert.equal(
    numberProperty(publisher, 'ReservedConcurrentExecutions'),
    PUBLISHER_RESERVED_CONCURRENCY,
    `WHAT: the publisher may run ${String(numberProperty(publisher, 'ReservedConcurrentExecutions'))} cycles at once. `
      + `WHY: two publishers racing would upload two different renders of the same hour over each other; one at a time is the recorded bound. `
      + `HOW: reservedConcurrentExecutions: ${PUBLISHER_RESERVED_CONCURRENCY}.${statedAbsence(scenario)}`,
  );
  assert.equal(
    numberProperty(publisher, 'Timeout'),
    PUBLISHER_TIMEOUT_SECONDS,
    `WHAT: the publisher would be cut off after ${String(numberProperty(publisher, 'Timeout'))} seconds. `
      + `WHY: a hard bound is what lets Build's own reviewed limit be computed at all, and what stops a wedged render from billing for a quarter of an hour. `
      + `HOW: timeout ${PUBLISHER_TIMEOUT_SECONDS} seconds, the ADR's stated bound.${statedAbsence(scenario)}`,
  );
});

Then('the publisher is told the production address of the site and the store it publishes into', function (this: object) {
  const scenario = slice02(this);
  const publisher = publisherIn(scenario);
  const environment = publisher.properties['Environment'] as Readonly<Record<string, unknown>> | undefined;
  const variables = (environment?.['Variables'] ?? {}) as Readonly<Record<string, unknown>>;
  assert.ok(
    variables['BUCKET_NAME'] !== undefined,
    `WHAT: the publisher is never told which store to publish into: ${JSON.stringify(variables)}. `
      + `WHY: its front door refuses before touching any port when a required setting is missing, so a publisher wired without this one refuses every hour, forever. `
      + `HOW: set BUCKET_NAME on its environment, the way Build's is set.${statedAbsence(scenario)}`,
  );
  assert.ok(
    JSON.stringify(variables['PUBLIC_SITE_ORIGIN'] ?? null).includes(SITE_ORIGIN_EXPORT_NAME),
    `WHAT: the publisher's site address is ${JSON.stringify(variables['PUBLIC_SITE_ORIGIN'] ?? null)}, which is not the live production address the site plan publishes. `
      + `WHY: the render bakes this address into a receipt and publication refuses any artifact built for another origin; a hard-coded or preview address would refuse every hour. `
      + `HOW: Fn.importValue('${SITE_ORIGIN_EXPORT_NAME}'), exactly as Build's environment already does.${statedAbsence(scenario)}`,
  );
});

Then('no function that was already there runs any more cycles at once than it already did', function (this: object) {
  const scenario = slice02(this);
  publisherIn(scenario);
  const widened = functionsInPlan(planOf(scenario))
    .map((fn) => ({
      name: String(fn.properties['FunctionName']),
      reserved: numberProperty(fn, 'ReservedConcurrentExecutions'),
    }))
    .filter(({ name, reserved }) => (
      RESERVED_CONCURRENCY_ALREADY_THERE[name] !== undefined && reserved !== RESERVED_CONCURRENCY_ALREADY_THERE[name]
    ));
  assert.deepEqual(
    widened,
    [],
    `WHAT: ${JSON.stringify(widened)} no longer run what they used to. `
      + `WHY: making room for the publisher must widen nothing that was already there (ADR consequences: "New least-privilege IAM for one function; nothing existing widens"). `
      + `HOW: give the publisher its own ceiling; leave every other function's alone.${statedAbsence(scenario)}`,
  );
});

// ---------- Build is the only way in ----------

Then('no timetable anywhere starts the publisher', function (this: object) {
  const scenario = slice02(this);
  const publisher = publisherIn(scenario);
  const plan = planOf(scenario);
  const pointingAtThePublisher = resourcesOfType(plan, 'AWS::Scheduler::Schedule')
    .filter((schedule) => targetsLogicalId(schedule.properties['Target'], publisher.logicalId))
    .map((schedule) => schedule.logicalId);
  assert.deepEqual(
    pointingAtThePublisher,
    [],
    `WHAT: ${JSON.stringify(pointingAtThePublisher)} would start the publisher on a timetable of its own. `
      + `WHY: one invocation per hourly Build cycle is the recorded decision; a second entry point means two renders of the same hour and a bill nobody planned. `
      + `HOW: remove it. The only path in is Build's synchronous handover.${statedAbsence(scenario)}`,
  );
});

Then('nothing anywhere watches the store and starts work when it changes', function (this: object) {
  const scenario = slice02(this);
  publisherIn(scenario);
  const plan = planOf(scenario);
  const watchers = [
    ...resourcesOfType(plan, 'AWS::Events::Rule'),
    ...plan.resources.filter((resource) => resource.type.includes('S3BucketNotifications')),
    ...resourcesOfType(plan, 'AWS::S3::Bucket')
      .filter((bucket) => bucket.properties['NotificationConfiguration'] !== undefined),
  ].map((resource) => `${resource.plan}/${resource.logicalId} (${resource.type})`);
  assert.deepEqual(
    watchers,
    [],
    `WHAT: ${JSON.stringify(watchers)} would start work when the store changes. `
      + `WHY: a store-change trigger was rejected upstream and stays rejected; the publisher writes into the same store it would be watching, so it would trigger itself, over and over. `
      + `HOW: remove it. Build's handover is the only trigger, by decision.${statedAbsence(scenario)}`,
  );
});

Then('there is no waiting line anywhere in any plan', function (this: object) {
  const scenario = slice02(this);
  publisherIn(scenario);
  const plan = planOf(scenario);
  const queues = [
    ...resourcesOfType(plan, 'AWS::SQS::Queue'),
    ...resourcesOfType(plan, 'AWS::Lambda::EventSourceMapping'),
  ].map((resource) => `${resource.plan}/${resource.logicalId} (${resource.type})`);
  assert.deepEqual(
    queues,
    [],
    `WHAT: ${JSON.stringify(queues)} would queue work somewhere in the design. `
      + `WHY: no new trigger type of any kind (ADR, "Bounded means, concretely"); a queue also quietly reintroduces retries, which the whole design refuses. `
      + `HOW: remove it. A failed hour self-heals on the next one, because publication only ever adds.${statedAbsence(scenario)}`,
  );
});

Then('Build is allowed to start the publisher', function (this: object) {
  const scenario = slice02(this);
  const publisher = publisherIn(scenario);
  const plan = planOf(scenario);
  const build = functionNamed(plan, BUILD_FUNCTION_NAME);
  assert.ok(build !== undefined, `test bug: the plan carries no ${BUILD_FUNCTION_NAME}`);
  const allowed = statementsFor(plan, build).some((statement) => (
    JSON.stringify(statement['Action'] ?? null).includes('lambda:InvokeFunction')
    && targetsLogicalId(statement['Resource'], publisher.logicalId)
  ));
  assert.ok(
    allowed,
    `WHAT: Build is not allowed to start the publisher. `
      + `WHY: the handover is the only way in, so if Build cannot make it the site never republishes at all -- and it would fail live, at the top of the hour, not here. `
      + `HOW: publishFn.grantInvoke(buildFn) in the same plan that declares them both.${statedAbsence(scenario)}`,
  );
});

// ---------- add only, never erase, never even look ----------

Then('nothing the publisher is allowed to do can erase anything', function (this: object) {
  const scenario = slice02(this);
  const actions = actionsOf(statementsFor(planOf(scenario), publisherIn(scenario)));
  const erasing = actions.filter((action) => /delete/i.test(action));
  assert.deepEqual(
    erasing,
    [],
    `WHAT: the publisher is allowed to ${JSON.stringify(erasing)}. `
      + `WHY: publication is additive by construction -- the raw captures and the prediction log sit in the same store and stay outside its blast radius. A publisher that can delete is one bug away from deleting the archive. `
      + `HOW: grant put only. Never grantReadWrite, never grantDelete.${statedAbsence(scenario)}`,
  );
});

Then('nothing the publisher is allowed to do can ask what is in the store', function (this: object) {
  const scenario = slice02(this);
  const actions = actionsOf(statementsFor(planOf(scenario), publisherIn(scenario)));
  const listing = actions.filter((action) => /^s3:List/i.test(action));
  assert.deepEqual(
    listing,
    [],
    `WHAT: the publisher is allowed to ${JSON.stringify(listing)}. `
      + `WHY: the publisher never lists anything -- it walks the pages it just rendered and puts each one. Listing permission it does not use is blast radius it did not earn. `
      + `HOW: careful here -- the house helper grantRead() grants s3:GetObject*, s3:GetBucket* AND s3:List*, so it CANNOT be used for the publisher's bundle read. Add an explicit s3:GetObject statement on the bundle prefix instead, the way the write plan already writes its own scoped statement. grantPut is fine: it grants only s3:PutObject* and s3:Abort*.${statedAbsence(scenario)}`,
  );
});

Then('the publisher may read the bundle Build wrote and may write the durable archive and the published pages', function (this: object) {
  const scenario = slice02(this);
  const statements = statementsFor(planOf(scenario), publisherIn(scenario));
  const actions = actionsOf(statements);
  assert.ok(
    actions.some((action) => /^s3:GetObject/i.test(action)),
    `WHAT: the publisher may not read anything at all: ${JSON.stringify(actions)}. `
      + `WHY: its first move every hour is reading the bundle Build just wrote and the durable archive of the previous surface. `
      + `HOW: an explicit s3:GetObject statement scoped to the region bundle prefix and the durable archive key.${statedAbsence(scenario)}`,
  );
  assert.ok(
    actions.some((action) => /^s3:PutObject/i.test(action)),
    `WHAT: the publisher may not write anything at all: ${JSON.stringify(actions)}. `
      + `WHY: publishing IS putting the rendered pages and their directory addresses, plus the merged archive it just built. `
      + `HOW: grantPut on the durable archive and on the published route keys.${statedAbsence(scenario)}`,
  );
});

// ---------- never quietly run twice ----------

Then('a failed hour is never automatically repeated, for Build or for the publisher', function (this: object) {
  const scenario = slice02(this);
  const publisher = publisherIn(scenario);
  const plan = planOf(scenario);
  const build = functionNamed(plan, BUILD_FUNCTION_NAME);
  assert.ok(build !== undefined, `test bug: the plan carries no ${BUILD_FUNCTION_NAME}`);
  for (const [label, fn] of [['Build', build], ['the publisher', publisher]] as const) {
    const configured = retryConfigurationFor(plan, fn);
    assert.ok(
      configured !== undefined,
      `WHAT: nothing in the plan says how many times ${label} may be repeated, so it keeps the default of two silent retries. `
        + `WHY: repeating an hour recovers nothing here -- the writes are already idempotent, so a retry only ever repeats work and pays for it twice. `
        + `HOW: configureAsyncInvoke({ retryAttempts: 0 }), the way Fetch and Build already do.${statedAbsence(scenario)}`,
    );
    assert.equal(
      configured.properties['MaximumRetryAttempts'],
      0,
      `WHAT: ${label} would be repeated ${String(configured.properties['MaximumRetryAttempts'])} time(s) after a failure. `
        + `WHY: the same reason -- a repeat is pure cost, and a failed hour self-heals on the next one. `
        + `HOW: retryAttempts: 0.${statedAbsence(scenario)}`,
    );
  }
});

// ---------- Build's reviewed wait ----------

Then('Build\'s limit covers its own two minutes plus the whole time the publisher may take', function (this: object) {
  const scenario = slice02(this);
  const build = functionNamed(planOf(scenario), BUILD_FUNCTION_NAME);
  assert.ok(build !== undefined, `test bug: the plan carries no ${BUILD_FUNCTION_NAME}`);
  const timeout = Number(numberProperty(build, 'Timeout'));
  assert.ok(
    timeout >= BUILD_TIMEOUT_SECONDS,
    `WHAT: Build would be cut off after ${timeout} seconds. `
      + `WHY: Build now waits for the publisher's answer, so its limit has to cover its own two minutes plus the publisher's whole ${PUBLISHER_TIMEOUT_SECONDS}-second bound -- ${BUILD_TIMEOUT_SECONDS} seconds. At ${timeout} it would be killed mid-wait, every single hour, and the publisher would keep running with nobody reading its answer. `
      + `HOW: raise lambdaTimeoutSeconds.build to ${BUILD_TIMEOUT_SECONDS} in infra/lib/ingest-stack.ts. This is a reviewed guardrail change and it moves with its declaration and its guardrail tests in the same commit, never on its own.${statedAbsence(scenario)}`,
  );
});

Then('the limit written in the reviewed declaration is the limit that would deploy', PLAN_BUDGET, async function (this: object) {
  const scenario = slice02(this);
  const build = functionNamed(planOf(scenario), BUILD_FUNCTION_NAME);
  assert.ok(build !== undefined, `test bug: the plan carries no ${BUILD_FUNCTION_NAME}`);
  const deployed = Number(numberProperty(build, 'Timeout'));
  const reviewed = await readReviewedBuildTimeoutSeconds();
  assert.equal(
    reviewed,
    deployed,
    `WHAT: the reviewed declaration says ${String(reviewed)} seconds and the plan would deploy ${deployed}. `
      + `WHY: the declaration is the text a deployer and the credential-free gate both read; a declaration that disagrees with what deploys is exactly the silent drift this project treats as its worst bug. `
      + `HOW: move 'timeout-build' in infra/lib/guardrail-declarations.ts to ${BUILD_TIMEOUT_SECONDS} seconds, and with it the value the declaration evaluator requires and every copy in the fixtures that mirror it -- infra/guardrail-evaluator.mjs and both controlled-declaration fixtures. The feature-delta's DISTILL slice-02 flags list every file.${statedAbsence(scenario)}`,
  );
  assert.ok(
    reviewed !== null && reviewed >= BUILD_TIMEOUT_SECONDS,
    `WHAT: the reviewed declaration still says ${String(reviewed)} seconds. `
      + `WHY: agreeing with the plan is not enough if both are too small for the wait Build now takes on. `
      + `HOW: ${BUILD_TIMEOUT_SECONDS} seconds in both places.${statedAbsence(scenario)}`,
  );
});

// ---------- a quietly stale site pages a human ----------

Then('every finished publication is counted, read from the very line the publisher prints when it finishes one', function (this: object) {
  const scenario = slice02(this);
  publisherIn(scenario);
  const plan = planOf(scenario);
  const counting = resourcesOfType(plan, 'AWS::Logs::MetricFilter').filter((filter) => (
    ((filter.properties['MetricTransformations'] as readonly Readonly<Record<string, unknown>>[] | undefined) ?? [])
      .some((transformation) => transformation['MetricName'] === PUBLISH_SUCCESS_METRIC
        && transformation['MetricNamespace'] === METRIC_NAMESPACE)
  ));
  assert.equal(
    counting.length,
    1,
    `WHAT: ${counting.length} things in the plan count finished publications. `
      + `WHY: nothing can page a human about a site that stopped republishing unless finished publications are counted in the first place. `
      + `HOW: one metric filter on the publisher's own log, mirroring BuildSuccessFilter exactly.${statedAbsence(scenario)}`,
  );
  const pattern = String(counting[0]?.properties['FilterPattern'] ?? '');
  assert.ok(
    pattern.includes(`"${PUBLISH_SUCCESS_EVENT}"`),
    `WHAT: the counter matches ${JSON.stringify(pattern)}, not the line the publisher actually prints. `
      + `WHY: the counter and the printer must read the SAME name from the same module, or they drift apart silently and the alarm goes quiet for the wrong reason. `
      + `HOW: filter on PUBLISH_SUCCESS_EVENT imported from src/pipeline/lambda/log-events.ts, never a re-typed literal -- that constant already exists.${statedAbsence(scenario)}`,
  );
});

Then('two hours with no finished publication pages a human on the channel the rest of the pipeline already uses', function (this: object) {
  const scenario = slice02(this);
  const alarm = staleSiteAlarm(scenario);
  assert.equal(
    alarm.properties['ComparisonOperator'],
    'LessThanThreshold',
    `WHAT: the stale-site watch fires on ${String(alarm.properties['ComparisonOperator'])}. `
      + `WHY: the danger is publications going MISSING, not too many happening. `
      + `HOW: LessThanThreshold, threshold 1, mirroring the build watch exactly.${statedAbsence(scenario)}`,
  );
  assert.equal(alarm.properties['Threshold'], 1, `WHAT: the stale-site watch's threshold is ${String(alarm.properties['Threshold'])}, not one finished publication.${statedAbsence(scenario)}`);
  assert.equal(alarm.properties['Period'], 3600, `WHAT: the stale-site watch measures over ${String(alarm.properties['Period'])} seconds, not an hour.${statedAbsence(scenario)}`);
  assert.ok(
    Number(alarm.properties['EvaluationPeriods']) >= 2,
    `WHAT: the stale-site watch fires after ${String(alarm.properties['EvaluationPeriods'])} hour(s). `
      + `WHY: one missed hour is a hiccup that the next hour heals; two in a row is a site going stale. `
      + `HOW: evaluationPeriods 2, the same honest detection floor as the rest.${statedAbsence(scenario)}`,
  );
  const paging = JSON.stringify(alarm.properties['AlarmActions'] ?? null);
  assert.ok(
    paging !== 'null' && paging !== '[]',
    `WHAT: nothing is told when the site goes stale. `
      + `WHY: a watch nobody hears is worse than no watch: it looks like coverage. `
      + `HOW: point it at the same alarm channel (${OPS_ALARM_TOPIC_NAME}) the rest of the pipeline already uses.${statedAbsence(scenario)}`,
  );
  assert.ok(
    opsTopicIsReferencedBy(scenario, paging),
    `WHAT: the stale-site watch pages ${paging}, which is not the channel the rest of the pipeline uses. `
      + `WHY: one channel means one place a human already watches; a second one is a channel nobody has subscribed to yet. `
      + `HOW: the ops alarm topic named ${OPS_ALARM_TOPIC_NAME}.${statedAbsence(scenario)}`,
  );
});

Then('that same channel is told when publication comes back', function (this: object) {
  const scenario = slice02(this);
  const alarm = staleSiteAlarm(scenario);
  const recovery = JSON.stringify(alarm.properties['OKActions'] ?? null);
  assert.ok(
    recovery !== 'null' && recovery !== '[]' && opsTopicIsReferencedBy(scenario, recovery),
    `WHAT: nobody is told when publication recovers: ${recovery}. `
      + `WHY: without it a human who was paged at 4 a.m. has no way to learn it healed except by checking, so they either stay up or stop trusting the page. `
      + `HOW: addOkAction on the same channel, exactly as the existing watches do.${statedAbsence(scenario)}`,
  );
});

Then('two hours of pure silence counts as failure, never as good news', function (this: object) {
  const scenario = slice02(this);
  const alarm = staleSiteAlarm(scenario);
  assert.equal(
    alarm.properties['TreatMissingData'],
    'breaching',
    `WHAT: missing measurements are treated as ${String(alarm.properties['TreatMissingData'])}. `
      + `WHY: this is the load-bearing word. A counter with no matching line reports NO datapoint, not zero, so the default handling holds the watch green forever -- precisely when everything is dead. `
      + `HOW: TreatMissingData.BREACHING, the same as the two existing dead-man watches.${statedAbsence(scenario)}`,
  );
});

/** Deliberately mechanism-agnostic: this finds the watch on finished
 * publications, whether it is a NEW watch beside the build one or the build
 * watch RETARGETED onto this metric. The choice between those two is an open
 * flag on this slice (the design is at the ten-alarm free-tier ceiling), and
 * no scenario here presupposes its outcome. */
function staleSiteAlarm(scenario: Slice02Scenario): PlannedResource {
  publisherIn(scenario);
  const plan = planOf(scenario);
  const watching = resourcesOfType(plan, 'AWS::CloudWatch::Alarm')
    .filter((alarm) => alarm.properties['MetricName'] === PUBLISH_SUCCESS_METRIC
      && alarm.properties['Namespace'] === METRIC_NAMESPACE);
  assert.equal(
    watching.length,
    1,
    `WHAT: ${watching.length} watches page a human about a site that stopped republishing. `
      + `WHY: a site can go stale silently -- the pages keep serving, they are just yesterday's, and nothing else in the design notices. `
      + `HOW: one watch on ${PUBLISH_SUCCESS_METRIC}, either a new one beside the build watch or the build watch pointed at this metric instead. That choice is an open flag on this slice (the design is already at the ten-alarm free-tier ceiling and infra/test/guardrails.test.ts asserts exactly ten); either resolution satisfies this scenario.${statedAbsence(scenario)}`,
  );
  return watching[0] as PlannedResource;
}

function opsTopicIsReferencedBy(scenario: Slice02Scenario, rendered: string): boolean {
  const plan = planOf(scenario);
  return resourcesOfType(plan, 'AWS::SNS::Topic')
    .filter((topic) => topic.properties['TopicName'] === OPS_ALARM_TOPIC_NAME)
    .some((topic) => rendered.includes(`"${topic.logicalId}"`));
}
