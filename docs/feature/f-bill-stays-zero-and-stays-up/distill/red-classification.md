# RED classification history

Feature: `f-bill-stays-zero-and-stays-up`
Slices: none entered DISTILL yet
Workspace opened: 2026-08-09

## Current state, honestly

No acceptance scenario exists for this feature and none was authored at workspace-open. The
JIT rule (HANDOFF §1, §4) forbids writing a slice's tests before that slice legally enters
DISTILL, and this file records classifications, it does not pre-write them. An empty history
here is the correct state today; a green run against zero tests is never evidence of behavior
(the keystone learned this: "No test files found" exits green and proves nothing, see its own
`red-classification.md`).

## Contract for every future entry

When a slice enters JIT DISTILL, its scenarios are run once before DELIVER and each failure is
classified here, one row per scenario:

- `MISSING_FUNCTIONALITY`: the scenario reached its observable and failed at the behavior
  oracle. The only classification that admits a slice into DELIVER. Correct RED.
- `IMPORT_ERROR` / `FIXTURE_BROKEN` / `SETUP_FAILURE`: the scenario never reached its oracle.
  Wrong RED; fix the test, never hand it to a crafter.
- `WRONG_ASSERTION` / `OBSERVABLE_NOT_AT_PORT`: the assertion couples to internals instead of
  the command surface. Wrong shape; fix the observable.

Every new gate in slices 01 to 03 additionally owes the red-once demonstration of
`system-architecture.md` §11: the assert is shown failing against the drifted declaration
before it counts as a guardrail. That demonstration is recorded here with the exact drift and
the exact rejection text observed.

