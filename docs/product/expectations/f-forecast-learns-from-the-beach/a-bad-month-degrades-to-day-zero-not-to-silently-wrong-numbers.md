# A bad month degrades to day zero, not silently wrong numbers
ID: EXP-f-forecast-learns-from-the-beach-5 · Slice: 05 · Classification: non-visual

## Intent
The monthly check must turn every correction off when held-out evidence loses, while retaining an
auditable operator record of why.

## Preconditions
- Slice-05 has freshly re-run RED after its own parked marker is removed.
- Slices 01-04 are complete and the correction-gates ADR is accepted and reconciled.

## Observable contract
- Rolling-origin time blocks, never shuffled folds, decide the monthly verdict.
- A losing fixture month sets every correction to `applied: false`.
- The metrics record names calibration failure, selection imbalance, and shrinkage alarms.

## N/A visual rationale
The monthly metrics file is an operator record, not a new user interface. U1-U7 are N/A. A fixture
month only proves the kill-switch mechanism and may not support a forecast-quality claim.

## Session log (append-only)
| Date | Examiner | Verdict | Evidence |
|------|----------|---------|----------|
