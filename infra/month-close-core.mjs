// F-BILL slice-05 pure core: turns recorded account reads into the month
// report and its exit code. No AWS calls, no process access; the CLI shell
// (month-close.mjs) owns IO.
//
// Honesty rules, in order:
// - A project-scoped $0.00 is claimed ONLY when the data proves it: either
//   the Project cost-allocation tag is Active and the tag-filtered read is
//   zero, or the whole account is at $0.00 (then the project is zero by
//   arithmetic). An unattributable non-zero month exits non-zero.
// - Sub-cent amounts are rounding/credit noise, never named as spend.
// - The Anthropic $5/month limit is console-only with no API; it is reported
//   as an external audit obligation, never as checked
//   (infra/lib/audit-obligations.ts).

// Mirrors costAllocationTag in infra/lib/guardrail-declarations.ts; the unit
// suite asserts the mirror never drifts (this file cannot import TypeScript).
export const projectTag = { key: 'Project', value: 'surfs-up-panama' };

const CENT = 0.005;

function serviceAmounts(costAndUsage) {
  const result = costAndUsage?.ResultsByTime?.[0];
  const groups = result?.Groups ?? [];
  return {
    period: result?.TimePeriod ?? {},
    services: groups.map((group) => ({
      service: String(group?.Keys?.[0] ?? 'unknown'),
      amount: Number(group?.Metrics?.UnblendedCost?.Amount ?? '0'),
    })),
  };
}

function total(services) {
  return services.reduce((sum, { amount }) => sum + amount, 0);
}

function dollars(amount) {
  return `$${amount < CENT ? '0.00' : amount.toFixed(2)}`;
}

function billedServices(services) {
  return services.filter(({ amount }) => amount >= CENT);
}

export function evaluateMonthClose({ reads }) {
  const lines = [];
  const account = serviceAmounts(reads.costByService);
  const accountTotal = total(account.services);
  const period = account.period.Start && account.period.End
    ? `${account.period.Start} to ${account.period.End}`
    : 'current month';

  lines.push(`month-to-date account spend (${period}): ${dollars(accountTotal)}`);
  for (const { service, amount } of billedServices(account.services)) {
    lines.push(`  billed: ${service}: $${amount.toFixed(2)}`);
  }

  const tagEntry = (reads.costAllocationTags?.CostAllocationTags ?? [])
    .find((tag) => tag?.TagKey === projectTag.key);
  const tagActive = tagEntry?.Status === 'Active';

  let exitCode = 0;
  if (tagActive && reads.projectCostByService) {
    const project = serviceAmounts(reads.projectCostByService);
    const projectTotal = total(project.services);
    lines.push(`project-scoped spend (${projectTag.key}=${projectTag.value}): ${dollars(projectTotal)}`);
    const billed = billedServices(project.services);
    if (billed.length > 0) {
      exitCode = 1;
      for (const { service, amount } of billed) {
        lines.push(`ABOVE ZERO: ${service} billed $${amount.toFixed(2)} to this project this month`);
      }
    } else {
      lines.push(`the project-scoped month is provably ${dollars(0)}; account total ${dollars(accountTotal)} belongs to other work on this shared account`);
    }
  } else {
    lines.push(`per-project attribution: the ${projectTag.key} cost-allocation tag is not yet activated in the Billing console (feature pre-requisite 8), so spend cannot be attributed to one project`);
    if (accountTotal < CENT) {
      lines.push(`the whole account is at ${dollars(0)}, so this project is at ${dollars(0)} by arithmetic`);
    } else {
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

  lines.push(exitCode === 0
    ? 'month close: PASS at $0.00 for this project'
    : 'month close: FAIL, the month is not $0.00 for this project (or cannot be proven to be)');
  return { exitCode, lines };
}
