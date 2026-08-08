# 09 — AI Forecast Methodology: What Actually Works

**Research date:** 2026-08-08
**Purpose:** Answer honestly how an AI layer can make a Panama surf forecast better than a raw model feed, and kill the parts that are magical thinking.

Every claim is tagged:

- **[DEMONSTRATED]** — published result, working product, or measured benchmark, with a citation.
- **[MEASURED HERE]** — I ran the query myself this session; raw output is in this doc.
- **[ESTABLISHED PRACTICE]** — standard operational technique in meteorology/oceanography, documented by an official body.
- **[DERIVED]** — math or reasoning I worked out. Not validated by anyone. Correct arithmetic, unproven assumptions.
- **[SPECULATIVE]** — a design proposal. Nobody has shown it works for surf.
- **[HYPE / KILL]** — plausible-sounding, but the evidence says it will not work as advertised.

> **Citation discipline for this doc:** a URL appears here only if it was returned by a search or fetch performed on 2026-08-08. Nothing is cited from memory. Where I know something but did not retrieve a source, it is marked `[DERIVED]` and carries no citation.

---

## Table of contents

**PART I — can the forecast be trusted, and how do we score a spot**

0. **The finding that reframes everything** — Panama has no wave observations
1. Why surf forecasts are wrong (physics + modelling), with numbers
2. Nearshore transformation: offshore point → the actual break
3. Statistical post-processing / MOS — the legitimate "AI fixes the forecast"
4. Machine learning on waves and surf — what has actually been demonstrated
5. The human-in-the-loop flywheel — *how many ratings do we need?*
6. Where an LLM adds value vs where it is the wrong tool
7. The deterministic scoring function (actual math)
8. Confidence from model disagreement — **measured live for Panama**
9. Vision models on surf imagery
10. Evaluation — how we would know it works
11. **VERDICT: real vs hype**

**PART II — verification and the learning loop** *(the centrepiece)*

12. Ground truth in Panama — the complete, measured inventory
13. The learning loop: prediction log · observation record · scorecard · staged thresholds · hazards
14. "Is the surf good?" — the answer itself, and honest confidence
15. "Doesn't the WhatsApp group already do this?" — answered head-on
16. The honest ceiling — answering "perfect machine"
17. Going global — the hierarchical pooling design
18. **FINAL SUMMARY**

> **Reading order for a hurry:** §0 (the constraint) → §11 (real vs hype) → §13.4 (the
> thresholds) → §18 (summary).

---

# 0. The finding that reframes everything

Before any of the AI discussion: I checked whether Panama has any wave observation to
correct a forecast *against*. This decides which techniques below are available to us
and which are textbook-correct but operationally dead.

## 0.1 There is not one wave buoy on Pacific Central America

**[MEASURED HERE]** I pulled NOAA NDBC's full latest-observation file for every station
in its network and filtered geographically.

- Source: `https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt` (fetched 2026-08-08, 890 stations)

Searching the box **lat −10°N to 25°N, lon −70°W to −125°W** — which covers the entire
eastern tropical Pacific, all of Pacific Central America, and Panama's whole surf coast —
returns **12 stations, every one of which is in the Gulf of Mexico, the Caribbean, or the
Florida Keys.** Exactly one reports wave height (42095, Florida Keys, 1,834 km away).

**There is not a single NDBC station on the Pacific side of Central America. Zero.**

Nearest stations actually reporting wave height to Panama's Pacific coast (test point 8.0°N, 80.0°W):

| Station | Location | Distance | Notes |
|---|---|---|---|
| 41115 | 18.38°N, −67.28°W (Rincón, PR) | ~1,811 km | Caribbean, wrong ocean |
| 42095 | 24.41°N, −81.97°W (FL Keys) | ~1,834 km | Gulf, wrong ocean |
| 41121 | 18.49°N, −66.70°W (PR) | ~1,869 km | Caribbean, wrong ocean |

The nearest wave-measuring buoy of any kind is **42058 "Central Caribbean"** at
14.11°N, −75.95°W, ~812 km NNE, in 3,953 m of water
(`https://www.ndbc.noaa.gov/station_page.php?station=42058`, accessed 2026-08-08).
It was live and reporting when I checked — 2.7 m at 8 s
(`https://www.ndbc.noaa.gov/data/realtime2/42058.txt`, accessed 2026-08-08) — but it sits
in the open Caribbean on the **wrong side of the isthmus** for Pacific surf, and is far too
distant and too differently exposed to serve as ground truth for Bocas del Toro either.

## 0.2 Why this is the single most important fact in this document

Sections 3 (MOS / Kalman / quantile mapping) and much of section 4 (ML post-processing)
are legitimate, well-established, genuinely effective techniques. **Every one of them
requires a stream of local observations to correct against.** No observations, no
correction. It is not a modelling problem you can be clever about; the training signal
does not exist.

**Consequence — and this is the honest core of the whole report:**

> For Panama's Pacific surf coast, **user ratings are not a "nice engagement feature."
> They are the only ground truth that will ever exist.** There is no buoy to fall back
> on, no observation archive to bootstrap from, and no way to buy one. The human-feedback
> loop (section 5) is not the garnish on the AI story — it *is* the AI story. Everything
> else is either physics you can compute without learning anything, or narration.

This also means the project should be honest that **at launch, with zero ratings, the app
cannot be more numerically accurate than the models it reads.** What it can be on day 1 is
better *organized*, better *explained*, and more honest about uncertainty (sections 6, 7, 8).
That is a real product. It is not an AI accuracy claim.

## 0.3 What partial ground truth might be obtainable

**[SPECULATIVE — needs its own verification pass]** Possible substitutes, none of them equal to a buoy:

- **Satellite altimetry** (Jason / Sentinel-6 / SWOT / CryoSat) measures significant wave
  height globally, but altimeter returns are contaminated by land within roughly the last
  few tens of km of coast, and ground tracks revisit a given point on a multi-day cycle.
  It cannot give you a spot-specific hourly time series. Treated in section 3.
- **Surf-cam imagery** as a self-observation source (section 9).
- **User ratings** (section 5) — the recommended path.

Flagged for file `03-buoys-tides-observations.md`, which was still a skeleton at the time of
writing: its "THE critical question" section can be answered **no** on the strength of the
measurement above.

---

# 8. Confidence from model disagreement — *measured for Panama, not assumed*

I am presenting this section out of order because I measured it directly and it is the
strongest evidence in the document for what the product should actually do.

## 8.1 What models are actually reachable

File `01-marine-wave-apis.md` documents that Open-Meteo's Marine API exposes multiple
independent wave models under a `models=` parameter. Verified model identifiers
(`https://open-meteo.com/en/docs/marine-weather-api`, accessed 2026-08-08):

| API identifier | Model | Stated resolution |
|---|---|---|
| `meteofrance_wave` | Météo-France MFWAM | 0.08° (~8 km) |
| `dwd_ewam` | DWD EWAM | 0.05° (~5 km) |
| `dwd_gwam` | DWD GWAM | 0.25° (~25 km) |
| `ecmwf_wam` | ECMWF WAM | 9 km |
| `ecmwf_wam025` | ECMWF WAM 0.25° | 0.25° (~25 km) |
| `ncep_gfswave025` | NCEP GFS-Wave 0.25° | 0.25° (~25 km) |
| `ncep_gfswave016` | NCEP GFS-Wave 0.16° | 0.16° (~16 km) |
| `era5_ocean` | ERA5-Ocean (reanalysis) | 0.5° (~50 km) |

So a multi-model "poor man's ensemble" is available **free, from one endpoint, no key.**
That is the good news, and it is genuinely useful.

## 8.2 What they actually say at Panama surf spots — live pull, 2026-08-08

**[MEASURED HERE]** I requested seven models at five Panama spots, valid 2026-08-08T18:00Z.

Endpoint pattern used:
`https://marine-api.open-meteo.com/v1/marine?latitude=<lat>&longitude=<lon>&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&models=ecmwf_wam,ecmwf_wam025,ncep_gfswave016,ncep_gfswave025,meteofrance_wave,dwd_gwam,dwd_ewam&forecast_days=2`

### Playa Venao (req 7.42, −80.19 → grid 7.4165, −80.1527)

| Model | Swell H (m) | Swell T (s) | Dir (°) |
|---|---|---|---|
| ecmwf_wam | *null* | *null* | *null* |
| ecmwf_wam025 | *null* | *null* | *null* |
| ncep_gfswave016 | 0.64 | 15.5 | 206 |
| ncep_gfswave025 | 0.66 | 15.5 | 204 |
| meteofrance_wave | 0.78 | 11.6 | 212 |
| dwd_gwam | 0.86 | 10.05 | 203 |
| dwd_ewam | *null* | *null* | *null* |

Height range 0.64–0.86 m (**30 % of the mean**). Period range **10.05 s to 15.5 s (41 %)**.

### All five spots, same valid time

| Spot | Models w/ data | H range (m) | H range/mean | T range (s) | Dir range (°) |
|---|---|---|---|---|---|
| Playa Venao | 4/7 | 0.64–0.86 | 30 % | 10.1–15.5 | 203–212 |
| Santa Catalina | 4/7 | 0.00–0.92 | 179 % | 0.0–15.4 | 0–211 |
| Morro Negrito | 4/7 | 0.00–0.84 | 162 % | 0.0–11.8 | 0–222 |
| Playa Malibu / Coronado | 4/7 | 0.16–0.32 | 70 % | 5.8–15.8 | **78–193** |
| Bocas del Toro | 4/7 | 0.00–1.30 | 155 % | 0.0–8.2 | 0–51 |

## 8.3 Three hard findings from that table

**Finding 1 — three of seven models have no data at all on Panama's coast. [MEASURED HERE]**
`ecmwf_wam`, `ecmwf_wam025` and `dwd_ewam` returned `null` at **every one of the five spots**.
The two highest-resolution/most-respected global wave models in the list are simply absent
where we need them. The usable ensemble is **four members, not eight** — and two of those
four (`ncep_gfswave016` / `ncep_gfswave025`) are the same model at two resolutions, so the
effective number of *independent* opinions is closer to **three**. Any design that assumed
"blend eight models" is already wrong.

> **⚠ Direct correction to the project brief.** The working assumption circulated to the
> team was "~4 independent wave models (NOAA GFS-Wave, ECMWF IFS, ECMWF AIFS, DWD GWAM)
> plus GEFS ensemble spread, available day one." **Measurement says otherwise:** ECMWF's
> wave output is `null` at every Panama coastal point I tested, so the real day-one set is
> **NOAA GFS-Wave (×2 resolutions), Météo-France MFWAM, and DWD GWAM ≈ three independent
> opinions.** Additionally, **GEFS-Wave ensemble access was never verified** in this
> research and should be treated as **UNVERIFIED** until someone pulls it — nothing in the
> confidence design (section 14.3) depends on it, by design. Plan against three models, not
> five.

**Finding 2 — some models return a fake zero, and it will poison a naive average. [MEASURED HERE]**
At Santa Catalina, `ncep_gfswave016` returned `H=0.00, T=0.00, dir=0` simultaneously. Same
pattern at Morro Negrito (`ncep_gfswave025`) and Bocas del Toro (`ncep_gfswave025`). A
simultaneous zero in all three fields is the signature of a **land-masked grid cell**, not a
flat ocean. The API does not flag it; it looks like a valid number.

> **Engineering consequence:** any spot-score pipeline **must** treat
> `H == 0 && T == 0` as *missing*, not as *flat*. A naive `mean()` over the four members at
> Santa Catalina reports ~0.5 m when the three models that can actually see water say
> 0.48–0.92 m. This single bug would make the app confidently wrong in exactly the way the
> owner's cousin complains about. This is a concrete, already-verified defect to guard
> against on day 1, with a unit test.

**Finding 3 — the disagreement is worst in the variable that matters most. [MEASURED HERE]**
At Playa Venao the models agree reasonably on height (0.64–0.86 m) and almost perfectly on
direction (203–212°), but split **10.05 s vs 15.5 s on period.** Per the wave physics in
section 1, period is not a minor attribute — deep-water wavelength goes as `T²` and energy
flux goes as `H²T`.

Working the *actual* member values gives a result that is more interesting than a simple
"one is bigger" (section 1.2 has the full table): `dwd_gwam`'s 0.86 m @ 10.05 s and
`ncep_gfswave016`'s 0.64 m @ 15.5 s carry **almost the same total energy flux** (7.3 vs
6.2 kW/m, within 15 %) — but they describe **completely different waves**: a 158 m
wavelength short-period windswell versus a 375 m long-period groundswell that starts
shoaling in 200 m of water instead of 50 m, and will wrap, focus and break with far more
shape. Those two forecasts describe **two different days**, and both are on the screen at
once. **"Same energy, different wave" is exactly the distinction a single height number
destroys.**

At Playa Malibu it is worse: `meteofrance_wave` says the swell is **78°** (out of the
Caribbean-facing quadrant, i.e. essentially not a Pacific groundswell at all) while
`dwd_gwam` says **193°** (a classic S/SSW groundswell). Those are **115° apart** — the
difference between a swell that lights the spot up and one that is blocked entirely.

## 8.4 So: is inter-model spread a valid confidence signal?

> ⚠️ **SUPERSEDED IN PART — read §3.6 before building anything from this section.**
> The later section titled "3.6 CORRECTION to sections 8.4 and 14.3 — spread is weaker than
> I implied" cites four studies showing spread is a weak skill predictor, downgrades it to a
> qualitative flag, and says to remove it entirely if it fails the §10.2 calibration check.
> Pointer added 2026-08-08 after a reader hit this section and §14.3 without ever reaching the
> correction, which sits near the end of the file. Where the two disagree, §3.6 wins.

**[ESTABLISHED PRACTICE, with an important caveat]** Using the spread of an ensemble as a
proxy for forecast uncertainty is standard operational meteorology, and comparing several
agencies' deterministic runs is the long-standing "poor man's ensemble." The relationship
between spread and skill is real but **statistically modest** — it is a good predictor of
*whether today is a high- or low-uncertainty day on average*, not a calibrated error bar for
any individual forecast. (Literature detail and actual correlation numbers are being
gathered in the section-3/8 research pass; see section 3 when appended.)

**[DERIVED]** The honest product framing:

- **Use spread to gate the confidence label, not to compute the number.** High spread ⇒ say
  "models disagree a lot today, treat this as a maybe." Low spread ⇒ "all models line up."
- **Never present the ensemble mean as if it were more accurate than the best member.**
  With ~3 independent members and no verification data (section 0), we cannot know which
  member is best in Panama, so the mean is a reasonable default — but it is a *default*,
  not a demonstrated improvement.
- **Report spread in the variable, not just overall.** "They agree on size but disagree on
  period" is genuinely actionable to a surfer and is exactly what happened at Venao today.

**[SPECULATIVE]** A concrete confidence term for the score, defined in section 7.

---

<!-- SECTIONS 1-7, 9-11 APPENDED AS RESEARCH LANDS -->

---

# 5. The human-in-the-loop flywheel — the part that is genuinely the answer

Given section 0 (no buoys, ever), this is not one option among several. It is the only
mechanism by which this app can ever become more *accurate* than the models it reads.

## 5.1 The right statistical framing

**[DERIVED]** Model the residual, not the wave. For spot `s`, let the model predict `Ĥ`
and reality be `H`. The residual is

```
r = H − Ĥ ,     r ~ N(b_s , σ²)
```

`b_s` is the **persistent, learnable** part — the systematic offset caused by refraction
focusing, headland shadowing, or a reef that the 16–25 km grid cell cannot see. `σ` is the
**irreducible** part — day-to-day model error plus the noise in a human eyeballing wave
height from the beach. A bias term can fix `b_s`. Nothing can fix `σ`.

This framing matters because it sets a hard ceiling on the whole AI claim: **we can remove
the part of the error that is consistent at a spot, and none of the part that is not.**

