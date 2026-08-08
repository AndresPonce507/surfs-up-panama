## DevOps and Delivery

Lane: delivery and operations (nw-platform-architect). Date: 2026-08-08.
Fact rule: every price or quota cites `docs/research/raw/08-aws-architecture-and-cost.md` or
`docs/research/raw/15-anonymous-write-path-abuse-protection.md` (all figures accessed
2026-08-08), or points at the settled section of `system-architecture.md` that carries the
citation. GitHub Actions facts cite `docs/research/raw/13-github-actions-cron-reliability.md`
(fetched 2026-08-08). Nothing here restates a decision that already has a home; it points.

### Verdict block

| Question | Verdict |
|---|---|
| How a change reaches production | Local-gated PR merge (`npm run merge:pr`), then a HUMAN runs the deploy command on their machine. There is no hosted CI and no CD on merge, by decision: **adr-no-hosted-cd.md**. Sequence in §3. |
| Who holds deploy credentials | A human, only. No agent ever holds a credential that can write to production infrastructure. Rule stated in §4; credential design covered by system-architecture §11 and adr-secrets-public-repo. |
| Environments | Two, plus production: local dev (`astro dev` + in-process handlers) and local prod-shape preview (`astro build` + `astro preview`). **No staging environment, no per-PR cloud previews**, with rejected alternatives in §5. DISTILL authors acceptance tests against §5's matrix. |
| Rollback | Code and infra roll back by `git revert` + human redeploy (≤5 min propagation via the §5 TTLs of system-architecture). Published forecast content rolls forward by republish, not back. **The prediction log does not roll back at all, by design.** Per-piece table in §6. |
| Dead-man's switch | CloudWatch alarm on the `IngestSuccess` metric filter, `TreatMissingData: BREACHING`, 2×1h periods, SNS email on ALARM and OK. Alarm settled in system-architecture §10; firing mechanics, human runbook, and the probe-the-probe requirement specified in §7. |
| GitHub Actions | Unfit for anything this project's freshness, gating, or deploys depend on. Evidence: research 13. The single sanctioned role is the phase-2 `workflow_dispatch` enrichment lane with a data-plane-only OIDC role. Boundary in §8. |
| Launch blockers | Seven human console/CLI checks, none attempted now (owner request), collected with dollar exposure in §9. Worst single exposure: account auto-closure (whole product); worst recurring: ~$130/mo attack ceiling if the Lambda concurrency quota is reduced (research 15 §5.0). |

### 1. Covered elsewhere, pointed at, not restated

| Concern | Home |
|---|---|
| Eleven cost guardrails, enforced values, CDK assert gate | system-architecture §9, §11 |
| Secrets in a public repo, OIDC, zero long-lived keys | system-architecture §11, adr-secrets-public-repo |
| Observability floor: metrics, 8 alarms, budgets, substrate probes | system-architecture §10 |
| IaC choice and skeleton, zero-to-deployed path | system-architecture §11, adr-iac-cdk |
| Region, DNS, cost model, free-tier inventory | system-architecture §4, §8, §12 |
| Ingest runner decision and fallback lanes | system-architecture §7, adr-ingest-runner |
| Write path topology, abuse stack, breakers | 07-write-path, adr-write-path-off-cloudfront |
| Ingest run sequence, idempotency, partial failure | 04-ingest-pipeline §3, §6, §7 |

### 2. The delivery toolchain that already exists in this repo

The pipeline in §3 is not aspirational; most of it is committed and running today.

| Piece | File | State |
|---|---|---|
| Local CI runner (jobs: test, typecheck, secrets, deps, sast; `at` non-default) | `scripts/ci-local.mjs` | committed, adapted to this stack |
| Merge gate (full gate on the exact PR head, refuses on HEAD mismatch or conflicts) | `scripts/merge-pr.mjs` | committed |
| Pre-commit hook (author-email guard: unverified emails silently break deploy systems) | `scripts/git-hooks/pre-commit` | committed, installed via `postinstall` |
| Pre-push hook (fast gate to feature branches, full gate to trunks) | `scripts/git-hooks/pre-push` | committed |
| AT runner (cucumber, strict, tsx-loaded) and e2e runner (playwright, mobile-first, `PREVIEW_URL` override) | `cucumber.mjs`, `playwright.config.ts` | committed |

