// CONTROLLED FIXTURE ONLY. This is not deployed infrastructure. It supplies
// source-side values to the same production-owned declaration evaluator that
// the real local `infra` job uses.

// A declaration-only evaluator reads this file as data. It must never import
// or execute it. The tripwire only writes inside the test-created temporary
// path and only when that path is explicitly supplied by the acceptance test.
import { writeFileSync } from 'node:fs';

const executionTripwire = process.env.SURFS_UP_DECLARATION_EXECUTION_TRIPWIRE;
if (executionTripwire) writeFileSync(executionTripwire, 'fixture executed', 'utf8');

export const guardrailDeclarations = {
  'lambda-reserved-concurrency': '2',
  'timeout-fetch': '60 seconds',
  'timeout-build': '420 seconds',
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