## 5.2 How many ratings before a per-spot correction beats raw model output?

**[DERIVED]** This has a clean closed form and I have not seen it stated anywhere for surf,
so treat the derivation as mine and the arithmetic as checkable.

Raw model expected squared error at the spot:

```
E[(H − Ĥ)²] = b² + σ²
```

Corrected with `b̂ = mean(r_1..r_n)`, whose standard error is `σ/√n`:

```
E[(H − Ĥ − b̂)²] = σ² + σ²/n
```

Correcting beats not correcting when `σ²/n < b²`, i.e.

```
        ┌─────────────────┐
        │   n > (σ / b)²  │
        └─────────────────┘
```

**The number of ratings you need is the square of the noise-to-bias ratio.** Worked values:

| Persistent bias `b` | Noise `σ` | Ratings needed to help |
|---|---|---|
| 0.30 m | 0.40 m | **> 2** |
| 0.20 m | 0.40 m | **> 4** |
| 0.15 m | 0.50 m | **> 11** |
| 0.10 m | 0.50 m | **> 25** |
| 0.05 m | 0.50 m | **> 100** |

And to *pin* the bias to a stated precision (`n = (1.96σ/δ)²`):

| Noise `σ` | Target precision | Ratings |
|---|---|---|
| 0.40 m | ±0.15 m | 27 |
| 0.40 m | ±0.10 m | 61 |
| 0.50 m | ±0.10 m | 96 |

**Read this as the good news it is:** if a Panama spot has a real, chunky systematic bias —
and section 8's measurements plus the refraction/shadowing physics say several will — then
**on the order of 10 to 30 honest ratings per spot is enough to start beating the raw
model there.** That is one season of a small local crew, not a research programme. Roughly
**60 ratings** pins a spot's offset to ±10 cm.

This is the single most encouraging number in the document, and it is why the feedback
loop is worth building properly rather than bolting on.

## 5.3 What model to fit — start much smaller than you want to

**[DERIVED]** In increasing order of data hunger:

| Model | Params/spot | Ratings needed | Verdict |
|---|---|---|---|
| **Per-spot constant bias** `b_s` | 1 | ~10–30 | **Build this first.** Best value per unit of data by a wide margin. |
| Per-spot linear correction `H = α_s + β_s·Ĥ` | 2 | ~50–100 | Second. Captures "the model is fine when small, way off when big." |
| Per-spot **ordinal logistic** on good/not-good | 2–4 | ~30–50 spanning both classes | Good for the "was it good" target directly. Needs ~10–20 events per predictor in each class. |
| Global gradient-boosted tree + spot ID | ~8 features | **hundreds–thousands** | Later. Across all spots pooled, not per-spot. |
| Per-spot GBM | ~8 features | thousands **per spot** | **[HYPE / KILL]** 30 spots × ~1,000 = 30,000+ ratings. Will not happen. Do not design for it. |

A per-spot gradient-boosted tree is the thing an engineer instinctively reaches for and it
is the wrong tool at this data scale. **A single number per spot will carry most of the
available gain.**

## 5.4 Solving cold start properly — partial pooling

**[ESTABLISHED PRACTICE — standard multilevel modelling / empirical Bayes; applied to surf here is [SPECULATIVE]]**

The cold-start problem has a textbook answer that fits this situation exactly. Do **not**
fit each spot independently. Fit a **global** residual term plus a **shrunken per-spot**
deviation:

```
b̂_s(shrunk) =  ( n_s / (n_s + τ) ) · b̂_s   +   ( τ / (n_s + τ) ) · b_global
```

where `τ = σ² / σ²_between` is the shrinkage constant (within-spot noise over between-spot
bias variance).

Why this is the right structure:

- **At `n_s = 0`** the formula returns `b_global` exactly. A brand-new spot with zero
  ratings automatically inherits the correction learned from every other spot in the
  country — e.g. "the global models systematically under-read period on this coast."
  **Cold start is not a special case; it is the `n=0` limit of the same equation.**
- **As `n_s` grows** the spot peels away from the global mean at a rate justified by how
  much data it has. No hand-tuned "wait until 50 ratings then switch" threshold.
- **It cannot blow up on one loud user.** A single wild rating at a new spot moves
  `b̂_s(shrunk)` by `1/(1+τ)` of its raw effect, not by all of it.

**[DERIVED]** This one equation is the honest technical core of the "AI learns your local
break" claim. It is defensible, it is small, and it works from day 1.

## 5.5 Designing the rating form so the data is actually usable

**[DERIVED]** The statistics above only work if what users submit is comparable across
people. Three design rules that follow directly from the math:

1. **Ask for the residual, not the absolute.** "Bigger or smaller than forecast?" on a
   5-point scale is far less noisy between users than "how big was it in metres" — it
   cancels each user's personal size-inflation constant. Asking for both lets you
   calibrate one against the other.
2. **Ask about wind separately from quality.** The whole point is decomposing *why* a day
   was bad. A single "was it good 1–5" cannot tell you whether the model got the swell
   wrong or the sea breeze wrong, and those are corrected by different terms.
3. **Capture the timestamp and the user ID.** Section 10's ranking metric requires knowing
   which ratings came from the same person on the same day. Without user ID the single
   most valuable evaluation metric is not computable. This is a cheap thing to get right
   at the start and expensive to retrofit.

---

# 7. The deterministic scoring function

**[DERIVED throughout.]** The formula below is my construction. The *structure* follows
standard practice (bounded sub-scores, gates vs trade-offs); the **coefficients are unfit
priors** — reasonable starting guesses that must be replaced by fitted values once section
5's ratings exist. Presenting these constants as tuned would be exactly the false precision
this report exists to prevent.

Per-spot constants (`θ_n`, swell window, `H_ref`, tide optimum) must come from
`10-panama-surf-spots-domain.md`. **They are deliberately not invented here.**

## 7.1 Design principle: gates vs trade-offs

The central failure of a naive weighted sum — and the direct cause of the cousin's two-hour
drive — is that it lets a great swell **compensate** for a ruined wind. In an additive
score, `0.9 × swell + 0.1 × wind` still reads "good" when it is 25 kt onshore and unsurfable.

So: **swell direction is a hard gate** (no swell in the window = no waves, and nothing
compensates). Size, wind and tide **trade off geometrically**, so a near-zero in any one of
them drags the whole score down hard rather than being averaged away.

## 7.2 The sub-scores

### (a) Swell direction — the gate

Let `Δ` = angular distance in degrees from swell direction `θ_s` to the nearest edge of the
spot's window `[θ_min, θ_max]` (`Δ = 0` if inside). Then

```
S_dir = exp( −(Δ / σ_dir)² ) ,     σ_dir ≈ 20°
```

Inside the window → 1.0. 20° outside → 0.37. 40° outside → 0.02. Energy wrapping into a
spot from outside its window falls off fast, so a steep Gaussian is the right shape.

### (b) Effective size — period-weighted, *never* raw Hs

This is the term that encodes "1.5 m at 16 s is a different wave than 1.5 m at 8 s."
Score the **energy the swell actually delivers**, not the offshore significant height.

**[DEMONSTRATED]** From the verified deep-water relations in section 1.2
(`https://www.coastalwiki.org/wiki/Shallow-water_wave_theory`, accessed 2026-08-08):

```
P = E·c_g = (ρgH²/8)·(gT/4π)      ⇒   P ∝ H²·T
```

Define the **energy-flux-equivalent height at a reference period** `T_ref` (10 s is a
convenient choice) — the height a `T_ref` swell would need to carry the same energy flux:

```
        ┌──────────────────────────────────┐
        │   H_eff = H · (T / T_ref)^(1/2)  │
        └──────────────────────────────────┘
```

This is **derived from the cited physics, not fitted** — `H_eff² · T_ref ∝ H² · T` by
construction. Sanity check: 1.5 m @ 16 s → `H_eff` = 1.90 m; 1.5 m @ 8 s → 1.34 m; ratio
√2, exactly matching the 2× energy-flux ratio in section 1.2's table.

> **Optional refinement, flagged as unpinned:** longer-period swell also *shoals* more (it
> feels bottom in deeper water, section 1.2), so true breaking height carries a period
> dependence **beyond** energy flux. That would extend the exponent to `(1/2 + ε)` with
> `ε ≈ 0–0.3`. **Ship with `ε = 0`** — that version is fully justified by a source I
> retrieved. Raise `ε` only against a breaker-height citation, and treat it as a fitted
> parameter for the learning loop rather than a constant.

Then a log-normal bump around the spot's best size, which correctly penalises **too big**
as well as too small:

```
S_size = exp( −½ · ( ln(H_eff / H_ref) / s_size )² ) ,   s_size ≈ 0.5
```

### (c) Wind — offshore-ness relative to the shore normal

The physically correct quantity is the wind component along the spot's shore normal `θ_n`.
With meteorological wind direction `φ` (direction wind blows *from*) and speed `W`:

```
u_off   = − W · cos(φ − θ_n)      > 0 offshore (good), < 0 onshore (bad)
u_cross =   W · |sin(φ − θ_n)|    cross-shore magnitude
```

Three separate penalties, one expression:

```
S_wind = exp[ − ( max(0, −u_off) / k_on )²        ← onshore kills fast
              − ( max(0, u_off − u*) / k_off )²   ← too much offshore also bad
              − ( u_cross / k_cross )² ]          ← side-shore chop
```

with **unfit priors** `u* ≈ 5 kt` (light-offshore optimum), `k_on ≈ 6 kt`,
`k_off ≈ 15 kt`, `k_cross ≈ 12 kt`.

Note `k_on` (6) is deliberately less than half `k_off` (15): onshore wind destroys a spot
far faster than offshore wind does. That asymmetry is the whole point of the term.

### (d) Tide

```
S_tide = exp( −½ · ( (η − η_opt) / σ_tide )² )
```

`η` = tide height (or normalised 0–1 stage), `η_opt` = spot optimum. `σ_tide` is **narrow
for a shallow reef and wide for a beachbreak** — this single per-spot number is what
encodes "this reef only works on the push."

## 7.3 Combining — gate × weighted geometric mean

```
        ┌──────────────────────────────────────────────────────────────┐
        │  Q = S_dir · ( S_size^w1 · S_wind^w2 · S_tide^w3 )^(1/Σw)    │
        └──────────────────────────────────────────────────────────────┘

   unfit priors:  w1 (size) = 0.4 ,  w2 (wind) = 0.4 ,  w3 (tide) = 0.2
```

**Wind is weighted equal to size on purpose.** That is the entire lesson of "the tracker
said perfect and it was garbage": the size was usually right and the wind was what ruined
it. Any scoring function that treats wind as a minor modifier will reproduce the exact
failure this app exists to fix.

Final displayed score `= 100 · Q`, with the four sub-scores retained and shown, so the UI
can always answer *why*: "Wind 0.18 — that's what killed it."

## 7.4 The human-feedback correction, bolted on

From section 5.4, applied at the score level:

```
Q_final = clip( Q + δ_s(shrunk) , 0 , 1 )
```

`δ_s(shrunk)` starts at the global offset (≈0) and moves as ratings arrive. **Ship the
scoring function with this term wired in and set to zero** — retrofitting it later means
re-deriving every displayed number.

## 7.5 Confidence is reported **beside** the score, never multiplied into it

**[DERIVED]** A common and damaging design error is folding uncertainty into the quality
number. It makes *a confidently-bad day* and *an uncertain-good day* render identically,
which destroys the one thing the user needs. Keep them orthogonal:

```
C = exp[ −(CV_H / c1)² − (CV_T / c2)² − (Δdir / c3)² ] · f(M)
```

`CV_H`, `CV_T` = coefficient of variation of height and period across the usable ensemble
members; `Δdir` = circular range of member directions; `f(M)` penalises a thin ensemble
(`M < 2` ⇒ cap `C` at 0.4). Unfit priors `c1 ≈ 0.25`, `c2 ≈ 0.20`, `c3 ≈ 30°`.

**Worked example on the real numbers measured in section 8.2 (Playa Venao, 2026-08-08):**

```
H = [0.64, 0.66, 0.78, 0.86]  → mean 0.735, CV_H = 0.122
T = [15.5, 15.5, 11.6, 10.05] → mean 13.16, CV_T = 0.182
dir range = 9°

penalty terms:   height 0.239   period 0.832   direction 0.090
C = exp(−1.161) = 0.31
```

**31 % confidence, and 72 % of the penalty comes from the period disagreement alone.**
The user-facing string writes itself and is *true*:

> "Models agree on size and direction but split badly on period — one says 10 s windswell,
> another says 15.5 s groundswell. Low confidence. If it's the 15.5 s, it's on."

That is a genuinely better product than any competitor showing a single confident number,
and it required no machine learning whatsoever.

---

# 10. Evaluation — how we would know any of this works

Without this section the AI claim is unfalsifiable marketing. This is the part to build
**before** the clever parts.

## 10.1 The baselines that must be beaten

**[DERIVED]** A metric with no baseline is a vanity number. Every result must be reported
as a **skill score** relative to at least these three:

| ID | Baseline | Why it is included |
|---|---|---|
| **B0** | **Climatology** — always predict the spot's historical mean rating | Embarrassingly hard to beat, and the honest floor. If we can't beat B0, we know nothing. |
| **B1** | **Raw model** — rank spots by `best_match` significant wave height | This is literally "the tracker" the cousin already distrusts. **This is the one that matters.** |
| **B2** | **Persistence** — today = yesterday's actual | Cheap, and strong on multi-day swells. |

```
Skill = 1 − (Error_ours / Error_baseline)     — positive means better, 0 means no better
```

## 10.2 Three metrics, in order of how much they matter

**1. Pairwise spot-ranking accuracy — THE metric. [DERIVED]**

A "comparison event" is one user rating **two or more spots on the same day**. For each
pair, did we order them correctly? Random = 50 %.

This is the metric because it is *exactly the cousin's decision*. He does not need to know
it will be 1.2 m. He needs to know which of the three spots he can drive to is the one to
pick. It is also robust to the biggest weakness in our data: users' personal size-inflation
constants cancel within a single user's own comparisons.

Exclude pairs whose ratings differ by <1 point (genuine ties carry no signal).

**Sample size** (two-proportion, 80 % power, α = 0.05):

| Baseline accuracy | Lift to detect | Comparison pairs needed |
|---|---|---|
| 60 % | +10 pts (→70 %) | **~380** |
| 55 % | +10 pts (→65 %) | **~390** |
| 60 % | +5 pts (→65 %) | ~1,500 |

**~400 same-day multi-spot comparisons is enough to prove a 10-point lift.** That is a
realistic target for a local community in a season, and it is the number the project should
be organised around.

**2. Brier score on "was it good?" [ESTABLISHED PRACTICE]**

Convert rating ≥4 to a binary outcome, have the app emit a *probability*, score it with the
Brier score (a proper scoring rule — it cannot be gamed by hedging). Cheapest to collect and
most robust to noisy labels. Also directly validates the **confidence** term from 7.5: bin
predictions by stated confidence and check that high-confidence days really are more often
right. **A confidence number that doesn't survive this check is a lie and should be removed.**

**3. MAE on wave height. [ESTABLISHED PRACTICE]**

Weakest of the three, because the "truth" is a human eyeball estimate. Useful for tracking
the per-spot bias term `b_s`, not for headline claims. Report it, don't lead with it.

## 10.3 Concrete protocol

**Backtest (possible before any users exist, partially).**
Open-Meteo exposes `era5_ocean` reanalysis (0.5°, ~5-day delay) per section 8.1. That gives
a historical archive to replay the scoring function against — but **with no observations
(section 0) it can only verify the pipeline runs and the scores are stable, not that they
are right.** Say so plainly; do not call this validation.

