#!/usr/bin/env node
// Keep npm audit mandatory without hiding the one upstream-bundled CDK
// advisory that npm itself cannot repair. This is deliberately narrower than
// an omit-dev switch: a new high/critical finding, a changed dependency path,
// or an expired exception fails the gate.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EXPIRES_AT = '2026-08-23T00:00:00.000Z';
const ADVISORY_URL = 'https://github.com/advisories/GHSA-rgw5-rvv9-x895';
const DEPENDENCY_PATH = 'node_modules/aws-cdk-lib/node_modules/brace-expansion';

export function evaluateAuditReport(report, now = new Date()) {
  const findings = Object.values(report.vulnerabilities ?? {})
    .filter((finding) => finding.severity === 'high' || finding.severity === 'critical');
  if (findings.length === 0) return { ok: true, waived: false };
  const expiry = new Date(EXPIRES_AT);
  const exactBundledCdkFinding = findings.length === 1
    && findings[0].name === 'brace-expansion'
    && findings[0].severity === 'high'
    && findings[0].nodes?.length === 1
    && findings[0].nodes[0] === DEPENDENCY_PATH
    && findings[0].via?.some((via) => typeof via === 'object' && via?.url === ADVISORY_URL);
  if (exactBundledCdkFinding && now < expiry) {
    return { ok: true, waived: true, expiresAt: EXPIRES_AT };
  }
  return { ok: false, waived: false };
}

const invoked = process.argv[1]?.endsWith('check-npm-audit.mjs');
if (invoked) {
  const audit = spawnSync('npm', ['audit', '--json', '--audit-level=high'], { encoding: 'utf8', shell: false });
  writeFileSync('.ci-local-logs/npm-audit.json', audit.stdout);
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    process.stderr.write('npm audit did not produce valid JSON; refusing the supply-chain gate.\n');
    process.exitCode = 1;
  }
  if (report !== undefined) {
    const result = evaluateAuditReport(report);
    if (!result.ok) {
      process.stderr.write(audit.stdout);
      process.exitCode = 1;
    } else if (result.waived) {
      process.stdout.write(`npm audit: exact bundled-CDK exception accepted until ${result.expiresAt}; raw report retained in .ci-local-logs/supply-chain.log\n`);
    }
  }
}
