#!/usr/bin/env node
// The operator-facing month-close command. Tests use --input, so no AWS call
// or credential is required to prove the driving port and exit-code contract.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { evaluateMonthClose, projectTag } from './month-close-core.mjs';

function awsRead(args) {
  const result = spawnSync('aws', [...args, '--output', 'json'], { encoding: 'utf8', env: { ...process.env, AWS_PAGER: '' }, shell: false });
  if (result.status !== 0) throw new Error(`aws ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return JSON.parse(result.stdout);
}

function monthPeriod(now = new Date()) {
  return { start: `${now.toISOString().slice(0, 8)}01`, end: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) };
}

function liveReads() {
  const { start, end } = monthPeriod();
  const shared = ['ce', 'get-cost-and-usage', '--time-period', `Start=${start},End=${end}`, '--granularity', 'MONTHLY', '--metrics', 'UnblendedCost', '--group-by', 'Type=DIMENSION,Key=SERVICE'];
  const costByService = awsRead(shared);
  const costAllocationTags = awsRead(['ce', 'list-cost-allocation-tags']);
  const tagActive = (costAllocationTags.CostAllocationTags ?? []).some((tag) => tag.TagKey === projectTag.key && tag.Status === 'Active');
  const projectCostByService = tagActive ? awsRead([...shared, '--filter', JSON.stringify({ Tags: { Key: projectTag.key, Values: [projectTag.value], MatchOptions: ['EQUALS'] } })]) : null;
  const freeTierUsage = awsRead(['freetier', 'get-free-tier-usage', '--region', 'us-east-1']);
  return { costByService, costAllocationTags, projectCostByService, freeTierUsage };
}

export function runMonthClose({ argv = process.argv.slice(2), output = console } = {}) {
  const inputFlag = argv.indexOf('--input');
  if (inputFlag >= 0 && argv[inputFlag + 1] === undefined) throw new Error('month close: --input needs a recorded reads file');
  const reads = inputFlag >= 0 ? JSON.parse(readFileSync(argv[inputFlag + 1], 'utf8')) : liveReads();
  const result = evaluateMonthClose({ reads });
  for (const line of result.lines) output.log(line);
  return result.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.exitCode = runMonthClose(); }
  catch (error) { console.error(`month close: cannot read the account: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
}