**Live A/B (the real test).**
- Log, for every user session: the deterministic score, the confidence, the LLM narration,
  and the raw-model baseline ranking — **for every spot, every day, whether or not anyone
  looked at it.** Retroactive evaluation is impossible without this log, and it costs
  almost nothing to write.
- Randomise nothing user-facing at first. Both rankings are computed server-side; only one
  is shown. The comparison is offline and free of experiment risk.
- Report monthly: ranking accuracy (ours vs B0/B1/B2), Brier score + calibration curve, and
  bias-term convergence per spot.

## 10.4 The honesty rule

**[DERIVED]** Until ~400 comparison pairs exist, the app must not claim to be more accurate
than any other forecast. It may claim to be **better organised, better explained, and more
honest about uncertainty** — all three are true on day 1 and none require a single rating.
Making an accuracy claim before the metric supports it is precisely the behaviour that made
the cousin stop trusting forecasts in the first place.


---
---

# PART II — FORECAST VERIFICATION AND THE LEARNING LOOP

> Added after the owner sharpened the brief twice: (1) "find out whether the forecasts are
> actually right, and give good answers to *is the surf good*", and (2) "I NEED the website
> to be using a model that learns from community posted data points so it gets even more
> accurate over time — that's literally the foundation of this."
>
> This part is the centrepiece. Everything in Part I supports it.

---

# 12. Ground truth in Panama — the complete, measured inventory

Verification and learning both need ground truth. Section 0 established there are no wave
buoys. Here is the full accounting, measured rather than assumed.

## 12.1 Wind: real observations exist, but not at a single surf spot

**[MEASURED HERE]** Wind is the most important local variable (section 7.3) and the one
global models get most wrong nearshore (sea breeze, section 1). So: is there real wind truth
in Panama? I queried NOAA's aviation weather METAR service station by station.

Source: `https://aviationweather.gov/api/data/metar?ids=<ICAO>&format=raw&hours=6` (all accessed 2026-08-08)

| ICAO | Station | Live? | Sample observation (2026-08-08 17:00Z) |
|---|---|---|---|
| **MPBO** | Bocas del Toro (Caribbean) | **YES, hourly + SPECI** | `30007KT` — plus sub-hourly SPECI during squalls |
| **MPDA** | David (Pacific west, inland) | **YES, hourly** | `22005KT` |
| **MPTO** | Tocumen, Panama City | **YES, hourly** | `08006KT 030V110` |
| **MPMG** | Marcos A. Gelabert, Panama City | **YES, hourly** | `34011KT 310V020` |
| **MPPA** | Panamá Pacífico (Howard), Panama City | **YES, hourly** | `34013KT 320V020` |
| **MPRH** | **Río Hato** | **NO DATA RETURNED** | — |
| MPCE, MPJE, MPSA, MPCH | various | NO DATA RETURNED | — |

**Two corrections to the working assumption, both important:**

1. **Río Hato (MPRH) is dead.** It was named in the brief as one of three coastal stations.
   It returned nothing over a 6-hour window. Anything planned around Río Hato wind truth
   needs to be re-planned. *(Flagged for `06-general-weather-apis.md`.)*
2. **The live stations are not where the surf is.** Three of the five (MPTO, MPMG, MPPA) are
   clustered in the Panama City metro area and are effectively one observation point.
   The real coverage is: **one Caribbean point (MPBO), one western point (MPDA), one
   Panama City cluster.**

**There is no wind observation on the Azuero Peninsula (Playa Venao), none at Santa
Catalina, none at Morro Negrito.** The best surf in the country has zero wind ground truth.

**[DERIVED] What this is still good for — and it is genuinely useful:**

- **MPBO is directly usable for Bocas del Toro surf.** It is a real, hourly, free wind
  observation essentially at the spot. Bocas is the one region where we can run true
  MOS/Kalman wind bias correction (section 3) from day 1. **Do that — it is free skill.**
- **MPDA and the Panama City cluster can validate the models' *sea-breeze behaviour* as a
  class.** If the models are shown to systematically under-predict afternoon onshore wind
  at all three independent locations, that is strong evidence the same error applies at
  Venao, and it justifies a **regional** sea-breeze correction applied to spots with no
  station. This is the partial-pooling idea (section 13.4) applied to wind.
- **SPECI reports at MPBO are a bonus:** they fire on rapid change, which is exactly the
  squall/wind-shift event that ruins a session.

## 12.2 The complete ground-truth inventory, rated

| Source | Covers | Latency | Verdict for verification |
|---|---|---|---|
| **User reports + photos** (WhatsApp community, ~500 people) | Any spot, if they post | Minutes–hours | **THE primary source. Only spot-level truth that will ever exist.** |
| METAR MPBO | Bocas wind | ~hourly | **Strong**, real, free, at-spot |
| METAR MPDA / MPTO / MPMG / MPPA | Wind, off-spot | hourly | **Moderate** — regional wind-regime validation only |
| Tide gauges / harmonics | Tide | predicted | **Strong** but not a forecast being verified — tide is ~deterministic |
| NDBC buoys | nothing near Panama | — | **Useless here** (section 0) |
| Satellite altimetry | offshore Hs | days | **Weak** — coastal blind zone, multi-day revisit; cannot verify a break |
| Surf webcams | 2 of 16 spots, 1 offline, ToS forbids automated capture | — | **Effectively unavailable** (per peer research) |

**Honest conclusion:** for wave quality at a Panama surf spot, **human reports are not one
source among several. They are the only one.** For wind at Bocas, we have a second,
machine-readable one. That is the entire dataset.

---

# 13. The learning loop — the actual architecture

## 13.1 The immutable prediction log — the non-negotiable prerequisite

**[DERIVED]** This is the single highest-priority piece of engineering in the entire
project, and it is not a model, it is a table.

**Why it must exist from day 1:** to compute "was the forecast right", you need what the
forecast *said at the time it said it*. NOAA and the other agencies do not keep old runs
conveniently retrievable, and a forecast **cannot be reconstructed retroactively** — a
re-fetch tomorrow returns tomorrow's opinion about yesterday, which is a different and much
more accurate thing. **Every day this is deferred is a day of training data that can never
be recovered.**

> **If this is deferred to v2, the learning loop's start date is the day it ships, not the
> day the app launches.** There is no way to backfill. This is the whole ballgame.

### Record schema

```
prediction_log
────────────────────────────────────────────────────────────────────
  spot_id             text        -- FK to spot table
  source              text        -- 'ncep_gfswave016' | 'dwd_gwam' | 'meteofrance_wave' | ...
  run_ts              timestamptz -- model CYCLE time (00/06/12/18Z) — NOT fetch time
  valid_ts            timestamptz -- the hour being forecast
  lead_h              int         -- GENERATED: (valid_ts - run_ts) in hours
  fetched_ts          timestamptz -- when we pulled it (audit/debug)
  swell_h_m           real
  swell_t_s           real
  swell_dir_deg       real
  wind_speed_kt       real
  wind_dir_deg        real
  secondary_swell_*   real        -- keep them; they matter (section 1)
  tide_m              real
  score_q             real        -- OUR computed score at prediction time
  score_confidence    real        -- OUR stated confidence at prediction time
  land_masked         bool        -- TRUE if H=0 & T=0 (section 8.3, Finding 2)
────────────────────────────────────────────────────────────────────
  PRIMARY KEY (spot_id, source, run_ts, valid_ts)
  IMMUTABLE: insert-only. Never UPDATE. Never DELETE.
```

**Two fields people forget and then regret:**

- **`score_q` and `score_confidence` must be stored, not recomputed.** If the scoring
  formula changes in March, every pre-March score recomputed with the new formula is a lie,
  and you lose the ability to prove the app improved. Store what you actually showed.
- **`land_masked`** — record the defect from section 8.3 rather than silently dropping the
  row, so you can later measure how often each source is unusable per spot.

### Why lead time must be a first-class dimension

**[ESTABLISHED PRACTICE]** Forecast skill decays with lead time — this is the most basic
result in forecast verification. A 6-hour-ahead forecast and a 5-day-ahead forecast are
different products with different error distributions.

**[DERIVED] The practical consequence is a statistical trap:** if you pool all lead times
into one per-spot bias estimate, the number you get is a weighted average over whatever mix
of lead times happened to be in your sample. Change the mix (e.g. users start checking the
app the night before instead of a week out) and your "learned" bias silently shifts,
with no bug and no warning. **Always stratify by lead time**, at minimum into buckets:
`0–12h`, `12–24h`, `24–48h`, `48–96h`, `96h+`.

Expect — and this is the honest framing — that **the correction will be strongest and most
learnable at short lead times**, where model error is dominated by the systematic local
effects we can actually learn, rather than by chaotic large-scale error we cannot.

### Storage volume — this is not a cost problem

**[DERIVED]** 40 spots × 4 usable sources (section 8.3: it is 4, not 8) × 4 runs/day ×
168 forecast hours:

| Granularity | Records/day | Records/year | Compact JSON | **Parquet (compressed)** |
|---|---|---|---|---|
| Full fidelity (4 runs, 168 lead-h) | 107,520 | 39.2 M | 7.1 GB/yr | **0.47 GB/yr** |
| Lean (1 run/day, 8 lead buckets) | 30,720 | 11.2 M | 2.0 GB/yr | **0.14 GB/yr** |

At S3 Standard (~$0.023/GB/month), **full fidelity costs about $0.01/month in year one and
roughly a dime a month by year five.** Storage is a non-issue; do not compromise fidelity
to save it.

**Recommended physical format:** **Parquet, partitioned `s3://…/predictions/dt=YYYY-MM-DD/`**,
one file per day, columnar. Rationale: the query pattern is analytic ("all predictions for
spot X, source Y, lead bucket Z over 90 days"), which is exactly what columnar formats and
partition pruning are for; it compresses ~15× better than JSON on this highly repetitive
numeric data; and it is readable by DuckDB/Athena/pandas with no server. Partition by date
(not spot) because retention and backfill are date-scoped, and 40 spots is small enough to
filter within a file.

Keep a **hot copy of the last ~10 days in Postgres/SQLite** for the live app, and treat
Parquet on S3 as the immutable archive of record.

## 13.2 The observation record — what we ask humans for

**[DERIVED, with a clear tradeoff]** Every field added increases label quality and decreases
submission count. Since our entire training signal is human submissions, **submission count
is the binding constraint** — and the math in section 5.2 says a mere 10–30 observations per
spot starts paying off, so we should optimise hard for volume first.

### Recommended form: one screen, ~4 taps, <15 seconds

| # | Field | Type | Why |
|---|---|---|---|
| 1 | **"Compared to the forecast?"** | 5-way: *Way smaller / Smaller / Spot on / Bigger / Way bigger* | **The single most valuable field.** It is the residual directly (section 5.1), and it cancels each user's personal size-inflation constant. |
| 2 | **"How was it?"** | 4-way categorical: *Bad / OK / Good / Epic* | The quality label for the Brier metric |
| 3 | **"Wind?"** | 3-way: *Clean / Bumpy / Blown out* | Separates swell error from wind error — the whole diagnostic point |
| 4 | *(optional)* photo | image | Enables section 9 vision checks + dispute resolution |
| — | auto-captured | spot, timestamp, user id, the live forecast + confidence at that moment | Non-negotiable; see 5.5 |

### Why not 1–5 stars

**[DERIVED]** Three concrete statistical problems with a 5-star scale here, which is why I
recommend against it:

1. **It is ordinal, not interval.** The distance from 1→2 is not the distance from 4→5, so
   averaging stars is not a meaningful operation, even though everyone does it.
2. **Per-user offset dominates.** One surfer's 3 is another's 5. With few observations per
   spot, between-user variance can swamp the between-spot signal we are trying to learn.
3. **Stars collapse to a bimodal distribution in practice** — people give 5s and 1s. You
   end up with a noisy binary anyway, so ask for the categorical directly and get a cleaner
   label.

**The "compared to forecast" field is the fix for all three at once**, because it is
inherently a *difference*, so each user's constant cancels out of their own report.

### Inter-observer variability, and how to actually handle it

**[DERIVED]** Two surfers rate the same session differently. Model each user's report as

```
report = truth + u_user + ε        u_user ~ N(0, σ²_user)
```

- `u_user` is a **per-user offset** — the person who always says it's bigger than it was.
  This is estimable exactly like a per-spot bias: with `n` reports from a user across many
  spots, their offset converges as `σ/√n`, and it should be **shrunk toward zero** for
  low-volume users (same partial-pooling machinery as 13.4).
- **How many users per spot before it averages out?** With per-user offsets of comparable
  size to the noise, the mean of `k` *different* users' reports has offset error ~`σ_user/√k`.
  **`k ≈ 4–9 distinct users` cuts observer bias by half to two-thirds.**
  **Design rule: prefer 8 reports from 8 people over 20 reports from 2 people.** The system
  should actively count *distinct reporters*, not reports, when deciding whether a spot's
  correction is trustworthy.

## 13.3 The per-source, per-spot scorecard

**[DERIVED]** This is the product feature nobody else shows, and the owner is right that it
is compelling. It falls straight out of the prediction log joined to observations.

```
source_spot_scorecard   -- one row per (spot, source, lead_bucket, variable), rolling
────────────────────────────────────────────────────────────────
  spot_id, source, lead_bucket, variable        -- key
  n_obs                     int      -- how many verified pairs
  n_distinct_reporters      int      -- the number that actually gates trust (13.2)
  bias                      real     -- mean(forecast − observed)   ← signed, the headline
  mae, rmse                 real
  bias_se                   real     -- σ/√n  — the uncertainty ON the bias
  skill_vs_climatology      real
  skill_vs_persistence      real
  skill_vs_best_model       real
  last_obs_ts               timestamptz  -- feeds the confidence term (14.3)
  window                    text     -- '30d' | '90d' | 'all'
────────────────────────────────────────────────────────────────
```

This directly produces the owner's example string — but with the honesty guard attached:

> "At Santa Catalina, GFS-Wave has run **25 % too big for 30 days** (n=34 reports from 11
> people, ±6 %). We're discounting it."

**The `bias_se` column is what stops this being a lie.** With n=3 you can compute a 25 %
bias and it means nothing. **Never display a scorecard claim whose `bias` is smaller than
`2 × bias_se`** — that is a statement indistinguishable from noise.

## 13.4 Staged learning architecture — with the thresholds the owner is waiting on

**[DERIVED throughout — the arithmetic is from section 5.2, `n > (σ/b)²`.]** Each stage is
independently useful and ships on its own.

| Stage | What it learns | Params | **Observations needed (per spot)** | Honest claim at this stage |
|---|---|---|---|---|
| **0** | Nothing. Physics score + ensemble confidence only. | 0 | **0** | "Better organised and more honest than anyone else." **No accuracy claim.** |
| **1** | **One scalar bias per (spot, source, lead bucket)** | 1 | **~10–30** *(≥5 distinct reporters)* | "We've measured that this model runs big here, and corrected for it." |
| **2** | **Conditional bias** — bias as a function of swell direction / tide / season / wind regime | ~4–8 | **~100–200** | "We know *when* this spot's forecast goes wrong." |
| **3** | Hierarchical Bayesian / partial-pooled regression across all spots | global + small per-spot | **~500–1,000 total across all spots** | "A real per-spot model." |
| **4** | Per-spot gradient-boosted trees | ~8 features | **thousands per spot** | **[HYPE / KILL]** — 40 spots × 1,000+ = will not happen. Do not plan for it. |

**Stage 1 is the number the owner is waiting on: roughly 10–30 good reports per spot,
from at least ~5 different people, is enough to measurably beat the raw model at that spot.**
For ~16 priority spots that is on the order of **300–500 total reports** — one active season
for a 500-person WhatsApp community. **This is achievable, and it is the honest headline.**

### Partial pooling — the right tool, explained plainly

