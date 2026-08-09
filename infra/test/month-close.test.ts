// F-BILL slice-05: the month is checkable, not hoped for. The pure core is
// driven here with recorded account reads; the CLI shell
// (infra/month-close.mjs) feeds it live `aws` CLI reads for Andres. The
// command's honesty rules: it never claims a project-scoped $0.00 the data
// cannot prove, and it reports the Anthropic limit as an external audit
// obligation, never as checked.

import { describe, expect, it } from 'vitest';

import { costAllocationTag } from '../lib/guardrail-declarations.js';
import { evaluateMonthClose, projectTag } from '../month-close-core.mjs';

type Reads = Parameters<typeof evaluateMonthClose>[0]['reads'];

function reads({
  services = [] as readonly (readonly [string, string])[],
  tagStatus = 'Inactive',
  projectServices = null as readonly (readonly [string, string])[] | null,
  freeTier = [
    {
      service: 'AWS Lambda',
      description: 'AWS Lambda - Requests',
      actualUsageAmount: 12,
      limit: 1000000,
      unit: 'Request',
      freeTierType: 'Always Free',
    },
    {
      service: 'Amazon DynamoDB',
      description: 'DynamoDB - Provisioned WCU',
      actualUsageAmount: 25,
      limit: 25,
      unit: 'WCU',
      freeTierType: '12 Months Free',
    },
  ],
} = {}): Reads {
  return {
    costByService: {
      ResultsByTime: [{
        TimePeriod: { Start: '2026-08-01', End: '2026-08-10' },
        Groups: services.map(([service, amount]) => ({
          Keys: [service],
          Metrics: { UnblendedCost: { Amount: amount, Unit: 'USD' } },
        })),
      }],
    },
    costAllocationTags: {
      CostAllocationTags: [{ TagKey: projectTag.key, Type: 'UserDefined', Status: tagStatus }],
    },
    projectCostByService: projectServices === null ? null : {
      ResultsByTime: [{
        TimePeriod: { Start: '2026-08-01', End: '2026-08-10' },
        Groups: projectServices.map(([service, amount]) => ({
          Keys: [service],
          Metrics: { UnblendedCost: { Amount: amount, Unit: 'USD' } },
        })),
      }],
    },
    freeTierUsage: { freeTierUsages: freeTier },
  };
}

function textOf(result: ReturnType<typeof evaluateMonthClose>): string {
  return result.lines.join('\n');
}

describe('month-close: the project tag is the declared one', () => {
  it('uses exactly the declared cost-allocation tag key and value', () => {
    expect(projectTag.key).toBe(costAllocationTag['cost-allocation-tag-key']);
    expect(projectTag.value).toBe(costAllocationTag['cost-allocation-tag-value']);
  });
});

describe('month-close: a zero account month, tag not yet activated', () => {
  const result = evaluateMonthClose({ reads: reads() });

  it('exits zero: an account at $0.00 proves the project at $0.00 by arithmetic', () => {
    expect(result.exitCode).toBe(0);
  });

  it('reads the month-to-date account spend as $0.00', () => {
    expect(textOf(result)).toContain('month-to-date');
    expect(textOf(result)).toContain('$0.00');
  });

  it('states plainly that per-project attribution awaits tag activation', () => {
    expect(textOf(result)).toContain('not yet activated');
    expect(textOf(result)).toContain(projectTag.key);
  });

  it('lists every free-tier line in use with its type', () => {
    const text = textOf(result);
    expect(text).toContain('AWS Lambda');
    expect(text).toContain('Always Free');
    expect(text).toContain('Amazon DynamoDB');
    expect(text).toContain('12 Months Free');
    expect(text).toContain('25/25 WCU');
  });

  it('reports the Anthropic limit as an external audit obligation, never as checked', () => {
    const text = textOf(result);
    expect(text).toContain('Anthropic');
    expect(text).toContain('external audit obligation');
    expect(text).not.toMatch(/Anthropic.*verified/i);
  });
});

describe('month-close: a non-zero account month, tag not yet activated', () => {
  const result = evaluateMonthClose({
    reads: reads({ services: [['Amazon Simple Storage Service', '3.42'], ['AWS Lambda', '0.0000001']] }),
  });

  it('exits non-zero: an unattributable non-zero month can never pass as a project $0.00', () => {
    expect(result.exitCode).not.toBe(0);
  });

  it('names the service that billed', () => {
    expect(textOf(result)).toContain('Amazon Simple Storage Service');
    expect(textOf(result)).toContain('3.42');
  });

  it('ignores sub-cent rounding noise when naming services', () => {
    expect(textOf(result)).not.toMatch(/AWS Lambda[^\n]*\$0\.00\b.*above/);
  });

  it('says attribution needs the tag activated instead of guessing whose spend it is', () => {
    expect(textOf(result)).toContain('not yet activated');
    expect(textOf(result)).toContain('cannot be attributed');
  });
});

describe('month-close: tag active, another project bills, this one is at zero', () => {
  const result = evaluateMonthClose({
    reads: reads({
      services: [['Amazon Relational Database Service', '7.10']],
      tagStatus: 'Active',
      projectServices: [],
    }),
  });

  it('exits zero: the project-scoped month is provably $0.00', () => {
    expect(result.exitCode).toBe(0);
  });

  it('says the project-scoped month closed at $0.00 while naming the account total honestly', () => {
    const text = textOf(result);
    expect(text).toContain(projectTag.value);
    expect(text).toContain('$0.00');
    expect(text).toContain('7.10');
  });
});

describe('month-close: tag active and this project billed', () => {
  const result = evaluateMonthClose({
    reads: reads({
      services: [['AWS Lambda', '0.06']],
      tagStatus: 'Active',
      projectServices: [['AWS Lambda', '0.06']],
    }),
  });

  it('exits non-zero naming the service', () => {
    expect(result.exitCode).not.toBe(0);
    expect(textOf(result)).toContain('AWS Lambda');
    expect(textOf(result)).toContain('0.06');
  });
});
