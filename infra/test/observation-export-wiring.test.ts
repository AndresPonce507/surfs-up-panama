// Focused proof for the nightly observation export job (adr-observation-export.md;
// 07-write-path.md section 2's function table row `export`, section 7.4's abuse
// signals). It is the tenth real function and the second scheduled job in
// WriteStack, and like notify it is never on the request path: no Function URL,
// no CORS, no breaker membership. Its cost is one Scan and a handful of PUTs a
// night, bounded by the table, never by an attacker's request rate.
//
// The IAM assertions are EXACT-SET, not contains: the export role is the
// write-once property in IAM form. Read-only on the table (Scan + DescribeTable,
// nothing else), put-only under its two log prefixes (log/observations/v1/*,
// ops/abuse-signals/v1/*), and nothing anywhere else. A grant that widened
// silently would let a bug rewrite an immutable community log.
//
// covers: R7 R8

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../bin/app.js';
import { lambdaTimeoutSeconds } from '../lib/ingest-stack.js';
import { functionNames, siteBucketName } from '../lib/physical-names.js';
import { exportMemorySizeMb, exportReservedConcurrency } from '../lib/write-declarations.js';

const exportFunctionName = 'surfs-up-panama-export';

type Properties = Readonly<Record<string, unknown>>;
type Resource = Readonly<{ readonly Type?: string; readonly Properties?: Properties }>;

// Materialize the real assembly once: the asset-layout proof below follows the
// staged package CDK would deploy, never a source-tree lookalike.
const cloudAssembly = app.synth();
const template = cloudAssembly.getStackByName('SurfsUpPanamaWrite').template as Readonly<{
  readonly Resources?: Readonly<Record<string, Resource>>;
}>;
const resources = Object.entries(template.Resources ?? {});

function resourcesOfType(type: string): readonly (readonly [string, Resource])[] {
  return resources.filter(([, resource]) => resource.Type === type);
}

function exportFunction(): readonly [string, Resource] {
  const found = resourcesOfType('AWS::Lambda::Function')
    .find(([, resource]) => resource.Properties?.FunctionName === exportFunctionName);
  if (found === undefined) throw new Error(`missing Lambda ${exportFunctionName}`);
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
  return [...new Set(statements.flatMap((statement) => {
    const action = statement.Action;
    return Array.isArray(action) ? (action as string[]) : typeof action === 'string' ? [action] : [];
  }))].sort();
}

