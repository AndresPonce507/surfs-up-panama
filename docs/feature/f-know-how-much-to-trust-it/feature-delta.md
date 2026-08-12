# F-KNOW-HOW-MUCH-TO-TRUST-IT — feature delta

JIT-DISTILL, written 2026-08-11 by the DELIVER lane on `build/f2-trust-multimodel`, because this
feature never ran DISCUSS or DISTILL and no workspace existed. Everything below is grounded in
research already on disk; nothing here re-derives a decision.

Value statement (`docs/epic/surfs-up-panama/epic-delta.md`, F-KNOW-HOW-MUCH-TO-TRUST-IT row):

> A surfer sees a confidence level on every row and taps it to read why in plain Spanish, for
> example that the models agree on size but split badly on period, so if it is the 15 second swell
> it is on.

## What was ALREADY on `origin/main` at 6eeb4fc, before this lane started

This matters more than usual, because the brief handed to this lane described three of its four
items as unbuilt. They were built. Measured, not assumed:

| Brief item | Actual state at 6eeb4fc | Evidence |
|---|---|---|
| "Extend the adapter to pull the 4 named models; current code queries only implicit `best_match`" | **Already built.** `WAVE_MODELS` is exactly the four verified-usable identifiers and `marineUrl()` already sends `models=`. | `src/pipeline/adapters/open-meteo-source.ts:22`, `:218` |
| "Land-masked cell guard needs a unit test" | **Already built and tested at the parse layer**, and the real capture confirms it fires: 240 of 1920 rows are `H=0,T=0`, all 240 flagged, and `ncep_gfswave025` is fully masked at Playa Cambutal (144 rows). | `open-meteo-source.ts:156`; `tests/unit/open-meteo-source.test.ts:59` |
| "Confidence must ship as a qualitative flag, never a score" | **Already built.** `conf_level` is a three-bucket flag, rendered as "Confianza alta/media/baja" on every ranked row with the reason one tap away. | `src/scoring/confidence.ts`, `src/components/Confidence.astro`, slice-07 scenarios |
| "A confidence indicator on every spot row, tappable" | **Already built.** | `src/components/RankedList.astro:102` |

So the brief's items 1, 2 and 4 are done. The feature is NOT done, and the gap is item 3's second
half, which is the part the epic row actually promises.

## The real gap this slice closes

Research 09 §8.4, third bullet, and §14.4 both say the same thing, and neither is satisfied today:

> **Report spread in the variable, not just overall.** "They agree on size but disagree on period"
> is genuinely actionable to a surfer and is exactly what happened at Venao today. (§8.4)

> **Name the specific disagreement**, never a generic "conditions may vary". (§14.4)

What the surface says today is the generic form §14.4 forbids: `confidenceReasonEs(level)` is keyed
on the level alone and returns "Los modelos coinciden solo en parte". The per-variable truth is
already computed and already published, on all 60 calls of `data/published-surface.json`, as
`confidence_reason.spread_terms = { height, period, direction }`. Two links drop it on the floor:

1. `src/data/forecast.ts` `summaries()` copies six fields and never copies `confidence_reason`.
2. `src/components/Confidence.astro` derives its sentence from `level` alone.

This slice connects those two links and composes the honest per-variable sentence. No new data is
invented, no republish is needed, and `src/pipeline/build.ts` is **not touched** — the producer
already publishes everything required.

## Decisions, each with the research that settles it

### D1 — qualitative flag, never a calibrated number

