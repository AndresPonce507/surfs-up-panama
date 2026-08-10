# A correction file can never move a number past the gates
ID: EXP-f-forecast-learns-from-the-beach-2 · Slice: 02 · Classification: non-visual

## Intent
A stored correction is an untrusted input. The reader, apply rule, and builder must reject or clamp
it before any published number could move.

## Preconditions
- Slice-02 has freshly re-run RED after its own parked marker is removed.
- Pre-requisite 1, the owned `build.ts` wiring edit, is complete before end-to-end evidence.
- The learning ADRs are accepted and reconciled.

## Observable contract
- Malformed or foreign-unit records become absent with a named event.
- A forged `applied` record cannot bypass G1-G3.
- Height and score clamps bind at apply time.
- Deleting a once-passing record restores day-zero values and a `no_file` archive reason.

## N/A visual rationale
The evidence is archived JSON and scoring output. This slice adds no HTML, styles, routes, or user
state. U1-U7 are N/A. The first public-surface observation belongs to slice-07.

## Session log (append-only)
| Date | Examiner | Verdict | Evidence |
|------|----------|---------|----------|
