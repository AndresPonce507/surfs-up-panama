# ADR: Pooling hierarchy — ship five levels collapsed, hard basin partition, tau floors until estimable

**Status:** Accepted (2026-08-12, amended; was Proposed, DESIGN round 2, 2026-08-08) · **Context:** C3 Verification & Learning · **Implements:** research 09 §5.4, §17; BRIEF constraint 5 (global-ready, Panama first)

## Decision

1. The shrinkage estimator `b_level = (n/(n+tau))*b_own + (tau/(n+tau))*b_parent` runs over a recursive hierarchy: global -> basin -> region -> similarity group -> spot. Levels key on spot-seed data only (`coast`, `region_id`, `break_type`, `spot_id`); nothing is keyed on Panama.
2. Basin is a HARD partition, never a soft prior (09 §17.4 guardrail 1): a Caribbean spot can never borrow from a Pacific one, at any weight.
3. The similarity-group level (hand-assigned `break_type`, per 09 §17.3's explicit recommendation against learned clustering at this scale) ships COLLAPSED into region and activates per group when >= 3 spots in that group pass the correction gates. Data-driven activation, zero code change.
4. Parent levels use group-weighted means with influence caps (`n_eff = min(n, 200)` per region, per-reporter caps inside a region) so one hyperactive region cannot become the world prior (09 §17.5). At launch the global record carries `n_regions: 1` and is treated as regional until a second region corroborates it.
5. tau per level is hand-set ONLY until estimable: prior tau = 6 at spot level (sigma ~0.42 over sigma_between ~0.17, unfit priors), permanent floor tau >= 2; switchover to method-of-moments (`sigma_between^2 = var(b_hat) - mean(se^2)` across gated spots) once >= 8 spots pass the gates. tau_u (reporter level) re-estimates at >= 50 reporters with >= 5 reports.
6. The shrinkage weight per spot is published in the monthly metrics file (09 §17.4 guardrail 2): a spot with 80 observations still 60% shrunk is a misconfiguration alarm, not a curiosity.

**Amendments (review against the built code, 2026-08-12):**

- The shrinkage chain deliberately terminates at the basin. Decision 2's hard wall overrides decision 1's global level: a global term feeding back down into a basin would be cross-basin borrowing at a small weight, which guardrail 1 forbids at any weight. This matches the built code (`src/learning/hierarchy.ts`, learning lane): the global record stays a labeled report of one region's data (`n_regions: 1`), never a term any spot's stored number reads.
- Decision 4's per-reporter effective-sample cap ships mechanism-built but uncapped: `SHIPPED_POOLING_CAPS.max_effective_samples_per_reporter` is `Infinity` because no design source declares a value (06 §8 declares only the per-region 200). The mechanism is proven to fire by injecting a cap in the unit laws; the VALUE decision remains open.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Estimate tau from data on day one, no priors | Rejected as impossible | With one region and < 8 gated spots, sigma_between is unidentifiable; the estimator needs between-group variance that does not exist yet. 09 §17.4's "never hand-set" is honored in spirit via floors + a stated switchover, because its letter cannot be at n_regions = 1 |
| Flat two-level model (global + spot) forever | Rejected | Kills the compounding global property (09 §17.1-17.2): a new spot anywhere inheriting region -> basin -> global on day one is the cold-start answer and the whole global thesis |
| Activate all five levels at launch | Rejected | More levels = more variance parameters fitted on near-zero data; groups of ~7 spots with 1-2 gated members produce noisy group means that drag siblings (09 §17.4's stated failure mode). Collapsed-until-evidence is the parsimonious middle |
| Learned similarity clustering | Rejected | 09 §17.3 verbatim: fits noise at this scale and is uninspectable; hand-assigned groups let a local say the grouping is wrong |

## Consequences

- The 17.1 load-bearing claim (model bias has regional structure) is UNVERIFIED in the research; the moment a second region reaches ~30 observations, the transfer test (does Panama's correction help?) runs from data already collected (09 §17.5). The hierarchy is cheap insurance either way: if bias is purely idiosyncratic, fitted sigma_between grows, tau shrinks, and pooling self-cancels.
- Basin needs to be derivable per region as the product goes global; at launch `coast` on the seed suffices. A region registry carrying an explicit basin field is a small pre-second-region task, flagged.
- Collapsed levels mean launch behavior is exactly the simple 09 §5.4 two-level formula; complexity arrives only with the data that justifies it.
