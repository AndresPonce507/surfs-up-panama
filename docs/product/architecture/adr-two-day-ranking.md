# ADR: Two-day ranking — per-day ranked summary arrays plus an unordered spot-detail map

**Status:** Proposed (2026-08-08 coherence round, second pass) · **Lane:** domain/data · **Amends:** `domain-model.md` §13, §15, §17 · **Context:** C4 Publication

## Context

Decision 10 binds the product to today AND tomorrow. The route table renders them as separate prerendered routes (`/manana`, `/en/tomorrow` — "same list for tomorrow"), and application-architecture P1 asks for its render fields **per spot, per day**. Round-1 §13 carried one flat `spots` array under the rule "array order IS rank" — deliberately, so order and rank could never contradict each other.

An array has one order. One order encodes exactly one ranking, and §13 labelled it today's. Tomorrow's ranking had **no representation anywhere**, even though the bundle already carries 48 h of hourly data per spot, so the underlying numbers exist. Worse, the gap is not only the rank: every day-scoped summary field (`score_q`, `call`, `size_band`, `best_window`, `wind_state`, `conf_level`, `confidence_reason`, `weakest_link`, `damages`) existed once, implicitly for today — the tomorrow route had neither an order nor values to render in it. Both documents were individually consistent, which is why four amendment passes missed it.

## Options

| # | Shape | Order vs rank can disagree? | Byte cost vs 27.5 KB gz baseline | Two-route render |
|---|---|---|---|---|
| A | Day-keyed arrays of **full** spot objects (`days[].spots[]` carrying everything) | No — one order per day | ~2× (~55 KB): duplicates `hourly` (the dominant payload), `scorecard`, `reports`, `members` per day, plus a new "both copies identical" invariant — a divergence surface | Trivial: one array per route |
| B | One flat `spots` array + explicit per-day `rank` fields | **Yes** — reintroduces exactly the contradiction the round-1 rule exists to prevent (two spots can claim rank 1; order says one thing, field says another) | Cheapest diff | Sort by field per route |
| C | Two `spot_id` ranking index arrays in the header; `spots` unordered | Needs a "spots order means nothing" declaration + permutation integrity checks | Negligible (+~0.5 KB) | Ranking without values: tomorrow's summary fields still have no home — does not satisfy P1 per-day, so C alone is incomplete |
| **D (chosen)** | **Split by data lifetime**: `days:[{date, spots:[day-summary objects, order = rank]}]` ×2 + `spot_detail` **object** keyed by `spot_id` for day-independent data | No — one order per day, each in its own array; `spot_detail` is a JSON object, which has no order, so no second ranking exists to contradict | **+3–4 KB gz estimated** (one more day-summary set, ~0.7 KB raw/spot, text-dominated; `hourly`/`scorecard`/`reports`/`members`/`tide` stay single-copy) | Trivial: `/` reads `days[0].spots`, `/manana` reads `days[1].spots`, `/spots/{slug}` reads `spot_detail[slug]` + both summaries |

## Decision

**Option D.** The round-1 rule survives strengthened: *order is rank, per day* — `days[d].spots[0]` is rank 1 of day `d`, no `rank` field anywhere. Day-scoped fields live in the day-summary objects (they genuinely differ per day — tomorrow has its own call, score, window, and a lower confidence, since `C_spread`/`C_track` are lead-dependent). Spot-scoped fields live once in `spot_detail`. Join key: `spot_id`, both directions. Exact field lists, sample, route mapping, and validity invariants: domain-model §13.

## Why D over the others

1. **Order-vs-rank**: only B can disagree with itself; A, C, D cannot. B rejected on that alone.
2. **A duplicates facts, D adds facts.** A's second copy of `hourly`/`scorecard`/`reports` is the same value in two homes — every future reader must check they match. D's second day-summary set is *new information* (tomorrow's values), not a copy; nothing exists twice.
3. **C is a rank with nothing to render.** P1 demands per-day fields; C answers only "in what order" and leaves "of what" homeless.
4. **Bytes**: all options are trivial against S3/builder budgets (bundle is builder input, never a browser payload). D's +3–4 KB gz is the smallest shape that is actually complete.

## Consequences

- Schema stays `region-bundle/1` — nothing is built yet (HANDOFF: no code), so this is a restructure of the proposed v1, not a version bump.
- The 27.5 KB gz measured figure remains the round-1 baseline; the measurement script must be re-run against the two-day sample before any new figure is quoted. Sizing conclusions unchanged.
- Frontend payload table renames to §13's canonical names (`spot_id` not `slug`, position not `rank`, `conf_level`, `confidence_reason{es,en}`, `call{es,en}`, scorecard field names) and maps routes to day arrays.
- Builder gains three LOUD-fail validity invariants (§13): day/detail referential integrity, same spot set both days, consecutive dates.
- `days[].date` is the civil date in the region's timezone — assumes a region never spans timezones (holds for `pa-pacific`; flagged in §15 for the first region where it could bind).
- A 7-day product would extend `days[]` without reshaping anything — noted only to show the shape is not a two-day special case; decision 10 still binds at two.
