import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runLocalCi } from '../../scripts/ci-local.mjs';
import { createGuardrailStack, stack } from '../bin/app.js';
import {
  archiveBucketVersioning,
  costAllocationTag,
  guardrailDeclarations,
  lifecycleRules,
  predictionLifecyclePolicy,
} from '../lib/guardrail-declarations.js';

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

  it('carries the project cost-allocation tag on every synthesized Lambda function and the archive bucket', () => {
    // covers: R16
    const requiredKey = costAllocationTag['cost-allocation-tag-key'];
    const requiredValue = costAllocationTag['cost-allocation-tag-value'];
    const taggableResources = [
      ...synthesizedResources('AWS::Lambda::Function'),
      ...synthesizedResources('AWS::S3::Bucket'),
    ];
    expect(taggableResources).not.toHaveLength(0);
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
