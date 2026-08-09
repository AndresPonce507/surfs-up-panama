// Reviewed lifecycle declarations used by the credential-free CDK synthesis app.

export const predictionLogPrefix = 'predictions/';

export const siteLifecycleDeclarations = [
  { id: 'raw-archive-expiration', prefix: 'raw/', expirationAfterDays: 30 },
  { id: 'photo-expiration', prefix: 'photos/', expirationAfterDays: 90 },
  { id: 'incomplete-multipart-abort', abortAfterDays: 7 },
] as const;
