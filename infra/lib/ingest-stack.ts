// Reviewed limits imported by the credential-free CDK synthesis app.

export const lambdaReservedConcurrency = 2;

export const lambdaTimeoutSeconds = {
  fetch: 60,
  build: 120,
  report: 5,
  mint: 5,
  push: 5,
  'photo-presign': 5,
  resize: 60,
  dispatcher: 10,
  'notify-export': 120,
  breaker: 10,
} as const;
