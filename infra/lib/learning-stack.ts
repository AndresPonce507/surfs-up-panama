// The declaration-stage learning stack. It owns schedules and IAM fences,
// not the missing observation-export producer or a deployment authority.
// Accordingly its inline handler fails closed: a deployment cannot be
// mistaken for a working learning run before those prerequisites are met.

import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import type { Construct } from 'constructs';

import { learningJobDeclarations } from './guardrail-declarations.js';
import { functionNames, siteBucketName } from './physical-names.js';

const learningMemoryMb = Number(learningJobDeclarations['learning-function-memory-mb']);
const nightlyWriteScopes = learningJobDeclarations['learning-nightly-write-scope'].split(',').filter(Boolean);
const monthlyWriteScopes = learningJobDeclarations['learning-monthly-write-scope'].split(',').filter(Boolean);
const deniedWriteComplement = learningJobDeclarations['learning-write-complement-denied'].split(',').filter(Boolean);

// The labels in learningJobDeclarations are the feature's stable observable
// contract. These UTC expressions are the deployable realization: the
// nightly run has completed before the first morning build, while the monthly
// run occurs on the first morning of each month.
export const learningScheduleExpressions = {
  nightly: 'cron(0 5 * * ? *)',
  monthly: 'cron(0 5 1 * ? *)',
} as const;

export const learningReservedConcurrency = 1;
export const learningTimeoutSeconds = 120;

const blockedUntilPrerequisitesExist = lambda.Code.fromInline(
  "exports.handler = async () => { throw new Error('learning job deployment is blocked until the observation export and CloudFormation authority exist'); };",
);

function learningFunction(
  scope: Construct,
  id: string,
  functionName: string,
): lambda.Function {
  return new lambda.Function(scope, id, {
    functionName,
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.ARM_64,
    handler: 'index.handler',
    code: blockedUntilPrerequisitesExist,
    memorySize: learningMemoryMb,
    timeout: Duration.seconds(learningTimeoutSeconds),
    reservedConcurrentExecutions: learningReservedConcurrency,
    logGroup: new logs.LogGroup(scope, `${id}Logs`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    }),
  });
}

function grantWriteFence(
  fn: lambda.Function,
  bucket: s3.IBucket,
  allowedPrefixes: readonly string[],
): void {
  fn.addToRolePolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['s3:PutObject'],
    resources: allowedPrefixes.map((prefix) => bucket.arnForObjects(`${prefix}*`)),
  }));
  fn.addToRolePolicy(new iam.PolicyStatement({
    effect: iam.Effect.DENY,
    actions: ['s3:PutObject'],
    resources: deniedWriteComplement.map((prefix) => bucket.arnForObjects(`${prefix}*`)),
  }));
}

export class LearningStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketName(this, 'SiteBucket', siteBucketName);
    const nightly = learningFunction(this, 'Nightly', functionNames['learning-nightly']);
    const monthly = learningFunction(this, 'Monthly', functionNames['learning-monthly']);

    // The input universe is closed by 06-learning-layer.md section 2. No
    // DynamoDB grant appears here: the observation export is the boundary.
    for (const fn of [nightly, monthly]) {
      bucket.grantRead(fn, 'predictions/v1/*');
      bucket.grantRead(fn, 'log/observations/v1/*');
      bucket.grantRead(fn, 'log/calls/v1/*');
      bucket.grantRead(fn, 'data/config/trust-gate.json');
      bucket.grantRead(fn, 'learned/overrides/v1/reporter-weights.json');
      fn.configureAsyncInvoke({ retryAttempts: 0 });
    }
    grantWriteFence(nightly, bucket, nightlyWriteScopes);
    grantWriteFence(monthly, bucket, monthlyWriteScopes);

    const schedulerRole = new iam.Role(this, 'SchedulerInvokeRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Lets EventBridge Scheduler invoke the two learning jobs, nothing else',
    });
    nightly.grantInvoke(schedulerRole);
    monthly.grantInvoke(schedulerRole);

    new scheduler.CfnSchedule(this, 'NightlySchedule', {
      name: 'surfs-up-panama-learning-nightly',
      description: learningJobDeclarations['learning-nightly-schedule'],
      scheduleExpression: learningScheduleExpressions.nightly,
      scheduleExpressionTimezone: 'UTC',
      state: 'ENABLED',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: nightly.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({ job: 'learning-nightly' }),
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
    new scheduler.CfnSchedule(this, 'MonthlySchedule', {
      name: 'surfs-up-panama-learning-monthly',
      description: learningJobDeclarations['learning-monthly-schedule'],
      scheduleExpression: learningScheduleExpressions.monthly,
      scheduleExpressionTimezone: 'UTC',
      state: 'ENABLED',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: monthly.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({ job: 'learning-monthly' }),
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
  }
}