**[ESTABLISHED PRACTICE — multilevel/hierarchical modelling, empirical Bayes; application to surf is [SPECULATIVE]]**

The problem: 40 spots, each with almost no data. Fitting 40 independent models overfits
wildly; fitting one global model ignores that spots genuinely differ. Partial pooling is the
standard answer and sits exactly between the two:

```
b̂_s(shrunk) = ( n_s / (n_s + τ) )·b̂_s  +  ( τ / (n_s + τ) )·b_global
```

Plain-language version for the owner:

> **A new spot starts out assuming it behaves like the average Panama spot. Every report it
> receives moves it a little further toward its own personality, and the speed it moves is
> set by how much data it has. A spot with 2 reports barely budges. A spot with 50 reports
> is basically running its own model.**

This is why cold start is not a special case needing special code — it is the `n_s = 0`
limit of the same formula. And it means **the 40th spot benefits from the first 39 spots'
data on the day it is added**, which is the compounding property the owner is describing.

### Overfitting guardrails — mandatory, not optional

**[DERIVED]** With tiny per-spot samples the risk of confidently learning noise is severe.
Four hard gates:

1. **Minimum-sample gate.** Apply no correction until `n_s ≥ 10` **and** `distinct_reporters ≥ 5`.
2. **Significance gate.** Apply the correction only if `|b̂_s| > 2 · bias_se`. Otherwise the
   measured bias is indistinguishable from zero — **refuse to correct, and say the spot has
   no measured bias yet.** A system that knows when not to act is the differentiator.
3. **Shrinkage always on.** Never use raw `b̂_s`; always the pooled form above. This alone
   prevents most small-sample blowups.
4. **Blocked cross-validation.** Validate by **held-out time blocks** (train on weeks 1–8,
   test on weeks 9–10), never random k-fold. Random splits leak, because consecutive hours
   of the same swell event are near-duplicates and will make a useless model look excellent.
5. **Clamp the correction.** Cap any applied bias at a physically sane bound (e.g. ±40 % of
   forecast height). A runaway correction from a troll or a mis-keyed report should be
   incapable of producing an absurd public number.

## 13.5 Feedback-loop hazards — three ways this quietly breaks

**[DERIVED]** These are the failure modes most likely to make the learning loop produce
confident garbage. Each has a named, standard fix.

### (a) Selection bias — the most serious one

People post when it is **good**. Our labels are therefore not a random sample of conditions;
they are conditioned on the outcome we are trying to predict. A bias term estimated only
from good days corrects the forecast **only for good days**, and will be wrong — possibly
in the opposite direction — on the flat and blown-out days when a user most needs to be told
*not* to drive two hours.

**Fixes, in order of practicality:**
1. **Actively solicit negative reports.** Push a notification to users who were *at* the
   spot (or who checked the forecast for it) asking "how was it?" regardless of outcome.
   Solicited reports are far closer to a random sample than volunteered ones.
2. **Weight by inverse propensity.** Model `P(report | conditions)` and weight each
   observation by `1/P`. Standard, and it needs no extra data collection — just the
   prediction log, which we have.
3. **Track the imbalance and publish it internally.** If 85 % of labels are "Good/Epic",
   every skill number is suspect and should be reported separately for good vs bad days.

### (b) The self-fulfilling loop — explore/exploit

If we always send everyone to the spot we rated highest, we only ever get labels for that
spot, and we never learn we were wrong about the others. **This is the classic
explore/exploit problem** — the recommendation policy corrupts the data it learns from.

