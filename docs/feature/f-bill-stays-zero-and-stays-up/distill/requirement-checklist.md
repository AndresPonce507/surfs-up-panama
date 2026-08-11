# Requirement checklist: f-bill-stays-zero-and-stays-up

Extracted at workspace-open (2026-08-09) from `feature-delta.md` (Slice Plan + Definition of
Done + plan notes), `system-architecture.md` §5, §9, §10, §11, `08-devops.md` §7, §9, §11,
`04-ingest-pipeline.md` §3, and the live account state verified read-only 2026-08-09
(HANDOFF §10). One row per requirement. Category from the closed set
{ui, e2e, nfr, security, validation, build, functional}.

This file is the SSOT of what must be covered. Coverage markers: a test covers `Rn` iff it
carries a Gherkin `@covers-Rn` tag or a `// covers: Rn` comment inside the test body.
Acceptance tests are written Just In Time, per slice, when each slice legally enters DISTILL
(HANDOFF §1, §4); every row below is expected-uncovered today and visible from day one so no
requirement is silently dropped.

UI mandate classification: this feature is NON-VISUAL end to end, so it carries zero `ui`
rows on purpose. Rationale recorded in `feature-delta.md` §"UI quality classification": every
observable is a terminal output with a real exit code, an email in Andres's inbox, or a
command's printed report. U1-U7 checks and the U8 observation are N/A; fabricating pixel
checks for a CI gate would be the exact theater the workflow rule forbids (HANDOFF §4,
post-Slice-03 workflow decision).

| # | Requirement | Category |
|---|---|---|
| R1 | Archive bucket versioning is declared in `infra/` on the bucket holding the `predictions/` prefix, and the default `infra` job of `npm run ci:local` rejects a synthesized definition whose archive bucket lacks it (slice-01; `08-devops.md` §11 decision 1 option b) | build |
| R2 | The versioning rejection names the bucket, the missing versioning, and that the prediction log has no other recovery path; exit code non-zero, never a warning (slice-01) | build |
| R3 | The versioning assert iterates every synthesized `AWS::S3::Bucket` (extending the existing loop in `infra/test/guardrails.test.ts`), so the real bucket is covered the day it exists without editing the test (slice-01) | build |
| R4 | The versioning assert is demonstrated red once before green (`system-architecture.md` §11 doctrine) (slice-01) | build |
| R5 | A deploy is rejected when the dead-man's switch alarm declaration is missing entirely (slice-02) | build |
| R6 | A deploy is rejected when the switch's missing-data handling is anything other than BREACHING, the property that converts absence into failure (`08-devops.md` §7) (slice-02) | build |
| R7 | A deploy is rejected when the switch evaluates fewer than 2 consecutive 1 h periods (slice-02) | build |
| R8 | A deploy is rejected when the switch lacks either its ALARM action or its OK action (slice-02) | build |
| R9 | Every slice-02 rejection names WHICH of the four properties broke, in words, never a generic "alarm invalid" (slice-02) | build |
| R10 | The declared switch watches the `IngestSuccess` metric produced by the metric filter, never the Lambda directly (`system-architecture.md` §10 alarm 1; `04-ingest-pipeline.md` §3 step 8) (slice-02) | validation |
| R11 | The slice-02 asserts are demonstrated red once before green (slice-02) | build |
| R12 | A deploy is rejected when the $18 action-enabled budget is absent or its threshold drifts from $18, and the rejection names the expected and found values (slice-03) | build |
| R13 | The $18 deny scope is guarded to exactly the four write Function URLs (report, mint, push, photo-presign per `system-architecture.md` §6); a scope reaching any other resource is rejected naming the extra resource (slice-03) | security |
| R14 | A deny scope naming the ingest role is rejected, and the rejection names the archive as the reason: a billing flood must never stop the prediction log (`system-architecture.md` §9 guardrail 8 regression guard) (slice-03) | security |
| R15 | The $1, $5, $15 alert lines and the $20 last line are declared in the same place as the $18 line; the $20 line is CREATED by this project, never claimed as imported, because zero CloudWatch alarms exist on the account and the only $20 budget belongs to the other project (verified 2026-08-09, HANDOFF §10; corrects `system-architecture.md` §9 guardrail 9) (slice-03) | build |
| R16 | Every resource this project declares carries the project cost-allocation tag, the step that makes a project-scoped budget and a project-scoped $0.00 possible on a shared account (`system-architecture.md` §19 flag 6) (slice-03) | build |
| R17 | The slice-03 rejections each name which money line or scope broke; the asserts are demonstrated red once before green (slice-03) | build |
| R18 | Live, once, post-deploy: with the ingest schedule disabled for a test window, the ALARM email arrives at the confirmed subscription naming the alarm, the region and the state reason, within the honest 2 to 3 hour floor of `08-devops.md` §7, never promised within the hour (slice-04) | e2e |
| R19 | Live, once, post-deploy: after re-enabling the schedule and a successful run, the OK email arrives and closes the loop; the site's freshness stamp advances (`08-devops.md` §7 runbook step 4) (slice-04) | e2e |
| R20 | One command prints this project's month-to-date spend read from the account (Cost Explorer data, not a design estimate), with currency and period, exit zero at $0.00 (slice-05) | functional |
| R21 | The same command prints every free-tier line the project consumes this month with that line's type (always-free vs 12-month), the field that closes HANDOFF §6 item 8 automatically at month 13 (slice-05) | functional |
| R22 | The command exits non-zero and names the service the first month anything on this project is above $0.00 (slice-05) | functional |
| R23 | The command reports the Anthropic $5 console limit as an external audit obligation and never claims it was checked; no API exists for it (`system-architecture.md` §9 guardrail 10; pattern in `infra/lib/audit-obligations.ts`) (slice-05) | validation |
| R24 | While the project cost-allocation tag is inactive, the command presents account-wide spend AS account-wide, shared with the other project's Amplify and RDS, and never as this project's number (slice-05) | validation |
| R25 | Feature-wide: every gate above runs inside the local `npm run ci:local` gate with its real exit code; nothing depends on hosted CI, which is billing-capped and rejected on reliability grounds (`08-devops.md` §8) | nfr |
| R26 | Feature-wide: read paths never require write credentials; the slice-05 reader works with the read-only identity verified 2026-08-09, and no slice hands an agent a credential that can write to the account (`08-devops.md` §4) | security |

