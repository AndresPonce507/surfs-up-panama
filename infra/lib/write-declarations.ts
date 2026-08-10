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

// The sum every deploy actually reserves, counted from the synthesized
// templates of the four real stacks: fetch 2 + build 2 (ingest), report 2 +
// mint 1 + push 1 + photo-presign 1 + resize 2 + breaker 2 (write).
//
// AWS rejects any reservation that would push the account's unreserved pool
// below its minimum, so the rule is `quota - sum >= floor`. Both numbers are
// per-account and must be OBSERVED, never assumed: the widely quoted floor of
// 100 is not universal. Observed on 602167897909 / us-east-1 on 2026-08-09
// via lambda:GetAccountSettings and servicequotas:GetServiceQuota
// (L-B99A9384): quota = 10, floor = 10. A single reservation of 2 was
// therefore rejected at deploy time and CloudFormation rolled the ingest
// stack back, verbatim:
//
//   "Specified ReservedConcurrentExecutions for function decreases account's
//    UnreservedConcurrentExecution below its minimum value of [10]."
//
// So on this account today NO reservation of any size is settable, guardrail
// 1 and control 0.2 do not exist, and the write stack cannot deploy: this is
// exactly the stop signal of 07-write-path section 7.2 item 0.15, reached
// far earlier than that item anticipated. The fix is a Service Quotas
// increase on L-B99A9384 (Adjustable: true), which is Andres's to request.
// Never strip the reservations to force a green deploy; they are the cost
// control. See aws-permission-inventory.md section 1.2.
export const reservedConcurrencySum = 13;

// Observed 2026-08-09, not assumed. Update only from a real API read.
export const observedAccountConcurrencyQuota = 10;
export const observedMinimumUnreservedFloor = 10;
