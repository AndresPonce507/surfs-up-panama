## Scoring Engine

**Lane:** scoring engine (DESIGN round 2). **Status:** PROPOSED, 2026-08-08. **Owner file.**
Implements research 09 §7 exactly. Every formula and coefficient below cites its research 09
section; where research 09 is silent, the gap is named instead of filled. Consumes, never
redesigns: the prediction log (`domain-model.md` §5), the PublishedCall log (§6), the spot
seed + correction files (§11), the size-band table (§7.2), the bundle payload (§13).

### Verdict block

| Question | Verdict |
|---|---|
| Core shape | `Q = S_dir × (S_size^0.4 × S_wind^0.4 × S_tide^0.2)^(1/Σw)` per research 09 §7.3. Gate times weighted geometric mean. Wind weight equals size weight on purpose (research 09 §7.3); not changed here |
| Purity | Every function in §3 is total and pure: no I/O, no clock, no config lookup, no ambient reads. Inputs in, value out. The builder Lambda is the imperative shell |
| Weakest link | First-class output: per-factor log-damage, ranked. The label the UI shows is `argmax(damage)`, not `min(sub-score)`. ADR: `adr-scoring-weakest-link-damage.md` |
| Member blend | Input-space arithmetic mean (circular for direction) over usable members, land-masked and null excluded. ADR: `adr-scoring-member-blend.md` |
| Learned correction | Two hooks, both data-driven, both inert at launch: per-source H bias (pre-blend) and score delta (post-combine), research 09 §7.4 + §13.4 gates re-checked at read time. Absent file = identity function. Turning learning on changes data, not code shape |
| Confidence | Computed beside the score, never multiplied into it (research 09 §7.5). Spread term is a qualitative flag per §3.6, percentile form wired as data for when spread history exists, removed if it fails the §10.2 calibration check. Day-one levels render from model agreement alone: freshness participates only once a spot has a report (§6.3, D4 ANSWERED 2026-08-08) |
| Null observations | Ingest contract (04 §11): wind pair or `tide_m` can arrive null. A null factor is EXCLUDED (weight leaves the mean), confidence is capped, the payload names the gap; no fallback value is ever fabricated. Law L16. Added 2026-08-08 coherence round |
| score_q mapping | `score_q = ScoreResult.score = Math.round(100 * q_final)`, identity, one rounding, here and nowhere else. §3. Stated 2026-08-08 coherence round |
| Compute fit | 960 score evaluations per build (20 spots × 48 h), each O(1). Under 50 ms total against a 120 s build Lambda budget. Arithmetic in §8 |
| Nothing Panama | All spot physics from the seed file; rotational-invariance law L12 makes any hemisphere or fixed-window assumption a failing property test |

Fixture-fanout mandate check (`nw-ddd-architect` skill): no DESIGN row here migrates a shared
substrate per-caller; the repo has no `src/` or `tests/` tree yet (verified 2026-08-08,
greenfield). N/A with evidence.

---

### 1. Position in the system

Scoring physics is a domain service inside C4 Publication (`domain-model.md` §1): pure
functions over effective spot parameters plus intake data, no state of its own. The hourly
build Lambda (system-architecture §3: 1024 MB, 120 s, reserved concurrency 2) is the only
caller at launch.

```
prediction log rows ──┐
seed file ────────────┤                       ┌─> ScoreResult ──> PublishedCall log + bundle
correction file ──────┼──> [pure core, §3] ───┼─> ConfidenceResult ──> PublishedCall + bundle
tide series ──────────┤                       └─> ranks, bands, windows ──> bundle
report recency ───────┘
```

Functional core, imperative shell: the shell (builder) fetches the S3 objects, selects the
latest run per source with `run_ts ≤ build time` (settled, `domain-model.md` §6), derives the
day's tide extremes from the logged hourly tide series, then calls the core once per
(spot, valid hour). When the wind fields or the tide series are null (04 §11), the shell
passes `null` through, never a substitute value; §3.6 governs. Nothing inside §3 touches S3,
the clock, or the environment (`contract:declared-inputs-not-ambient-reads`).

### 2. Inputs consumed (settled contracts, cited not redesigned)

| Input | Source of truth | Fields used |
|---|---|---|
| Member rows | prediction log, `domain-model.md` §5.1 | `swell_h_m, swell_t_s, swell_dir_deg, swell2_*, wind_speed_kt, wind_dir_deg, tide_m, land_masked, source, lead_h` |
| Spot seed | `domain-model.md` §11, git PR-only | `shore_normal_deg, swell_window_deg, h_ref_m, s_size, wind_optimum{}, tide{optimum,sigma,range_class}, timezone` |
| Correction | `learned/corrections/v1/current/<spot_id>.json`, `domain-model.md` §11 | `score_delta{}, bias.swell_h_m.per_source.*, clamp` |
| Size bands | canonical constants file, `domain-model.md` §7.2, `size_band_schema: 1` | band edges as data |
| Report recency | builder-supplied `last_report_age_h` per spot | confidence freshness factor only |

### 3. The scoring function, typed

TypeScript signatures (the build Lambda is Node 22 per system-architecture §11). Conventions,
stated once: angles in compass degrees [0, 360); wind direction meteorological (blowing FROM);
speeds in knots; heights in metres; periods in seconds; all timestamps UTC. Angle helper used
throughout: `angdiff(a, b) = ((a - b + 540) mod 360) - 180`, range [-180, 180).

