# ADR: how enriched fields reach the reading surface

**Status:** Accepted (2026-08-09)
**Decides:** the seam three features independently stopped at rather than invent
**Owns:** `SurfaceCall` and `PublishedSurfaceUpdate` in `src/publish/static-surface.ts`, and the
promotion in `src/pipeline/build.ts`

## The problem, as three lanes found it

`src/pipeline/build.ts` builds two parallel shapes from the same `CallRow`:

- `daySummary()` produces `BundleDaySummary`, which carries `weakest_link`.
- `surfaceCall()` produces `SurfaceCall`, which does not.

The bundle goes to S3. `publish:surface` promotes only `bundle.publish_surface` into the committed
`data/published-surface.json`, and that file is what `src/data/forecast.ts` imports and every page
reads. So a row on the reading surface carries exactly eight fields:

    spot_id, score_q, call_es, conf_level, size_band, size_range_m, wind_state, best_window

Three features hit the resulting wall on the same day, and all three refused to invent a wire:

| Feature | Needs | Where it dies |
|---|---|---|
| `f-see-what-killed-it` | `weakest_link` | computed, on the receipt and the bundle, **absent from the surface** (`grep -c weakest_link data/published-surface.json` → 0) |
| `f-know-how-much-to-trust-it` | the confidence reason's real terms | `build.ts:209` keeps `c_total` and `level`, drops `spread_terms`, `dominant`, `track_state` |
| `f-show-our-track-record` | `spot_detail` | lives on the bundle; the page reads a different file; nothing bridges them |

One of them wrote *"I will not invent the wire."* That was correct, and it is why this is one
decision rather than three improvised plumbing hacks.

## What is NOT the constraint

**Page bytes.** Verified 2026-08-09: `data/published-surface.json` is a build-time import in
`src/data/forecast.ts`. `dist/` contains no JSON, no built page embeds the surface object, and the
home document is 20,134 bytes with the whole 60-row surface already in play. Astro resolves the
import at build time and only rendered values reach the HTML. **Widening the surface costs zero
first-visit bytes.** The 14 KB gz per document ceiling is unaffected and stays enforced by the
page-weight gate, which measures emitted documents, not build inputs.

This matters because "the surface is narrow to protect the byte budget" is the plausible-sounding
reason somebody would assume, and it is false. The narrowing is incidental: `surfaceCall()` simply
lists fewer fields than `daySummary()`.

## Decision

**The committed reading surface carries every field a reading route may render. `SurfaceCall` is
widened; the bundle stays the build's richer render input; nothing new is invented.**

Three parts:

1. **`SurfaceCall` gains the enriched per-day fields**, optional on the wire type exactly as the
   existing structured fields are, because surfaces committed before this ADR do not carry them:
   - `weakest_link?: Factor | null` — `null` means no factor cost this day any score. A missing key
     and an explicit `null` are different facts and must stay distinguishable: missing means an older
     surface, `null` means a perfect day. No renderer may collapse them.
   - `confidence_reason?: { dominant, spread_terms, track_state }` — the terms, not a sentence. The
     Spanish is composed at render time from `src/scoring/confidence.ts`, so wording changes never
     require a republish and the ≤160 character bound of `application-architecture.md` §7 P1 is
     enforced where the sentence is made.
2. **`PublishedSurfaceUpdate` gains `spot_detail?: Readonly<Record<string, SurfaceSpotDetail>>`**,
   mirroring the bundle's split by data lifetime. `days[]` stays the ranked arrays where array
   position IS that day's rank; `spot_detail{}` stays an unordered object holding only what does not
   change between days, which is precisely why it cannot encode a third ranking that disagrees with
   either day. That reasoning is `region-bundle.ts`'s, and it is preserved rather than restated.
3. **`surfaceCall()` stops dropping.** It promotes the same values `daySummary()` already keeps, from
   the same `CallRow`. There is exactly one computation and two projections of it, which is the
   invariant that was silently broken.

## Why widen the surface rather than point the pages at the bundle

The bundle's own header calls it "the build's render input for every route", so pointing
`src/data/forecast.ts` at it is the superficially obvious alternative. It is rejected:

- The bundle is written to S3 per hourly build and is **not committed**. The reading surface is
  committed on purpose, so `npm run build` is reproducible from the repository alone and a page can
  be rendered without network or credentials.
- The bundle carries `publish_surface` inside itself. Reading the bundle from a page would mean a
  page holding both the input and its own promoted output, which is the shape that lets the two
  drift.
- `publish:surface --verify` guards the committed surface against being stale for the civil day.
  There is no equivalent guard on an S3 object, and inventing one duplicates a check that already
  works.

## Invariants this decision does not relax

- **The anti-leak contract holds unchanged.** `src/data/forecast.ts` already documents that report
  routes and their components must NEVER import it, and `application-architecture.md` §8's leak paths
  L1 to L4 are unchanged. Widening the surface widens what a **reading** route may render and gives
  the capture route nothing. The f-tell-us anti-leak gate greps the built report routes and is the
  executable proof; it must stay green across this change.
- **Optional means optional.** Every new field is optional on the wire type and every consumer
  degrades. `application-architecture.md` §7's P7 failure behaviour stands: a missing field renders
  its absence, never a fabricated value.
- **The producer guard still owes its job.** HANDOFF §10 records the failure where
  `data/published-surface.json` shipped with `conf_level` on zero of 60 rows and `size_band` on one
  of twenty, and every gate stayed green because the fields are optional. Widening the surface adds
  two more fields with exactly that hazard. **The guard that fails when a published row is missing a
  field it should have is now more load-bearing, not less.** Whoever ships these fields owes the
  guard in the same slice.

## Consequence for the three blocked features

Each roadmap already recorded the exact diff it needed. With this decision they collapse to one
change in `build.ts` plus normal rendering work, and none of them needs to touch another lane's file
to invent a transport.

`f-show-our-track-record`'s third hop is answered too: `spot_detail` reaches the page because the
surface now carries it, not because the page learned to read the bundle.
