# ADR: Prediction log — gzipped JSONL now, Parquet at scale, partitioned by run date

**Status:** Proposed (DESIGN round 1, 2026-08-08) · **Context:** C1 Forecast Intake · **Owner:** domain/data lane

## Decision

1. The immutable prediction log is written as **gzipped JSONL**, one file per `(run_date, source, cycle, partition)`, under `predictions/v1/dt=<run_date>/src=<source>/cyc=<HH>Z/<partition>.jsonl.gz`.
2. **Partition by run date first** — retention, backfill, and learning-job scans are all date-scoped.
3. **Compaction to Parquet is triggered when a region exceeds ~500 spots** (or when the learning job's scan time over 90 days exceeds ~60 s, whichever comes first). Until then, no columnar dependency exists anywhere in the ingest path.
4. Record natural key: `(spot_id, source, run_ts, valid_ts)`. File-level idempotency uses conditional PUT: re-running a cycle receives an already-exists acknowledgement and does not alter the first receipt.
5. Insert-only. No UPDATE, no DELETE, no lifecycle deletion of `predictions/` — only storage-class transition (Glacier Instant Retrieval past 90 days, and only once volume warrants it, ≥500 spots).
6. **The `<partition>` token names the forecast WINDOW the cycle had published when the fetch saw it**: `all-window-<16 hex of sha256 over that member's sorted `valid_ts` set>.jsonl.gz`. Amended 2026-08-13, see below. Insert-only is additionally enforced at the RECORD grain: a run whose rows would restate an already-archived `(spot_id, source, run_ts, valid_ts)` with a **different wave forecast** refuses that object outright rather than filing it beside the row it contradicts.

## Amendment 2026-08-13 — the window belongs in the key (production defect)

**Context.** Decision 1 addressed an object by run identity alone. The provider is asked for whole forecast DAYS in UTC (`forecast_days`, `open-meteo-source.ts`), so its window advances at UTC midnight, while the attributed cycle holds until the next 6-hourly cycle clears its publication latency. Between those two instants the same cycle emits hours it had never emitted before. Observed live: two fetches of `cyc=18Z` on `dt=2026-08-12` either side of midnight; the second carried Aug 14, hashed to the first's key, the conditional PUT answered `already-exists`, and a whole forecast day was discarded. The build then refused with `missing complete today or tomorrow ranking` every hour and the site could not publish.

**Why this does not weaken write-once.** Appending hours the same run emitted later is not rewriting history; silently overwriting or mutating an archived row is. Nothing here mutates: each object is still written once with `If-None-Match:*` and its bytes never move. What changed is only that an object now says *which hours it covers*, so two genuinely different contents can no longer be forced to share one address — which is what was destroying data.

**Why the id hashes the hour set and nothing else.** The name must be a pure function of `(cycle, window)`. Two consequences, both load-bearing:

- repeating a fetch verbatim lands on the same key, so conditional PUT keeps its exact old meaning and idempotency is not traded away for the fix;
- a cycle that restates the SAME hours with DIFFERENT numbers **collides** rather than diverging, so it can never slip past write-once under a fresh name. Hashing the row *values* — the naive instinct — would invert precisely this and turn the key into a rewrite channel.

The record-grain refusal in decision 6 closes the one hole the new key does open: a *widened* window whose overlapping hours disagree would otherwise be a new address carrying a contradiction. It is refused, and the refusal is stated as `health.archive.rewrite_refused` (informational; no metric filter watches it, following `build.refused`'s precedent).

**What the refusal compares, and what it must not.** Only what the natural key identifies: one wave model's cycle predicting one hour (`lead_h`, `swell_*`, `swell2_*`, `land_masked`). Deliberately excluded are `fetched_ts` (audit/debug only, domain-model.md §5.1) and the `wind_*` / `tide_*` columns, which are contemporaneous joins from providers running their own cycles and legitimately differ between two looks at the same wave cycle. Treating either as history would refuse every genuine rollforward — the original defect wearing a guard's clothes. This is pinned by a falsifiable test: widening the comparison to `fetched_ts` and wind makes the build stop publishing again.

**Reader.** No reader change. `build.ts` lists the whole `dt=` prefix and takes the freshest `run_ts` per source; two rows tying on `run_ts` now genuinely can appear (one hour filed under two windows), and `freshestBySource`'s documented tie rule — keep the row already held, first in listed key order — resolves it deterministically. The refusal above is what keeps that comment's claim ("either is the same opinion") true of the forecast.

**Degraded path.** `listPredictions`/`getPrediction` are optional on `IngestStore`. A store without them makes both the attribution retention and the record-grain refusal inert, leaving immutability resting on conditional PUT alone — exactly the guarantee this path always had, no weaker.

**Cost.** The window rolls once per UTC day, so this adds at most one extra object per `(source, cycle)` per day; against §5.3's measured 0.36 GB/yr at 20 spots the storage effect is not measurable.

| Alternative | Verdict | Why |
|---|---|---|
| Keep the key, make the write append-only at row granularity (read, merge, re-PUT) | **Rejected** | Requires overwriting the bytes of an object already archived. That is the one thing the log may never do (§5 "insert-only; no UPDATE, no DELETE"), and with no compare-and-swap on the object it also opens a lost-update race between two runs. Preserving rows logically while mutating the artifact is not preserving history |
| Supplemental object holding only rows not previously archived | **Rejected** | Its content depends on the archive's state at write time while its name depends on the fetch, so the same fetch against two bucket histories yields different bytes. A replay from `raw/` would no longer reproduce the object, and a partial series is not interpretable on its own — the forensic value of a receipt is that it is the whole thing the provider said |
| A new `win=<id>/` path segment instead of the `<partition>` filename slot | **Rejected** | The archive already holds `all.jsonl.gz` objects that are immutable forever, so a new segment would split the log across two depths permanently, breaking fixed-depth globs and hive-partitioned reads over it. The filename slot keeps every object at one depth and keeps §5.2's file natural key `(run_date, source, cycle, partition)` literally true |

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