Jobs the gate still owes, each keyed to the artifact that makes it runnable (mirrors the
`NOT WIRED YET` list inside `ci-local.mjs`):

| Job | Add when | What it runs |
|---|---|---|
| `at` flips `default: true` | first `.feature` file lands (DISTILL) | `npx cucumber-js` |
| `e2e` | `astro build` produces output | build as PRELUDE, then `npx playwright test` against `astro preview` |
| `budget` | same | the per-route byte and request gate, application-architecture §5, §9 |
| `infra` | `infra/` exists (first DELIVER infrastructure slice) | `vitest` on `infra/test/guardrails.test.ts` + `npx cdk synth`, credential-free (system-architecture §11 step 3: with no hosted CI, "CI" means this gate) |

### 3. The deploy pipeline, as a sequence

One rule frames it: **merge ships nothing.** The merge gate certifies the tree; production
changes only when a human runs a deploy command. Deploys ship code; the hourly ingest pipeline
ships content. Those are different lanes with different actors.

**On a change, in order:**

| # | Step | Command | Machine | Who | Gate |
|---|---|---|---|---|---|
| 0 | Author in a worktree, TDD | feature branch, never trunk | laptop | developer or agent | pre-commit (author email); pre-push fast gate |
| 1 | Open PR | `gh pr create` | laptop | developer or agent | none hosted, by design (adr-no-hosted-cd) |
| 2 | Merge | `npm run merge:pr -- <n>` | laptop | developer or agent | FULL local gate on the exact PR head; script refuses when local HEAD ≠ PR head, refuses conflicts. Never the GitHub UI, never bare `gh pr merge`: with no hosted CI those bypass every check |
| 3a | Infra deploy (only if `infra/` changed) | `npx cdk deploy --all` | laptop | **human only** | run from a clean checkout of the merged default branch; guardrail suite was green in step 2; CloudFormation rolls a failed deploy back automatically |
| 3b | Site deploy (only if site code changed) | `npm run deploy:site` (§3.1, to be built) | laptop | **human only** | same clean-tree rule |
| 4 | Smoke, in production | load site via the domain, POST one test report, confirm dead-man alarm state OK | prod | human (agent may verify via read-only access, §4) | system-architecture §11 step 8 |
| n/a | Content publish (hourly, forever) | EventBridge → fetch → build → S3 | AWS | nobody | substrate probes, system-architecture §10; 04-ingest §3 |

Merged-but-not-deployed is therefore a normal, visible state, owned by the human. `npx cdk
diff` (read credential required, §4) shows the infra delta at any time; there is no mechanism
that deploys behind the human's back, and that absence is the point.

#### 3.1 The site deploy command, specified

`npm run deploy:site` does exactly this, and is the first DEVOPS slice to build:

1. `astro build`.
2. Sync hashed assets to the `assets/` prefix with `Cache-Control: public, max-age=31536000,
   immutable`, then sync the remaining deploy-owned files to `site/` with `Cache-Control:
   public, max-age=300, stale-while-revalidate=3600` (values are system-architecture §5's
   table; Cache-Control is set at S3 upload, so the deploy script is where it happens).
3. No invalidation, ever, in the script. Freshness arrives by TTL within 5 minutes
   (system-architecture §5, "zero routine invalidations, by construction").

Scope note that keeps this honest: per-route HTML is **content**, rendered hourly by the build
Lambda (adr-publish-time-html-rendering), not shipped by deploys. A template or scoring change
ships inside the builder via `cdk deploy` (step 3a) and materializes at the next hourly
publish, or immediately when the human manually invokes the builder. Deploys never write the
`v1/`, `raw/`, or `predictions/` prefixes.

