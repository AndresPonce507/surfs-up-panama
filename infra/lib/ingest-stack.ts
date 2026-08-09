// Reviewed limits imported by the credential-free CDK synthesis app.

import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import type { Construct } from 'constructs';

import { functionNames, metricNamespace, siteBucketName } from './physical-names.js';

export const lambdaReservedConcurrency = 2;

export const lambdaTimeoutSeconds = {
  fetch: 60,
  build: 120,
  report: 5,
  mint: 5,
  push: 5,
  'photo-presign': 5,
  resize: 60,
  dispatcher: 10,
  'notify-export': 120,
  breaker: 10,
} as const;

// The real scheduled-ingest stack: EventBridge Scheduler (hourly at :17) into
// the fetch and build Lambdas, with metric filters that feed the dead-man's
// switch. system-architecture.md sections 3, 7, 10, 11.
//
// The fetch and build handlers are HONEST PLACEHOLDERS: the pipeline
// application code in src/ is not Lambda-wired yet (that wiring belongs to
// the ingest feature's DELIVER lane). The placeholder logs a structured
// `ingest.placeholder` event and deliberately NEVER emits `ingest.success`,
// so the deployed dead-man's switch reports the truth: ingest is not running
// hourly until real pipeline code ships. Copy never runs ahead of the data.
export class IngestStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketName(this, 'SiteBucket', siteBucketName);

    const fetchLogs = new logs.LogGroup(this, 'FetchLogs', {
      logGroupName: `/aws/lambda/${functionNames.fetch}`,
      retention: logs.RetentionDays.TWO_WEEKS, // guardrail 3
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const buildLogs = new logs.LogGroup(this, 'BuildLogs', {
      logGroupName: `/aws/lambda/${functionNames.build}`,
      retention: logs.RetentionDays.TWO_WEEKS, // guardrail 3
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const placeholderCode = lambda.Code.fromInline(
      'exports.handler = async () => {'
      + " console.log(JSON.stringify({ event: 'ingest.placeholder',"
      + " note: 'pipeline application code not yet wired; ingest.success is deliberately not emitted"
      + " so the dead-man alarm reports the truth' }));"
      + ' return { statusCode: 204 }; };',
    );

    const fetchFn = new lambda.Function(this, 'Fetch', {
      functionName: functionNames.fetch,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: placeholderCode,
      memorySize: 512,
      timeout: Duration.seconds(lambdaTimeoutSeconds.fetch), // guardrail 2
      reservedConcurrentExecutions: lambdaReservedConcurrency, // guardrail 1
      logGroup: fetchLogs,
    });
    const buildFn = new lambda.Function(this, 'Build', {
      functionName: functionNames.build,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: placeholderCode,
      memorySize: 1024,
      timeout: Duration.seconds(lambdaTimeoutSeconds.build), // guardrail 2
      reservedConcurrentExecutions: lambdaReservedConcurrency, // guardrail 1
      logGroup: buildLogs,
    });

    // Duplicate EventBridge delivery must be a no-op and must not double-bill
    // (research 08 section 10.5). The DLQ arrives with the real pipeline
    // code, which owns replayability; retrying a placeholder is noise.
    fetchFn.configureAsyncInvoke({ retryAttempts: 0 });
    buildFn.configureAsyncInvoke({ retryAttempts: 0 });

    // Least privilege, and never a delete: fetch writes raw archive and the
    // prediction log only; build reads everything and writes the published
    // surfaces. The prediction log grant matches PREDICTION_LOG_PREFIX
    // (system-architecture.md section 5).
    bucket.grantPut(fetchFn, 'raw/*');
    bucket.grantPut(fetchFn, 'predictions/*');
    bucket.grantRead(buildFn);
    for (const prefix of ['v1/*', 'site/*', 'assets/*', 'log/*', 'manifest.json']) {
      bucket.grantPut(buildFn, prefix);
    }

    // The metric filters are the first link of the dead-man chain: the fetch
    // Lambda emits `ingest.success`, the filter increments IngestSuccess, and
    // the observability stack's alarm watches the METRIC, never the Lambda
    // (04-ingest-pipeline.md section 3 step 8; system-architecture.md
    // section 10 alarm 1).
    new logs.MetricFilter(this, 'IngestSuccessFilter', {
      logGroup: fetchLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', 'ingest.success'),
      metricNamespace,
      metricName: 'IngestSuccess',
      metricValue: '1',
    });
    new logs.MetricFilter(this, 'ProviderErrorsFilter', {
      logGroup: fetchLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', 'provider.error'),
      metricNamespace,
      metricName: 'ProviderErrors',
      metricValue: '1',
    });
    new logs.MetricFilter(this, 'BuildSuccessFilter', {
      logGroup: buildLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', 'build.success'),
      metricNamespace,
      metricName: 'BuildSuccess',
      metricValue: '1',
    });

    // EventBridge Scheduler, hourly at :17 (system-architecture.md section 3).
    // The 4x/day model-refresh cadence is a payload refinement owned by the
    // ingest feature when real pipeline code ships; the hourly schedule is
    // the pinned infrastructure contract.
    const schedulerRole = new iam.Role(this, 'SchedulerInvokeRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Lets EventBridge Scheduler invoke the fetch function, nothing else',
    });
    fetchFn.grantInvoke(schedulerRole);
    new scheduler.CfnSchedule(this, 'HourlySchedule', {
      name: 'surfs-up-panama-hourly',
      description: 'Hourly ingest at :17',
      scheduleExpression: 'cron(17 * * * ? *)',
      scheduleExpressionTimezone: 'UTC',
      state: 'ENABLED',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: fetchFn.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({ job: 'hourly' }),
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
  }
}
