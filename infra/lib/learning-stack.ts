// IAM-fenced scheduled runtime for the learning core. The schedules are
// intentionally disabled at launch: immutable live reports must first earn
// every correction gate before a deployment can make a durable data claim.

import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

import { projectAccountId, projectRegion, siteBucketName } from './physical-names.js';

const learningEntry = fileURLToPath(new URL('../../src/learning/learning-lambda-adapter.ts', import.meta.url));
const learningFunctionNames = {
  fit: 'surfs-up-panama-learning-fit',
  evaluate: 'surfs-up-panama-learning-evaluate',
} as const;

const immutableLearningInputs = [
  'predictions/v1/*',
  'log/observations/v1/*',
  'log/calls/v1/*',
] as const;

const launchScheduleState = 'DISABLED' as const;

export class LearningStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketName(this, 'SiteBucket', siteBucketName);
    const fit = this.scheduledFunction('Fit', learningFunctionNames.fit);
    const evaluate = this.scheduledFunction('Evaluate', learningFunctionNames.evaluate);

    this.grantNightlyFitAccess(fit, bucket);
    this.grantMonthlyEvaluationAccess(evaluate, bucket);
    this.addSchedule('NightlyFitSchedule', {
      name: 'surfs-up-panama-learning-nightly',
      description: 'Disabled until immutable live reports earn correction gates; nightly fit at 00:45 UTC when reviewed',
      expression: 'cron(45 0 * * ? *)',
      job: 'nightly-fit',
      target: fit,
    });
    this.addSchedule('MonthlyEvaluationSchedule', {
      name: 'surfs-up-panama-learning-monthly',
      description: 'Disabled until reviewed; monthly metrics-only evaluation at 01:05 UTC on day 1',
      expression: 'cron(5 1 1 * ? *)',
      job: 'monthly-evaluation',
      target: evaluate,
    });
  }

  private scheduledFunction(id: string, functionName: string): nodejs.NodejsFunction {
    const logGroup = new logs.LogGroup(this, `${id}Logs`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const function_ = new nodejs.NodejsFunction(this, id, {
      functionName,
      entry: learningEntry,
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(120),
      reservedConcurrentExecutions: 1,
      logGroup,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        externalModules: ['@aws-sdk/*'],
      },
      environment: { SITE_BUCKET: siteBucketName },
    });
    function_.configureAsyncInvoke({ retryAttempts: 0 });
    return function_;
  }

  private grantNightlyFitAccess(function_: nodejs.NodejsFunction, bucket: s3.IBucket): void {
    grantLearningReads(function_, bucket, [
      ...immutableLearningInputs,
      'learned/overrides/v1/reporter-weights.json',
    ]);
    function_.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [bucket.arnForObjects('learned/corrections/v1/*')],
    }));
  }

  private grantMonthlyEvaluationAccess(function_: nodejs.NodejsFunction, bucket: s3.IBucket): void {
    grantLearningReads(function_, bucket, [
      ...immutableLearningInputs,
      'learned/corrections/v1/current/*',
    ]);
    function_.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [bucket.arnForObjects('learned/metrics/v1/*')],
    }));
  }

  private addSchedule(
    id: string,
    input: Readonly<{
      name: string;
      description: string;
      expression: string;
      job: 'nightly-fit' | 'monthly-evaluation';
      target: lambda.IFunction;
    }>,
  ): void {
    const invokeRole = new iam.Role(this, `${id}InvokeRole`, {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: `Lets EventBridge Scheduler invoke only ${input.name}`,
    });
    input.target.grantInvoke(invokeRole);
    new scheduler.CfnSchedule(this, id, {
      name: input.name,
      description: input.description,
      scheduleExpression: input.expression,
      scheduleExpressionTimezone: 'UTC',
      state: launchScheduleState,
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: input.target.functionArn,
        roleArn: invokeRole.roleArn,
        input: JSON.stringify({ job: input.job }),
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
  }
}

function grantLearningReads(
  function_: nodejs.NodejsFunction,
  bucket: s3.IBucket,
  prefixes: readonly string[],
): void {
  function_.addToRolePolicy(new iam.PolicyStatement({
    actions: ['s3:GetObject'],
    resources: prefixes.map((prefix) => bucket.arnForObjects(prefix)),
  }));
  function_.addToRolePolicy(new iam.PolicyStatement({
    actions: ['s3:ListBucket'],
    resources: [bucket.bucketArn],
    conditions: { StringLike: { 's3:prefix': prefixes } },
  }));
}

export const learningStackEnvironment = {
  account: projectAccountId,
  region: projectRegion,
};
