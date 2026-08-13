# Launch checklist — f-bill-stays-zero-and-stays-up

Items this feature cannot close from a terminal. Each one is here because an agent is either
denied the action or must never hold the credential for it, not because it was skipped for time.
Opened 2026-08-13 by the slice-04 lane.

- [ ] **Confirm the four alarm emails actually arrived.** Slice-04 proves delivery to the SNS
  endpoint, not that a human read the message: `NumberOfNotificationsDelivered` is non-zero in each
  of the four hours below and `NumberOfNotificationsFailed` reports an explicit `0.0` in each of
  them, against a confirmed email subscription. What is unverified is the rendered body. Look for four messages from the
  `surfs-up-panama-alarms` topic and check each names its alarm, the `us-east-1` region, and its
  state reason:
  - `surfs-up-panama-dead-mans-switch` ALARM, 2026-08-10T02:56:25Z
  - `surfs-up-panama-build-dead-mans-switch` ALARM, 2026-08-11T18:17:58Z
  - `surfs-up-panama-dead-mans-switch` OK, 2026-08-13T00:18:56Z
  - `surfs-up-panama-build-dead-mans-switch` OK, 2026-08-13T06:23:58Z

  If a body is missing the region or the state reason, that is a real slice-04 defect and the
  scenarios need amending; the CloudWatch side is already proven.

- [ ] **Activate the `Project` cost-allocation tag key** in the Billing console. Console-only: there
  is no CLI path to activate a key, and activation lags before tagged data reaches Cost Explorer.
  This is pre-requisite 8 and it is half of what blocks slice-05. `infra/month-close-core.mjs`
  already fails closed while the key is inactive, reporting account-wide spend AS account-wide,
  shared with the other project's Amplify and RDS, rather than passing it off as this project's.

- [ ] **Decide how project-scoped spend gets read at zero cost.** The other half of slice-05, and a
  design decision rather than a click. `liveReads()` in `infra/month-close.mjs` throws on purpose
  because Cost Explorer charges per request, so today the command only runs against a recorded
  `--input` file and R20's "read from the account" is not met. Until this is settled, do not report
  slice-05 as shipped.

- [ ] **Read the applied Lambda `Concurrent executions` quota with an identity that can.**
  `andres-cli` is denied `servicequotas:GetServiceQuota`, `lambda:ListFunctions` and
  `cloudformation:DescribeStackResources`. Pre-requisite 7 is currently satisfied by inference from
  a successful deploy: AWS rejects a reservation that would leave under 100 unreserved, and the
  Write and Ingest stacks both deployed carrying theirs, so the quota is at least
  `reservedConcurrencySum + 100` = 114. A direct read would replace that inference with a number.

- [ ] **Correct the three disagreeing quota figures in the architecture docs.** `08-devops.md` §9
  item 4 says ≥ 103, `system-architecture.md` §11 blocker 1 says ≤ 102 fails, and
  `infra/lib/write-declarations.ts` computes ≥ 114. The first two predate the write path's
  reservations. Flagged by the slice-04 lane, deliberately not fixed there: editing architecture
  docs was outside its scope.

- [ ] **Guard the BUILD dead-man's switch in CI, not just the ingest one.** Found by the slice-04
  lane 2026-08-13, flagged and deliberately not fixed because slice-02's declaration lane is closed
  and this is new scope. `surfs-up-panama-build-dead-mans-switch` (metric `BuildSuccess`) is
  deployed, live, and did real work in this incident: it is the switch that caught the 2026-08-13
  archive-key defect. But R5 to R11 and slice-02's gate only ever name the ingest switch, so a
  future edit could weaken or delete the build switch and no gate would say a word. Slice-04's
  probe watches both, which closes the evidence half; the declaration half is still one-sided.

- [ ] **Amend the epic F-BILL row's "within the hour" promise** to the settled 2-to-3-hour floor, or
  overrule the design. Open question 1, unchanged, and now with live confirmation that the deployed
  alarms carry the floor's configuration (`EvaluationPeriods: 2` x `Period: 3600`, `breaching`).
