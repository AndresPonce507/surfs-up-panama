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
  PUBLISH_SUCCESS_EVENT,
} from '../../src/pipeline/lambda/log-events.js';

// The three Lambda composition roots this stack deploys. Real pipeline code
// (src/pipeline/ingest.ts, src/pipeline/build.ts), wired to real adapters at
// these files only -- see their own top comments for the honesty contract
// (ingest.success / build.success / publish.success are never logged unless
// the run actually did the work).
const fetchHandlerEntry = fileURLToPath(new URL('../../src/pipeline/lambda/fetch-handler.ts', import.meta.url));
const buildHandlerEntry = fileURLToPath(new URL('../../src/pipeline/lambda/build-handler.ts', import.meta.url));

// The Publisher ships as a container image carrying the repository and its
// installed dependencies (adr-weather-to-site-bridge.md decision), never a
// zip bundle: `npm run build` needs the project tree and its real
// node_modules (vite plugins, a platform-specific esbuild binary), which
// esbuild cannot bundle. The build context is the repository root, exactly
// where infra/lambda-images/publisher/Dockerfile's own header says it must
// be -- never this infra/lib/ subdirectory.
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

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
  // Build now waits synchronously for the Publisher's whole answer: its own
  // ~2 min of work plus the Publisher's reviewed 300 s bound (guardrail
  // declaration `timeout-build`, adr-weather-to-site-bridge.md
  // "Consequences"; moved 120 -> 420 in the same commit as this seam).
  build: 420,
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

