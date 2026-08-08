# ADR: Per-reporter offset — backfitting additive model, shrink to zero

**Status:** Proposed (DESIGN round 2, 2026-08-08) · **Context:** C3 Verification & Learning · **Implements:** the DISCUSS "Known cost" note (2026-08-08) on decision 28; research 09 §13.2

## Decision

1. The cancellation lost with the comparative field (decision 28, cold capture) is replaced by an estimated per-reporter offset `u_r`, fitted jointly with the spot bias as a two-way additive model (`mid(band) = H_true + u_r + eps`) by backfitting, 3 fixed iterations, over the trailing 90-day sample window.
2. `u_r` is always shrunk toward ZERO: `u_hat = (n_r/(n_r+tau_u)) * u_raw`, `tau_u = 4` (derived: sigma_eff ~0.48 m single-sample noise over sigma_u ~0.25 m between-reporter spread, both unfit priors; re-estimated once >= 50 reporters have >= 5 reports each).
3. Trust thresholds, stated: half weight at 4 reports; treated as reliable at ~8 reports spanning >= 2 spots (se ~0.17 m, weight 0.67). Before that a reporter's labels enter near face value and the k >= 5 distinct-reporters gate plus the robust median layer carry the load.
4. `u_r` keys on `reporter_key` (C5 late resolution, per adr-identity-claim-merge), is subtracted inside the residual computation only, and is never published, displayed, or exposed per identity.
5. Identifiability: where one person is a spot's only reporter, shrinkage pushes the shared component into the spot bias; the spot bias cannot publish below 5 distinct reporters, by which point backfitting separates the two effects. The ">= 2 spots" rider on the trust threshold is this constraint made explicit.

## Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| Reopen decision 28 and ask the comparative question | Rejected | Binding DISCUSS resolution; training on our own prior is a self-reinforcing error. Not relitigated |
| Full mixed-model / MCMC fit (lme4-style) | Rejected | Backfitting with shrinkage is the same additive structure, converges in 2-3 passes, runs in plain code inside the Lambda budget, and is inspectable line by line. A stats runtime buys nothing at this data size |
| No reporter term; rely on k-averaging alone | Rejected | 09 §13.2: between-user variance can swamp between-spot signal at small n; and §13.5c's anti-troll property (persistent liars develop large u_r and get subtracted) would be lost |
| Hard threshold (offset ignored below n reports, raw above) | Rejected | 09 §5.4's whole point: shrinkage removes the cliff; a hand-tuned switch is strictly worse than the weight it approximates |

## Consequences

- Cold-start label noise is higher than the residual-question design would have had; the pairwise ranking metric is immune (within-person by construction) but the bias fit needs more reports per person, exactly as the DISCUSS note priced.
- A reporter who loses browser storage restarts calibration (accepted cost, adr-identity-claim-merge); a later claim-merge retroactively unifies their offset because everything is recomputed from logs + current mapping.
- tau_u mis-set only changes convergence speed, never correctness of the gates: no public number depends on u_r without G1-G3 passing.