**Practical fix [SPECULATIVE for this domain, standard elsewhere]:** do not randomise the
*recommendation* — that burns user trust. Instead:
- **Solicit** reports from the non-recommended spots ("nobody's checked Morro Negrito in 9
  days — if you're out there, tell us"). This decouples exploration from the recommendation.
- **Weight the confidence by data recency per spot** so a spot we have ignored honestly
  shows low confidence, which naturally invites someone to fill the gap.
- **Show the top 3, not the top 1**, with their scores — users self-distribute, and you get
  labels across all three.

### (c) Gaming, trolling and localism

Surf localism is real, and under-reporting conditions to keep a spot empty is a documented
cultural behaviour. A public "best spot today" feed creates a direct incentive to lie.

**Mitigations [DERIVED]:**
- **Per-user offset estimation (13.2) catches persistent liars automatically** — someone who
  always reports "way smaller" develops a large `u_user`, which is subtracted out. Sustained
  bias is self-correcting; this is a pleasant property of the model we already need.
- **Median, not mean**, when aggregating same-day reports for a spot — robust to a single
  outlier by construction.
- **Trust weight from agreement history.** Weight a user by how well their past reports
  agreed with the consensus of other reporters at the same spot/time. Down-weight, never ban.
- **Require the minimum-distinct-reporters gate (13.4)** before any correction — one person
  cannot move a spot's model, ever.
- **Photos raise the cost of lying** and are checkable (section 9).

---

# 14. "Is the surf good?" — the answer itself

## 14.1 "Good" is skill-dependent, and that is cheap to personalise

**[DERIVED]** 6 ft Santa Catalina is a great day for an expert and a genuine hazard for a
beginner. A single score cannot serve both, and averaging them serves neither.

**The cheap fix that needs almost no user data:** ask **one question at signup** —
*beginner / intermediate / advanced* — and use it to shift two constants already in the
scoring function (section 7.2):

- `H_ref` — the spot's "best size" reference, scaled down for beginners, up for experts.
- `s_size` — the width of the size bump: **narrow for beginners** (they have a small usable
  range) and **wide for experts** (they can surf most of it).

That is a **one-tap personalisation that reuses the existing formula with no new model and
no training data.** It is also honest: it changes what we recommend, not what we claim to know.

An optional second question — *shortboard / longboard / foamie* — shifts `T_min` and the
size reference again, since a longboarder wants the small long-period day the shortboarder
should skip.

## 14.2 The answer format — a call, not a dashboard

**[DERIVED]** The cousin's problem is a **decision under a two-hour driving cost**, not a
data-availability problem. He can already get numbers. Give him:

```
┌──────────────────────────────────────────────────────────────┐
│  GO TO SANTA CATALINA            ●●●○○  moderate confidence   │
│                                                              │
│  Best window: 6:00 – 9:30am                                  │
│                                                              │
│  Chest-high and clean early. Light offshore until the sea     │
│  breeze fills in around 10, then it's done for the day.       │
│                                                              │
│  Why not Venao: same swell, but it's onshore there by 8.      │
│                                                              │
│  ⚠ Models split on period (10s vs 15.5s). If it's the long-   │
│    period one it'll be a size bigger than this.               │
│                                                              │
│  Last real report: yesterday 4pm  ·  3 people                 │
└──────────────────────────────────────────────────────────────┘
```

Five required elements: **the one spot**, **the time window in hours**, **the plain reason**,
**the honest confidence**, **when we last heard from a human**. The "why not X" line is what
makes it feel like local knowledge rather than a lookup.

## 14.3 Confidence must be honest — the exact computation

> ⚠️ **SUPERSEDED IN PART — read §3.6 before building anything from this section.**
> The `C_spread` term below is the one the later section titled "3.6 CORRECTION to sections 8.4
> and 14.3 — spread is weaker than I implied" walks back. Ship confidence as a qualitative flag,
> not as this calibrated product, and drop the spread term entirely if it fails the §10.2
> calibration check. Pointer added 2026-08-08. Where the two disagree, §3.6 wins.

**[DERIVED]** Three independent inputs, multiplied because each is a necessary condition:

```
C_total  =  C_spread  ×  C_track_record  ×  C_freshness
```

**1. `C_spread`** — inter-model disagreement. Exactly the formula measured and worked in
section 7.5. *(Venao today: 0.31.)*

**2. `C_track_record`** — how well we have historically done **at this spot, at this lead
time**, from the scorecard (13.3):

```
C_track = clip( 1 − MAE_spot,lead / MAE_reference , 0, 1 )
```

Low when this spot has historically been hard to forecast — which is real information the
user deserves, and which no competitor shows.

**3. `C_freshness`** — how long since a real human observation:

```
C_fresh = exp( − Δt_hours / λ ) ,   λ ≈ 36 h    [unfit prior]
```

Fresh photo 20 minutes ago → ~1.0. Last report Tuesday (96 h) → 0.07.

**This is exactly the behaviour the owner asked for.** All models agree + a photo 20 minutes
ago = high confidence. Models disagree 40 % + last human report Tuesday = low, and we say so.

**Guard:** `C_total` must be **displayed, never folded into the score** (section 7.5), and
must be **validated by the calibration check in section 10.2**. An unvalidated confidence
number is worse than none, because it launders a guess as a measurement.

## 14.4 What the system says when it does not know

**[DERIVED]** For expert users — who are the ones with the strongest opinions and the
loudest voices — **"I'm not sure, and here's why" is strictly better than a confident wrong
answer**, for a reason that is structural rather than sentimental:

An expert can *act* on a stated uncertainty. Told "models split 10 s vs 15.5 s", he knows
exactly what to do: check the buoy-less long-period signal himself, or drive to the spot
that works on both. Told "4 stars", he has nothing to work with, and when it is wrong he
concludes the app lies. **One confident wrong call costs more trust than ten honest
"unsure"s.** That is precisely how the cousin arrived at his opinion of existing trackers.

Required behaviours:
- **Below a confidence floor, refuse to name a single spot.** Show the top 3 and say why the
  call is close.
- **Name the specific disagreement**, never a generic "conditions may vary".
- **Say when data is stale**, with the actual date.
- **Never fabricate a spot report.** If nobody has been to Morro Negrito in 9 days, that is
  what it says.

---

# 15. "Doesn't the WhatsApp group already do this?" — answered head-on

The owner asked whether relying on humans makes the product pointless next to the existing
500-person WhatsApp group. **It is the right question and it deserves a non-flattering
answer.**

## 15.1 Where the honest answer is uncomfortable

**For "what is it doing right now", the WhatsApp group is better than anything we can build,
and it will stay better.** A photo posted at 6:40am beats any model. We should not pretend
otherwise, and we should not try to replace it.

## 15.2 Where the app produces something the group structurally cannot

**[DERIVED]** The difference is not human-vs-machine. It is that **a chat group has no
memory and no counterfactual.**

| | WhatsApp group | Learning app |
|---|---|---|
| Tells you today's conditions | **Yes, better** | Worse |
| Tells you conditions at a spot **nobody visited today** | **No — silent** | Yes, from the corrected model |
| Remembers that GFS ran 25 % big at Catalina for 30 days | No | Yes |
| Improves on its own as messages accumulate | **No** — message 10,000 is worth the same as message 1 | Yes |
| Tells you **tomorrow** | Only as opinion | Yes, with measured skill |
| Answers at 4am when nobody is awake | No | Yes |

**The compounding asset is the prediction log joined to the observations (13.1 + 13.2).**
The WhatsApp group generates the observations and then **throws them away** — the information
that "the forecast said 1.2 m and it was actually waist-high" exists in that chat for one
morning and is then unrecoverable. Capturing that pair, every time, is the entire product.

**[DERIVED] The sharpest way to put it:** the group answers *"how is it now?"*. The app
answers *"where should I drive tomorrow, and how sure are we?"* — and gets better at it every
time the group answers its own question. **The right strategy is to feed off the group, not
compete with it:** the lowest-friction possible report path (13.2), ideally seeded from the
photos those 500 people are already posting.

**And the honest caveat:** if the community does not submit — if the friction is too high or
the incentive too weak — **the learning loop produces nothing and the app is a prettier
forecast reader.** Adoption is the primary risk to the entire thesis. It is not a technical
risk and no amount of modelling will fix it.

---

# 16. The honest ceiling — answering "perfect machine"

The owner used the phrase "perfect machine." Here is the direct answer, without flattery.

## 16.1 It will not become perfect, and the reason is structural

**[DERIVED]** Total error decomposes into three parts, only one of which we can attack:

```
Total error²  =  learnable bias²  +  irreducible forecast error²  +  label noise²
                 └─ we fix this ─┘   └────── we cannot fix either of these ──────┘
```

**1. Learnable systematic bias — we can remove most of this.** Refraction focusing,
headland shadowing, a reef the 16–25 km grid cannot see, a persistent sea-breeze timing
error. It is consistent, so it is learnable, and section 5.2 says ~10–30 observations gets
most of it. **This is the real win and it is genuine.**

**2. Irreducible forecast error — we can remove none of it.** Two independent causes:
- **Atmospheric predictability limits.** The weather driving the swell is chaotic; beyond a
  few days, error growth is a property of the atmosphere, not of the model. No amount of
  local data touches this.
- **The representativeness gap.** The model reports a grid cell average; the surfer
  experiences one wave on one reef. Even a *perfect* model of the grid cell is not a
  statement about the break. **This gap is exactly what our bias term learns — but only its
  mean.** The variance around it stays.

**3. Label noise — we can measure it but not remove it.** Two experts rating the same
session disagree. If they disagree by `σ_human`, then **no system, however good, can score
better than `σ_human` against those labels** — it would have to predict the rater, not the ocean.

## 16.2 We should measure the ceiling rather than guess it

**[DERIVED — and this is the recommendation]** I could not find a published inter-rater
agreement number for surf quality, and I decline to invent one. But **we do not need a paper,
because the experiment is free and falls out of the data we are already collecting:**

> Whenever ≥2 users report the same spot within the same 2-hour window, we have a **repeat
> measurement**. Compute the mean absolute difference between their quality ratings and
> their size estimates. That number **is** `σ_human` for our actual users, and
> **it is the floor our model can never beat.**

Build this as a standing dashboard metric from day 1. It costs nothing extra, it turns an
unanswerable philosophical question into a measured constant, and — critically — **it tells
us when to stop investing in modelling**, because once our MAE approaches `σ_human` there is
no headroom left to buy.

## 16.3 Where it realistically plateaus, and how fast

**[DERIVED — estimates, not measurements. Treat as hypotheses to be tested by 16.2.]**

| Phase | Data | Expected state |
|---|---|---|
| Launch | 0 obs | **No accuracy edge.** Honest, well-organised, well-explained. Real value, zero accuracy claim. |
| ~1 season | 10–30 obs/spot at priority spots | **Stage-1 bias correction live.** Measurably better than raw model *at those spots*. The first defensible accuracy claim. |
| ~2 seasons | 100–200 obs/spot | **Conditional bias.** Knows *when* a spot's forecast fails. Probably the best forecast available for those specific spots. |
| Plateau | beyond that | **Gains flatten hard.** Remaining error is chaos + representativeness + label noise. |

**The honest summary sentence, which should be used publicly instead of "perfect":**

> **Meaningfully better than any single forecast at the spots our community actually
> reports on — and never better than the disagreement between two good surfers watching the
> same session.**

"Meaningfully" is quantified by the metric in section 10: **pairwise spot-ranking accuracy
against the raw-model baseline**, which is the number that should be reported publicly and
updated as it improves.

## 16.4 What to stop claiming immediately

- **[HYPE / KILL] "Perfect."** Not reachable, and the claim is self-harming — it sets up
  exactly the broken-promise dynamic that made the cousin distrust forecasts.
- **[HYPE / KILL] "AI predicts the waves."** We are not predicting waves. We are correcting
  a physical model's known local errors and explaining its uncertainty. That is a better,
  truer, and still-impressive story.
- **[HYPE / KILL] Any accuracy claim on day 1.** There is no data yet. Sections 10 and 13
  say precisely when the claim becomes earnable.
- **[KEEP] "Learns your local break from the people who surf it."** True, defensible, and
  the thresholds are in 13.4.


---

# 6. Where an LLM actually adds value — and where it is the wrong tool

**[DERIVED throughout, with the reasoning made explicit so it can be argued with.]**

This is the section most likely to be uncomfortable, so it goes first: **the LLM is not the
thing that makes the forecast accurate.** Accuracy comes from the physics score (section 7)
and the learned bias correction (section 13). If the LLM disappeared, the app would be
slightly less pleasant and exactly as accurate.

That is not an argument against using one. It is an argument for using it **for the four
things it is genuinely better at than any alternative**, and refusing it the job it will
silently do badly.

## 6.1 The wrong tool: numbers

**Do not let an LLM compute, estimate, average, or adjudicate a numeric forecast value.**

The reasons are structural, not a matter of model quality:

1. **It is not a regressor and has no error model.** A gradient-boosted tree or a linear
   bias term produces a number *and* a standard error. An LLM produces a number with a
   confident tone and no uncertainty at all. Section 14.3 requires calibrated confidence;
   an LLM cannot supply it.
2. **It is not reproducible or auditable.** Section 13.1 requires storing the exact score we
   showed, and section 10 requires proving the score improved. A number that came out of a
   sampled generation is not attributable to any change we made, so **it destroys the
   evaluation story** — the one thing section 10 exists to protect.
3. **It cannot be fit to the data we are collecting.** The entire learning loop (section 13)
   works by adjusting parameters against observations. There is no parameter in an LLM
   prompt that 30 user reports can update. **Putting the LLM in the numeric path
   disconnects the product from its own flywheel** — which is the exact opposite of what the
   owner asked for.
4. **Tokenisation makes digit-level arithmetic an odd task for it**, and it has no reason to
   respect physical constraints like "energy flux goes as H²T" unless the constraint is
   computed for it. [DERIVED — I was unable to run searches to attach benchmark citations
   for LLM numeric-reasoning limits; **flagged as needing a citation pass**, though the
   architectural argument in points 1–3 stands independently of any benchmark.]

**[HYPE / KILL]** "The AI weighs all the data sources and produces the forecast." If a
language model is doing the weighing, this is a random number generator with good grammar.
The weighing must be the deterministic ensemble logic in sections 7 and 8, which is
inspectable, testable, and improvable.

## 6.2 The right tool: four jobs it does better than anything else

**(a) Synthesising multi-source disagreement into a plain-language call.**
Section 8.2 produces a genuinely messy picture: four models, two of them the same model at
different resolutions, one returning a land-masked zero, splitting 10 s vs 15.5 s on period.
Turning that into *"they agree on size but split on period; if it's the long one it'll be a
size bigger"* is a language task, and the LLM is excellent at it. **The numbers are computed;
the LLM only narrates them.**

**(b) Encoding expert local heuristics as rules.**
"Venao goes to shit when the wind swings SW after 10am" is exactly the kind of knowledge that
lives in the community and not in any model. Two honest observations about this:
- The **rule itself should be data, not prose** — a structured condition
  (`spot=venao, wind_dir∈[200,250], hour>10 → penalty`) that the deterministic scorer applies
  and that section 10 can evaluate. Rules stored as prose cannot be tested or measured.
- The **LLM's job is the translation layer**: turning a WhatsApp sentence from a local into
  that structured rule, and turning the structured rule back into a readable explanation.
  That is a real, valuable, and appropriately-scoped use.

**(c) Reading unstructured human reports.**
This one is directly load-bearing for the learning loop. The community already posts free
text ("was head high and glassy till about 9 then junk"). Extracting
`{size: head-high, quality: good, wind: clean→blown, transition_hour: ~9}` from that is a
classic extraction task, and it **converts existing chat traffic into training labels**
(section 13.2) without asking anyone to fill in a form. **This may be the single highest-value
LLM application in the product**, because it attacks the binding constraint — submission
volume — rather than the modelling.

**(d) Explaining *why*.**
"Why not Venao: same swell, but it's onshore there by 8." Sub-scores from section 7.3 are
already available and interpretable; the LLM turns them into a sentence. This is what makes
the app feel like local knowledge instead of a table.

## 6.3 The recommended hybrid, concretely

```
  ┌────────────────────────────────────────────────────────────┐
  │ 1. INGEST      4 wave models + wind + tide                 │
  │                → drop land-masked rows (§8.3 Finding 2)    │
  │                → write immutable prediction log (§13.1)    │
  ├────────────────────────────────────────────────────────────┤
  │ 2. CORRECT     apply pooled per-spot bias b̂_s (§13.4)      │
  │                gated on n≥10 and |b|>2·SE                  │
  ├────────────────────────────────────────────────────────────┤
  │ 3. SCORE       deterministic Q = S_dir·(S_size·S_wind·     │
  │                S_tide)^w  (§7.3)      ← NUMBERS END HERE   │
  │                confidence C (§14.3)                        │
  ├────────────────────────────────────────────────────────────┤
  │ 4. NARRATE     LLM receives ONLY the computed features,    │
  │                sub-scores, spread stats, confidence, and   │
  │                the spot's rules. Writes the call.          │
  │                MUST NOT change any number.                 │
  └────────────────────────────────────────────────────────────┘
```

**The invariant that makes this safe and testable:** the LLM sees the numbers and emits
prose. It never emits a number that was not computed upstream. Enforce it mechanically —
have the narration step return structured references to the computed fields rather than
free-typed figures, and **add a regression test that fails if a displayed numeric value does
not appear in the computed feature set.** That test is cheap and it is what keeps the
"AI" from quietly becoming the thing that breaks the product's credibility.

## 6.4 "LLM as reasoner over precomputed features"

**[DERIVED]** The pattern above is the general one: do the arithmetic in code, hand the model
a compact structured summary, and ask it for judgement and language over those features. It
is the right shape here for a reason specific to this project — **it is the only arrangement
in which the learning loop and the LLM do not fight each other.** The bias terms improve the
features; the LLM's narration automatically improves with them, with no retraining and no
prompt change.


---

# 1. Why surf forecasts are wrong — the physics, with numbers

Core wave equations below verified against Coastal Wiki's *Shallow-water wave theory*
(`https://www.coastalwiki.org/wiki/Shallow-water_wave_theory`, accessed 2026-08-08).
Deeper literature detail is in the appended research reports at the end of this document.

## 1.1 The resolution problem, stated plainly

The models we can actually get for Panama run at **0.05° to 0.25°**, i.e. roughly
**5 km to 25 km per grid cell** (verified model table, section 8.1). Panama's surf coast has
headlands, offshore islands, reef passes and bays that change character over **hundreds of
metres**.

**[DERIVED]** A single 16–25 km cell around the Azuero Peninsula contains an exposed point,
a shadowed bay, and a reef, and it returns **one answer for all three**. This is not a bug
to be fixed by a better model run; it is the definition of the grid. It is also why the
cousin's experience is not bad luck — the forecast he read was never a statement about the
break he drove to.

Section 8.2 shows the concrete consequence: **three of seven models cannot even produce a
number at Panama's coastal cells**, and others emit a land-masked `0.00 m` that looks like
a real reading.

## 1.2 Period, not height — the single most under-communicated fact

`[DEMONSTRATED — standard linear wave theory, source above]`

```
deep-water wavelength   L₀ = gT²/(2π)          → scales as T²
deep-water celerity     c₀ = gT/(2π)           → scales as T
group velocity (deep)   c_g = c₀/2
energy density          E  = ρgH²/8            → scales as H², independent of T
energy flux (power)     P  = E·c_g             → scales as H²·T
```

**Worked: 1.5 m at 16 s vs 1.5 m at 8 s — the same "wave height".**

| | 1.5 m @ 16 s | 1.5 m @ 8 s | ratio |
|---|---|---|---|
| Wavelength `L₀` | **400 m** | 100 m | **4×** |
| Celerity `c₀` | 25.0 m/s | 12.5 m/s | 2× |
| Energy density `E` | 2,828 J/m² | 2,828 J/m² | **1× (identical!)** |
| **Energy flux `P`** | **35.3 kW/m** | 17.7 kW/m | **2×** |
| Starts feeling bottom at `h = L₀/2` | **200 m depth** | 50 m depth | 4× |

Two things fall out of that table that matter enormously to the product:

1. **The 16 s swell delivers twice the energy past a point** and begins shoaling in **200 m
   of water instead of 50 m** — so it has vastly more distance to refract, focus onto reefs,
   and wrap into bays. It will break bigger, further out, and with more power, from an
   identical "wave height".
2. **Significant wave height alone cannot distinguish them.** Every forecast display that
   leads with a single height number is discarding the variable that decides whether the day
   is worth driving for. **`H_eff = H^0.8·T^0.4` in section 7.2(b) exists precisely to fix
   this**, and it is the highest-value single line in the scoring function.

**Live Panama example (section 8.2 data, Playa Venao, 2026-08-08).** The two model camps:

| Model | H | T | `L₀` | Energy flux |
|---|---|---|---|---|
| `dwd_gwam` | 0.86 m | 10.05 s | 158 m | 7.3 kW/m |
| `ncep_gfswave016` | 0.64 m | 15.5 s | 375 m | 6.2 kW/m |

Note the subtlety, which is a genuinely useful thing to tell a user: **the two forecasts
carry almost the same total energy (within 15 %), but describe completely different waves** —
one a short, stacked-up 158 m windswell, the other a long, spaced 375 m groundswell that
will wrap into the bay and break with far more shape. "Same energy, different wave" is
exactly the nuance that a single number destroys and a good narration (section 6.2a) preserves.

## 1.3 Shoaling, refraction and the breaking criterion

`[DEMONSTRATED — source above]`

```
shoaling coefficient    K_S = (c_g0 / c_g)^(1/2)
refraction coefficient  K_R = (cos α₀ / cos α)^(1/2)
Snell's law for waves   sin α / sin α₀ = c / c₀ = tanh(kh)
breaking (depth-limited) h_b = 1.28 H_b  ⇒  γ = H_b/h_b = 0.781   [flat-bottom idealisation]
```

> **⚠ SELF-CORRECTION — my first reading of this was wrong, and I am flagging it rather
> than quietly fixing it.** My initial WebFetch summary of the Coastal Wiki page reported
> "γ = 0.78 theoretical, 0.4–1.2 in practice." A second independent fetch of **the same
> page** returned **neither figure** — it gives eq. (4.10) `h_b = 1.28 H_b`, which *inverts*
> to 0.781, and no practical range. **The "0.4–1.2" range was a summarisation artifact and
> should not be cited.** Corrected sourcing below.

**What the authoritative sources actually say:**

- **USACE Coastal Engineering Manual, Part II Ch. 1** ([coastalengineeringmanual.tpub.com](https://coastalengineeringmanual.tpub.com/Part-II-Chap1/Part-II-Chap10062.htm),
  accessed 2026-08-08): "the limiting wave steepness to be **H/L = 0.141 in deep water and
  H/d = 0.83 for solitary waves in shallow water**." The canonical US engineering manual
  gives **0.83, not 0.78.**
- **Coastal Wiki, *Breaker index*** ([coastalwiki.org/wiki/Breaker_index](https://www.coastalwiki.org/wiki/Breaker_index),
  accessed 2026-08-08) gives neither constant, and instead gives **Battjes (1974):
  γ_b = 1.06 + 0.14 ln ξ_b** — γ is "a decreasing function of the wave steepness and
  increasing function of the seabed slope", with "approx. 20 % larger breaker index for
  plunging waves compared to spilling waves", and experimental results "widely scattered".

**[DERIVED] The disagreement is itself the finding, and it strengthens the product argument:**
**γ is not a constant.** 0.78 and 0.83 are two flat-bottom solitary-wave idealisations. The
physically correct treatment makes γ a function of **bottom slope and wave steepness** — i.e.
`γ` is a *spot property*, controlled by the slope of that particular reef or sandbar. It is
one of the per-spot constants that no global model knows and that **local knowledge or
learned bias must supply** — which is the entire argument for section 13.

Practical consequence of `γ = 0.78`: a 1.5 m breaker needs **~1.9 m of water**. Change the
tide by a metre over a shallow reef and you have changed whether the wave breaks at all,
where it breaks, and how hard. **This is why `S_tide` in section 7.2(d) is not a cosmetic
term**, and why `σ_tide` must be narrow for reefs and wide for beachbreaks.

Refraction via Snell's law is what focuses swell onto points and defocuses it into bays —
the same offshore swell can be doubled at a headland and halved 800 m away in the bay. A
25 km grid cell contains both and averages them into one meaningless number.

## 1.4 The remaining failure modes

- **Sea breeze / local thermal wind.** Wind is weighted equal to swell in the score
  (section 7.3) because it is what actually ruins sessions. Global models at 5–25 km resolve
  the synoptic wind but handle the **onset timing and strength of a tropical sea breeze**
  poorly. Section 12.1 shows we have real hourly wind truth at only ~5 Panama stations, **none
  of them at a surf spot** — so sea-breeze error is simultaneously the most important error
  and the least directly observable. This is the strongest argument for the regional
  wind-regime correction proposed in 12.1.
- **Island and headland shadowing.** Panama's Pacific has substantial offshore islands
  (Coiba, Cébaco, the Perlas). Shadowing is a sub-grid geometry effect, invisible at 25 km,
  and highly directional — a 10° shift in swell direction can switch a spot from shadowed to
  exposed. Given that section 8.2 measured **115° of disagreement between models on swell
  direction at Playa Malibu**, this is not a theoretical concern.
- **Secondary swell trains.** A real sea state is several overlapping swells plus windsea.
  Open-Meteo does expose `secondary_swell_*` (per file `01-marine-wave-apis.md`) —
  **use it.** Collapsing a multi-peaked directional spectrum into one `significant wave
  height` is the largest single act of information destruction in the entire pipeline.
- **Tide-stage interaction** — covered in 1.3; it is a per-spot constant, not a model output.


---

# 11. VERDICT — what is real and what is hype

The brief asked for the single most valuable contribution to be an honest split. Here it is,
with nothing softened.

## 11.1 REAL — build these

| Idea | Status | Evidence |
|---|---|---|
| **Multi-model disagreement as a confidence signal** | **REAL, and available free on day 1** | [MEASURED HERE] §8.2 — 4 usable models, 15–179 % spread, live |
| **Period-weighted effective size instead of raw Hs** | **REAL, pure physics, no data needed** | [DEMONSTRATED] §1.2 — 2× energy flux, 4× wavelength at equal H |
| **Deterministic, explainable spot score** | **REAL** — it is arithmetic, testable and improvable | §7 |
| **Wind weighted equal to swell, via shore-normal projection** | **REAL** and the single biggest fix to the cousin's complaint | §7.2(c) |
| **Immutable prediction log** | **REAL and urgent** — costs ~$0.01/mo, cannot be backfilled | [DERIVED] §13.1 |
| **Per-spot scalar bias correction from user reports** | **REAL**, and cheaper than expected | [DERIVED] §5.2 — `n > (σ/b)²` ⇒ ~10–30 reports |
| **Partial pooling / hierarchical shrinkage for cold start** | **REAL** — textbook stats, exactly fits 40-spots-little-data | [ESTABLISHED] §13.4 |
| **LLM for narration, extraction from chat, and explanation** | **REAL** — genuinely the best tool for these four jobs | §6.2 |
| **LLM parsing WhatsApp free text into labels** | **REAL, and possibly the highest-leverage AI use in the product** | §6.2(c) |
| **MOS/Kalman bias correction for wind at Bocas (MPBO)** | **REAL** — the one place with at-spot instrumented truth | [MEASURED HERE] §12.1 |
| **Saying "I don't know" with a specific reason** | **REAL** and the main trust differentiator | §14.4 |

## 11.2 HYPE — do not build these, and do not claim them

| Claim | Verdict | Why |
|---|---|---|
| **"AI weighs all the sources and produces the forecast"** | **KILL** | If an LLM does the weighing it is a fluent random number generator. It has no error model, is not reproducible, destroys the §10 evaluation, and cannot be improved by user data — it disconnects the product from its own flywheel (§6.1). |
| **"A perfect machine"** | **KILL** | Structurally impossible: chaos + representativeness gap + label noise (§16.1). Worse, the claim manufactures the exact broken promise that made the cousin distrust forecasts. |
| **Per-spot gradient-boosted trees** | **KILL** | Needs thousands of reports **per spot**; 40 spots ⇒ 30,000+. Will not happen. A single scalar per spot captures most of the gain (§13.4). |
| **Running SWAN/XBeach/Delft3D nearshore models** | **KILL for this project** | Operational nested coastal modelling is a funded-institution activity, not a $20/month hobby project. The cheap approximation is per-spot constants + learned bias. |
| **Any accuracy claim at launch** | **KILL until §10 supports it** | Zero observations on day 1. ~400 comparison pairs is the threshold. |
| **Satellite altimetry as spot ground truth** | **KILL** | Coastal blind zone + multi-day revisit. Cannot verify a break. |
| **Automated surf-cam scraping** | **KILL** | 2 of 16 Panama spots, one offline, ToS forbids automated capture (peer research). |
| **Ensemble mean presented as "more accurate"** | **KILL as stated** | With ~3 independent members and no verification data, we cannot show the mean beats the best member. Use it as a default, label it as one. |

## 11.3 The uncomfortable ones

**(a) The biggest risk is not technical.** Every threshold in §13.4 assumes people submit
reports. If they don't, the learning loop produces nothing and this is a nicer forecast
reader. **Submission friction is the top project risk**, and no modelling work reduces it —
only product design does (§13.2: four taps, fifteen seconds).

**(b) The WhatsApp group will remain better at "how is it right now".** We should not
compete with it; we should read from it (§15). Pretending otherwise wastes effort and
credibility.

**(c) On day 1 we are not more accurate than Surfline.** We are better organised, more
honest, and Panama-specific. Those are real and defensible. Accuracy is earned in §13.4
Stage 1, not claimed at launch.

**(d) The forecast may be least improvable exactly where it matters most.** Sea-breeze
timing is the most important local error, and §12.1 shows **zero wind observations at any
Panama surf spot** (and Río Hato is dead). We can learn wind bias at Bocas and infer a
regional pattern — but at Venao, wind correction will be indirect and weaker than the swell
correction. Be honest about that in the UI.


---

# 4. Machine learning on waves and surf — what has actually been demonstrated

Sourced from a dedicated literature pass (arXiv API, OpenAlex API, GitHub REST API; all
accessed 2026-08-08). **All accuracy figures are abstract-level** — full texts were not
read. Author names are deliberately omitted throughout because the APIs used did not return
authorship, and asserting them would be fabrication.

## 4.1 (a) Predicting wave height at a buoy — DEMONSTRATED, mature, and not our problem

| Study | Venue / ID | Reported result |
|---|---|---|
| GRU, Taiwan Strait | *Water* 2021 · [10.3390/w13010086](https://doi.org/10.3390/w13010086) | RMSE 0.234 m (3 h) → 0.479 m (24 h) |
| EMD-TimesNet | *JMSE* 2024 · [10.3390/jmse12040536](https://doi.org/10.3390/jmse12040536) | RMSE 0.049 / 0.098 / 0.157 m at 1/3/6 h |
| ConvLSTM, China Seas | *Front. Mar. Sci.* 2021 · [10.3389/fmars.2021.680079](https://doi.org/10.3389/fmars.2021.680079) | MAPE 15 % / 29 % / 61 % at 6/12/24 h |
| Extra Trees, CDIP buoys | [arxiv.org/abs/2105.08583](https://arxiv.org/abs/2105.08583) | RMSE 0.14 m (1-day), 0.122 m (14-day) |
| ML surrogate, Monterey Bay | [arxiv.org/abs/1709.08725](https://arxiv.org/abs/1709.08725) | RMSE 9 cm; **<1/1000 the compute** of the physics model |

A review covering 90+ such studies exists at
[10.1016/j.oceaneng.2022.111947](https://doi.org/10.1016/j.oceaneng.2022.111947).

**[DEMONSTRATED] but [NOT APPLICABLE TO US]** — and this is the important reading. Every one
of these trains on a **buoy time series**. Section 0 established Panama has no buoy. This
entire, mature, well-performing branch of the literature is **unavailable to this project**.
Do not cite it as evidence that our app will be accurate; it is evidence that *someone with
a buoy* can be accurate.

> Do not read the table as one degradation curve — different basins, stations and metrics,
> not mutually comparable. The robust cross-study signal is **monotonic error growth with
> lead time**, which independently confirms section 13.1's insistence that lead time be a
> first-class dimension.

## 4.2 (b) ML post-processing / bias-correcting a numerical model — DEMONSTRATED, and this IS our lane

This is the published validation of the approach recommended in sections 5 and 13.

- **"Improving NCEP's global-scale wave ensemble averages using neural networks"**,
  *Ocean Modelling* 2020 · [10.1016/j.ocemod.2020.101617](https://doi.org/10.1016/j.ocemod.2020.101617)
  — wave-specific ensemble post-processing, 50 citations.
- ANN trained on the **residual** between NOAA reforecast and observations, Brazilian coast
  · [arxiv.org/abs/2509.14020](https://arxiv.org/abs/2509.14020) — **5 % error reduction vs
  NOAA's numerical model**, avg 80 % accuracy.
- OceanCastNet vs operational ECWAM · [arxiv.org/abs/2406.03848](https://arxiv.org/abs/2406.03848)
  — better at 24 NDBC stations vs ECWAM's 10.
- Storm-surge bias correction (GNN+LSTM) · [arxiv.org/abs/2604.20688](https://arxiv.org/abs/2604.20688)
  — **RMSE reduced >70 % at 48 h**.
- Cross-domain anchor, NWP temperature bias correction, *Earth and Space Science* 2020
  · [10.1029/2019ea000740](https://doi.org/10.1029/2019ea000740) — RMSE 2.08 → 1.55–1.66 °C.

**Read the 5 % number honestly.** The Brazilian-coast study is the closest published analogue
to what we propose — learn the residual against a numerical model — and it bought **5 %
error reduction**, not 50 %. That is a real, useful, *modest* gain and it is the right
order of magnitude to expect. **Anyone promising transformational accuracy from residual
learning is contradicting the closest published result.**

## 4.3 (c) Predicting surf QUALITY — the finding that most changes the plan

My prior was that this literature is empty. **That was half wrong, and the wrong half matters.**

Targeted arXiv full-text queries returned nothing relevant (`all:"surf" AND all:"forecast"` →
2 hits, neither about surfing; `all:"surfing" AND all:"waves"` → 25 hits, all plasma physics,
population genetics or surf-zone hydrodynamics). But OpenAlex surfaced a genuine, small
literature:

- **"Deep Learning Object Detection Application to Surfing Wave Quality"**, *Coastal
  Engineering Proceedings* 2023 · [10.9753/icce.v37.papers.25](https://doi.org/10.9753/icce.v37.papers.25)
  — CNN identifying breaking points and wave crests in NZ surf footage, **mAP 0.794**.
  Only 2 citations. Self-describes as the first automation of surfing wave-quality monitoring.
- **"Wave Peel Tracking: A New Approach for Assessing Surf Amenity"**, *Remote Sensing* 2021
  · [10.3390/rs13173372](https://doi.org/10.3390/rs13173372) — automated per-wave **ride
  rate, length, duration, speed and direction** from shore cameras, validated against GPS
  tracks from real surfers at the Gold Coast.
- The canonical **physical** surfability parameter set — *J. Coastal Research* 2009
  · [10.2112/07-0958.1](https://doi.org/10.2112/07-0958.1) (67 citations):
  **wave height, peel angle, breaking intensity, section length.**

**The precise finding, and it is a genuinely useful one:** ML applied to surf quality exists
and works by **measuring objective physical/kinematic wave properties**. **No paper was found
predicting a subjective goodness score, and no public human-rated surf-quality dataset
exists.**

**[DERIVED] Two consequences:**
1. **This is a labelling gap, not a modelling gap.** The reason nobody has built what the
   owner wants is that nobody has the labels. Section 13.2's observation record is therefore
   not a commodity feature — **it is the scarce asset**, and it is the thing that would make
   this project novel rather than derivative.
2. **"Peel angle, breaking intensity, section length" is a better vocabulary than stars.**
   Where the community can report those semi-objectively, the labels are far less
   observer-dependent than "was it good" (section 13.2's inter-observer problem).

## 4.4 Open-source surf scoring — it does not exist

GitHub REST API search for `surf spot rating score` returned **`total_count: 0`**.

The landscape that does exist is entirely **API clients, scrapers and notification bots**:
[swrobel/meta-surf-forecast](https://github.com/swrobel/meta-surf-forecast) (337★, Ruby
aggregator over Surfline & Spitcast, actively pushed 2026-08-04),
[mhelmetag/surflinef](https://github.com/mhelmetag/surflinef) (84★, Go Surfline client),
[lucasinocencio1/mcp-surf-forecast](https://github.com/lucasinocencio1/mcp-surf-forecast)
(19★, MCP server over Open-Meteo Marine),
[felix-last/wave-forecast](https://github.com/felix-last/wave-forecast) (7★, buoy linear
regression, 2016), plus ~8 more wrappers. **Not one contains an open surf-scoring algorithm.**

**[DERIVED]** Given the project is now open source (below), **publishing the section 7
scoring function would make it the first open surf-scoring implementation on GitHub.** That
is a real, checkable claim to novelty and costs nothing.

## 4.5 The one publicly documented commercial rating rule

**[DEMONSTRATED — first-party, verbatim]** `surf-forecast.com` is the **only** provider found
that publicly states its rating logic
([surf-forecast.com/pages/faq](https://www.surf-forecast.com/pages/faq), accessed 2026-08-08):

> "The star rating is a scale of 1 to 10 and is based on swell size and character (bigger
> the swell and longer the period the higher the rating), however **if the wind is onshore
> the star rating drops in proportion to the wind speed** and the colour of the star goes pale."

> "Bright yellow 10 star is the best big surf with classic conditions and light offshore
> winds. Flat conditions, blown out waves in onshore winds or very strong winds in any
> direction will result in 0 star rating."

**This independently validates the structure of section 7** — size *and period* raise the
score, onshore wind cuts it in proportion to speed, and strong wind in *any* direction is
penalised (which is why section 7.2(c) has a `k_off` too-much-offshore term, not just an
onshore one). Our formula is a quantified, per-spot version of the same logic.

**Surfline / LOLA — no first-party source is retrievable.** `surfline.com` and
`support.surfline.com` returned **HTTP 403 (Cloudflare) on every attempt**. The only
descriptions obtainable are third-party journalism
([sciencefriday.com/articles/catching-a-break](https://www.sciencefriday.com/articles/catching-a-break/),
accessed 2026-08-08), which describes LOLA as a predictive swell model fed by "NOAA, offshore
buoys, NASA satellites — and Surfline's nine full-time forecasters", with a forecaster who
"tweaks the data LOLA's churning in order to incorporate local knowledge about the
peculiarities of individual surf spots" and double-checks against HD cameras.

**[DERIVED] The most useful thing in that quote is the admission of method:** Surfline's
answer to the nearshore-transformation problem is **nine humans applying local knowledge on
top of a model**. That is precisely the gap section 13 proposes to fill with community
reports and a learned bias term instead of paid staff. It is also a reminder that the
incumbent's edge is *local knowledge*, not a better model — which is attackable.

**Every retrievable description of LOLA presents it as a swell/height/period model. Nothing
retrieved describes how the Surfline star rating or "Surfline Score" is computed.** Magicseaweed
exposed `SOLID RATING` / `FADED RATING` fields via its API, but **no source states the
formula**. Windguru's help pages returned 403. **These formulas are not public; any
reconstruction of them elsewhere should be treated as invented.**

---

# 9. Vision models on surf imagery — mostly a trap, with one safe use

**Context that decides this section:** peer research found Panama has almost **no usable surf
webcams** (2 of 16 spots, one offline, ToS forbids automated capture). So the realistic input
is **an arbitrary user phone photo**, not a fixed calibrated camera. That distinction is
everything.

## 9.1 Camera-based wave measurement is real science — and none of it applies to a phone photo

**[DEMONSTRATED]**

- **Breaking wave height from timex images**, *Remote Sensing* 2020
  · [10.3390/rs12020204](https://doi.org/10.3390/rs12020204) — **RMSE 0.2 m**, Portuguese
  Atlantic.
- Video bathymetry from wave phase speed, *JGR Oceans* 2000
  · [10.1029/1999jc000124](https://doi.org/10.1029/1999jc000124) — rms 91 cm, 242 citations.
- **UBathy**, *Remote Sensing* 2019 · [10.3390/rs11232722](https://doi.org/10.3390/rs11232722)
  — relative RMSE ~1–3 % (simple) to ~15 % (complex).
- **CoastSnap** citizen-science smartphone imaging, *Continental Shelf Research* 2022
  · [10.1016/j.csr.2022.104796](https://doi.org/10.1016/j.csr.2022.104796) — 200 locations,
  21 countries, 10,000+ images, 4,000 participants, **~2.6 images/station/week**.
  USACE evaluation · [10.21079/11681/47568](https://doi.org/10.21079/11681/47568) —
  shoreline RMSE **<10 m** in low-moderate waves, **up to 18 m** in high waves.

**⚠ The load-bearing caveat, and the reason this section says "no":** the 0.2 m result uses a
**fixed, calibrated, georeferenced** station, **time-exposure foam signatures** averaged over
minutes, and a **known beach profile**. It is emphatically *not* "a camera can measure wave
height to 20 cm from a frame." **Every accurate result above uses a purpose-trained model on
a calibrated fixed camera. None is a zero-shot VLM on an arbitrary image.**

**[DERIVED] One genuinely transferable lesson from CoastSnap:** its submission rate of
**~2.6 images per station per week** from a 4,000-person, 21-country programme is a sobering
real-world benchmark for citizen-science coastal imagery. Applied to our section 13.4
thresholds (10–30 reports per spot), that rate would take **~1 season per spot** — which
matches the estimate there, arrived at independently. It also says plainly that **a fixed
photo mount at a spot underperforms a nudge to people already carrying phones.**

## 9.2 What a VLM can and cannot judge — the evidence is blunt

**[DEMONSTRATED — and this kills the obvious feature]**

**On counting people in a lineup:**
- **"Vision Language Models are Biased"** · [arxiv.org/abs/2505.23941](https://arxiv.org/abs/2505.23941)
  — **17.05 % average counting accuracy** across 7 domains. Removing backgrounds nearly
  *doubles* accuracy (+21.09 pp), i.e. scene context actively misleads.
- **CAPTURe** · [arxiv.org/abs/2504.15485](https://arxiv.org/abs/2504.15485) — GPT-4o,
  InternVL2, Molmo, Qwen2-VL all struggle, markedly worse under **occlusion**, while humans
  make very little error. *A lineup is a heavily occluded scene by definition.*
- **"Your Vision-Language Model Can't Even Count to 20"** · [arxiv.org/abs/2510.04401](https://arxiv.org/abs/2510.04401)
  — substantial failure on **compositional** counting (multiple object types — i.e. surfers
  + boards + whitewater).

**On estimating physical size from a photo — the single most relevant paper found:**
- **"Ill-Posed by Design: Probing Evidence Use in VLMs"** · [arxiv.org/abs/2606.24335](https://arxiv.org/abs/2606.24335)
  — uses monocular metric size estimation *precisely because* **"physical size cannot be
  determined from a single uncalibrated image."** Across 12 VLMs from 3B to 397B params:
  **the largest VLMs trail a text-only frontier LLM** on the in-the-wild split — *looking at
  the image helps less than not looking at it.* "Global scene geometry is largely unused."
- Corroborating: [arxiv.org/abs/2509.25413](https://arxiv.org/abs/2509.25413) (DepthLM) —
  "state-of-the-art VLMs including GPT-5 still struggle in understanding 3D from 2D inputs."

**On whether it will at least tell us it's unsure — no:**
- [arxiv.org/abs/2405.02917](https://arxiv.org/abs/2405.02917) — GPT4V and Gemini Pro Vision
  show **high calibration error and are overconfident most of the time**; poor calibration
  when producing means, standard deviations and 95 % confidence intervals.

**[DERIVED] Estimating wave height from a surf photo is strictly harder than the benchmark
tasks above:** no known reference object of fixed size (a surfer is deformable and at unknown
distance), unknown camera geometry, and a deformable subject. The published evidence says a
VLM will produce a confident number that is not a measurement, and will not flag its own
uncertainty. Given that section 14.3 stakes the product's credibility on honest confidence,
**this is disqualifying for any numeric use.**

## 9.3 Recommendation: categorical only, never numeric

| Ask the VLM for | Verdict |
|---|---|
| "Is the surface glassy / textured / blown out?" | **SAFE** — textural, categorical, verifiable against METAR wind at Bocas |
| "Is it breaking, or flat?" | **SAFE** — gross categorical |
| "Empty / a few out / crowded?" (3 buckets, never a count) | **SAFE-ish** — bucketed, tolerant of the 17 % counting accuracy |
| "Is this photo actually of the ocean, today, at this spot?" | **SAFE and useful** — spam/mislabel filtering for the learning loop |
| "How big is it in metres/feet?" | **[HYPE / KILL]** — [2606.24335](https://arxiv.org/abs/2606.24335) |
| "How many surfers are out?" (exact count) | **[HYPE / KILL]** — 17 % accuracy, worse under occlusion |
| "Rate this session 1–5" | **[HYPE / KILL]** — no grounding, no calibration, and it would pollute the very labels the learning loop depends on |

**[DERIVED] The critical design rule:** VLM output may **enrich** an observation record but
must **never be written into it as ground truth.** Our entire training signal is human
labels (section 0); letting an uncalibrated, overconfident model write into that stream
poisons the only asset the project has. **Human says it, model annotates it — never the
reverse.**

**Realistic eval approach if this is built:** collect ~100 user photos with human labels for
the three safe categorical questions, measure agreement, and **ship only the categories that
exceed human-human agreement measured per section 16.2.** Failure modes to test explicitly:
night/low light, rain on lens, zoomed telephoto (destroys scale cues entirely), photos of a
screen, and photos taken from the wrong spot.

## 9.4 Commercial surf-cam AI — NOT FOUND, and the gap is honest

No commercial automated surf-cam analysis product could be verified. Surfline's 403 wall
plus an exhausted search budget made this unverifiable. **This is a tool limitation, not
evidence of absence** — do not cite it as "nobody does this."


---

# 17. Going global — the hierarchical pooling design

> Added after the owner clarified: Panama is the beachhead, not the cap. The product is a
> **free, open-source, unmonetized global tool.**

**Citation caveat, stated up front:** the session's WebSearch budget was exhausted (200/200)
before this section was scoped. The statistical machinery below is **[ESTABLISHED PRACTICE]**
— multilevel/hierarchical modelling and empirical-Bayes shrinkage are textbook — but I was
**unable to attach primary-source citations**, and its application to surf is
**[SPECULATIVE]**. Two claims below are explicitly flagged as **needing verification**.

## 17.1 Why going global genuinely strengthens the learning loop

**[DERIVED]** This is not a growth argument dressed as a technical one. There is a real
statistical mechanism, and it is the same one that solves cold start.

Section 13.4's `n > (σ/b)²` says a spot needs ~10–30 observations to learn its own bias.
With 40 Panama spots that is a slow, spot-by-spot grind. But **if a meaningful share of
model bias is shared across spots** — regional rather than purely local — then every spot's
observations inform every other spot's prior, and the whole system learns far faster than
the sum of its parts.

> **⚠ NEEDS VERIFICATION — and it is the load-bearing claim of the global strategy.**
> The premise that wave-model bias has **regional structure** (a model under-predicting
> along a whole coastline for shared physical reasons — fetch geometry, swell-generation
> region, systematic bathymetry treatment) is highly plausible and is the standard finding
> in NWP verification. **But I could not retrieve a source for it this session.** If it is
> false — if bias is purely idiosyncratic per spot — **the global argument collapses to a
> pure data-volume argument and pooling buys much less.** This should be the first thing
> verified in a follow-up pass, and it is cheap to test on our own data once ~2 regions have
> observations (see 17.5).

## 17.2 The hierarchy

**[DERIVED]** Four levels, each learning something physically distinct:

| Level | What it learns | Why it belongs at this level |
|---|---|---|
| **Global** | Per-source, per-lead-time bias in the *model itself* (e.g. "GFS-Wave under-reads long-period swell at all lead times") | A property of the model's physics/resolution, not of any coast |
| **Ocean basin** | Swell-climate and generation-region effects (E Pacific vs Caribbean vs N Atlantic) | Different basins have different dominant fetch and swell character |
| **Coastline / region** | Shared bathymetry-class and shelf-width effects; regional wind regimes (e.g. Central American gap winds) | **The level where the biggest transferable gain should live**, per 17.1 |
| **Spot** | The idiosyncratic residual: this reef, this headland, this refraction | What is left after the above |

Each level shrinks toward its parent using the same estimator as section 13.4, applied
recursively:

```
b̂_level = ( n / (n + τ_level) )·b̂_own  +  ( τ_level / (n + τ_level) )·b̂_parent
```

**A brand-new spot anywhere in the world inherits `region → basin → global` on day one, with
zero observations.** That is the cold-start answer, and it gets *better* as the global
dataset grows. This is the compounding property the owner is describing, and it is real.

## 17.3 Defining "similar" for borrowing strength

**[SPECULATIVE]** Geography alone is the wrong grouping — two spots 500 m apart can behave
oppositely (an exposed point and a shadowed bay). Recommended features for the similarity
grouping, in rough order of expected value:

1. **Shore orientation relative to dominant swell** — the single strongest determinant of
   whether a spot is exposed or shadowed. Cheap: it is `θ_n` from section 7, which we
   already need.
2. **Break type** — beach / point / reef / rivermouth. Controls the breaking index `γ`
   (0.4–1.2 per section 1.3) and tide sensitivity `σ_tide`.
3. **Exposure / fetch openness** — open ocean vs gulf vs archipelago. Directly predicts
   whether the coarse grid over-reads (unresolved sheltering).
4. **Shelf width / depth gradient** — controls how much shoaling and refraction happens
   between the model grid point and the break; i.e. the size of the representativeness gap.
5. **Which model grid cell it sits in** — spots sharing a cell share the *same* model input,
   so their residuals are directly comparable and any difference is pure local effect.

**[DERIVED] Recommendation: start with explicit, hand-assigned categorical groups (2–5
buckets per feature), not learned clustering.** With few spots and sparse data, a learned
clustering will fit noise, and — more importantly — hand-assigned groups are *inspectable*,
so a local can tell you the grouping is wrong. Move to learned similarity only when there
are enough spots that manual assignment fails.

## 17.4 When pooling helps and when it hurts — the honest counter-argument

The owner's question — does adding thousands of sparse, noisy spots help or just add noise? —
has a precise answer, and it is not unconditionally favourable.

**[DERIVED]** Shrinkage reduces total error when the between-group variance is genuinely
smaller than the within-group noise. Restating the estimator: `b̂` moves toward the parent by
`τ/(n+τ)` where `τ = σ²/σ²_between`.

- **Pooling helps when `σ²_between` is small relative to `σ²`** — spots really do behave
  similarly, and borrowing is nearly free. This is the common case for *model* bias.
- **Pooling hurts when `σ²_between` is large** — spots genuinely differ, and the parent
  prior drags a well-measured spot toward a wrong value. **This is the real failure mode:**
  pooling Playa Venao with a Caribbean beachbreak will actively degrade Venao's forecast.

**The protection is that `τ` is estimated from the data, not chosen.** If spots turn out to
be very different, the fitted `σ²_between` is large, `τ` is small, and the model
automatically stops pooling. **A correctly-fitted hierarchical model degrades gracefully to
no-pooling; it does not blow up.** The danger is *hand-setting* `τ` — do not.

**[DERIVED] Two hard guardrails:**
1. **Never pool across levels that are physically incoherent.** A Caribbean spot must not
   borrow from a Pacific one. Enforce the basin level as a hard partition, not a soft prior.
2. **Report the shrinkage factor per spot in the internal dashboard.** If a spot with 80
   observations is still 60 % shrunk toward its parent, something is misconfigured.

## 17.5 Uneven data density — stopping Panama from dominating the world

**[DERIVED]** Panama will have hundreds of reports while most global spots have zero. Left
alone, the "global" prior becomes "the Panama prior with a global label", and it will be
silently wrong for Portugal.

Three mitigations, all cheap:

1. **Weight groups, not observations, when estimating parent levels.** Compute the global
   prior as the mean of *regional* estimates, each capped in influence, rather than the mean
   of all observations. One hyperactive region then contributes one region's worth of signal.
2. **Cap per-region and per-user influence** on any parent-level estimate (a maximum
   effective sample size, e.g. `n_eff = min(n, 200)` per region).
3. **Report parent-level estimates with their own standard errors and the number of
   contributing regions.** A "global" bias derived from one region should be visibly
   labelled as such and treated as regional until a second region corroborates it.

**[DERIVED] Useful corollary:** the moment a *second* region has ~30 observations, we can
test the 17.1 claim directly — does Panama's learned correction transfer? **That is the
experiment that validates or kills the global strategy, and it costs nothing beyond the
data already being collected.** Build the dashboard for it early.

## 17.6 Open data — short, as requested

**[DERIVED]** The pairing of *what every model predicted* (section 13.1) with *what actually
happened* (13.2) is, per section 4.3, a dataset that **does not currently exist publicly** —
no public human-rated surf-quality dataset was found. That gives it genuine independent
scientific value: it is directly usable for wave-model verification, nearshore
transformation studies, and coastal citizen-science, entirely apart from this app.

Three structural implications, all cheap if decided now and expensive later:

- **Format:** the Parquet-on-S3 archive of section 13.1 is already the right shape.
  Publish predictions and observations as **two joined tables with a stable schema**, plus a
  datestamped release. Include the `land_masked` flag and the raw per-model values — the
  disagreement is part of the science.
- **Licensing:** Open-Meteo's underlying data is **CC-BY 4.0** (per file
  `01-marine-wave-apis.md`), which permits redistribution with attribution — so a CC-BY
  release of derived data is compatible. **Observations are user-contributed**, so the
  contributor terms must grant redistribution rights **at submission time**. Retrofitting
  consent across a user base is effectively impossible; get this into the form on day 1.
- **Reproducibility:** store `score_q` and `score_confidence` as-shown (section 13.1) and
  version the scoring function, so any published result can be regenerated exactly.

**[DERIVED] Note the alignment:** open-sourcing costs almost nothing here because the honest
architecture is *already* the inspectable one — a deterministic formula plus a one-number-
per-spot correction (sections 7, 13). There is no secret model to protect. Had the design
been "an LLM decides", there would be nothing meaningful to open source.


---

# 18. FINAL SUMMARY

1. **Forecasts lie for a structural reason, not a fixable one.** The models we can get run at
   5–25 km per cell. One cell around the Azuero Peninsula contains an exposed point, a
   shadowed bay and a reef, and returns **one number for all three**.
2. **Height without period is the second lie.** 1.5 m @ 16 s carries **2× the energy flux** and
   **4× the wavelength** of 1.5 m @ 8 s, and starts shoaling in 200 m of water instead of 50 m.
   Same "wave height", different day. Score `H_eff = H·√(T/T_ref)`, derived from `P ∝ H²T`.
3. **Wind is what actually ruins sessions**, and it must be weighted equal to swell, projected
   onto the spot's shore normal — with onshore penalised ~2.5× harder than offshore.
4. **I measured the disagreement live.** At Panama spots today, **3 of 7 models return `null`**,
   others emit a **land-masked `0.00 m` that looks like real data**, and the survivors split
   **10.05 s vs 15.5 s** on period at Venao and **115° on direction** at Playa Malibu.
5. **Correction to the plan: we have ~3 independent models, not 5.** ECMWF's wave output is
   null at every Panama coastal point tested; GEFS-Wave access is unverified.
6. **The decisive finding: there is not one wave buoy anywhere on Pacific Central America** —
   I checked all 890 NDBC stations. Nearest reporting wave height is 1,811 km away, wrong ocean.
7. **Therefore MOS, Kalman and quantile mapping — all legitimate — are operationally dead here.**
   They need observations to correct against. **User reports are not an engagement feature;
   they are the only ground truth that will ever exist.**
8. **Recommended hybrid:** ingest → drop land-masked rows → apply pooled per-spot bias →
   **deterministic score `Q = S_dir·(S_size^0.4·S_wind^0.4·S_tide^0.2)`** → **LLM narrates only**.
   The LLM must never emit a number that was not computed upstream; enforce with a test.
9. **The number the owner is waiting on: ~10–30 reports per spot, from ≥5 distinct reporters,**
   is enough to beat the raw model there. It falls out of `n > (σ/b)²`. ~60 pins it to ±10 cm.
10. **Cold start is solved by partial pooling**, not special-cased: `b̂ = n/(n+τ)·b̂_spot +
    τ/(n+τ)·b̂_parent`. At `n=0` a new spot inherits the global prior automatically — which is
    also the real technical argument for going global.
11. **Build the immutable prediction log on day 1.** Forecasts cannot be reconstructed
    retroactively; every deferred day is training data lost forever. Cost: **~$0.01/month**
    (0.47 GB/year as partitioned Parquet). This is the highest-priority piece of engineering.
12. **At zero data, claim nothing about accuracy.** Day 1 we are better *organised*, better
    *explained*, and *honest about uncertainty* — all true, none requiring a rating. The
    closest published analogue (ML residual correction of NOAA waves) bought **5 % error
    reduction**, not 50 %.
13. **Kill list:** "AI weighs the sources" (fluent RNG, no error model, breaks evaluation);
    "perfect machine" (chaos + representativeness gap + label noise make it impossible);
    per-spot GBMs (needs thousands per spot); SWAN/XBeach; VLMs estimating wave size or
    counting surfers (**17 % counting accuracy; size from a single uncalibrated image is
    "ill-posed by design"** — big VLMs trail a text-only LLM).
14. **Honest ceiling: "meaningfully better than any single forecast at the spots our community
    reports on — and never better than the disagreement between two good surfers watching the
    same session."** Measure that human floor for free from same-spot double reports.
15. **The one metric that proves it works: pairwise spot-ranking accuracy versus the raw-model
    baseline** — of two spots rated the same day, did we call the better one? It is exactly the
    cousin's decision, it cancels each user's size bias, and **~400 comparison pairs** detects a
    10-point lift. Report it as skill against climatology, persistence and raw model — never as
    an absolute.


---

# 3. Statistical post-processing / MOS — the legitimate "AI fixes the forecast"

Sourced from a dedicated literature pass; all URLs accessed 2026-08-08.

## 3.1 MOS — what it is, and the exclusion that matters most to us

**[DEMONSTRATED]** Glahn & Lowry (1972), "The Use of Model Output Statistics (MOS) in
Objective Weather Forecasting", *J. Applied Meteorology* 11:1203–1211,
[DOI](https://doi.org/10.1175/1520-0450(1972)011%3C1203:tuomos%3E2.0.co;2).

NOAA MDL defines it ([vlab.noaa.gov/web/mdl/mos](https://vlab.noaa.gov/web/mdl/mos)) as
"determining a statistical relationship between a predictand and variables forecast by a
numerical model", credited with correcting "certain systematic NWP model biases",
quantifying uncertainty, and accounting for "deterioration [of] NWP model skill with
increasing forecast projection".

**The official limitation is the single most important sentence in this section.** The same
NOAA page states MOS **does NOT** correct "deficiencies in NWP model physics, analysis
schemes, or parameterizations" and cannot "predict events forced by **mesoscale features**."

**[DERIVED] That exclusion is exactly our problem.** A break's refraction, shoaling and
wind-shadow behaviour *is* sub-grid mesoscale forcing. **MOS corrects a systematic offset at
a point; it does not invent physics the model never resolved.** This bounds what our
learning loop can achieve and independently confirms the ceiling analysis in section 16.1 —
the learnable part is the *consistent offset*, not the missing physics.

*(Skill delta of MOS vs raw model: no figure retrieved. Reported comparison — CMOS 2.29 °F
MAE vs human forecasters 2.35 °F, [atmos.uw.edu/~jbaars/mvn_paper/mvn_extended.htm](https://atmos.uw.edu/~jbaars/mvn_paper/mvn_extended.htm) — compares MOS
variants and humans, not MOS vs raw model.)*

## 3.2 Kalman-filter bias correction — **~7 days to converge.** The best news in the document.

**[DEMONSTRATED — two independent sources]**

- Galanis & Anadranistakis, one-dimensional Kalman filter for near-surface temperature
  forecast correction — the method uses "a limited time interval (**7 days**)"
  ([Semantic Scholar record](https://www.semanticscholar.org/paper/A-one%E2%80%90dimensional-Kalman-filter-for-the-correction-Galanis-Anadranistakis/99a26091069811f849592457c0949516889e084b)).
- Delle Monache et al. (2011), *Mon. Wea. Rev.* 139:3554–3570,
  [DOI](https://doi.org/10.1175/2011mwr3653.1) — contrasts analog schemes against "standard
  Kalman filter approaches with **7-day running corrections**".
- Pelosi et al. (2017), *Mon. Wea. Rev.*, [DOI](https://doi.org/10.1175/mwr-d-17-0084.1),
  states the mechanism verbatim: adaptive Kalman MOS "continuously updat[es] correction
  parameters as new ground observations become available. **These techniques are valuable
  when long training datasets do not exist.**"

**[DERIVED] Why this matters enormously here.** Kalman/adaptive-MOS is recursive — it carries
a running state and updates per observation instead of refitting a long archive. **It is the
one established post-processing technique whose data requirement a young, sparse,
crowdsourced series can plausibly meet.** The ~7-day operational window is the same order of
magnitude as the ~10–30 observation threshold I derived independently in section 5.2, from
completely different reasoning. **Two independent routes landing on "days-to-weeks, not
years" is the strongest evidence in this document that the learning loop is feasible.**

**Recommendation:** the section 13.4 Stage-1 bias term should be implemented as a
**recursive/exponentially-weighted update**, not a batch mean. It converges fast, it adapts
when a model is upgraded (which happens without warning), and it needs no archive to refit.

## 3.3 Analog ensembles — genuinely powerful, and out of reach

**[DEMONSTRATED]** Delle Monache et al. (2013), *Mon. Wea. Rev.*,
[DOI](https://doi.org/10.1175/MWR-D-12-00281.1) — 550 stations, "equal or superior skill" to
logistic regression and ensemble MOS. Alessandrini et al. (2018),
[DOI](https://doi.org/10.1175/MWR-D-17-0314.1) — "unlike traditional dynamical ensembles, the
AnEn produces an **excellent spread–skill relationship**". Candido et al. (2020), *GRL*,
[DOI](https://doi.org/10.1029/2020gl089098) — "error reductions of 2–15 % for wind speed and
15–25 % for direction" vs ECMWF IFS.

**But the archive requirement kills it for us:**

| Source | Required training archive |
|---|---|
| [NCAR RAL](https://ral.ucar.edu/products/analog-ensemble-anen) (the method's home lab) | "typically **365 days**" |
| [EMS2018 downscaling](https://meetingorganizer.copernicus.org/EMS2018/EMS2018-652.pdf) | **5 years** |
| Alessandrini et al. 2018 | ~5 years (2011–15) |
| [DL analog variants](https://www.researchgate.net/publication/364569423_Optimizing_Analog_Ensembles_for_Sub-Daily_Precipitation_Forecasts) | "**~10 years** of hindcast data are required" |

And critically, the archive must be model history **joined to local observations** — Delle
Monache et al. (2018), *ACP*, [DOI](https://doi.org/10.5194/acp-2017-1214): "an archive of
prior analog predictions **paired with prior observations**."

**[DERIVED] Verdict: [HYPE / KILL] for this project.** Surf cares about relatively *rare*
large-swell events, which pushes toward the upper end of that range. Five years of paired
local observations is not a realistic MVP input. **Kalman (3.2), not AnEn.**

## 3.4 ML post-processing of wave forecasts — big gains, with a caveat that matters

**[DEMONSTRATED]** Kang et al. (2024), *Frontiers in Marine Science*,
[full text](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2024.1374902/full)
— transformer correcting FIO-COM significant wave height, NW Pacific:

| Lead time | Original RMSE | Corrected RMSE | Improvement |
|---|---|---|---|
| 24 h | 0.37 m | 0.21 m | **43.2 %** |
| 48 h | 0.38 m | 0.23 m | **39.5 %** |
| 72 h | 0.41 m | 0.28 m | **31.7 %** |

Zhang et al. (2023), [arXiv:2311.15001](https://arxiv.org/abs/2311.15001) — rolling
correction of 0–240 h ECMWF-IFS SWH: MAE decreased **12.97–46.24 %** (spring), **13.79–38.95 %**
(winter). Notably "co-driven by wave **and wind** fields, providing better results than those
based on wave fields alone."

> **⚠ Read the caveat before quoting these numbers.** Kang et al. used **ERA5 reanalysis as
> "observations"**, not buoys — the model was taught to match a reanalysis. Both studies
> corrected **offshore gridded fields**, and neither is Panama. Section 4.2's closest
> analogue that used *real* observations (Brazilian coast, ANN on the residual vs NOAA)
> bought **5 %**, not 40 %. **Plan for single-digit-to-low-double-digit percentage gains at
> a break, not 40 %.**

## 3.5 Zero local observations — the honest verdict, and what survives

**[DEMONSTRATED NEGATIVE]** Every technique in 3.1–3.4 is a **supervised** correction
requiring a paired (forecast, observation) series at or near the target. That follows from
the sources' own definitions — MOS needs a predictand; adaptive Kalman updates "as new ground
observations become available"; AnEn needs predictions "paired with prior observations".
**With zero local truth, none of them runs as designed.** This is not a gap in the search; it
is what the methods *are*.

### Satellite altimetry is definitively ruled out

**[DEMONSTRATED NEGATIVE]** — four independent retrievals converge:

| Finding | Value | Source |
|---|---|---|
| Standard products flagged/discarded near coast | **~20 km** | Passaro et al. (2021), *Nature Communications*, [PMC8217570](https://pmc.ncbi.nlm.nih.gov/articles/PMC8217570/) |
| Quality loss begins | ~10 km | [*Coastal Engineering*](https://www.sciencedirect.com/science/article/pii/S0378383922001880) |
| Best research retracker (ALES) reaches | ~3 km | Passaro et al. 2021 |
| **SWH at 3 km offshore is already** | **22 % below offshore value** | Passaro et al. 2021 |
| Jason-3 repeat cycle | **9.9 days** | [eoPortal](https://www.eoportal.org/satellite-missions/jason-3) |

**Even where altimetry data is valid, it is a biased proxy** — the documented 22 % nearshore
attenuation means offshore SWH systematically overstates the nearshore. Combined with a
~10-day revisit, **altimetry cannot be the observation stream for a surf break.** It remains
useful for validating *offshore* model skill in the Panama Bight.

### What genuinely survives with zero local truth

**[DERIVED]** Three things, and they are not nothing:

1. **Consume someone else's calibration instead of deriving your own.** ECMWF Set IV
   publishes ready-made **probability products** ("significant wave height of at least 2 m"
   through 8 m) plus Extreme Forecast Index
   ([ecmwf.int/en/forecasts/datasets/set-iv](https://www.ecmwf.int/en/forecasts/datasets/set-iv)).
2. **Multi-model / ensemble spread as a *relative* disagreement flag** — see 3.6.
3. **Verification hygiene** (section 3.7) so we do not mistake representativeness error for
   forecast failure.

## 3.6 CORRECTION to sections 8.4 and 14.3 — spread is weaker than I implied

**[DEMONSTRATED — and this qualifies my own earlier recommendation, so it goes in bold]**

- Whitaker & Loughe (1998), *Mon. Wea. Rev.* 126:3292,
  [DOI](https://doi.org/10.1175/1520-0493(1998)126%3C3292:trbesa%3E2.0.co;2): "**even for a
  perfect ensemble … there need not be high correlation between spread and skill**", and
  spread is most useful "**when it is either very large or very small compared to its
  climatological mean value**."
- Ebert (2001), *Mon. Wea. Rev.* 129:2461,
  [DOI](https://doi.org/10.1175/1520-0493(2001)129%3C2461:aoapms%3E2.0.co;2) — the canonical
  "poor man's ensemble" study: multi-model members "experience fewer systematic biases and
  errors causing underdispersive behavior compared to single-model ensemble prediction
  systems" **but** "**low values of spread–skill correlation indicate it is not possible to
  predict skill [from] spread alone.**"
- Eckel & Mass (2005), [DOI](https://doi.org/10.1175/waf843.1): multimodel "exhibited greater
  dispersion [and] superior performance", **but** "the spread of forecasts is insufficient to
  systematically capture reality."
- Actual magnitudes — Rupp et al. (2026), *Weather and Climate Dynamics* 7:767,
  [article](https://wcd.copernicus.org/articles/7/767/2026/): pattern correlation **0.44**
  against reanalysis; northern Europe **0.62**; eastern Canada "**robustly close to zero**"
  even with 100 members.

**[DERIVED] Three binding consequences for our design:**

1. **The `C_spread` term in section 14.3 must be treated as a qualitative flag, never a
   calibrated error bar.** Do not map spread to a metre-valued uncertainty. Our n≈3 is far
   below the n=7 whose "relatively small size" Ebert already flagged as the main weakness.
2. **Use spread only at the tails.** Per Whitaker & Loughe, spread carries usable signal when
   it is *unusually large or unusually small relative to that spot's climatological spread* —
   not in the middle of the distribution. **Redefine `C_spread` as a percentile of the spot's
   own historical spread distribution, not an absolute CV.** This is a concrete change to
   section 14.3 and it is better-founded than my original formulation.
3. **Spread-based confidence must be validated** by the section 10.2 calibration check before
   it is shown. Given the literature, it may not survive — and if it does not, **remove it**.

**Two claims that must not be merged** (both from Ebert, same study, same data):
multi-model combination **beating a single model on error** is DEMONSTRATED; multi-model
spread as a **calibrated uncertainty estimate** is NOT.

## 3.7 Verification hygiene — how not to falsely blame a forecast

**[ESTABLISHED PRACTICE]** The WWRP/WGNE Joint Working Group on Forecast Verification
Research maintains the reference metric set — "Brier score and its decomposition, Brier skill
score, reliability diagram, relative operating characteristic (ROC), relative value, ranked
probability score" ([cawcr.gov.au/projects/verification](https://www.cawcr.gov.au/projects/verification/verif_web_page.html)).

**Skill score against a reference is the point, and climatology is the standard reference.**
WGNE guidance: "The skill score version is chosen because it is **more robust with respect to
comparison over different samples**. Reference forecast normally should be **climatology**."
([wgne.net](https://wgne.net/publications/suggested-methods-for-precipitation-verification/)).
**This independently confirms the baseline design in section 10.1.**

**Two traps that will make us blame the forecast unfairly:**

**(a) Double penalty.** ECMWF, verbatim: "Even if increasing the resolution improves the
simulation's realism, traditional accuracy metrics that compare the forecast at each grid
point against its observed equivalent can be degraded. That is because of the so-called
'double penalty' issue."
([ecmwf.int science blog](https://www.ecmwf.int/en/about/media-centre/science-blog/2023/verifying-high-resolution-forecasts)).
Mechanism: a misplaced feature incurs "**one false alarm event and one missed event**"
([EMS2024-50](https://meetingorganizer.copernicus.org/EMS2024/EMS2024-50.html)) — so a
forecast with the *right swell at slightly the wrong time* scores worse than one that missed
the swell entirely.

**(b) Representativeness error.** "Accounting for Representativeness in the Verification of
Ensemble Precipitation Forecasts" (2020), *Mon. Wea. Rev.*,
[DOI](https://doi.org/10.1175/MWR-D-19-0323.1) — defines it as "to what extent observed
[value] at a single location is representative of over a larger area", finding "**a large
impact of representativeness on reliability and skill estimates**." Foundational: "Could a
perfect model ever satisfy a naïve forecaster? On grid box mean versus point verification"
(2008), [DOI](https://doi.org/10.1002/met.78).

**[DERIVED] Direct consequences for our scorecard (section 13.3):**
- A 0.25° cell is ~25 km across. Comparing it to one surfer's read at one break **conflates
  model error with representativeness error.** Some of the "bias" we measure is not the
  model being wrong — it is us asking it a question it never answered.
- **This is not a reason to skip the scorecard.** It is the reason the scorecard is
  *per-spot*: the representativeness offset is exactly the persistent, learnable component
  that section 5.1's `b_s` absorbs. But we must **label it "correction", not "model error"**
  — publicly blaming NOAA for a gap that is our own question's fault would be wrong and
  checkable.
- **Allow a timing tolerance when scoring swell arrival** (e.g. score against the best match
  within ±3 h) to avoid double-penalising a correct swell that arrived slightly early.

## 3.8 Two operational facts with deadlines attached

**[DEMONSTRATED]**

1. **Free wave ensembles genuinely exist** — this upgrades my earlier "UNVERIFIED" note in
   section 8.3. **NOAA GEFS-Wave / GWES: 31 members, 0.25°, out to 16 days**, real-time via
   NOMADS/FTP ([EMC](https://www.emc.ncep.noaa.gov/emc/pages/numerical_forecast_systems/gefs.php)).
   **ECMWF ENS: 51 members** coupled to ecWAM, with open data (swh, mwp, mwd at 0.25° GRIB2)
   under **CC-BY-4.0, redistributable and commercially usable**
   ([ecmwf.int open-data](https://www.ecmwf.int/en/forecasts/datasets/open-data)).
   **Note this partially rescues ECMWF**, which returned `null` through Open-Meteo (section
   8.3): the direct ECMWF open-data feed is a separate path worth testing.
2. **⚠ ECMWF open data retains only the most recent 12 runs — approximately 2–3 days.**
   Combined with section 13.1: **any local training archive must be accumulated forward
   starting now. It cannot be backfilled.** This is a second, independent confirmation that
   the prediction log is the urgent piece of work.

## 3.9 On showing uncertainty to non-experts — the research says do it

**[DEMONSTRATED]** Ripberger et al. (2022), "Communicating Probability Information in Weather
Forecasts", *Weather, Climate, and Society*,
[DOI](https://doi.org/10.1175/wcas-d-21-0034.1): "(1) **average people can make sense of
probability** if consideration is given to information [presentation]", and "(2) assuming
appropriate presentation, **probability generally improves decision quality**."

Morss et al. (2010), *Meteorological Applications*, [DOI](https://doi.org/10.1002/met.196):
"people have probabilistic thresholds for taking action"; "**many infer uncertainty into
deterministic forecasts**."

**[DERIVED]** That last finding settles the design debate: **users invent an uncertainty
impression whether or not we give them one.** The choice is not "show uncertainty or don't" —
it is "control the impression, or let them form a worse one." This is the strongest evidence
for section 14.4's "say when you don't know."

