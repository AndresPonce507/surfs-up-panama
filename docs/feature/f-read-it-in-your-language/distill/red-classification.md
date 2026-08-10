# RED classification record

Feature: `f-read-it-in-your-language`
Slices: READ-01 through READ-08
DISTILL opened: 2026-08-10 on lane `build/f2-i18n` (base merge `e42195e`)

## Why this feature has authored scenarios ahead of per-slice JIT

The sibling features keep future-slice tests off disk (JIT rule, HANDOFF §1). This feature was
dispatched 2026-08-10 with the explicit instruction to author its acceptance scenarios at DISTILL
open, because a feature with no `.feature` files cannot enter DELIVER and that exact gap stalled a
session. The compromise honours both rules: READ-01's steps are REAL drivers observed RED today;
every later slice's steps are `pending` scaffolds (ADR-025 skip-marker convention) that its
DELIVER entry unskips and must observe as MISSING_FUNCTIONALITY before GREEN. DELIVER is not
allowed to edit the `.feature` files.

## Reconciliation at DISTILL open

This project uses the unified `feature-delta.md` model; per-wave `wave-decisions.md` files,
`docs/product/journeys/` and `docs/product/kpi-contracts.yaml` do not exist for any feature. All
three absences are warnings under graceful degradation, not blockers: the driving surfaces are
fully named by the DESIGN corpus (`application-architecture.md` §4, §10, §13) and the feature
delta. Result: **0 contradictions.** Specifically checked:

| # | Check | Result |
|---|---|---|
| A | Enum canon in the dispatch ("clean \| choppy \| blown_out", "bad \| ok \| good \| epic", one home) vs `src/data/report-vocab.ts` on disk | Identical; the f-tell-us gating decision is CLOSED, so nothing blocks READ-07's wire scenarios the way it once blocked f-tell-us slice-01 |
| B | Feature-delta Pre-requisite 4 (absolute alternates) vs `astro.config.mjs` line 25 | ANSWERED on disk; the hreflang scenarios assert full addresses |
| C | Pre-requisite 2 (English call-line source) | OPEN, DESIGN + producer lane. Scenarios do not choose between builder-emitted `call_en` and client-side composition: they assert the visible property only (English rows, no rendered `undefined`, no Spanish) |
| D | Pre-requisite 3 (English yesterday page for Spanish-minted receipts) | OPEN, DESIGN + Andres. The READ-05 scenario asserts the invariant BOTH honest options satisfy: no synthesized English narrative; either the Spanish quote or a stated absence |
| E | Pre-requisite 1 (English copy sign-off batch, toggle labels included) | OPEN, Andres. No scenario or step pins an unsettled English string; settled §10 verbatim strings are the only pinnable copy |

## Observed pre-DELIVER run (2026-08-10)

Command: `npm run test:at -- --tags "@feature-f-read-it-in-your-language" --format summary`,
output captured whole to a file, exit code read separately (never piped). Driving surface: the
worktree's already-built `dist/` tree (the visitor's real reading surface; `dist/en/` does not
exist, which is the feature). Result: **38 scenarios: 11 failed, 27 pending, 0 passed, 0
ambiguous, 0 undefined.** Every one of the 11 failures is an `AssertionError` reached at a
behaviour oracle — no import error, no step-match error, no fixture error.

| Scenario (feature file) | Classification |
|---|---|
| A visitor who does not read Spanish flips the toggle and reads today's coast | MISSING_FUNCTIONALITY — the Spanish home carries no toggle link to `/en/` (Base.astro drops `altPath`, renders no toggle) |
| The visitor flips to tomorrow without leaving their language | MISSING_FUNCTIONALITY — no page emitted at `/en/` |
| One tap on the toggle lands straight back on the twin page | MISSING_FUNCTIONALITY — no page emitted at `/en/tomorrow/` |
| Every link on an English page keeps the visitor in the English tree | MISSING_FUNCTIONALITY — the built site emits no English page at all |
| A saved address opens in the language the visitor chose | MISSING_FUNCTIONALITY — pages carry a lone self-referential Spanish alternate, no English alternate, relative not absolute |
| No script ever decides the visitor's language | MISSING_FUNCTIONALITY — no page emitted at `/en/` (the no-machinery half is coverable the moment the tree exists) |
| The English tree never shows half-translated text | MISSING_FUNCTIONALITY — zero English pages to read |
| The English pages are born inside the byte ceilings | MISSING_FUNCTIONALITY — the vacuity guard fires: zero English pages means the ceiling claim would be vacuously green, so the step demands the tree first |
| The yesterday page's address flows from the route map | MISSING_FUNCTIONALITY — `routes.ts` has no `yesterday` builder (HANDOFF §6 item 2 settles the twin; `ayer.astro` hand-types its path) |
| A ranked row leads to that spot's own page in English (READ-05, chained Given) | MISSING_FUNCTIONALITY upstream — fails at the chained `Given` (no English home). Becomes pending-at-When once READ-01 lands; its own oracles unskip at READ-05 |
| One tap on the English tree pastes the call in English (READ-06, chained Given) | MISSING_FUNCTIONALITY upstream — same chained `Given`; own oracles unskip at READ-06 after f-paste slices 01-04 land |
| The language toggle is comfortably tappable on every page | PENDING scaffold — U3 is a browser measurement; rides the UI gate mechanism at READ-01 DELIVER (HANDOFF §4 reuse convention), deliberately not faked as a markup grep |
| All 26 remaining scenarios (READ-02, READ-03, READ-04 fixture scenarios, READ-05 oracles, READ-06 preview, READ-07, READ-08) | PENDING scaffolds — unskipped at each slice's DELIVER entry; contract below |

