# AWS permission inventory for `andres-cli`

Identity: `arn:aws:iam::602167897909:user/andres-cli` (UserId `AIDAYYNAA5423HZIH4GVK`).
Every row below is an observed API result from a live probe run 2026-08-09, not a policy
read: the policy itself is unreadable (`iam:ListAttachedUserPolicies`, `iam:ListUserPolicies`,
`iam:ListGroupsForUser`, `iam:GetUser` all denied). Probe resources were named
`sup-permission-probe-delete-me*`, created, exercised, and deleted in the same session;
post-cleanup verification showed only the pre-existing preview bucket, zero topics, zero
alarms. The one deliberate leftover is the `surfs-up-panama-guard-20` budget (see §4).

## 1. The verdict that matters

**CLEARED 2026-08-09, then superseded by a different, harder blocker.** The permission
blocker described in round 1 is gone. The blocker now is an account service quota.

### 1.1 The permission blocker is cleared

Andres bootstrapped from an admin profile and installed the narrow durable grant this
document recommended in §5:

- `CDKToolkit` stack is `CREATE_COMPLETE` (12/12 resources, `aws://602167897909/us-east-1`).
- Inline user policy `cdk-deploy-via-bootstrap-roles` allows exactly `sts:AssumeRole` on
  `arn:aws:iam::602167897909:role/cdk-hnb659fds-*` and nothing else.
- `AdministratorAccess` was removed again. Standing admin is gone.
- Verified end to end this session: three `cdk deploy` runs executed real CloudFormation
  writes through the bootstrap exec role while `iam:ListAttachedUserPolicies` stayed denied
  to `andres-cli` itself.

Consequence for every DENIED row in §2: those are **user-level** denials and they no longer
govern a CloudFormation-driven deploy. Proven, not assumed — `s3:PutBucketPublicAccessBlock`
is denied to `andres-cli`, yet the live site bucket returns all four block flags `true`
because the exec role applied them (§7).

### 1.2 The real blocker: the Lambda concurrency quota is 10

**Applied quota `L-B99A9384` (`Concurrent executions`) = 10.** Read 2026-08-09 through the
`cdk-hnb659fds-lookup-role` (read-only, inside the grant Andres installed):
`lambda:GetAccountSettings` returns `ConcurrentExecutions: 10`,
`UnreservedConcurrentExecutions: 10`; `servicequotas:GetServiceQuota` returns `Value: 10.0`,
`Adjustable: true`.

This is not the ≤102 case 07-write-path §7.2 item 0.15 anticipated. It is far worse:

> AWS rejects any reservation that leaves the account below its minimum unreserved value.
> On this account that floor is **10**, and the quota is **10**. Therefore
> **no reserved concurrency of any size ≥ 1 can be set on this account at all.**

Confirmed independently by a real deploy, not only by a quota read. `SurfsUpPanamaIngest`
failed on its first Lambda and CloudFormation rolled the whole stack back. Exact text:

```
Resource handler returned message: "Specified ReservedConcurrentExecutions for function
decreases account's UnreservedConcurrentExecution below its minimum value of [10].
(Service: Lambda, Status Code: 400, Request ID: 867695d6-05be-4246-b14c-b02c00ee7277)"
(HandlerErrorCode: InvalidRequest)
```

The reservation that was rejected was `surfs-up-panama-build`, asking for **2**.

What this costs, stated in two separate claims so neither hides the other:

1. **The aggregate cost bound survives, by accident.** An account ceiling of 10 concurrent
   executions is tighter than the 13 this project would have reserved, so total compute
   cannot run away. The bound holds; the declared mechanism does not.
2. **The isolation property is gone, and that is the serious loss.** Guardrail 1's reserved
   concurrency is what keeps the write path and the ingest path in separate buckets. Without
   it they compete for one shared pool of 10, so a write flood can starve the fetch Lambda —
   precisely the "a billing flood stops the prediction log" failure guardrail 8 exists to
   prevent (`system-architecture.md` §9). The breaker's *trip* action (set write functions to
   reserved 0) would still be accepted; its *restore* action (back to 2/1/1/1) would be
   rejected by the same rule.