Slices 04 and 05 produce no scaffold-RED entries: their proofs are live and human-run (an
ALARM/OK email pair, a command's report and exit code against the real account). Their
charters in `docs/product/expectations/f-bill-stays-zero-and-stays-up/` are the oracle; their
outcomes land in each charter's session log, and this file records only whatever local
command-surface tests those slices do ship.

## Commands that will be observed

```sh
npm run ci:local            # captured with its real exit code, never piped into tail
npm run test:at -- --tags @slice-NN
```

## Classification log

| Slice | Scenario | Observable exercised | Classification | Evidence |
| --- | --- | --- | --- | --- |
| slice-01 | The default infrastructure job proves the real archive bucket ships with versioning | `runLocalCi --job=infra` output, real repo | MISSING_FUNCTIONALITY | Real infra job ran, exited 0, but output omitted "archive bucket versioning" (production had not declared it yet). `assertIncludes` failed on a real string absence, not a collection/import error. |
| slice-01 | A contained declaration missing archive bucket versioning is rejected | `runLocalCi` declaration-only output, contained fixture | MISSING_FUNCTIONALITY | Fixture mutated `'archive-bucket-versioning': 'Enabled'` -> `'Suspended'`; evaluator had no check yet, so exit code stayed 0 when the test expected non-zero. Legitimate business-logic RED. |
| slice-01 | (vitest) rejects a constructed bucket missing the declared versioning status | `assertBucketVersioningEnabled` direct call | MISSING_FUNCTIONALITY | Helper did not exist; `ReferenceError` before the assertion helper was written, then a real `.toThrow()` mismatch once stubbed, until the helper's message matched. |
| slice-02 | The default infrastructure job names the dead-man's switch's four load-bearing properties | `runLocalCi --job=infra` output, real repo | MISSING_FUNCTIONALITY | Real infra job ran, exited 0, output omitted `IngestSuccess`/`BREACHING`/etc. (not yet declared). |
| slice-02 | Every dead-man's switch property regression is rejected naming exactly that property | `runLocalCi` contained-root output, per-row mutation | MISSING_FUNCTIONALITY | Each of the 4 rows (missing-data handling, evaluation periods, ALARM action, OK action) mutated in a fresh fixture copy; evaluator had no check yet, exit code stayed 0 for every row. |
| slice-02 | A contained declaration with no dead-man's switch at all is rejected | `runLocalCi` contained-root output, anchor renamed | MISSING_FUNCTIONALITY | `deadMansSwitchDeclaration` anchor renamed to `removedDeadMansSwitchDeclaration`; evaluator had no presence check yet, exit code stayed 0. |
| slice-03 | The default infrastructure job names the five money lines, the created-not-imported $20 line, and the exact deny scope | `runLocalCi --job=infra` output, real repo | MISSING_FUNCTIONALITY | Real infra job ran, exited 0, output omitted "$18 action-enabled budget" (not yet declared/checked). |
| slice-03 | Every money-line or deny-scope regression is rejected naming exactly what broke | `runLocalCi` contained-root output, per-row mutation | MISSING_FUNCTIONALITY | Threshold-drift row: evaluator had no $18 check, so mutation reached the (bare-fixture) vitest-existence guard instead of a money-line rejection -- assertion on the missing "$18 action-enabled budget" wording failed correctly, proving the check did not exist. |
| slice-03 | (vitest) rejects a constructed resource missing the project cost-allocation tag | `assertCostAllocationTagPresent` direct call | MISSING_FUNCTIONALITY | Helper did not exist until written; then a real `.toThrow()` mismatch until wording matched. |

### Drift demonstrated red, exact text observed (system-architecture.md §11 doctrine)

- Bucket versioning suspended: `archive bucket versioning: observed Suspended; required Enabled; the prediction archive bucket has no other recovery path if a single console delete happens; restore archive-bucket-versioning` (exit 1).
- Missing-data handling drifted to `RECOVERY_POINTS`: `dead-man's switch missing-data handling: observed RECOVERY_POINTS; required BREACHING; without BREACHING a missing datapoint holds the alarm green forever, exactly when everything is dead; restore dead-mans-switch-treat-missing-data` (exit 1).
- Evaluation periods dropped to `1`: `dead-man's switch evaluation periods: observed 1; required at least 2 consecutive 1 h periods; fewer risks alarming on a single missed hour instead of a genuine stall; restore dead-mans-switch-evaluation-periods` (exit 1).
- ALARM action removed: `dead-man's switch ALARM action: observed missing; required present; without an ALARM action nobody is notified the ingest stalled; restore dead-mans-switch-alarm-action` (exit 1).
- OK action removed: `dead-man's switch OK action: observed missing; required present; without an OK action nobody learns the ingest recovered; restore dead-mans-switch-ok-action` (exit 1).
- Whole declaration renamed away: `dead-man's switch declaration: missing entirely; the forecast could freeze in silence with nobody notified; restore deadMansSwitchDeclaration in infra/lib/guardrail-declarations.ts` (exit 1).
- $18 threshold drifted to `25`: `$18 action-enabled budget: observed 25; required $18; restore budget-action-18` (exit 1).
- Deny scope widened past the four write Function URLs: `budget deny scope: observed extra target(s) write-extra-function-url; required exactly the four write Function URLs (report, mint, push, photo-presign); remove write-extra-function-url from budgetDenyScopeTargets` (exit 1).
- Deny scope names the ingest role: `budget deny scope: observed ingest-lambda-execution-role included; a billing flood must never be able to stop the prediction log at predictions/; remove ingest-lambda-execution-role from budgetDenyScopeTargets` (exit 1). This is the heaviest negative in the feature (system-architecture.md §9 guardrail 8 regression guard).
- $20 last line claims import (`budget-last-line-source` drifted to `imported-from-account`): `$20 last line source: observed imported-from-account; required created-by-project; the account has zero CloudWatch alarms and the only $20 budget belongs to another project, so this line must be created, never imported; restore budget-last-line-source` (exit 1). Added post-review: R11/R17 require the drift asserts demonstrated red, and this specific one (R15's "created, never imported" claim) had no negative until this addition.
- Dead-man's switch watched-metric drifted to `IngestFailure`: `dead-man's switch watched metric: observed IngestFailure; required IngestSuccess; the switch must watch the metric the fetch Lambda emits, never the Lambda directly; restore dead-mans-switch-metric` (exit 1). Added post-review to give R10 a negative, not just a positive assertion.

### Post-commit hardening (advisor review, same day)

Three gaps found after the first commit (`a4e93e1`), fixed before reporting done:
1. The cost-allocation-tag vitest test only asserted `AWS::Lambda::Function` and `AWS::S3::Bucket`, silently passing regardless of whether `AWS::IAM::Role` and `AWS::Logs::LogGroup` were tagged, even though R16 says "every resource". Verified via a real `cdk synth` + JSON inspection that `Tags.of(stack).add(...)` does propagate to all four types (24 taggable resources total); the test now asserts over all four and pins the exact count.
2. The acceptance assertion for the cost-allocation tag checked for the words `'Project'` and `'surfs-up-panama'` independently, which is true of several unrelated lines in the evaluator's own output (tautological). Tightened to the joined `Project=surfs-up-panama` string.
3. Added the two negatives above ($20 import claim, watched-metric drift) to close R10 and R15's "demonstrated red" requirement, which had positive-only coverage.

## Slice-05 entries (2026-08-09, DEVOPS/platform lane)

Slice-05 shipped a local command surface after all (`node infra/month-close.mjs` with a
`--input` recorded-reads mode), so it DOES produce entries here, narrowing the "no scaffold-RED"
prediction above. Honest sequencing note: the pure core was built unit-first (13 tests in
`infra/test/month-close.test.ts`, watched RED on an empty skeleton with real assertion failures
like `expected '' to contain 'month-to-date'`, then GREEN), and the three `@slice-05` acceptance
scenarios were authored afterwards against the working core, so their first run was green. Per
the falsifiability doctrine they were then proven able to fail:

| Poison | Layer that caught it | Exact evidence |
| --- | --- | --- |
| `evaluateMonthClose` forced to `exitCode: 0` | AT negative scenario | `WHAT: a month above $0.00 was accepted as closed at zero.` (exit 1) |
| billed-service naming dropped from the report | AT negative scenario AND unit suite | `WHAT: the produced local-CI output omits "Amazon Simple Storage Service". WHY: the failing month must name the service that billed.` (both exit 1) |

Both poisons reverted; reverts verified by grep for the poison marker and a fully green re-run
(10 scenarios / 110 steps; 13/13 unit). Live proof against the real account, 2026-08-09:
exit 0, `month-to-date account spend (2026-08-01 to 2026-08-10): $0.00`, three real free-tier
lines each carrying `Always Free`, the honest `not yet activated` attribution statement, and the
Anthropic external-audit line.

## The four real stacks: red-then-green record (same lane, same day)

The 23 new real-stack asserts in `infra/test/guardrails.test.ts` were authored against empty
skeleton stacks and watched failing on real assertion errors (19 failed / 15 passed, exit 1)
before any stack resource existed. After implementation (34/34 green), each load-bearing
guardrail was poisoned once and watched fail naming the right thing, then reverted:

| Poison | Exact rejection observed |
| --- | --- |
| Site bucket `versioned: false` | `SiteBucket... lack Enabled versioning: the prediction archive has no other recovery path if a single console delete happens` |
| Extra lifecycle rule at `predictions/` | length assert 3 vs 4 (count layer; the overlap layer keeps its own shipped constructed-rule red proofs) |
| Stack-only lifecycle prefix drift onto `predictions/photos/` | equality-vs-declaration assert (`deeply equal`) |
| Report reserved concurrency forced to 10 | `surfs-up-panama-report reserved concurrency` expected 2, plus the sum-13 assert |
| Dead-man `TreatMissingData` flipped to `notBreaching` | template match failure showing `"TreatMissingData": "notBreaching"` against required `breaching` |
| `surfs-up-panama-fetch` added to the breaker's concurrency scope | resolved-resource set mismatch naming `surfs-up-panama-fetch` |
| Write URL CORS origin widened to `*` | `expected '*' not to be '*'` on the exact-origin assert |
| $18 budget's SNS breaker subscriber removed | `expected [] to have a length of 1` on the SNS-subscriber assert |

### Known collision, resolved (record for future slices)

Adding these checks directly inside `evaluateInfrastructureDeclarations` first produced a real
regression: the keystone `daily-call-with-permanent-receipts` suite's "A clean declaration
inspection reports no prediction-reaching lifecycle rules" scenario went from green to
`archive bucket versioning: observed missing` (exit 1), because that suite calls the shared
evaluator directly via `declarationInput`-mode against its own frozen fixture, which cannot know
about F-BILL's new keys and is off-limits to edit. Resolved by moving all F-BILL checks into a
separate `evaluateBillGuardrails` phase that only runs inside the full `infra` job composition
(`scripts/ci-local-core.mjs`), never under `declarationInput`-mode. Full untagged
`npm run test:at` (61 scenarios) reverified green after the fix. See
`requirement-checklist.md`'s "Current DISTILL coverage" section for the architectural note.
