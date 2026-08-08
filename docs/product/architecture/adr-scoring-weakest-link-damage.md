# ADR: Weakest link = argmax of weighted log-damage, not min sub-score

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Context:** C4 Publication, scoring engine · **Owner:** scoring lane

## Decision

The "what killed it" label (decision 17, P1 render input) is computed by the engine as a
first-class output, defined as the factor with the largest contribution to the score's
log-space loss:

```
damage_dir = -ln(S_dir)                       (the gate carries full weight)
damage_i   = (w_i / Σw) · -ln(S_i)            for i in {size, wind, tide}
weakest_link = argmax(damage)                 (tiebreak: dir > size > wind > tide; null if all 0)
```

The identity `Q = exp(-(Σ damages))` holds exactly, so the breakdown always multiplies back
to the score beside it (law L10). The UI pairs the damage-derived label with the raw
sub-score value ("wind at 0.18"): label from damage, number from `sub`.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| `min(sub-score)` | Rejected | Ignores weights: tide at 0.50 (weight 0.2, damage 0.14) reads "weaker" than wind at 0.60 (weight 0.4, damage 0.20), yet wind cost the score more. The label would name a factor whose repair buys less than the true culprit |
| Frontend derives it from the four sub-scores | Rejected | Pushes the weight-aware computation into the client, splits one rule across two lanes, and invites the min(sub) bug; the frontend lane is explicitly building against a served label (mandate) |
| Counterfactual definition (score gain if factor were 1.0) | Not needed | For this multiplicative form the counterfactual gain IS the log-damage (setting S_i = 1 removes exactly damage_i from the exponent); the two definitions coincide, so the simpler statement wins |

## Consequences

- `damages` (all four, sorted) ships in `ScoreResult`, so the spot page can show the full
  ranked breakdown, not just the top item, without recomputation.
- The gate's full weight means a marginal direction (S_dir = 0.4, damage 0.92) correctly
  outranks a mediocre size (S_size = 0.5, damage 0.28): direction outside the window is the
  dominant fact of that day, matching research 09 §7.1's gate rationale.
- Perfect days (`all damages = 0`) carry `weakest_link = null`; the frontend renders no
  culprit rather than a fabricated one.