describe('the nightly observation export job', () => {
  it('keeps the declaration files in lockstep with 07-write-path section 2 row `export` and its physical name', () => {
    // Both directions pinned: the template tests below read the constants,
    // and this test pins the constants to the document's literal values, so
    // neither the stack nor the declarations can drift alone.
    expect(functionNames.export).toBe(exportFunctionName);
    expect(lambdaTimeoutSeconds['notify-export']).toBe(120);
    expect(exportMemorySizeMb).toBe(512);
    expect(exportReservedConcurrency).toBe(1);
  });

  it('ships at its declared size: 120 s, 512 MB, reserved concurrency 1, as a real bundled asset', () => {
    const [, resource] = exportFunction();
    const properties = resource.Properties ?? {};
    expect(properties.Timeout).toBe(lambdaTimeoutSeconds['notify-export']);
    expect(properties.MemorySize).toBe(exportMemorySizeMb);
    expect(properties.ReservedConcurrentExecutions).toBe(exportReservedConcurrency);
    expect(properties.Architectures).toEqual(['arm64']);
    expect(properties.Runtime).toBe('nodejs22.x');
    expect(properties.Handler).toBe('observation-export.handler');
    // Real code, not a placeholder: the handler landed in steps 01-01/01-02.
    const code = properties.Code as Properties;
    expect(code.ZipFile).toBeUndefined();
    expect(code.S3Key).toBeDefined();
  });

  it('is handed exactly the two environment names its composition root refuses to run without', () => {
    const [, resource] = exportFunction();
    const variables = (resource.Properties?.Environment as Properties | undefined)?.Variables as Properties;
    expect(variables.WRITE_STORE_TABLE).toEqual({ Ref: expect.stringContaining('WriteStore') });
    expect(variables.SITE_BUCKET).toBe(siteBucketName);
  });

  it('gets an explicit 14-day log group, never the default never-expiring one', () => {
    const logGroups = resourcesOfType('AWS::Logs::LogGroup')
      .filter(([, resource]) => resource.Properties?.LogGroupName === `/aws/lambda/${exportFunctionName}`);
    expect(logGroups).toHaveLength(1);
    expect(logGroups[0]?.[1].Properties?.RetentionInDays).toBe(14);
  });

  it('runs nightly at 00:30 UTC, after the received day closes, with no retry because write-once makes a re-run a no-op', () => {
    const schedules = resourcesOfType('AWS::Scheduler::Schedule')
      .filter(([, resource]) => JSON.stringify(resource.Properties).includes(exportFunctionName));
    expect(schedules).toHaveLength(1);
    const properties = schedules[0]?.[1].Properties ?? {};
    expect(properties.ScheduleExpression).toBe('cron(30 0 * * ? *)');
    expect(properties.ScheduleExpressionTimezone).toBe('UTC');
    expect(properties.FlexibleTimeWindow).toEqual({ Mode: 'OFF' });
    const target = properties.Target as Properties;
    expect(target.RetryPolicy).toEqual({ MaximumRetryAttempts: 0 });
    // The target rides through a dedicated scheduler role, not a shared one.
    const [exportLogicalId] = exportFunction();
    expect(JSON.stringify(target.Arn)).toContain(exportLogicalId);
    expect(target.RoleArn).toBeDefined();
  });

  it('ships the schedule DISABLED: night one seals its write-once keys forever, so a human enables it deliberately (ADR decision 7)', () => {
    const [, schedule] = resourcesOfType('AWS::Scheduler::Schedule')
      .find(([, resource]) => JSON.stringify(resource.Properties).includes(exportFunctionName)) ?? [];
    expect(schedule?.Properties?.State).toBe('DISABLED');
  });

  it('exposes no Function URL, so the export lane cannot be reached from the internet at all', () => {
    const [exportLogicalId] = exportFunction();
    const urls = resourcesOfType('AWS::Lambda::Url');
    expect(urls).toHaveLength(4);
    for (const [, resource] of urls) {
      const target = JSON.stringify(resource.Properties?.TargetFunctionArn);
      expect(target).not.toContain(exportLogicalId);
      expect(target).not.toContain(exportFunctionName);
    }
  });

  it('holds EXACTLY read-only table access and put-only log access: three actions, nothing else in the whole role', () => {
    const statements = policyStatementsFor(exportFunctionName);
    // Exact set equality, not arrayContaining: any fourth action appearing in
    // this role is a defect, whatever it is.
    expect(actionSet(statements)).toEqual(['dynamodb:DescribeTable', 'dynamodb:Scan', 's3:PutObject']);
  });

  it('may put ONLY under log/observations/v1/* and ops/abuse-signals/v1/*, and may touch no other prefix', () => {
    const statements = policyStatementsFor(exportFunctionName);
    const putStatements = statements.filter((statement) => JSON.stringify(statement.Action).includes('s3:PutObject'));
    expect(putStatements).toHaveLength(1);
    const resourcesJson = JSON.stringify(putStatements[0]?.Resource);
    expect(resourcesJson).toContain('log/observations/v1/*');
    expect(resourcesJson).toContain('ops/abuse-signals/v1/*');
    const putResources = putStatements[0]?.Resource;
    expect(Array.isArray(putResources) ? (putResources as unknown[]).length : 1).toBe(2);
    // The prefixes the rest of the site lives under never appear in this role.
    const allStatements = JSON.stringify(statements);
    expect(allStatements).not.toContain('pub/v1');
    expect(allStatements).not.toContain('log/calls');
    expect(allStatements).not.toContain('predictions/');
  });

  it('stays out of the breaker: not in WRITE_FUNCTIONS, no breaker alarm, no concurrency grant names it', () => {
    const [exportLogicalId] = exportFunction();
    const [, breaker] = resourcesOfType('AWS::Lambda::Function')
      .find(([, resource]) => resource.Properties?.FunctionName === functionNames.breaker) ?? [];
    const variables = (breaker?.Properties?.Environment as Properties | undefined)?.Variables as Properties;
    const writeFunctions = JSON.parse(String(variables.WRITE_FUNCTIONS)) as Record<string, number>;
    expect(Object.keys(writeFunctions)).not.toContain(exportFunctionName);

    const alarmDimensions = resourcesOfType('AWS::CloudWatch::Alarm')
      .flatMap(([, resource]) => ((resource.Properties?.Dimensions as readonly Properties[] | undefined) ?? [])
        .map((dimension) => dimension.Value));
    expect(alarmDimensions).not.toContain(exportFunctionName);

    const breakerStatements = resourcesOfType('AWS::IAM::Policy')
      .flatMap(([, resource]) => ((resource.Properties?.PolicyDocument as Properties | undefined)?.Statement as readonly Properties[] | undefined) ?? [])
      .filter((statement) => JSON.stringify(statement.Action).includes('PutFunctionConcurrency'));
    expect(breakerStatements.length).toBeGreaterThan(0);
    expect(JSON.stringify(breakerStatements)).not.toContain(exportLogicalId);
  });

  describe('the staged asset really carries what a night needs', () => {
    const owned = ['WRITE_STORE_TABLE', 'SITE_BUCKET'] as const;
    let saved: Record<string, string | undefined>;
    beforeEach(() => {
      saved = Object.fromEntries(owned.map((name) => [name, process.env[name]]));
    });
    afterEach(() => {
      for (const name of owned) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    });

    it('packages the launch seeds beside the bundle and lets the real composition root load them from the staged asset', async () => {
      const [, resource] = exportFunction();
      const code = resource.Properties?.Code as Properties;
      const s3Key = String(code.S3Key);
      const assetDirectory = resolve(cloudAssembly.directory, `asset.${s3Key.slice(0, -'.zip'.length)}`);
      expect(existsSync(resolve(assetDirectory, 'observation-export.mjs'))).toBe(true);
      expect(existsSync(resolve(assetDirectory, 'data/spots/pa-pacific.yaml'))).toBe(true);
      expect(existsSync(resolve(assetDirectory, 'data/spots/pa-pacific-launch-v1.json'))).toBe(true);

      // The proof that matters: the BUNDLED composition root, invoked from the
      // staged asset with no injected paths, resolves the seeds it shipped
      // with. This is exactly what the 00:30Z tick will do on a night nobody
      // is watching.
      process.env['WRITE_STORE_TABLE'] = 'surfs-up-panama-write-store';
      process.env['SITE_BUCKET'] = siteBucketName;
      const bundle = await import(pathToFileURL(resolve(assetDirectory, 'observation-export.mjs')).href) as
        typeof import('../../src/export/aws-lambda-adapter.js');
      const deps = await bundle.createComposition();
      expect(deps.spots.length).toBeGreaterThan(0);
      expect(deps.spots.every((spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lon))).toBe(true);
    });
  });
});
