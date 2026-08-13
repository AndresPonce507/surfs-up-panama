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

Slice-04 entered DISTILL 2026-08-13. R18 and R19 are now covered by five `@slice-04` scenarios
in the same feature file, driving a new command through its `--input` port
(`infra/alarm-probe.mjs` shell over the `infra/alarm-probe-core.mjs` pure core, mirroring the
`month-close.mjs` split). Slice-05's R20-R24 remain uncovered.

### Slice-04 substitution deviation, stated plainly

The synthetic probe slice-04 planned was NEVER PERFORMED. Nobody disabled the ingest schedule,
waited for the ALARM mail, re-enabled it and waited for the OK mail. No scenario here may be read
as if that drill happened.

What replaced it: a real production incident of 2026-08-11 to 13 drove a complete ALARM then OK
cycle on BOTH deployed dead-man's switches, and the read-only capture of it is committed at
`infra/evidence/alarm-probe-capture-2026-08-13.json`. An outage is strictly better evidence than a
drill, because nobody staged the conditions. It is also DIFFERENT evidence, and the difference is
load-bearing in three places, each of which is an explicit assertion in the scenarios rather than
something the wording glides over:

1. **The detection floor was never measured.** Both ALARM transitions fired on the alarm's FIRST
   evaluation, about a minute after the alarm was created, with `recentDatapoints` empty: absence
   from birth. There is therefore NO elapsed time from a last successful run to the ALARM anywhere
   in this history, and R18's "within the honest 2 to 3 hour floor" is proven STRUCTURALLY and
   live, read off the deployed alarm (`EvaluationPeriods: 2` x `Period: 3600` with
   `TreatMissingData: breaching`), never by stopwatch. The scenario asserts the report says so, and
   the existing slice-02 ban on the words "within the hour" is re-asserted against this report too.
2. **Nobody read the mail.** Delivery to the confirmed subscription is proven and no delivery
   failed. The message body was never opened. Scenarios may assert the state reason text that
   populates the body (it is in the capture); they may not assert that Andres read it. R18's "the
   ALARM email arrives at the confirmed subscription naming the alarm, the region and the state
   reason" is covered at the delivery-and-content level the capture supports, not at the inbox
   level it does not.
3. **The site's freshness stamp was not observed here.** R19's second half (`08-devops.md` §7
   runbook step 4) is not provable from an alarm capture. The alarm half of R19, the OK that closes
   the loop, is covered; the freshness-stamp half stays for the human charter.

The human charter
`docs/product/expectations/f-bill-stays-zero-and-stays-up/the-alarm-is-proven-alive-not-assumed-andres-disables-the-ingest-schedule-for-a-test-window.md`
still owns the inbox-level oracle and is not closed by these tests.

### Three brief-versus-file corrections found while writing slice-04

Recorded because each one would have produced a scenario asserting more certainty than the capture
earns, which is the one rule this whole product rests on.

- `NumberOfNotificationsDelivered` is non-zero in FIVE hours, not four. Four align with the four
  state transitions; the fifth, `2026-08-09T22:00:00-05:00` with `Sum: 2.0`, matches no transition
  in this capture and cannot be attributed from it. The scenarios therefore assert COVERAGE (a
  delivery was recorded in the hour of every state change) and never exactness.
- `NumberOfNotificationsFailed` is NOT empty. It has five datapoints, all `Sum: 0.0`. That is
  stronger evidence than an empty series, which could equally mean the metric never published, so
  the scenarios assert "no delivery failed" rather than "no failure data exists".
- The gap between alarm creation and the ALARM transition is 53.7 s (ingest) and 60.6 s (build),
  not ~70 s. The scenarios assert the load-bearing fact instead: both fired on their first
  evaluation with no run behind them.

### Unguarded switch, flagged not fixed

`surfs-up-panama-build-dead-mans-switch` (metric `BuildSuccess`) is deployed, live, and supplies
half the evidence above, but slice-02's CI guard covers only `surfs-up-panama-dead-mans-switch`.
No requirement in this checklist guards the build switch's four load-bearing properties. Slice-04's
scenarios watch both switches at the evidence level, which is not the same thing as a declaration
gate rejecting a drifted build switch at deploy time.

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