### 4. The human-in-the-loop boundary, stated as a rule

**No agent ever holds a credential that can write to production infrastructure. Agents are
read-only on production, always. A human runs every privileged apply.** This is an invariant,
not a preference; it holds for every future phase and tool.

| Actor | May do | May never do |
|---|---|---|
| Agent (any AI tooling) | author code and IaC; run the local gate; run `merge:pr`; run `npx cdk synth` (credential-free); with a provisioned read-only profile: `cdk diff`, read CloudWatch logs/metrics/alarm state, `s3 ls`, verify the deployed site over HTTPS | `cdk bootstrap`/`deploy`/`destroy`; any `aws s3 sync/cp/rm` against the real bucket; `aws lambda invoke` or `update-*`; `aws ssm put-parameter`; DNS changes; any console action; holding or reading any credential with write scope |
| Human (Andres) | everything above, plus: `npx cdk bootstrap`, `npx cdk deploy --all`, `npm run deploy:site`, manual builder invoke, `aws ssm put-parameter` secret seeding, registrar DNS records, console-only settings (plan upgrade, quotas, Anthropic $5 limit), emergency invalidation | nothing technical, but: deploy only from a clean checkout of the merged default branch, and never console-patch a resource CDK owns (immutable and declarative; drift dies at the next deploy anyway) |
| GitHub Actions (phase 2 only) | `workflow_dispatch` GRIB2 job assuming the OIDC role: `s3:PutObject` on `raw/*` and the prediction-log prefix only (system-architecture §11) | everything else; the role cannot touch infrastructure, and no other GitHub→AWS path exists |

**The command shape a human runs, and its blast radius:**

```
npx cdk deploy --all        # from repo root, clean merged default branch,
                            # human's own AWS profile, us-east-1
```

Touches: the four CloudFormation stacks (site, ingest, write, observability:
system-architecture §11 skeleton), which means bucket policy/lifecycle, CloudFront config,
Lambda code and configuration, EventBridge schedules, alarms and budgets. Does NOT touch: any
object under `v1/`, `raw/`, or `predictions/` (data plane, owned by the running system),
DynamoDB items, SSM parameter values, DNS. A deploy can change the shape of the system; it
cannot rewrite its data, and no flag makes it able to.

Two supporting facts. First, `cdk diff` performs account lookups, so agents get it only once a
read-only credential exists; until then agents run `synth` only (system-architecture §11 step 4
permits both; the credential decides which is reachable). Second, phase 1 has no GitHub→AWS
path at all, so the entire write surface into this AWS account is one human's laptop plus the
running system itself.

### 5. Environment matrix

The next wave authors acceptance tests against this table. The site is static plus a handful of
Lambdas, so three environments suffice.

| | Local dev | Local preview (prod shape) | Production |
|---|---|---|---|
| Purpose | edit loop | what DISTILL/e2e drive | the product |
| Site | `npm run dev`, hot reload, `http://localhost:4321` | `npm run build && npm run preview`, same port; playwright honors `PREVIEW_URL` | CloudFront + private S3, system-architecture §3, §5 |
| Lambda handlers | plain TypeScript functions invoked in-process by vitest/cucumber | same (there is no local AWS emulation, see rejections below) | real Lambdas, zip, arm64 |
| AWS effects (S3, DynamoDB, SSM) | behind ports, in-memory fakes | same | real services |
| Provider APIs (Open-Meteo, WorldTides) | recorded fixtures, never live (determinism, plus tests must not burn the 10,000 calls/day Open-Meteo quota, research 01 §1 via system-architecture §8) | fixtures | live, hourly |
| Secrets | none; `.env.example` documents parameter names | none | SSM SecureString |
| Credentials required | zero | zero | human profile (writes), optional read-only profile (agents) |
| What tests drive here | unit + AT fast lane: cucumber against in-process handlers and pure domain code | e2e lane: playwright (mobile-first) against the built site; `budget` gate measures the same output | smoke only (§3 step 4); "smoke test" always means production |

