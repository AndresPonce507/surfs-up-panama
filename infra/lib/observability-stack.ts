// Reviewed log-retention declaration used by the CDK synthesis app.

import { Duration, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

import {
  alarmEmail,
  breakerTopicName,
  functionNames,
  metricNamespace,
  opsAlarmTopicName,
} from './physical-names.js';

export const logRetentionDays = 14;

// The real observability stack: SNS alarm topics, the dead-man's switch and
// its sibling alarms, and the five money lines as AWS Budgets.
// system-architecture.md sections 9 (guardrails 8 and 9) and 10.
//
// Two corrections of record, implemented here:
// - Guardrail 9's round-1 claim that a $20 billing alarm "already exists on
//   the account" was verified FALSE 2026-08-09 (zero CloudWatch alarms; the
//   only $20 budget belongs to the other project). The $20 last line is
//   CREATED by this stack as a budget, never imported, exactly as the
//   shipped slice-03 declaration (`budget-last-line-source:
//   created-by-project`) requires. A CloudWatch billing alarm was rejected
//   because the AWS/Billing metric namespace is empty on this account (the
//   console-only billing-alerts preference has never been enabled), so such
//   an alarm could never leave INSUFFICIENT_DATA.
// - Guardrail 8's "$18 budget action denying lambda:InvokeFunctionUrl"
//   cannot work as literally written: the four write URLs are auth NONE, and
//   an IAM policy can only bind an authenticated principal, so an
//   APPLY_IAM_POLICY budget action would deny nobody. The working mechanism
//   with the identical effect and the identical narrow scope: the $18 budget
//   notifies the breaker topic, and the breaker sets reserved concurrency 0
//   on exactly the four write functions. The ingest role is never named; a
//   billing flood can never stop the prediction log.
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const opsTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: opsAlarmTopicName,
      displayName: 'Surfs Up Panama alarms',
    });
    opsTopic.addSubscription(new snsSubscriptions.EmailSubscription(alarmEmail));

    // The single shared breaker topic (accepted correlated failure mode,
    // system-architecture.md 6.1). Created here so it exists before the
    // write stack subscribes the breaker function, and so the $18 budget
    // below can name it. AWS Budgets must be allowed to publish.
    const breakerTopic = new sns.Topic(this, 'BreakerTopic', {
      topicName: breakerTopicName,
      displayName: 'Surfs Up Panama write-path breaker',
    });
    const breakerTopicPolicy = breakerTopic.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowBudgetsPublish',
      principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
      actions: ['SNS:Publish'],
      resources: [breakerTopic.topicArn],
    }));

    const snsAction = new cloudwatchActions.SnsAction(opsTopic);

    // Alarm 1, the dead-man's switch. BREACHING is the load-bearing word: a
    // metric-filter metric with no matching log line reports NO datapoint,
    // not zero, and default handling would hold the alarm green forever
    // precisely when everything is dead (08-devops.md section 7). The OK
    // action is equally load-bearing: without it nobody learns the ingest
    // recovered. Honest detection floor: 2 to 3 hours.
    const deadMan = new cloudwatch.Alarm(this, 'DeadMansSwitch', {
      alarmName: 'surfs-up-panama-dead-mans-switch',
      alarmDescription: 'IngestSuccess absent for 2 consecutive hours: the forecast is freezing in silence',
      metric: new cloudwatch.Metric({
        namespace: metricNamespace,
        metricName: 'IngestSuccess',
        statistic: 'Sum',
        period: Duration.hours(1),
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    deadMan.addAlarmAction(snsAction);
    deadMan.addOkAction(snsAction);

    // Alarm 2: a source went dark; the site keeps serving stale-but-correct.
    const providerErrors = new cloudwatch.Alarm(this, 'ProviderErrors', {
      alarmName: 'surfs-up-panama-provider-errors',
      alarmDescription: 'A forecast provider went dark; the site serves stale-but-correct',
      metric: new cloudwatch.Metric({
        namespace: metricNamespace,
        metricName: 'ProviderErrors',
        statistic: 'Sum',
        period: Duration.hours(1),
      }),
      threshold: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    providerErrors.addAlarmAction(snsAction);

    // Alarm 3: errors across the four write functions. Function names are
    // deterministic literals, so this stack deploys before the write stack
    // exists; the metric simply has no data until then.
    const writeShortNames = ['report', 'mint', 'push', 'photo-presign'] as const;
    const writeErrors = new cloudwatch.Alarm(this, 'WriteErrors', {
      alarmName: 'surfs-up-panama-write-errors',
      alarmDescription: 'Abuse or defect on the only unbounded surface',
      metric: new cloudwatch.MathExpression({
        expression: 'e1 + e2 + e3 + e4',
        usingMetrics: Object.fromEntries(writeShortNames.map((shortName, index) => [
          `e${index + 1}`,
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            dimensionsMap: { FunctionName: functionNames[shortName] },
            statistic: 'Sum',
            period: Duration.minutes(15),
          }),
        ])),
        period: Duration.minutes(15),
      }),
      threshold: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    writeErrors.addAlarmAction(snsAction);

    // The five money lines (guardrail 8 and the corrected guardrail 9).
    // Account-wide by necessity and said plainly: the project cost-allocation
    // tag is not yet activated in the Billing console, and this account is
    // shared with another project, so these lines guard the ACCOUNT bill.
    const emailSubscriber = { subscriptionType: 'EMAIL', address: alarmEmail };
    const alertLine = (amount: number) => new budgets.CfnBudget(this, `Alert${amount}`, {
      budget: {
        budgetName: `surfs-up-panama-alert-${amount}`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount, unit: 'USD' },
      },
      notificationsWithSubscribers: [{
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold: 100,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [emailSubscriber],
      }],
    });
    alertLine(1);
    alertLine(5);
    alertLine(15);

    const actionLine = new budgets.CfnBudget(this, 'Action18', {
      budget: {
        budgetName: 'surfs-up-panama-action-18',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 18, unit: 'USD' },
      },
      notificationsWithSubscribers: [{
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold: 100,
          thresholdType: 'PERCENTAGE',
        },
        // The enforcement that must actually work: the breaker trips exactly
        // the four write Function URLs to concurrency 0. See the class
        // comment for why this is a topic, not an IAM-policy budget action.
        subscribers: [
          { subscriptionType: 'SNS', address: breakerTopic.topicArn },
          emailSubscriber,
        ],
      }],
    });
    if (breakerTopicPolicy.policyDependable) {
      actionLine.node.addDependency(breakerTopicPolicy.policyDependable);
    }

    new budgets.CfnBudget(this, 'LastLine20', {
      budget: {
        budgetName: 'surfs-up-panama-last-line-20',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 20, unit: 'USD' },
      },
      notificationsWithSubscribers: [{
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold: 100,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [emailSubscriber],
      }],
    });
  }
}
