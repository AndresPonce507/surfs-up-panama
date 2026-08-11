import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runMonthClose } from '../month-close.mjs';

function recordedReads() {
  return {
    costByService: { ResultsByTime: [{ TimePeriod: { Start: '2026-08-01', End: '2026-08-10' }, Groups: [] }] },
    costAllocationTags: { CostAllocationTags: [{ TagKey: 'Project', Type: 'UserDefined', Status: 'Inactive' }] },
    projectCostByService: null,
    freeTierUsage: { freeTierUsages: [] },
  };
}

describe('month-close driving command', () => {
  it('reads a recorded account fixture, prints the evaluated evidence, and preserves a pass exit code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'surfs-up-month-close-'));
    const input = join(directory, 'reads.json');
    writeFileSync(input, JSON.stringify(recordedReads()));
    const lines: string[] = [];
    try {
      expect(runMonthClose({ argv: ['--input', input], output: { log: (line: string) => lines.push(line) } })).toBe(0);
      expect(lines.join('\n')).toContain('month-to-date account spend');
      expect(lines.join('\n')).toContain('PASS at $0.00');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves the fail-closed INDETERMINATE exit code for an incomplete recorded read', () => {
    const directory = mkdtempSync(join(tmpdir(), 'surfs-up-month-close-'));
    const input = join(directory, 'reads.json');
    writeFileSync(input, JSON.stringify({ ...recordedReads(), costByService: {} }));
    const lines: string[] = [];
    try {
      expect(runMonthClose({ argv: ['--input', input], output: { log: (line: string) => lines.push(line) } })).toBe(2);
      expect(lines.join('\n')).toContain('INDETERMINATE');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses a recorded free-tier row that omits the allowance type needed for month-13 safety', () => {
    const directory = mkdtempSync(join(tmpdir(), 'surfs-up-month-close-'));
    const input = join(directory, 'reads.json');
    writeFileSync(input, JSON.stringify({ ...recordedReads(), freeTierUsage: { freeTierUsages: [{ service: 'AWS Lambda', description: 'Requests', actualUsageAmount: 1, limit: 1_000_000, unit: 'Request' }] } }));
    const lines: string[] = [];
    try {
      expect(runMonthClose({ argv: ['--input', input], output: { log: (line: string) => lines.push(line) } })).toBe(2);
      expect(lines.join('\n')).toContain('allowance type');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
