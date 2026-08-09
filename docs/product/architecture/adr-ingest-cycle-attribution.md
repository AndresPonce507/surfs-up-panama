# ADR: Cycle attribution — inferred run_ts with a change-detection probe; insert-only enforced by S3 conditional PUT

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Lane:** ingest (nw-system-designer) · **Context:** C1 Forecast Intake

## Problem

The prediction log's natural key and its most load-bearing derived dimension are
`run_ts` (model cycle time, "never the fetch time") and `lead_h = valid_ts - run_ts`
(Domain Model §4, §5). Verified **[live 2026-08-08]**: an Open-Meteo marine response
carries no run/cycle metadata (fields observed: `generationtime_ms`, timezone, elevation,
units, hourly arrays; a probed metadata endpoint 404s). The provider serves "current data"
with no statement of which model run produced it. Stamping `run_ts` therefore requires
either inference or a different transport (raw GRIB2, which carries the cycle in the file
name and headers).

A wrong `run_ts` corrupts `lead_h`, which silently shifts every per-lead-bucket bias
estimate the learning loop computes (research 09 §13.1's stratification trap). This is
worth an ADR because the failure is invisible when it happens.

## Decision

1. **Source registry declares, per model: cycle schedule and a conservative availability
   latency.** GFS-family: 4 cycles/day, ~3.5-5 h latency (research 05 §2; wave-specific
   latency UNVERIFIED, research 05 §14). MFWAM, GWAM: 2 cycles/day (research 01 §1.5,
   research 05 §8), latency default 6 h until measured.
2. **Candidate cycle** = latest cycle with `now >= cycle + latency`.
3. **Change-detection probe before any write**: compare the fetched series against the
   previously logged cycle's file over the overlapping `valid_ts` hours. Identical -> the
   provider has not swapped runs: attribute to the OLD cycle, write nothing. Different ->
   the new run landed: write the candidate cycle's file. The empirical observation, not
   the schedule, is what mints a new cycle. Implementation contract, so two builders
   cannot diverge:
   - Window: all `valid_ts` in `[candidate_cycle, candidate_cycle + 48 h)` present in
     both series (>= 48 hours x 3 wave fields x sampled spots).
   - Equality: exact equality on the serialized decimal values as returned by the API
     (no epsilon: the comparison is "did the provider change its answer", not a physics
     comparison).
   - Nulls: null == null counts as identical; null vs number counts as different.
   - Early exit: first differing value concludes "new run"; only the all-identical
     verdict requires the full scan.
4. **The log file PUT uses `If-None-Match: *`** (S3 conditional write). First write wins;
   any duplicate or concurrent run gets 412 and records a duplicate ack. Insert-only is
   thereby enforced by the substrate instead of by discipline, and a cold-start probe
   exercises the 412 path against a sentinel key so a substrate that ignores the header
   (local S3 clones do) refuses to start rather than silently corrupting write-once
   semantics.
5. **Honesty boundary, stated for consumers**: Open-Meteo-sourced rows have inferred
   `run_ts`; NCEP members gain observed `run_ts` when the phase-2 GRIB2 lane lands, which
   also measures retroactively how often inference was wrong (compare same-key rows).
   The learning lane treats pre-phase-2 lead buckets for non-NCEP members as soft by
   +-1 cycle (flagged in 04-ingest-pipeline §11).

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Stamp run_ts purely from the schedule (no probe) | Rejected | A lagging provider mislabels an entire cycle's rows with no error anywhere; the probe converts that failure mode into bounded latency (attribute-to-old until observed change) |
| Stamp run_ts = fetch hour (drop cycles) | Rejected | Redefines the domain lane's key and destroys lead-time stratification; `fetched_ts` already exists for audit |
| Add a provenance field (`run_basis: assumed/observed`) to the record | Not taken unilaterally | Schema is the domain lane's; the same information is derivable (source + date vs phase-2 cutover), and adding a field requires a named consumer first. Revisit with the domain lane if the learning lane wants it explicit |
| GRIB2 now for exact run_ts | Deferred | Decision 3 in 04-ingest-pipeline §13: pull forward only if measured mislabeling exceeds ~1% |

## Consequences

- Hourly polling is load-bearing: it is the observation channel for cycle arrival
  (a 4x/day fetch could not run the probe more often than it fires).
- Worst case of a probe false-negative (two runs byte-identical over the compared
  window): one hour of attribution latency, never a mislabel.
- Acceptance is measured, not assumed: launch verification V1/V2 (04-ingest-pipeline §12)
  measures real arrival latencies and probe false-negative streaks over the first 7 days
  and corrects the registry from data; phase-2 V4 measures inference mislabels
  retroactively against GRIB2's observed run_ts, with > ~1% triggering the GRIB2
  pull-forward decision.
- If Open-Meteo amends values inside one cycle, first-write-wins keeps the earliest
  fetched opinion: consistent with snapshot semantics ("what the model said when we
  looked"), and the drift frequency is measurable later from `raw/` archives.