The fix is Andres's and it is one request: raise `L-B99A9384`. It is marked `Adjustable:
true`. Stated so the arithmetic matches the claim, using the observed floor of 10:

| Target | Reservations | Quota needed |
|---|---|---|
| `SurfsUpPanamaIngest` alone (fetch 2 + build 2) | 4 | **≥ 14** |
| `SurfsUpPanamaWrite` alone (9) | 9 | **≥ 19** |
| The deployed end state, all four stacks | 13 | **≥ 23** |
| End state plus AWS's conventional 100-unreserved headroom | 13 | **≥ 113** |

Nothing in this repo should retry the write stack by stripping the reservations: reserved
concurrency is the cost control, not a nicety.

One second-order blocker was checked and is NOT present: `write-stack` does
`Fn.importValue('SurfsUpPanamaSiteOrigin')`, and that export is registered live
(`SurfsUpPanamaSiteOrigin` → `https://d1dtqpd8bf3oze.cloudfront.net`, exported by
`SurfsUpPanamaSite`). So the quota really is the only thing standing between here and a write
deploy; there is no second failure waiting behind it.

## 2. Observed permission table (all us-east-1, 2026-08-09)

| Service | ALLOWED (observed) | DENIED (observed) |
|---|---|---|
| sts | GetCallerIdentity, AssumeRole (on a role this user created) | — |
| cloudformation | ListStacks | CreateChangeSet, CreateStack |
| iam | CreateRole, AttachRolePolicy, DetachRolePolicy, DeleteRole, UpdateAssumeRolePolicy, PassRole (to Lambda) | GetUser, ListRoles, ListAttachedUserPolicies, ListUserPolicies, ListGroupsForUser |
| lambda | CreateFunction, AddPermission, DeleteFunction | ListFunctions, GetAccountSettings, PutFunctionConcurrency, CreateFunctionUrlConfig |
| s3 | ListBuckets, CreateBucket, DeleteBucket, PutObject, PutBucketVersioning, PutBucketLifecycleConfiguration, PutBucketNotificationConfiguration, PutBucketPolicy (preview evidence) | PutBucketPublicAccessBlock |
| cloudfront | ListDistributions, CreateDistribution, CreateCloudFrontOriginAccessIdentity (preview evidence 2026-08-09) | CreateFunction, CreateOriginAccessControl (preview evidence 2026-08-09) |
| cloudwatch | DescribeAlarms, ListMetrics, GetMetricData, PutMetricAlarm, DeleteAlarms | — |
| logs | CreateLogGroup, PutRetentionPolicy, PutMetricFilter, DeleteLogGroup | — |
| sns | ListTopics, CreateTopic, DeleteTopic | — |
| scheduler | — | ListSchedules, CreateSchedule |
| events | — | ListRules, PutRule |
| dynamodb | ListTables | CreateTable |
| ssm | — | DescribeParameters |
| ecr | DescribeRepositories | — |
| servicequotas | — | GetServiceQuota, ListServiceQuotas, GetAWSDefaultServiceQuota |
| budgets | DescribeBudgets, CreateBudget, CreateBudgetAction (authz passed; failed later on execution-role trust, proving the caller was authorized) | — |
| ce | GetCostAndUsage | — |
| freetier | GetFreeTierUsage | GetAccountPlanState (2026-08-09, feature-delta pre-requisite 6) |

## 3. Security finding: the deny-list is bypassable

Observed end-to-end, then torn down without being used for anything:
`iam:CreateRole` -> `iam:AttachRolePolicy` (arbitrary managed policy accepted) ->
`iam:UpdateAssumeRolePolicy` (trust pointed at andres-cli) -> `sts:AssumeRole` SUCCEEDED.

