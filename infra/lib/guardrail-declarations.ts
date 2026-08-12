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
  'probe-expiration': '1 day',
  'photo-expiration': '90 days',
  'multipart-abort': '7 days',
} as const;

export const lifecycleRules = [
  { id: 'probe-expiration', prefix: 'probes/', expirationAfterDays: 1 },
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

// Slice-02 (F-TELL-US-WHAT-YOU-SAW-COLD): the write-address cost boundaries
// the local gate inspects before any write resource can be deployed. Two
// families, both from adr-write-path-off-cloudfront.md and 07-write-path.md
// section 7.2:
//
//   * posture and origin -- the four write Function URLs are bare, auth type
//     NONE, with CORS bound to one exact site origin and never '*'. CORS is
//     browser-only discipline, not a defence; a loose origin simply lets
//     another site spend this project's write budget.
//   * reserved concurrency -- the real rate limiter and the first hard
//     ceiling on an anonymous write flood (report 2, everything else 1,
//     mirroring writeReservedConcurrency in write-declarations.ts).
//
// The origin literal records the site origin the deployment binds. It is a
// parameter, not a claim: the deployed stack imports the live origin from the
// site stack's SurfsUpPanamaSiteOrigin export (write-stack.ts), and the synth
// guardrail in infra/test/guardrails.test.ts is what proves that binding.
// This file is the declaration surface the credential-free local gate parses,
// so what it guards is declaration DRIFT -- a changed posture, a second or
// looser origin, a raised ceiling.
export const writePathGuardrailDeclarations = {
  'report-url-auth': 'NONE',
  'mint-url-auth': 'NONE',
  'push-url-auth': 'NONE',
  'photo-presign-url-auth': 'NONE',
  'report-url-origin': 'https://preview.surfsuppanama.example',
  'mint-url-origin': 'https://preview.surfsuppanama.example',
  'push-url-origin': 'https://preview.surfsuppanama.example',
  'photo-presign-url-origin': 'https://preview.surfsuppanama.example',
  'report-limit': '2',
  'mint-limit': '1',
  'push-limit': '1',
  'photo-presign-limit': '1',
} as const;
