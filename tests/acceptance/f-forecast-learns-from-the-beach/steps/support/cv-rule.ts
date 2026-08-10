// The third source-universe rule, introduced by slice-05: a cross-validation
// may never shuffle time. Same shape as the two slice-01 rules; the verdict
// helper lives here because learning-declarations.steps.ts keeps its own
// assertion private and this feature's modules may not reach into it.

import assert from 'node:assert/strict';

import { requireDeclarations } from './learning-world';

export const RULE_HELD_OUT_STAYS_FORWARD = 'held-out-mornings-must-stay-forward-of-training';

export function assertCvRuleVerdict(verdict: string): void {
  const report = requireDeclarations();
  const fired = report.violations.filter((violation) => violation.rule === RULE_HELD_OUT_STAYS_FORWARD);
  if (verdict === 'refuses') {
    assert.ok(
      fired.length > 0,
      `this universe shuffles time and the examination let it through; a shuffled split flatters every correction it judges. Violations reported: ${report.violations.map((violation) => violation.rule).join(', ') || 'none'}`,
    );
    return;
  }
  assert.deepEqual(
    fired,
    [],
    `this universe splits time forward only and the examination refused it anyway: ${fired.map((violation) => violation.detail).join('; ')}`,
  );
}
