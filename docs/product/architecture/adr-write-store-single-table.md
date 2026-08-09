# ADR: Write-path store — one DynamoDB single table, keys derived from enumerated access patterns

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** write path (C2, C3, C5, push) · **Supersedes:** the illustrative sketch in research 08 §4.4

## Decision

One on-demand DynamoDB table (`surfsup`), 10 item types, 2 GSIs — the full key map and the 15-access-pattern table it was derived from live in the Domain Model §12 (single source; not restated here). Load-bearing choices:

1. **Reports and scorecard rows share `PK=SPOT#<id>`** so the hourly builder issues one Query per spot.
2. **Report `SK = REP#<observed_at_utc>#<report_id>`** — lexicographic = chronological (UTC only), and PK+SK doubles as the offline-dedup natural key: idempotency is one `attribute_not_exists(SK)` condition, zero extra reads.
3. **GSI1 = `DEV#<device_id>`** (device history, subscription cleanup); **GSI2 = `TILE#<geohash4>`** (builder + nightly export query per tile — the unit that stays O(tiles) as spots grow; tile computed from lat/lon at write time, never from country).
4. Quota and session items use native TTL. A `JobCursor` item gives the scorecard updater exactly-once semantics over the report stream (its `ADD` increments are not retry-idempotent on their own).
5. Forecast data never enters DynamoDB — it is a build artifact in S3 (research 08 §4.2's cost math: 24M row-writes/month vs 45 file PUTs).

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Multiple tables (reports, identity, subs) | Rejected | No isolation benefit at this scale; single table keeps the builder to one query per spot and one IAM surface |
| DynamoDB as forecast read store | Rejected | $15+/mo in writes alone at hourly regeneration (research 08 §4.2) |
| Aurora Serverless v2 / RDS / Timestream | Rejected | 15–30 s resume against a 5 am dawn-patrol burst; $44/mo awake floor; $3/mo Timestream floor (research 08 §4.2) |
| Region-keyed GSI2 (`REGION#`) instead of tiles | Rejected | Region is a publication concept that can exceed the 10 GB item-collection comfort zone and re-partitions badly; geohash tiles scale globally and are already the build fan-out unit (research 08 §15.5) |
| Dedup via separate idempotency-key item | Rejected | The natural key already contains `report_id`; a second item doubles writes for nothing |

## Consequences

- Write cost rounds to $0.00 at launch (654 B report item = 1 WCU); ≈$4.7/mo at a hypothetical 250k reports/day — audience-axis cost, tracked in research 08 §15.4.
- 25 GB free storage = years of headroom; if global scale ever pressures it, TTL live reports at 180 d **after** the nightly S3 export is proven (Domain Model D6) — the export is the archive of record.
- The research 08 §4.4 sketch (`rating`, `height_ft`, `SESSION#<t>` shapes) must not be copied by other lanes; this ADR + Domain Model §12 are the authority.
