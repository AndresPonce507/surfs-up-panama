# The learning jobs can write only their own shelves
ID: EXP-f-forecast-learns-from-the-beach-6 · Slice: 06 · Classification: non-visual, deploy-blocked

## Intent
Nightly and monthly jobs may read only their declared inputs and write only correction or metrics
prefixes. IAM, not discipline, carries the boundary.

## Preconditions
- Slice-06 has freshly re-run RED after its own parked marker is removed.
- The observation-export producer and a learning-stack owner exist before deployment.
- CloudFormation authority is provided by the human deployment path, never assumed by this lane.

## Observable contract
- Credential-free guardrails name both schedules, memory, allowed shelves, and denied complement.
- Widened write scopes, a missing nightly clock, and a monthly write to corrections are rejected.
- Deploy, schedule, and denied-write observations remain BLOCKED until the named external facts exist.

## N/A visual rationale
This is infrastructure declaration work with terminal evidence only. U1-U7 are N/A. A passing
credential-free synth is not deploy evidence and cannot close the blocked observations.

## Session log (append-only)
| Date | Examiner | Verdict | Evidence |
|------|----------|---------|----------|
