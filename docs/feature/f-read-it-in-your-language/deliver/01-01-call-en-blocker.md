# 01-01 producer handoff: canonical English published call

Decision settled 2026-08-10 for F-READ-IT-IN-YOUR-LANGUAGE Pre-requisite 2. Copy authority is
`docs/product/architecture/application-architecture.md` §10. Schema authority is
`docs/product/architecture/domain-model.md` §13, whose exhaustive target day summary already
requires `call{es,en}`. This handoff maps that accepted target onto the producer seams on disk.

## Verified gap

`data/published-surface.json` currently contains current day-summary rows with `call_es` and no
`call_en`. That file is generated and is evidence of the gap, not a place to hand-author a fix.
The typed path confirms it:

- `src/pipeline/build.ts` composes only `spanishCall`, publishes bundle `call: { es }`, and
  flattens only `call_es` into the static surface.
- `src/publish/region-bundle.ts` types the bundle member as `{ es: string }`.
- `src/publish/static-surface.ts` requires and validates `SurfaceCall.call_es` only.
- `src/data/forecast.ts` maps only `call: { es: call.call_es }` and types the result partial.

`RankedList.astro` correctly fails an English build when `call.en` is absent. A frontend fallback,
client-side recomposition, translating `call_es`, an empty string, or hand-editing the generated
surface would all violate the accepted publish-time rendering contract.

## Canonical composition

The producer composes Spanish and English in the same pass from the same row's `size_band`,
`wind_state`, and `best_window`. It does not use one locale's sentence as the other locale's input.

| Structured state | Spanish, current accepted source | English, exact settled twin |
|---|---|---|
| wind and window present | `{Tamaño}, viento {viento}, mejor de {inicio} a {fin}.` | `{Size}, {wind} wind, best from {start} to {end}.` |
| wind absent | `{Tamaño}, viento sin datos, mejor de {inicio} a {fin}.` | `{Size}, no wind data, best from {start} to {end}.` |
| window absent | `{Tamaño}, viento {viento}, sin ventana estimada.` | `{Size}, {wind} wind, no estimated window.` |
| both absent | `{Tamaño}, viento sin datos, sin ventana estimada.` | `{Size}, no wind data, no estimated window.` |

Example: `Pecho a cabeza, viento limpio, mejor de 06:00 a 09:30.` and its canonical twin
`Chest to head, clean wind, best from 06:00 to 09:30.`

The size word comes from the matching bilingual row in `src/data/size-bands.ts`. The wind token
maps to the settled display words `clean`, `choppy`, or `blown out`; these are the grammatical
lowercase rendering of §10's exact `Clean`, `Choppy`, and `Blown out` labels. Times are the
producer-computed spot-local `HH:MM` strings already carried by `best_window`. Missing wind or
window stays missing in words. An invalid or missing `size_band` refuses the publish. No field is
inferred and no forecast value is introduced by this composition.

## Required producer contract

The producer-lane implementation is one serial change across the shared publish seam:

1. Replace the locale-specific narrative helpers with one pure locale-keyed composition function
   implementing the four rows above and sourcing size labels from the canonical band table.
2. Make every current `region-bundle/1` day summary require `call: { es: string, en: string }`.
   Both members are composed from that summary's own structured facts, for both today and
   tomorrow. Neither may be copied across days.
3. Make the **current-publish** call shape require non-empty `call_es` and `call_en`.
   `surfaceCall()` emits both; `assertStrictTwoDayUpdate()` validates both on the compatibility
   alias and both day arrays. Because today's `DawnReceipt` reuses `SurfaceCall`, split the receipt
   call shape or otherwise keep `call_en` optional only at the historical-receipt boundary. A new
   dawn receipt naturally retains both members; an old Spanish-only receipt remains valid and
   byte-unchanged.
4. Map the static surface in `src/data/forecast.ts` to the non-partial
   `call: { es: call.call_es, en: call.call_en }`. Reading pages select the member by locale and
   never compose it.
5. Regenerate `data/published-surface.json` only through the real producer/publish command. Do not
   hand-edit forecast data or backfill immutable dawn receipts. Old receipts remain governed by
   Pre-requisite 3; new current day summaries carry both locales.

Contract tests must cover all seven size bands, all three present wind states, missing wind,
present and missing windows, today and tomorrow, current-update validator refusal when either
locale is missing or empty, and continued readability of an unchanged legacy dawn receipt with
`call_es` only. The structural law is stronger than examples: for each current published row, both
calls must be the result of composing that same row's structured facts.

## Acceptance handoff

After the producer change lands, re-run the existing READ-01 emitted-tree acceptance suite. The
relevant observable remains user-facing: every English ranked row contains its producer-published
English call, with no `undefined`, Spanish narrative, placeholder, or client-composed substitute.
The Base toggle and alternate-link work is separate and may still keep other READ-01 scenarios red.

This decision closes the product/architecture ambiguity. The producer change and generated
surface landed in `774d38d`; the remaining READ-01 work is the later toggle, tree and UI sequence.

## Independent review

`nw-product-owner-reviewer` returned **APPROVED** on 2026-08-10 after three blocking/high findings
were corrected: the roadmap now includes the serial producer seam instead of excluding
`src/pipeline/**`; current published calls and immutable legacy receipt calls have distinct
requirements; and the domain model labels `call{es}` as a pre-READ implementation snapshot rather
than target schema authority. The approval covers this decision and plan only. It does not claim
the producer implementation or Slice 01 is green.

## Implementation closure

Commit `774d38d` implements this contract. Current bundle and static-surface rows carry both
locale members and all same-row structured facts. Honest missing wind/window values are explicit
`null`, never omitted or inferred; the current validator rejects absent/malformed facts. The
forecast adapter selects a complete locale member while historical dawn receipts alone retain the
legacy optional boundary. The staged data change added exactly 60 derived `call_en` values to the
compatibility alias and both civil days; every pre-existing forecast value and all three receipts
were verified unchanged.

Evidence on 2026-08-10:

- `npm run typecheck`: PASS.
- `npm test`: 21 files, 89 tests PASS.
- `npm run build`: PASS, 85 documents; `/en/` and `/en/tomorrow` measured under 14 KB.
- Exact roadmap scenario `The visitor flips to tomorrow without leaving their language`: 1
  scenario, 11 steps PASS.
- Independent `nw-software-crafter-reviewer`, iteration 2: **APPROVED**, zero remaining defects.

The broader READ-01 tag is not green yet. Its remaining failures are the serialized Base/toggle,
absolute alternate and tree-completeness steps owned by 01-02 onward; this producer commit did not
touch `Base.astro` or its head.
