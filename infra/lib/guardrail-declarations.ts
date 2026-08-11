// This file is intentionally simple declaration text. The local-CI evaluator
// reads it without importing it, while the CDK app imports the same values.

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

// This is deliberately outside lifecycleRules: the archive has no active
// prediction transition at launch. It can be enabled only after the archive
// reaches the stated spot-count threshold through a deliberate deployment.
export const predictionLifecyclePolicy = {
  ruleId: 'prediction-archive-glacier-instant-retrieval',
  prefix: 'predictions/',
  transition: {
    storageClass: 'GLACIER_IR',
    afterDays: 90,
  },
  activation: {
    minimumSpotCount: 500,
    enabledAtLaunch: false,
  },
} as const;

// Slice-01 (F-BILL-STAYS-ZERO-AND-STAYS-UP): archive bucket versioning. One
// console delete of a single object version must never permanently destroy
// the prediction log; nothing else recovers it.
export const archiveBucketVersioning = {
  'archive-bucket-versioning': 'Enabled',
} as const;

// Slice-02 (F-BILL): the dead-man's switch. Absence of the IngestSuccess
// metric reports zero datapoints, not zero; BREACHING is what turns that
// absence into a failure instead of a silent green forever. Declaration and
// CI-assert only here; the live proof is slice-04, post-deploy.
export const deadMansSwitchDeclaration = {
  'dead-mans-switch-metric': 'IngestSuccess',
  'dead-mans-switch-treat-missing-data': 'BREACHING',
  'dead-mans-switch-evaluation-periods': '2',
  'dead-mans-switch-period': '1 hour',
  'dead-mans-switch-alarm-action': 'sns-alarm-topic',
  'dead-mans-switch-ok-action': 'sns-ok-topic',
} as const;

// Slice-03 (F-BILL): the money lines. The $20 last line is CREATED by this
// project: the account has zero CloudWatch alarms and the only $20 budget
// belongs to another project sharing the account (verified 2026-08-09).
export const budgetDeclarations = {
  'budget-alert-1': '1',
  'budget-alert-5': '5',
  'budget-alert-15': '15',
  'budget-action-18': '18',
  'budget-last-line-20': '20',
  'budget-last-line-source': 'created-by-project',
} as const;

// The $18 deny scope stops at exactly these four write Function URLs, owned
// by F-TELL-US-WHAT-YOU-SAW-COLD and not yet deployed. It must never name
// the ingest role: a billing flood must never be able to stop the
// prediction log.
export const budgetDenyScopeTargets = [
  'write-report-function-url',
  'write-mint-function-url',
  'write-push-function-url',
  'write-photo-presign-function-url',
] as const;

// Project cost-allocation tag, applied to every resource this project
// declares so a project-scoped $0.00 is provable on a shared account once
// the tag key is activated (open question 4; decision of record: this key).
export const costAllocationTag = {
  'cost-allocation-tag-key': 'Project',
  'cost-allocation-tag-value': 'surfs-up-panama',
} as const;

// Slice-06 (F-FORECAST-LEARNS-FROM-THE-BEACH): the learning jobs. The write
// boundary is enforced by IAM, never by discipline (06-learning-layer.md
// section 7): the nightly fit may write exactly its two shelves, the monthly
// evaluation exactly its metrics shelf, and the complement is denied to both.
export const learningJobDeclarations = {
  'learning-nightly-schedule': 'daily-after-observation-export',
  'learning-monthly-schedule': 'monthly-first-morning',
  'learning-function-memory-mb': '1024',
  'learning-nightly-write-scope': 'learned/corrections/v1/current/,learned/corrections/v1/history/',
  'learning-monthly-write-scope': 'learned/metrics/v1/',
  'learning-write-complement-denied': 'predictions/,log/,data/spots/,data/config/,learned/overrides/',
} as const;
