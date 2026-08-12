// Reviewed limits imported by the credential-free CDK synthesis app.

import { Duration, Fn, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

import { functionNames, metricNamespace, siteBucketName, siteOriginExportName } from './physical-names.js';
import {
  BUILD_SUCCESS_EVENT,
  CYCLE_FROZEN_EVENT,
  INGEST_SUCCESS_EVENT,
  PROVIDER_ERROR_EVENT,
} from '../../src/pipeline/lambda/log-events.js';

// The two Lambda composition roots this stack deploys. Real pipeline code
// (src/pipeline/ingest.ts, src/pipeline/build.ts), wired to real adapters at
// these two files only -- see their own top comments for the honesty
// contract (ingest.success / build.success are never logged unless the run
// actually did the work).
const fetchHandlerEntry = fileURLToPath(new URL('../../src/pipeline/lambda/fetch-handler.ts', import.meta.url));
const buildHandlerEntry = fileURLToPath(new URL('../../src/pipeline/lambda/build-handler.ts', import.meta.url));

// loadLaunchSpotSeeds() / loadLaunchSpotCoordinates() both `readFileSync`
// these two git-owned data files at runtime (src/pipeline/lambda/
// bundled-launch-seed-paths.ts resolves them relative to the bundled
// handler's own location, never process.cwd()). esbuild only follows
// `import`, never a runtime `readFileSync` path, so this copy step is the
// one place that actually gets them into each function's deployment
// package. `inputDir` here is the whole project root (NodejsFunction's
// auto-detected bundling root, proven by a throwaway local synth spike
// before this counted), never the entry file's own directory.
function copyLaunchSeedFiles(inputDir: string, outputDir: string): string[] {
  // The handlers resolve the canonical package-relative layout
  // `data/spots/...`; copying the directory *into* data preserves that
  // segment. Do not copy the entire mutable data/ tree: prediction captures
  // and published projections are not Lambda configuration inputs.
  return [
    `mkdir -p ${outputDir}/data`,
    `cp -R ${inputDir}/data/spots ${outputDir}/data/spots`,
  ];
}

const pipelineLambdaBundling: nodejs.BundlingOptions = {
  format: nodejs.OutputFormat.ESM,
  // Build inside CDK's Lambda-compatible Docker image. Host staging can
  // silently emit a Darwin package, while both deployed functions are ARM64.
  forceDockerBundling: true,
  // Node 22's Lambda runtime already carries the AWS SDK v3; bundling it too
  // would cost real deployed-bundle size for nothing.
  externalModules: ['@aws-sdk/*'],
  commandHooks: {
    beforeBundling: () => [],
    beforeInstall: () => [],
    afterBundling: copyLaunchSeedFiles,
  },
};

export const lambdaReservedConcurrency = 2;

export const lambdaTimeoutSeconds = {
  fetch: 60,
  build: 120,
  report: 5,
  mint: 5,
  push: 5,
  notify: 120, // the send fan-out, covered by the `timeout-notify-export` guardrail row
  'photo-presign': 5,
  resize: 60,
  dispatcher: 10,
  'notify-export': 120,
  breaker: 10,
} as const;

// The real scheduled-ingest stack: EventBridge Scheduler (hourly at :17 for
// fetch, :22 for build) into the fetch and build Lambdas, with metric
// filters that feed the dead-man's switch. system-architecture.md sections
// 3, 7, 10, 11.
//
// Fetch and Build run the real pipeline code
// (src/pipeline/lambda/{fetch,build}-handler.ts, wiring src/pipeline/ingest.ts
// and src/pipeline/build.ts to real Open-Meteo + S3 adapters). The honesty
// property the former placeholder existed to protect is preserved by
// construction, not by comment: `ingest.success` and `build.success` are
// only ever logged by deriveIngestLogLines / deriveBuildLogLines
// (src/pipeline/lambda/log-events.ts), which withhold them unless the run
// actually did the work. Copy never runs ahead of the data.
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

    const fetchFn = new nodejs.NodejsFunction(this, 'Fetch', {
      functionName: functionNames.fetch,
      entry: fetchHandlerEntry,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      bundling: pipelineLambdaBundling,
      memorySize: 512,
      timeout: Duration.seconds(lambdaTimeoutSeconds.fetch), // guardrail 2
      reservedConcurrentExecutions: lambdaReservedConcurrency, // guardrail 1
      logGroup: fetchLogs,
      environment: { BUCKET_NAME: bucket.bucketName },
    });
    const buildFn = new nodejs.NodejsFunction(this, 'Build', {
      functionName: functionNames.build,
      entry: buildHandlerEntry,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      bundling: pipelineLambdaBundling,
      memorySize: 1024,
      timeout: Duration.seconds(lambdaTimeoutSeconds.build), // guardrail 2
      reservedConcurrentExecutions: lambdaReservedConcurrency, // guardrail 1
      logGroup: buildLogs,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        PUBLIC_SITE_ORIGIN: Fn.importValue(siteOriginExportName),
      },
    });

    // Duplicate EventBridge delivery must be a no-op and must not double-bill
    // (research 08 section 10.5): runIngestOnce's S3 conditional PUT
    // (If-None-Match: *) and runBuildOnce's putCallIfAbsent already make a
    // retried invocation idempotent, so a Lambda-level retry would only ever
    // repeat work, never recover anything.
    fetchFn.configureAsyncInvoke({ retryAttempts: 0 });
    buildFn.configureAsyncInvoke({ retryAttempts: 0 });

    // Least privilege, and never a delete: fetch writes raw archive and the
    // prediction log only; build reads everything and writes the published
    // surfaces. The prediction log grant matches PREDICTION_LOG_PREFIX
    // (system-architecture.md section 5).
    bucket.grantPut(fetchFn, 'raw/*');
    bucket.grantPut(fetchFn, 'predictions/*');
    bucket.grantPut(fetchFn, 'probes/*');
    // Fetch also reads its own prediction log back (ingest.ts frozen-cycle
    // detection: list the day's keys, then re-fetch the latest to compare).
    bucket.grantRead(fetchFn, 'predictions/*');
    bucket.grantRead(buildFn, 'predictions/*');
    bucket.grantRead(buildFn, 'learned/corrections/*');
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
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', INGEST_SUCCESS_EVENT),
      metricNamespace,
      metricName: 'IngestSuccess',
      metricValue: '1',
    });
    new logs.MetricFilter(this, 'ProviderErrorsFilter', {
      logGroup: fetchLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', PROVIDER_ERROR_EVENT),
      metricNamespace,
      metricName: 'ProviderErrors',
      metricValue: '1',
    });
    new logs.MetricFilter(this, 'WindSourceErrorsFilter', {
      logGroup: fetchLogs,
      filterPattern: logs.FilterPattern.all(
        logs.FilterPattern.stringValue('$.event', '=', PROVIDER_ERROR_EVENT),
        logs.FilterPattern.stringValue('$.source', '=', 'wind'),
      ),
      metricNamespace,
      metricName: 'WindSourceErrors',
      metricValue: '1',
    });
    new logs.MetricFilter(this, 'FrozenCycleFilter', {
      logGroup: fetchLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', CYCLE_FROZEN_EVENT),
      metricNamespace,
      metricName: 'FrozenCycles',
      metricValue: '1',
    });
    new logs.MetricFilter(this, 'BuildSuccessFilter', {
      logGroup: buildLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', BUILD_SUCCESS_EVENT),
      metricNamespace,
      metricName: 'BuildSuccess',
      metricValue: '1',
    });

    // EventBridge Scheduler: fetch hourly at :17, build hourly at :22
    // (system-architecture.md section 3; 04-ingest-pipeline.md section 3
    // steps 1-11 -- build reads what fetch already committed, offset five
    // minutes so a run always has this hour's snapshot to read). The 4x/day
    // model-refresh cadence is a payload refinement owned by the ingest
    // feature; the hourly schedule is the pinned infrastructure contract.
    const schedulerRole = new iam.Role(this, 'SchedulerInvokeRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Lets EventBridge Scheduler invoke the fetch and build functions, nothing else',
    });
    fetchFn.grantInvoke(schedulerRole);
    buildFn.grantInvoke(schedulerRole);
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
    new scheduler.CfnSchedule(this, 'BuildSchedule', {
      name: 'surfs-up-panama-build-hourly',
      description: 'Hourly build at :22, five minutes after fetch',
      scheduleExpression: 'cron(22 * * * ? *)',
      scheduleExpressionTimezone: 'UTC',
      state: 'ENABLED',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: buildFn.functionArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({ job: 'hourly' }),
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });
  }
}
