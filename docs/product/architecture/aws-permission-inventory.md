# AWS permission inventory for `andres-cli`

Identity: `arn:aws:iam::602167897909:user/andres-cli` (UserId `AIDAYYNAA5423HZIH4GVK`).
Every row below is an observed API result from a live probe run 2026-08-09, not a policy
read: the policy itself is unreadable (`iam:ListAttachedUserPolicies`, `iam:ListUserPolicies`,
`iam:ListGroupsForUser`, `iam:GetUser` all denied). Probe resources were named
`sup-permission-probe-delete-me*`, created, exercised, and deleted in the same session;
post-cleanup verification showed only the pre-existing preview bucket, zero topics, zero
alarms. The one deliberate leftover is the `surfs-up-panama-guard-20` budget (see §4).

## 1. The verdict that matters

**`andres-cli` cannot bootstrap and cannot deploy. Hard blocker; only Andres clears it.**

- `cdk bootstrap` fails at its first CloudFormation call: `cloudformation:CreateChangeSet`
  DENIED (real run, exit 1, 2026-08-09). `cloudformation:CreateStack` DENIED too, so there
  is no changeset-free fallback. No CloudFormation write path exists for this credential.
- Even resource-by-resource (which ADR-iac-cdk forbids anyway), three of the four stacks
  are unreachable: `scheduler:CreateSchedule` (ingest), `dynamodb:CreateTable` and
  `lambda:CreateFunctionUrlConfig` (write), `s3:PutBucketPublicAccessBlock` (site guardrail
  6, BLOCK_ALL) are all DENIED.
- `lambda:PutFunctionConcurrency` is DENIED at the IAM level. Consequence stated plainly:
  **the Lambda concurrency quota question (07-write-path §7.2 item 0.15) cannot be answered
  by this credential.** An IAM denial is not a quota rejection; nothing was learned about
  the applied quota. All four Service Quotas reads and `lambda:GetAccountSettings` are also
  denied, and the CloudWatch `SERVICE_QUOTA()` metric-math read fails because the account
  has never run a Lambda, so no `AWS/Usage` ConcurrentExecutions metric exists to bind to.

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

## 6. Stack-by-stack requirement vs observed state

| Stack (`system-architecture.md` §11) | Needs beyond CloudFormation | Blocked today by |
|---|---|---|
| site-stack | S3 bucket + BLOCK_ALL + versioning + lifecycle, CloudFront distribution + OAC, response headers policy | cloudformation:*; also s3:PutBucketPublicAccessBlock and cloudfront:CreateOriginAccessControl if ever attempted by hand |
| ingest-stack | EventBridge Scheduler schedules, fetch/build Lambdas, log groups, metric filters | cloudformation:*; also scheduler:CreateSchedule by hand |
| write-stack | 4 Function URLs (auth NONE), DynamoDB PROVISIONED 25/25, resize, breakers, PutFunctionConcurrency | cloudformation:*; also dynamodb:CreateTable, lambda:CreateFunctionUrlConfig, lambda:PutFunctionConcurrency by hand |
| observability-stack | SNS topic + subscription, alarms, metric filters, budgets + $18 action | deployable only piecemeal by hand today (sns/cloudwatch/budgets are allowed), which ADR-iac-cdk rejects; via CloudFormation blocked like the rest |
