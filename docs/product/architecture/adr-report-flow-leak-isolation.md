# ADR: Report-flow leak isolation (anti-anchoring, mechanical not procedural)

## Status

Accepted (implements the resolved anchoring item at the bottom of `docs/DISCUSS-decisions.md`,
owner-decided 2026-08-08; this ADR chooses the mechanism, not the policy).

## Context

The report flow is two screens: cold capture, then reveal. The label must commit before the reveal
renders, and screen one must not leak the prediction: not from the page it opened from, not via a
prefetched payload, not via the back stack, not via a service-worker cached response. This is a
correctness requirement for the learning loop (anchoring inflates "spot on" answers and trains the
model on its own prior), not a UX preference.

## Decision

Isolation is structural, so a future refactor cannot quietly reopen a path:

1. **Screen 1 is its own route** (`/spots/{slug}/reportar`), a static document whose template has
   no access to forecast data at build time. It does not change per publish cycle.
2. **The reveal has no URL.** It exists only as the POST response to the submission. Nothing to
   prefetch, nothing to cache, nothing to deep-link.
3. **Commit before render**: the island writes the label to the IndexedDB queue (or receives the
   server ack) before screen 2 renders. Offline, screen 2 renders a queued variant with no reveal;
   the island holds no prediction data, so a local reveal is impossible by construction.
4. **Back stack**, strict ordering: commit first (queue write or server ack), then
   `history.replaceState` swaps the current entry for the `/reportado` URL, then screen 2 renders.
   The swap preceding the render means Back never returns to an editable form, even mid-render;
   Back from the reveal lands on the spot page. Screen 2 carries no edit affordance. A later visit
   to screen 1 is a new report with a fresh client-minted `report_uuid`.
5. **Service worker**: the write path is a network-only route, POST responses are never cached,
   and the write path sends `Cache-Control: no-store`. The cached copy of screen 1 is the same
   forecast-free document.
6. **Enforcement**: dependency-cruiser forbids imports from report-flow source into any
   forecast-data module; a CI gate greps built `/…/reportar` HTML for forecast markers and is
   proven against a deliberately poisoned fixture at gate-authoring time.

## Alternatives considered

- **Modal report form on the spot page.** Rejected: the forecast is in the host page's DOM one
  z-index below the form; the leak survives every procedural guard, and the back stack shows the
  spot page mid-flow.
- **Reveal as a GET endpoint keyed by report id.** Rejected: creates a cacheable, prefetchable,
  shareable URL whose response contains the prediction; every one of those properties is a leak
  path this ADR exists to remove.
- **Client-side reveal computed from the cached forecast.** Rejected: requires shipping prediction
  data into the report island, which converts "does not leak" from a structural property into a
  discipline, and breaks the commit-before-reveal ordering when offline.

## Consequences

- Positive: the four leak paths are closed by construction; the anti-anchoring property is
  testable in CI; offline reporting keeps the ordering guarantee for free.
- Negative: one extra route pair per language; the reveal requires a round trip (offline reporters
  see their comparison later or not at all, which is the honest behaviour); direct navigation to
  `/reportado` shows a generic thanks, not a reveal.
