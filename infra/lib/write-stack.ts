// The real write-path stack: four bare Function URLs (auth NONE, exact-origin
// CORS, off CloudFront), DynamoDB PROVISIONED 25/25, the resize function, and
// the circuit breakers. system-architecture.md sections 6 and 11;
// 07-write-path.md section 7.2. Deployed LAST, and only once reserved
// concurrency is known to be settable: if PutFunctionConcurrency is rejected
// at deploy time the applied quota is at or under 102, controls 0.2 and 0.6
// do not exist, and this stack must be rolled back (section 7.2 item 0.15).
//
// Report and mint are real F-TELL-US-WHAT-YOU-SAW-COLD handlers. Push and
// photo-presign remain honest 501 placeholders until their owners land. The
// stack also makes the cost ceiling real: reserved concurrency, breakers, the
// provisioned fail-closed table, and the exact resources the $18 budget line
// trips.

import { CfnOutput, Duration, RemovalPolicy, Fn, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import { buildSync } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lambdaTimeoutSeconds } from './ingest-stack.js';
import {
  breakerTopicName,
  functionNames,
  projectAccountId,
  projectRegion,
  restoreSchedulePrefix,
  siteOriginExportName,
  siteBucketName,
} from './physical-names.js';
import {
  breakerAlarmPeriodSeconds,
  breakerInvocationThresholds,
  defaultReservedConcurrency,
  notifyMemorySizeMb,
  notifyReservedConcurrency,
  vapidPrivateKeyParameterName,
  writeReservedConcurrency,
} from './write-declarations.js';

