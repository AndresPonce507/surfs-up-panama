// WHY-NEW-FILE: tests/unit/ci-local-fast-gate.test.ts
//   CLOSEST-EXISTING: none. `scripts/ci-local-core.mjs` had no test of its own
//     job-selection logic; the jobs it runs were only ever verified by running
//     them.
//   PARALLEL-RATIONALE: this owns which jobs the gate SELECTS, not what any of
//     them does. A failure here means the gate is checking the wrong set.
//
// Two decisions live in this file, and the second one is the load-bearing half.
//
// 1. `--fast` is the gate the pre-push hook runs on a feature branch. It must
//    NOT run the acceptance jobs. This project writes acceptance tests JIT, one
//    slice at a time, so a branch mid-slice is red by design: gating its push on
//    acceptance means work that is correct and complete for its wave can never
//    reach the remote. On 2026-08-10 that had five lanes holding commits they
//    could not push.
//
// 2. The FULL gate must still run both. `scripts/merge-pr.mjs` invokes
//    `ci-local.mjs` with no arguments, and it is the only way anything lands on
//    a trunk. GitHub Actions is billing-capped account-wide, so there is no
//    hosted CI behind this: if the full gate ever stops running acceptance, a
//    slice can reach main with its scenarios red and NOTHING else would catch
//    it. That is why the second assertion matters more than the first — the
//    first costs a push, the second costs the trunk.
//
// A config change is tested by parsing the config, never by an end-to-end run
// against a deployed thing. The gate is driven here with a stub command runner,
// so nothing is spawned and the test stays sub-second.

import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain ESM script, no type declarations alongside it.
import { runLocalCi } from '../../scripts/ci-local-core.mjs';

const ACCEPTANCE_STEPS = ['test:at', 'test:e2e'] as const;

/**
 * Runs the gate with every command stubbed out and reports which acceptance
 * npm scripts it tried to invoke. Nothing is spawned: the point is the
 * selection, not the outcome.
 */
async function acceptanceStepsInvokedBy(argv: readonly string[]): Promise<string[]> {
  const invoked: string[] = [];
  await runLocalCi({
    argv: [...argv],
    output: { write() {}, error() {} },
    commandRunner: async (_command: string, args: string[]) => {
      invoked.push(args.join(' '));
      return { status: 0, out: '' };
    },
  });
  return ACCEPTANCE_STEPS.filter((script) => invoked.some((call) => call.includes(script)));
}

describe('local CI job selection', () => {
  it('leaves the acceptance jobs out of --fast, so a red-by-design slice branch can still push', async () => {
    expect(await acceptanceStepsInvokedBy(['--fast'])).toEqual([]);
  });

  it('still runs both acceptance jobs in the full gate, which is the only path to a trunk', async () => {
    // If this ever goes empty, `npm run merge:pr` stops checking acceptance and
    // there is no hosted CI standing behind it. Do not relax this to make a
    // branch pushable; relax --fast instead.
    expect(await acceptanceStepsInvokedBy([])).toEqual(['test:at', 'test:e2e']);
  });

  it('runs an acceptance job when asked for it by name, even under --fast', async () => {
    // --job= is an explicit request and outranks the fast exclusion, so there
    // is always a way to run acceptance locally without the full gate.
    expect(await acceptanceStepsInvokedBy(['--fast', '--job=at'])).toEqual(['test:at']);
  });
});