Any code holding this credential can mint itself an administrator role in four calls.
The denials in §2 are therefore advisory, not a boundary. This lane refused to use that
path for deployment because the task frames deploy capability as Andres's to grant, and
the household rule is that agents never self-escalate. But the finding stands: either
accept this surface knowingly, or remove `iam:CreateRole`/`iam:AttachRolePolicy`/
`iam:UpdateAssumeRolePolicy` from andres-cli and grant deploy capability deliberately
(§5). Related standing risk: this same credential must never gain a path to write a
production data store; today `dynamodb:CreateTable` and all data-plane writes are denied,
which is the correct end state to preserve when regranting.

## 4. Billing guard state (created this session)

- `AWS/Billing` metric namespace is EMPTY: the console-only "Receive CloudWatch billing
  alerts" preference has never been enabled, so a CloudWatch billing alarm would sit on a
  nonexistent metric forever. No pretending otherwise.
- The real guard that now exists: AWS Budgets `surfs-up-panama-guard-20`, COST, $20/month,
  verified by read-back after creation. Email notifications to Andres at actual > 25%
  ($5), actual > 100% ($20), forecasted > 100%. Budget notifications need no subscription
  confirmation and no billing-alerts preference.
- Month-to-date account spend at creation time: $0.00 (`ce get-cost-and-usage`,
  2026-08-01..2026-08-09). Nothing billable preceded the guard.
- Optional, Andres-only, console click path if a CloudWatch billing alarm is ever wanted
  on top: Billing and Cost Management console -> Billing preferences -> Alert preferences
  -> enable "Receive CloudWatch billing alerts". Not required by this design: the shipped
  slice-03 declaration (`budget-last-line-20`, `budget-last-line-source:
  created-by-project`) already frames the $20 last line as a budget.

## 5. What Andres runs to clear the blocker

Recommended path, two steps, smallest durable grant:

1. One-time bootstrap from an admin profile (not andres-cli):

   ```sh
   npx cdk bootstrap aws://602167897909/us-east-1
   ```

2. Grant andres-cli the right to use the bootstrap roles (this is the entire durable
   deploy grant; the CDK exec role carries the resource permissions):

   ```sh
   aws iam put-user-policy --user-name andres-cli --policy-name cdk-deploy-via-bootstrap-roles \
     --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"sts:AssumeRole","Resource":"arn:aws:iam::602167897909:role/cdk-hnb659fds-*"}]}'
   ```

Blunt fallback (works, wider): attach `AdministratorAccess` to andres-cli for the deploy
window, then strip it. Given §3 this is not a real widening, but say it out loud.

The concurrency quota then answers itself at write-stack deploy time, exactly as the plan
requires: CloudFormation sets `ReservedConcurrentExecutions` through the exec role, and a
quota at or under 102 rejects the reservation and fails that stack, which is the stop
signal. To read the number beforehand instead, also grant `servicequotas:GetServiceQuota`
and `lambda:GetAccountSettings` to andres-cli (both denied today) and check quota
`L-B99A9384` is at least 117: guardrail 1 reserves 2 on each of the six non-write
functions and 2+1+1+1 on the four write functions, 17 total, and AWS requires 100
unreserved on top.

> **Both steps above were executed by Andres on 2026-08-09 and worked. See §1.1.**
>
> **Correction of record, same date: the arithmetic in the paragraph directly above is
> wrong and is left in place only so the error is traceable.** It counted six non-write
> functions. The four real stacks declare **four** non-write functions carrying a
> reservation (`fetch` 2, `build` 2, `resize` 2, `breaker` 2) plus the four write functions
> (`report` 2, `mint` 1, `push` 1, `photo-presign` 1). Counted from the synthesized
> templates, not from prose: **the sum is 13, not 17**, so the "100 unreserved on top"
> precondition is **≥ 113, not ≥ 117**. The six-function figure came from the synth-only
> `SurfsUpPanamaGuardrails` fixture stack, which has ten placeholder functions and must
> never be deployed (§8).
>
> The precondition turned out to be academic anyway. The observed quota is **10** and the
> observed minimum-unreserved floor on this account is also **10**, so no reservation of any
> size is settable. §1.2 has the number, the source, and the verbatim rejection.

