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
| slice-01 | A surfer taps the confidence word on any row, Hoy or Mañana, and reads which thing the models split on in surfer words: el tamaño, el período o la dirección. When only one model can see the spot, the reason says there is nothing to compare instead of promising agreement. Rows stay clean at 390 px with the longer sentence. | sealed | @walking_skeleton; SEALED 2026-08-13 after rebase onto origin/main, on the SECOND Vera walk. The first returned INDETERMINATE for lack of data coverage; a controlled fixture surface was built to exercise the two unobservable oracle rows and Vera then returned PASS with every bullet observed and every negative held (see "Examination gap" below). That walk also found a real copy defect, fixed separately: the single-model sentence hardcoded "Hoy" and rendered on the Mañana page. Evidence: focused tags 5 scenarios / 112 steps green exit 0 with 0 skipped; `ci-local --fast` 11 passed / 0 failed / 0 skipped exit 0 (redirected to a file and read, never piped); a real falsifiability probe per step, each broken then reverted with `git diff` proving the revert (01-01 carriage removed collapsed all 20 reasons to the forbidden generic sentence; 01-02 member filter removed exploded the spread to {5.503, 8.892, 27.040} exactly as D5 documents; 01-03 `min-height` dropped measured touch targets to 29 px on all 20 rows); rendered `dist/` inspected directly, 20 per-variable reasons, zero generic fallback, longest 246 chars against the ≤280 bound; source-blind Vera **PASS** 2026-08-13 on the fixture walk, 80 disclosures, contrast 6.92:1 light and 8.69:1 dark (hero gradient computed by hand, worst stop 7.34:1, clears AA), every negative clean. | Closes the real gap named above: `summaries()` now carries `confidence_reason`, `Confidence.astro` composes from `spread_terms` via `modelAgreement()` with `DISAGREEMENT_THRESHOLD = 0.5` pinned to research 09 §7.5's own Venao oracle (D3), single-member ambiguity resolved honestly per D4, land-masked members excluded per D5. Commits 193955b, c785456, cad3180; acceptance contract `cuanto-puedo-confiar.feature`, 5 scenarios. |
| slice-02 | The tide number becomes real for every spot that can honestly reference a tide station, the tide factor rejoins the score, and "confianza alta" becomes reachable exactly where the models genuinely agree tightly, never by a lowered bar. Unmapped spots keep saying the tide is missing. | blocked | depends-on slice-01; blocked on the per-spot tide-station mapping policy | The mapping policy (which spots may honestly reference Balboa 9812501, under what stated phase-error criterion) is an open product decision owed by Andres, and `adr-tide-source-chain.md` is still Proposed, not Accepted. Building it without that decision would either misattribute one station to spots hundreds of km away (the exact move the capture's PROVENANCE refuses) or invent the policy ourselves. Not fakeable; waits. |
| slice-03 | If the calibration check ever proves the spread term lies, removing it is a data change: a per-factor enable flag in the constants, the level renders from the surviving factors, and the reason never names a term that no longer participates. | sealed | SEALED 2026-08-13. Contract 07016de (red for the right reason: 4 of 5 failed because `CONFIDENCE_FACTORS` did not exist), implementation 56ad4d3. Evidence: 5 scenarios / 123 steps green, vitest 623/623, tsc exit 0, build exit 0 with `dist` inspected, `ci-local --fast` 11 passed / 0 failed / 0 skipped exit 0, and two falsifiability probes reverted clean. Two recorded deviations: the `factors` parameter on `confidence()` carries a default because the excluded `src/pipeline/build.ts` calls it with five arguments (the default reads the live constant, so that caller still follows the switch; `modelAgreement`'s parameter, where the silent-render risk lives, is strictly required), and a second reading `spread_disabled` was added beside `no_usable_signal` because one reading alone would have printed "no hay señal usable" beside "Confianza alta". Non-visual, so no charter walk. | 05 §6.1's removal clause ("Participation is a per-factor enable flag in the constants file; disabling it is a data change") and the epic row's own kill-switch clause. The check itself stays with the learning lane (06 §10); this slice ships removability only, the seatbelt that must exist before anyone is tempted to keep a lying term because removing it would be rework. |
| slice-04 | The confidence story survives its only vendor: a second, independent wave source (raw NOAA `gfswave` GRIB2, US public domain) feeds the same member table through the registry seam, the prediction log records it per source, and a dark source shrinks the member count honestly instead of blanking a row or fabricating a member. | pending | depends-on slice-01 only | `adr-openmeteo-vs-raw-grib2.md` makes a provider swap a registry change plus one adapter; `src/pipeline/ports.ts` is the seam. The grib_filter URL is live-verified working and the GRIB2 fixture already exists on `build/f2-trust`. De-risks the waived Open-Meteo ToS question structurally. |
| slice-05 | The reason stops comparing models against nothing: once a spot's own spread history exists, "the models split worse than usual for this spot" replaces absolute thresholds, the only form research 09 says carries real signal. | blocked | depends-on slice-01; data-gated | Activation policy is settled and closed (`adr-spread-climatology-activation.md`): 30 distinct completed spot-local days of PublishedCall history. The log began accumulating 2026-08-08, so roughly 5 days exist on 2026-08-12. Shipping early would compare a day against a history that does not exist. Waits for data, not for work. |

## Examination gap, 2026-08-13: RESOLVED, and what it caught

**Outcome: Vera returned PASS on the second walk and slice-01 is sealed.** The fixture surface
below was built, both previously-unobservable oracle rows rendered, and she observed every bullet
and upheld every negative. Full evidence in her second Session log row.

**The fixture paid for itself immediately: it exposed a real defect that the live data could never
have shown.** The single-model sentence hardcoded `Hoy` ("Hoy solo un modelo alcanza a ver este
spot..."), so the **Mañana** page told a surfer "today". That branch had never rendered in an
examined build because no spot had single-model coverage on an examined day. It is a genuine
production defect on the reading surface, not a fixture artefact, and it is fixed separately with
a regression test. This is the argument for fixture-backed charter walks in one line: an oracle row
that never fires is not a passing oracle row, it is an unexamined one.

The record of why the gap existed is kept below, unedited, because the next lane will hit it again.

### The original gap

Vera examined the post-rebase build source-blind and returned **INDETERMINATE**. Read her full row
in the charter's Session log. The verdict is correct and is **not** a defect in this code.

What she confirmed, over 80 disclosure opens (20 rows x Hoy/Mañana x light/dark): all 40 reasons
name concrete `tamaño`/`período`/`dirección` in agreement-before-disagreement order, the settled
no-beach-report sentence is present 40 of 40, zero horizontal overflow, 44x44 px touch targets on
every summary, zero digits, percentages, meters or model identifiers anywhere, and measured
contrast of 6.92:1 light and 8.69:1 dark. Every charter negative came back clean.

Why she could not finish: **today's live surface contains no example of two in-scope oracle rows**,
so they were never exercised in either direction.

- Oracle bullet 3, the full-agreement phrasing ("coinciden en las tres cosas"): every published row
  today reads `low`, and no row shows three-way agreement.
- Negative 1, the single-opinion case ("no hay con qué comparar"): no spot has single-model
  coverage today.

Resolution, in flight: build a **controlled fixture surface** for the charter walk, the way this
repo already pins one for `daily-call-with-permanent-receipts` and `f-see-what-killed-it`, and the
way the palette lane on `origin/main` does at 80ae5b1 (it pins its isolated copy to Panama civil
today and clones a dawn receipt). The fixture must carry at least one full-agreement spot and one
single-model-coverage spot, built from honest synthetic member data, so both untriggered oracle
rows can actually be observed. Then re-run Vera source-blind against that surface.

Two rules on that fixture, so it stays honest: production behaviour is **not** changed to make a
row appear, and the charter is **not** weakened to dodge the gap. The point is to exercise the
oracle, not to lower it.

### Tooling refusals, recorded verbatim, never worked around

`des-record-examine` refused both invocations tried today, in two different ways, so no examine
record could be written by the tool and none was hand-written:

1. Run from the worktree root by the examiner: `/Users/andres/psb-multimodel-trust/roadmap.json
   does not exist`. The shim looks for `roadmap.json` at the worktree root rather than in the
   feature's `deliver/` directory.
2. Run with an explicit `--project-dir` pointing at `deliver/`: `Error: charter must be the contract
   path /Users/andres/psb-multimodel-trust/docs/feature/f-know-how-much-to-trust-it/deliver/docs/product/expectations/f-know-how-much-to-trust-it/la-razon-nombra-en-cual-cosa-los-modelos-no-se-ponen-de-acuerdo.md,
   not /Users/andres/psb-multimodel-trust/docs/product/expectations/f-know-how-much-to-trust-it/la-razon-nombra-en-cual-cosa-los-modelos-no-se-ponen-de-acuerdo.md`.
   The shim resolves `--charter` underneath `--project-dir`, but this repo keeps charters in
   `docs/product/expectations/`, so no valid argument exists.

The verdict therefore lives in the charter's Session log and in the execution log, which is where a
reader should look for it. Unlike `des-record-examine`, `des-log-phase` works (see W3).

### Product signals, flagged not fixed

Carried here as the motivating evidence for later slices, not treated as slice-01 bugs:

- **The surface is honest but non-discriminating today.** All 40 rows read "Confianza baja" and 24
  of 40 share a word-for-word identical sentence, so the ranking gives a surfer nothing to choose
  between spots on. This is exactly the gap slice-02 (the tide that makes `alta` reachable at all)
  and slice-05 (compare a spot against its own normal, rather than against absolute thresholds)
  exist to close. It is a strong argument for their priority, and an equally strong argument
  against "fixing" it by lowering the confidence bar.
- **`<details name="confidence">` makes the rows mutually exclusive.** Opening one reason
  auto-closes the previous one, so two spots cannot be compared side by side on a phone. Real,
  outside slice-01's charter.
- **The individual spot page carries no openable reason.** `/spots/<slug>/` shows "Confianza baja."
  only inside the copy/WhatsApp share payload, with no `<details>` and no `data-level`. The charter
  names only Hoy and Mañana, so this is out of its scope, but it is a genuine hole in the feature's
  promise on the one page a surfer lands on from a shared link.

## Wave: DELIVER / [REF] W4 scope amendment for slice-04, recorded 2026-08-13

This section executes wave decision W4 (below): the recorded, dated scope amendment slice-04 owes
before any of its code is written. It states exactly which paths enter the approved
`implementation_scope`, why slice-04 genuinely needs each one, and what stays excluded. The
matching mechanical edit to `deliver/roadmap.json`'s `excluded_patterns` rides this same commit,
so the scope change is never a silent config edit.

**Why an amendment at all.** The approved scope (`src/scoring/`, `src/data/`, `src/components/`)
was drawn for slice-01, whose rationale was "the producer already publishes everything required".
Slice-04's entire value is producer-side: a second, independent wave source
(raw NOAA `gfswave` GRIB2, US public domain) behind the registry seam. There is no honest way to
ship it inside the reading-surface directories. W4 predicted exactly this and required the
amendment to be recorded at this slice's JIT DISTILL rather than laundered through a config edit.

**Paths added, each with its need:**

1. `src/pipeline/adapters/` — the second-vendor adapter and the source registry declaration.
   `adr-openmeteo-vs-raw-grib2.md` decision 2 makes adding a provider "a registry edit plus one
   adapter", and both artifacts live here. Prior art is mined from `build/f2-trust`
   (`noaa-gfswave-grib2.ts`, 304 lines; `tests/unit/noaa-gfswave-source.test.ts`; a 2,652-byte
   captured grib_filter response with a reproduction receipt, sha256 `6997a999…`), but it was
   written against an older port shape and must be re-fitted to the current
   `fetchWavePayload`/`parseWaveMembers` split, not re-imported wholesale — W4's own warning is
   that mined prior art can silently re-import a rejected architecture. The store adapters in
   this directory (`filesystem-store.ts`, `s3-store.ts`) may be touched only insofar as the raw
   forensic archive must learn to carry a binary verbatim payload.
2. `src/pipeline/ports.ts` — types-only seam edit, only if needed: `ReceivedSourcePayload.verbatim`
   is a `string`, and grib_filter returns binary GRIB2 that cannot ride a JS string honestly.
   Condition: only the payload type may widen; no port method changes meaning.
3. `src/pipeline/ingest.ts` — the source loop only: `IngestDeps` composes exactly one
   `deps.source`, and per-source prediction-log rows from a second vendor plus the honest
   dark-source shrink require the core to iterate declared sources. Condition: the archive key
   grammar, write-once rules and cycle attribution stay untouched.
4. `src/pipeline/raw-archive.ts` — only if the forensic archive must carry a binary verbatim (its
   key grammar hardcodes `.json.gz`). The alternative is a JSON capture envelope (base64 body +
   sha256), the shape the existing fixture receipt already uses; if that path is taken this file
   is not touched.
5. `src/pipeline/capture-cli.ts` and `src/pipeline/lambda/fetch-handler.ts` — the composition
   roots where real runs compose their sources. The registry must be declared where production
   composes, so the adapter is a real `ForecastSource` and never a parser reachable only from
   tests (the prior-art adapter's own header states this bar).

**Stays excluded, restated so the carve-out is visible:** `src/pipeline/build.ts` (the producer
already lists every `src=` partition and consumers read nothing provider-shaped, ADR decision 2;
law L9 continues to hold because nothing here becomes readable by `combine()`),
`src/pipeline/static-publication.ts`, `src/pipeline/run-build-cli.ts`,
`src/pipeline/lambda/build-handler.ts` (the Bridge lane's contended file — its HIGH-1 fix owns it),
`src/pipeline/lambda/bundled-launch-seed-paths.ts`, `src/pipeline/lambda/log-events.ts`,
`src/publish/**`, `src/i18n/**`, `src/share/**`, `src/report/**`, `src/pages/**`,
`src/layouts/**`, `infra/**`, `public/**`, `scripts/**`.

**Deploy note.** Nothing in this amendment authorizes a deploy. The fetch handler's composition
change lands as code; `SurfsUpPanamaIngest` redeployment remains a human-run step outside this
lane, exactly as the archive-key change of 2026-08-13 was handled.

## Wave: DELIVER / [REF] Wave decisions

| # | Decision | Made by | Rationale |
|---|----------|---------|-----------|
| W2 | Step completion in this lane is proven by evidence under the HANDOFF §10 waiver-2 precedent, because the installed DES tooling malfunctions against this worktree: the DES Stop hook resolves its log path from another session's cwd (it created and validated a log shell in a foreign worktree), and the installed `des-log-phase` rejects the 3-phase canon name `RED`, accepting only the legacy 5-phase names. Evidence per step, quality bar unchanged: (1) the real RED run and the real GREEN run with captured exit codes, both falsifiable — every step still shows its failing test before its passing one; (2) focused slice tags green plus `ci-local --fast` with its real exit code and 0 skipped, output redirected to a file and read; (3) `des-log-phase` records written with absolute `--project-dir` into this worktree wherever the shim accepts them, and where it refuses, the refusal text recorded verbatim in the step contract JSON instead — never an invented entry; (4) a source-blind Vera PASS recorded via `des-record-examine` for user-visible steps. Crafter dispatches are marked DES-exempt so the misanchored hook stops blocking honest completions. | Session coordinator, 2026-08-12 | HANDOFF §10 "Waivers, recorded rather than hidden", waiver 2: when the DES gate tooling is absent or malfunctioning, the evidence replaces the gate and no gate is reported as passing that did not run. Recorded here so the next reader does not mistake the missing/partial DES phase records for skipped verification. |
| W4 | **Slice-03 needs no scope amendment; slice-04 will, and the policy is set here rather than at the moment of temptation.** Slice-03 stays inside the approved `implementation_scope` (`src/scoring/`, `src/data/`, `src/components/`). The mined slice-03 scenarios on `build/f2-trust` drive "esa mañana se arma y se publica con esa política de datos", i.e. through the producer, but that wiring is an artifact of the **rejected** bundle-side composer design, not of the slice's value. All four of its readings express at the seam this branch has: the enable flag is passed **into** `confidence()` (dependencies passed in, per the functional paradigm), the level falls out of the surviving factors, and the composed sentence is render-time. Slice-04 is the genuine exception: a second wave source is `src/pipeline/adapters/`, which `excluded_patterns` currently forbids. Amending the scope for slice-04 is therefore a recorded wave decision owed at that slice's JIT DISTILL, with its own justification, and never a silent edit to `excluded_patterns`. The exclusion's original rationale was slice-01-specific ("the producer already publishes everything required") and does **not** transfer automatically to later slices. | Session coordinator, 2026-08-13 | Prevents the ordinary failure where mined prior art silently re-imports a rejected architecture, and prevents scope creep from being laundered through a config edit. |
| W3 | **Correction to W2: `des-log-phase` is not broken and must not be skipped.** Re-verified 2026-08-13 on this worktree. The tool works; two of W2's three claims about it do not hold. It refuses only the 3-phase canon name, verbatim: `Error: Invalid phase 'RED'. Valid phases: PREPARE, RED_ACCEPTANCE, RED_UNIT, GREEN, COMMIT`. The prior lane's "not found" failures were a wrong `--project-dir`: `execution-log.json` lives in the feature's `deliver/` subdirectory, so the flag must point at `docs/feature/<id>/deliver`, not `docs/feature/<id>`. With that path the tool accepts records normally, and six honest phase events for 01-01, 01-02 and 01-03 were written this way. Falsifiability evidence for pre-DES steps is recorded under the legacy names that do fit it (`RED_ACCEPTANCE`, `RED_UNIT`), never as an invented `RED`. | Session coordinator, 2026-08-13 | W2 as written would tell every successor that the DES logging tool malfunctions here, so they would stop using a tool that works and fall back to prose records. A waiver must not outlive the defect it was written for. |
| W1 | The `confidence_reason` length bound moves from ≤160 to **≤280 characters per language** (`application-architecture.md` §7 P1 is superseded on this point; the SSOT edit is owed at finalize). | Session coordinator, 2026-08-12 | The bound and the settled copy cannot both hold: the mandated no-beach-report sentence (`HANDOFF.md` §5, settled, asserted by three slice-07 scenarios) is 168 characters alone, so ≤160 was violated by every rendered reason since slice-07 shipped. The settled copy wins; the bound moves. Measured worst case of the shipped composer: 246 characters (agreement-on-one, split-on-two reading plus the honesty sentence). 280 fits it with headroom and is itself a recognized short-message ceiling. No code enforces the old bound (verified: the only 160 references are a comment in `static-surface.ts` and a test-name rationale in `surface-enriched-fields.test.ts`), so this is a documentation decision, not a code change. |
