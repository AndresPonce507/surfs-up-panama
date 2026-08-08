# ADR: DynamoDB provisioned at the free tier, never on-demand

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Lane:** write path · **Supersedes:** the billing mode in `adr-write-store-single-table.md` ("one on-demand DynamoDB table") and `system-architecture.md` §3/§8's on-demand rows. **Everything else in the settled store design — table, 10+ item types, keys, GSIs, access patterns — is untouched and remains authoritative.** Evidence: research 15 §9 (prices accessed 2026-08-08).

## Decision

The `surfsup` table runs **provisioned capacity at exactly the always-free allowance: 25 WCU / 25 RCU**. No autoscaling. This is a cost control disguised as a pricing choice.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| On-demand (round-1 default) | **Rejected** | Fails open: an attack that gets past Lambda is served and billed at $0.6250 per million writes — $32.40/mo at the write path's 20 RPS ceiling. The bill is the only limit |
| Provisioned + autoscaling | Rejected | Reintroduces fail-open with extra steps: the scaler raises the ceiling exactly when an attack pushes on it |
| Provisioned, fixed at 25/25 | **Chosen** | Fails closed: past the limit DynamoDB throttles (`ProvisionedThroughputExceededException`) for free. The free 25 WCU cannot be exceeded because it physically cannot serve more |

## Consequences

- **Fail-closed is queue-safe by prior design**: a throttled write returns 429 to the client and the report stays in the offline queue (decision 26). Never drop a report because of a throttle — the same client contract as a Lambda 429.
- Write arithmetic (write-path doc §4.2): an accepted report costs 5 WCU (transactional quota+put at 2× each, plus the counter), so the table sustains ≈ 5 accepted reports/s — below Lambda's 20 RPS cap, meaning **DynamoDB throttles first during a genuine mass sync**. Accepted: honest launch traffic is single-digit writes per *minute*; the unwritten items stay queued and drain within seconds.
- The write-path startup probe asserts `BillingMode = PROVISIONED` via `DescribeTable` and refuses to serve otherwise — the drift back to on-demand is caught loudly at deploy, not on the first bill.
- CDK guardrail assert gains `BillingMode: PROVISIONED` + the exact 25/25 values.