// The Publisher's own hard bound, reserved concurrency and package. Not a
// `guardrailDeclarations` `timeout-*` row on purpose: `infra/bin/app.ts`
// synthesizes one placeholder function per such row at the single global
// `lambda-reserved-concurrency`, which would misdeclare the Publisher as
// running two cycles at once when it really runs exactly one. The
// Publisher's bound is proven where the ADR and the deployment-plan
// scenarios ask for it: in the real IngestStack declaration below.
const publisherTimeoutSeconds = 300;
const publisherReservedConcurrency = 1;

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
    const publishLogs = new logs.LogGroup(this, 'PublishLogs', {
      logGroupName: `/aws/lambda/${functionNames.publish}`,
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
        // The Publisher's physical name, so build-handler's
        // defaultInvokePublisher can address its synchronous handoff
        // (review blocker HIGH-1: without this the Publisher has no
        // caller). The same single source of truth as functionName below.
        PUBLISH_FUNCTION_NAME: functionNames.publish,
      },
    });

    // The bounded Publisher (adr-weather-to-site-bridge.md decision): a
    // container-image function beside Build, same stack, same processor
    // family. Its only path in is Build's synchronous invoke below -- no
    // schedule, no S3 event, no queue anywhere.
    const publishFn = new lambda.DockerImageFunction(this, 'Publish', {
      functionName: functionNames.publish,
      code: lambda.DockerImageCode.fromImageAsset(repositoryRoot, {
        file: 'infra/lambda-images/publisher/Dockerfile',
      }),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1536, // headroom for one Astro build inside the writable /tmp render copy
      timeout: Duration.seconds(publisherTimeoutSeconds),
      reservedConcurrentExecutions: publisherReservedConcurrency,
      logGroup: publishLogs,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        PUBLIC_SITE_ORIGIN: Fn.importValue(siteOriginExportName),
      },
    });

    // Duplicate EventBridge delivery must be a no-op and must not double-bill
    // (research 08 section 10.5): runIngestOnce's S3 conditional PUT
    // (If-None-Match: *) and runBuildOnce's putCallIfAbsent already make a
    // retried invocation idempotent, so a Lambda-level retry would only ever
    // repeat work, never recover anything. The Publisher's writes are
    // PUT-only and additive, so a retried invocation would only ever repeat
    // work too -- the next hourly cycle already self-heals a failed one.
    fetchFn.configureAsyncInvoke({ retryAttempts: 0 });
    buildFn.configureAsyncInvoke({ retryAttempts: 0 });
    publishFn.configureAsyncInvoke({ retryAttempts: 0 });

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

    // Build is the only thing that may start the Publisher (ADR: "one
    // invocation per hourly Build cycle. No schedule of its own, no S3
    // event, no queue, no new trigger type of any kind").
    publishFn.grantInvoke(buildFn);

    // The Publisher's own least privilege: read-only on the region bundle it
    // was handed and the durable archive of the previous surface, put-only
    // on everything it publishes. Deliberately NOT bucket.grantRead(): that
    // helper expands to s3:GetObject*, s3:GetBucket* AND s3:List*
    // (aws-cdk-lib/aws-s3/lib/perms.js), and the charter forbids any List
    // action on this function -- it walks the pages it just rendered and
    // puts each one, it never asks the store what is already there. The
    // bundle Build hands over is `pub/v1/regions/${REGION_ID}/bundle.json`;
    // S3Store's key mapping strips the `pub/` root, so the physical prefix
    // this grant needs is `v1/*`.
    publishFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [
        bucket.arnForObjects('v1/*'),
        bucket.arnForObjects('site/published-surface.json'),
      ],
    }));
    // grantPut is the safe helper here: it grants only s3:PutObject* and
    // s3:Abort*, never List or Delete. It covers both the durable archive
    // write-back and every published route key the render emits -- an
    // open-ended, content-driven set (spot pages, category pages, static
    // assets) that cannot be safely enumerated as a fixed prefix list
    // without becoming exactly the kind of drift this project treats as its
    // worst shipped bug.
    bucket.grantPut(publishFn);
    // "Nothing existing widens" (ADR consequences): the unscoped grant above
    // must not let the Publisher overwrite data it never writes and does not
    // own -- Fetch's raw archive and prediction log, its probes, member
    // photos, the learned corrections Build reads, and (the platform
    // review's short-term ask) the surfaces Build itself owns: the published
    // JSON surface under v1/*, the call log under log/*, and the root
    // manifest.json the dead-man probe reads. The Publisher's own uploads
    // never touch any of these -- the rendered dist carries
    // manifest.webmanifest, never manifest.json, and no v1/ or log/
    // directory. An explicit Deny is the narrowing tool (IAM evaluates an
    // explicit Deny before any Allow), never s3:DeleteObject* here: that
    // string would fail the "nothing the publisher is allowed to do can
    // erase anything" guardrail, which scans every statement's Action
    // regardless of Effect.
    publishFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['s3:PutObject*'],
      resources: [
        bucket.arnForObjects('raw/*'),
        bucket.arnForObjects('predictions/*'),
        bucket.arnForObjects('probes/*'),
        bucket.arnForObjects('photos/*'),
        bucket.arnForObjects('learned/*'),
        bucket.arnForObjects('v1/*'),
        bucket.arnForObjects('log/*'),
        bucket.arnForObjects('manifest.json'),
      ],
    }));

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
    // PublishSuccess is what the retargeted staleness dead-man watches
    // (observability-stack.ts, decision recorded 2026-08-13 in
    // feature-delta.md): `publish.success` is only ever logged after every
    // PUT completed, so it implies the whole chain -- Build succeeded AND
    // the Publisher finished. BuildSuccessFilter above survives unchanged as
    // a diagnostic-only metric; nothing alarms on it any more.
    new logs.MetricFilter(this, 'PublishSuccessFilter', {
      logGroup: publishLogs,
      filterPattern: logs.FilterPattern.stringValue('$.event', '=', PUBLISH_SUCCESS_EVENT),
      metricNamespace,
      metricName: 'PublishSuccess',
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
      // Description carries a revision marker on purpose: rewriting this
      // resource is how CloudFormation repairs out-of-band state drift (a
      // console-disabled schedule stays disabled until CFN touches the
      // resource again, because ENABLED here matches CFN's stale view).
      description: 'Hourly ingest at :17 (r2, re-enabled 2026-08-12 after incident containment)',
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
      description: 'Hourly build at :22, five minutes after fetch (r2, re-enabled 2026-08-12)',
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
