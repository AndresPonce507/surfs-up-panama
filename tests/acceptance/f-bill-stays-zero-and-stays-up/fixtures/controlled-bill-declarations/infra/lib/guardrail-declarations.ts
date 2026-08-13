// CONTROLLED FIXTURE ONLY. This is not deployed infrastructure. It supplies
// source-side values to the same production-owned declaration evaluator that
// the real local `infra` job uses.

export const guardrailDeclarations = {
  'lambda-reserved-concurrency': '2',
  'timeout-fetch': '60 seconds',
  'timeout-build': '420 seconds',
  'timeout-report': '5 seconds',
  'timeout-mint': '5 seconds',
  'timeout-push': '5 seconds',
  'timeout-photo-presign': '5 seconds',
  'timeout-resize': '60 seconds',
  'timeout-dispatcher': '10 seconds',
  'timeout-notify-export': '120 seconds',
  'timeout-breaker': '10 seconds',
  'log-retention': '14 days',
  'raw-expiration': '30 days',
  'photo-expiration': '90 days',
  'multipart-abort': '7 days',
} as const;

export const lifecycleRules = [
  { id: 'raw-archive-expiration', prefix: 'raw/', expirationAfterDays: 30 },
  { id: 'photo-expiration', prefix: 'photos/', expirationAfterDays: 90 },
  { id: 'incomplete-multipart-abort', abortAfterDays: 7 },
] as const;

// Slice-01 (F-BILL): archive bucket versioning. One console delete of a
// single object version must never permanently destroy the prediction log;
// nothing else recovers it.
export const archiveBucketVersioning = {
  'archive-bucket-versioning': 'Enabled',
} as const;

// Slice-02 (F-BILL): the dead-man's switch declaration.
export const deadMansSwitchDeclaration = {
  'dead-mans-switch-metric': 'IngestSuccess',
  'dead-mans-switch-treat-missing-data': 'BREACHING',
  'dead-mans-switch-evaluation-periods': '2',
  'dead-mans-switch-period': '1 hour',
  'dead-mans-switch-alarm-action': 'sns-alarm-topic',
  'dead-mans-switch-ok-action': 'sns-ok-topic',
} as const;

// Slice-03 (F-BILL): the money lines and the $18 deny scope.
export const budgetDeclarations = {
  'budget-alert-1': '1',
  'budget-alert-5': '5',
  'budget-alert-15': '15',
  'budget-action-18': '18',
  'budget-last-line-20': '20',
  'budget-last-line-source': 'created-by-project',
} as const;

export const budgetDenyScopeTargets = [
  'write-report-function-url',
  'write-mint-function-url',
  'write-push-function-url',
  'write-photo-presign-function-url',
] as const;

export const costAllocationTag = {
  'cost-allocation-tag-key': 'Project',
  'cost-allocation-tag-value': 'surfs-up-panama',
} as const;
