// Reading the deployment plan: the templates the project synthesizes from
// infra/bin/app.ts with no cloud credential at all.
//
// Deliberately FREE of the cucumber lifecycle. Everything here is a pure
// reader over a synthesized plan, so it can be exercised on its own -- which
// is how each of these helpers was proven able to SEE the shapes it looks
// for, against Build and the existing dead-man watch, before slice-02's
// scenarios were allowed to depend on them. A helper that cannot see a shape
// that already exists is a wrong-shape test, not a missing feature, and it
// would only surface at GREEN, blaming the crafter for something they did
// right (this project's CLAUDE.md: two tests here have already passed for
// accidental reasons).
//
// Nothing in this file deploys, uploads, or diffs. `cdk diff` in particular
// is never run by anything in this slice: it stages and uploads assets.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Template } from 'aws-cdk-lib/assertions';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

// ---------- the pins ----------

/** `surfs-up-panama-<role>`, the convention every other slot in
 * infra/lib/physical-names.ts follows. `publish` is the verb that pairs with
 * `fetch` and `build`. */
export const PUBLISHER_FUNCTION_NAME = 'surfs-up-panama-publish';
export const BUILD_FUNCTION_NAME = 'surfs-up-panama-build';
export const PUBLISH_SUCCESS_METRIC = 'PublishSuccess';
export const METRIC_NAMESPACE = 'SurfsUpPanama';
export const OPS_ALARM_TOPIC_NAME = 'surfs-up-panama-alarms';
export const SITE_ORIGIN_EXPORT_NAME = 'SurfsUpPanamaSiteOrigin';
export const PUBLISH_SUCCESS_EVENT = 'publish.success';
/** The publisher's hard bound (ADR: reserved concurrency 1, timeout 300 s). */
export const PUBLISHER_TIMEOUT_SECONDS = 300;
export const PUBLISHER_RESERVED_CONCURRENCY = 1;
/** Build's own work: the two minutes the ADR's consequences section names. */
export const BUILD_OWN_WORK_SECONDS = 120;
/** 120 + 300: Build now waits for the publisher's whole bound. */
export const BUILD_TIMEOUT_SECONDS = BUILD_OWN_WORK_SECONDS + PUBLISHER_TIMEOUT_SECONDS;

/** What every function that already exists reserves today. Nothing here may
 * grow to make room for the publisher (ADR: "nothing existing widens"). */
export const RESERVED_CONCURRENCY_ALREADY_THERE: Readonly<Record<string, number>> = {
  'surfs-up-panama-fetch': 2,
  'surfs-up-panama-build': 2,
  'surfs-up-panama-report': 2,
  'surfs-up-panama-mint': 1,
  'surfs-up-panama-push': 1,
  'surfs-up-panama-notify': 1,
  'surfs-up-panama-photo-presign': 1,
  'surfs-up-panama-resize': 2,
  'surfs-up-panama-breaker': 2,
};

// ---------- shared refusal vocabulary ----------

export type AbsenceRecorder = { absences: string[] };

export function message(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error);
}

export function statedAbsence(recorder: AbsenceRecorder): string {
  if (recorder.absences.length === 0) return '';
  return ` Stated absence: ${recorder.absences.join(' | ')}.`;
}

// ---------- the plan, drawn up once per process ----------

export type PlannedResource = Readonly<{
  plan: string;
  logicalId: string;
  type: string;
  properties: Readonly<Record<string, unknown>>;
}>;

export type DeploymentPlan = Readonly<{ resources: readonly PlannedResource[] }>;

export type PlanReader = AbsenceRecorder & { plan: DeploymentPlan | null };

const PLANNED_STACK_KEYS = ['siteStack', 'ingestStack', 'observabilityStack', 'writeStack'] as const;

let planPromise: Promise<DeploymentPlan> | null = null;

