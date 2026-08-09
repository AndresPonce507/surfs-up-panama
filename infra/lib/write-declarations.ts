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

// Non-write reserved concurrency, guardrail 1: 2 on every function.
export const defaultReservedConcurrency = 2;

// The sum every deploy actually reserves. AWS rejects any reservation that
// leaves fewer than 100 unreserved account-wide, so the applied Lambda
// `Concurrent executions` quota must be at least this sum plus 100 (= 113)
// or PutFunctionConcurrency is rejected at deploy time and the write stack
// must be rolled back (07-write-path section 7.2 item 0.15).
export const reservedConcurrencySum = 13;
