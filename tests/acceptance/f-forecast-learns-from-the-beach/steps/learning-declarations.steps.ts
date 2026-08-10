// Step methods for the two safety rules that are claims about the whole source
// rather than about one execution: only the gate may mark a correction applied,
// and a wind residual may not ship without its own noise floor.
//
// Layer: in-memory acceptance over a named source universe. Example-only, no
// generated inputs: each rule is watched refusing a prepared universe that
// breaks it and accepting one that keeps it, which is the only way a rule that
// currently has nothing to fire on can be evidence of anything.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Given, Then, When } from '@cucumber/cucumber';

import {
  RULE_ONLY_THE_GATE_MAY_MARK_APPLIED,
  RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR,
  examineLearningDeclarations,
  requireDeclarations,
} from './support/learning-world';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const SHIPPED_SOURCE = path.join(REPO_ROOT, 'src');
const PREPARED_UNIVERSES = path.join(
  REPO_ROOT,
  'tests/acceptance/f-forecast-learns-from-the-beach/fixtures/controlled-learning-declarations',
);

/** The gate is the one module allowed to produce the applied state. */
const GATE_MODULE_NAME = 'gates';

let examinedRoot = '';

Given('the shipped source of this product', function () {
  examinedRoot = SHIPPED_SOURCE;
});

Given('the prepared source universe {string}', function (universe: string) {
  examinedRoot = path.join(PREPARED_UNIVERSES, universe);
});

When('its learning declarations are examined', async function () {
  await examineLearningDeclarations(examinedRoot);
});

Then('the examination reports no violation', function () {
  const report = requireDeclarations();
  assert.deepEqual(
    report.violations,
    [],
    `the shipped source breaks a learning safety rule: ${report.violations.map((violation) => `${violation.rule}: ${violation.detail}`).join('; ')}`,
  );
});

Then('the only place that can mark a correction applied is the gate itself', function () {
  const report = requireDeclarations();
  const outsideTheGate = report.applied_marking_sites.filter(
    (site) => !path.basename(site).startsWith(GATE_MODULE_NAME),
  );
  assert.deepEqual(
    outsideTheGate,
    [],
    `these places can mark a correction applied without the gate having weighed the evidence: ${outsideTheGate.join(', ')}`,
  );
});

Then('it finds exactly the two declared residual forms, for height and for the score', function () {
  const report = requireDeclarations();
  assert.deepEqual(
    [...report.residual_forms].sort(),
    ['r_height', 'r_score'],
    `exactly two residual forms are declared and no third exists; found ${report.residual_forms.join(', ') || 'none at all'}`,
  );
});

Then('it declares no noise floor for wind, because wind makes no numeric claim', function () {
  const report = requireDeclarations();
  assert.equal(
    report.noise_floors['wind'],
    undefined,
    'wind renders as a word and never as a number, so it forms no residual and needs no single-sample noise floor; declaring one would mean a wind claim had quietly shipped',
  );
});

Then(
  'the examination {word} it over the rule that only the gate may mark a correction applied',
  function (verdict: string) {
    assertRuleVerdict(RULE_ONLY_THE_GATE_MAY_MARK_APPLIED, verdict);
  },
);

Then(
  'the examination {word} it over the rule that a wind residual must bring its own noise floor',
  function (verdict: string) {
    assertRuleVerdict(RULE_WIND_RESIDUAL_NEEDS_ITS_OWN_FLOOR, verdict);
  },
);

function assertRuleVerdict(rule: string, verdict: string): void {
  const report = requireDeclarations();
  const fired = report.violations.filter((violation) => violation.rule === rule);
  if (verdict === 'refuses') {
    assert.ok(
      fired.length > 0,
      `this universe breaks "${rule}" and the examination let it through; a rule that cannot refuse anything is worse than no rule. Violations reported: ${report.violations.map((violation) => violation.rule).join(', ') || 'none'}`,
    );
    return;
  }
  assert.deepEqual(
    fired,
    [],
    `this universe keeps "${rule}" and the examination refused it anyway: ${fired.map((violation) => violation.detail).join('; ')}`,
  );
}
