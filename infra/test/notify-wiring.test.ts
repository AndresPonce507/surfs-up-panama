// Focused proof for the scheduled notify job (adr-push-vapid-direct.md
// decision 1; 07-write-path.md section 2's function table row `notify`, and
// section 8.2's send rule).
//
// WHY THIS IS NOT THE `push` FUNCTION. 07-write-path.md section 2 declares
// them as two separate rows and the section 8.6 sequence diagram draws them as
// two participants: `push` is the POST /api/push subscribe/unsubscribe
// endpoint behind a Function URL, while `notify` is the hourly send fan-out
// that is "never on the request path". They differ in trigger, timeout,
// memory, and blast radius, so they are two functions, not one.
//
// The assertions below are therefore mostly NEGATIVE, and deliberately so: the
// cost and abuse argument in the ADR rests on notify being unreachable from the
// internet. "The notify job is scheduled, never URL-exposed: its cost is
// bounded by subscriptions x dedup rules x the run cap, not by an attacker's
// request rate."

import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { writeStack } from '../bin/app.js';
import { functionNames, projectAccountId, projectRegion, siteBucketName } from '../lib/physical-names.js';
import { notifyMemorySizeMb, notifyReservedConcurrency, vapidPrivateKeyParameterName } from '../lib/write-declarations.js';

type Properties = Readonly<Record<string, unknown>>;
type Resource = Readonly<{ readonly Type?: string; readonly Properties?: Properties }>;
type TemplateJson = Readonly<{ readonly Resources?: Readonly<Record<string, Resource>> }>;

const template = Template.fromStack(writeStack).toJSON() as TemplateJson;
const resources = Object.entries(template.Resources ?? {});

function resourcesOfType(type: string): readonly (readonly [string, Resource])[] {
  return resources.filter(([, resource]) => resource.Type === type);
}

function notifyFunction(): readonly [string, Resource] {
  const found = resourcesOfType('AWS::Lambda::Function')
    .find(([, resource]) => resource.Properties?.FunctionName === functionNames.notify);
  if (found === undefined) throw new Error(`missing Lambda ${functionNames.notify}`);
  return found;
}

function policyStatementsFor(functionName: string): readonly Properties[] {
  const [, target] = resourcesOfType('AWS::Lambda::Function')
    .find(([, resource]) => resource.Properties?.FunctionName === functionName) ?? [];
  if (target === undefined) throw new Error(`missing Lambda ${functionName}`);
  const targetRole = ((target.Properties?.Role as Properties | undefined)?.['Fn::GetAtt'] as readonly unknown[] | undefined)?.[0];
  if (typeof targetRole !== 'string') throw new Error(`missing role for ${functionName}`);
  return resourcesOfType('AWS::IAM::Policy')
    .filter(([, resource]) => ((resource.Properties?.Roles as readonly Properties[] | undefined) ?? []).some((role) => role.Ref === targetRole))
    .flatMap(([, resource]) => ((resource.Properties?.PolicyDocument as Properties | undefined)?.Statement as readonly Properties[] | undefined) ?? []);
}

function actionSet(statements: readonly Properties[]): string[] {
  return statements.flatMap((statement) => {
    const action = statement.Action;
    return Array.isArray(action) ? action : typeof action === 'string' ? [action] : [];
  }).sort();
}

