import { describe, expect, it } from 'vitest';

import { evaluateAuditReport } from '../../scripts/check-npm-audit.mjs';

const exactFinding = {
  name: 'brace-expansion', severity: 'high',
  nodes: ['node_modules/aws-cdk-lib/node_modules/brace-expansion'],
  via: [{ url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895' }],
};

describe('check-npm-audit', () => {
  it('permits only the current bounded CDK bundle finding before its expiry', () => {
    expect(evaluateAuditReport({ vulnerabilities: { 'brace-expansion': exactFinding } }, new Date('2026-08-11T00:00:00Z'))).toMatchObject({ ok: true, waived: true });
  });

  it('refuses a changed path or any additional high finding', () => {
    expect(evaluateAuditReport({ vulnerabilities: { 'brace-expansion': { ...exactFinding, nodes: ['node_modules/elsewhere/brace-expansion'] } } })).toMatchObject({ ok: false });
    expect(evaluateAuditReport({ vulnerabilities: { 'brace-expansion': exactFinding, other: { name: 'other', severity: 'critical', nodes: [], via: [] } } })).toMatchObject({ ok: false });
  });

  it('expires the exception instead of silently carrying it forward', () => {
    expect(evaluateAuditReport({ vulnerabilities: { 'brace-expansion': exactFinding } }, new Date('2026-08-24T00:00:00Z'))).toMatchObject({ ok: false });
  });
});