async function drawUpDeploymentPlan(): Promise<DeploymentPlan> {
  const appModule = (await import(
    pathToFileURL(resolve(REPOSITORY_ROOT, 'infra/bin/app.ts')).href
  )) as Record<string, unknown>;
  const resources: PlannedResource[] = [];
  for (const key of PLANNED_STACK_KEYS) {
    const stack = appModule[key];
    assert.ok(stack !== undefined, `infra/bin/app.ts exports no ${key}`);
    const json = Template.fromStack(stack as never).toJSON() as Readonly<{
      Resources?: Readonly<Record<string, Readonly<{ Type?: string; Properties?: Readonly<Record<string, unknown>> }>>>;
    }>;
    for (const [logicalId, resource] of Object.entries(json.Resources ?? {})) {
      resources.push({
        plan: key,
        logicalId,
        type: String(resource.Type ?? ''),
        properties: resource.Properties ?? {},
      });
    }
  }
  return { resources };
}

/** Lazy and memoized: one synthesis per process, shared by every scenario.
 * Costs ~2 s warm and MINUTES the first time the publisher's container image
 * is staged (`npm ci` inside Docker; the ADR's consequences section says so
 * plainly), which is why every plan step carries a fifteen-minute budget
 * rather than the fifteen seconds slice-01 uses. */
export async function deploymentPlan(recorder: AbsenceRecorder): Promise<DeploymentPlan | null> {
  planPromise ??= drawUpDeploymentPlan();
  try {
    return await planPromise;
  } catch (error) {
    recorder.absences.push(`the deployment plan could not be drawn up (${message(error)})`);
    return null;
  }
}

// ---------- reading it ----------

export function resourcesOfType(plan: DeploymentPlan, type: string): readonly PlannedResource[] {
  return plan.resources.filter((resource) => resource.type === type);
}

export function functionsInPlan(plan: DeploymentPlan): readonly PlannedResource[] {
  return resourcesOfType(plan, 'AWS::Lambda::Function');
}

export function functionNamed(plan: DeploymentPlan, name: string): PlannedResource | undefined {
  return functionsInPlan(plan).find((resource) => resource.properties['FunctionName'] === name);
}

export function functionNamesInPlan(plan: DeploymentPlan): string[] {
  return functionsInPlan(plan).map((resource) => String(resource.properties['FunctionName'])).sort();
}

/** True when a rendered template value points at a given logical id, whether
 * it does so as a bare Ref, inside an Fn::GetAtt, or buried in an Fn::Join. */
export function targetsLogicalId(value: unknown, logicalId: string): boolean {
  return JSON.stringify(value ?? null).includes(`"${logicalId}"`);
}

export function roleLogicalIdOf(fn: PlannedResource): string | undefined {
  const role = fn.properties['Role'];
  if (typeof role !== 'object' || role === null) return undefined;
  const getAtt = (role as Readonly<Record<string, unknown>>)['Fn::GetAtt'];
  return Array.isArray(getAtt) ? String(getAtt[0]) : undefined;
}

function statementsOfDocument(document: unknown): readonly Readonly<Record<string, unknown>>[] {
  if (typeof document !== 'object' || document === null) return [];
  const statements = (document as Readonly<Record<string, unknown>>)['Statement'];
  return Array.isArray(statements) ? statements as readonly Readonly<Record<string, unknown>>[] : [];
}

/** Every statement attached to a function's role, from separately declared
 * policies and from the role's own inline policies alike. */
