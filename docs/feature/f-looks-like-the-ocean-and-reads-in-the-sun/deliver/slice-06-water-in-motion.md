# Slice-06: the water moves

**Opened and built 2026-08-13.** Andres approved a rendered desktop mockup
("build that pixel for pixel the same exact way") and extended it to mobile
("same exact theme, format it for mobile"). The mockup is provenance, not
authority: `/Users/andres/surfs-up-desktop-preview/index.html`, a Desktop-class
artifact outside the repo, built from this feature's own ADR tokens against the
real 2026-08-13 published surface.

## Value statement

A surfer opens the ranked list on any screen and the page moves like the water
it describes: swells roll under the call card, the score draws itself, the
coast rises as you read down it, and none of it costs a word of legibility, a
byte on another route, or a frame on a cheap phone.

## Process note (recorded, not hidden)

This slice ran outside the full wave ceremony on Andres's explicit
instruction, with the wave's substance kept: the approved mockup stood in as
the design artifact, acceptance specs were authored red-first in a parallel
lane (`build/desktop-glass-e2e`, data-dg hook contract), the window math
landed TDD with a killed mutant, U1-U7 ran via the existing `ui` gate, U8
goes to Vera source-blind before merge, and an independent reviewer closes
the fan-out. DISCUSS elicitation was skipped because every question it would
ask is already answered by this feature's shipped slices and Accepted ADR.

## What ships

- Water band (hero gradient + three rolling swell layers + wave edge) behind
  the header and call card on `/`, `/manana` and their `/en/` twins; the
  ranked list below stays on the light surface (the ADR's band-not-page rule).
- The call card rides the band: drawn score ring (conic, `--dg-ring`, the
  night go-green — non-text, on the dark band in both themes), best-window
  dawn bar on the 06:00-18:00 daylight track (`src/render/best-window.ts`,
  refuses dishonest windows), buoy bob, entrance rise.
- Coast rows as cards: staggered IntersectionObserver reveals, score meters
  filling to their server-rendered widths, hover lift. One fixed meter colour
  (`--rank-bar-fill: var(--accent)`) — length-only, same rule as before.
- Desktop (>=1080px) ambient: caustic drift, light rays, pointer parallax.
  Deliberately absent on phones: the ADR's GPU-cost rule for cheap Androids.
- No JS, no IntersectionObserver, or `prefers-reduced-motion: reduce`: the
  page is fully readable and fully static. Proven in the smoke (0 hidden rows
  under reduced motion) and by construction (`.dg-js` gates every hiding rule).

## Constraints held, with the receipts

| Constraint | Held how |
|---|---|
| Hero score never on glass (design doc §4) | card stays solid `--hero-grad`; glass wash under white computes ~3.9:1, refused |
| Gradient light stop capped `#0D5866` | token consumed untouched; the mockup's `#10707F` was not reintroduced |
| U7 tokens | every new colour is a custom-property definition (`--dg-*`), ranked-docs only |
| Byte ceilings | home 9,271 B gz / 14,336; spot + reportado byte-identical to baseline (6,420 / 4,069) |
| One-paint documents | `inlineStylesheets: 'always'` after the page-weight gate refused the extracted stylesheet |
| Honest absence | an unrepresentable best window renders NO bar (property-tested, mutant killed) |

## Evidence

- `.lane-logs/red-best-window.log` (exit 1), `green-best-window.log` (8/8),
  `mutant-best-window.log` (exit 1, clamp mutant killed)
- `.lane-logs/gate-fast-theme-3.log`: 11 passed / 0 failed / 0 skipped
- `.lane-logs/e2e-walking-skeleton.log`: exit 0 (identity checks with theme on)
- Smoke: desktop+mobile x day+night screenshots, zero console errors, no
  horizontal scroll, reduced-motion static
- Commits: `e0bffc3` (window math), `a173056` (the water)

## Owed before this slice is DONE

- Vera source-blind walk (U8), both viewports — verdict recorded, never guessed
- Independent reviewer pass over the lane
- Acceptance specs from `build/desktop-glass-e2e` merged and green against this build
