// Focused proof for Slice 03.  The existing guardrail suite owns system-wide
// cost limits; this file keeps the report/mint composition and least-privilege
// boundary honest without asserting unrelated stack details.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { writeStack } from '../bin/app.js';
import { functionNames, projectAccountId, projectRegion, siteBucketName } from '../lib/physical-names.js';

type Properties = Readonly<Record<string, unknown>>;
type Resource = Readonly<{ readonly Type?: string; readonly Properties?: Properties }>;
type TemplateJson = Readonly<{ readonly Resources?: Readonly<Record<string, Resource>> }>;

const template = Template.fromStack(writeStack).toJSON() as TemplateJson;
const resources = Object.entries(template.Resources ?? {});

function functions() {
  return resources.filter(([, resource]) => resource.Type === 'AWS::Lambda::Function');
}

function policyStatementsFor(functionName: string): readonly Properties[] {
  const [, target] = functions().find(([, resource]) => resource.Properties?.FunctionName === functionName) ?? [];
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
  }).sort();
}

describe('report/mint Lambda composition', () => {
  it('ships the built shared-core adapter for report and mint while the later write URLs remain fail-closed', () => {
    const report = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames.report)?.[1].Properties;
    const mint = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames.mint)?.[1].Properties;
    const push = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames.push)?.[1].Properties;
    const presign = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames['photo-presign'])?.[1].Properties;
    expect(report?.Handler).toBe('report-mint.handler');
    expect(mint?.Handler).toBe('report-mint.handler');
    expect(JSON.stringify(push?.Code)).toContain('not_implemented');
    expect(JSON.stringify(presign?.Code)).toContain('not_implemented');
    const asset = readFileSync(resolve(import.meta.dirname, '../lambda-src/report-mint.mjs'), 'utf8');
    expect(asset).toContain('createWriteLambda');
    expect(asset).toContain('createAwsWriteStore');
    expect(asset).toContain('resolveReportReveal');
    expect(asset).toContain('requireProvisionedTable');
    expect(asset).not.toContain('not_implemented');
  });

  it('allows the credential header and only the 24-hour CORS contract on all four write URLs', () => {
    const urls = resources.filter(([, resource]) => resource.Type === 'AWS::Lambda::Url');
    expect(urls).toHaveLength(4);
    for (const [, resource] of urls) {
      const cors = resource.Properties?.Cors as Properties;
      expect(cors.AllowHeaders).toEqual(['content-type', 'x-surf-credential']);
      expect(cors.MaxAge).toBe(86_400);
    }
  });

  it('gives report exactly DynamoDB report operations, read-only S3 objects, and its one credential parameter', () => {
    const statements = policyStatementsFor(functionNames.report);
    const actions = actionSet(statements);
    expect(actions).toEqual(expect.arrayContaining([
      'dynamodb:DescribeTable', 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem', 's3:GetObject', 'ssm:GetParameter',
    ]));
    expect(actions).not.toEqual(expect.arrayContaining(['dynamodb:PutItem', 's3:PutObject', 'ssm:PutParameter', 'dynamodb:Scan']));
    const rendered = JSON.stringify(statements);
    expect(rendered).toContain(siteBucketName);
    expect(rendered).toContain('pub/v1/meta/spot-index.json');
    expect(rendered).toContain('log/calls/v1/*');
    expect(rendered).toContain(`arn:aws:ssm:${projectRegion}:${projectAccountId}:parameter/surfsuppanama/prod/credential-hmac-key`);
  });

  it('gives mint only its credential ledger and HMAC parameter, with no S3 or report transaction capability', () => {
    const actions = actionSet(policyStatementsFor(functionNames.mint));
    expect(actions).toEqual(expect.arrayContaining(['dynamodb:DescribeTable', 'dynamodb:GetItem', 'dynamodb:PutItem', 'ssm:GetParameter']));
    expect(actions).not.toEqual(expect.arrayContaining(['dynamodb:TransactWriteItems', 'dynamodb:UpdateItem', 's3:GetObject', 's3:PutObject']));
  });
});
