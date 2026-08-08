## Learning Layer

**Lane:** DESIGN round 2, learning layer (C3 Verification & Learning). **Status:** PROPOSED, 2026-08-08. **Owner file.** Consumes, never redesigns: `domain-model.md` (§5 prediction log, §7 observation record, §8 identity, §9 scorecard, §11 correction file), `adr-report-label-immutability.md`, `adr-identity-claim-merge.md`, `adr-scorecard-incremental.md`. `05-scoring-engine.md` was absent when this was written; the interface this lane requires from it is stated in §3 and must be honored or renegotiated at the round-3 coherence review.

**Verdict up front:**

- Stage 1 only at launch: one shrunken scalar height bias per (spot, source, lead_bucket) plus one shrunken score delta per spot, exactly research 09 §13.4 stage 1 and §7.4. Stages 2+ are designed as data thresholds, not built.
- A correction goes live per key only when `n >= 10 AND distinct trust-eligible reporters >= 5 AND |b_shrunk| > 2*se_gate` with `se_gate = max(se_sample, 0.5*sigma_eff/sqrt(n))`, shrinkage always on, clamped at 40% of forecast height (score: 12 points). Below the gate the product shows the counter, never a number (decision 19). Trust eligibility ships at zero (a proven no-op at launch, §7 G2) and the se floor removes the consistency discount coordinated liars would otherwise enjoy (§7 G3). Both adopted from 07 §1 rows 7-8, 2026-08-08 coherence round.
- The cost priced in DISCUSS ("Known cost", 2026-08-08) is paid here with an explicit per-reporter offset estimator: a two-way additive model (spot bias + reporter offset) fitted by backfitting with shrinkage toward zero. A reporter's offset reaches half weight at 4 reports and is worth real trust at about 8 reports spanning 2+ spots. Before that it is mostly zero and the k-distinct-reporters averaging carries the load.
- Cold start is the `n=0` limit of partial pooling (research 09 §5.4), run over a recursive hierarchy (global -> basin -> region -> similarity group -> spot) with hard basin partitions. At launch, with one region, upper levels collapse; activation is data-driven, no code change.
- All three §13.5 hazards get concrete mechanisms (solicited-report flag + inverse-propensity weights; staleness-driven solicitation + full-list display; robust medians + concordance + clamp). The Sybil case is honestly unsolved statistically: the clamp bounds the damage, the immutable logs make it reversible, and prevention is the write-path lane's half (doc 07, research 15).
- The whole nightly fit is a few thousand rows at launch. It runs inside one 1024 MB Lambda in seconds. No compute decision to surface; the scale trigger where that stops being true is stated in §12.
- Fixture-Fanout Enumeration Mandate: evaluated, not triggered. Greenfield repo, no `src/`, no `tests/`, no PER_CALLER_MIGRATION rows exist.

---

### 1. Scope and non-goals

| In scope (this file) | Explicitly NOT built at launch | Why |
|---|---|---|
| Per-key height bias `b`, per-spot score delta | Conditional bias (stage 2) | Needs ~100-200 obs/spot (09 §13.4); designed as a threshold |
| Per-reporter offset `u_r` | Per-spot GBM (stage 4) | KILLED by research (09 §5.3, §13.4): thousands of ratings per spot will not happen |
| Partial pooling hierarchy | Learned similarity clustering | 09 §17.3: hand-assigned groups first; learned clustering fits noise at this scale |
| Selection/robustness weights | Wind numeric correction | Scorecard tracks the wind variable; no correction term until a residual model for categorical wind exists |
| Evaluation + honesty enforcement (§10) | Any skill personalization | Decision 14: score the wave, not the surfer |
| σ_human ceiling metric | LLM or vision anywhere in the fit | 09 §6.1, §9.3: wrong tool for numbers; vision annotates, never labels |

### 2. Data flow (all inputs settled round 1)

```
predictions/v1/       (C1, immutable)             ─┐
log/observations/v1/  (C2 export)                 ─┼─> nightly learning job ─> learned/corrections/v1/current/<spot_id>.json
C5 reporter resolution (OHS)                      ─┤                           learned/corrections/v1/history/dt=<date>/
log/calls/v1/         (C4, immutable)             ─┤  (§6.3 propensity deciles)
data/config/trust-gate.json (git, 07 §7.3)        ─┤  (G2 eligibility; added 2026-08-08 coherence round)
learned/overrides/v1/reporter-weights.json (git)  ─┘  (§6.4 override weights)

predictions/ + log/observations/ + log/calls/     ───> monthly evaluation ─> learned/metrics/v1/dt=<month>/
```

(Diagram rewired 2026-08-08 coherence round: `log/calls/` and `reporter-weights.json` feed the NIGHTLY job (§6.3, §6.4); the earlier wiring showed them reaching only the monthly evaluation, which contradicted §6.)

**Exact input universe (stated 2026-08-08 coherence round).** Domain model §17 states this lane's inputs as "exactly `predictions/`, `log/observations/`, and the C5 resolution -- nothing else". That sentence holds for residual FORMATION; round 2 added three read-only weighting/config surfaces it does not name. The closed set:

| Input | Role | Residuals formed from it? |
|---|---|---|
| `predictions/v1/` | forecast side of every verified pair | yes |
| `log/observations/v1/` | label side of every verified pair | yes |
| C5 reporter resolution | `device_id -> reporter_key`, current mapping at aggregation time | keying only |
| `log/calls/v1/` | which score decile was live each morning: §6.3 propensity denominators; §10 monthly metrics | no, never |
| `data/config/trust-gate.json` | G2 eligibility thresholds (07 §7.3) | no (config) |
| `learned/overrides/v1/reporter-weights.json` | §6.4 incident overrides, human PR | no (config) |

Nothing else is read; the job never reads DynamoDB (the nightly export is the boundary). Flagged to round 3, domain lane: §17's "nothing else" wording needs this widening -- exceeded here loudly, not silently.

Consumers and join keys for everything this lane produces (clause `data:consumer-known-before-produced`):

| Datum produced | Consumer | Join key |
|---|---|---|
| `current/<spot_id>.json` correction | C4 builder `apply(seed, correction)` at build start (domain model §11) | `spot_id` |
| `history/dt=` copies | audit only, humans | `(spot_id, date)` |
| `learned/metrics/v1/` monthly file | Andres (honesty review); later a public accuracy page | `(month, spot_id)` |
| `reporter-weights.json` overrides | nightly job weight step (§6.4) | `reporter_key` |
| `trigger` field on report (requested, §3) | propensity model + imbalance metric (§6.3) | `report_id` |

