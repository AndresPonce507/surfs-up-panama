# RED classification history

Feature: `f-see-what-killed-it`
Slices entered: none
Status: workspace open (2026-08-09); no slice has entered JIT DISTILL

## Contract for every future entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed, then one row per scenario with the observable exercised,
   the classification, and the behavior oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behavior oracle. A failure during import, fixture
   construction, step matching, browser startup or runner setup is BROKEN and blocks handoff
   until the test is fixed.
3. Scenarios drive production entry points only: the real `npm run build` over the installed
   public input, the emitted `dist/` served over HTTP, and Chromium at 390 px for visible
   observables. No fixture-only wiring may satisfy an oracle that the built surface owes.
4. Slice-01 must additionally record, as a product fact, the verified pre-delivery state of the
   reading-surface gap: `weakest_link` present in the region bundle day summaries and receipts
   but absent from `data/published-surface.json` (0 occurrences at workspace creation). The RED
   for R1/R3 must fail because the surface lacks the field, not because the engine lacks the
   value; later slices read that distinction from here.
5. Slice-03 must record the exactness evidence of R11 at RED time: the fixture's published
   `damages`, the recomputed `round(100 * exp(-(D - d_w)))`, and the expected published field,
   so the oracle is arithmetic on record, never a snapshot number nobody can re-derive.
6. Slice-04 may not enter DISTILL while the windState null→"limpio" defect
   (`src/pipeline/build.ts` lines 290-294; Pre-requisite 2, BUGFIX lane) is unfixed; the entry
   recording slice-04's RED must cite the commit that fixed it.
7. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the default
   for this feature; the one recorded relaxation elsewhere (keystone slices 06 to 08 opened in
   parallel on instruction) was a deliberate call for that build and carries no precedent here.

## Entries

None yet.
