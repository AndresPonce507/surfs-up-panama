// Focused proof for Slice 03.  The existing guardrail suite owns system-wide
// cost limits; this file keeps the report/mint composition and least-privilege
// boundary honest without asserting unrelated stack details.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { writeStack } from '../bin/app.js';
import { functionNames, projectAccountId, projectRegion, siteBucketName } from '../lib/physical-names.js';
import { createCredentialProvider, type Fetcher } from '../../src/report/mint.js';
import { sendSavedReport } from '../../src/report/submit.js';

type Properties = Readonly<Record<string, unknown>>;
type Resource = Readonly<{ readonly Type?: string; readonly Properties?: Properties }>;
type TemplateJson = Readonly<{
  readonly Resources?: Readonly<Record<string, Resource>>;
  readonly Outputs?: Readonly<Record<string, Properties>>;
}>;

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

describe('write Lambda composition', () => {
  it('publishes the three standalone write URLs for the static-site build handoff', () => {
    const outputs = Object.values(template.Outputs ?? {}) as readonly Properties[];
    const reportUrl = outputs.find((output) => output.Description === 'Public report Function URL for the static-site build')?.Value;
    const mintUrl = outputs.find((output) => output.Description === 'Public mint Function URL for the static-site build')?.Value;
    const pushUrl = outputs.find((output) => output.Description === 'Public push Function URL for the static-site build')?.Value;
    expect(reportUrl).toBeDefined();
    expect(mintUrl).toBeDefined();
    expect(pushUrl).toBeDefined();
    expect(JSON.stringify(reportUrl)).toContain('Fn::GetAtt');
    expect(JSON.stringify(mintUrl)).toContain('Fn::GetAtt');
    expect(JSON.stringify(pushUrl)).toContain('Fn::GetAtt');
  });

  it('bundles the credential-bound push adapter at synth time while presign remains fail-closed', () => {
    const report = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames.report)?.[1].Properties;
    const mint = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames.mint)?.[1].Properties;
    const push = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames.push)?.[1].Properties;
    const presign = functions().find(([, resource]) => resource.Properties?.FunctionName === functionNames['photo-presign'])?.[1].Properties;
    expect(report?.Handler).toBe('report-mint.handler');
    expect(mint?.Handler).toBe('report-mint.handler');
    expect(push?.Handler).toBe('push.handler');
    expect(JSON.stringify(push?.Code)).toContain('S3Bucket');
    expect(JSON.stringify(presign?.Code)).toContain('not_implemented');
    expect(existsSync(resolve(import.meta.dirname, '../lambda-src/report-mint.mjs'))).toBe(false);
  });

  it('allows the credential header and only the 24-hour CORS contract on all four write URLs', () => {
    const urls = resources.filter(([, resource]) => resource.Type === 'AWS::Lambda::Url');
    expect(urls).toHaveLength(4);
    for (const [, resource] of urls) {
      const cors = resource.Properties?.Cors as Properties;
      expect(cors.AllowHeaders).toEqual(['cache-control', 'content-type', 'x-surf-credential']);
      expect(cors.MaxAge).toBe(86_400);
    }
  });

  it('never lets the browser client send a request header the write URLs do not allow', async () => {
    // A header outside AllowHeaders makes AWS answer the preflight with no CORS
    // headers at all, so every real browser submit dies before the server sees
    // it while curl smokes stay green. Found live 2026-08-13.
    const sent: Record<string, string>[] = [];
    const stub: Fetcher = async (_path, request) => {
      sent.push({ ...(request.headers as Record<string, string>) });
      return new Response(
        JSON.stringify({ credential: 'c_stub', report_id: 'r_stub', outcome: 'no_snapshot', predicted: null }),
        { status: 200 },
      );
    };
    await createCredentialProvider(stub, 'd_drift', undefined, 'https://mint.invalid/').get();
    await sendSavedReport('{}', 'c_stub', stub, 'https://report.invalid/');
    expect(sent).toHaveLength(2);

    const urls = resources.filter(([, resource]) => resource.Type === 'AWS::Lambda::Url');
    for (const [, resource] of urls) {
      const cors = resource.Properties?.Cors as Properties;
      const allowed = (cors.AllowHeaders as readonly string[]).map((name) => name.toLowerCase());
      for (const headers of sent) {
        for (const name of Object.keys(headers).map((header) => header.toLowerCase())) {
          expect(allowed).toContain(name);
        }
      }
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
