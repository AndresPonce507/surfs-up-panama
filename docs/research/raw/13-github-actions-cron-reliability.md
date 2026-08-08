# 13 — GitHub Actions cron reliability for a personal public repo

**Accessed:** 2026-08-08. All claims below were fetched live on that date, not recalled.
**Why this file exists:** HANDOFF.md §4 tells the infrastructure lane to evaluate GitHub Actions
as the primary ingest runner and to *research its actual cron reliability rather than assume it*.
This is that research.

---

## Bottom line

**Free: yes, confirmed. Reliable: no, and it got materially worse during 2026.** The standard
workaround for the 60-day auto-disable is now TOS-blocked by GitHub. No paid plan is needed for
anything this project does.

Three findings drive the decision:

1. **GitHub staff admitted a systemic scheduler backlog in June 2026.** Developer advocate
   `nebuk89`, 2026-06-04, [community discussion #196910](https://github.com/orgs/community/discussions/196910):
   *"This drift is part of us balancing load coming in as scheduled drops have grown >30% in 2ish
   months."* He added *"this isn't a fix 'now'"*.
2. **A `*/5` cron measured roughly a 5% execution rate.** User `Nicodol`, 2026-07-28,
   [discussion #156282](https://github.com/orgs/community/discussions/156282): a `*/5 * * * *` job
   *"started 97 times out of ~2,016 slots"* = *"about 5%"*. Caveat: one user, one repo,
   self-reported. It is still the most decision-relevant number available.
3. **`gautamkrishnar/keepalive-workflow`, the canonical 60-day keepalive action, is blocked by
   GitHub for a TOS violation.** `curl https://api.github.com/repos/gautamkrishnar/keepalive-workflow`
   returns `{"message":"Repository access blocked","block":{"reason":"tos",...}}`.
   [ddev issue #46](https://github.com/ddev/github-action-add-on-test/issues/46) quotes the reason:
   *"a TOS violation because it promoted excessive usage by circumventing the 60-day inactivity policy."*

---

## 1. Free and unmetered for public repos — confirmed

> "GitHub Actions usage is **free** for **self-hosted runners** and for **public repositories**
> that use standard GitHub-hosted runners."
> — https://docs.github.com/en/billing/concepts/product-billing/github-actions

> "Larger runners are always charged for, even when used by public repositories."
> — same page

2025-2026 pricing changes each explicitly protected public repos:

- [2025-12-16 changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/):
  *"Runner usage in public repositories will remain free."* Introduced a $0.002/min cloud platform
  charge on **self-hosted** runners from 2026-03-01, private repos only.
- [2026-01-01 changelog](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/):
  *"Standard hosted runner usage in public repositories remains free."*
- [2026-04-27 changelog](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/):
  Copilot review consumes minutes on private repos only.

**UNVERIFIED:** search summaries claim the 2026-03-01 self-hosted charge was postponed. No
changelog post confirming this could be fetched. Immaterial here (we would use hosted runners).

**Verdict: no paid plan needed.**

## 2. The 60-day inactivity auto-disable

> "In a public repository, scheduled workflows are automatically disabled when no repository
> activity has occurred in 60 days."
> — https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
> — also https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows

Re-enable is manual only (UI, or `gh workflow enable`). No documented automatic re-enable.

**Does GitHub email a warning first? NOT DOCUMENTED.** The only evidence is
[discussion #137768](https://github.com/orgs/community/discussions/137768) from September 2024,
reporting an email around day 53 and a "continue running workflow" button appearing around day 58.
Treat as a 2024 community report of then-current behavior.

**Does a `GITHUB_TOKEN` bot commit reset the 60-day clock? NOT DOCUMENTED.** Two separate
mechanisms must not be conflated:

- Whether a token-authored push *triggers a workflow*: documented. *"With the exception of
  `workflow_dispatch` and `repository_dispatch`, other `GITHUB_TOKEN`-triggered events do not
  create workflow runs at all."*
- Whether a token-authored commit *advances the 60-day activity clock*: nothing fetched documents
  this. The strongest available evidence is inferential — GitHub blocked `keepalive-workflow` for
  *"circumventing the 60-day inactivity policy"*, which implies the technique worked. That is an
  inference from an enforcement rationale, not a quoted rule.

**Operationally decisive regardless:** GitHub has blocked a repo for automating around this.
The safe plan is a human-noticed reminder and a manual push or re-enable, not a keepalive bot.

## 3. Delay and drop behavior

> "The `schedule` event can be delayed during periods of high loads of GitHub Actions workflow
> runs. High load times include the start of every hour. If the load is sufficiently high enough,
> some queued jobs may be dropped."
> — https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

Also: *"Scheduled workflows run on the latest commit on the default branch"* and *"will only run
on the default branch."*

**There is no authoritative quantitative source.** GitHub publishes no delay SLO, percentile, or
drop-rate metric. What exists is community measurement plus one first-party qualitative admission:

| Source | Date | Measurement |
|---|---|---|
| [#156282](https://github.com/orgs/community/discussions/156282), `sefinek` | 2025-04-10 | `0 0 * * *` ran 29 min late |
| [#196910](https://github.com/orgs/community/discussions/196910), `lelegard` (public repo `tsduck/tsduck`) | 2026-05-25 | 4h 28m delay; average rose from ~1h40m in 2025 to >4h by May 2026 |
| [#156282](https://github.com/orgs/community/discussions/156282), `denolfe` | 2026-07-07 | Weekly job, 25 runs: +35 to +216 min |
| [#156282](https://github.com/orgs/community/discussions/156282), `Nicodol` | 2026-07-28 | Daily job, 7 days: avg 2h42 late, best 1h59, worst 3h56. `*/5` job: 97 of ~2,016 slots (~5%) |
| [#156282](https://github.com/orgs/community/discussions/156282), `jxu` | 2026-08-06 | 30+ min delays; *"Today it straight up failed to run"* |
| **GitHub staff `nebuk89`** | 2026-06-04 | *"scheduled drops have grown >30% in 2ish months"* |

**Honest range to plan against as of Aug 2026:** tens of minutes late is the good case. One to four
hours late is commonly reported. Runs are outright skipped. This is much worse than the historical
"3 to 20 minutes" folklore. These reports are self-selected (angry users post), so the population
average is likely better — but GitHub's own staff confirms the direction.

## 4. Minimum interval

> "The shortest interval you can run scheduled workflows is once every 5 minutes."

Unchanged. Per §3 a 5-minute cron does not deliver 5-minute cadence.

## 5. SLA — narrower finding than "there is no SLA"

The [GitHub Online Services SLA](https://github.com/customer-terms/github-online-services-sla)
**does name GitHub Actions** as a covered service and commits to *"at least 99.9% Uptime"*. No
sentence explicitly excluding free accounts was found. What is defensible: the sole remedy is
Service Credits calculated against Applicable Service Fees, so a $0 account has no contractual
remedy. That is an inference from the remedy structure, not a quoted exclusion.

**More important: the 99.9% commitment covers service availability, not scheduler punctuality.**
No SLA at any tier covers cron timeliness. An Enterprise customer has no recourse for 4-hour drift
either.

## 6. Concurrency and timeouts

From https://docs.github.com/en/actions/reference/limits:

- Job execution time, GitHub-hosted: 6 hours, then terminated and failed.
- Workflow run time: 35 days, then cancelled.
- Concurrent jobs by plan: Free 20, Pro 40, Team 60, Enterprise 500.
- Job matrix: 256 jobs per run. Workflow re-runs: 50 max.
- `GITHUB_TOKEN` API rate limit: 1,000 requests/hour/repository.

Concurrency keys off account plan, not repo visibility. Free personal = 20 concurrent jobs, ample
for one scheduled workflow.

## 7. GitHub OIDC into an AWS IAM role — supported, first-party

https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com` when using `aws-actions/configure-aws-credentials`
- Required workflow permissions, the thing that breaks most first attempts:

```yaml
permissions:
  id-token: write   # required for requesting the JWT
  contents: read    # required for actions/checkout
```

`sub` claim, repo + branch form:

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:octo-org/octo-repo:ref:refs/heads/octo-branch"
  }
}
```

Environment form:

```json
"token.actions.githubusercontent.com:sub": "repo:octo-org/octo-repo:environment:prod"
```

**Critical interaction:** scheduled workflows run only on the default branch, so the pin is
`repo:AndresPonce507/surfs-up-panama:ref:refs/heads/<default-branch>`. But if the job declares an
`environment:`, the `sub` becomes the environment form *instead*, not both. Picking the wrong one
is the most likely first-attempt failure.

**Thumbprint — do not oversimplify.** From
https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html:

> "AWS secures communication with OIDC identity providers (IdPs) using our library of trusted root
> certificate authorities (CAs) to verify the JSON Web Key Set (JWKS) endpoint's TLS certificate.
> If your OIDC IdP relies on a certificate that is not signed by one of these trusted CAs, only
> then we secure communication using the thumbprints set in the IdP's configuration."

The thumbprint is still a required field (1 to 5 per provider) and IAM retrieves it automatically
at creation. It is no longer verification-load-bearing for GitHub, whose cert chains to a trusted
CA. So you no longer hand-maintain `6938fd4d98bab03faadb97b34396831e3780aea1`, but "AWS manages it
now" is too strong.

**Cost: UNVERIFIED.** No charge is documented for IAM OIDC providers or `AssumeRoleWithWebIdentity`,
but the AWS IAM pricing page could not be retrieved. Do not assert "free" on this file's authority.

## 8. Personal account vs org

Thinnest section, flagged honestly.

- **The 60-day rule keys on repository visibility, not ownership.** The doc says *"In a public
  repository"* with no ownership qualifier, so `AndresPonce507/surfs-up-panama` is subject to it
  identically to an org-owned public repo.
- A personal account has no org or enterprise policy layer above it, so one fewer thing can
  silently disable workflows. Cited via search summary from the org Actions settings doc, **not
  fetched directly**.
- Concurrency follows account plan (Free = 20), not ownership type.

No documented behavior found that makes a personal public repo worse than an org public repo for
scheduled workflows.

---

## What could not be verified

- Whether the 2026-03-01 self-hosted runner charge was formally postponed (search summaries only).
- Whether a `GITHUB_TOKEN` commit resets the 60-day activity clock (not documented; inference only).
- Whether GitHub currently emails before auto-disabling (only a Sept 2024 community report).
- AWS pricing for IAM OIDC providers and STS web-identity calls (pricing page not retrievable).
- Org-vs-personal specifics beyond the visibility-keyed 60-day rule (search summary, not direct fetch).

## Design implication

**If the ingest job needs a cron that actually fires on time, GitHub Actions `schedule` is the
wrong primitive as of August 2026.** The drift is first-party-acknowledged and unfixed, drops are
real, and the 60-day disable has no sanctioned automated workaround.

It is fine for "runs roughly daily, nobody dies if it is three hours late and occasionally skips."
It is not fine for an hourly republish that the site's freshness stamp depends on.

Alternatives the infrastructure lane should price against this: an external trigger hitting
`workflow_dispatch` (which *is* exempt from the `GITHUB_TOKEN` no-trigger rule), or an EventBridge
schedule driving Lambda inside the AWS free tier.