Contract for DISTILL, explicit: every acceptance test must run credential-free on a laptop,
driving either in-process handlers (fast lane) or the `astro preview` build (e2e lane). No test
may require AWS, the network, or a deployed environment. Production is exercised by the §3
step-4 smoke and the always-on substrate probes (system-architecture §10), not by the suite.

**No staging environment, no per-PR cloud previews. Rejected alternatives:**

- **Second CDK stack pair as staging.** Meets the "test infra before prod" goal, rejected:
  the always-free pools are per-account, so staging and prod share one DynamoDB 25/25
  allowance and one CloudFront request pool (system-architecture §8), staging doubles the ops
  surface of a one-operator project, and the thing staging usually protects against is already
  gated credential-free by the guardrail assert suite at merge time (system-architecture §11).
- **Amplify preview deploys.** 12-month free tier only, already rejected by design
  (system-architecture §8, "not used, by design").
- **LocalStack or SAM local emulation.** Adds a heavyweight dependency to reproduce services
  the ports-and-fakes seam already isolates; the risky integration surface (IAM, OAC,
  lifecycle) is exactly what emulators reproduce least faithfully. The publish probe and step-4
  smoke cover it against the real substrate.

Residual risk accepted: a bad site deploy or bad builder release reaches production directly.
Blast radius is bounded by §6's rollback times (≤5 min propagation), `stale-if-error` serving
the last good build through origin failures (system-architecture §5), and the fact that deploys
never touch data (§4).

### 6. Rollback, per piece, honestly

Reverting a bad forecast build and reverting a bad prediction-log write are different problems;
the second is unsolvable by design. Per piece:

| Piece | Rollback means | Mechanism | Time to healthy | Cannot be undone |
|---|---|---|---|---|
| Infrastructure (CDK stacks) | redeploy previous definition | `git revert` → merge (§3) → human `cdk deploy`; a mid-deploy failure auto-rolls-back via CloudFormation | minutes (CFN apply) | a destructive change that already ran (e.g. a lifecycle rule that expired objects); guardrail 4's assert exists so the class that matters most, touching the prediction log, cannot even reach a deploy |
| Site shell + assets | redeploy previous build | hashed assets are additive (new name per content, old keys remain), so old and new coexist; `npm run deploy:site` from the reverted commit; TTL 300 propagates it | ≤5 min after the sync | nothing |
| Builder/scoring/template code | revert + redeploy + republish | `cdk deploy` of the reverted builder, then next hourly publish, or human manually invokes the builder to force it | ≤1 h natural, minutes if forced | the wrong routes it already published (they get overwritten, see next row) |
| Published forecast content (`v1/`, HTML routes) | **roll forward, not back**: republish | the hourly build overwrites the same keys (04-ingest §7 idempotency); after a corrected publish, TTLs 60/300 age the bad copy out | ≤5 min after the corrected publish; up to ~1 h if waiting for the next cycle | the window during which users saw a wrong-but-validly-published forecast. `stale-if-error` protects against failed builds, not wrong ones; the freshness stamp (system-architecture §10) does not flag wrongness, only age |
| Prediction log (`predictions/`) | **there is no rollback, by design** | append-only, write-once keys, exempt from all expiry (HANDOFF §3; system-architecture §5, guardrail 4; adr-prediction-log-prefix-isolation) | n/a | every write, good or bad, is permanent. A wrong prediction is not even an error: it is the product's honesty record. A malformed record is narrow by construction (idempotent re-runs write byte-identical keys, system-architecture §14 req 10) and must be handled by readers skipping and flagging it (scorecard/learning lanes), never by deletion |
| DynamoDB (reports, quotas, credentials, push subs) | no rollback of user data | report labels are immutable once written (adr-report-label-immutability); quota/credential items are ephemeral (TTL); worst case for subs is re-subscription | n/a | user-submitted reports; that is a feature, same reasoning as the log |
| A bad secret (SSM) | overwrite with the previous value | human `aws ssm put-parameter --overwrite`; Lambdas read at cold start, so bounce them (redeploy) or wait for recycle | minutes | nothing |

