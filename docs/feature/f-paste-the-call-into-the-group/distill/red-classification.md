# RED classification history

Feature: `f-paste-the-call-into-the-group`
Slices entered: none
Status: workspace open (2026-08-09); no slice has entered JIT DISTILL

## Contract for every future entry

When a slice of this feature enters JIT DISTILL, its pre-delivery RED run is recorded here,
append-only, in the keystone's format
(`docs/feature/daily-call-with-permanent-receipts/distill/red-classification.md`):

1. Record the exact commands observed, then one row per scenario with the observable
   exercised, the classification, and the behavior oracle reached.
2. The only acceptable RED is `MISSING_FUNCTIONALITY`: the scenario reaches its production
   driving surface and fails at its individual behavior oracle. A failure during import,
   fixture construction, step matching, browser startup or runner setup is BROKEN and blocks
   handoff until the test is fixed.
3. Scenarios drive production entry points only: the real `npm run build` over the installed
   public input, the emitted `dist/` served over HTTP, and Chromium at 390 px for visible
   observables. No fixture-only wiring may satisfy an oracle that the built surface owes.
4. Slice-01 must additionally record the observed branch of the `wa.me/?text=` live check
   (R5 in `requirement-checklist.md`): anchor verified working, or anchor struck and the
   clipboard island promoted to the floor. That record is a product fact, not test evidence,
   and later slices read it from here.
5. No later-slice acceptance tag may be authored ahead of its turn. The JIT rule is the
   default for this feature; the one recorded relaxation (keystone slices 06 to 08 opened in
   parallel on instruction, HANDOFF §10 waiver 1) was a deliberate call for that build and
   carries no precedent here.

## Entries

None yet.
