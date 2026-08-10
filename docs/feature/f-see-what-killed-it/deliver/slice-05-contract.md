# Slice-05 delivery contract: a small, static break map

Status: mapped only, 2026-08-10. This is not JIT DISTILL. It creates no
future acceptance label, feature file, step definition, fixture, expectation
charter, or RED-classification entry. Slice-05 opens only after Slice-01 is
sealed, X11 selects a legal source path, and the shared host and cache seams
are available.

## Binding outcome

Each eligible spot page may show one small static asset that lets a surfer see
the break and its declared orientation. It is a local WebP created before the
Astro build, loaded lazily, and bounded at approximately 12 KB. No visitor
contacts a tile server, starts an interactive map, runs a map library, shares
location, or waits for a browser-side map calculation.

The marker and orientation arrow come from the launch spot's cited coordinate
and `shore_normal_deg`. The generated asset, not page code, carries that
geometry. The page must not infer facing from an image, a coastline outline,
or another beach. A missing, contested, or invalid map input refuses that
spot's generated asset rather than publishing a plausible but wrong map.

The image uses a fixed aspect-ratio frame with meaningful Spanish alt text and
visible attribution. It reserves space before the lazy image arrives. When an
image is not cached offline or cannot load, the same sunken frame stays in
place and its alt text remains readable. No spinner, layout shift, raw URL or
technical error is a permitted fallback.

## Imagery decision gate

The shape is accepted but the base imagery is not. X11 belongs to Andres and
DESIGN and must choose one of two explicit outcomes:

1. An approved static imagery source with documented license, permitted
   build-time acquisition, exact visible credit, and a zero-serving-cost path.
2. An expressly accepted seed-only orientation diagram, if licensing does not
   allow the first outcome. This is a changed product fulfillment and must be
   named as such, not passed off as an unlicensed base map.

The chosen path becomes a tracked policy and generated manifest. It pairs each
launch `spot_id` with source evidence, attribution payload, asset identity,
coordinate provenance and `shore_normal_deg` provenance. It is not enough to
say that a provider is generally open or put credit only in repository text.

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

1. X11 records an approved imagery path or an explicit diagram fallback, with
   license evidence and visible attribution requirements.
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

- No unapproved imagery provider, scraped picture, tile API, access token,
  geolocation, browser map library, endpoint, island or route.
- No claim that an orientation diagram is a licensed geographic basemap.
- No map on home, tomorrow, report or archive pages.
- No change to Slice-01 through Slice-04 evidence or deferred acceptance
  artefacts.
