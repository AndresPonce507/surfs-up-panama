import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runLocalCi } from '../../scripts/ci-local.mjs';
import {
  createGuardrailStack,
  app,
  ingestStack,
  observabilityStack,
  siteStack,
  stack,
  writeStack,
} from '../bin/app.js';
import {
  archiveBucketVersioning,
  costAllocationTag,
  guardrailDeclarations,
  lifecycleRules,
  predictionLifecyclePolicy,
} from '../lib/guardrail-declarations.js';
import {
  breakerInvocationThresholds,
  reservedConcurrencySum,
  writeReservedConcurrency,
} from '../lib/write-declarations.js';
import {
  breakerTopicName,
  functionNames,
  metricNamespace,
  siteOriginExportName,
} from '../lib/physical-names.js';
import {
  BUILD_SUCCESS_EVENT,
  INGEST_SUCCESS_EVENT,
  PUBLISH_MISMATCH_EVENT,
  PROVIDER_ERROR_EVENT,
} from '../../src/pipeline/lambda/log-events.js';
import type { BuildStore, ForecastSource, IngestStore } from '../../src/pipeline/ports.js';

type ResourceProperties = Readonly<Record<string, unknown>>;
type SynthesizedResource = Readonly<{
  readonly logicalId: string;
  readonly properties: ResourceProperties;
}>;

type SynthesizedTemplate = Readonly<{
  readonly Resources?: Readonly<Record<string, Readonly<{
    readonly Type?: string;
    readonly Properties?: ResourceProperties;
  }>>>;
}>;

type LifecycleRule = Readonly<{
  readonly id: string;
  readonly prefix?: string;
  readonly expirationAfterDays?: number;
  readonly abortAfterDays?: number;
  readonly transitions?: readonly Readonly<{
    readonly storageClass: string;
    readonly afterDays: number;
  }>[];
}>;

const template = Template.fromStack(stack);
const templateJson = template.toJSON() as SynthesizedTemplate;

function declarationSeconds(value: string): number {
  const match = /^(\d+) seconds$/.exec(value);
  if (!match) throw new Error(`guardrail declaration is not a seconds value: ${value}`);
  return Number(match[1]);
}

function declarationDays(value: string): number {
  const match = /^(\d+) days$/.exec(value);
  if (!match) throw new Error(`guardrail declaration is not a days value: ${value}`);
  return Number(match[1]);
}

function synthesizedResources(type: string, synthesizedTemplate = templateJson): SynthesizedResource[] {
  return Object.entries(synthesizedTemplate.Resources ?? {})
    .filter(([, resource]) => resource.Type === type)
    .map(([logicalId, resource]) => ({ logicalId, properties: resource.Properties ?? {} }));
}

function stringProperty(properties: ResourceProperties, key: string): string {
  const value = properties[key];
  if (typeof value !== 'string') throw new Error(`${key} must be a string in the synthesized template`);
  return value;
}

function numberProperty(properties: ResourceProperties, key: string): number {
  const value = properties[key];
  if (typeof value !== 'number') throw new Error(`${key} must be a number in the synthesized template`);
  return value;
}

function synthesizedLifecycleRules(bucket: SynthesizedResource): LifecycleRule[] {
  const configuration = bucket.properties.LifecycleConfiguration;
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration)) {
    throw new Error('S3 bucket must declare LifecycleConfiguration');
  }
  const rules = (configuration as Readonly<Record<string, unknown>>).Rules;
  if (!Array.isArray(rules)) throw new Error('S3 LifecycleConfiguration must declare Rules');

  return rules.map((rule) => {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      throw new Error('S3 lifecycle rule must be an object');
    }
    const properties = rule as Readonly<Record<string, unknown>>;
    const filter = properties.Filter;
    const prefix = typeof properties.Prefix === 'string'
      ? properties.Prefix
      : typeof filter === 'object' && filter !== null && !Array.isArray(filter)
        ? (filter as Readonly<Record<string, unknown>>).Prefix
        : undefined;
    const abort = properties.AbortIncompleteMultipartUpload;
    const abortAfterDays = typeof abort === 'object' && abort !== null && !Array.isArray(abort)
      ? (abort as Readonly<Record<string, unknown>>).DaysAfterInitiation
      : undefined;
    const transitions = properties.Transitions;
    const parsedTransitions = Array.isArray(transitions)
      ? transitions.map((transition) => {
        if (typeof transition !== 'object' || transition === null || Array.isArray(transition)) {
          throw new Error('S3 lifecycle transition must be an object');
        }
        const transitionProperties = transition as Readonly<Record<string, unknown>>;
        return {
          storageClass: stringProperty(transitionProperties, 'StorageClass'),
          afterDays: numberProperty(transitionProperties, 'TransitionInDays'),
        };
      })
      : undefined;

    return {
      id: stringProperty(properties, 'Id'),
      ...(typeof prefix === 'string' ? { prefix } : {}),
      ...(typeof properties.ExpirationInDays === 'number' ? { expirationAfterDays: properties.ExpirationInDays } : {}),
      ...(typeof abortAfterDays === 'number' ? { abortAfterDays } : {}),
      ...(parsedTransitions && parsedTransitions.length > 0 ? { transitions: parsedTransitions } : {}),
    };
  });
}

function overlaps(prefix: string | undefined, protectedPrefix: string): boolean {
  return prefix === undefined
    || prefix === protectedPrefix
    || prefix.startsWith(protectedPrefix)
    || protectedPrefix.startsWith(prefix);
}

