# ADR: Correction gates and clamps — exact numbers, system-level blocked CV

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Context:** C3 Verification & Learning · **Implements:** research 09 §13.3-13.4; decisions 19, 24; HANDOFF §6 item 12

## Decision

1. A correction (height per (spot, source, lead_bucket); score per spot) carries `applied: true` only when ALL hold: `n >= 10`, `distinct(reporter_key) >= 5`, `|b_shrunk| > 2*se`, shrinkage on. Below the gates the payload carries the `n / 30` counter and `claim_ok: false`; the product never shows a sub-gate number.
2. Clamps are enforced at APPLY time by the builder, not at write time: `|b_height| <= 0.40 * forecast_H` (09 §13.4 gate 5), `|b_score| <= 12` points (v1 prior; adds `clamp.max_abs_score` to schema spot-correction/1, additive). A corrupt correction file can therefore never print an absurd public number, and deleting the file reverts the spot to pure seed.
3. Blocked cross-validation (09 §13.4 gate 4) runs monthly at SYSTEM level: rolling-origin held-out time blocks; if corrected MAE loses to raw at the majority of gated keys, `applied: false` everywhere until a human reviews. Random k-fold is banned (consecutive hours of one swell are near-duplicates; random splits leak).
4. The scorecard display gate (`claim_ok`, settled in domain-model §9) and the correction apply gate are the SAME three conditions evaluated at two points; neither may drift from the other. One rule, two enforcement sites.
5. Two claim ladders, never conflated: per-spot scorecard claims gate on 1-3 above; the product-level accuracy claim ("better than the raw model") gates separately on ~400 same-day multi-spot comparison pairs with positive pairwise lift (09 §10.2, §10.4). Both fail at launch by construction.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Per-spot blocked CV as a fifth per-key gate | Rejected | At n ~10 a per-spot held-out split is noise and the gate would flap monthly; the system-level test catches a broken modeling approach, which is what gate 4 exists for |
| Lower gate (n >= 5) to go live sooner | Rejected | 09 §5.2: at sigma ~0.5 only a bias > 0.63 m could pass significance at n=5; anything the lower gate would admit is either huge (visible at 10 anyway within days) or noise |
| Higher gate (n >= 30) for safety | Rejected | 09 §13.4 names 10-30 with 30 as the counter target, not the floor; the 2*se significance gate already scales the bar with n, so a hard 30 only delays honest corrections at chunky-bias spots (the exact spots the product exists for) |
| No score clamp (G6) | Rejected | The height clamp has a research citation; the score path needs an equivalent seatbelt or a runaway q_obs anchor could move a spot by tens of points on paper-thin data |
| Write-time clamping | Rejected | Apply-time clamping survives a corrupt or stale file; write-time does not. Same reasoning as the settled read-time gates in domain-model §11 |

## Consequences

- The exact floor (10) is not load-bearing: significance does the real gating at small n. Defensible to state publicly.
- The monthly system kill switch means one bad modeling change degrades to "no corrections anywhere" (the day-0 product), never to silently wrong numbers. Degrade-loud by construction.
- The 12-point score clamp is a v1 prior flagged for Andres (learning layer §15 D5); it binds only after every other gate has passed.
