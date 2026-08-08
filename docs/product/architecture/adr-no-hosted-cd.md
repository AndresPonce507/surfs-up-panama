# ADR: No hosted CI/CD; local merge gate, human-run deploys

- **Status:** Accepted (DEVOPS lane, 2026-08-08). The constraint it rests on (Actions
  billing-capped on this account) is an account fact, not a preference; revisit only if that
  fact changes AND the reliability record below improves.
- **Lane:** delivery and operations (nw-platform-architect)

## Context

The industry default for a public repo is push-triggered hosted CI with required status
checks, and CD that deploys on merge. This project rejects both halves, which is contested
enough to earn an ADR.

Three independent facts drive it:

1. **GitHub Actions is billing-capped on this account.** Hosted CI is not available here;
   observed on this account's other repos as every job failing with zero steps. The repo
   therefore already ships a local gate: `scripts/ci-local.mjs` (jobs: test, typecheck,
   secrets, deps, sast), `scripts/merge-pr.mjs` (full gate at merge, refuses when local HEAD
   is not the PR head), and tracked pre-commit/pre-push hooks.
2. **The Actions reliability record is disqualifying for anything load-bearing, independent
   of billing.** First-party admission of a scheduler backlog with >30% drops, a measured ~5%
   execution rate on a 5-minute cron, daily jobs hours late, a 60-day auto-disable whose
   canonical workaround GitHub TOS-blocked, and an SLA covering availability but never
   punctuality (research 13 §2, §3, §5, all fetched 2026-08-08). A gate or deploy lane that
   silently stops running is worse than one that fails loudly.
3. **No agent, and no automation, may hold a credential that can write to production
   infrastructure** (08-devops §4; adr-secrets-public-repo: infrastructure deploys are
   human-only, phase 1 has no GitHub-to-AWS path at all). CD-on-merge is, by definition, an
   automated holder of a production write credential.

## Decision

**There is no hosted CI and no CD. The merge gate runs on the developer's machine
(`npm run merge:pr -- <n>`, full local gate against the exact PR head), and every deploy is a
human running a local command (`npx cdk deploy --all`, `npm run deploy:site`) from a clean
checkout of the merged default branch.** Merging via the GitHub UI or bare `gh pr merge` is
prohibited: with no hosted checks, those paths bypass every gate. Sequence and actor table:
08-devops §3, §4.

## Alternatives considered

| Option | Why not |
|---|---|
| GitHub Actions push-triggered CI (free on public repos per research 13 §1) | Billing cap makes it unavailable on this account regardless of the public-repo pricing; and even were it available, a second gate beside the local one is a drift surface, while making it the ONLY gate hands the trunk contract to the §5-no-punctuality-SLA service that already lost the ingest decision (adr-ingest-runner) |
| Self-hosted runner on the operator's machine | Same machine the local gate already runs on, with extra moving parts; and a self-hosted runner attached to a public repo is a known code-execution exposure to fork PRs. Adds risk, adds nothing the local gate lacks |
| AWS CodeBuild/CodePipeline | New billable AWS components and a standing service credential, for work a laptop already does at $0.00; no research file prices it, and this design adds no component without a priced case |
| CD-on-merge via a GitHub OIDC deploy role | Violates fact 3 outright: an automated identity holding infrastructure write scope. The only OIDC role that will ever exist is phase 2's data-plane role (`s3:PutObject` on `raw/*` + the prediction-log prefix, system-architecture §11), which cannot touch infrastructure |

## Consequences

- **The gate lives on one laptop.** A second contributor must install the gate's tools
  (gitleaks, osv-scanner, semgrep); `ci-local.mjs` skips a missing tool LOUDLY rather than
  passing silently, and a skip is not green. Contributor PRs get no automated checks; the
  maintainer's `merge:pr` run is where their code is gated.
- **Merged is not deployed.** The gap is a normal, visible, human-owned state (08-devops §3);
  `cdk diff` shows the infra delta on demand. No mechanism deploys behind the human's back.
- **The trunk contract is behavioral, not mechanical.** Nothing on GitHub's side blocks a bad
  merge; the discipline is the `merge:pr`-only landing rule plus the hooks. Accepted for a
  one-operator project; revisit if the contributor count grows.
- The phase-2 `workflow_dispatch` enrichment lane is unaffected: it is not CI, not CD, and
  best-effort by design (08-devops §8).