function isExactDeclaredMultipartAbort(rule: LifecycleRule, declaredRules: readonly LifecycleRule[]): boolean {
  return declaredRules.some((declaredRule) => (
    declaredRule.prefix === undefined
    && declaredRule.abortAfterDays !== undefined
    && rule.id === declaredRule.id
    && rule.prefix === undefined
    && rule.abortAfterDays === declaredRule.abortAfterDays
    && rule.expirationAfterDays === undefined
    && rule.transitions === undefined
  ));
}

function predictionLifecycleRule(policy: typeof predictionLifecyclePolicy): LifecycleRule {
  return {
    id: policy.ruleId,
    prefix: policy.prefix,
    transitions: [policy.transition],
  };
}

function isExactAllowedPredictionTransition(
  rule: LifecycleRule,
  policy: typeof predictionLifecyclePolicy,
): boolean {
  const [transition] = rule.transitions ?? [];
  return rule.id === policy.ruleId
    && rule.prefix === policy.prefix
    && rule.expirationAfterDays === undefined
    && rule.abortAfterDays === undefined
    && rule.transitions?.length === 1
    && transition?.storageClass === policy.transition.storageClass
    && transition.afterDays === policy.transition.afterDays;
}

function assertPredictionLifecycleSafety(
  rules: readonly LifecycleRule[],
  protectedPrefix: string,
  declaredRules: readonly LifecycleRule[],
  allowedPredictionPolicy?: typeof predictionLifecyclePolicy,
): void {
  const overlapping = rules.filter((rule) => (
    overlaps(rule.prefix, protectedPrefix)
    && !isExactDeclaredMultipartAbort(rule, declaredRules)
    && !(allowedPredictionPolicy && isExactAllowedPredictionTransition(rule, allowedPredictionPolicy))
    && (rule.expirationAfterDays !== undefined || rule.transitions !== undefined)
  ));
  if (overlapping.length > 0) {
    throw new Error(`lifecycle rule(s) overlap the protected ${protectedPrefix} prefix: ${overlapping.map((rule) => rule.id).join(', ')}`);
  }
}

function bucketVersioningStatus(bucket: SynthesizedResource): string | undefined {
  const configuration = bucket.properties.VersioningConfiguration;
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration)) return undefined;
  const status = (configuration as Readonly<Record<string, unknown>>).Status;
  return typeof status === 'string' ? status : undefined;
}

function assertBucketVersioningEnabled(buckets: readonly SynthesizedResource[], required: string): void {
  const unversioned = buckets.filter((bucket) => bucketVersioningStatus(bucket) !== required);
  if (unversioned.length > 0) {
    throw new Error(`bucket(s) ${unversioned.map((bucket) => bucket.logicalId).join(', ')} lack ${required} versioning: the prediction archive has no other recovery path if a single console delete happens`);
  }
}

function resourceTagValue(properties: ResourceProperties, key: string): string | undefined {
  const tags = properties.Tags;
  if (!Array.isArray(tags)) return undefined;
  const found = tags.find((tag) => (
    typeof tag === 'object' && tag !== null && !Array.isArray(tag) && (tag as Readonly<Record<string, unknown>>).Key === key
  ));
  const value = found ? (found as Readonly<Record<string, unknown>>).Value : undefined;
  return typeof value === 'string' ? value : undefined;
}

function assertCostAllocationTagPresent(resources: readonly SynthesizedResource[], key: string, value: string): void {
  const untagged = resources.filter((resource) => resourceTagValue(resource.properties, key) !== value);
  if (untagged.length > 0) {
    throw new Error(`resource(s) ${untagged.map((resource) => resource.logicalId).join(', ')} lack cost-allocation tag ${key}=${value}: a project-scoped $0.00 is not provable without it`);
  }
}

function resolvedFunctionArnTarget(target: Readonly<Record<string, unknown>>): string | undefined {
  const arn = target.Arn;
  if (typeof arn !== 'object' || arn === null) return undefined;
  const getAtt = (arn as Readonly<Record<string, unknown>>)['Fn::GetAtt'];
  return Array.isArray(getAtt) ? String(getAtt[0]) : undefined;
}

/** CDK's asset S3 key is its locally staged `asset.<hash>` directory plus a
 * `.zip` suffix. Resolve it from the synthesized template so this test
 * inspects exactly what CDK will package, never a source-tree lookalike. */
function stagedLambdaAssetDirectory(functionName: string): string {
  const resource = synthesizedResources('AWS::Lambda::Function', realTemplates.ingest)
    .find(({ properties }) => stringProperty(properties, 'FunctionName') === functionName);
  if (!resource) throw new Error(`expected synthesized Lambda for ${functionName}`);
  const code = resource.properties.Code as Readonly<Record<string, unknown>>;
  const s3Key = stringProperty(code, 'S3Key');
  if (!s3Key.endsWith('.zip')) throw new Error(`expected ${functionName} asset key to end in .zip, got ${s3Key}`);
  const assetDirectory = resolve(cloudAssembly.directory, `asset.${s3Key.slice(0, -'.zip'.length)}`);
  if (!existsSync(assetDirectory)) throw new Error(`expected staged asset directory ${assetDirectory}`);
  return assetDirectory;
}

function lambdaLogicalId(functionName: string): string {
  return `${functionName.split('-').map((segment) => `${segment[0]?.toUpperCase()}${segment.slice(1)}`).join('')}Function`;
}

const declaredLambdaTimeouts = Object.entries(guardrailDeclarations)
  .filter(([key]) => key.startsWith('timeout-'))
  .map(([key, value]) => ({
    functionName: key.slice('timeout-'.length),
    timeout: declarationSeconds(value),
  }))
  .sort((left, right) => left.functionName.localeCompare(right.functionName));