### 3. Interfaces with the sibling lanes

**Required FROM 05-scoring-engine** (absent at write time; binding requests. 05 landed later the same round: its §5 consumes this file's §7 field semantics as amended, and its §3 pins the `score_q` mapping cited in §5.1 below; full S1-S4 reconciliation stays the round-3 gate. Noted 2026-08-08 coherence round):

| # | Requirement | Why |
|---|---|---|
| S1 | `apply(seed, correction)` uses the semantics in §7 of this file: per-source per-lead height subtract pre-blend, per-spot score subtract post-score, clamps enforced at read time | The correction is mine; the application point is theirs; drift here corrupts every residual |
| S2 | `H_eff = H * sqrt(T/10)` stays exactly as mandated | The residual compares observed band midpoint (breaking face) to predicted `H_eff`; any change to the formula changes the meaning of every stored bias |
| S3 | PublishedCall carries `bias_applied` and `bias_gate` per build (already in domain model §6 schema) | The audit trail for "which correction was live when"; the honesty guard |
| S4 | Scorecard exposes `mae` and `mae_climatology` per key; publication computes `C_track = clip(1 - MAE/MAE_ref, 0, 1)` from them (09 §14.3) | `MAE_ref` = the spot's B0 climatology MAE once computable, else global default 0.5 m (unfit prior). Staging is explicit: `mae_climatology` is null until a spot has observations (B0 needs a historical mean rating), and publication MUST fall back to the default on null, never to 0. C_spread is the scoring lane's term and is conditionally REMOVABLE by this lane's calibration check (§10, 09 §3.6 consequence 3); scoring must not couple anything else to its existence |

**Required FROM 07-write-path:** one additive field on report submission: `trigger: "push_solicited" | "organic"` (default organic). Named consumer and key in §2. Without it, hazard (a)'s imbalance metric cannot separate solicited from volunteered labels.

**Offered TO 04-ingest:** nothing. This lane reads only the logs ingest writes; `land_masked` rows are excluded from pairing (settled, domain model §5).

### 4. Conventions (one sign, one carrier, stated once)

- **Residual convention: `r = forecast - observed`. Positive bias = forecast ran big.** This matches the settled scorecard (`bias = mean(forecast - observed)`, domain model §9, research 09 §13.3) and the headline string "25% too big". Research 09 §5.1 defines `r = H - H_hat` (observed minus forecast), the opposite sign. The two halves of research 09 contradict each other; this file takes the §13.3 side because the settled scorecard already shipped it. Every formula below uses forecast-minus-observed.
- **Apply rule, uniform: `corrected = raw - b`.** Height per (source, lead) pre-blend; score per spot post-score. The §7.4 `Q_final = clip(Q + delta_s)` term is `delta_s = -b_score` under this convention.
- **Observed height carrier: the size band is an interval, never a point** (domain model §7.2). Treatment in §5.1.
- **Reporter identity carrier: `reporter_key` via C5 resolution at aggregation time** (adr-identity-claim-merge). Never raw device counts.
- **Identifier carriers, settled, not re-opened:** `report_id` is a client-minted ULID (domain model §7.3; 07 §1 row 5) and the observation timestamp is `observed_at` (UTC). Every join in this file uses these two names. (Confirmed 2026-08-08 coherence round.)

### 5. The correction model, precisely

#### 5.1 From a report to residual samples

For each report `i` at `(spot s, hour t = floor_utc_hour(observed_at))`, for each source `m` and lead bucket `l` with a prediction-log row at `(s, m, t)` and `land_masked = false`:

```
r_height[i,m,l] = H_eff_pred[m, run in bucket l] - (mid(band_i) - u_hat[r(i)])
r_score[i]      = score_q_shown[i] - q_obs(quality_i)        (from predicted{} captured on the report; skipped when predicted is null)
```

- `mid(band)`: interval midpoint from the canonical band table (domain model §7.2). Per-sample measurement variance includes the band term `width^2 / 12` (uniform within band).
- Top band `double_overhead_plus` is open-ended: nominal value 3.0 m, variance (0.5 m)^2. It stays IN the fit; excluding "way bigger than forecast" days would censor the dependent variable and bias `b` downward. Flagged §14.
- `u_hat[r(i)]`: the reporter's shrunken personal offset (§5.2), subtracted before the residual is formed. At `n_r = 0` it is exactly 0.
- `q_obs` anchors: Bad 20, OK 45, Good 70, Epic 90 (0-100 scale, unfit priors, flagged §14). Score residuals are fitted on height-corrected builds only, sequentially after the height fit, so the score delta captures what the height correction missed, not the same error twice.
- `score_q` carrier, stated where consumed: `score_q` is the published 0-100 integer, `score_q = Math.round(100 * q_final)`, identity, one rounding, pinned in 05 §3 ("here and nowhere else"). `r_score`, the score delta `b_score`, and G6's clamp are all in display points on that scale (`units: "display_points"`, spot-correction/1, domain model §11); 05 §5 converts at apply time (`delta_q = b / 100`). Sign confirmed for 05 §5's owed interface: `residual = predicted - observed`, `corrected = predicted - b`, exactly §4's convention. (Stated 2026-08-08 coherence round.)

#### 5.2 The per-reporter offset estimator (the priced cost of decision 28)

**What was lost and what is recoverable, verbatim from the DISCUSS "Known cost" note:** cold capture removed the comparative field whose per-person size-inflation constant cancels for free (09 §13.2 calls it the single most valuable field). The residual is recoverable server-side by the join above. The per-person cancellation is not, so it is estimated instead.

**Model** (09 §13.2): `report = truth + u_r + eps`, `u_r ~ N(0, sigma_u^2)`. Jointly with the spot bias this is a two-way additive model:

```
mid(band_i) = H_true(s,t) + u_r + eps_i ,   H_true = H_eff_pred - b_(s,m,l)
```

**Estimator: backfitting, 3 iterations, shrinkage on both effects.** Per nightly run, over the trailing 90-day window of samples:

```
init  u_hat[r] = 0 for all r
loop 3x:
  b_raw[s,m,l]  = weighted_mean over samples at key of ( H_eff_pred - (mid_i - u_hat[r(i)]) )
  b_hat[s,m,l]  = shrink(b_raw, n_key, tau_key, parent estimate)          # §5.3
  u_raw[r]      = weighted_mean over samples of r of ( (mid_i - u_hat_others...) - (H_eff_pred - b_hat[s(i),m,l]) )
                  computed against the sample's own key estimate; sign: positive u_r = calls it bigger
  u_hat[r]      = ( n_r / (n_r + tau_u) ) * u_raw[r]                      # shrunk toward ZERO (09 §13.2)
```

Weights per sample: `w = w_precision * w_select * w_robust * w_override` (§6). Backfitting for a two-way additive model converges in 2-3 passes; 3 is fixed.

**How many reports before a person's offset is worth trusting, and what happens before that** (the direct answer the mandate demands):

| n_r (reports by one person) | Shrinkage weight `n_r/(n_r+4)` | se(u_raw) ~ 0.48/sqrt(n_r) | State |
|---|---|---|---|
| 0-1 | 0.00-0.20 | > 0.48 m | Offset effectively zero. Report enters near face value |
| 4 | 0.50 | 0.24 m | Half weight. Habit starting to register |
| **8 (and >= 2 spots)** | **0.67** | **0.17 m** | **Worth real trust: se is under half a band width. This is the design threshold** |
| 16 | 0.80 | 0.12 m | Mature. Persistent liars are mostly subtracted out (09 §13.5c) |

Derivation of the numbers: per-sample noise on one residual is band term (~0.13 sd) + eyeball (~0.30 sd, share of 09 §5.1's sigma) + day-to-day model error (~0.35 sd) = sigma_eff ~= 0.48 m. Between-reporter spread sigma_u ~= 0.25 m (about half a band, unfit prior). `tau_u = sigma_eff^2 / sigma_u^2 ~= 3.7`, rounded to **4**. Re-estimated from data once >= 50 reporters have >= 5 reports each. Same `n > (sigma/b)^2` arithmetic as 09 §5.2, applied per person.

**Before trust arrives, three things carry the load:** (1) averaging across k distinct reporters cuts observer bias by sigma_u/sqrt(k), half to two-thirds at k = 4-9 (09 §13.2), and the gate requires k >= 5 before anything publishes; (2) the robust layer (§6.2); (3) the pairwise ranking metric, THE metric (09 §10.2), is within-person by construction, so personal constants cancel there regardless of capture mode. The anchoring cost lands on the bias fit only, never on the headline evaluation.

**Identifiability, stated honestly:** `u_r` and `b_s` are confounded when one person is a spot's only reporter. The estimator resolves it softly: shrinkage pushes the shared component into `b_s`, and `b_s` cannot publish until 5 distinct reporters exist, by which point backfitting separates the effects. A reporter whose samples span 2+ spots identifies their offset directly; that is why the trust threshold in the table carries the ">= 2 spots" rider. Full reasoning in `adr-per-reporter-offset-estimator.md`.

#### 5.3 Partial pooling: the hierarchy and its launch shape

Estimator per level, recursive (09 §5.4, §17.2):

```
b_hat_level = ( n / (n + tau_level) ) * b_own  +  ( tau_level / (n + tau_level) ) * b_parent
tau_level   = sigma_within^2 / sigma_between^2      (estimated from data; floors in §8)
```

| Level | Keyed on (all data, nothing Panama-shaped) | Launch state |
|---|---|---|
| Global | per (source, lead_bucket) | Active but = one region's data; labeled `n_regions: 1` in the file (09 §17.5 item 3: a global prior from one region is regional and must say so) |
| Basin | `coast` field of the region (pacific / caribbean / atlantic...) | Hard partition, never a soft prior (09 §17.4 guardrail 1). One basin at launch |
| Region | `region_id` from spot seed | = pa-pacific at launch |
| Similarity group | `break_type` from spot seed (beach / point / reef / rivermouth), hand-assigned per 09 §17.3 | Designed, ships COLLAPSED into region; activates per group when >= 3 spots in the group pass the §7 gate. Data-driven, no code change |
| Spot | `spot_id` | The leaf; the §7 gates apply here |

Parent-level estimates use group-weighted means with per-region influence cap `n_eff = min(n, 200)` and per-reporter influence cap inside a region (09 §17.5 items 1-2), so Panama can never silently become the world prior.

Properties inherited from the formula, not re-argued: cold start is the `n=0` limit (a 2-report spot rides its parents); one loud rating moves a new spot by `1/(1+tau)` of itself; a genuinely different spot peels away as data justifies (09 §5.4); if spots truly differ, fitted `sigma_between` grows, `tau` shrinks, pooling self-cancels (09 §17.4).

**Contradiction taken head-on:** 09 §17.4 says never hand-set `tau`; estimate it from data. With one region and few gated spots, `sigma_between` is unidentifiable at launch, so early `tau` values are unavoidably hand-set priors. Resolution: hand-set WITH floors and a stated switchover (method-of-moments estimate `sigma_between^2 = var(b_hat_spots) - mean(se^2)`, adopted once >= 8 spots pass the gate; floor `tau >= 2` permanently). The spirit of the rule (no permanently hand-tuned pooling) is honored; the letter cannot be at n=1 region. Recorded in `adr-pooling-hierarchy-activation.md`.

### 6. Weights (all multiplicative on samples)

#### 6.1 Precision weight
`w_precision = 1 / (sigma_eff^2 + width(band)^2/12)`. Wider bands count less. Standard inverse-variance.

#### 6.2 Robustness weight (decision 24: statistical only, no moderation queue)
1. **Per (spot, day, device): collapse to the median sample.** One person reporting 5 times in a session contributes once. Also kills the near-duplicate inflation of consecutive-hour reports of one swell (the leak 09 §13.4 gate 4 warns about).
2. **Per (spot, day), when >= 3 device-samples exist: winsorize** residuals at +/- 2 band widths from the spot-day median (09 §13.5c: median, robust to a single outlier by construction). Below 3 samples no same-day robustification is possible; shrinkage + clamp are the backstop.
3. **Concordance weight:** `w_r = clip(tau_w / (tau_w + D_r), 0.2, 1.0)` where `D_r` = the reporter's mean squared disagreement with co-observed spot-day medians, in units of sigma_eff^2, shrunk toward the population mean when co-observations are few; `tau_w = 4`. Down-weight, never ban (09 §13.5c). Floor 0.2: even a chronic outlier retains a voice; a wrong floor of 0 would be a shadow ban, which decision 24 forbids in spirit.
4. **New reporters enter at `w_r = 1.`** A newcomer discount would tax the honest early community exactly when data is scarcest, and a Sybil attacker mints identities faster than any discount decays. Named incident: none yet (GDP-10: no restriction without one). The Sybil residual is accounted in §9.

#### 6.3 Selection weight (hazard a)
Inverse propensity (09 §13.5a fix 2): bucket days by the published score decile that was live that morning (from `log/calls/`); `P_hat(report | decile)` = reported-days / total-days per bucket, trailing 90 d, pooled across spots at launch (behavioral, not spot-specific); `w_select = min(3, P_bar / P_hat(decile))`, cap 3 so a never-reported decile cannot dominate the fit. Solicited reports (`trigger = push_solicited`) get `w_select = 1` (they are near-random samples of pushed days, 09 §13.5a fix 1). The imbalance itself (fraction Good/Epic, coverage per decile) is published in the monthly metrics file (fix 3).

#### 6.4 Override weight (incident response, not moderation)
`learned/overrides/v1/reporter-weights.json`, git-versioned, human-edited by PR, default absent = 1. Exists so a detected poisoning campaign is excised by recompute (research 15 §3: data poisoning is recoverable in an afternoon). This does not touch the SpotDefinition invariant: seed is human-only, correction is machine-only, and this file is a third input to the machine path, auditable in git. It adjudicates reporters after an incident, never individual reports, which is why it does not violate decision 24.

### 7. Gates, clamps, and the exact conditions for a correction to become visible

A height correction at key `(spot, source, lead_bucket)` and the per-spot score delta each carry `applied: true` ONLY when all of:

| # | Gate | Value | Defense of the number |
|---|---|---|---|
| G1 | Minimum pairs | `n >= 10` | 09 §13.4 gate 1 gives the 10-30 range; §5.2's table puts the break-even for a chunky bias (b >= 0.15 m, sigma ~= 0.5) at n > 11 and for b >= 0.2 at n > 4. 10 is the floor where a real bias is establishable; G3 makes the exact floor non-load-bearing, because at n = 10 only |b| > 0.63 sigma can pass |
| G2 | Distinct reporters | `distinct trust-eligible reporter_key >= 5` (eligibility defined below) | 09 §13.4 gate 1 + §13.2: k ~= 4-9 distinct people halves observer bias; 5 is the bottom of that band. Prefer 8 reports from 8 people over 20 from 2 (09 §13.2, verbatim design rule). Distinctness over freely mintable ids is not an anti-gaming control (research 15 §11.2); eligibility is the repair, and it ships at zero, so launch behavior is identical. Adopted from 07 §1 row 7, 2026-08-08 coherence round |
| G3 | Significance | `|b_shrunk| > 2 * se_gate`, `se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))` (floor defined below) | 09 §13.3: a claim smaller than twice its standard error is indistinguishable from noise. The unfloored form REWARDS coordinated lying (research 15 §15.1); the floor removes that. Adopted from 07 §1 row 8, 2026-08-08 coherence round. One rule, two enforcement points with the scorecard's `claim_ok`, which must adopt the same upgrades (routed below) |
| G4 | Shrinkage | always on, never raw `b_raw` | 09 §13.4 gate 3; prevents most small-sample blowups on its own |
| G5 | Clamp, height | `|b| <= 0.40 * forecast_H`, enforced at APPLY time by the builder (settled, domain model §11) | 09 §13.4 gate 5 ("e.g. +/- 40%"). Applied at read so a corrupt correction file can never print an absurd number and deleting the file reverts to seed |
| G6 | Clamp, score | `|b_score| <= 12` points (adds `clamp.max_abs_score` to the correction file, additive to schema spot-correction/1) | Unfit prior, mine: bounded by "a correction should never move a spot across two confidence-band-sized chunks of the 0-100 scale on human say-so alone". Flagged §14 |
| G7 | System-level blocked CV | monthly: rolling-origin held-out time blocks (train weeks 1-8, test 9-10); if corrected MAE loses to raw at the majority of gated keys, `applied: false` EVERYWHERE until a human looks | 09 §13.4 gate 4. Deliberately system-level, not per-spot: per-spot CV at n ~= 10 is noise and would flap. Random k-fold banned (swell-event leakage, 09 §13.4). Recorded in `adr-correction-gates-and-clamps.md` |

**G2, trust eligibility, precisely (adopted from 07 §1 row 7, 2026-08-08 coherence round).**

Config: `data/config/trust-gate.json` (git, owned by 07 §7.3; shipped `{min_credential_age_days: 0, min_prior_reports: 0, min_prior_spots: 2}`). A sample's reporter is **trust-eligible** iff both clauses hold, evaluated per report from fields every record carries from day one (07 §6: `credential_issued_at`, `received_at`; they exist precisely so this gate can be flipped on retroactively):

| Clause | Predicate | Carrier |
|---|---|---|
| Age | `received_at - credential_issued_at >= min_credential_age_days` | both server-set on the record; age frozen at receipt (07 §6: "credential age at receipt") |
| History | at `received_at`, >= `min_prior_reports` earlier stored reports by the same `reporter_key` (current C5 mapping), spanning >= `min_prior_spots` distinct spots | the immutable observation log itself. The spots clause qualifies the history clause: at `min_prior_reports = 0` it is vacuous, which is why the shipped `min_prior_spots: 2` is inactive at launch (07 §7.3, "all zero/inactive") |

- Age-at-receipt, side taken: research 15 §16.3 sketches age-at-aggregation ("counted once the credential ages"); 07 §6 pins age at receipt. This file takes 07's: frozen per record, so eligibility is a pure function of log + config (recompute-deterministic, no wall clock), and strictly stronger, because a forged batch already stored cannot ripen into eligibility by waiting. Retroactivity still holds where it matters: on a future flip, every stored report whose credential was already old enough at receipt counts immediately. Honest cost: a reporter's own first-`A`-days reports never qualify; at `A = 0` that cost is zero, and any future flip prices it then.
- Ineligible samples are excluded from the correction fit and from every gated count: G1's `n`, G2's distinctness, and the scorecard's gated aggregates (routing below). They still appear in every display-instantly surface (recent reports, the counter): 07 §7.3's separation, decisions 4/11 intact.
- **No-op at launch, confirmed in writing:** at the shipped config the predicate reduces to `age >= 0 AND priors >= 0`. Age >= 0 holds by construction (a report requires an already-minted credential and both timestamps are the server's); priors >= 0 trivially. The eligible set equals the full set; every count and every fitted value is bit-identical to the ungated computation. The gate cannot delay anything at launch. DISTILL obligation (clause `check:unfired-is-not-evidence`): one AT runs the fit with a nonzero fixture config and watches a young credential's samples drop out; a gate never seen firing proves nothing.
- Correction-file field semantics, pinned: the file's `reporters` field carries the distinct trust-eligible count. 05 §5's read-time re-check consumes it as such (stated there, same round), so the builder inherits eligibility with no new inputs.

**G3, the standard-error floor, precisely (adopted from 07 §1 row 8, 2026-08-08 coherence round).**

`se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))`, per key, per variable.

- `se_sample`: the weighted sample standard deviation of the key's residual samples divided by `sqrt(n)`, exactly the settled scorecard's `bias_se` (domain model §9).
- `sigma_eff`: the single-sample noise floor for the variable; one constant, one home (§8). Height: 0.48 m, the §5.2 decomposition (band-interval ~0.13 + eyeball ~0.30 + day-to-day model error ~0.35, in quadrature), replaced by the measured estimate (sigma_human §10 + fitted dispersion) when it arrives. Score: 25 points, unfit prior, one `q_obs` anchor step (flagged §14).
- **Why the floor, plainly:** fabricated reports agree with each other; agreement shrinks `se_sample`; so the unfloored `|b| > 2 * se` gets EASIER to pass the more coordinated the lie. The gate rewards exactly the behavior it exists to stop, and a gate that is easier to pass by lying is worse than no gate (research 15 §15.1; 07 §7.3's design rule: no gate gets easier to pass as input variance drops; 07 §7.4's `band_dispersion` detector treats the same low variance as suspicion, the correct inversion). The floor removes the consistency discount: `2 * se_gate` never drops below `sigma_eff / sqrt(n)`, so at n = 10 nothing under `|b| = 0.15 m` passes, however consistent the samples.
- **Why 0.5:** honest samples have expected sd ~ `sigma_eff`, so a floor at `1.0 * sigma_eff / sqrt(n)` would bind on roughly half of honest keys and erase real precision differences. At 0.5 the floor binds only when the sample sd is under half the physical noise: probability under ~1.5% for honest data at n = 10 (chi-square left tail), vanishing as n grows, and routine for coordinated fabrication. Honest keys pass untouched; zero-variance coordination is refused categorically.
- Correction-file field semantics, pinned: the file's `se` field carries `se_gate`, never raw `se_sample`, so neither the builder re-check (05 §5) nor the scorecard headline ("+/-0.09") can ever print a precision the physical noise floor says is impossible.

**The displayed scorecard: what `claim_ok` covers, what remains (research 15 §15.1a; stated 2026-08-08 coherence round).**

`claim_ok` (settled, domain model §9): the scorecard renders a bias headline only when `n >= 10 AND distinct_reporters >= 5 AND |bias| > 2 * bias_se`; below that, the payload carries the counter and `claim_ok: false`. Round 1 shipping it half-closed research 15 §15.1a's finding that the displayed number, the decision-13 differentiator, had no gate at all.

| Attack on the displayed number | Settled `claim_ok` stops it? | Disposition |
|---|---|---|
| A handful of forged reports on a cold spot moves the headline | yes: sub-gate spots show only the counter, never a number | closed round 1 |
| 10 reports from 5 freshly minted device ids | no: distinctness counts freely mintable keys (research 15 §11.2) | close by adopting G2: `distinct_reporters` counted over trust-eligible keys. Launch-identical (config zero) |
| Coordinated consistency shrinks `bias_se`, the 2-se test passes early | no: the settled formula rewards agreement (research 15 §15.1) | close by adopting G3: `bias_se := se_gate`. NOT a launch no-op: binds whenever sample sd < `0.5 * sigma_eff`, ~1% of honest keys and every zero-variance fabrication |
| Patient attacker: aged credentials, plausible variance, weeks of seasoning | no, and not closable statistically | residual, stated: the bar is weeks, not impossible (research 15 §15.5). Bounded by §9 hazard (c): winsorization, concordance decay, override recovery. The headline prints only gated, shrunken, winsorized values, so magnitude is damped, not clamped; no display clamp exists, because clamping a measured claim would be dishonest in the other direction |
| The counter ("7 / 30") and the recent-reports feed | not gated, by design | a count is not a claim; decisions 4/11/19: display-instantly is the product |

Ownership routing (this file edits no settled doc): the two "close by adopting" rows are one formula amendment to domain model §9's `claim_ok`: `distinct_reporters` = distinct trust-eligible `reporter_key` (G2 above) and `bias_se` floored to `se_gate` (G3 above). Owner: domain lane, round 3; 07 §1 row 7 already routes the eligibility half, the se-floor half is routed here. Implementation lands in the C3 scorecard updater/builder (adr-scorecard-incremental): the age clause needs only the record's own two fields; the history clause needs the reporter's prior-report count (GSI1 query, cheap); a nonzero-config FLIP is applied by full recompute from the immutable logs (the settled recovery path), never by mutating stored aggregates. Frontend change: none, it renders `claim_ok` as delivered.

Below the gates: `applied: false`, the payload carries the counter (`"7 / 30"`, decision 19, denominator 30 = top of the 10-30 range) and `claim_ok: false`. The product never shows a sub-gate number. No accuracy claim of any kind is earnable at launch (decision 19, HANDOFF §6 item 12, 09 §10.4): see §10 for the two separate claim ladders.

**Aggregate/bounded-change contract for the nightly write** (mandate 8; the SpotDefinition aggregate itself is settled, domain model §10): universe = `learned/corrections/v1/`. Declared delta per run = replace `current/<spot_id>.json` for spots recomputed + append one `history/dt=` copy each. Complement that must NOT change: seed files (git), the prediction log (`predictions/`, top-level), both derived logs (`log/calls/`, `log/observations/`; `log/` holds exactly these two, adr-prediction-log-prefix-isolation), the trust-gate config, scorecard items, any other spot's current file. (Prefix list restated 2026-08-08 coherence round.) The job holds no write credential for any other prefix; the complement is enforced by IAM, not by discipline (infra lane's guardrail 6).

### 8. Parameter table (every number, its status, its citation)

| Parameter | Value | Status | Source |
|---|---|---|---|
| Lead buckets | `[0,12) [12,24) [24,48) [48,96) [96,inf)` h | settled | adr-scorecard-incremental, 09 §13.1 |
| Residual sign | forecast - observed | settled | domain model §9, 09 §13.3 (overrides §5.1's flip, §4 above) |
| n_min (G1) | 10 | fixed | 09 §13.4, §5.2 |
| k_min distinct reporters (G2) | 5 | fixed | 09 §13.4, §13.2 |
| Significance (G3) | 2 * se_gate | fixed | 09 §13.3; floor per 07 §1 row 8 |
| se floor (G3) | `se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))` | fixed (2026-08-08 coherence round) | research 15 §15.1; 07 §1 row 8 |
| sigma_eff_score (G3 floor, score scale) | 25 pts | unfit prior | mine, one q_obs anchor step; flagged §14 |
| Trust-gate config (G2) | `{age 0 d, priors 0, spots 2}` at launch | settled, flippable by PR + recompute (2026-08-08 coherence round) | 07 §7.2 item 0.11, §7.3 |
| Height clamp (G5) | 0.40 * forecast H | fixed | 09 §13.4 gate 5 |
| Score clamp (G6) | 12 pts | unfit prior | mine, flagged §14 |
| tau (spot level) | estimated; prior 6, floor 2; switchover at >= 8 gated spots | hand-set until estimable | 09 §5.4 (formula), §17.4 (estimate-from-data rule), adr-pooling-hierarchy-activation |
| sigma_between prior (spot bias sd) | 0.17 m | unfit prior | implies tau ~= 6 at sigma ~= 0.42; flagged §14 |
| tau_u (reporter shrinkage) | 4; re-estimate at >= 50 reporters with >= 5 reports | unfit prior, derived | 09 §13.2 (mechanism); arithmetic in §5.2 |
| Reporter trust threshold | 8 reports across >= 2 spots (weight 0.67, se ~= 0.17 m) | derived | 09 §5.2 arithmetic per person |
| sigma_eff (single-sample noise) | 0.48 m | unfit prior, decomposed | 09 §5.1 (sigma), §16.1 (label noise); components in §5.2 |
| Band midpoints / variance | canonical table midpoints; width^2/12 | v1 convention | domain model §7.2 |
| Top band value | 3.0 m, var 0.25 | unfit prior | flagged §14 |
| q_obs anchors | 20 / 45 / 70 / 90 | unfit prior | flagged §14; 4-way label per 09 §13.2 |
| Winsorization | +/- 2 band widths from spot-day median, n_day >= 3 | mine | implements 09 §13.5c median + decision 24 |
| Concordance tau_w, floor | 4, floor 0.2 | unfit prior | 09 §13.5c (trust weight, down-weight never ban) |
| Propensity weight cap | 3 | unfit prior | 09 §13.5a fix 2 (method); cap mine |
| n_eff cap per region (parent levels) | 200 | fixed | 09 §17.5 item 2 |
| Backfitting iterations | 3 | fixed | two-way additive model converges in 2-3 passes |
| Fit window | trailing 90 d | matches scorecard windows | domain model §9 |
| CV scheme | rolling-origin blocked time splits, monthly, system-level kill | fixed | 09 §13.4 gate 4 |
| Counter denominator | 30 | settled | decision 19 |
| MAE_ref default (S4) | 0.5 m until B0 computable | unfit prior | 09 §14.3 |
| Pairwise-metric target | ~400 same-day pairs for a 10-pt lift claim | fixed | 09 §10.2 |

Every "unfit prior" row is a number that ships, works, and is replaced by an estimate when the stated data condition arrives. None of them can print a public number on their own; the gates stand in front of all of them.

### 9. Hazard table (09 §13.5, each an obligation)

| Hazard | Mechanism of failure | Mitigation designed here | What it still does NOT stop |
|---|---|---|---|
| (a) Selection bias | People report memorable sessions; labels conditioned on the outcome we predict; a bias fitted on good days is wrong, possibly sign-flipped, on the flat days a user most needs (09 §13.5a) | 1. Solicited reports via the push follow-up, asked even on bad mornings (epic F-TELL-ME-WHEN-ITS-WORTH-THE-DRIVE), flagged `trigger=push_solicited`, weight 1. 2. Inverse-propensity weights on organic reports (§6.3). 3. Imbalance published monthly: label mix + coverage per score decile (§10) | Solicitation fires only on predicted-GOOD mornings (the push exists only then), so predicted-bad days stay under-sampled and propensity weights for those deciles rest on few samples with a cap. Residual risk measured by the coverage histogram; the histogram is the tripwire for D3 (§15) |
| (b) Explore/exploit | The call sends everyone to the top spot; only it gets labels; its forecast improves, the others never do; silent self-reinforcement (09 §13.5b) | 1. Never randomize the recommendation (09's own rule; burns trust). 2. The home is a ranked list of ALL spots with scores (decision 1), not a top-1 gate; users self-distribute. 3. `C_fresh` decays confidence with staleness (09 §14.3), published per spot, honestly inviting reports where data is stale. 4. Stale-spot solicitation line ("no report here in 9 days", 09 §13.5b) on the spot page, next to the persistent report button (decision 23). 5. Coverage-per-spot in the monthly metrics: the drift is measured, not assumed away | A spot nobody opts into push for and nobody visits stays dark; its correction stays at the parent prior forever. That is the honest design intent (14.4: never fabricate), not a fix. Also: the stale-spot line depends on frontend adoption (round-3 check) |
| (c) Trolling / localism / Sybil | Anonymous device ids are free to mint; localism under-reporting is documented culture; a public "best spot" feed pays liars (09 §13.5c) | 1. Persistent single-identity liars: `u_r` grows and is subtracted (09 §13.5c) at ~8+ reports; concordance weight decays them toward 0.2. 2. Single-day outliers: spot-day median + winsorization. 3. No correction from fewer than 5 reporter_keys (G2); one person can never move a spot, ever. 4. Clamp bounds the worst public error to 40% of H / 12 pts even under a successful campaign. 5. Recovery: logs immutable, corrections are projections; recompute with `reporter-weights.json` overrides excises a discovered campaign in one run. 6. Quota 20/day/device (settled) raises attack cost mildly | **The Sybil case, stated plainly: G2 means nothing against an attacker who mints 5+ devices.** 30 plausible, spread-out fabrications from 6 minted ids at a low-traffic spot are statistically indistinguishable from a small honest crew; the fit will move toward the clamp. Statistics cannot tell sock puppets from strangers when identities are free and values are plausible. What bounds it: clamped magnitude, per-spot blast radius, full reversibility, detectability (burst cadence, device-age cohort anomalies) at the write path. Prevention is doc 07 + research 15 §10-11's half (device-id cost, proof-of-work); this lane's half is damage-bounding + recovery, delivered |

### 10. Evaluation, honesty enforcement, and the two claim ladders

**Two claims, two gates, never conflated:**

| Claim | Where shown | Gate | Source |
|---|---|---|---|
| Per-spot scorecard claim ("GFS ran 25% big here for 30 days") | Spot page, inline (decision 13) | G1+G2+G3 per key (`claim_ok`) | 09 §13.3-13.4; settled in domain model §9 |
| Product-level accuracy claim ("better than the raw model") | Copy, marketing, README | ~400 same-day multi-spot comparison pairs with a positive pairwise lift | 09 §10.2, §10.4; HANDOFF §6 item 12 |

At launch both gates fail everywhere, by construction. What may be claimed on day 1: better organised, better explained, more honest about uncertainty (09 §10.4, §16.4, all true with zero ratings).

**Monthly evaluation job** (`learned/metrics/v1/dt=<month>/metrics.json`):

| Metric | Definition | Baseline | Why |
|---|---|---|---|
| Pairwise ranking accuracy | Same reporter_key, same local day, 2+ spots rated; did our ranking order the pair as their quality labels did; ties (< 1 quality step) excluded | B1 raw-model ranking (`baseline_rank_raw` vs `our_rank`, settled in PublishedCall) | THE metric: it is exactly the cousin's decision, and within-person, so personal constants cancel (09 §10.2). Progress toward 400 pairs is tracked here |
| Brier + calibration curve | `quality in {Good, Epic}` as the event; `score_q / 100` as the v1 probability (naive, stated as such); binned by conf_level | B0 climatology per spot | Proper scoring rule; and the confidence validity check: if high-conf days are not more often right, **the offending confidence term is removed** (09 §10.2, §14.3 guard, §3.6 consequence 3). This lane owns that kill switch; C_spread is the first candidate to die per §3.6 |
| MAE on height | per key from the scorecard | B0, B2 persistence (only where yesterday had a report) | Tracks `b` convergence; never the headline (09 §10.2) |
| sigma_human ceiling | mean abs disagreement between 2+ reporters, same spot, within 2 h | none; it IS the floor | 09 §16.2: the measured constant no model can beat; tells us when to stop investing in fitting |
| Selection imbalance | label mix; reports per published-score decile; solicited vs organic split | none | Hazard (a) tripwire (09 §13.5a fix 3) |
| Shrinkage report | per gated spot: shrink weight, n, reporters | none | 09 §17.4 guardrail 2: a spot with 80 obs still 60% shrunk means a misconfiguration |

**Confidence contradiction, side taken:** research 09 contradicts itself on inter-model spread (§8.4 and §14.3 sell `C_spread`; §3.6 walks it back with four cited studies). The file says §3.6 wins and this lane concurs: spread is a qualitative flag, percentile-of-own-history form, and it lives or dies by the calibration check above. `C_track` and `C_fresh` are this lane's outputs (scorecard MAE + last_obs_ts) and face the same check.

### 11. Worked example: Playa Venao, zero to live

Numbers are internally consistent; sigma values are the §8 priors.

| Stage | State | What the public sees |
|---|---|---|
| Day 0 | No correction file. `apply(seed, absent) = seed`. `bias_gate: "no_correction"` in PublishedCall | Score from seed physics; scorecard shows `0 / 30` |
| n=3, 2 reporters | Internal shrunk estimate exists (mostly the regional prior); G1, G2 fail | `3 / 30`, no claim, no correction |
| n=12, 4 reporters | G1 passes, G2 fails (4 < 5) | `12 / 30`, `applied: false` |
| n=22, 7 reporters | Key (ncep_gfswave016, lead 24-48): raw `b_raw = -0.22 m` (forecast ran small), sigma_hat = 0.42, `se_sample = 0.42/sqrt(22) = 0.090`; floor `0.5*0.48/sqrt(22) = 0.051` does not bind, `se_gate = 0.090` (the stored `se`). All 7 reporters trust-eligible at the zero config. G3: 0.22 > 0.179 PASS. Shrink: tau = 0.42^2/0.17^2 = 6.1, weight 22/28.1 = 0.783, parent (region) b = -0.05: `b_shrunk = 0.783*(-0.22) + 0.217*(-0.05) = -0.183`. G5 at forecast H 0.8: 0.183 <= 0.32 PASS. File written: `{"b": -0.183, "se": 0.090, "n": 22, "reporters": 7, "applied": true, "shrunk_from_global": 0.217}` | Next hourly build: member h 0.8 corrects to `0.8 - (-0.183) = 0.983`; `H_eff = 0.983 * sqrt(15.5/10) = 1.22 m` -> band chest_head, where raw H_eff 0.996 said waist_chest. The scorecard headline goes live: "corre chico aqui: 0.18 m de menos (n=22, 7 personas, +/-0.09)". `bias_applied: -0.183` logged in PublishedCall |
| One reporter inside that n | d_9f8 has 9 reports across 2 spots, `u_raw = +0.21` (calls it big). Weight 9/13 = 0.69, `u_hat = +0.145`. Her chest_head report (mid 1.35) entered the fit as `1.35 - 0.145 = 1.205` | Nothing; u_r is never published, never shown, never keyed to a visible identity |
| A troll arrives | 5 reports "flat" from one new device on a firing day with 4 other reporters: spot-day median ignores it (1 of 5+ samples after per-device collapse); its concordance D_r starts growing; G2 unaffected (1 key) | Nothing moves. The correction shifts by under 1/(1+tau) of one winsorized sample |
| The monthly check | Rolling-origin CV: corrected MAE beats raw at 6 of 8 gated keys; system stays on. Calibration: high-conf bin 71% hit vs low-conf 52%: confidence survives this month | Metrics file for Andres; nothing user-facing changes |

### 12. Compute budget (constraint: infra lane's guardrails, reserved concurrency 2)

| Load | Launch (20 spots) | 500 spots | 5,000 spots |
|---|---|---|---|
| Pairs in 90-d window | ~2k-40k (obs x ~20 keys each) | ~400k | ~4M |
| Backfitting 3 passes | milliseconds | seconds | ~1 min, plain Python dicts |
| Dominant cost: pair re-derivation scan of `predictions/` (90 d) | 1,440 gz files, 90 MB total, streamed: ~1 min | 2.2 GB: minutes, still inside one 15-min Lambda | 22 GB: DOES NOT FIT nightly Lambda |
| Verdict | 1024 MB Lambda, seconds-to-minutes, concurrency 1 within the reserved-2 budget. **No decision to surface** | same | Trigger: when the nightly scan passes ~5 min, emit verified pairs to a derived pairs cache at scorecard-update time (prefix settled at trigger time, NOT under `log/`: that prefix holds exactly `calls/` and `observations/`, adr-prediction-log-prefix-isolation; noted 2026-08-08 coherence round) (the updater already computes them; adr-scorecard rejected materializing pairs for the SCORECARD's needs, and that rejection is not disturbed; this would be a new consumer with its own justification). Deferred, flagged §15 D4 |

Monthly evaluation reads the same window plus `log/calls/`: same envelope. Nothing here needs more than the platform the infra lane already budgeted; the one future exception is named above with its tripwire.

### 13. Where research 09 contradicts itself, and the side taken

| Contradiction | Side taken | Why |
|---|---|---|
| §8.4 + §14.3 (spread as calibrated confidence term) vs §3.6 (spread is a weak skill predictor; qualitative flag only) | §3.6 | The file says so itself; four cited studies vs a derivation. This lane enforces the §10.2 calibration check that can remove it entirely |
| §5.1 residual sign (observed - forecast) vs §13.3 (forecast - observed) | §13.3 | The settled scorecard already shipped forecast-minus-observed; one convention, stated in §4 |
| §13.2 "ask the residual directly, most valuable field" vs decision 28 cold capture | Decision 28 (binding) | Not relitigated. The per-reporter estimator (§5.2) is the priced compensation; the DISCUSS "Known cost" note is implemented, not argued with |
| §17.4 "never hand-set tau" vs one-region launch where sigma_between is unidentifiable | Hand-set with floors + stated switchover | The rule's spirit (no permanent hand tuning) kept; its letter is impossible at n_regions = 1 |

### 14. What I am unsure about

1. **sigma_eff = 0.48 m and sigma_u = 0.25 m are decomposed priors, not measurements.** Both are replaced by estimates (sigma_human from §10's repeat measurements; sigma_u from the reporter panel) within the first season. If sigma_u is much smaller than assumed, tau_u = 4 over-shrinks and reporter calibration arrives slower than the §5.2 table promises.
2. **q_obs anchors (20/45/70/90)** are invented. The score delta inherits their arbitrariness; the G3 significance gate keeps an arbitrary anchor from printing a confident number, but the delta's magnitude is only as meaningful as the anchors. An ordinal-logistic treatment (09 §5.3 row 3) is the eventual fix, at ~30-50 obs spanning both classes. The G3 score-scale floor inherits the same arbitrariness: `sigma_eff_score = 25 pts` is one anchor step, mine, replaced together with the anchors (added 2026-08-08 coherence round).
3. **Top band at 3.0 m** is a guess for an open interval. Panama Pacific rarely exceeds it; a region where it is common (global later) needs proper censored-interval treatment before this convention distorts fits there.
4. **Propensity pooled across spots** assumes reporting behavior is a community property, not a spot property. Plausible at 20 spots and one community; wrong once regions differ culturally. Per-spot propensity needs data no spot will have for a while.
5. **Score-delta double-count risk:** fitting the score residual after height correction (sequential) prevents the obvious double-count, but wind-driven quality errors land in the score delta with no wind correction to claim them; if a wind term ever ships (stage 2), the score delta must be refitted from scratch, not adjusted.
6. **The predicted-bad-day blind spot** (hazard a residual): if the coverage histogram shows the bottom three score deciles staying near-empty after a season, the propensity weights there are caps on top of noise, and the honest statement is that the correction is fitted on good-to-mid days only. That statement would have to appear in the scorecard copy; nobody has designed that copy.

### 15. Decisions needing Andres

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | `trigger` field on report submissions (solicited vs organic) | (a) add now, doc 07 carries it; (b) infer later from push-delivery logs | **(a)**: one enum field at write time vs a fragile retro-join on push logs that do not currently record delivery per device+spot+day |
| D2 | Off-day solicitation (an opt-in "help calibrate on quiet days" ask, max 1/week) to cover predicted-bad deciles | (a) ship at launch; (b) hold until the coverage histogram proves the gap; (c) never (decisions 12/23 lean against nagging) | **(b)**: the histogram is free and the ask has real product cost; build the tripwire, not the feature |
| D3 | Reporter-weight overrides file (§6.4) | (a) as designed (git, PR, incident-only); (b) reject as too close to moderation (decision 24) | **(a)**: research 15 §3's recovery story requires SOME down-weight mechanism; git+PR is auditable and touches reporters, not reports |
| D4 | Deferred pairs cache (§12; prefix settled at trigger time, never under `log/`) | (a) defer until the nightly scan passes 5 min (§12); (b) build day one | **(a)**: parsimony; the trigger is measurable and the recovery path (recompute from logs) never depends on the cache |
| D5 | Score clamp 12 pts (G6) | accept / change | Accept as a v1 prior; it only ever binds when G1-G4 have already passed, so it is a seatbelt, not a driver |

### 16. ADR index (this lane)

| ADR | Contested decision recorded |
|---|---|
| `adr-per-reporter-offset-estimator.md` | Backfitting additive model with shrink-to-zero as the replacement for the lost comparative field; tau_u = 4; identifiability; trust thresholds |
| `adr-correction-gates-and-clamps.md` | The exact gate numbers; system-level (not per-spot) blocked CV; clamps at apply time |
| `adr-pooling-hierarchy-activation.md` | Five-level hierarchy shipped collapsed; hard basin partition; hand-set tau with floors until estimable; activation triggers |