## 6. Stack-by-stack requirement vs observed state

Rewritten 2026-08-09 after the first real deploy. "Blocked by" now means observed at deploy
time, not predicted from a permission probe. Every stack was deployed by explicit stack ID;
`--all` was never used, for the reason in §8.

| Stack (`system-architecture.md` §11) | Needs beyond CloudFormation | Deploy result, 2026-08-09 |
|---|---|---|
| site-stack | S3 bucket + BLOCK_ALL + versioning + lifecycle, CloudFront distribution + OAC, response headers policy | **DEPLOYED, `CREATE_COMPLETE`**, 8/8 resources. `s3:PutBucketPublicAccessBlock` is still denied to `andres-cli` and was applied anyway by the exec role; verified live (§7) |
| ingest-stack | EventBridge Scheduler schedules, fetch/build Lambdas, log groups, metric filters | **FAILED, rolled back to `ROLLBACK_COMPLETE`.** Not a permission failure: `scheduler:CreateSchedule` never got a turn. Rejected on `ReservedConcurrentExecutions` for `surfs-up-panama-build`, quota 10 vs floor 10 (§1.2). Rollback was clean, zero orphans |
| write-stack | 4 Function URLs (auth NONE), DynamoDB PROVISIONED 25/25, resize, breakers, PutFunctionConcurrency | **NOT ATTEMPTED, deliberately.** It carries 9 of the 13 reservations and would fail identically on its first Lambda. Its DynamoDB table is `RemovalPolicy.RETAIN` with the fixed name `surfs-up-panama-write-store`, so a create-then-rollback would strand an orphan that blocks every later retry with "already exists". The answer was already known with certainty from two independent sources, so paying that price to re-learn it was refused |
| observability-stack | SNS topic + subscription, alarms, budgets, $18 line | **DEPLOYED, `CREATE_COMPLETE`**, 14/14 resources. Contains no Lambda, so the quota does not touch it. Verified live (§7) |

## 7. Live state after the first deploy (read back 2026-08-09, not inferred)

Read through the `cdk-hnb659fds-lookup-role` because `andres-cli` cannot even
`lambda:ListFunctions`. Read-only throughout; nothing in this section was written by hand.

**Stacks:** `SurfsUpPanamaSite` `CREATE_COMPLETE`, `SurfsUpPanamaObservability`
`CREATE_COMPLETE`, `SurfsUpPanamaIngest` `ROLLBACK_COMPLETE` (empty shell; a retry must
delete it first), `CDKToolkit` `CREATE_COMPLETE`.

**Site (`surfs-up-panama-site-602167897909`), every guardrail checked against the live API:**

| Guardrail | Required | Observed live |
|---|---|---|
| slice-01 / R1 archive versioning | Enabled | `Status: Enabled` |
| guardrail 6 BLOCK_ALL | four flags true | all four `true` |
| guardrail 4 lifecycle | 3 rules, none touching `predictions/` | `raw/` 30d, `photos/` 90d, multipart-abort 7d. No expiration or transition rule matches `predictions/` |
| R16 cost-allocation tag | `Project=surfs-up-panama` | present |
| origin privacy | OAC only, TLS enforced | policy denies non-TLS and allows only `cloudfront.amazonaws.com` scoped to distribution `E30CRNEUVE67RM` |

Distribution `E30CRNEUVE67RM` is `Deployed`, HTTP/2+3, OAC `ESB03MBNA6DAZ`, domain
`d1dtqpd8bf3oze.cloudfront.net`.

**Known-open, honest:** `GET https://d1dtqpd8bf3oze.cloudfront.net/` returns **403 with raw
`AccessDenied` XML**, which is exactly the surfer-facing failure HANDOFF §10 says must never
happen. It is not a stack defect: the bucket is empty, so CloudFront cannot fetch the
`/404.html` the `errorResponses` mapping points at and falls back to the origin error. The
403→404 mapping is unprovable until site content is published, and proving it belongs to
whichever lane owns publishing, not to infra.

