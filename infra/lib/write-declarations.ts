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
// 2026-08-10 re-read through the same lookup role: the quota was RAISED.
// lambda:GetAccountSettings now returns ConcurrentExecutions: 1000 /
// UnreservedConcurrentExecutions: 1000, and L-B99A9384 reads 1000.0. The
// 2026-08-09 paragraph above is history, kept so the rejection stays
// traceable. At quota 1000 the full sum of 13 is settable: even against the
// conventional 100-unreserved floor (the floor itself is only observable at
// deploy time), 1000 - 13 = 987 unreserved remains. The stop signal of
// 07-write-path section 7.2 item 0.15 no longer applies; the reservations
// stay exactly as declared because they are the cost control.
// See aws-permission-inventory.md sections 1.2 and 9.
export const reservedConcurrencySum = 13;

// Observed, never assumed. Update only from a real API read.
// Quota re-read 2026-08-10 (lookup role). The floor was last OBSERVED as 10
// on 2026-08-09 at quota 10 via the deploy rejection above; it cannot be
// read credential-free and the conventional value at this quota is 100.
// Either floor is satisfied by quota 1000 - sum 13.
export const observedAccountConcurrencyQuota = 1000;
export const observedMinimumUnreservedFloor = 10;
