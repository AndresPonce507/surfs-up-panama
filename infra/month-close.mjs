#!/usr/bin/env node
// F-BILL slice-05: the month is checkable, not hoped for.
//
//   node infra/month-close.mjs                 # live: reads the real account
//   node infra/month-close.mjs --input <file>  # recorded reads (tests, replay)
//
// Live mode shells out to the aws CLI with the operator's own credentials
// (andres-cli holds ce:GetCostAndUsage, ce:ListCostAllocationTags and
// freetier:GetFreeTierUsage, verified 2026-08-09, aws-permission-inventory).
// Exit code 0 only when this project's month is provably $0.00; non-zero
// names the service otherwise. The decision logic is the pure core in
// month-close-core.mjs.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { evaluateMonthClose, projectTag } from './month-close-core.mjs';

function awsRead(args) {
  const result = spawnSync('aws', [...args, '--output', 'json'], {
    encoding: 'utf8',
    env: { ...process.env, AWS_PAGER: '' },
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`aws ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return JSON.parse(result.stdout);
}

function monthPeriod(now = new Date()) {
  const start = `${now.toISOString().slice(0, 8)}01`;
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { start, end };
}

function liveReads() {
  const { start, end } = monthPeriod();
  const costByService = awsRead([
    'ce', 'get-cost-and-usage',
    '--time-period', `Start=${start},End=${end}`,
    '--granularity', 'MONTHLY',
    '--metrics', 'UnblendedCost',
    '--group-by', 'Type=DIMENSION,Key=SERVICE',
  ]);
  const costAllocationTags = awsRead(['ce', 'list-cost-allocation-tags']);
  const tagActive = (costAllocationTags.CostAllocationTags ?? [])
    .some((tag) => tag.TagKey === projectTag.key && tag.Status === 'Active');
  const projectCostByService = tagActive
    ? awsRead([
      'ce', 'get-cost-and-usage',
      '--time-period', `Start=${start},End=${end}`,
      '--granularity', 'MONTHLY',
      '--metrics', 'UnblendedCost',
      '--group-by', 'Type=DIMENSION,Key=SERVICE',
      '--filter', JSON.stringify({ Tags: { Key: projectTag.key, Values: [projectTag.value], MatchOptions: ['EQUALS'] } }),
    ])
    : null;
  const freeTierUsage = awsRead(['freetier', 'get-free-tier-usage', '--region', 'us-east-1']);
  return { costByService, costAllocationTags, projectCostByService, freeTierUsage };
}

export function runMonthClose({ argv = process.argv.slice(2), output = console } = {}) {
  const inputFlagIndex = argv.indexOf('--input');
  const reads = inputFlagIndex >= 0
    ? JSON.parse(readFileSync(argv[inputFlagIndex + 1], 'utf8'))
    : liveReads();
  const { exitCode, lines } = evaluateMonthClose({ reads });
  for (const line of lines) output.log(line);
  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = runMonthClose();
  } catch (error) {
    console.error(`month close: cannot read the account: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