const lambdaSourceDirectory = fileURLToPath(new URL('../lambda-src', import.meta.url));
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export class WriteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Provisioned 25/25 fails closed: past the free capacity the table
    // throttles for free instead of billing (adr-write-store-provisioned-
    // capacity.md). RETAIN because reports are immutable community data.
    const writeStore = new dynamodb.Table(this, 'WriteStore', {
      tableName: 'surfs-up-panama-write-store',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 25,
      writeCapacity: 25,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const siteBucket = s3.Bucket.fromBucketName(this, 'SiteBucket', siteBucketName);

    // Guardrail 6: exact site origin, never '*'. The origin is the site
    // distribution's hostname, which only exists after the site stack
    // deploys; it crosses stacks as a CloudFormation export, which also
    // enforces the mandated deploy order (site first, write last).
    const siteOrigin = Fn.importValue(siteOriginExportName);

    const writeFunctionShortNames = ['report', 'mint', 'push', 'photo-presign'] as const;
    const notImplemented = lambda.Code.fromInline(
      'exports.handler = async () => ({ statusCode: 501,'
      + " headers: { 'content-type': 'application/json' },"
      + " body: JSON.stringify({ error: 'not_implemented',"
      + " note: 'write handlers land with F-TELL-US-WHAT-YOU-SAW-COLD' }) });",
    );
    // Bundle the shared decision core only into CDK's temporary asset
    // directory. Nothing generated is committed: synth/package own the
    // deployable Lambda file while source stays in src/report/.
    const reportMintCode = lambda.Code.fromAsset(projectRoot, {
      bundling: {
        image: lambda.Runtime.NODEJS_22_X.bundlingImage,
        local: {
          tryBundle(outputDirectory: string): boolean {
            buildSync({
              entryPoints: [resolve(projectRoot, 'src/report/aws-lambda-adapter.ts')],
              outfile: resolve(outputDirectory, 'report-mint.mjs'),
              bundle: true,
              format: 'esm',
              platform: 'node',
              target: 'node22',
              sourcemap: false,
              legalComments: 'none',
              external: ['@aws-sdk/*'],
            });
            return true;
          },
        },
      },
    });

    const writeFunctions = writeFunctionShortNames.map((shortName) => {
      const functionName = functionNames[shortName];
      const logGroup = new logs.LogGroup(this, `${shortName}-logs`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.TWO_WEEKS, // guardrail 3
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const fn = new lambda.Function(this, `${shortName}-fn`, {
        functionName,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: shortName === 'report' || shortName === 'mint' ? 'report-mint.handler' : 'index.handler',
        code: shortName === 'report' || shortName === 'mint' ? reportMintCode : notImplemented,
        memorySize: 128, // 07-write-path 7.2 control 0.3
        timeout: Duration.seconds(lambdaTimeoutSeconds[shortName]), // guardrail 2
        reservedConcurrentExecutions: writeReservedConcurrency[shortName], // control 0.2
        logGroup,
        ...(shortName === 'report' || shortName === 'mint' ? {
          environment: {
            WRITE_PATH: `/api/${shortName}`,
            WRITE_STORE_TABLE: writeStore.tableName,
            SITE_BUCKET: siteBucketName,
            CREDENTIAL_HMAC_PARAMETER: '/surfsuppanama/prod/credential-hmac-key',
          },
        } : {}),
      });
      const functionUrl = fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE, // adr-write-path-off-cloudfront
        cors: {
          allowedOrigins: [siteOrigin],
          allowedMethods: [lambda.HttpMethod.POST],
          allowedHeaders: ['content-type', 'x-surf-credential'],
          maxAge: Duration.days(1),
        },
      });
      return { shortName, functionName, fn, functionUrl };
    });

    const reportFn = writeFunctions.find(({ shortName }) => shortName === 'report')?.fn;
    const mintFn = writeFunctions.find(({ shortName }) => shortName === 'mint')?.fn;
    if (reportFn === undefined || mintFn === undefined) throw new Error('write stack refused: report and mint functions are required');
    const reportUrl = writeFunctions.find(({ shortName }) => shortName === 'report')?.functionUrl;
    const mintUrl = writeFunctions.find(({ shortName }) => shortName === 'mint')?.functionUrl;
    if (reportUrl === undefined || mintUrl === undefined) throw new Error('write stack refused: report and mint Function URLs are required');
    new CfnOutput(this, 'ReportFunctionUrl', {
      value: reportUrl.url,
      description: 'Public report Function URL for the static-site build',
    });
    new CfnOutput(this, 'MintFunctionUrl', {
      value: mintUrl.url,
      description: 'Public mint Function URL for the static-site build',
    });

    // The report capability is exact by operation and resource. It can read
    // only the public spot index/call log, retrieve duplicates, transact the
    // immutable report/quota write, and increment its spot counter. No S3
    // write, table scan, or secret mutation is available.
    reportFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:DescribeTable', 'dynamodb:GetItem', 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem'],
      resources: [writeStore.tableArn],
    }));
    reportFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [
        siteBucket.arnForObjects('pub/v1/meta/spot-index.json'),
        siteBucket.arnForObjects('log/calls/v1/*'),
      ],
    }));
    reportFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${projectRegion}:${projectAccountId}:parameter/surfsuppanama/prod/credential-hmac-key`],
    }));

    // Mint owns only the append-only credential ledger. Its handler shares
    // validation/core code with report but has no S3 or report-write grant.
    mintFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:DescribeTable', 'dynamodb:GetItem', 'dynamodb:PutItem'],
      resources: [writeStore.tableArn],
    }));
    mintFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${projectRegion}:${projectAccountId}:parameter/surfsuppanama/prod/credential-hmac-key`],
    }));

    // ------------------------------------------------------------------
    // The scheduled notify job (adr-push-vapid-direct.md decision 1).
    //
    // IT IS NOT THE `push` FUNCTION ABOVE. 07-write-path.md section 2 lists
    // them as two rows and section 8.6 draws them as two participants: `push`
    // is the POST /api/push subscribe endpoint behind a Function URL, `notify`
    // is the hourly send fan-out that is "never on the request path". Hence no
    // Function URL here, no CORS, and no breaker membership: the ADR's cost
    // argument rests on this lane being unreachable from the internet, so its
    // worst case is bounded by subscriptions x dedup rules x the per-run cap
    // rather than by an attacker's request rate.
    //
    // It lives in THIS stack rather than the ingest stack because the write
    // store it queries is declared here; putting it next to fetch/build would
    // buy a cross-stack table reference and perturb the mandated deploy order.
    //
    // THE SCHEDULE SHIPS DISABLED, ON PURPOSE. The send adapter (VAPID ES256
    // JWT per push-service origin, aes128gcm payload encryption, the HTTP POST
    // itself) has not landed; the pure decisions it will consult have
    // (src/push/plan-notifications.ts). An ENABLED hourly schedule in front of
    // a handler that cannot send would be a job that pretends to run 720 times
    // a month. Copy never runs ahead of the data, and neither does a cron.
    // Flip `state` to ENABLED in the same change that lands the real handler,
    // once the VAPID SecureString below is provisioned.
    const notifyLogs = new logs.LogGroup(this, 'NotifyLogs', {
      logGroupName: `/aws/lambda/${functionNames.notify}`,
      retention: logs.RetentionDays.TWO_WEEKS, // guardrail 3
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const notifyFn = new lambda.Function(this, 'Notify', {
      functionName: functionNames.notify,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      // Loud rather than silent: if this is ever invoked before the send
      // adapter lands, it fails and says why instead of quietly doing nothing.
      code: lambda.Code.fromInline(
        'exports.handler = async () => {'
        + " throw new Error('not_implemented: the notify send adapter (VAPID"
        + " signing and the Web Push POST) has not landed; this schedule is"
        + " DISABLED until it does'); };",
      ),
      memorySize: notifyMemorySizeMb, // 07-write-path 8.5 costs the fan-out at 0.25 GB
      timeout: Duration.seconds(lambdaTimeoutSeconds.notify), // guardrail 2
      reservedConcurrentExecutions: notifyReservedConcurrency,
      logGroup: notifyLogs,
      environment: {
        WRITE_STORE_TABLE: writeStore.tableName,
        SITE_BUCKET: siteBucketName,
        // The NAME of the parameter, never the key. The value is a
        // SecureString a human provisions out of band; nothing in this
        // repository ever holds VAPID private key material.
        VAPID_PRIVATE_KEY_PARAMETER: vapidPrivateKeyParameterName,
      },
    });
    // Duplicate EventBridge delivery must not double-send. The 1/spot/
    // subscriber/day rule (07-write-path 8.2) already makes a repeated run a
    // no-op, so a Lambda-level retry could only ever repeat work.
    notifyFn.configureAsyncInvoke({ retryAttempts: 0 });

    // Exactly the subscription operations the send rule needs: query the subs
    // for a spot, stamp last_notified_date after a delivered send, and delete
    // the item a 404/410/403 pruned. No PutItem (the send job never creates a
    // subscription), no Scan (a fan-out that scans this table walks reports
    // and the credential ledger too), no transaction.
    notifyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:DescribeTable', 'dynamodb:Query', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
      resources: [writeStore.tableArn],
    }));
    // Read-only on the published surface it scores against: the spot index
    // supplies each spot's own timezone (nothing Panama-shaped) and the
    // published bundle supplies this morning's scores. Never the prediction
    // log, never the raw archive, and never a write.
    notifyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('pub/v1/*')],
    }));
    notifyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${projectRegion}:${projectAccountId}:parameter${vapidPrivateKeyParameterName}`],
    }));

    // Hourly at :25, three minutes after the :22 build, so a run always reads
    // this hour's published bundle (07-write-path 8.2).
    const notifySchedulerRole = new iam.Role(this, 'NotifySchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Lets EventBridge Scheduler invoke the notify function, nothing else',
    });
    notifyFn.grantInvoke(notifySchedulerRole);
    new scheduler.CfnSchedule(this, 'NotifySchedule', {
      name: 'surfs-up-panama-notify-hourly',
      description: 'Hourly push send fan-out at :25, three minutes after the build',
      scheduleExpression: 'cron(25 * * * ? *)',
      scheduleExpressionTimezone: 'UTC',
      state: 'DISABLED', // until the VAPID send adapter lands; see the note above
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: notifyFn.functionArn,
        roleArn: notifySchedulerRole.roleArn,
        input: JSON.stringify({ job: 'notify' }),
        retryPolicy: { maximumRetryAttempts: 0 },
      },
    });

    // Resize exists because the write path mints photo-presign URLs; its
    // ObjectCreated trigger and S3 grants arrive with the real photo
    // handlers (F-TELL-US-WHAT-YOU-SAW-COLD), so today it can touch nothing.
    new lambda.Function(this, 'Resize', {
      functionName: functionNames.resize,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: notImplemented,
      memorySize: 512,
      timeout: Duration.seconds(lambdaTimeoutSeconds.resize), // guardrail 2
      reservedConcurrentExecutions: defaultReservedConcurrency, // guardrail 1
      logGroup: new logs.LogGroup(this, 'ResizeLogs', {
        logGroupName: `/aws/lambda/${functionNames.resize}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    // The breaker: real operational code, not a placeholder. Trips exactly
    // the four write functions to reserved concurrency 0 and schedules its
    // own restore 6 hours later (07-write-path 7.2 control 0.6). The shared
    // single topic is a named, accepted correlated failure mode
    // (system-architecture.md 6.1).
    const breakerArn = `arn:aws:lambda:${projectRegion}:${projectAccountId}:function:${functionNames.breaker}`;
    const restoreRole = new iam.Role(this, 'BreakerRestoreRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Lets the one-shot restore schedule invoke the breaker, nothing else',
    });
    restoreRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [breakerArn],
    }));

    const breakerFn = new lambda.Function(this, 'Breaker', {
      functionName: functionNames.breaker,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'breaker.handler',
      code: lambda.Code.fromAsset(lambdaSourceDirectory),
      memorySize: 128,
      timeout: Duration.seconds(lambdaTimeoutSeconds.breaker), // guardrail 2
      reservedConcurrentExecutions: defaultReservedConcurrency, // guardrail 1
      logGroup: new logs.LogGroup(this, 'BreakerLogs', {
        logGroupName: `/aws/lambda/${functionNames.breaker}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        WRITE_FUNCTIONS: JSON.stringify(Object.fromEntries(
          writeFunctions.map(({ shortName, functionName }) => [functionName, writeReservedConcurrency[shortName]]),
        )),
        SELF_ARN: breakerArn,
        RESTORE_ROLE_ARN: restoreRole.roleArn,
        RESTORE_SCHEDULE_PREFIX: restoreSchedulePrefix,
      },
    });

    // The breaker may set concurrency on EXACTLY the four write functions.
    // It must never name an ingest function: a billing flood must never be
    // able to stop the prediction log (guardrail 8, narrowed deny scope).
    breakerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:PutFunctionConcurrency', 'lambda:DeleteFunctionConcurrency'],
      resources: writeFunctions.map(({ fn }) => fn.functionArn),
    }));
    breakerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule'],
      resources: [`arn:aws:scheduler:${projectRegion}:${projectAccountId}:schedule/default/${restoreSchedulePrefix}-*`],
    }));
    breakerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [restoreRole.roleArn],
      conditions: { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } },
    }));

    // The breaker topic is created by the observability stack (it is also the
    // $18 budget line's notification target); imported here by its
    // deterministic ARN, which is why observability deploys before write.
    const breakerTopic = sns.Topic.fromTopicArn(
      this,
      'BreakerTopic',
      `arn:aws:sns:${projectRegion}:${projectAccountId}:${breakerTopicName}`,
    );
    breakerTopic.addSubscription(new snsSubscriptions.LambdaSubscription(breakerFn));

    // One breaker alarm per write function on the free Invocations metric
    // (Sum over 5 minutes), thresholds from 07-write-path 7.2 control 0.6.
    for (const { shortName, functionName } of writeFunctions) {
      const alarm = new cloudwatch.Alarm(this, `${shortName}-breaker-alarm`, {
        alarmName: `surfs-up-panama-breaker-${shortName}`,
        alarmDescription: `Write flood on ${functionName}: trip the breaker`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Invocations',
          dimensionsMap: { FunctionName: functionName },
          statistic: 'Sum',
          period: Duration.seconds(breakerAlarmPeriodSeconds),
        }),
        threshold: breakerInvocationThresholds[shortName],
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(breakerTopic));
    }
  }
}
