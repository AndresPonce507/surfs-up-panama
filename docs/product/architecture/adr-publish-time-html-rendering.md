# ADR: Publish-time HTML rendering, not client-side data fetching

## Status

Proposed (DESIGN round 1, 2026-08-08). Needs Andres's confirmation because it changes what the
hourly job publishes (HTML routes, not only JSON) and therefore touches lanes 01 and 03.

## Context

Forecast content changes every publish cycle (hourly). The site is Astro static output under a
100 KB / 3G-under-2s CI-enforced budget (decisions 21, 27), with a hard push to zero JS. Research
08 §4.4 designed a bundled region JSON (~100 KB gz for all spots) and stated "one fetch returns
everything the client needs", which presumes a JS client. Research 08 §12.4 identifies CloudFront
requests per session, not bytes, as the binding cost constraint.

## Decision

The hourly publish step renders the forecast into the static HTML of every reading route (home,
tomorrow, spot pages) plus per-cycle OG images. The browser fetches documents. No forecast JSON is
delivered to the client. The region data file remains the builder's input. HTML is served with
`max-age=300, stale-while-revalidate=3600`; hashed assets are immutable (research 08 §4.4), so the
hourly republish needs no paid CloudFront invalidations on the hot path.

## Alternatives considered

- **Static shell + client-side fetch of the bundled region JSON.** Rejected: first meaningful
  paint requires JS runtime + ~100 KB gz data on the wire, which alone exceeds the whole page
  budget on 3G; core content becomes JS-dependent, violating the zero-JS push; offline reading
  then needs two cache entries (shell + data) to agree.
- **Per-spot JSON fetched on demand.** Rejected twice over: research 08 §4.4 explicitly forbids
  per-spot files (multiplies S3 PUTs and CloudFront requests per session, the binding constraint),
  and it still requires client JS for core content.
- **Hybrid (HTML home, JSON-driven detail).** Rejected: pays both complexity bills, splits the
  staleness model in two, and the detail page is exactly where offline reading matters most.

## Consequences

- Positive: zero-JS reading routes; the 14 KB first-flight document is possible; offline caching
  is one artifact per route; request count per session stays ~8-10; the staleness stamp travels
  inside the document it describes, so a stale cached page can never claim freshness.
- Negative: the publish job gains a template-render step and ~45-90 small S3 PUTs per cycle
  (order-of-magnitude priced at ~$0.15/month by research 08 §4.4's own regeneration figure; lane
  03 owns the exact number). Tomorrow's page is a separate route rather than a client-side tab.
- Cross-lane: research 08 §4.4's "one fetch returns everything the client needs" no longer
  describes the client. Round-3 coherence review must reconcile the wording so lanes 01/03 do not
  design against the JS-client assumption.