const declaredReservedConcurrency = Number(guardrailDeclarations['lambda-reserved-concurrency']);
const declaredLogRetention = declarationDays(guardrailDeclarations['log-retention']);
const declaredNonPredictionLifecycleRules: LifecycleRule[] = lifecycleRules.map((rule) => ({
  id: rule.id,
  ...('prefix' in rule ? { prefix: rule.prefix } : {}),
  ...('expirationAfterDays' in rule ? { expirationAfterDays: rule.expirationAfterDays } : {}),
  ...('abortAfterDays' in rule ? { abortAfterDays: rule.abortAfterDays } : {}),
}));
const protectedPredictionPrefix = predictionLifecyclePolicy.prefix;
const expectedPublicAccessBlockConfiguration = {
  BlockPublicAcls: true,
  BlockPublicPolicy: true,
  IgnorePublicAcls: true,
  RestrictPublicBuckets: true,
} as const;

describe('synthesized infrastructure guardrails', () => {
  it('gives every synthesized Lambda its declared timeout and reserved concurrency', () => {
    const functions = synthesizedResources('AWS::Lambda::Function')
      .map(({ logicalId, properties }) => ({
        logicalId,
        timeout: numberProperty(properties, 'Timeout'),
        reservedConcurrency: numberProperty(properties, 'ReservedConcurrentExecutions'),
      }))
      .sort((left, right) => left.logicalId.localeCompare(right.logicalId));

    template.resourceCountIs('AWS::Lambda::Function', declaredLambdaTimeouts.length);
    template.allResourcesProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: declaredReservedConcurrency,
    });
    expect(functions).toEqual(declaredLambdaTimeouts.map(({ functionName, timeout }) => ({
      logicalId: lambdaLogicalId(functionName),
      timeout,
      reservedConcurrency: declaredReservedConcurrency,
    })).sort((left, right) => left.logicalId.localeCompare(right.logicalId)));
  });

  it('gives every synthesized LogGroup the declared retention period', () => {
    const logGroups = synthesizedResources('AWS::Logs::LogGroup');

    template.resourceCountIs('AWS::Logs::LogGroup', declaredLambdaTimeouts.length);
    template.allResourcesProperties('AWS::Logs::LogGroup', {
      RetentionInDays: declaredLogRetention,
    });
    expect(logGroups.map(({ properties }) => numberProperty(properties, 'RetentionInDays')))
      .toEqual(Array.from({ length: declaredLambdaTimeouts.length }, () => declaredLogRetention));
  });

  it('gives every synthesized S3 bucket all four public-access blocks', () => {
    const buckets = synthesizedResources('AWS::S3::Bucket');

    expect(buckets).not.toHaveLength(0);
    template.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: expectedPublicAccessBlockConfiguration,
    });
  });

  it('keeps every synthesized S3 bucket versioned so a single console delete cannot permanently destroy the prediction log', () => {
    // covers: R1, R3, R4
    const buckets = synthesizedResources('AWS::S3::Bucket');
    expect(buckets).not.toHaveLength(0);
    assertBucketVersioningEnabled(buckets, archiveBucketVersioning['archive-bucket-versioning']);
  });

  it('rejects a constructed bucket missing the declared versioning status', () => {
    // covers: R1, R2, R4
    expect(() => assertBucketVersioningEnabled(
      [{ logicalId: 'RedProofArchiveBucket', properties: {} }],
      archiveBucketVersioning['archive-bucket-versioning'],
    )).toThrow(/RedProofArchiveBucket.*Enabled versioning.*no other recovery path/s);
  });

  it('carries the project cost-allocation tag on every synthesized resource this project declares', () => {
    // covers: R16
    const requiredKey = costAllocationTag['cost-allocation-tag-key'];
    const requiredValue = costAllocationTag['cost-allocation-tag-value'];
    const taggableResources = [
      ...synthesizedResources('AWS::Lambda::Function'),
      ...synthesizedResources('AWS::S3::Bucket'),
      ...synthesizedResources('AWS::IAM::Role'),
      ...synthesizedResources('AWS::Logs::LogGroup'),
    ];
    expect(taggableResources).toHaveLength(
      declaredLambdaTimeouts.length * 2 + 2, // Lambda + LogGroup pairs, plus the bucket and the execution role
    );
    assertCostAllocationTagPresent(taggableResources, requiredKey, requiredValue);
  });

  it('rejects a constructed resource missing the project cost-allocation tag', () => {
    // covers: R16
    expect(() => assertCostAllocationTagPresent(
      [{ logicalId: 'RedProofUntaggedFunction', properties: {} }],
      costAllocationTag['cost-allocation-tag-key'],
      costAllocationTag['cost-allocation-tag-value'],
    )).toThrow(/RedProofUntaggedFunction.*cost-allocation tag/s);
  });

  it('keeps the launch stack to its three declared non-prediction lifecycle rules', () => {
    const buckets = synthesizedResources('AWS::S3::Bucket');
    expect(buckets).toHaveLength(1);
    const [bucket] = buckets;
    if (!bucket) throw new Error('expected one synthesized S3 bucket');

    const actualRules = synthesizedLifecycleRules(bucket);
    expect(actualRules).toHaveLength(3);
    expect(actualRules).toEqual(declaredNonPredictionLifecycleRules);
    assertPredictionLifecycleSafety(actualRules, protectedPredictionPrefix, declaredNonPredictionLifecycleRules);
  });

  it('synthesizes the opt-in prediction Glacier Instant Retrieval rule from the shared policy', () => {
    const optInTemplate = Template.fromStack(createGuardrailStack(
      new App(),
      { enablePredictionArchiveTransition: true },
    ));
    const buckets = synthesizedResources('AWS::S3::Bucket', optInTemplate.toJSON() as SynthesizedTemplate);
    expect(buckets).toHaveLength(1);
    const [bucket] = buckets;
    if (!bucket) throw new Error('expected one synthesized opt-in bucket');

    const actualRules = synthesizedLifecycleRules(bucket);
    const expectedPredictionLifecycleRule = predictionLifecycleRule(predictionLifecyclePolicy);
    const predictionRules = actualRules.filter((rule) => rule.prefix === predictionLifecyclePolicy.prefix);

    expect(predictionRules).toEqual([expectedPredictionLifecycleRule]);
    assertPredictionLifecycleSafety(
      actualRules,
      protectedPredictionPrefix,
      declaredNonPredictionLifecycleRules,
      predictionLifecyclePolicy,
    );
  });

  it('rejects constructed prediction lifecycle overlaps that are not the shared opt-in policy', () => {
    expect(() => assertPredictionLifecycleSafety([
      { id: 'red-proof-prediction-expiration', prefix: protectedPredictionPrefix, expirationAfterDays: 1 },
    ], protectedPredictionPrefix, declaredNonPredictionLifecycleRules, predictionLifecyclePolicy)).toThrow(/red-proof-prediction-expiration/);
    expect(() => assertPredictionLifecycleSafety([
      { id: 'red-proof-bucket-wide-transition', transitions: [{ storageClass: 'GLACIER_IR', afterDays: 1 }] },
    ], protectedPredictionPrefix, declaredNonPredictionLifecycleRules, predictionLifecyclePolicy)).toThrow(/red-proof-bucket-wide-transition/);
  });

  it('fails closed when public local CI cannot inspect a missing infrastructure definition', async () => {
    const temporaryParent = mkdtempSync(resolve(tmpdir(), 'surfs-up-missing-infra-'));
    const missingRepoRoot = resolve(temporaryParent, 'missing-repository');
    const lines: string[] = [];
    const output = {
      write: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };

    try {
      const exitCode = await runLocalCi({
        argv: ['--job=infra'],
        repoRoot: missingRepoRoot,
        output,
      });
      const capturedOutput = lines.join('\n');

      expect(exitCode).toBeGreaterThan(0);
      expect(capturedOutput).toMatch(new RegExp(
        `cannot inspect ${resolve(missingRepoRoot, 'infra')}:.*restore the infra/ definition from version control`,
        's',
      ));
      expect(capturedOutput).not.toContain('.ci-local-logs/infra.log');
      expect(existsSync(resolve(missingRepoRoot, '.ci-local-logs', 'infra.log'))).toBe(false);
    } finally {
      rmSync(temporaryParent, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The four REAL stacks (system-architecture.md section 11). Every guardrail
// asserted below was demonstrated failing once against a deliberate poison
// before it counted (section 11: a gate never seen red proves nothing).
// ---------------------------------------------------------------------------

// Materialize CDK's assembly once. The asset package smoke below resolves
// S3Key against this directory, which makes its observation exactly the
// archive CDK would upload.
const cloudAssembly = app.synth();

const realStacks = {
  site: Template.fromStack(siteStack),
  ingest: Template.fromStack(ingestStack),
  observability: Template.fromStack(observabilityStack),
  write: Template.fromStack(writeStack),
} as const;

const realTemplates = Object.fromEntries(
  Object.entries(realStacks).map(([name, template]) => [name, template.toJSON() as SynthesizedTemplate]),
) as Record<keyof typeof realStacks, SynthesizedTemplate>;

const WRITE_URL_FUNCTION_NAMES: readonly string[] = [
  functionNames.report,
  functionNames.mint,
  functionNames.push,
  functionNames['photo-presign'],
];

const declaredRealTimeouts: Readonly<Record<string, number>> = {
  [functionNames.fetch]: 60,
  [functionNames.build]: 120,
  [functionNames.report]: 5,
  [functionNames.mint]: 5,
  [functionNames.push]: 5,
  [functionNames['photo-presign']]: 5,
  [functionNames.resize]: 60,
  [functionNames.breaker]: 10,
};

const declaredRealReservedConcurrency: Readonly<Record<string, number>> = {
  [functionNames.fetch]: 2,
  [functionNames.build]: 2,
  [functionNames.report]: writeReservedConcurrency.report,
  [functionNames.mint]: writeReservedConcurrency.mint,
  [functionNames.push]: writeReservedConcurrency.push,
  [functionNames['photo-presign']]: writeReservedConcurrency['photo-presign'],
  [functionNames.resize]: 2,
  [functionNames.breaker]: 2,
};

function allRealResources(type: string): SynthesizedResource[] {
  return (Object.keys(realTemplates) as (keyof typeof realTemplates)[])
    .flatMap((name) => synthesizedResources(type, realTemplates[name]));
}

describe('real stack guardrails: Lambda cost caps (guardrails 1 and 2)', () => {
  const functions = allRealResources('AWS::Lambda::Function')
    .map(({ logicalId, properties }) => ({
      logicalId,
      name: stringProperty(properties, 'FunctionName'),
      timeout: numberProperty(properties, 'Timeout'),
      reserved: numberProperty(properties, 'ReservedConcurrentExecutions'),
    }));

  it('deploys exactly the eight declared functions, no strays', () => {
    expect(functions.map(({ name }) => name).sort())
      .toEqual(Object.keys(declaredRealTimeouts).sort());
  });

  it('gives every real function its declared timeout, never the 900 s default', () => {
    for (const fn of functions) {
      expect(fn.timeout, `${fn.name} timeout`).toBe(declaredRealTimeouts[fn.name]);
      expect(fn.timeout, `${fn.name} exceeds the 120 s ceiling`).toBeLessThanOrEqual(120);
    }
  });

  it('gives every real function its declared reserved concurrency, all at most 2', () => {
    for (const fn of functions) {
      expect(fn.reserved, `${fn.name} reserved concurrency`).toBe(declaredRealReservedConcurrency[fn.name]);
      expect(fn.reserved, `${fn.name} exceeds the concurrency ceiling`).toBeLessThanOrEqual(2);
    }
  });

  it('keeps the account-wide reservation sum at the documented 13, so quota >= 113 is the deploy precondition', () => {
    const sum = functions.reduce((total, fn) => total + fn.reserved, 0);
    expect(sum).toBe(reservedConcurrencySum);
  });

  it('gives every real function an explicit 14-day log group', () => {
    const logGroups = allRealResources('AWS::Logs::LogGroup');
    expect(logGroups.length).toBe(functions.length);
    for (const logGroup of logGroups) {
      expect(numberProperty(logGroup.properties, 'RetentionInDays'), logGroup.logicalId).toBe(declaredLogRetention);
    }
  });
});

describe('real stack guardrails: the site bucket (guardrails 4 and 6, slice-01 versioning)', () => {
  const buckets = synthesizedResources('AWS::S3::Bucket', realTemplates.site);

  it('ships exactly one private, versioned bucket', () => {
    expect(buckets).toHaveLength(1);
    realStacks.site.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: expectedPublicAccessBlockConfiguration,
    });
    assertBucketVersioningEnabled(buckets, archiveBucketVersioning['archive-bucket-versioning']);
  });

  it('carries exactly the three declared lifecycle rules and none can reach the prediction log', () => {
    const [bucket] = buckets;
    if (!bucket) throw new Error('expected the site bucket');
    const rules = synthesizedLifecycleRules(bucket);
    expect(rules).toHaveLength(3);
    expect([...rules].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...declaredNonPredictionLifecycleRules].sort((a, b) => a.id.localeCompare(b.id)));
    assertPredictionLifecycleSafety(rules, protectedPredictionPrefix, declaredNonPredictionLifecycleRules);
  });

  it('fronts the bucket with CloudFront through OAC and exports the exact site origin', () => {
    realStacks.site.resourceCountIs('AWS::CloudFront::Distribution', 1);
    realStacks.site.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    const [distribution] = synthesizedResources('AWS::CloudFront::Distribution', realTemplates.site);
    if (!distribution) throw new Error('expected the site distribution');
    const config = distribution.properties.DistributionConfig as Readonly<Record<string, unknown>>;
    expect(config.DefaultRootObject).toBe('index.html');
    const errorResponses = config.CustomErrorResponses as readonly Readonly<Record<string, unknown>>[];
    expect(errorResponses).toEqual(expect.arrayContaining([
      expect.objectContaining({ ErrorCode: 403, ResponseCode: 404, ResponsePagePath: '/404.html' }),
    ]));
    const outputs = (realTemplates.site as Readonly<Record<string, unknown>>).Outputs as Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    const exported = Object.values(outputs ?? {}).find((output) => (
      (output.Export as Readonly<Record<string, unknown>> | undefined)?.Name === siteOriginExportName
    ));
    expect(exported, `an output must export ${siteOriginExportName}`).toBeDefined();
  });

  it('routes no CloudFront behavior at any Lambda Function URL (guardrail 6)', () => {
    const [distribution] = synthesizedResources('AWS::CloudFront::Distribution', realTemplates.site);
    if (!distribution) throw new Error('expected the site distribution');
    const rendered = JSON.stringify(distribution.properties);
    expect(rendered).not.toMatch(/lambda-url/);
  });
});

describe('real stack guardrails: ingest scheduling and the dead-man signal chain', () => {
  it('schedules the fetch function hourly at :17, enabled, with zero scheduler retries', () => {
    realStacks.ingest.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(17 * * * ? *)',
      State: 'ENABLED',
    });
    const [schedule] = synthesizedResources('AWS::Scheduler::Schedule', realTemplates.ingest)
      .filter(({ properties }) => stringProperty(properties, 'ScheduleExpression') === 'cron(17 * * * ? *)');
    if (!schedule) throw new Error('expected the hourly fetch schedule');
    const target = schedule.properties.Target as Readonly<Record<string, unknown>>;
    expect((target.RetryPolicy as Readonly<Record<string, unknown>>).MaximumRetryAttempts).toBe(0);
    const fetchLogicalId = synthesizedResources('AWS::Lambda::Function', realTemplates.ingest)
      .find(({ properties }) => stringProperty(properties, 'FunctionName') === functionNames.fetch)?.logicalId;
    expect(resolvedFunctionArnTarget(target)).toBe(fetchLogicalId);
  });

  // covers: the design's build run must actually fire (04-ingest-pipeline.md
  // section 3 steps 9-11: "Build run, hourly at :22, separate Lambda"). Proven
  // missing once (grep of infra/ found zero references to functionNames.build
  // or a buildFn target on any Schedule) before this guardrail counted.
  it('schedules the build function hourly at :22, enabled, with zero scheduler retries, targeting Build specifically', () => {
    realStacks.ingest.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(22 * * * ? *)',
      State: 'ENABLED',
    });
    const [schedule] = synthesizedResources('AWS::Scheduler::Schedule', realTemplates.ingest)
      .filter(({ properties }) => stringProperty(properties, 'ScheduleExpression') === 'cron(22 * * * ? *)');
    if (!schedule) throw new Error('expected the hourly build schedule');
    const target = schedule.properties.Target as Readonly<Record<string, unknown>>;
    expect((target.RetryPolicy as Readonly<Record<string, unknown>>).MaximumRetryAttempts).toBe(0);
    const buildLogicalId = synthesizedResources('AWS::Lambda::Function', realTemplates.ingest)
      .find(({ properties }) => stringProperty(properties, 'FunctionName') === functionNames.build)?.logicalId;
    expect(resolvedFunctionArnTarget(target)).toBe(buildLogicalId);
  });

  it('turns fetch log lines into the IngestSuccess and ProviderErrors metrics the alarms watch', () => {
    const filters = synthesizedResources('AWS::Logs::MetricFilter', realTemplates.ingest);
    const transformations = filters.flatMap(({ properties }) => (
      (properties.MetricTransformations as readonly Readonly<Record<string, unknown>>[]).map((t) => ({
        name: t.MetricName,
        namespace: t.MetricNamespace,
      }))
    ));
    expect(transformations).toEqual(expect.arrayContaining([
      { name: 'IngestSuccess', namespace: metricNamespace },
      { name: 'ProviderErrors', namespace: metricNamespace },
      { name: 'BuildSuccess', namespace: metricNamespace },
    ]));
  });

  // covers: the three event-name strings the deployed MetricFilters match on
  // and the strings the Lambda handlers actually log
  // (src/pipeline/lambda/log-events.ts) must be the SAME constants, not two
  // hand-typed literals that can silently drift apart. ingest-stack.ts
  // imports those constants directly, so this asserts the wiring, not a
  // coincidence.
  it('derives every dead-man filter pattern from the one shared event-name module, never a re-typed literal', () => {
    const filters = synthesizedResources('AWS::Logs::MetricFilter', realTemplates.ingest);
    const patterns = filters.map(({ properties }) => stringProperty(properties, 'FilterPattern'));
    for (const eventName of [INGEST_SUCCESS_EVENT, PROVIDER_ERROR_EVENT, BUILD_SUCCESS_EVENT, PUBLISH_MISMATCH_EVENT]) {
      expect(patterns.some((pattern) => pattern.includes(`"${eventName}"`)), eventName).toBe(true);
    }
  });

  // covers: the honest-placeholder comment this stack carried promised real
  // pipeline code "belongs to the ingest feature's DELIVER lane" -- proving
  // the placeholder is gone is proving neither function still ships as an
  // inline ZipFile string, the literal marker `Code.fromInline` leaves in
  // the synthesized template.
  it('ships Fetch and Build as a real bundled code asset, never the honest inline placeholder', () => {
    const functions = synthesizedResources('AWS::Lambda::Function', realTemplates.ingest)
      .filter(({ properties }) => (
        stringProperty(properties, 'FunctionName') === functionNames.fetch
        || stringProperty(properties, 'FunctionName') === functionNames.build
      ));
    expect(functions).toHaveLength(2);
    for (const { properties, logicalId } of functions) {
      const code = properties.Code as Readonly<Record<string, unknown>>;
      expect(code.ZipFile, logicalId).toBeUndefined();
      expect(code.S3Bucket, logicalId).toBeDefined();
      expect(code.S3Key, logicalId).toBeDefined();
    }
  });

  // This is intentionally an asset-level test rather than another source
  // import. It synthesizes SurfsUpPanamaIngest, follows each Function's
  // staged asset key, checks the exact canonical package layout, then runs
  // both bundled composition roots with fake driven ports but without an
  // injected spot list. Therefore the default `launchData` paths must load
  // from the staged `data/spots/` directory, not from process.cwd() or a
  // source-tree fallback.
  it('packages canonical launch spot files and lets both default handlers load them from their staged assets', async () => {
    const fetchAsset = stagedLambdaAssetDirectory(functionNames.fetch);
    const buildAsset = stagedLambdaAssetDirectory(functionNames.build);
    for (const asset of [fetchAsset, buildAsset]) {
      expect(existsSync(resolve(asset, 'data/spots/pa-pacific.yaml')), asset).toBe(true);
      expect(existsSync(resolve(asset, 'data/spots/pa-pacific-launch-v1.json')), asset).toBe(true);
    }
    // Build's deployment package is its real static-rendering runtime, not
    // merely a JSON writer. These three paths are the minimum package smoke
    // for the code path that copies a writable project into /tmp, invokes
    // Astro, then uploads the rendered route set.
    expect(existsSync(resolve(buildAsset, 'node_modules/astro/bin/astro.mjs')), buildAsset).toBe(true);
    expect(existsSync(resolve(buildAsset, 'src/pages/index.astro')), buildAsset).toBe(true);
    expect(existsSync(resolve(buildAsset, 'astro.config.mjs')), buildAsset).toBe(true);

    const fetchPackage = await import(pathToFileURL(resolve(fetchAsset, 'index.mjs')).href) as typeof import('../../src/pipeline/lambda/fetch-handler.js');
    const buildPackage = await import(pathToFileURL(resolve(buildAsset, 'index.mjs')).href) as typeof import('../../src/pipeline/lambda/build-handler.js');
    const source: ForecastSource = {
      async fetchWavePayload(spot_id) {
        return { ok: true, verbatim: JSON.stringify({ spot_id }) };
      },
      parseWaveMembers() {
        return { ok: true, data: [{
            source: 'ncep_gfswave016',
            run_ts: '2026-08-10T06:00Z',
            hours: [{
              valid_ts: '2026-08-10T18:00Z',
              swell: { h_m: 1.1, t_s: 14, dir_deg: 204 },
              swell2: null,
              land_masked: false,
            }],
          }] };
      },
      async fetchWindPayload() {
        return { ok: true, verbatim: '{}' };
      },
      parseWind() { return { ok: true, data: [] }; },
      async fetchTidePayload() {
        return { ok: false, reason: 'dark' };
      },
      parseTide() { return { ok: false, reason: 'dark' }; },
    };
    let rawWrites = 0;
    let predictionWrites = 0;
    const ingestStore: IngestStore = {
      async putRaw() { rawWrites += 1; },
      async putPredictionIfAbsent() { predictionWrites += 1; return 'created'; },
    };
    const fetchOutcome = await fetchPackage.runFetch({
      source,
      store: ingestStore,
      clock: { now: () => new Date('2026-08-10T06:17:00Z') },
    });
    expect(fetchOutcome.completed).toBe(true);
    expect(rawWrites).toBeGreaterThan(0);
    expect(predictionWrites).toBeGreaterThan(0);

    const buildStore: BuildStore = {
      async getPrediction() { return null; },
      async listPredictions() { return []; },
      async getCorrection() { return null; },
      async putCallIfAbsent() { return 'created'; },
      async putBundle() {},
      async putManifest() {},
    };
    const buildOutcome = await buildPackage.runBuild({
      store: buildStore,
      clock: { now: () => new Date('2026-08-10T11:22:00Z') },
    });
    expect(buildOutcome).toEqual({ published: false, reason: 'no usable wave members' });
  });

  it('caps Lambda async retries at zero so duplicate deliveries cannot double-bill', () => {
    const configs = synthesizedResources('AWS::Lambda::EventInvokeConfig', realTemplates.ingest);
    expect(configs.length).toBeGreaterThanOrEqual(2);
    for (const config of configs) {
      expect(numberProperty(config.properties, 'MaximumRetryAttempts'), config.logicalId).toBe(0);
    }
  });

  it('never grants the ingest role a delete on the bucket and never touches write concurrency', () => {
    const rendered = JSON.stringify(realTemplates.ingest);
    expect(rendered).not.toContain('s3:DeleteObject');
    expect(rendered).not.toContain('lambda:PutFunctionConcurrency');
  });
});