## Current DISTILL coverage

Slices 01, 02 and 03 entered DISTILL and shipped (2026-08-09). R1-R17 covered in
`tests/acceptance/f-bill-stays-zero-and-stays-up/bill-and-uptime-guardrails.feature`
(`@covers-R1` through `@covers-R17` tags) plus unit-level red-proof coverage in
`infra/test/guardrails.test.ts`: `assertBucketVersioningEnabled` (R1, R2, R4) and
`assertCostAllocationTagPresent` (R16).

Updated 2026-08-09 (DEVOPS/platform lane): slice-05 shipped. R20-R24 are covered by the three
`@slice-05` scenarios (recorded-reads mode of `infra/month-close.mjs`) plus 13 unit tests in
`infra/test/month-close.test.ts`, and the live half of R20/R21/R23/R24 was proven once against
the real account (exit 0 at $0.00; see `red-classification.md`). R22's live half (a real
above-zero month) is unprovable until such a month exists, by construction; its logic is covered
by the negative scenario and units. R26 held: the slice-05 reader runs on read-only
`ce`/`freetier` grants alone, and no credential that can write a production data store was
created or held by this lane.

Updated again 2026-08-09, after the first real deploy (`aws-permission-inventory.md` §7):

- **R1 and R16 now have live proof, not only a CI assert.** The real archive bucket
  `surfs-up-panama-site-602167897909` exists and returns versioning `Status: Enabled` and the
  tag `Project=surfs-up-panama` from the live S3 API. Guardrail 4 also holds against the real
  lifecycle configuration: the three rules match `raw/`, `photos/` and the multipart-abort
  case, and none expires or transitions anything under `predictions/`. Slice-01's promise is
  no longer a declaration about a bucket that might one day exist.
