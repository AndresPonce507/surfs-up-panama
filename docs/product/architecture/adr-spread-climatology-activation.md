# ADR: Spread climatology activates after 30 completed local days and fails closed

**Status:** Accepted, 2026-08-10
**Context:** Trust Slice 05 / `C_spread`
**Implements:** research 09 §3.6; `05-scoring-engine.md` §6.1; `06-learning-layer.md` §10

## Context

Research establishes that inter-model spread is only a qualitative signal at unusually high or
low values relative to a spot's own historical spread. It deliberately gives no sample-size
threshold. The project must therefore set a reversible data-availability policy before the
percentile form can be used, without representing that policy as calibration evidence. The
PublishedCall archive is insert-only and began on 2026-08-08, so no historical value may be
backfilled or borrowed from another spot.

## Decision

1. Set `spread_climatology.minimum_history_days` to **30** in the versioned launch policy.
2. Count only one qualifying observation for each distinct completed spot-local forecast day.
   It must have usable multi-source spread in that spot's PublishedCall history. The call being
   published is excluded from its own reference distribution.
3. At fewer than 30 observations, or if the history read is unavailable, malformed, or cannot
   prove that grain, use the existing absolute-spread form and omit normal-comparison wording.
   No partial, cross-spot, backfilled, or fabricated climatology is permitted.
4. Availability and validity are separate gates. A 30-day history only permits the percentile
   form. The existing learning-lane calibration check remains authoritative: on failure it sets
   `confidence_factors.spread` to `false`, removing the entire spread factor rather than falling
   back to either spread form. Re-enable only after a later recorded evaluation.

`30` is an unfit, reversible policy prior. It matches the project’s settled 30-day evidence
counter and lies between Slice 05’s honest two-day negative fixture and sixty-day positive
fixture. It makes no claim that 30 days establishes forecast skill or calibration.

## Alternatives considered

| Option | Decision | Reason |
|---|---|---|
| Activate on any historical row | Rejected | A two-day percentile is noise and contradicts the roadmap’s explicit thin-history guard. |
| Require 60 days | Rejected | The fixture's 60 days is a safe test bound, not a research-backed activation floor. It would delay a qualitative, separately kill-switch-protected signal without added established evidence. |
| Pool other spots or backfill history | Rejected | Research requires a spot’s own climatology; archived predictions cannot be recreated honestly. |

## Consequences

- Slice 05-01 may enter implementation planning now, but production activation remains unavailable
  until each spot earns 30 qualifying days.
- The policy is data, not an engine constant. A future change must be an explicit policy/ADR
  decision and must preserve existing PublishedCall history.
- The consumer of the archive must probe the actual history source at startup and in CI with
  unavailable, malformed, duplicate-date, and one-source-history fixtures. A failed probe must
  refuse climatology and report structured `health.startup.refused`; it must never synthesize a
  percentile. This is the required evidence that the history adapter honors this contract.