describe('real stack guardrails: the write path (guardrails 1, 6; 07-write-path 7.2)', () => {
  it('keeps the store PROVISIONED at exactly 25/25 so it throttles free instead of billing', () => {
    realStacks.write.hasResourceProperties('AWS::DynamoDB::Table', {
      ProvisionedThroughput: { ReadCapacityUnits: 25, WriteCapacityUnits: 25 },
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
    const [table] = synthesizedResources('AWS::DynamoDB::Table', realTemplates.write);
    if (!table) throw new Error('expected the write store table');
    // CloudFormation's default BillingMode IS provisioned; anything else set
    // explicitly (PAY_PER_REQUEST) breaks the fail-closed guarantee.
    expect(table.properties.BillingMode ?? 'PROVISIONED').toBe('PROVISIONED');
    realStacks.write.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
  });

  it('classifies every Function URL: the four write URLs are NONE with exact-origin CORS, nothing else has a URL', () => {
    const urls = (Object.keys(realTemplates) as (keyof typeof realTemplates)[])
      .flatMap((name) => synthesizedResources('AWS::Lambda::Url', realTemplates[name]));
    expect(urls).toHaveLength(WRITE_URL_FUNCTION_NAMES.length);
    const writeFunctionLogicalIds = new Set(
      synthesizedResources('AWS::Lambda::Function', realTemplates.write)
        .filter(({ properties }) => WRITE_URL_FUNCTION_NAMES.includes(stringProperty(properties, 'FunctionName')))
        .map(({ logicalId }) => logicalId),
    );
    for (const url of urls) {
      expect(url.properties.AuthType, url.logicalId).toBe('NONE');
      const target = url.properties.TargetFunctionArn as Readonly<Record<string, unknown>>;
      const targetLogicalId = Array.isArray(target['Fn::GetAtt']) ? String(target['Fn::GetAtt'][0]) : String(target.Ref);
      expect(writeFunctionLogicalIds.has(targetLogicalId), `${url.logicalId} must target a write function`).toBe(true);
      const cors = url.properties.Cors as Readonly<Record<string, unknown>>;
      const origins = cors.AllowOrigins as readonly unknown[];
      expect(origins).toHaveLength(1);
      expect(origins[0]).not.toBe('*');
      expect(JSON.stringify(origins[0])).toContain(siteOriginExportName);
    }
  });

  it('arms one breaker alarm per write function at the declared thresholds', () => {
    const alarms = synthesizedResources('AWS::CloudWatch::Alarm', realTemplates.write)
      .map(({ properties }) => ({
        metric: stringProperty(properties, 'MetricName'),
        threshold: numberProperty(properties, 'Threshold'),
        dimension: (properties.Dimensions as readonly Readonly<Record<string, unknown>>[])[0]?.Value,
      }));
    expect(alarms).toHaveLength(4);
    const byFunction = Object.fromEntries(alarms.map((alarm) => [alarm.dimension, alarm]));
    for (const [shortName, threshold] of Object.entries(breakerInvocationThresholds)) {
      const functionName = functionNames[shortName as keyof typeof functionNames];
      expect(byFunction[functionName]?.metric, functionName).toBe('Invocations');
      expect(byFunction[functionName]?.threshold, functionName).toBe(threshold);
    }
  });

  it('scopes the breaker to exactly the four write functions; the ingest functions are untouchable', () => {
    const policies = synthesizedResources('AWS::IAM::Policy', realTemplates.write);
    const concurrencyStatements = policies.flatMap(({ properties }) => {
      const document = properties.PolicyDocument as Readonly<Record<string, unknown>>;
      return (document.Statement as readonly Readonly<Record<string, unknown>>[]).filter((statement) => (
        JSON.stringify(statement.Action).includes('PutFunctionConcurrency')
      ));
    });
    expect(concurrencyStatements.length).toBeGreaterThan(0);
    // Resources are Fn::GetAtt references; resolve each logical id back to
    // the physical FunctionName it points at, then compare exactly.
    const functionNameByLogicalId = Object.fromEntries(
      synthesizedResources('AWS::Lambda::Function', realTemplates.write)
        .map(({ logicalId, properties }) => [logicalId, stringProperty(properties, 'FunctionName')]),
    );
    const resolvedNames = concurrencyStatements.flatMap((statement) => {
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
      return resources.map((resource) => {
        const reference = resource as Readonly<Record<string, unknown>>;
        const getAtt = reference['Fn::GetAtt'];
        const logicalId = Array.isArray(getAtt) ? String(getAtt[0]) : String(reference.Ref ?? resource);
        return functionNameByLogicalId[logicalId] ?? logicalId;
      });
    }).sort();
    expect(resolvedNames).toEqual([...WRITE_URL_FUNCTION_NAMES].sort());
    expect(resolvedNames).not.toContain(functionNames.fetch);
    expect(resolvedNames).not.toContain(functionNames.build);
  });
});

describe('real stack guardrails: observability and the money lines (guardrails 8 and 9)', () => {
  it("gives the dead-man's switch its four load-bearing properties", () => {
    realStacks.observability.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: metricNamespace,
      MetricName: 'IngestSuccess',
      Statistic: 'Sum',
      Period: 3600,
      EvaluationPeriods: 2,
      TreatMissingData: 'breaching',
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 1,
    });
    const deadMan = synthesizedResources('AWS::CloudWatch::Alarm', realTemplates.observability)
      .find(({ properties }) => properties.MetricName === 'IngestSuccess');
    if (!deadMan) throw new Error('expected the dead-man alarm');
    expect((deadMan.properties.AlarmActions as readonly unknown[]).length).toBeGreaterThan(0);
    expect((deadMan.properties.OKActions as readonly unknown[]).length).toBeGreaterThan(0);
  });

  it('declares the five money lines as budgets: 1, 5, 15, the 18 action line, and the created-not-imported 20', () => {
    const budgets = synthesizedResources('AWS::Budgets::Budget', realTemplates.observability)
      .map(({ properties }) => {
        const budget = properties.Budget as Readonly<Record<string, unknown>>;
        const limit = budget.BudgetLimit as Readonly<Record<string, unknown>>;
        return Number(limit.Amount);
      })
      .sort((left, right) => left - right);
    expect(budgets).toEqual([1, 5, 15, 18, 20]);
  });

  it('wires the 18-dollar line to the breaker topic, because an IAM deny cannot bind an anonymous URL invoke', () => {
    const [actionBudget] = synthesizedResources('AWS::Budgets::Budget', realTemplates.observability)
      .filter(({ properties }) => {
        const budget = properties.Budget as Readonly<Record<string, unknown>>;
        return Number((budget.BudgetLimit as Readonly<Record<string, unknown>>).Amount) === 18;
      });
    if (!actionBudget) throw new Error('expected the 18-dollar budget');
    // The SNS subscriber renders as a Ref to the topic's logical id; resolve
    // it to the topic resource and check the physical topic name.
    const notifications = actionBudget.properties.NotificationsWithSubscribers as readonly Readonly<Record<string, unknown>>[];
    const snsSubscribers = notifications.flatMap((notification) => (
      (notification.Subscribers as readonly Readonly<Record<string, unknown>>[])
        .filter((subscriber) => subscriber.SubscriptionType === 'SNS')
    ));
    expect(snsSubscribers).toHaveLength(1);
    const address = snsSubscribers[0]?.Address as Readonly<Record<string, unknown>>;
    const topicLogicalId = String(address.Ref);
    const topic = synthesizedResources('AWS::SNS::Topic', realTemplates.observability)
      .find(({ logicalId }) => logicalId === topicLogicalId);
    expect(topic, 'the SNS subscriber must reference a topic in this stack').toBeDefined();
    expect(topic?.properties.TopicName).toBe(breakerTopicName);
  });

  it('lets AWS Budgets publish to the breaker topic and keeps the alarm email subscription', () => {
    const rendered = JSON.stringify(realTemplates.observability);
    expect(rendered).toContain('budgets.amazonaws.com');
    const subscriptions = synthesizedResources('AWS::SNS::Subscription', realTemplates.observability)
      .filter(({ properties }) => properties.Protocol === 'email');
    expect(subscriptions.length).toBeGreaterThan(0);
  });

  it('keeps the whole design inside the ten-alarm free tier', () => {
    const alarmCount = allRealResources('AWS::CloudWatch::Alarm').length;
    expect(alarmCount).toBeLessThanOrEqual(10);
    expect(alarmCount).toBe(7);
  });
});

describe('real stack guardrails: the project cost-allocation tag (slice-03)', () => {
  it('tags every taggable resource in all four real stacks', () => {
    const taggable = [
      ...allRealResources('AWS::Lambda::Function'),
      ...allRealResources('AWS::S3::Bucket'),
      ...allRealResources('AWS::IAM::Role'),
      ...allRealResources('AWS::Logs::LogGroup'),
      ...allRealResources('AWS::DynamoDB::Table'),
      ...allRealResources('AWS::SNS::Topic'),
    ];
    expect(taggable.length).toBeGreaterThan(0);
    assertCostAllocationTagPresent(
      taggable,
      costAllocationTag['cost-allocation-tag-key'],
      costAllocationTag['cost-allocation-tag-value'],
    );
  });
});
