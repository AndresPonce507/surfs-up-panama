# Paste 04-03: WhatsApp card boundary and external verification

## Decision

The controlled release contract is the public builder handoff: the home
declares an absolute `og:image` for the selected 1200×630 JPEG, the image is
at or below 60 KB, the same published build stamp is on the card URL and the
shared WhatsApp URL, incomplete P7 data selects the generic card and records
the gap, and the surfer's first visit never fetches the card. This is the
complete product behaviour the application owns.

WhatsApp's authenticated chat rendering and cache timing are a third-party
outcome. They cannot make this passing public handoff INDETERMINATE solely
because no authorized test chat is available. This follows
`application-architecture.md` sections 13 and 15: per-build `?b=` URLs make
preview caching irrelevant instead of assumed, and the remaining client
rendering unknown does not block launch.

## Evidence

- The four real-I/O `@jit-04-03` scenarios observe the built home, its declared
  crawler URL, its regenerated JPEG, the generic degradation and the first
  flight through Chromium and the local preview server.
- `npm run build` emits the 1200×630 JPEG cards under the 60 KB contract and
  the page-weight gate keeps the card out of the first-visit assets.

## External verification prerequisite

An authorized WhatsApp client with a user-owned test chat may verify the
renderer after deployment. It never requires a credential in this repository.

1. Publish the current build and paste the exact shared URL, including `?b=`.
2. Compare the small chat card with the page's announced card and values.
3. Publish a later build, paste its different stamped URL, and compare its
   card with that build.
4. Append PASS, FAIL or NOT_EXECUTED to the expectation charter. A FAIL records
   the public URL, stamps, observed values and time for separate investigation.

## Acceptance mapping

The four `@jit-04-03` scenarios are the release contract. The chat-client
observation is an operational verification prerequisite, not a replacement
for the owned public behaviour.
