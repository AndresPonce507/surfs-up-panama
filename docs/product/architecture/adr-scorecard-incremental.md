# ADR: Scorecard — incremental daily/monthly aggregate items, cursor exactly-once

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** C3 Verification & Learning · **Implements:** HANDOFF §4 "updated incrementally rather than recomputed"

## Decision

1. Scorecard grain: `(spot_id, source, lead_bucket, variable)`, `variable ∈ {swell_h, wind, score}`, lead buckets `[0,12) [12,24) [24,48) [48,96) [96,∞)` hours — left-inclusive, right-exclusive (research 09 §13.1 — pooling lead times silently corrupts the learned bias).
2. **Level 1 (write): daily aggregate items** `SCORE#<src>#<lead>#<var>#D#<date>` holding `{n, sum_err, sum_abs_err, sum_sq_err, device_ids[]}`, updated by atomic `ADD` per verified pair. **Level 2 (read): the hourly builder sums ≤90 daily items** into 30 d/90 d windows and monthly rollup items into `all`. No full recompute anywhere in the steady state.
3. Exactly-once: the updater advances a `JobCursor` over report SKs with a conditional update; `ADD` is never applied twice to the same report.
4. Raw `device_ids` are stored in daily rows; `distinct_reporters` is resolved through C5 at read time (merge-safe — see `adr-identity-claim-merge.md`).
5. Honesty gates are part of the read contract: a claim publishes only when `n ≥ 10 AND distinct_reporters ≥ 5 AND |bias| > 2·bias_se`; otherwise the payload carries the `"n / 30"` counter and `claim_ok: false` (research 09 §13.3–13.4, decision 19).
6. Recovery: the scorecard is a projection of `log/predictions/` + `log/observations/` and is rebuildable from them — a defective updater loses no data.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Full nightly recompute from logs | Rejected as steady state | Violates the mandate; cost grows with history; kept as the documented **recovery path** only |
| EWMA single item per key | Rejected | Cheapest, but cannot honestly say "25% too big **for 30 days**" — the headline claim needs a true window; exponential windows also complicate `bias_se` |
| Per-pair verification items (event-sourced scorecard) | Rejected | The pairs already exist implicitly in the two logs; materializing them doubles storage to buy a replay we get from the logs |
| Resolved reporter counts in rows | Rejected | Breaks under identity merge; see `adr-identity-claim-merge.md` |

## Consequences

- Builder reads stay O(daily items per key) ≤ 90; updater writes stay O(sources × lead buckets) per report (~20 `ADD`s).
- The cursor serializes the updater — fine at launch volume; if throughput ever demands parallelism, switch to per-(report, key) idempotency markers (flagged, Domain Model §15.3).
