# ADR: Prediction log — gzipped JSONL now, Parquet at scale, partitioned by run date

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** C1 Forecast Intake · **Owner:** domain/data lane

## Decision

1. The immutable prediction log is written as **gzipped JSONL**, one file per `(run_date, source, cycle, partition)`, under `predictions/v1/dt=<run_date>/src=<source>/cyc=<HH>Z/<partition>.jsonl.gz`.
2. **Partition by run date first** — retention, backfill, and learning-job scans are all date-scoped.
3. **Compaction to Parquet is triggered when a region exceeds ~500 spots** (or when the learning job's scan time over 90 days exceeds ~60 s, whichever comes first). Until then, no columnar dependency exists anywhere in the ingest path.
4. Record natural key: `(spot_id, source, run_ts, valid_ts)`. File-level idempotency uses conditional PUT: re-running a cycle receives an already-exists acknowledgement and does not alter the first receipt.
5. Insert-only. No UPDATE, no DELETE, no lifecycle deletion of `predictions/` — only storage-class transition (Glacier Instant Retrieval past 90 days, and only once volume warrants it, ≥500 spots).

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Parquet from day one (research 09 §13.1 recommendation) | Rejected for launch | ~15× compression vs raw JSON is real, but gzip JSONL already gets ~10× (measured: 342 B/record raw → ~21 B effective in a daily file), and Parquet costs a pyarrow dependency (~100 MB Lambda layer) in the one job that must never silently fail. If the infra lane lands GitHub Actions as the ingest runner, this cost drops to ~zero and the decision may be flipped — reopen then, not now |
| Uncompressed JSON per record (S3 object per snapshot) | Rejected | 53,760 PUTs/day at 20 spots — PUT cost dwarfs storage; unscannable |
| DynamoDB as the log | Rejected | ~24M writes/month at scale = $15+/mo for a write-once analytic dataset (research 08 §4.2); wrong tool |
| SQLite/Postgres "hot copy" of last 10 days (research 09 §13.1 aside) | Rejected | Contradicts the serverless $0 architecture; jobs read date partitions from S3 directly, which is cheap at every scale measured |
| Partition by spot first | Rejected | Retention and backfill are date-scoped; 20–5,000 spots filter fine inside a daily file or tile partition (research 09 §13.1) |

## Consequences

- Measured volume: 0.36 GB/yr gz at 20 spots · 8.95 at 500 · 89.5 at 5,000 (full fidelity 4 src × 4 runs × 168 h hourly). Storage never argues against fidelity.
- Anyone with DuckDB can query the log with zero infrastructure — matches the open-source posture.
- The compaction trigger is written down here so growth does not silently degrade the learning job.