describe('the scheduled notify job', () => {
  it('ships the send fan-out at its declared size: 120 s, 256 MB, reserved concurrency 1', () => {
    const [, resource] = notifyFunction();
    const properties = resource.Properties ?? {};
    expect(properties.Timeout).toBe(120);
    expect(properties.MemorySize).toBe(notifyMemorySizeMb);
    expect(properties.ReservedConcurrentExecutions).toBe(notifyReservedConcurrency);
    expect(properties.Architectures).toEqual(['arm64']);
    expect(properties.Runtime).toBe('nodejs22.x');
  });

  it('exposes no Function URL, so the send lane cannot be reached from the internet at all', () => {
    const [notifyLogicalId] = notifyFunction();
    const urls = resourcesOfType('AWS::Lambda::Url');
    expect(urls).toHaveLength(4);
    const urlTargets = urls.map(([, resource]) => JSON.stringify(resource.Properties?.TargetFunctionArn));
    for (const target of urlTargets) {
      expect(target).not.toContain(notifyLogicalId);
      expect(target).not.toContain(functionNames.notify);
    }
  });

  it('runs hourly at :25, after the :22 build, with no retry so a duplicate delivery cannot double-send', () => {
    const schedules = resourcesOfType('AWS::Scheduler::Schedule')
      .filter(([, resource]) => JSON.stringify(resource.Properties?.Target).includes(functionNames.notify)
        || JSON.stringify(resource.Properties).includes('notify'));
    expect(schedules).toHaveLength(1);
    const [, schedule] = schedules[0] ?? [];
    const properties = schedule?.Properties ?? {};
    expect(properties.ScheduleExpression).toBe('cron(25 * * * ? *)');
    expect(properties.ScheduleExpressionTimezone).toBe('UTC');
    const target = properties.Target as Properties;
    expect(target.RetryPolicy).toEqual({ MaximumRetryAttempts: 0 });
  });

  it('ships an enabled schedule only with the real VAPID sender bundle', () => {
    const [, schedule] = resourcesOfType('AWS::Scheduler::Schedule')
      .find(([, resource]) => JSON.stringify(resource.Properties).includes(functionNames.notify)) ?? [];
    expect(schedule?.Properties?.State).toBe('ENABLED');
    const [, notify] = notifyFunction();
    expect(notify.Properties?.Handler).toBe('notify.handler');
    expect(JSON.stringify(notify.Properties?.Code)).toContain('S3Bucket');
  });

  it('reads the VAPID private key from the one declared SecureString parameter and can never write a parameter', () => {
    const statements = policyStatementsFor(functionNames.notify);
    const actions = actionSet(statements);
    expect(actions).toEqual(expect.arrayContaining(['ssm:GetParameter']));
    expect(actions).not.toEqual(expect.arrayContaining(['ssm:PutParameter', 'ssm:DeleteParameter']));
    expect(JSON.stringify(statements)).toContain(
      `arn:aws:ssm:${projectRegion}:${projectAccountId}:parameter${vapidPrivateKeyParameterName}`,
    );
  });

  it('carries the parameter name as configuration, never a key value of any kind', () => {
    const [, resource] = notifyFunction();
    const environment = JSON.stringify(resource.Properties?.Environment ?? {});
    expect(environment).toContain(vapidPrivateKeyParameterName);
    expect(environment).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(environment).not.toMatch(/VAPID_PRIVATE_KEY"\s*:\s*"[A-Za-z0-9_-]{20,}/);
  });

  it('gets exactly the subscription operations its send rule needs, and no write it does not', () => {
    const actions = actionSet(policyStatementsFor(functionNames.notify));
    expect(actions).toEqual(expect.arrayContaining([
      'dynamodb:DeleteItem', 'dynamodb:DescribeTable', 'dynamodb:Query', 'dynamodb:UpdateItem',
    ]));
    // No PutItem: the send job never creates a subscription. No Scan: a fan-out
    // that scans the table walks reports and credentials too. No transaction and
    // no S3 write anywhere.
    expect(actions).not.toEqual(expect.arrayContaining(['dynamodb:PutItem']));
    expect(actions).not.toEqual(expect.arrayContaining(['dynamodb:Scan']));
    expect(actions).not.toEqual(expect.arrayContaining(['dynamodb:TransactWriteItems']));
    expect(actions).not.toEqual(expect.arrayContaining(['s3:PutObject', 's3:DeleteObject']));
  });

  it('reads exactly the current published bundle and no other site data', () => {
    const statements = policyStatementsFor(functionNames.notify);
    const actions = actionSet(statements);
    expect(actions).toEqual(expect.arrayContaining(['s3:GetObject', 's3:ListBucket']));
    const rendered = JSON.stringify(statements);
    expect(rendered).toContain(`${siteBucketName}/pub/v1/regions/pa-pacific/bundle.json`);
    expect(rendered).not.toContain('log/calls');
  });

  it('stays out of the breaker at RUNTIME too, not only in the IAM policy', () => {
    // The breaker reads its target list from the WRITE_FUNCTIONS environment
    // variable (infra/lambda-src/breaker.mjs) rather than deriving names by
    // prefix. A ninth function leaking into that JSON would put a scheduled job
    // in the breaker's blast radius with no IAM grant to perform it, which
    // fails at runtime inside the breaker rather than in any synth assertion.
    const [, breaker] = resourcesOfType('AWS::Lambda::Function')
      .find(([, resource]) => resource.Properties?.FunctionName === functionNames.breaker) ?? [];
    const variables = (breaker?.Properties?.Environment as Properties | undefined)?.Variables as Properties;
    const writeFunctions = JSON.parse(String(variables.WRITE_FUNCTIONS)) as Record<string, number>;
    expect(Object.keys(writeFunctions).sort()).toEqual([
      functionNames.mint, functionNames['photo-presign'], functionNames.push, functionNames.report,
    ].sort());
    expect(Object.keys(writeFunctions)).not.toContain(functionNames.notify);
  });

  it('sits outside the circuit breaker: no breaker alarm names it and it is not in the breaker blast radius', () => {
    const alarms = resourcesOfType('AWS::CloudWatch::Alarm');
    const alarmDimensions = alarms.flatMap(([, resource]) => (
      (resource.Properties?.Dimensions as readonly Properties[] | undefined) ?? []
    ).map((dimension) => dimension.Value));
    expect(alarmDimensions).not.toContain(functionNames.notify);

    const [notifyLogicalId] = notifyFunction();
    const breakerStatements = resourcesOfType('AWS::IAM::Policy')
      .flatMap(([, resource]) => ((resource.Properties?.PolicyDocument as Properties | undefined)?.Statement as readonly Properties[] | undefined) ?? [])
      .filter((statement) => JSON.stringify(statement.Action).includes('PutFunctionConcurrency'));
    expect(breakerStatements.length).toBeGreaterThan(0);
    expect(JSON.stringify(breakerStatements)).not.toContain(notifyLogicalId);
  });
});