```ts
// ---------- input types ----------
type SwellTrain = { h_m: number; t_s: number; dir_deg: number };
type WindObs    = { speed_kt: number; dir_deg: number };   // shell passes WindObs | null (04 §11: wind source down)
type TideObs    = { height_m: number; day_low_m: number; day_high_m: number };
                                                           // shell passes TideObs | null (04 §11: tide dark > 7 days)

type MemberRow = {                       // one usable prediction-log row, post land-mask filter
  source: string; lead_h: number; swell: SwellTrain; swell2: SwellTrain | null;
};

type EffectiveSpotParams = {             // output of applyCorrection(seed, correction), §5
  swell_window_deg: [number, number];    // clockwise span theta_min -> theta_max, may wrap 360
  sigma_dir_deg: number;                 // 20, unfit prior (research 09 §7.2a)
  h_ref_m: number; s_size: number;       // seed h_ref_m, s_size (research 09 §7.2b)
  shore_normal_deg: number;
  wind: { u_star_kt: number; k_on_kt: number; k_off_kt: number; k_cross_kt: number };
  tide: { eta_opt: number; sigma_eta: number; neutral: boolean };  // numeric, mapped per §3.5
  weights: { w_size: number; w_wind: number; w_tide: number };     // 0.4 / 0.4 / 0.2
};

// ---------- output types ----------
type SubScores = { dir: number; size: number;
                   wind: number | null; tide: number | null };  // present factors in [0, 1];
                                                                // null = observation unavailable (§3.6),
                                                                // never 0, never a fabricated 1
type Factor = "dir" | "size" | "wind" | "tide";
type ScoreResult = {
  q: number;                 // [0, 1], pre-correction (research 09 §7.3)
  q_final: number;           // [0, 1], post-correction (research 09 §7.4)
  score: number;             // integer 0..100 = Math.round(100 * q_final).
                             // Published verbatim as the canonical `score_q` (PublishedCall,
                             // domain-model §6; bundle §13; predicted{} §7.4): score_q = score,
                             // identity, no second rounding anywhere. (2026-08-08 coherence round)
  h_eff_m: number;
  sub: SubScores;            // decision 17: every sub-score exposed
  missing: ("wind" | "tide")[];                    // §3.6; consumer: reason copy + P1 factor rows,
                                                   // keyed (spot_id, valid_ts)
  damages: { factor: Factor; damage: number }[];   // sorted descending, §4; no entry for a null factor
  weakest_link: Factor | null;                     // null iff all damages are 0; never a null factor
  correction: { delta_q: number; gate: CorrectionGate };  // §5
};

// ---------- the five pure functions (research 09 §7.2 a-d, §7.3) ----------
function sDir(swellDir: number, p: EffectiveSpotParams): number;
//  delta = 0 if swellDir inside the clockwise span [theta_min -> theta_max] (wrap-aware),
//  else min(|angdiff(swellDir, theta_min)|, |angdiff(swellDir, theta_max)|)
//  S_dir = exp(-(delta / sigma_dir)^2)                          [research 09 §7.2a]

function hEff(h_m: number, t_s: number): number;
//  H_eff = H * (T / T_REF)^(1/2), T_REF = 10 s, epsilon = 0     [research 09 §7.2b]
//  Precondition t_s > 0: rows with t_s <= 0 never reach here (blend excludes them, §3.4)

function sSize(h_eff: number, p: EffectiveSpotParams): number;
//  S_size = exp(-1/2 * (ln(h_eff / h_ref) / s_size)^2); defined 0 at h_eff = 0 (the limit)
//                                                               [research 09 §7.2b]

function sWind(w: WindObs | null, p: EffectiveSpotParams): number | null;
//  null in -> null out (§3.6, no fallback value)               [04 §11; 2026-08-08 coherence round]
//  u_off   = -w.speed * cos(w.dir - shore_normal)   > 0 offshore
//  u_cross =  w.speed * |sin(w.dir - shore_normal)|
//  S_wind  = exp( -(max(0, -u_off) / k_on)^2
//                 -(max(0, u_off - u_star) / k_off)^2
//                 -(u_cross / k_cross)^2 )                      [research 09 §7.2c]

function sTide(t: TideObs | null, p: EffectiveSpotParams): number | null;
//  null in -> null out (§3.6, no fallback value); distinct from neutral, which is a REAL 1.0
//  neutral -> 1.0 (microtidal spots, §3.5)                      [04 §11; 2026-08-08 coherence round]
//  eta = clip((height - day_low) / (day_high - day_low), 0, 1); day_high == day_low -> eta = eta_opt
//  S_tide = exp(-1/2 * ((eta - eta_opt) / sigma_eta)^2)         [research 09 §7.2d, stage form]

function combine(sub: SubScores, p: EffectiveSpotParams, delta_q: number): ScoreResult;
//  P = the present (non-null) factors among {size, wind, tide}
//  sumW = sum of w_i for i in P                                 (weight renormalization, §3.6)
//  G = (prod over P of S_i^w_i)^(1 / sumW); any present factor 0 -> G = 0
//  Q = S_dir * G                                                [research 09 §7.3]
//  Q_final = clip(Q + delta_q, 0, 1)                            [research 09 §7.4]
//  score = Math.round(100 * Q_final)
```

#### 3.1 Coefficients, every one cited