The asymmetry, stated once: **everything code-shaped rolls back in minutes through git plus a
human command; everything data-shaped only rolls forward.** The design leans on that split:
deploys cannot write data (§4), floods cannot stop the log (guardrail 8 denies only the four
write URLs, system-architecture §9), and lifecycle rules cannot reach it (guardrail 4). The one
unguarded actor against the log is a human with console access; flagged in §11.

### 7. The dead-man's switch, specified

The alarm exists and is budgeted in system-architecture §10 (alarm 1). This section specifies
the mechanics: how it fires, what it watches, and what a human sees, because a forecast that
quietly freezes looks exactly like a healthy site.

**Signal chain.** The fetch Lambda emits one structured JSON log line at the successful end of
an ingest run (position in the run sequence: 04-ingest §3). A CloudWatch metric filter on that
log group increments the custom metric `IngestSuccess` (one of the six budgeted metrics,
system-architecture §10). The alarm watches the metric, not the Lambda: period 1 h, statistic
Sum, threshold < 1, **`TreatMissingData: BREACHING`**, 2 consecutive evaluation periods, action
on both ALARM and OK to the SNS alarm topic.

**Why `BREACHING` is the load-bearing word.** A metric-filter metric with no matching log line
reports no datapoint at all, not zero. Default missing-data handling would hold the alarm green
forever precisely when everything is dead. `BREACHING` converts absence into failure, which is
what makes this a dead-man's switch instead of an error counter. Consequence: it catches the
whole silent-failure family with one alarm: schedule disabled or misconfigured, EventBridge not
firing, Lambda crashing before it logs, log group deleted or misrouted, filter pattern drift.
The two silent failures it does NOT catch are covered by the sibling probes: publishes that
succeed but never reach users (publish probe) and providers serving stale-but-valid payloads
(provider probe), both system-architecture §10.

**Timing honesty.** With hourly runs at :17 and two 1 h periods, the ALARM email arrives
roughly 2 to 3 hours after the last successful run. That is the accepted detection floor;
tightening it means shorter periods against the same hourly cadence and buys flapping, not
signal. During that window the site serves stale-but-correct and the user-visible freshness
stamp is aging in parallel.

**What the human sees.** An SNS email from the alarm topic (subscription confirmed at
zero-to-deployed step 7): subject names the alarm and region, body carries the state reason
("X datapoints missing" or "sum below 1"), the timestamps, and the state transition. On
recovery a second email closes the loop (OK action). Response runbook, in order:

1. Is the EventBridge schedule ENABLED, and does its last-fired time look right? (Silently
   disabled or never-fired schedule is the class this alarm exists for.)
2. Fetch/build Lambda error count and logs (14-day retention, guardrail 3). Discriminator: if
   `ProviderErrors` (alarm 2) fired too, the job ran and the source is dark; if only the
   dead-man fired, the job never ran or died before logging.
3. Fix, then force a run by manually invoking the fetch Lambda (human, §4) rather than waiting
   for the next hour.
4. Confirm the OK email and that the site's freshness stamp advanced.

**Probe the probe, once, at launch.** Zero-to-deployed step 8 (system-architecture §11)
disables the schedule for a test window and requires watching the alarm go ALARM, then OK on
re-enable. An alarm never seen firing proves nothing, same doctrine as the guardrail suite's
red-then-green requirement. The launch checklist (§9 item 7) carries this so it cannot be
skipped.

### 8. GitHub Actions: the trust boundary, generalized

