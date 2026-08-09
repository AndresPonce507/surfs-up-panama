import { App, Fn, Stack } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { CfnRole } from 'aws-cdk-lib/aws-iam';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import {
  guardrailDeclarations,
  lifecycleRules,
  predictionLifecyclePolicy,
} from '../lib/guardrail-declarations.js';

const app = new App();

type GuardrailStackOptions = Readonly<{
  enablePredictionArchiveTransition?: boolean;
}>;

const asNumber = (value: string) => Number.parseInt(value, 10);
const constructId = (value: string) => value
  .split('-')
  .map((segment) => `${segment[0]?.toUpperCase()}${segment.slice(1)}`)
  .join('');

type LifecycleRule = (typeof lifecycleRules)[number] | typeof predictionLifecyclePolicy;

const asLifecycleRule = (rule: LifecycleRule): CfnBucket.RuleProperty => ({
  id: 'id' in rule ? rule.id : rule.ruleId,
  status: 'Enabled',
  ...('prefix' in rule ? { prefix: rule.prefix } : {}),
  ...('expirationAfterDays' in rule ? { expirationInDays: rule.expirationAfterDays } : {}),
  ...('abortAfterDays' in rule
    ? { abortIncompleteMultipartUpload: { daysAfterInitiation: rule.abortAfterDays } }
    : {}),
  ...('transition' in rule
    ? {
      transitions: [{
        storageClass: rule.transition.storageClass,
        transitionInDays: rule.transition.afterDays,
      }],
    }
    : {}),
});

export function createGuardrailStack(
  scope: Construct,
  { enablePredictionArchiveTransition = false }: GuardrailStackOptions = {},
): Stack {
  const stack = new Stack(scope, 'SurfsUpPanamaGuardrails');
  const configuredLifecycleRules: LifecycleRule[] = [
    ...lifecycleRules,
    ...(enablePredictionArchiveTransition ? [predictionLifecyclePolicy] : []),
  ];

  new CfnBucket(stack, 'ArchiveBucket', {
    publicAccessBlockConfiguration: {
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
    lifecycleConfiguration: {
      rules: configuredLifecycleRules.map(asLifecycleRule),
    },
  });

  const lambdaRole = new CfnRole(stack, 'GuardrailLambdaExecutionRole', {
    assumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: ['lambda.amazonaws.com'] },
        Action: ['sts:AssumeRole'],
      }],
    },
    managedPolicyArns: [
      Fn.sub('arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'),
    ],
  });

  const reservedConcurrency = asNumber(guardrailDeclarations['lambda-reserved-concurrency']);
  const logRetentionDays = asNumber(guardrailDeclarations['log-retention']);
  const timeoutEntries = Object.entries(guardrailDeclarations)
    .filter(([name]) => name.startsWith('timeout-'));

  for (const [name, timeout] of timeoutEntries) {
    const functionName = name.slice('timeout-'.length);
    const lambda = new CfnFunction(stack, `${constructId(functionName)}Function`, {
      code: { zipFile: 'exports.handler = async () => ({ statusCode: 204 });' },
      handler: 'index.handler',
      role: lambdaRole.attrArn,
      runtime: 'nodejs22.x',
      reservedConcurrentExecutions: reservedConcurrency,
      timeout: asNumber(timeout),
    });

    new CfnLogGroup(stack, `${constructId(functionName)}LogGroup`, {
      logGroupName: Fn.join('', ['/aws/lambda/', lambda.ref]),
      retentionInDays: logRetentionDays,
    });
  }

  return stack;
}

export const stack = createGuardrailStack(app);
