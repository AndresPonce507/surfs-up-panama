// Regression test for a real production incident: the Fetch Lambda's handler
// calls IngestStore.listPredictions (S3Store.list, ListObjectsV2), but the
// stack only ever granted PutObject on raw/predictions/probes. Every hourly
// invocation crashed with AccessDenied on s3:ListBucket from the moment the
// stack deployed (2026-08-11) until this fix. Confirmed live via
// /aws/lambda/surfs-up-panama-fetch logs.

import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { ingestStack } from '../bin/app.js';
import { functionNames } from '../lib/physical-names.js';

type Properties = Readonly<Record<string, unknown>>;
type Resource = Readonly<{ readonly Type?: string; readonly Properties?: Properties }>;
type TemplateJson = Readonly<{ readonly Resources?: Readonly<Record<string, Resource>> }>;

const template = Template.fromStack(ingestStack).toJSON() as TemplateJson;
const resources = Object.entries(template.Resources ?? {});

function policyStatementsFor(functionName: string): readonly Properties[] {
  const [, target] = resources
    .filter(([, resource]) => resource.Type === 'AWS::Lambda::Function')
    .find(([, resource]) => resource.Properties?.FunctionName === functionName) ?? [];
  if (target === undefined) throw new Error(`missing Lambda ${functionName}`);
  const targetRole = ((target.Properties?.Role as Properties | undefined)?.['Fn::GetAtt'] as readonly unknown[] | undefined)?.[0];
  if (typeof targetRole !== 'string') throw new Error(`missing role for ${functionName}`);
  return resources
    .filter(([, resource]) => resource.Type === 'AWS::IAM::Policy')
    .filter(([, resource]) => ((resource.Properties?.Roles as readonly Properties[] | undefined) ?? []).some((role) => role.Ref === targetRole))
    .flatMap(([, resource]) => ((resource.Properties?.PolicyDocument as Properties | undefined)?.Statement as readonly Properties[] | undefined) ?? []);
}

function actionSet(statements: readonly Properties[]): string[] {
  return statements.flatMap((statement) => {
    const action = statement.Action;
    return Array.isArray(action) ? action : typeof action === 'string' ? [action] : [];
  });
}

describe('Fetch Lambda IAM permissions', () => {
  it('grants s3:List* (covers ListBucket) so IngestStore.listPredictions (S3Store.list -> ListObjectsV2) does not crash', () => {
    const actions = actionSet(policyStatementsFor(functionNames.fetch));
    expect(actions).toEqual(expect.arrayContaining(['s3:List*']));
  });

  it('grants s3:GetObject* so IngestStore.getPrediction (frozen-cycle re-read) does not crash', () => {
    const actions = actionSet(policyStatementsFor(functionNames.fetch));
    expect(actions).toEqual(expect.arrayContaining(['s3:GetObject*']));
  });
});

// The Publisher reads the prior durable surface before it can render a new
// public site. S3 deliberately masks an absent object as AccessDenied unless
// the reader may list its exact prefix, so the first production publication
// needs this narrow bucket-level permission as well as GetObject.
describe('Publisher missing-state IAM permission', () => {
  it('grants only the two prefixes needed to distinguish an absent bundle or durable surface from a denied read', () => {
    const statements = policyStatementsFor(functionNames.publish);
    const scopedList = statements.find((statement) => {
      const actions = actionSet([statement]);
      return actions.includes('s3:ListBucket');
    });

    expect(scopedList).toBeDefined();
    expect(JSON.stringify(scopedList?.Condition ?? {})).toContain('v1/*');
    expect(JSON.stringify(scopedList?.Condition ?? {})).toContain('site/published-surface.json');
  });
});

// Same S3 failure family, write side: without ListBucket on the site bucket,
// a missing v1/meta/spot-index.json read surfaces as AccessDenied instead
// of NoSuchKey and 502s every report. Proven falsifiable by removing the
// report-fn ListBucket statement and watching this fail.
import { describe as describeWrite, expect as expectWrite, it as itWrite } from 'vitest';
import { Template as WriteTemplate } from 'aws-cdk-lib/assertions';
import { App as WriteApp } from 'aws-cdk-lib';
import { WriteStack } from '../lib/write-stack.js';

describeWrite('report fn site-bucket list permission', () => {
  itWrite('grants scoped s3:ListBucket so missing keys read as NoSuchKey', () => {
    const app = new WriteApp();
    const stack = new WriteStack(app, 'TestWrite');
    const template = WriteTemplate.fromStack(stack);
    const policies = template.findResources('AWS::IAM::Policy');
    const hasScopedList = Object.values(policies).some((policy) => {
      const statements = (policy.Properties as { PolicyDocument: { Statement: Array<Record<string, unknown>> } }).PolicyDocument.Statement;
      return statements.some((statement) =>
        JSON.stringify(statement.Action).includes('s3:ListBucket')
        && JSON.stringify(statement.Condition ?? {}).includes('v1/*'));
    });
    expectWrite(hasScopedList).toBe(true);
    expectWrite(JSON.stringify(policies)).not.toContain('pub/v1/*');
  });
});
