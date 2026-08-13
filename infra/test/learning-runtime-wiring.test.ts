import { App } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';

import { LearningStack } from '../lib/learning-stack.js';

type Resource = Readonly<{ readonly Type?: string; readonly Properties?: Readonly<Record<string, unknown>> }>;

function stackResources(): readonly Resource[] {
  const app = new App();
  const stack = new LearningStack(app, 'LearningRuntime');
  const template = app.synth().getStackArtifact(stack.artifactId).template as {
    readonly Resources?: Readonly<Record<string, Resource>>;
  };
  return Object.values(template.Resources ?? {});
}

function policyStatementsFor(resources: readonly Resource[], functionName: string): readonly Readonly<Record<string, unknown>>[] {
  const functionResource = resources.find((resource) =>
    resource.Type === 'AWS::Lambda::Function' && resource.Properties?.FunctionName === functionName,
  );
  const targetRole = (functionResource?.Properties?.Role as Readonly<Record<string, unknown>> | undefined)?.['Fn::GetAtt'] as readonly unknown[] | undefined;
  const roleId = targetRole?.[0];
  if (typeof roleId !== 'string') throw new Error(`missing Lambda role for ${functionName}`);
  return resources
    .filter((resource) => resource.Type === 'AWS::IAM::Policy')
    .filter((resource) => ((resource.Properties?.Roles as readonly Readonly<Record<string, unknown>>[] | undefined) ?? [])
      .some((role) => role.Ref === roleId))
    .flatMap((resource) => ((resource.Properties?.PolicyDocument as Readonly<Record<string, unknown>> | undefined)?.Statement as readonly Readonly<Record<string, unknown>>[] | undefined) ?? []);
}

describe('learning runtime deployment fence', () => {
  it('deploys two disabled, bounded schedule targets rather than activating a data claim before live gates exist', () => {
    const schedules = stackResources().filter((resource) => resource.Type === 'AWS::Scheduler::Schedule');

    expect(schedules).toHaveLength(2);
    expect(schedules.map((schedule) => schedule.Properties?.State)).toEqual(['DISABLED', 'DISABLED']);
    expect(schedules.map((schedule) => schedule.Properties?.ScheduleExpression)).toEqual([
      'cron(45 0 * * ? *)',
      'cron(5 1 1 * ? *)',
    ]);
  });

  it('keeps nightly correction writes and monthly metrics writes in separate S3-only roles, with no DynamoDB authority', () => {
    const resources = stackResources();
    const nightly = policyStatementsFor(resources, 'surfs-up-panama-learning-fit');
    const monthly = policyStatementsFor(resources, 'surfs-up-panama-learning-evaluate');
    const nightlyJson = JSON.stringify(nightly);
    const monthlyJson = JSON.stringify(monthly);

    expect(nightlyJson).toContain('predictions/v1/*');
    expect(nightlyJson).toContain('log/observations/v1/*');
    expect(nightlyJson).toContain('log/calls/v1/*');
    expect(nightlyJson).toContain('learned/overrides/v1/reporter-weights.json');
    expect(nightlyJson).toContain('learned/corrections/v1/*');
    expect(nightlyJson).not.toContain('learned/metrics/v1/*');
    expect(monthlyJson).toContain('learned/corrections/v1/current/*');
    expect(monthlyJson).toContain('learned/metrics/v1/*');
    expect(monthlyJson).not.toContain('learned/overrides/v1/reporter-weights.json');
    expect(monthlyJson).not.toContain('learned/corrections/v1/history');
    expect(`${nightlyJson}${monthlyJson}`).not.toMatch(/dynamodb/i);
    expect(`${nightlyJson}${monthlyJson}`).not.toMatch(/s3:DeleteObject|s3:PutObject\*/);
  });

  it('exposes no Lambda URL, so only the disabled scheduler roles can invoke learning', () => {
    const urls = stackResources().filter((resource) => resource.Type === 'AWS::Lambda::Url');
    expect(urls).toEqual([]);
  });
});
