// F-BILL slice-05 pure core: turns recorded account reads into the month
// report and its exit code. No AWS calls, no process access; the CLI shell
// (month-close.mjs) owns IO.
//
// A project-scoped $0.00 is claimed only when the tag-filtered read is zero,
// or when the whole account is zero. Any non-zero shared-account month whose
// project tag is inactive fails closed rather than claiming it belongs here.

// Mirrors costAllocationTag in infra/lib/guardrail-declarations.ts; the unit
// suite asserts the mirror never drifts (this file cannot import TypeScript).
export const projectTag = { key: 'Project', value: 'surfs-up-panama' };

const CENT = 0.005;

function readCostAndUsage(costAndUsage, name) {
  const result = costAndUsage?.ResultsByTime?.[0];
  if (!Array.isArray(costAndUsage?.ResultsByTime) || costAndUsage.ResultsByTime.length !== 1 || result?.TimePeriod?.Start === undefined || result.TimePeriod?.End === undefined || !Array.isArray(result.Groups)) {
    throw new Error(`${name} cost read is unavailable or incomplete`);
  }
  return {
    period: result.TimePeriod,
    services: result.Groups.map((group) => {
      const service = group?.Keys?.[0];
      const amount = Number(group?.Metrics?.UnblendedCost?.Amount);
      if (typeof service !== 'string' || service.length === 0 || !Number.isFinite(amount)) throw new Error(`${name} cost read has an invalid service amount`);
      return { service, amount };
    }),
  };
}

function total(services) {
  return services.reduce((sum, { amount }) => sum + amount, 0);
}

function dollars(amount) {
  if (Math.abs(amount) < CENT) return '$0.00';
  return `${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(2)}`;
}

function billedServices(services) {
  return services.filter(({ amount }) => amount >= CENT);
}

function creditedServices(services) {
  return services.filter(({ amount }) => amount <= -CENT);
}

function isMaterial(amount) {
  return Math.abs(amount) >= CENT;
}

export function evaluateMonthClose({ reads }) {
  const lines = [];
  let account;
  try {
    if (!Array.isArray(reads?.costAllocationTags?.CostAllocationTags)) throw new Error('cost-allocation-tag read is unavailable or incomplete');
    if (!Array.isArray(reads?.freeTierUsage?.freeTierUsages)) throw new Error('free-tier read is unavailable or incomplete');
    for (const row of reads.freeTierUsage.freeTierUsages) {
      if (typeof row?.service !== 'string' || typeof row?.description !== 'string' || typeof row?.unit !== 'string' || !['Always Free', '12 Months Free'].includes(row?.freeTierType) || !Number.isFinite(Number(row?.actualUsageAmount)) || !Number.isFinite(Number(row?.limit))) throw new Error('free-tier read has an invalid usage row or allowance type');
    }
    account = readCostAndUsage(reads.costByService, 'account');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'required billing read is unavailable';
    return { exitCode: 2, lines: [`month close: INDETERMINATE: ${reason}; retry with complete account, tag, and free-tier reads`] };
  }
  const accountTotal = total(account.services);
  const period = account.period.Start && account.period.End
    ? `${account.period.Start} to ${account.period.End}`
    : 'current month';

  lines.push(`month-to-date account spend (${period}): ${dollars(accountTotal)}`);
  for (const { service, amount } of billedServices(account.services)) lines.push(`  billed: ${service}: $${amount.toFixed(2)}`);
  for (const { service, amount } of creditedServices(account.services)) lines.push(`  credit: ${service}: ${dollars(amount)}`);

  const tagEntry = (reads.costAllocationTags?.CostAllocationTags ?? []).find((tag) => tag?.TagKey === projectTag.key);
  const tagActive = tagEntry?.Status === 'Active';
  let exitCode = 0;

  if (tagActive && reads.projectCostByService) {
    let project;
    try {
      project = readCostAndUsage(reads.projectCostByService, 'project-scoped');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'project-scoped billing read is unavailable';
      return { exitCode: 2, lines: [...lines, `month close: INDETERMINATE: ${reason}; retry with a complete tag-filtered read`] };
    }
    const projectTotal = total(project.services);
    lines.push(`project-scoped spend (${projectTag.key}=${projectTag.value}): ${dollars(projectTotal)}`);
    const billed = billedServices(project.services);
    const credited = creditedServices(project.services);
    if (isMaterial(projectTotal)) {
      exitCode = 1;
      for (const { service, amount } of billed) lines.push(`ABOVE ZERO: ${service} billed $${amount.toFixed(2)} to this project this month`);
      for (const { service, amount } of credited) lines.push(`credit: ${service}: ${dollars(amount)} to this project this month`);
    } else {
      lines.push(`the project-scoped month is provably ${dollars(0)}; account total ${dollars(accountTotal)} belongs to other work on this shared account`);
    }
  } else if (tagActive) {
    return { exitCode: 2, lines: [...lines, 'month close: INDETERMINATE: the active project tag has no tag-filtered cost read; retry with a complete tag-filtered read'] };
  } else {
    lines.push(`per-project attribution: the ${projectTag.key} cost-allocation tag is not yet activated in the Billing console (feature pre-requisite 8), so spend cannot be attributed to one project`);
    if (!isMaterial(accountTotal)) lines.push(`the whole account is at ${dollars(0)}, so this project is at ${dollars(0)} by arithmetic`);
    else {
      exitCode = 1;
      lines.push(`ABOVE ZERO: the account billed ${dollars(accountTotal)} this month and it cannot be attributed to a project until the ${projectTag.key} tag is activated`);
    }
  }

  const freeTierRows = reads.freeTierUsage?.freeTierUsages ?? [];
  lines.push(`free-tier lines in current-month use: ${freeTierRows.length}`);
  for (const row of freeTierRows) {
    const usage = `${Number(row?.actualUsageAmount ?? 0)}/${Number(row?.limit ?? 0)} ${row?.unit ?? ''}`.trim();
    lines.push(`  free tier: ${row?.service ?? 'unknown'} | ${row?.description ?? ''} | ${usage} | ${row?.freeTierType ?? 'unknown type'}`);
  }
  lines.push('Anthropic $5/month spend limit: external audit obligation (console-only, no API); confirm it whenever the Anthropic console is open, and before any builder release');
  lines.push(exitCode === 0 ? 'month close: PASS at $0.00 for this project' : 'month close: FAIL, the month is not $0.00 for this project (or cannot be proven to be)');
  return { exitCode, lines };
}