export function statementsFor(plan: DeploymentPlan, fn: PlannedResource): readonly Readonly<Record<string, unknown>>[] {
  const roleLogicalId = roleLogicalIdOf(fn);
  if (roleLogicalId === undefined) return [];
  const attached = resourcesOfType(plan, 'AWS::IAM::Policy')
    .filter((policy) => ((policy.properties['Roles'] as readonly Readonly<Record<string, unknown>>[] | undefined) ?? [])
      .some((role) => role['Ref'] === roleLogicalId))
    .flatMap((policy) => statementsOfDocument(policy.properties['PolicyDocument']));
  const inline = resourcesOfType(plan, 'AWS::IAM::Role')
    .filter((role) => role.logicalId === roleLogicalId)
    .flatMap((role) => ((role.properties['Policies'] as readonly Readonly<Record<string, unknown>>[] | undefined) ?? [])
      .flatMap((policy) => statementsOfDocument(policy['PolicyDocument'])));
  return [...attached, ...inline];
}

export function actionsOf(statements: readonly Readonly<Record<string, unknown>>[]): string[] {
  return statements.flatMap((statement) => {
    const action = statement['Action'];
    if (Array.isArray(action)) return action.map(String);
    return typeof action === 'string' ? [action] : [];
  });
}

/** The retry configuration for one function. CDK's configureAsyncInvoke sets
 * `functionName` from the function's own name, which for every function here
 * is an explicit literal, so this matches the literal FIRST and only then
 * falls back to a logical-id reference. Matching only the logical id would
 * find nothing and blame the crafter for a correct declaration. */
export function retryConfigurationFor(plan: DeploymentPlan, fn: PlannedResource): PlannedResource | undefined {
  const name = fn.properties['FunctionName'];
  return resourcesOfType(plan, 'AWS::Lambda::EventInvokeConfig').find((config) => {
    const configured = config.properties['FunctionName'];
    return (typeof name === 'string' && configured === name) || targetsLogicalId(configured, fn.logicalId);
  });
}

/** Every plan assertion goes through this, so no negative can pass vacuously
 * while the publisher does not exist at all (slice-01 flag 4's discipline:
 * "no timetable starts the publisher" is TRUE today for the uninteresting
 * reason that there is no publisher). */
export function publisherIn(reader: PlanReader): PlannedResource {
  const plan = reader.plan;
  assert.ok(
    plan !== null,
    `WHAT: there is no deployment plan to read. `
      + `WHY: this half of the slice is proven by reading what would be deployed, credential-free. `
      + `HOW: keep \`npm run synth:infra\` green with Docker up. A plan that cannot be drawn up is a finding to write down, never a pass by absence.${statedAbsence(reader)}`,
  );
  const publisher = functionNamed(plan, PUBLISHER_FUNCTION_NAME);
  assert.ok(
    publisher !== undefined,
    `WHAT: the plan carries no publisher named ${PUBLISHER_FUNCTION_NAME}. It carries: ${functionNamesInPlan(plan).join(', ')}. `
      + `WHY: the operator has to be able to read the bounded publisher in the plan, not in a promise (ADR weather-to-site-bridge, "Bounded means, concretely"). `
      + `HOW: add \`publish: '${PUBLISHER_FUNCTION_NAME}'\` to functionNames in infra/lib/physical-names.ts and declare the function in the ingest plan beside Build.${statedAbsence(reader)}`,
  );
  return publisher;
}

export function planOf(reader: PlanReader): DeploymentPlan {
  const plan = reader.plan;
  assert.ok(
    plan !== null,
    `WHAT: there is no deployment plan to read. `
      + `WHY: this half of the slice is proven by reading what would be deployed, credential-free. `
      + `HOW: keep \`npm run synth:infra\` green with Docker up.${statedAbsence(reader)}`,
  );
  return plan;
}

/** The reviewed declaration text a deployer and the credential-free gate both
 * read (infra/lib/guardrail-declarations.ts). */
export function readReviewedBuildTimeoutSeconds(): Promise<number | null> {
  return readFile(resolve(REPOSITORY_ROOT, 'infra/lib/guardrail-declarations.ts'), 'utf8')
    .then((source) => {
      const match = /'timeout-build'\s*:\s*'(\d+) seconds'/.exec(source);
      return match ? Number(match[1]) : null;
    })
    .catch(() => null);
}
