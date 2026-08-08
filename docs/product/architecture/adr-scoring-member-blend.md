# ADR: Member blend — input-space mean over usable members, circular for direction

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Context:** C4 Publication, scoring engine · **Owner:** scoring lane

## Decision

1. One score per (spot, valid hour) is computed from a **single blended input**: arithmetic
   mean of member `swell_h_m` and `swell_t_s`, **circular mean** of `swell_dir_deg`
   (`atan2(Σsin, Σcos)`), over the usable members only.
2. Usable = the latest run per source with `run_ts ≤ build time` (settled,
   `domain-model.md` §6), minus land-masked rows (excluded upstream in C1, research 09 §8.3
   Finding 2) and minus rows with `h_m < 0` or `t_s <= 0` (counted, never silently dropped).
3. Zero usable members returns a `no_usable_members` value (a sum-type case, not an
   exception); the builder publishes the honest no-data state per research 09 §14.4.
4. The raw member values are still published in the bundle (`members[]`,
   `domain-model.md` §13) and the disagreement drives the confidence term. The mean is never
   presented as more accurate than the best member (research 09 §8.4).

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Score each member, publish the mean of scores | Rejected for launch | Through the nonlinear gate this diverges from input-mean exactly when members straddle a window edge; a member outside the window drags the score down even though the blend says the swell is inside. Defensible, but research 09 §8.4 endorses the input-space "poor man's ensemble" mean as the default, and the call log makes the two comparable offline later with zero user risk. Revisit with that evidence (item D1) |
| Best member only | Rejected | "We cannot know which member is best in Panama" without verification data (research 09 §8.4); picking one is a claim the data cannot back |
| Median | Rejected | With 3-4 members the median discards half the ensemble; no cited basis over the mean at this n |
| Weighted mean by per-source skill | Deferred | The right end state, but the weights are exactly what the scorecard has not yet measured; premature per research 09 §13.4 stage table |

## Consequences

- The confidence term, not the blend, carries the disagreement story ("models split 10 s vs
  15.5 s"). The blend stays simple and citable.
- Direction conflict (members ~115° apart, the §8.2 Malibu case) produces a physically dubious
  blended direction; the `Δdir` confidence penalty flags it hard. Recorded as a known limit
  (design doc §12.3), revisited only against call-log evidence.
- Circular-mean law L11 (359° and 1° blend to 0°) is a mandatory property test.
