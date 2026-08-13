// Write-path guardrail values from 07-write-path.md section 7.2, kept in a
// file separate from guardrail-declarations.ts on purpose: that file is a
// regex-parse surface for infra/guardrail-evaluator.mjs and for the frozen
// keystone fixtures, so new structured declarations live here instead.

// Tier 0.2: reserved concurrency is the real cost cap.
export const writeReservedConcurrency = {
  report: 2,
  mint: 1,
  push: 1,
  'photo-presign': 1,
} as const;

// Tier 0.6: circuit-breaker thresholds on the free Invocations metric,
// Sum over 5 minutes, per function.
export const breakerInvocationThresholds = {
  report: 3000,
  mint: 300,
  push: 300,
  'photo-presign': 200,
} as const;

export const breakerAlarmPeriodSeconds = 300;

// The scheduled notify job, kept OUT of the two objects above on purpose:
// both of them mean "the four write Function URLs the breaker trips", and
// notify is neither URL-exposed nor breaker-tripped. Widening them would
// silently pull a scheduled function into the breaker's blast radius.
// Values from 07-write-path.md section 2's function table row `notify`; the
// 256 MB is the figure the section 8.5 fan-out cost math is computed at.
export const notifyReservedConcurrency = 1;
export const notifyMemorySizeMb = 256;

// The nightly observation export, the second scheduled job and kept out of
// the write-URL objects for the same reason as notify: it is neither
// URL-exposed nor breaker-tripped. Values from 07-write-path.md section 2's
// function table row `export` (RC 1, 512 MB); its 120 s timeout is already
// declared on the frozen surface as the shared `timeout-notify-export` row.
export const exportReservedConcurrency = 1;
export const exportMemorySizeMb = 512;

// Where the VAPID private key lives. This project NEVER holds key material in
// the repository: the parameter is a SecureString a human provisions out of
// band, and the Lambda reads it at cold start, exactly as report and mint read
// the credential HMAC key. Path per 07-write-path.md section 8.5. The matching
// public key ships in the client and is public by design.
export const vapidPrivateKeyParameterName = '/surfsuppanama/prod/vapid-private-key';

// The sum every deploy actually reserves. AWS rejects any reservation that
// leaves fewer than 100 unreserved account-wide, so the applied Lambda
// `Concurrent executions` quota must be at least this sum plus 100 (= 116)
// or PutFunctionConcurrency is rejected at deploy time and the write stack
// must be rolled back (07-write-path section 7.2 item 0.15).
//
// Was 13 (quota >= 113) before the scheduled notify job added its 1. The
// bounded Publisher raised it to 15 (quota >= 115), and the independent
// nightly observation export raises it to 16 (quota >= 116).

// Non-write reserved concurrency, guardrail 1: 2 on every function.
export const defaultReservedConcurrency = 2;

export const reservedConcurrencySum = 16;
