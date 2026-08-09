# ADR: Write path on bare Function URLs, not behind CloudFront

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Lane:** write path · **Supersedes:** `system-architecture.md` §5's `/api/*` CloudFront behavior, §6's OAC + `AWS_IAM` framing, and guardrail 6's "`AuthType: AWS_IAM` on every Function URL" assert — for the four write functions only. The read path stays exactly as the infra lane designed it. Evidence base: `docs/research/raw/15-anonymous-write-path-abuse-protection.md` §4, §5, §7 (all AWS citations there accessed 2026-08-08).

## Context

Two independent lanes flagged the contradiction; the round-2 dispatch assigns the resolution to the write-path lane. The infra design routes `/api/*` through the CloudFront distribution with OAC signing so the raw Lambda URL cannot be hit directly. Research 15 §7 shows that for an anonymous write path under attack this inverts the cost model.

## Decision

`/api/report`, `/api/mint`, `/api/push`, `/api/photo-url` are **bare Lambda Function URLs, auth type `NONE`**, CORS `AllowOrigins` set to the exact site origin (never `*`), reserved concurrency as the rate limiter (report 2, others 1). They do not appear in any CloudFront behavior.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| CloudFront + OAC + `AWS_IAM` (the round-1 infra design) | **Rejected for writes** | A rejected request bills $1.00–$2.20 per million at CloudFront vs ≈ nothing at a bare URL — a throttled Function URL 429 is not billed as a Lambda invocation (research 15 §5.1, primary AWS doc). 25–55× more expensive per rejected request, and a write-path flood eats the same 10M free requests the read path depends on. The two paths must not share a meter (research 15 §7) |
| API Gateway with throttling | Rejected | Free tier is 12-month only, not perpetual (settled: system-architecture §6, research 08 §3.2) |
| Bare Function URL, auth `NONE` | **Chosen** | The 429 at the Lambda front door is the only free, unlimited rejection in the whole AWS catalog. Max RPS = 10 × reserved concurrency; concurrency 0 deactivates the URL instantly and free (research 15 §4) |

## What is genuinely lost, and why it does not matter here

| Lost | Assessment |
|---|---|
| OAC hiding the Lambda URL | Nothing real: the repo is public and the URL ships in the client bundle. It was never hidden (BRIEF constraint 4) |
| Single domain, no preflight | One OPTIONS preflight per origin and a second hostname. Accepted; CORS is configured natively on the URL |
| A place to attach WAF later | Preserved as the escape hatch: under sustained attack, flip the write path behind CloudFront and buy the flat Pro plan ($15/mo) temporarily — write-path doc §7.2 tier 5 |

## Consequences

- Guardrail 6's CDK assert must split: `BLOCK_ALL` + OAC on buckets and read behaviors unchanged; the four write URLs assert `AuthType: NONE` + exact-origin CORS instead of `AWS_IAM`.
- CORS is browser-only discipline, not a defence; `curl` ignores it (research 15 §4). The defences are concurrency, provisioned capacity, and the breakers.
- **Carried caveat, not laundered:** whether AWS meters data-transfer-out for a front-door 429 is UNVERIFIED (research 15 §15.3). Pessimistic bound: ~$27 per billion rejected requests after the free 100 GB egress — still ~40× cheaper than the CloudFront path's $1,000+ for the same flood. If metered, the working control is deleting the Function URL config (tier 4), which stops response bytes entirely. Verify with a load test before launch.