- **Slice-04 is still blocked, but the blocker changed and got deeper.** The permission
  blocker cleared. Three new ones replaced it, each independently sufficient: there is no
  ingest schedule to disable, because `SurfsUpPanamaIngest` rolled back on a Lambda
  concurrency quota of 10 (`feature-delta.md` pre-requisite 7); the alarm topic's email
  subscription is `PendingConfirmation`, and R18 requires a *confirmed* subscriber
  (pre-requisite 5); and R19's OK half additionally needs a real `ingest.success` event that
  the deployed placeholder handler deliberately never emits, which must not be faked to close
  the row.
- **R25 nuance worth stating once.** The CI gate proves the *declarations*. It cannot prove
  the deployed reservations, and this deploy is the demonstration: every slice-01 to
  slice-03 assert was green while the account could not actually set a single reserved
  concurrency. A green gate is necessary and not sufficient, exactly as CLAUDE.md warns.

Updated 2026-08-10 (infra lane, read-only re-probe; full record in
`aws-permission-inventory.md` §9):

- **Two of slice-04's three blockers cleared.** The concurrency quota was raised 10 → 1000
  (observed via `lambda:GetAccountSettings` and `L-B99A9384` through the lookup role), and
  the alarm topic now carries a confirmed email subscriber. The remaining gaps are the human
  redeploy (delete the `ROLLBACK_COMPLETE` ingest shell first, write stack LAST) and R19's
  need for real pipeline code emitting `ingest.success`, owned by the ingest lane.
- **Slice-02's load-bearing property is now proven live, not only declared.** The deployed
  switch transitioned `INSUFFICIENT_DATA → ALARM` at 2026-08-09T21:56-05:00 with state
  reason *"no datapoints were received for 2 periods and 2 missing datapoints were treated
  as [Breaching]"* — BREACHING converted absence into failure on this account, answering
  the open question `aws-permission-inventory.md` §7 posed. This satisfies R18's
  *observable*; its stated *procedure* (disable, ALARM, re-enable, OK) still awaits the
  redeploy and real ingest code, and the two remain distinct on purpose.
- **The 13/113 arithmetic re-verified from the synthesized templates** (8 functions:
  fetch 2, build 2, report 2, mint 1, push 1, photo-presign 1, resize 2, breaker 2), and
  the sum-13 guardrail assert re-proven falsifiable by poison (declared sum drifted to 17;
  the assert failed naming 13 vs 17; poison reverted, revert verified by an empty
  `git diff`).

Architectural note recorded here because it changes how future slices must be authored: the
declaration checks for slices 01-03 do NOT live inside the pre-existing
`evaluateInfrastructureDeclarations` function in `infra/guardrail-evaluator.mjs`. That function is
exercised directly, via `declarationInput`-mode calls, by the keystone `daily-call-with-permanent-
receipts` feature's own frozen, off-limits fixture
(`tests/acceptance/daily-call-with-permanent-receipts/fixtures/controlled-infrastructure-
declarations/`), which predates this feature and cannot declare F-BILL's new keys. Adding hard
requirements there regressed that fixture's "clean declaration" scenario to a false failure. The
fix: a new, separate `evaluateBillGuardrails` phase in the same file, wired into
`scripts/ci-local-core.mjs`'s `runInfrastructureJob` immediately after the existing declaration
phase and before the vitest/synth phases. It never runs under `declarationInput`-mode, so it never
reaches -- and never breaks -- the keystone's fixture. This feature's own negative scenarios drive
it through the "public-contained-root" pattern (`runLocalCi({ argv: ['--job=infra'], repoRoot:
copy.root })`, no `declarationInput`), which the keystone's own suite already established as a
precedent. Any future slice adding a new required declaration key must follow this same
separate-phase pattern, never add to `evaluateInfrastructureDeclarations` directly.

Slices 01 to 03 additionally share one serial file lane (`infra/lib/guardrail-declarations.ts`,
`infra/bin/app.ts`, `infra/test/guardrails.test.ts`, `infra/guardrail-evaluator.mjs`, plus the
`scripts/ci-local-core.mjs` job registry) and must not open concurrently with keystone slice-08.
