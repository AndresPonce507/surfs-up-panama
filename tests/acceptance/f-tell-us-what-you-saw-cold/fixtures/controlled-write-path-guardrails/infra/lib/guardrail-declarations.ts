// Controlled acceptance input for the production local-CI driving port.
// It describes a valid write-cost posture; scenarios copy and alter one value.

export const guardrailDeclarations = {
  'lambda-reserved-concurrency': '2',
  'timeout-fetch': '60 seconds',
  'timeout-build': '120 seconds',
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

export const archiveBucketVersioning = { 'archive-bucket-versioning': 'Enabled' } as const;
export const deadMansSwitchDeclaration = {
  'dead-mans-switch-metric': 'IngestSuccess',
  'dead-mans-switch-treat-missing-data': 'BREACHING',
  'dead-mans-switch-evaluation-periods': '2',
  'dead-mans-switch-period': '1 hour',
  'dead-mans-switch-alarm-action': 'sns-alarm-topic',
  'dead-mans-switch-ok-action': 'sns-ok-topic',
} as const;
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

export const writePathGuardrailDeclarations = {
  'allowed-site-origin': 'https://preview.surfsuppanama.example',
  'write-function-url-auth': 'NONE',
  'write-function-url-names': 'report,mint,push,photo-presign',
  'report-limit': '2',
  'mint-limit': '1',
  'push-limit': '1',
  'photo-presign-limit': '1',
  'table-billing-mode': 'PROVISIONED',
  'table-read-capacity': '25',
  'table-write-capacity': '25',
  'write-breaker-count': '4',
  'report-device-limit': '20',
  'presign-device-limit': '10',
  'subscription-device-limit': '20',
  'quota-identity': 'device-only',
  'sizing-source': 'system-architecture.md section 6.1',
} as const;