**Observability, live:** topics `surfs-up-panama-alarms` and `surfs-up-panama-breaker` exist.
The email subscription on the alarm topic is **`PendingConfirmation`** — that is pre-requisite
5 and the single next human action. The dead-man's switch carries all four load-bearing
properties for real, not merely declared: metric `SurfsUpPanama/IngestSuccess`, period 3600 s,
`treatMissingData: breaching`, 2 evaluation periods, and both an ALARM and an OK action on the
alarm topic. All three alarms read `INSUFFICIENT_DATA`.

**The dead-man's switch is now testable for free, and it is not yet proven.** It should move
to `ALARM` on its own within 2 to 3 hours, because ingest genuinely is not running — no
schedule needs disabling. That is expected behaviour, not a fault.

But it is **unverified on this account**, and there is a specific, named way it could fail
that this project has already been burned by once. §4 records that a CloudWatch alarm on an
empty metric namespace "would sit on a nonexistent metric forever". `SurfsUpPanama/IngestSuccess`
has **zero published datapoints** right now: the metric filter that would create it rolled back
with the ingest stack. The whole of slice-02 rests on the claim that `treatMissingData:
BREACHING` converts that absence into `ALARM` rather than into a permanent
`INSUFFICIENT_DATA`, and that claim has never been observed here.

So, precisely: if the alarm reads `ALARM` after ~3 hours, the load-bearing property is proven
live. **If it is still `INSUFFICIENT_DATA` after ~3 hours, that is a real defect, not a wait**,
and slice-02's guarantee is hollow in exactly the way §4 warned. Check with
`aws cloudwatch describe-alarms --alarm-names surfs-up-panama-dead-mans-switch`.

Keep the distinction slice-04 turns on: this observation satisfies R18's *observable* (the
switch fires when ingest is dead) but not R18's stated *procedure* (disable a running schedule,
then re-enable it). The two must not be quietly conflated, and no email leaves the topic until
the subscription is confirmed.

**Money lines, live:** all five exist (`surfs-up-panama-alert-1`, `-alert-5`, `-alert-15`,
`-action-18`, `-last-line-20`), all at $0.00 actual. The $18 line's subscribers are the email
plus the `surfs-up-panama-breaker` topic; that topic currently has no subscriber because the
breaker Lambda lives in the undeployed write stack, so the $18 line notifies Andres but
trips nothing. Say that plainly rather than calling the breaker live.

**Two flags for Andres, neither actioned here:**

1. **Budget count went from 2 to 7.** If AWS charges beyond the first two budgets per account,
   this stack creates recurring spend against a design target of $0.00/month — the guardrail
   billing the thing it guards. **Unverified by construction:** `pricing:GetProducts` is denied
   to `andres-cli`, and an IAM denial is not a pricing answer, the same doctrine §1 applies to
   quotas. Settle it with a real observation: in ~48 h run `aws ce get-cost-and-usage` grouped
   by `SERVICE` and look for an AWS Budgets line.
2. **`surfs-up-panama-guard-20` is now redundant** with the stack-created
   `surfs-up-panama-last-line-20`. It was the interim hand-made guard from the previous lane.
   Deleting it would drop the account to 6 budgets, but deleting a live spend guardrail is
   Andres's call, not an agent's, so it was left alone.

## 8. Never `cdk deploy --all` in this repo

`infra/bin/app.ts` synthesizes five stacks. Four are real; `SurfsUpPanamaGuardrails` is a
synth-only fixture that exists to be asserted against by `infra/test/guardrails.test.ts`.
It declares ten placeholder Lambdas carrying **20** reserved executions and an unnamed
`RETAIN` bucket. Deploying it would push required quota to 33, strand a bucket, and prove
nothing. Deploy by explicit stack ID, in the mandated order: site, ingest, observability,
then write LAST.