## Classification contract for each slice's DELIVER entry

1. Replace that slice's `pending` step bodies with real drivers; observe every scenario of the
   slice fail as MISSING_FUNCTIONALITY (assertion at the behaviour oracle) before writing
   production code. `IMPORT_ERROR`, `FIXTURE_BROKEN`, `SETUP_FAILURE`, undefined or ambiguous
   steps are BROKEN and block the slice.
2. READ-02/03/04 check scenarios drive their check against CONTAINED seeded fixtures, the f-bill
   shape recorded in `docs/architecture/atdd-infrastructure-policy.md`: copied universe, no
   symlinks, the repository provably unchanged after the run, and each check demonstrated red at
   least once against a seeded offender (unfired-is-not-evidence). The local CI jobs table
   (`scripts/ci-local-core.mjs`) is a contended seam: READ-02/03/04 add their jobs serially
   (feature-delta Pre-requisite 5c).
3. READ-05/06/07 scenarios drive the real built surface (and for READ-07's wire scenario, the
   real committed record through the report island's seam); wire assertions compare BYTES and
   canonical tokens from `src/data/report-vocab.ts`, never display labels.
4. Load-bearing tags are already in place and must not be restructured: file-level
   `@feature-f-read-it-in-your-language` above every `Feature:`, and BOTH `@READ-NN` (the plan's
   slice ids, per dispatch hard rule) and `@slice-NN` (the mechanical id the carpaccio gate and
   `cucumber.mjs` document) on EVERY scenario, plus `@covers-Rn` against
   `distill/requirement-checklist.md`. Feature-level tags do not inherit downward.
5. No scenario may be made green by fixture work alone: if a scenario passes without production
   code changes, the scenario is misauthored (No Fixture Theater) — fix the test, do not bank
   the green.
6. Append each slice's observed RED run below this line, keystone format: exact command, then one
   row per scenario with the observable exercised and the classification.

## Peer review at DISTILL open (2026-08-10)

Sentinel (`nw-acceptance-designer-reviewer`) verdict: **conditionally_approved** — 0 blockers,
2 high, 4 low. Both highs fixed same day before commit: (a) the Spanish-leak guard vocabulary was
extended to the Translation inventory's diacritic-free day-one offenders (structural detection
remains READ-02's job; the step guard now covers the known offender list), and (b) the
tree-crossing oracle was made symmetric — it now walks BOTH trees, so a Spanish page linking into
`/en/` anywhere but the toggle fails the same way as the reverse (R3 whole). One low fixed
(redundant test-world assertion removed from the twin-landing oracle). Three lows recorded as
deliberate decisions:

1. **R18 "never a hand-typed path"**: the emitted artifact cannot distinguish whether the page
   read the route map or hand-typed the same string. The acceptance oracle covers map↔tree
   agreement; the "flows from the route map" clause is enforced at READ-04 DELIVER by the
   route-conformance check's design plus code review of `ayer.astro`. Not a fake source-grep AT.
2. **Segment-map duplication in the harness**: `SEG_ES_TO_EN` in the steps mirrors the mapping
   `routes.ts` owns, because the route map exposes builders, not the mapping data. READ-04's
   DELIVER must either export the mapping as data from `routes.ts` (one home, harness imports it)
   or extend its check to police the second home. Recorded so it cannot drift silently.
3. **Composite `When` in the READ-08 capstone** ("The epic sentence walks end to end"): a
   deliberate `@e2e` exception to the one-action rule — it is the epic's Definition of Done row 1
   as one walkable journey. Every behaviour inside it is separately covered by the chained
   scenarios of READ-01..07; the capstone proves the composition.

## Entries

None beyond the DISTILL-open run above.