Research 13 was commissioned to answer "can Actions run the ingest cron"; the evidence answers
a bigger question. First-party admission of a growing scheduler backlog with >30% drops, a
measured ~5% execution rate on a 5-minute cron, hours of drift on daily jobs, a 60-day
auto-disable whose canonical workaround GitHub TOS-blocked, and an SLA that covers availability
but never punctuality (research 13 §2, §3, §5). Separately, and decisive for even the
non-scheduled uses: **Actions is billing-capped on this account, so hosted CI is not
available here at all.** The local gate (§2, §3) is therefore the primary and only gate, not a
stopgap, and `merge:pr` exists because with no hosted checks, a GitHub-UI merge would bypass
everything.

What follows, as rules:

| Actions may never hold | Because |
|---|---|
| The ingest schedule, or any timing the product's freshness depends on | settled: system-architecture §7, adr-ingest-runner, research 13 |
| The merge gate or any required status check | billing-capped account; and a gate that silently stops running is worse than a failing one |
| Deploy credentials, or any infrastructure-writing role | §4 invariant; adr-secrets-public-repo: infrastructure deploys are human-only |
| Anything on the launch or hourly critical path | no punctuality SLA at any tier (research 13 §5) |

The single sanctioned role: the phase-2 GRIB2 enrichment job, `workflow_dispatch` only, timing
owned by EventBridge, best-effort by design (the site serves stale-but-correct when it is
late), writing through the OIDC role scoped to `s3:PutObject` on `raw/*` and the prediction-log
prefix (system-architecture §7, §11). Its two honest caveats stay open: dispatch-queue latency
under load is unmeasured (system-architecture §17 item 4), and the run must assert its
assumed-role ARN before writing (the OIDC probe, system-architecture §10). If that lane ever
misbehaves, the fallback is the container-image Lambda (adr-ingest-runner), not a bigger
Actions footprint.

### 9. Launch checklist, with dollar exposure

Every item needs a human; most need the AWS console. **The owner has asked not to touch AWS
right now, so these are recorded, not attempted.** Items 1 to 7 gate the zero-to-deployed path
(system-architecture §11), none gate this design round. Sources: research 08 and 15 figures all
accessed 2026-08-08, via the cited sections.

| # | Item | Where | Exposure if skipped or bad | Source |
|---|---|---|---|---|
| 1 | **Upgrade the account to the Paid Plan.** Free Plan auto-closes the account 6 months after creation OR when credits run out, whichever is first; data deleted 90 days later. Created ~2026-08-05, calendar deadline ~2027-02-05, but the co-hosted Amplify + RDS demo burns credits on an unknowable clock | Billing console | **the entire product and account**; the largest single exposure on this page | system-architecture verdict block, §18 dec 1; research 08 §1.2 |
| 2 | Same visit: does S3 show an always-free line on this account? | Free Tier billing page | headline floor moves either way around ~$0.32/mo | system-architecture §17 item 1; research 08 §12.3 |
| 3 | Same visit: DynamoDB 25 WCU/25 RCU tagged always-free or 12-month? UNVERIFIED, two same-day reads conflict | Free Tier billing page | $0.00 forever vs **~$14.24/mo from month 13** | system-architecture §8, §17 item 9 (rates: aws.amazon.com/dynamodb/pricing/provisioned/, accessed 2026-08-08) |
| 4 | **Lambda `Concurrent executions` applied quota ≥ 103?** On a days-old account it can be reduced; at ≤102, `PutFunctionConcurrency` is rejected and the rate limiter, breakers, and mint cap silently do not exist | Service Quotas console, BEFORE first deploy | attack ceiling **~$130/mo** (worked case at quota 50) instead of §6.1's bounded figures | system-architecture §11 blocker 1; research 15 §5.0 |
| 5 | Load-test whether AWS meters egress for a 429 emitted before the function runs | one afternoon, before launch | pessimistic **~$27 per billion rejected requests** after the free 100 GB/mo; interim control is deleting the Function URL config | system-architecture §11 blocker 2; research 15 §15.3 |
| 6 | Seed SSM secrets, confirm the SNS topic email subscription | CLI + inbox | no alarms delivered at all: every §7 and §10 signal dead on arrival | system-architecture §11 steps 6, 7 |
| 7 | **Probe the probe**: disable the schedule for a test window, watch the dead-man alarm go ALARM then OK | console/CLI, once | an unverified dead-man's switch; ingest can die unnoticed indefinitely, the exact failure it exists to catch | §7 above; system-architecture §11 step 8 |
| 8 | Confirm SNS email free-tier allowance when wiring the topic | pricing page | nil at ~10 mails/mo; flagged partially-verified | system-architecture §19 flag 7; research 08 §1.3 |
| 9 | Anthropic console $5/mo hard limit (only when narration ships) + monthly re-check | Anthropic console | direct-API spend invisible to every AWS alarm | system-architecture §9 guardrail 10; research 08 §6.5 |
| 10 | Registrar purchase + CNAME + ACM validation record; registrar pricing UNVERIFIED | registrar | ~$12/yr assumption wrong by small dollars | system-architecture §4; research 08 §2.5 |
| 11 | Send the Open-Meteo redistribution email | inbox | legal rework of the primary ingest path; fallback chain already designed, ≈ +$0.15–0.25/mo if the container lane | system-architecture §16, §18 dec 7 |
| 12 | Post-launch: which CloudFront price tier Panama bills under | Cost Explorer, once real traffic exists | ~2× on the request line past the free tier; matters past ~50k MAU | system-architecture §17 item 2, §12; research 08 §7.3 |