Research 09 §3.6 (which explicitly wins over §8.4 and §14.3 wherever they conflict) downgrades
spread on four studies: Whitaker & Loughe 1998 ("even for a perfect ensemble … there need not be
high correlation between spread and skill"), Ebert 2001 ("low values of spread-skill correlation
indicate it is not possible to predict skill from spread alone"), Eckel & Mass 2005, and Rupp et
al. 2026 (pattern correlation 0.44, and "robustly close to zero" over eastern Canada even with 100
members). Binding consequence 1 of that section: "must be treated as a qualitative flag, never a
calibrated error bar. Do not map spread to a metre-valued uncertainty."

So this slice ships **words**, not a percentage, and it adds no new number to the surface.

### D2 — displayed beside the call, never folded into it

Research 09 §7.5: folding uncertainty into the quality number "makes a confidently-bad day and an
uncertain-good day render identically, which destroys the one thing the user needs." Law L9 in
`src/scoring/confidence.ts`'s header already enforces this structurally: nothing confidence returns
is readable by `combine()`. This slice adds a **render-time** function only. It touches no score, no
ranking, and no sub-score.

### D3 — the disagreement threshold comes from the research's own worked example, not from taste

A per-variable sentence needs a cut on each `spread_terms` value. The terms are `(CV/c)²` with
`c1 = 0.25`, `c2 = 0.20`, `c3 = 30°` from §7.5. The threshold is pinned by §7.5's own worked Venao
numbers and the sentence the research itself writes from them:

```
height 0.239    period 0.832    direction 0.090
→ "Models agree on size and direction but split badly on period"
```

That reading forces `0.239 < threshold ≤ 0.832`. **`DISAGREEMENT_THRESHOLD = 0.5`** sits inside that
interval, and it has a plain meaning of its own: a term reaches 0.5 exactly when the spread has
grown to about 71 % of its own calibration constant. The Venao oracle is a **test**
(`tests/unit/model-agreement.test.ts`), not a comment, so the threshold cannot drift away from the
sentence the research wrote.

Checked against the 60 real published calls, the flag is not degenerate:

| Reading | Calls |
|---|---|
| all three variables agree | 32 |
| agree on period and direction, split on size | 11 |
| agree on size and direction, split on period | 2 |
| not comparable (see D4) | 15 |

### D4 — all-zero terms are ambiguous, and the ambiguity is resolved honestly

`absoluteSpreadTerms` returns `{0,0,0}` in two very different situations: every model agreed
perfectly, or **fewer than two models could see this spot at all**. `members_used` is not on
`SurfaceCall`, so the surface cannot tell them apart directly. Rendering "todos los modelos
coinciden" off a single model would be claiming certainty from one opinion, which is the exact
failure the project rule forbids ("Never claim more certainty than the data earns").

It is resolvable without touching the producer. A single-member row has `c_spread` capped at 0.4 by
`f(M)` (§7.5, `05-scoring-engine.md` §6.1), so `c_total ≤ 0.4`, so `level === 'low'`. Therefore
**`level !== 'low'` proves at least two members participated.** The rule this slice ships:

- all-zero terms **and** level `low` → `not_comparable`. The copy says only one model can see this
  spot and there is nothing to compare. It never claims agreement.
- all-zero terms **and** level `medium` or `high` → genuine agreement between two or more models.

The cross-tab on the real 60 calls confirms both branches fire: 15 zero+low, 9 zero+medium.

### D5 — the fake zero must be excluded from the spread, not only from the blend

Research 09 §8.3 Finding 2 is the one already-verified defect the research demands a day-one guard
for: some models return `H=0, T=0` simultaneously, which is a land-masked grid cell and not a flat
ocean, and "any spot-score pipeline **must** treat `H == 0 && T == 0` as *missing*, not as *flat*."

The parse layer flags it (`land_masked`) and `blend()` independently refuses it with
`member.swell.t_s > 0`. **`confidence()` had no such guard**, and it consumes the same member list.
Measured on this branch before the fix, three real Venao members plus one fake-zero member:

```
blend        without zero: h 0.693  t 14.20   with zero: h 0.693  t 14.20   (correctly excluded)
spread_terms without zero: {0.127, 0.419, 0.071}
spread_terms with zero   : {5.503, 8.892, 27.040}      level medium → low
```

So a fake zero that reaches confidence does not merely nudge the reading, it drives every variable
far past the disagreement threshold and makes the surface announce that the models disagree about
everything while three real models actually agree well. That is precisely "confidently wrong" one
layer above where the research caught it.

The fix is **not** a widening of the parse-level rule. §8.3 states the signature as all three fields
zero, the real capture agrees (240 of 240 zero rows also have `dir == 0`), and the existing test is
named after the three-field rule. The fix is that `confidence()` adopts the **same usable-member
predicate `blend()` already applies** — `h_m >= 0 && t_s > 0` — so the two consumers of one member
list stop disagreeing about which members exist. One rule, both consumers.

## Out of scope, flagged not fixed

- **The `dominant` field is currently useless for this purpose.** Every one of the 60 published
  calls reports `dominant: 'missing_data'`, because tide is dark at every spot and `missing_data`
  short-circuits the spread comparison in `confidence()`. This slice therefore reads `spread_terms`,
  which carries the real per-variable signal, and does not read `dominant`. Reworking `dominant` so
  it can report a spread term while data is also missing belongs to whoever owns the producer.
- **The ≤160-character bound on `confidence_reason`** (`application-architecture.md` §7 P1, restated
  in `adr-enriched-fields-reach-the-reading-surface.md`) **is already violated on `origin/main`**:
  the rendered sentence is 209 characters, because the mandated no-beach-report sentence is 168 on
  its own. Naming the variables takes it to roughly 240. This lane did not reword the honesty
  sentence, which is settled product copy (`HANDOFF.md` §5, "settled, not to be relitigated") and is
  asserted by three slice-07 scenarios. Flagged for the copy owner: either the bound moves or the
  honesty sentence is shortened, and that is a product decision, not a DELIVER one.
- **The percentile form of `c_spread`** that §3.6 consequence 2 recommends needs a spot's own
  historical spread distribution, which needs the keystone prediction log to accumulate first. Not
  reachable today, correctly deferred by the epic row.
- **The §10.2 calibration check** that §3.6 consequence 3 requires before spread-based confidence is
  shown cannot run without ground truth (§0: there is not one wave buoy on Pacific Central America).
  This is why the slice ships **agreement between models** as its literal claim and says so in the
  copy, rather than any claim about accuracy.

## Prerequisite waived by Andres

The epic row's Open-Meteo terms-of-service email is knowingly skipped: hobby project, roughly 20
users, risk accepted 2026-08-11.
