export type AlarmHistoryItem = Readonly<{
  AlarmName?: string;
  AlarmType?: string;
  Timestamp?: string;
  HistoryItemType?: string;
  HistorySummary?: string;
  HistoryData?: string;
}>;

export type MetricAlarmRead = Readonly<{
  AlarmName?: string;
  AlarmArn?: string;
  AlarmDescription?: string;
  AlarmConfigurationUpdatedTimestamp?: string;
  ActionsEnabled?: boolean;
  OKActions?: readonly string[];
  AlarmActions?: readonly string[];
  InsufficientDataActions?: readonly string[];
  StateValue?: string;
  StateReason?: string;
  StateReasonData?: string;
  StateUpdatedTimestamp?: string;
  StateTransitionedTimestamp?: string;
  MetricName?: string;
  Namespace?: string;
  Statistic?: string;
  Period?: number;
  EvaluationPeriods?: number;
  Threshold?: number;
  ComparisonOperator?: string;
  TreatMissingData?: string;
}>;

export type MetricStatisticRead = Readonly<{
  Label?: string;
  Datapoints?: readonly Readonly<{ Timestamp?: string; Sum?: number; Unit?: string }>[];
}>;

export type AlarmProbeCapture = Readonly<{
  capturedAt?: string;
  capturedBy?: string;
  region?: string;
  provenance?: string;
  alarms?: Readonly<{ MetricAlarms?: readonly MetricAlarmRead[] }>;
  history?: Readonly<Record<string, Readonly<{ AlarmHistoryItems?: readonly AlarmHistoryItem[] }>>>;
  topicSubscriptions?: Readonly<{
    Subscriptions?: readonly Readonly<{ SubscriptionArn?: string; Protocol?: string; TopicArn?: string }>[];
  }>;
  notificationsDelivered?: MetricStatisticRead;
  notificationsFailed?: MetricStatisticRead;
  stacks?: Readonly<{ Stacks?: readonly Readonly<{ StackName?: string; StackStatus?: string }>[] }>;
}>;

export declare const watchedDeadMansSwitches: readonly string[];

export declare function evaluateAlarmProbe(input: Readonly<{
  capture: AlarmProbeCapture;
  watchList?: readonly string[];
}>): Readonly<{ exitCode: number; lines: readonly string[] }>;
