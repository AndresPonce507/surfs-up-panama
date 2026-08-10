# The fit refuses until the evidence earns it
ID: EXP-f-forecast-learns-from-the-beach-1 · Slice: 01 · Classification: non-visual

## Intent
The nightly fit may write a correction only when the declared gates earn it. Invented inputs prove
machinery only. They never prove learning, accuracy, or a real change to the public forecast.

## Preconditions
- Slice-01 has entered DELIVER and its parked marker is removed.
- The three learning ADRs are accepted and their scoring reconciliation is recorded.

## Observable contract
- Zero reports write no correction.
- Thin, ineligible, insignificant, or coordinated evidence is refused with its count and gate.
- A passing fixture records only the declared correction schema and gates.
- With an absent or refusing correction, the published bundle is byte-identical to day zero.

## N/A visual rationale
This slice emits correction records and source-declaration reports only. It changes no rendered
value or HTML. U1-U7 are N/A. Any claim that fixture output proves a better forecast is a failure.

## Session log (append-only)
| Date | Examiner | Verdict | Evidence |
|------|----------|---------|----------|
