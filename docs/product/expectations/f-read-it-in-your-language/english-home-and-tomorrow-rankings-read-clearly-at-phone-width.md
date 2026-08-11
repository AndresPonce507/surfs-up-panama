# English rankings remain readable on a phone

## Intent

A reader who opens the English home or tomorrow ranking can understand each
row without words from adjacent rows running together.

## Preconditions

From `/Users/andres/psb-i18n`, build the site, run `npm run preview`, and use
the local Astro preview at a 390 px-wide viewport. Open `/en/` and
`/en/tomorrow/`.

## Charter

Read the opening card and several ordinary ranked rows on both pages. Compare
the visible rank, spot name, score, size, wind, call, and confidence line as
a person reading the forecast would. This charter covers only the emitted
English home and tomorrow pages. The language toggle and other English routes
remain deferred to their roadmap steps.

## Expected observations

- Both pages show an English twenty-spot ranking with a distinct hero card.
- Each ordinary row keeps its size and wind on a readable fact line, followed
  by that row's call and confidence, without clipping or colliding with the
  next row.
- Negative: no size label wraps inside the narrow rank column and no spot name,
  confidence, or call overlaps its neighbour.

## Session log (append-only)

| Date | Examiner | Verdict | Observations |
|---|---|---|---|
| 2026-08-11 | Codex, source-blind browser check | FAIL | At 390 px, `/en/` and `/en/tomorrow/` rendered English data but their added size labels auto-flowed into the rank column. Words wrapped and visually collided with adjacent ranked rows. |
| 2026-08-11 | Codex, source-blind browser check | PASS | After the grid-row repair, Astro preview at 390 px showed readable home and tomorrow rows: size and wind occupied their own fact line, the call and confidence followed, and the first visible ordinary rows did not collide. |
| 2026-08-11 | nw-software-crafter-reviewer, independent browser review | PASS | Independently checked `/en/` and `/en/tomorrow/` at 390 px: 20 rows each, no horizontal overflow, clipped or overlapping visible row content, empty calls, or Spanish calls. No findings. |
