# ADR: Ingest runner — EventBridge Scheduler + Lambda, not GitHub Actions `schedule`

- **Status:** Proposed (DESIGN round 1, 2026-08-08)
- **Lane:** infrastructure (nw-system-designer)
- **Decides:** which primitive fires the hourly site rebuild and the 4×/day model refresh.

## Context

The mandate asked to evaluate GitHub Actions as the *primary* ingest runner (free and
unmetered on public repos, sidesteps the GRIB2 container/ECR problem) and to research its
actual cron reliability rather than assume it. That research exists:
`docs/research/raw/13-github-actions-cron-reliability.md` (all claims fetched live
2026-08-08).

The product tolerates stale-but-correct data (CloudFront `stale-if-error`), but it displays a
freshness stamp and promises an hourly republish; the learning loop's prediction log is
written on the same cadence.

## Evidence

| Fact | Source |
|---|---|
| Actions is free and unmetered on public-repo hosted runners | research 13 §1 (GitHub billing docs) |
| GitHub staff, 2026-06-04: "scheduled drops have grown >30% in 2ish months … this isn't a fix 'now'" | research 13, community discussion #196910 |
| Daily cron measured avg 2h42m late (best 1h59, worst 3h56); a `*/5` cron fired ~5% of its ~2,016 slots | research 13 §3, discussion #156282 (2026-07-28, single-user measurement, best available) |
| Public-repo scheduled workflows auto-disable after 60 days of repo inactivity; the canonical keepalive action is TOS-blocked by GitHub | research 13 §2 |
| No SLA at any tier covers scheduler punctuality | research 13 §5 |
| EventBridge Scheduler: 14,000,000 invocations/mo always-free; our use is 840/mo (0.006%) | research 08 §5.2 |
| MVP ingest needs no GRIB2 (Open-Meteo JSON primary), so a zip Lambda suffices — the container/ECR advantage of Actions is moot for phase 1 | research 08 §5.5 |

## Decision

**Primary: EventBridge Scheduler → zip-packaged Lambdas (fetch, build), hourly at :17 plus a
4×/day model-refresh schedule. Cost $0.00, timing owned by a paid-SLA AWS primitive.**

**Phase 2 (raw gfswave GRIB2 enrichment), preferred lane — hybrid dispatch:** EventBridge →
128 MB dispatcher Lambda → GitHub API `workflow_dispatch`. The workflow declares ONLY
`workflow_dispatch` (no `schedule`), so the 60-day auto-disable (which governs scheduled
workflows) and the measured schedule-queue drift both do not apply; the runner installs
eccodes via apt (no container, no ECR); it writes through a GitHub-OIDC-assumed IAM role
scoped to `s3:PutObject` on `raw/*` + `predictions/*` only. Known unknown: dispatch-triggered
run-start latency under load is unmeasured (research 13 measured the schedule queue only) —
acceptable for 4×/day enrichment, to be measured before reliance.

**Phase 2 fallback lane:** container-image Lambda (3008 MB × 240 s, 4×/day = 86,630 GB-s/mo,
inside the free tier) + ECR private repo with lifecycle policy (expire untagged, keep last 2
tagged) ≈ $0.15–0.25/mo (research 08 §5.4).

## Alternatives considered

| Option | Why rejected as primary |
|---|---|
| GitHub Actions `schedule` | Hours-late and lossy per first-party admission; 60-day disable with no sanctioned workaround; no punctuality SLA at any tier. Fine for "roughly daily, nobody dies"; wrong for an hourly republish with a user-visible freshness stamp. |
| GitHub Actions `schedule` + keepalive bot | The canonical keepalive action was TOS-blocked by GitHub for "circumventing the 60-day inactivity policy" — building on a workaround the platform actively bans is a dependency on getting away with it. |
| External cron service (e.g., cron-job.org) → `workflow_dispatch` | Adds an unpaid third party with no SLA to replace an AWS primitive we get free with an SLA; strictly worse than EventBridge → dispatcher. |
| EventBridge → container-image Lambda for everything from day 1 | Buys GRIB2 capability the MVP does not use, at the cost of ECR's 12-month-only free tier and image-accumulation risk (research 08 §5.4). Kept as the phase-2 fallback, not the default. |

## Consequences

- The ingest dead-man's switch (alarm on `IngestSuccess` absence, TreatMissingData:
  BREACHING) is the empirical probe that the scheduler actually fired — required regardless
  of runner, doubly load-bearing now that the runner choice was made on reliability grounds.
- The build code stays runner-agnostic (plain Node/Python entrypoints), so moving between
  Lambda, Actions-dispatch, and container lanes is a wiring change, not a rewrite
  (research 08 §14.3 made the same point in reverse).
- If GitHub fixes its scheduler backlog, nothing needs to move back: EventBridge is not the
  compromise option, it is equal-cost and more reliable. The Actions lane exists only to
  avoid ECR for GRIB2.
