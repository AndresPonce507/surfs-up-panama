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
