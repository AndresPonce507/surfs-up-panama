# ADR: CloudFront billing model — pay-as-you-go, with the flat Pro plan as the pre-decided emergency brake

- **Status:** Proposed (DESIGN round 1, 2026-08-08)
- **Lane:** infrastructure (nw-system-designer)

## Context

CloudFront sells two mutually exclusive billing models (research 08 §2.4, accessed
2026-08-08), and the choice is per-distribution, switchable without migration:

| | Pay-as-you-go | Flat-rate Free plan | Flat-rate Pro plan |
|---|---|---|---|
| Free requests/mo | **10,000,000 (always-free)** | 1,000,000 | 10,000,000 |
| Free egress/mo | **1 TB (always-free)** | 100 GB | 50 TB |
| Overage | billed per unit | "no additional overage charges" — enforcement mechanism UNDOCUMENTED | same wording |
| Extras | none | bundled WAF/DDoS/bot mgmt | same, $15/mo per distribution |

The flat Free plan's 1M requests ≈ exhausted by ~1,600 MAU on our traffic model — too small.
The flat plans' "no overage charges" has no documented enforcement behavior (throttle? block?)
— an unverified hard cap is not a hard cap (research 08 §2.4).

## Decision

**Pay-as-you-go.** Its always-free tier (10M requests / 1 TB) is 10× the flat Free plan and
covers the design to ~50,000 MAU at $0.00 given the ≤10 requests/session budget. **The flat
Pro plan ($15/mo) is the pre-decided emergency brake** — pulled only on sustained attack or a
verified runaway request bill, via a per-distribution setting, documented in the runbook with
the trigger condition (CloudFront request alarm) and the console path. It bundles WAF/DDoS/bot
management, which is cheaper than à-la-carte WAF ($7/mo minimum config).

## Alternatives considered

| Option | Why rejected |
|---|---|
| Flat Free plan from day 1 | 10× smaller free tier; breaks at ~1,600 MAU |
| Flat Pro plan from day 1 | $15/mo = 75% of the $20 alarm budget spent pre-emptively on a risk the request alarm already catches in time; and Pro also caps at 10M requests, so it does not even extend the request ceiling (research 08 §12.5) |
| Buy WAF on pay-as-you-go | $5/ACL + $1/rule + $0.60/M = $7/mo at zero traffic; the cached read path cannot be overwhelmed and the write path is concurrency-capped (research 08 §10.4) |

## Consequences

- The request count per session becomes a governed budget (≤10, owed by the frontend lane) —
  it is the entire distance between free and the first real bill.
- One open item rides on this ADR: if the Pro plan is ever activated, first verify what its
  "no overage" actually does past 10M requests (research 08 §2.4 — UNVERIFIED).
