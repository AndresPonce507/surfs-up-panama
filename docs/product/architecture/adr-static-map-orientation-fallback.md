# ADR: Slice-05 uses a seed-only orientation diagram at launch

**Status:** Accepted (2026-08-10)
**Decides:** X11 for `f-see-what-killed-it` Slice-05
**Supersedes:** no prior imagery-source decision

## Context

Decision 20 asks for a small static map on a spot page so a surfer can see the
break and its orientation. The performance ADR permits a pre-rendered local
image and rejects tiles, map libraries and visitor-time mapping. The Slice-05
contract requires a legal, credited base-image source before a geographic map
can ship, or an express acceptance of a changed seed-only orientation diagram.

The accepted project record does not identify a licensed base-imagery source
that permits reproducible build-time acquisition for every launch spot. Its
imagery research instead rules out automated frame capture from the only
identified surf webcams, leaves other commercial sources unverified, and finds
satellite imagery unfit for break-level surf interpretation. No new provider
licence, permission, account, token, or paid source has been accepted. A
scraped, inferred, or merely credited image would therefore be an unsupported
legal claim, not an implementation shortcut.

The launch seed already owns each spot's cited identity and declared
`shore_normal_deg`. Those inputs are appropriate for a diagram that honestly
states only orientation. They do not establish a licensed geographic basemap
or a precise coastline representation.

## Decision

X11 accepts the **seed-only orientation diagram** as the launch fulfillment of
Slice-05. It is an explicit product narrowing, not a substitute geographic
map. Slice-05 may generate one local WebP per eligible launch spot from that
spot's validated seed record, with a marker and arrow for the declared
orientation only. It must not draw or imply a coastline, satellite view,
street, boundary, bathymetry, or a sourced location estimate beyond the
declared spot identity.

The visible Spanish caption follows this exact template, with the two values
read from the per-spot provenance record:

> `Diagrama de orientación. Ubicación: {coordinate_attribution}. Orientación: {orientation_attribution}.`

There is no third-party imagery and therefore no third-party imagery credit.
The generated policy and manifest must instead retain, for every asset, the
spot id, seed-file revision, coordinate provenance, `shore_normal_deg`
provenance, **their visible attribution payloads** (including OpenStreetMap
attribution whenever the cited coordinate uses it), diagram generator version,
content-addressed local path, asset digest, dimensions, and the caption above.
A missing, contested, invalid, or attribution-less seed input refuses that spot's asset. The
asset is generated at build time, served locally, and never refreshes from a
provider, so it has zero external serving cost and no provider cache term.
It regenerates only when the cited seed or policy inputs change, retaining the
previous asset identity for audit. The repository's MIT code licence does not
license this curated input record or any future image content.

`05-01` remains the implementation of that policy and manifest. This decision
does not authorize map production, JIT DISTILL, tests, a browser map library,
or a service-worker change. X12 remains independently blocking for cached
offline images.

## Alternatives considered

1. **Adopt a static imagery provider now.** Rejected. The accepted record has
   no provider with all required per-spot licence, build-acquisition,
   attribution, refresh, and $0-serving evidence. Selecting one by inference
   would violate the Slice-05 source gate.
2. **Capture or scrape available webcam, map, or satellite imagery.** Rejected.
   Webcam capture is expressly forbidden by the recorded provider terms;
   commercial coverage and terms are incomplete; satellite imagery is not a
   break-level visual source. Credit does not cure a prohibited acquisition.
3. **Omit the visual entirely.** Rejected. It is legally safe but discards the
   declared orientation value that Decision 20 asks the spot page to provide.

## Consequences and enforcement

- The launch visual communicates orientation, not geography. Product copy,
  alt text, and QA must call it a `diagrama de orientación`, never a basemap.
- A later imagery proposal needs a new ADR with primary licence evidence,
  exact attribution, acquisition and refresh terms, and an explicit
  replacement decision. It cannot silently replace this diagram.
- The build adapter's real-environment probe must reject a forged/missing seed
  provenance or visible-attribution record, a digest/manifest mismatch, and an asset labelled as
  imagery while this policy is active. The composition rule is wire, probe,
  then emit; a failure refuses the asset before `dist/` is accepted.
- Enforcement remains three independent layers when 05-01 is implemented:
  typed policy/manifest contract, structural rule forbidding imagery-provider
  configuration in the diagram adapter, and build tests with the listed
  forged-input cases. No runtime request or third-party dependency is allowed.
