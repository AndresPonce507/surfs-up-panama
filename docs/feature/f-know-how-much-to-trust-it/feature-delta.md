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
  asserted by three slice-07 scenarios. Resolved 2026-08-12 as a wave decision: the bound moves.
  See "Wave: DELIVER / [REF] Wave decisions" below, decision W1.
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

## Wave: DISCUSS / [REF] Slice Plan

Adopted 2026-08-12 by the DELIVER lane on `build/f2-trust-multimodel`. Slices 02 through 05 are
mined from the pre-adoption plan on `build/f2-trust` (its feature-delta, Slice Plan section) and
keep that plan's numbering so its fixtures and scenario sketches still line up
(`slice-02-tide-station-profiles.json`, `slice-05-climatology-profiles.json` on that branch).
Slice-01 is the adopted, narrower scope this branch actually shipped: render-time composition from
the already-published `spread_terms`, not the bundle-side per-spot composer the old plan described.

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer taps the confidence word on any row, Hoy or Mañana, and reads which thing the models split on in surfer words: el tamaño, el período o la dirección. When only one model can see the spot, the reason says there is nothing to compare instead of promising agreement. Rows stay clean at 390 px with the longer sentence. | in-flight | @walking_skeleton; implementation committed, seal (Vera record + gate evidence) in progress 2026-08-12 | Closes the real gap named above: `summaries()` now carries `confidence_reason`, `Confidence.astro` composes from `spread_terms` via `modelAgreement()` with `DISAGREEMENT_THRESHOLD = 0.5` pinned to research 09 §7.5's own Venao oracle (D3), single-member ambiguity resolved honestly per D4, land-masked members excluded per D5. Commits 90e19f4, 338cac2, 1a5886b; acceptance contract `cuanto-puedo-confiar.feature`, 5 scenarios. |
| slice-02 | The tide number becomes real for every spot that can honestly reference a tide station, the tide factor rejoins the score, and "confianza alta" becomes reachable exactly where the models genuinely agree tightly, never by a lowered bar. Unmapped spots keep saying the tide is missing. | blocked | depends-on slice-01; blocked on the per-spot tide-station mapping policy | The mapping policy (which spots may honestly reference Balboa 9812501, under what stated phase-error criterion) is an open product decision owed by Andres, and `adr-tide-source-chain.md` is still Proposed, not Accepted. Building it without that decision would either misattribute one station to spots hundreds of km away (the exact move the capture's PROVENANCE refuses) or invent the policy ourselves. Not fakeable; waits. |
| slice-03 | If the calibration check ever proves the spread term lies, removing it is a data change: a per-factor enable flag in the constants, the level renders from the surviving factors, and the reason never names a term that no longer participates. | pending | depends-on slice-01 only; non-visual | 05 §6.1's removal clause ("Participation is a per-factor enable flag in the constants file; disabling it is a data change") and the epic row's own kill-switch clause. The check itself stays with the learning lane (06 §10); this slice ships removability only, the seatbelt that must exist before anyone is tempted to keep a lying term because removing it would be rework. |
| slice-04 | The confidence story survives its only vendor: a second, independent wave source (raw NOAA `gfswave` GRIB2, US public domain) feeds the same member table through the registry seam, the prediction log records it per source, and a dark source shrinks the member count honestly instead of blanking a row or fabricating a member. | pending | depends-on slice-01 only | `adr-openmeteo-vs-raw-grib2.md` makes a provider swap a registry change plus one adapter; `src/pipeline/ports.ts` is the seam. The grib_filter URL is live-verified working and the GRIB2 fixture already exists on `build/f2-trust`. De-risks the waived Open-Meteo ToS question structurally. |
| slice-05 | The reason stops comparing models against nothing: once a spot's own spread history exists, "the models split worse than usual for this spot" replaces absolute thresholds, the only form research 09 says carries real signal. | blocked | depends-on slice-01; data-gated | Activation policy is settled and closed (`adr-spread-climatology-activation.md`): 30 distinct completed spot-local days of PublishedCall history. The log began accumulating 2026-08-08, so roughly 5 days exist on 2026-08-12. Shipping early would compare a day against a history that does not exist. Waits for data, not for work. |

## Wave: DELIVER / [REF] Wave decisions

| # | Decision | Made by | Rationale |
|---|----------|---------|-----------|
| W2 | Step completion in this lane is proven by evidence under the HANDOFF §10 waiver-2 precedent, because the installed DES tooling malfunctions against this worktree: the DES Stop hook resolves its log path from another session's cwd (it created and validated a log shell in a foreign worktree), and the installed `des-log-phase` rejects the 3-phase canon name `RED`, accepting only the legacy 5-phase names. Evidence per step, quality bar unchanged: (1) the real RED run and the real GREEN run with captured exit codes, both falsifiable — every step still shows its failing test before its passing one; (2) focused slice tags green plus `ci-local --fast` with its real exit code and 0 skipped, output redirected to a file and read; (3) `des-log-phase` records written with absolute `--project-dir` into this worktree wherever the shim accepts them, and where it refuses, the refusal text recorded verbatim in the step contract JSON instead — never an invented entry; (4) a source-blind Vera PASS recorded via `des-record-examine` for user-visible steps. Crafter dispatches are marked DES-exempt so the misanchored hook stops blocking honest completions. | Session coordinator, 2026-08-12 | HANDOFF §10 "Waivers, recorded rather than hidden", waiver 2: when the DES gate tooling is absent or malfunctioning, the evidence replaces the gate and no gate is reported as passing that did not run. Recorded here so the next reader does not mistake the missing/partial DES phase records for skipped verification. |
| W1 | The `confidence_reason` length bound moves from ≤160 to **≤280 characters per language** (`application-architecture.md` §7 P1 is superseded on this point; the SSOT edit is owed at finalize). | Session coordinator, 2026-08-12 | The bound and the settled copy cannot both hold: the mandated no-beach-report sentence (`HANDOFF.md` §5, settled, asserted by three slice-07 scenarios) is 168 characters alone, so ≤160 was violated by every rendered reason since slice-07 shipped. The settled copy wins; the bound moves. Measured worst case of the shipped composer: 246 characters (agreement-on-one, split-on-two reading plus the honesty sentence). 280 fits it with headroom and is itself a recognized short-message ceiling. No code enforces the old bound (verified: the only 160 references are a comment in `static-surface.ts` and a test-name rationale in `surface-enriched-fields.test.ts`), so this is a documentation decision, not a code change. |