### 10. What I am unsure about

1. **Whether an account-wide Actions billing cap also blocks free public-repo runs.** Observed
   on this account's other repos (all jobs fail with zero steps); not re-tested for a public
   repo. Immaterial to the design (§8 rejects Actions on reliability grounds regardless), so it
   is a curiosity, not a blocker.
2. **`cdk deploy` rollback fidelity for CloudFront distribution replacement.** CFN rollback of
   a distribution-level change can be slow (distribution redeploy). Untested here; the §6 row
   claims "minutes" for the common case, which is Lambda/config changes, not CDN topology
   swaps. Verify the first time a CloudFront-touching change ships.
3. **The exact deploy-owned static route set** (offline page, 404, service worker scope) is the
   frontend lane's; §3.1's two-pass sync assumes hashed assets vs everything-else is a clean
   split. If the frontend lane ships deploy-time HTML with different TTL needs, the script
   grows a third class, not a redesign.

### 11. Decisions needing Andres

| # | Decision | Options | My recommendation |
|---|---|---|---|
| 1 | Prediction-log protection against HUMAN deletion. Guardrails stop IaC and floods; nothing stops a console `rm` or a fat-fingered `aws s3 rm --recursive` by the one privileged human | (a) accept the risk; (b) enable S3 bucket versioning scoped to the log prefix's bucket, a few extra cents/mo at launch volumes (0.36 GB/yr, domain-model §5.3), noting versioning is bucket-wide so photos' delete markers ride along; (c) Object Lock compliance mode, irreversible and heavy | **(b)**. The log is the product's irreplaceable artifact (HANDOFF §3); a one-line CDK change turns the only unguarded deletion path into a recoverable one. (c) is over-engineering at this scale |
| 2 | Read-only AWS profile for agents (a `SELECT`-only analog: CloudWatch read, `s3:List/Get` on non-secret prefixes, `cloudformation:Describe*` for `cdk diff`) | (a) create at first deploy; (b) never, agents stay synth-only | **(a)**. It makes §3 step 4 smoke checks and §4's `cdk diff` agent-runnable while keeping the write wall absolute. Costs nothing |

### ADR index (this lane)

- **adr-no-hosted-cd.md**: no hosted CI/CD; the merge gate runs locally and deploys are
  human-run local commands. The contested one: it rejects the industry default (push-triggered
  hosted CI, CD on merge) with evidence.
