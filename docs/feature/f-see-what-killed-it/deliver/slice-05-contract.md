# Slice-05 delivery contract: a small, static break map

Status: X11 resolved, implementation still mapped only, 2026-08-10. This is not JIT DISTILL. It creates no
future acceptance label, feature file, step definition, fixture, expectation
charter, or RED-classification entry. Slice-05 opens only after Slice-01 is
sealed, X11 selects a legal source path, and the shared host and cache seams
are available.

## Binding outcome

Each eligible spot page may show one small static orientation diagram that lets
a surfer see the declared orientation of the break. It is a local WebP created before the
Astro build, loaded lazily, and bounded at approximately 12 KB. No visitor
contacts a tile server, starts an interactive map, runs a map library, shares
location, or waits for a browser-side map calculation.

The marker and orientation arrow come from the launch spot's cited coordinate
and `shore_normal_deg`. The generated asset, not page code, carries that
geometry. The page must not infer facing from an image, a coastline outline,
or another beach. A missing, contested, or invalid map input refuses that
spot's generated asset rather than publishing a plausible but wrong map.

The diagram uses a fixed aspect-ratio frame with meaningful Spanish alt text
and the visible caption template `Diagrama de orientación. Ubicación:
{coordinate_attribution}. Orientación: {orientation_attribution}.` Its values
come from the per-spot provenance record, including OpenStreetMap attribution
when it supplied the coordinate. It reserves space before the lazy image
arrives. When an
image is not cached offline or cannot load, the same sunken frame stays in
place and its alt text remains readable. No spinner, layout shift, raw URL or
technical error is a permitted fallback.

## X11 resolution: accepted orientation-only fallback

Andres/DESIGN accepts the seed-only orientation diagram as the launch path.
This is a changed product fulfillment, not a geographic basemap and not an
unlicensed substitute for one. The visual may contain only the declared spot
marker and `shore_normal_deg` arrow. It must not depict or imply a coastline,
satellite image, street, boundary, bathymetry, or precision beyond the cited
seed record.

No accepted project evidence establishes a legal static imagery source for all
launch spots with permitted build-time acquisition, exact credit, refresh
terms, and $0 serving. Recorded webcam capture is prohibited, other commercial
terms/coverage are unverified, and satellite imagery is unfit for this
break-level purpose. The orientation-only path is therefore the minimal
compliant launch decision. Full rationale and future replacement gate:
`docs/product/architecture/adr-static-map-orientation-fallback.md`.

Step 05-01 still creates the tracked policy and generated manifest. For every
launch `spot_id`, it must pair the caption above with seed-file revision,
coordinate provenance and visible attribution, `shore_normal_deg` provenance
and visible attribution, generator version, content-addressed path, dimensions,
and asset identity. A missing, contested, invalid, or attribution-less input
refuses that asset. No provider credit, provider refresh, or provider cache
rule exists because no
third-party imagery is used.

## Planned Given-When-Then mapping

These are future executable behavior contracts. They are not acceptance
scenarios and carry no cucumber tags.

| Coverage | Given | When | Then | Intended driving surface |
|---|---|---|---|---|
| R18 | A launch spot with an approved generated map asset and declared shore orientation | A surfer opens that spot page at 390 px | One local lazy map shows that break and its own orientation marker, with no interactive map | Production build, emitted `dist/`, real HTTP, Chromium |
| R18 | Two spots whose coordinates and shore normals differ | The map assets are generated | Each marker and arrow belongs only to its own seed record | Real map-asset build port |
| R19, R25 | A map image that is unavailable from the worker cache while the page is offline | A surfer opens the already cached spot document | The reserved frame and Spanish alt text remain visible, with no layout shift or technical error | Real service worker plus Chromium |
| R20 | A generated asset whose source, credit, file identity or license record is missing or mismatched | The site build runs | The build refuses before emitting a credited-but-wrong or uncredited map | Real map-asset build port |
| R20, R30 | A real built spot page with its map below the first viewport | The page loads on a slow connection | The image is lazy and local, no tile or map-library request occurs, document budget and route JavaScript stay unchanged | Production build, emitted `dist/`, real HTTP, Chromium |
| R21-R27 | The longest Spanish spot name with map, caption and an offline image failure in light and dark themes | A surfer opens the spot at 390 px with reduced motion | The frame, alt text and attribution remain readable, un-clipped and leave the report action reachable | Production build, emitted `dist/`, real HTTP, Chromium |

Three of six planned behaviors cover a bad or unavailable asset rather than a
happy path. Pure policy and seed-to-arrow laws may use fast-check; asset,
worker and browser behavior stays concrete and example-based.

## Delivery sequence

1. X11 is resolved to the explicit seed-only orientation diagram fallback;
   05-01 records its reproducible manifest policy and visible caption.
2. A build-time adapter validates launch inputs and emits the local,
   content-addressed WebP assets plus an importable manifest.
3. The generator binds exactly each spot's cited coordinate and declared
   `shore_normal_deg` to its own marker and orientation arrow.
4. A static map component consumes only that manifest, renders the lazy image,
   reserved frame, alt text and credit, and carries no browser-side map code.
5. The map is serially mounted into the shared spot page. X12 extends the
   owning service worker's bounded image cache rather than duplicating it.
6. At legal JIT DISTILL entry, author the six behaviors above, record RED
   against the production build and worker, run U1 through U7, and obtain a
   fresh source-blind U8 observation before commit.

## Explicit non-goals

- No unapproved imagery provider, scraped picture, geographic basemap, tile API, access token,
  geolocation, browser map library, endpoint, island or route.
- No claim that the orientation diagram is a geographic basemap or imagery.
- No map on home, tomorrow, report or archive pages.
- No change to Slice-01 through Slice-04 evidence or deferred acceptance
  artefacts.