All are **unfit priors** per research 09 §7 header ("reasonable starting guesses that must be
replaced by fitted values once section 5's ratings exist"). All live in one versioned
constants file (data, not code), alongside the per-spot values that come from the seed.

| Symbol | Value | Status | Citation |
|---|---|---|---|
| `sigma_dir` | 20° | unfit prior | research 09 §7.2a |
| `T_REF` | 10 s | convention, physics-derived form | research 09 §7.2b |
| `epsilon` (shoaling exponent) | 0 | shipped at 0; raise only against a breaker-height citation, then as a fitted parameter | research 09 §7.2b, flagged refinement |
| `h_ref_m`, `s_size` | per spot | seed file; `s_size ≈ 0.5` prior | research 09 §7.2b; `domain-model.md` §11 |
| `u_star` | 5 kt | unfit prior, per-spot in seed | research 09 §7.2c |
| `k_on` | 6 kt | unfit prior, deliberately < half `k_off`: onshore destroys faster. The asymmetry is the point of the term | research 09 §7.2c |
| `k_off` | 15 kt | unfit prior | research 09 §7.2c |
| `k_cross` | 12 kt | unfit prior | research 09 §7.2c |
| `w_size` | 0.4 | unfit prior | research 09 §7.3 |
| `w_wind` | 0.4 | **equal to size on purpose**: "the size was usually right and the wind was what ruined it." Not adjusted here | research 09 §7.3 |
| `w_tide` | 0.2 | unfit prior | research 09 §7.3 |
| `c1, c2, c3` (confidence) | 0.25, 0.20, 30° | unfit priors | research 09 §7.5 |
| `f(M)` thin-ensemble cap | M < 2 caps C_spread at 0.4; f = 1 otherwise | as specified | research 09 §7.5 |
| `lambda` (freshness) | 36 h | unfit prior | research 09 §14.3 |
| `eta_opt`, `sigma_eta` maps | §3.5 table | **v1 convention, NOT from research** | research 09 §7.2d names the shape only |
| `conf_level` thresholds | §6.4 table | **v1 convention, mine to set** per `domain-model.md` §6 | validated by research 09 §10.2 calibration |
| `cap_missing_wind`, `cap_missing_tide` | 0.4, 0.7 | **unfit priors, mine** (2026-08-08 coherence round, §3.6) | mechanism: research 09 §14.4 no-fabrication + 04 §11 null contract; values flagged §12 |

#### 3.2 Which swell train is scored

Research 09 §7 defines the sub-scores for ONE swell train and is silent on combining primary
and secondary trains. The prediction log carries both (`swell_*`, `swell2_*`). **v1 scores the
primary train only**, which is the literal research 09 §7 formula; `swell2` stays logged for
the learning loop and the members display. The alternative (score each train, take the max)
is specified in `## Decisions needing Andres` D2 so flipping it is one decision, not a
redesign. No third option is offered because research 09 gives no basis for summing trains.

#### 3.3 Member blend (pre-score)

```ts
type BlendResult =
  | { kind: "ok"; swell: SwellTrain; members_used: number; members_null: number }
  | { kind: "no_usable_members"; members_null: number };

function blend(members: MemberRow[]): BlendResult;
```

- Excluded before this function is called: land-masked rows (C1 ACL obligation,
  `domain-model.md` §17) and null members. Excluded here: rows with `h_m < 0` or `t_s <= 0`
  (counted into `members_null`, never silently dropped).
- `h_m` and `t_s`: arithmetic mean. `dir_deg`: circular mean, `atan2(Σsin, Σcos)`.
- Zero usable members returns `no_usable_members`, a value, not an exception (the outcome is
  in the return type). The builder publishes the honest "no data" state per research 09
  §14.4; it never fabricates.
- Rationale and rejected alternatives (score-space mean, best member, median):
  `adr-scoring-member-blend.md`. Research 09 §8.4: the mean is "a reasonable default, but a
  default, not a demonstrated improvement"; never presented as better than the best member.
- Wind and tide are single-source scalars per hour (no ensemble); they pass through,
  possibly null (04 §11; §3.6 governs the null path). (2026-08-08 coherence round)

#### 3.4 Baseline and our rank (B1 metric inputs)

`domain-model.md` §6 assigns this lane `baseline_rank_raw` and `our_rank`. Both pure:

```ts
function rankSpots(values: { spot_id: string; v: number }[]): { spot_id: string; rank: number }[];
// descending by v; ties share the lower rank number, deterministic tiebreak on spot_id
```

`baseline_rank_raw` ranks by blended raw `swell_h_m` (research 09 §10.1 B1: "rank spots by
significant wave height, literally the tracker"). `our_rank` ranks by `score`. Both are
written to every PublishedCall row so the §10.2 pairwise-ranking metric is computable offline.

#### 3.5 Tide: categorical seed to numbers (v1 convention, flagged)

The seed stores `tide: {optimum, sigma, range_class}` as words (`domain-model.md` §11).
Research 09 §7.2d gives the Gaussian shape and says sigma is "narrow for a shallow reef, wide
for a beachbreak" but maps no words to numbers. The map below is **v1 convention, data not
code**, in the same constants file as the band edges, and is item D3 for Andres:

| Seed word | Numeric | Value (unfit prior) |
|---|---|---|
| `optimum: low / mid_rising / mid_falling / high` | `eta_opt` (normalized stage 0-1) | 0.1 / 0.5 / 0.5 / 0.9 |
| `sigma: narrow / wide` | `sigma_eta` | 0.15 / 0.35 |
| `range_class: micro` | `neutral: true` (S_tide = 1) | keeps microtidal spots from inheriting tide sensitivity, `domain-model.md` §11 |
| `range_class: meso / macro` | `neutral: false` | tide term active |

Known loss, stated: `mid_rising` vs `mid_falling` both map to 0.5. A stage-only Gaussian
cannot express tide direction; research 09 §7.2d has no direction term. The words stay in the
seed so the day direction sensitivity gets a formula (with a citation), no seed edit is needed.
Flagged in `## What I am unsure about` #2.

Stage normalization inputs (`day_low_m`, `day_high_m`) are the min and max of the logged
hourly `tide_m` series over the spot-local calendar day (spot `timezone` field), computed by
the shell, passed in. No new data source.

#### 3.6 Null observations (2026-08-08 coherence round; ingest contract 04 §11)

04 §11 states as fact, from a live-verified failure mode: wave rows carry `wind_speed_kt` and
`wind_dir_deg` null when the wind source is down, and `tide_m` null when tide has been dark
more than 7 days. The §9 row that previously read "tide_m present hourly" recorded a stale
requirement and is corrected below; the ingest lane owns the ACL and is right.

**Chosen behavior: a null factor is EXCLUDED, never estimated.**

| Case | Behavior |
|---|---|
| `wind_speed_kt` or `wind_dir_deg` null (either one: a wind observation is the pair) | `sWind` returns null; wind leaves the geometric mean AND `w_wind` leaves `sumW`; no damage entry; `sub.wind = null`; `missing` contains `"wind"`; confidence capped at `cap_missing_wind = 0.4` |
| `tide_m` series null (no day extremes derivable either) | `sTide` returns null; same treatment with `w_tide`; `missing` contains `"tide"`; confidence capped at `cap_missing_tide = 0.7` |
| `range_class: micro` with tide data present | Unchanged: neutral is a REAL `S_tide = 1.0`, not a null. Neutrality and absence stay distinguishable in the output |
| Both null | Both excluded; `q = S_dir * S_size^(w_size/w_size) = S_dir * S_size`; caps compose by min |
| Confidence cap application | `c_total = min(product of participating confidence factors (§6.4), cap)` where `cap = min` over missing factors, `1` when none. Applied before the §6.4 level projection. Reason copy names the missing source with the plain fact ("no wind data today; score is swell and tide only"), research 09 §14.4 |

Rejected alternatives, so nobody reopens them:

- **`S = 1.0` with the weight kept**: with sub-scores below 1, keeping `w_wind` in `sumW`
  while pinning `S_wind = 1` reads as "wind was observed perfect". That is a fabricated
  optimal observation entering the maths, exactly what research 09 §14.4 ("never fabricate")
  and this design's core promise forbid. Weight renormalization is the true neutral of a
  weighted geometric mean: the score becomes the honest mean of the factors we know.
- **Refuse to score the hour**: wind is a single source; one outage would blank all spots for
  its whole duration. Research 09 §14.4 requires saying what we do not know, not going
  silent. The published score plus `missing` plus the capped confidence IS the honest state.

Cap values 0.4 / 0.4-vs-0.7 asymmetry: `cap_missing_wind = 0.4` reuses the f(M) thin-data cap
value (research 09 §7.5) and matches wind's weight class (0.4); `cap_missing_tide = 0.7` is
the medium/high boundary (§6.4) matching tide's smaller weight (0.2). Both are unfit priors,
mine, data in the constants file, flagged in §12. Consumers of `missing`: bundle
`confidence_reason` copy and P1 factor rows (`application-architecture.md` §7), keyed
`(spot_id, valid_ts)`. Declared law: L16 (§10), so DISTILL writes the property tests.

The spot page must name the single thing that killed the score, and the frontend is building
against this output, not deriving it. Naive `min(sub-score)` is wrong under unequal weights:
tide at 0.5 (weight 0.2) hurts less than wind at 0.6 (weight 0.4). The honest "what killed
it" is the factor that contributed the most log-damage to Q:

```
damage_dir  = -ln(S_dir)                          (the gate carries full weight)
damage_i    = (w_i / sumW) * -ln(S_i)             for i in {size, wind, tide}
so that:      Q = exp(-(damage_dir + damage_size + damage_wind + damage_tide))
```

- `damages` is the four pairs sorted descending, deterministic tiebreak by fixed factor order
  `dir > size > wind > tide`.
- `weakest_link = damages[0].factor`, or `null` when every damage is 0 (perfect score).
- The UI string pairs the label with the raw sub-score value ("wind at 0.18"): label from
  damage, displayed number from `sub`. Both are in `ScoreResult`; the frontend derives
  nothing. Consumer and join key: P1 render input per `application-architecture.md` §7,
  keyed `(spot_id, valid_ts)`.
- The decomposition identity (Q equals exp of minus the damage sum) is law L10, so the
  breakdown the UI shows always multiplies back to the score it sits next to.

Rationale vs the naive alternative: `adr-scoring-weakest-link-damage.md`.

### 5. Learned correction: applied, never baked in (research 09 §7.4, §13.4; decision 22)

The engine never reads or writes the seed or the correction file; the shell reads both and
calls one pure function. Fitting is the learning lane's (06). Application is here.

```ts
type CorrectionGate = "no_file" | "n_lt_10" | "reporters_lt_5" | "not_significant" | "applied";
type CorrectionOutcome = {
  params: EffectiveSpotParams;          // seed-derived, with per-source H bias deltas resolved
  memberHBias: (source: string, lead_h: number) => number;  // metres to SUBTRACT, 0 unless gated in
  delta_q: number;                      // score-level delta in Q units, 0 unless gated in
  gate: CorrectionGate;                 // written to PublishedCall.bias_gate (domain-model §6)
};
function applyCorrection(seed: SpotSeed, correction: CorrectionRecord | null): CorrectionOutcome;
```

- **Gates re-checked at read time** (defense in depth; `domain-model.md` §11 places them at
  the builder): apply only if `n >= 10 AND reporters >= 5` (research 09 §13.4 gate 1)
  and `|b| > 2 * se` (gate 2). Field semantics per 06 §7 as amended 2026-08-08: the file's
  `reporters` is the distinct TRUST-ELIGIBLE count (06 G2) and the file's `se` is the floored
  `se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n))` (06 G3), so this re-check needs no new
  inputs and inherits both anti-Sybil amendments for free. Shrinkage (gate 3) and blocked
  cross-validation (gate 4) are
  fit-time properties owned by lane 06; this function trusts `b` is already shrunk and states
  that as a requirement owed (§9). Clamp (gate 5): `|H bias| <= clamp.max_abs_h_frac * H`
  applied per member at use.
- **Two application points**, both from research 09: per-(source, lead bucket) H bias
  subtracted from member `h_m` before blending (§13.3 stage 1), and `delta_q` added to Q
  after combining (§7.4: `Q_final = clip(Q + delta, 0, 1)`).
- **Launch inertness is the `null` path**: no correction file, `gate = "no_file"`,
  `memberHBias ≡ 0`, `delta_q = 0`, `Q_final ≡ Q` exactly (law L8). The epic keystone row
  ("learning term wired in and set to zero") is this code path. Turning learning on later is
  the appearance of a file, not a code change.
- **Units and sign, pinned because the file example makes them ambiguous**: the correction
  file's `score_delta.b` is in display points (the example is -4.1; a Q-unit reading would be
  absurd), so `delta_q = clip(b, -clamp_q*100, clamp_q*100) / 100`. Sign convention for all
  biases: `residual = predicted - observed`, `b = mean(residual)`, `corrected = predicted - b`.
  Lane 06 must confirm both (owed interface, §9); a silent disagreement here is a 100x or a
  sign bug on every public number.

### 6. Confidence: beside the score, never in it (research 09 §7.5, §3.6, §14.3)

§3.6 read directly, as instructed. It supersedes §8.4 and §14.3 where they disagree: spread
is a weak skill predictor (Whitaker & Loughe 1998; Ebert 2001; Eckel & Mass 2005; Rupp 2026),
must be a qualitative flag never a calibrated error bar, carries usable signal only at the
tails of the spot's own spread climatology, and is removed entirely if it fails the §10.2
calibration check.

```ts
type SpreadInput =
  | { kind: "absolute" }                                   // launch: no history yet
  | { kind: "climatology"; pct: number };                  // percentile of THIS spot's own
                                                           // historical spread (research 09 §3.6.2)
type ConfidenceResult = {
  c_spread: number; c_track: number;
  c_fresh: number | null;                                  // null = no report ever: excluded from
                                                           // the product, not floored (§6.3, D4
                                                           // ANSWERED 2026-08-08)
  c_total: number;                                         // product of participating factors,
                                                           // research 09 §14.3 + §6.3, then the
                                                           // §3.6 missing-factor cap (2026-08-08)
  level: "high" | "medium" | "low";
  track_state: "unverified" | "measured";                  // §6.2; drives the no-track-record copy
                                                           // (2026-08-08 coherence round)
  spread_terms: { height: number; period: number; direction: number };  // penalty decomposition
  dominant: "spread_height" | "spread_period" | "spread_direction" | "track" | "freshness"
          | "missing_data" | null;                         // missing_data when the §3.6 cap binds
};
function confidence(
  members: MemberRow[], spread: SpreadInput,
  track: { mae: number; mae_ref: number } | null,          // null until scorecard passes honesty gates
  last_report_age_h: number | null,                        // null = no report ever (§6.3: excluded)
  missing: ("wind" | "tide")[],                            // §3.6 (2026-08-08 coherence round)
): ConfidenceResult;
```

#### 6.1 C_spread

- **Launch (absolute form, research 09 §7.5)**: `CV_H`, `CV_T` = coefficient of variation of
  member heights and periods; `Δdir` = circular range (max pairwise `|angdiff|`).
  `c_spread = min(exp(-(CV_H/c1)^2 - (CV_T/c2)^2 - (Δdir/c3)^2), cap)` with `cap = 0.4` iff
  `members_used < 2`, else no cap. The f(M) cap binds `c_spread` and only `c_spread`: §7.5's
  `C` IS the spread term (§14.3 renames it `C_spread`), and `c_track`/`c_fresh` are separate
  §14.3 factors that f(M) never touches.
- **Once spread climatology exists (§3.6 binding consequence 2)**: the percentile input
  replaces the absolute CVs. Qualitative tails only: pct <= 20 maps to 1.0, 20 < pct < 80
  maps to 0.7, pct >= 80 maps to 0.35 (data, unfit priors). The climatology itself (per-spot
  historical spread distribution from the PublishedCall log) is accumulated data; switching
  forms is a data availability change, same code shape as the correction hook. **Activation
  policy (accepted 2026-08-10):** the launch policy's `spread_climatology.minimum_history_days`
  is `30`. A qualifying history row is one distinct, completed spot-local forecast day with
  usable multi-source spread, from the insert-only PublishedCall log; the current day never
  supplies its own reference. Fewer than 30 **valid, readable** rows keeps the absolute form and
  forbids the normal-comparison copy. A malformed, unreadable, disappearing, duplicate-grain, or
  unavailable region-scoped history is not thin history: production composition refuses before
  any PublishedCall, bundle, or manifest write and emits `health.startup.refused` for
  `published_call_history`. This is an unfit, reversible policy prior, not a claim that 30 days
  calibrates model skill. ADR:
  `adr-spread-climatology-activation.md`.
- **Removal clause (§3.6 binding consequence 3)**: `c_spread` participates only while the
  §10.2 Brier calibration check passes (high-confidence days measurably more often right).
  Participation is a per-factor enable flag in the constants file; disabling it is a data
  change. This reconciles decision 7 (confidence always shown) with §3.6 (remove the term if
  it lies): the LEVEL keeps rendering from the surviving factors; only the spread factor is
  removable. A calibration failure changes `confidence_factors.spread` to `false`; it does not
  fall back to either climatology or absolute spread. Re-enabling needs a later, recorded
  learning-lane evaluation, never an automatic retry.
- `spread_terms` feeds the reason copy ("72% of the penalty comes from the period
  disagreement", research 09 §7.5 worked example). Consumer: `confidence_reason` in the
  bundle (`domain-model.md` §13), keyed `(spot_id, valid_ts)`.

#### 6.2 C_track (research 09 §14.3; neutrality-at-launch argued, 2026-08-08 coherence round)

`C_track = clip(1 - mae / mae_ref, 0, 1)` when the scorecard row passes the honesty gates
(`n >= 10 AND distinct trust-eligible reporters >= 5`, `domain-model.md` §9 as amended by
06 §7); input `null`, factor 1.0, and `track_state = "unverified"` otherwise. When the gates
pass, `track_state = "measured"`. Research 09 never defines `MAE_reference`; that gap is D5,
not filled here with an invented denominator.

**Why 1.0 stays, against the coherence finding that it flatters unverified spots:**

| Argument | Evidence |
|---|---|
| A never-verified spot reading "high" was structurally unreachable pre-amendment; it is reachable now, and deliberately (2026-08-08, D4) | With freshness excluded for unreported spots (§6.3) and tight model agreement, `c_total = c_spread` can exceed 0.7. Accepted: the level is an agreement claim, never an accuracy claim; the copy rule below plus the §6.3 copy rule name both absences on every such row, and the §10.2 calibration check with the §6.1 removal clause bounds the exposure once data exists |
| A penalizing track prior would still be wrong | Absence of verification is carried by copy, not by penalty factors (§6.3, 2026-08-08): a penalizing prior would reintroduce the constant day-one "low" that D4 removed, which carries zero information, the failure mode the finding itself names |
| Confidence is not an accuracy claim | Decision 19 / HANDOFF §6 item 12 govern CLAIMS; those live behind the two claim ladders (06 §10) and stay unearnable at launch. `conf_level` states how sure we are about today's call from model agreement plus ground-truth recency; it asserts nothing about past skill |
| The residual exposure is named, not hidden | The real window is a spot WITH recent reports but a sub-gate scorecard (`c_fresh` near 1, models agreeing): it can read "high" with zero verified track record. That is defensible (fresh human confirmation exists) but must not be silent, hence the copy rule below |

**Copy rule, binding on the reason string**: whenever `track_state = "unverified"`, the
confidence reason names it with the counter, "sin historial verificado aqui todavia (n/30)" /
"no verified track record here yet (n/30)", regardless of level. The user never sees a "high"
that silently implies a track record. Consumer: `confidence_reason` in the bundle
(`domain-model.md` §13), keyed `(spot_id, valid_ts)`; frontend renders, never derives.

#### 6.3 C_fresh (research 09 §14.3; participation amended 2026-08-08, D4 ANSWERED)

Absence and staleness are different states (Andres, 2026-08-08): a spot with zero reports is
not stale, it is unreported. The factor treats them differently:

| State | Input | Factor |
|---|---|---|
| Unreported (no report ever) | `last_report_age_h = null` | `c_fresh = null`; freshness leaves the `c_total` product entirely. Absence is not an observation; flooring it fabricated a staleness reading for a spot never observed, the same move §3.6 and research 09 §14.4 forbid for wind and tide (L16). Exclusion is this design's own null-observation rule applied to its third input |
| Reported (a report exists) | `last_report_age_h = Δt` | `C_fresh = max(exp(-Δt / 36), fresh_floor = 0.3)`, bit-identical to the pre-amendment formula. `lambda = 36 h` unchanged (research 09 §14.3, unfit prior) |

Day-one consequence: with no reports anywhere and track neutral (§6.2), `c_total = c_spread`,
so the level renders from model agreement alone and all three levels are reachable from the
first build (arithmetic in §11). Four models in tight agreement and four models split between
0.8 m and 2 m are different days, and the level now says so. Track record is not made
redundant: it joins as an independent multiplicand once the scorecard passes the gates
(§6.2), dragging the level where the spot has measurably been hard to call and upgrading the
copy from unverified to measured where it has not.

`fresh_floor = 0.3` survives, scoped to the reported regime only: a long-silent spot decays
to the floor and reads baja at any agreement (0.96 × 0.3 = 0.29, §11), never a pinned zero,
and the reason string names the stale date (research 09 §14.4 "say when data is stale"). The
floor stays an unfit prior, mine, data, flagged in §12; its original day-one job is now done
by exclusion instead.

Binding copy rule (extends the §6.2 rule): whenever `c_fresh = null`, the reason string names
both the level's basis and the absence: "el nivel refleja cuanto coinciden los modelos; nadie
ha reportado desde este spot todavia". An agreement claim, never an accuracy or error-bar
claim (research 09 §3.6 qualitative-flag consequence; §10.4 honesty rule). Consumer:
`confidence_reason` in the bundle (`domain-model.md` §13), keyed `(spot_id, valid_ts)`.

Rejected alternatives, so nobody reopens them:

- **Raise the floor until "alta" is reachable** (needs `fresh_floor > 0.7`): guts staleness,
  a genuinely old report could never drag the level below media, and unreported stays
  conflated with stale.
- **Freshness as a separate displayed signal, out of the product**: a stale spot with tight
  agreement would read alta; staleness must bind the level itself, which was the point of the
  term and stays.
- **Expire old reports back to `null` past a horizon**: the level would rise as the last
  report ages past the horizon, non-monotone in report age, and the horizon would be one more
  uncited coefficient.

Known one-way ratchet, stated: once a spot's first report ever ages past ~43 h (where
`exp(-Δt/36)` reaches the floor), its ceiling is `c_spread × 0.3`, baja, below a
never-reported neighbour at the same agreement. Conservative by construction, both states
named in copy; §12 carries it.

#### 6.4 Level projection

`c_total = min(product of participating factors, §3.6 missing-factor cap)` (research 09
§14.3 as amended by §6.3; cap added 2026-08-08 coherence round, binds only when wind or tide
input is null and sets `dominant = "missing_data"` when it does). Participating factors:
`c_spread` unless removed per §6.1, `c_track` always (neutral 1.0 until measured, §6.2),
`c_fresh` only when a report exists (§6.3, amended 2026-08-08). Thresholds, mine to set per
`domain-model.md` §6, v1 convention, data: **low `c_total <= 0.4`, medium `0.4 < c_total <=
0.7`, high `> 0.7`**. Consequences: since every other participating factor is `<= 1`, the
f(M) cap on `c_spread` bounds `c_total <= 0.4`, so a single-member day can never read above
"low"; the §7.5 worked Venao value 0.31 reads "low", matching the research text.
Zero-informative-factor guard (2026-08-08): if the spread factor is disabled by the §6.1
removal clause AND `track_state = "unverified"` AND `c_fresh = null`, no informative factor
survives and an empty product would read 1.0, alta, a fabricated certainty; the level is
forced "low" with `dominant = null` and the reason names that no usable confidence signal
exists yet (research 09 §14.4). Both continuous value and level are logged in every
PublishedCall row (settled, `domain-model.md` §6) so thresholds can move without losing
history.

Structural separation law (L9): `score()` does not accept ensemble-spread, track-record, or
freshness inputs; `confidence()` does not return anything `combine()` reads. The type
signatures make "confidence multiplied into the score" unrepresentable.

### 7. Presentation-adjacent pure functions (separate from the physics on purpose)

| Function | Contract | Why separate |
|---|---|---|
| `sizeBand(h_eff_m, bands) -> band_id` | Left-open right-closed intervals `(lo, hi]`; bottom band `[0, 0.1]`, top band `(2.4, ∞)`; `bands` is the canonical `size_band_schema: 1` table passed in as data | Decision 18 + mandate: band edges are an open question for a local surfer to check (`domain-model.md` §16 D7); edges move without touching physics. The `(lo, hi]` rule is chosen to conform to the settled `domain-model.md` §6 example (`h_eff_m: 1.1` maps to `waist_chest` = `(0.7, 1.1]`), so the settled artifact is consumed, not contradicted; flag #1 asks the domain owner to write the notation into the schema table |
| `windWord(s_wind, thresholds) -> word` | `clean` if `s_wind >= 0.75`, `choppy` if `>= 0.35`, else `blown_out`; thresholds data, unfit priors | Reuses the physics instead of a second wind formula. **Corrected 2026-08-09** (Andres, closing f-tell-us-what-you-saw-cold Pre-requisite 1): this row previously named `clean, bumpy, choppy`, which made `choppy` the WORST bucket here and the MIDDLE bucket on the report form, with both words meeting on one reveal card. `bumpy` appears in zero lines of code; `src/pipeline/build.ts` `windState` has shipped `clean, choppy, blown_out` at a 0.35 middle threshold and the live surface carries 28/27/5 across those three. The vocabulary's single source is now `src/data/report-vocab.ts`, consumed by the capture form, the published surface and the wire contract alike; the threshold moved to the code's 0.35 rather than this document's 0.40 so the document stops contradicting what 40 published rows are displaying. |
| `bestWindow(hourly: {t, q}[], daylight: [start, end], ratio) -> {start, end} | null` | Longest contiguous run of daylight hours with `q >= ratio * max_q(day)`; `ratio = 0.8`, data. `null` when max_q = 0 | Research 09 is silent on "best window"; this is presentation, not physics, and the payload needs it (`domain-model.md` §13). Daylight bounds are shell-computed (standard solar-position arithmetic is deterministic, lat/lon/date in, no I/O); D6 records the choice |

All three take their tables as parameters. None reads config. Band mapping consumes `h_eff_m`;
the honesty gap between energy-equivalent height and breaking-face height is `## What I am
unsure about` #1.

### 8. Complexity and the Lambda budget, with arithmetic

Launch workload per hourly build (the mandate's numbers):

| Step | Count | Cost |
|---|---|---|
| Member rows read | 20 spots × 48 h × 4 sources = **3,840** | ~1.3 MB at 342 B/row (`domain-model.md` §5.1), against 1024 MB |
| Blends + score evaluations | 20 × 48 = **960** | ~15 transcendental ops each (exp, ln, sin, cos, atan2, sqrt), ~2 µs per eval |
| Confidence evaluations | 960 | same order |
| Ranks | 48 sorts of 20 | negligible |
| **Total core compute** | | **< 50 ms**, 0.04% of the build Lambda's 120 s (system-architecture §9 guardrail 2); fits the 60 s fetch-class budget 1,000x over if it ever moves |

At 5,000 spots: 240,000 evaluations ≈ under 2 s single-threaded, still inside one Lambda; the
per-tile shard (system-architecture §13.1) bounds it regardless. The engine adds no memory,
concurrency, or timeout pressure to any guardrail.

### 9. Interfaces owed to this lane (requirements, not requests)

| From | Requirement | Why it blocks |
|---|---|---|
| Lane 06 (learning) | Confirm correction-file semantics: `score_delta.b` in display points; bias sign convention `residual = predicted - observed`, `corrected = predicted - b`; `b` values already shrunk (research 09 §13.4 gate 3); blocked cross-validation at fit time (gate 4); file `se` = floored `se_gate`, file `reporters` = trust-eligible distinct count (2026-08-08 coherence round, §5) | §5 unit/sign pinning; a mismatch is a silent 100x or sign inversion on every public score |
| Lane 04 (ingest) | Land-mask translation done in C1 (`H==0 && T==0 && dir==0` never reaches the blend as data), per `domain-model.md` §17; wind pair and `tide_m` MAY be null per 04 §11 and the shell passes null through to §3.6, never a substitute (corrected 2026-08-08 coherence round: this row previously demanded "tide_m present hourly", which contradicted the ingest ACL; 04 is right); member rows carry `source` and `lead_h` | Blend correctness; research 09 §8.3 Finding 2 is the already-verified defect |
| Builder (07 / C4 shell) | Latest-run-per-source member selection (settled, `domain-model.md` §6); day tide extremes from the logged series per spot-local day; `last_report_age_h`; daylight bounds | Declared inputs, so the core stays pure |
| Domain constants | One versioned constants file carrying: §3.1 coefficients, §3.5 tide map, band edges, wind-word and conf-level thresholds, factor enable flags | Everything tunable is data; DISTILL property tests pin the laws, not the numbers |

### 10. Laws (each one property-testable; DISTILL authors against this list)

Generator domains: `h_m ∈ [0, 20]`, `t_s ∈ (0, 25]`, angles `∈ [0, 360)`, `speed_kt ∈ [0, 80]`,
`eta ∈ [0, 1]`, weights `> 0`, `delta_q ∈ [-1, 1]`; wind and tide inputs each generated null
with positive probability (§3.6, 2026-08-08 coherence round); `last_report_age_h` generated
null with positive probability (§6.3, 2026-08-08).

| # | Law | Statement |
|---|---|---|
| L1 | Bounds | Every sub-score `∈ [0, 1]`; `q, q_final ∈ [0, 1]`; `score` integer `∈ [0, 100]` |
| L2 | Determinism | Identical inputs give bit-identical outputs; no call reads clock, env, or filesystem |
| L3 | Gate dominance | `q <= sub.dir` always; as `sub.dir -> 0`, `q -> 0` regardless of every other input ("a great swell can never average away a ruined wind", research 09 §7.1) |
| L4 | Geometric-mean drag | `q <= max(sub.size, sub.wind, sub.tide)`; any sub-score at 0 forces `q = 0` |
| L5 | Direction monotone | `sub.dir` is non-increasing in `delta` (distance outside the window); equals 1 inside |
| L6 | Size unimodal | At fixed wind/tide/direction, `q` is strictly increasing in `h_eff` on `(0, h_ref)` and strictly decreasing on `(h_ref, ∞)`; a swell strictly closer to `h_ref` in log space, all else identical, never scores lower |
| L7 | Wind asymmetry | For every speed `x > 0`: pure onshore at `x` scores strictly below pure offshore at `x` (with the §3.1 priors, `(x/6)^2 > (max(0, x-5)/15)^2` for all `x > 0`); cross-wind term is sign-symmetric |
| L8 | Correction inertness and bounds | `delta_q = 0` implies `q_final = q` exactly; `|q_final - q| <= |delta_q|`; `q_final` monotone in `delta_q`; `gate = "no_file"` implies both hooks are identity |
| L9 | Score/confidence separation | Structural: the score signature accepts no spread/track/freshness input; permuting or perturbing confidence inputs never changes `score` |
| L10 | Damage decomposition | `q = exp(-(Σ damages))` to floating tolerance; `weakest_link = argmax damage` with the fixed tiebreak; all-zero damages imply `weakest_link = null` |
| L11 | Blend sanity | Blend is permutation-invariant; excluding a member changes `members_used` accounting, never silently; circular mean of `{359°, 1°}` is `0°`, never `180°` |
| L12 | Rotational invariance (nothing-Panama) | Adding any constant rotation to ALL angles (swell dir, window edges, shore normal, wind dir) leaves every output unchanged; no hemisphere, no fixed swell window, no timezone in the maths |
| L13 | Period monotone below reference | At fixed `h_m` with `h_eff < h_ref`: longer `t_s` never lowers `q` (energy flux, research 09 §7.2b); `hEff(1.5, 16) = 1.90` and `hEff(1.5, 8) = 1.34` reproduce the §7.2b sanity check |
| L14 | Tide neutrality | `range_class: micro` implies `q` is independent of every tide input |
| L15 | Rank consistency | `rankSpots` is a permutation; descending; deterministic under ties; `our_rank` depends only on scores, `baseline_rank_raw` only on blended raw heights |
| L16 | Null-factor honesty (2026-08-08 coherence round, §3.6) | For `x ∈ {wind, tide}`: null input implies `sub.x = null` (never a number), `x ∈ missing`, no damage entry for `x`, and `q` equals the weighted geometric mean over the present factors only (renormalized `sumW`), bit-identical to computing with `x` never defined; the §3.6 confidence cap binds (`c_total <= cap`); `weakest_link` never names a null factor; `missing = []` implies L1-L15 outputs unchanged from the pre-amendment formula; microtidal neutral (`S_tide = 1.0`) and tide-null are distinguishable in the output |
| L17 | Freshness participation (2026-08-08, §6.3, D4) | `last_report_age_h = null` implies `c_fresh = null` and freshness absent from the `c_total` product (never a floored number); `last_report_age_h = h` implies `c_fresh = max(exp(-h/36), 0.3)`, non-increasing in `h`, and `c_total` bit-identical to the pre-amendment formula; `c_fresh = null` and `c_fresh = 1.0` are distinguishable in the output; spread disabled AND `track_state = "unverified"` AND `c_fresh = null` forces `level = "low"` with `dominant = null` (§6.4 guard) |

Each law is one or more property tests; the constants are parameters of the generators, so
refitting coefficients later (research 09 §7 header) breaks no test that should survive.

### 11. Worked example: real inputs to final score, every intermediate

Playa Venao, valid 2026-08-08T18:00Z. Members are the live pull in research 09 §8.2 (the four
usable of seven); wind and tide from the `domain-model.md` §5.1 sample row; seed constants
from the `domain-model.md` §11 example. Correction file absent (launch).

**Blend** (4 usable members: 0.64/15.5/206, 0.66/15.5/204, 0.78/11.6/212, 0.86/10.05/203):

| Quantity | Computation | Value |
|---|---|---|
| `h_m` | (0.64+0.66+0.78+0.86)/4 | 0.735 m |
| `t_s` | (15.5+15.5+11.6+10.05)/4 | 13.16 s |
| `dir_deg` | circular mean, atan2(-0.4414, -0.8952) | 206.3° |
| members_used / null | | 4 / 3 |

**Sub-scores** (seed: window [150, 210], shore normal 175°, h_ref 1.3, s_size 0.5, wind
{5, 6, 15, 12}, tide mid_falling/wide/macro; day tide extremes 0.9 / 4.3 m, tide now 2.31 m):

| Term | Computation | Value |
|---|---|---|
| `S_dir` | 206.3° inside [150, 210] so delta = 0; exp(0) | **1.000** |
| `h_eff` | 0.735 × (13.16/10)^0.5 = 0.735 × 1.1473 | **0.843 m** |
| `S_size` | ln(0.843/1.3) = -0.4329; exp(-0.5 × (-0.4329/0.5)^2) = exp(-0.3747) | **0.687** |
| `u_off` | -7 × cos(40° - 175°) = -7 × (-0.7071) | +4.95 kt (offshore) |
| `u_cross` | 7 × \|sin(-135°)\| | 4.95 kt |
| `S_wind` | onshore term 0; offshore excess max(0, 4.95-5) = 0; cross (4.95/12)^2 = 0.1701; exp(-0.1701) | **0.844** |
| `eta` | (2.31 - 0.9)/(4.3 - 0.9) | 0.415 |
| `S_tide` | exp(-0.5 × ((0.415 - 0.5)/0.35)^2) = exp(-0.0297) | **0.971** |

**Combine** (weights 0.4/0.4/0.2, sumW = 1):

| Step | Computation | Value |
|---|---|---|
| damages | dir 0; size 0.4 × 0.3747 = **0.1499**; wind 0.4 × 0.1701 = 0.0681; tide 0.2 × 0.0297 = 0.0059 | weakest_link = **size** |
| `G` | exp(-(0.1499 + 0.0681 + 0.0059)) = exp(-0.2239) | 0.799 |
| `q` | 1.000 × 0.799 | 0.799 |
| `q_final` | clip(0.799 + 0, 0, 1) (gate `no_file`) | 0.799 |
| **`score`** | round(79.9) | **80** |
| `sizeBand(0.843)` | (0.7, 1.1] | `waist_chest` |

**Confidence** (same members; research 09 §7.5 worked the identical numbers): CV_H = 0.122,
CV_T = 0.182, Δdir = 9°; penalties 0.239 + 0.832 + 0.090; `c_spread = exp(-1.161) = 0.31`,
M = 4 so no cap. Track neutral (no scorecard yet) = 1.0; no report ever, so `c_fresh = null`
and freshness does not participate (§6.3, amended 2026-08-08). `c_total = 0.31 × 1.0 = 0.31`
and the level is **low**; dominant = `spread_period` (72% of the spread penalty). The reason
copy writes itself and is true: "models split 10 s vs 15.5 s on period, and nobody has
reported from this spot yet."

**Day-one level reachability (D4, 2026-08-08).** Same Venao seed and valid hour; the member
variants below differ only in how much the models agree. Launch state throughout: no report
ever (`c_fresh = null`), track neutral, so `c_total = c_spread`:

| Case | Members H m / T s / dir | CV_H / CV_T / Δdir | Penalty sum | c_total | Level |
|---|---|---|---|---|---|
| Four members, tight | 0.71-0.76 / 12.8-13.5 / 4° range | 0.025 / 0.019 / 4° | 0.010 + 0.009 + 0.018 = 0.036 | 0.96 | **alta** |
| Four members, moderate period split | 0.71-0.76 / 10.5-15.0 / 9° range | 0.025 / 0.132 / 9° | 0.010 + 0.432 + 0.090 = 0.532 | 0.59 | **media** |
| Four members, the real pull above | 0.64-0.86 / 10.05-15.5 / 9° range | 0.122 / 0.182 / 9° | 0.239 + 0.832 + 0.090 = 1.161 | 0.31 | **baja** |
| One usable member | any single row | spread terms 0; f(M) caps `c_spread` at 0.4 | n/a | 0.40 | **baja** |

What each level takes on day one: alta needs the penalty sum under 0.357 = -ln(0.7) (with
height and direction aligned, period scatter up to ~1.5 s std at a 13 s mean; spread across
all three terms, roughly heights within ±6 cm, periods within ±1 s, directions within ±10°);
media needs under 0.916 = -ln(0.4); anything worse, or a single member, reads baja.

Once a report exists, freshness rejoins (§6.3) and staleness binds at any agreement. On the
tight-agreement day (`c_spread = 0.96`): report 3 h old, `c_fresh = 0.92`, `c_total = 0.89`,
alta; 24 h old, `c_fresh = 0.51`, `c_total = 0.50`, media; 96 h old, `c_fresh = floor 0.30`,
`c_total = 0.29`, baja. A genuinely stale spot cannot read confident.

The day reads: right direction, clean-enough light wind, tide fine, score capped by size.
Weakest link "size at 0.69" with confidence low. That matches the §8.2 discussion of the same
day, which is the point of using real inputs.

### 12. What I am unsure about

1. **h_eff vs breaking face.** Bands are worded as breaking-face ranges (`domain-model.md`
   §7.2) but v1 maps them from `h_eff`, an offshore energy-equivalent at T_ref with
   `epsilon = 0` (research 09 §7.2b ships exactly this). The systematic gap between the two
   is precisely what the stage-1 per-spot bias will absorb, but until reports exist the
   displayed band can run small at long-period spots.
2. **Tide direction is lost** (§3.5): `mid_rising` and `mid_falling` collapse to the same
   number. Research 09 has no direction term; inventing one violates the facts-not-memory
   rule. The seed vocabulary keeps the distinction so a future cited formula needs no data
   migration.
3. **Blend under direction conflict.** A circular mean of members 115° apart (the §8.2 Malibu
   case, 78° vs 193°) lands between two swells neither model predicted. Confidence flags it
   hard (`Δdir` term) and the members are displayed raw, but the blended score that hour is
   physically dubious. Score-per-member with a min or max was rejected in the blend ADR;
   revisit only with evidence from the call log.
4. **Day-one "alta" is an agreement claim riding a weak predictor** (D4 ANSWERED 2026-08-08,
   §6.3). Spread-skill correlation can be near zero (research 09 §3.6; Rupp 2026: "robustly
   close to zero" in eastern Canada even at 100 members). Between launch and the first §10.2
   calibration pass, the three levels rest on a signal that may prove uninformative at these
   spots; the §6.3 copy rule keeps the claim honest and the §6.1 removal clause takes the
   factor out if the data says so. Second exposure, the one-way ratchet (§6.3): a spot's
   first report ever, aged past ~43 h, pins its ceiling at baja (`c_spread × 0.3`), below a
   never-reported neighbour at the same agreement. Conservative direction; revisit only with
   call-log evidence.
5. **Best-window semantics** (§7) are my convention; research 09 never defines the term. The
   wind-word thresholds likewise. Both are data.
6. **`sigma_dir` is global** (20°) while every other direction fact is per-spot. A headland
   spot that wraps swell may deserve a wider sigma; that is a seed-schema extension the
   learning loop can motivate later, not a v1 need.
7. **Missing-factor confidence caps (0.4 wind, 0.7 tide, §3.6)** are invented numbers with a
   weight-class rationale, not research. If a long wind outage happens, the call-log rows it
   produces (score present, `missing: ["wind"]`) are exactly the data to calibrate them
   against. (2026-08-08 coherence round)

### 13. Decisions needing Andres

| # | Decision | Options | My recommendation |
|---|---|---|---|
| D1 | Blend rule | (a) input-space mean over usable members (ADR); (b) score each member, publish the mean of scores; (c) best member only | **(a)**, per research 09 §8.4 mean-as-default; (b) is defensible and revisitable once the call log can compare them offline, zero user risk |
| D2 | Secondary swell train | (a) score primary train only (literal research 09 §7); (b) score each train, take the max-scoring train | **(a) for launch.** (b) is the likely end state (a spot lit by its secondary swell scores 0 on (a)), but research 09 gives no combination rule, so shipping (b) means shipping uncited physics. Log both trains from day one either way, so flipping later is retroactively evaluable |
| D3 | Tide word-to-number map (§3.5 values) | ship v1 values / have the cousin's crew sanity-check optimum and sigma per spot alongside the D7 band check (`domain-model.md` §16) | **Sanity-check with locals in the same WhatsApp message as the band edges.** One message covers both open data tables |
| D4 | Freshness floor 0.3 (§6.3 deviation from research 09 §14.3) | (a) floor at 0.3; (b) no floor, day-one confidence pinned low until reports flow; (c) disable the freshness factor until the first report exists | **ANSWERED 2026-08-08 (Andres): (c), as amended in §6.3.** Freshness participates only once a spot has a report: the null case is excluded, not floored, and the floor survives inside the reported regime. That closes my original objection to (c), "hides real staleness": a spot with an old report still decays to the floor and reads baja at any agreement. Day-one levels render from model agreement alone; arithmetic and reachability table in §11 |
| D5 | `MAE_reference` for C_track | research 09 §14.3 leaves it undefined; candidates: B1 raw-model MAE at the same spot and lead (skill-score framing, research 09 §10.1) vs a fixed band-width constant | **B1 raw-model MAE** once the scorecard has it; factor stays neutral until then. Needs lane 06 to expose raw-model MAE per (spot, lead) in the scorecard, one more variable in an existing structure |
| D6 | Best window definition | (a) contiguous daylight run at q >= 0.8 × day max; (b) fixed top-N hours; (c) drop the field at launch | **(a)**, ratio as data; it degrades honestly (null when flat) and the payload field is already in the settled bundle shape |

### 14. Flags, out of scope, found while working

1. **Band interval notation is absent from the settled schema.** `domain-model.md` §7.2
   writes ranges as `0.7 – 1.1` without stating which edge is closed; this design pins
   `(lo, hi]` (§7), the reading under which the settled §6 example (`h_eff_m: 1.1`,
   `waist_chest`) is exactly correct. Domain owner: write the `(lo, hi]` notation into the
   `size_band_schema: 1` table so the pin lives in the artifact, not in a cross-lane reading.
2. **Correction-file units are not stated in the schema** (`spot-correction/1`,
   `domain-model.md` §11): `score_delta.b: -4.1` is readable as points or as Q. §5 pins the
   reading; the schema should carry a `units` field so the pin is in the artifact, not in
   two lanes' agreement. Lane 06 + domain owner.
3. **`application-architecture.md` §7 P1** names "weakest-link label" as a builder input;
   this document is now its producing contract (§4). No conflict found, noted for the
   coherence review's consumer-producer sweep.
4. **Research 09 §7.5's own worked example** rounds its penalty sum (0.239 + 0.832 + 0.090 =
   1.161); the CV_T penalty from the stated CV (0.182/0.20)^2 is 0.828. Cosmetic, no
   consequence; noted so nobody chases a phantom discrepancy in DISTILL.
5. **`docs/feature/daily-call-with-permanent-receipts/feature-delta.md` slice-07 is worded
   for the pre-D4 behaviour** (found 2026-08-08, D4 amendment round). Its plan-notes bullet 3
   states the freshness floor holds `c_total <= 0.3` so "the displayed level stays 'baja'
   until reports exist in a later feature". False under §6.3 as amended: with no report ever,
   freshness is excluded, `c_total = c_spread`, and all three levels are reachable on day one
   (single-member days still cap at baja via f(M), §6.1). Needed rewording of that bullet:
   with four members the `members_used < 2` cap does not bind; with zero reports the
   freshness factor does not participate (05 §6.3, D4 ANSWERED 2026-08-08), so the day-one
   level renders from model agreement alone, and the reason string names that nobody has
   reported yet. The slice-07 row's own value statement already matches the new behaviour and
   needs no change; Pre-requisites row 4 can strike scoring D4 from its open list. Feature
   lane owns the edit.
