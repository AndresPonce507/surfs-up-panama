# ADR: What the 100 KB budget rules out (webfonts, map tiles, analytics, client data)

## Status

Accepted (DESIGN round 1, 2026-08-08). Implements decision 27 as concrete exclusions.

## Context

Decision 27: under 100 KB, 3G under 2 s, enforced as a CI build budget. The 2 s figure on a
400 kbps / 400 ms RTT profile leaves ~1.6 s for connection setup and one round trip, so the
critical path is a single ≤14 KB gz document with zero render-blocking subresources. Everything
that wants bytes competes with 20 ranked rows of forecast content, which is the product.

## Decision

Excluded from every route, permanently unless a future ADR supersedes: webfonts (system font
stack); map tile services and JS map libraries (decision 20 is met by one pre-rendered static
image per spot, built at publish, ~12 KB WebP, lazy); analytics and tag scripts (nothing to
measure for sale, BRIEF constraint 3); client-side framework runtime on reading routes (Astro
static output); forecast JSON payloads to the browser (see `adr-publish-time-html-rendering.md`);
hero photography. Report photo thumbnails are allowed on spot pages only: lazy, capped at 3 × 8 KB.

## Alternatives considered

- **A single subset webfont (15-40 KB WOFF2).** Rejected: it is the single largest optional line
  item, it risks invisible or flashing text on 3G, and the audience reads in direct sunlight where
  letterform nuance is the first thing glare destroys. System stacks render in 0 ms.
- **Interactive map (Leaflet ~40 KB + tiles ~25 KB each).** Rejected: decision 20 asks for a small
  static map showing the break and its orientation, not navigation; one image does that for ~12 KB
  and works offline once cached.
- **Privacy-respecting analytics (~1-2 KB script).** Rejected for v1: the only number the product
  needs (reports per spot) arrives through the write path already; CloudFront logs cover gross
  traffic if ever needed. Nothing here is unmonetizable telemetry debt.

## Consequences

- Positive: home first visit ~26 KB wire, 74 KB headroom held in reserve; first render possible
  under 2 s on slow 3G; nothing on the page competes with the forecast for bytes.
- Negative: typographic identity rests on layout and spacing, not a typeface; the map cannot pan
  or zoom; product usage insight is limited to write-path counts unless a future ADR adds more.
