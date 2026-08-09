## Design System

Lane: application/frontend, visual system. Author: solution-architect (Morgan), DESIGN round 1,
2026-08-08. Binding inputs: `application-architecture.md` (§4 routes, §5 byte budget, §10 copy,
§11 contrast, §14 wireframes), `adr-performance-budget-cuts.md`, `docs/DISCUSS-decisions.md`
3, 7, 13, 17, 18, 19, 25, 27. Shipped as: `src/styles/tokens.css`, `src/styles/base.css`,
`src/styles/components.css` (inlined by `src/layouts/Base.astro`), `src/styles/recipes.css`
(not imported — recipes for markup that has not landed).

Verdict up front: system typeface used hard (scale, weight contrast, tabular numerals,
tracking), a palette that is dawn-cool rather than postcard-blue, exactly **two** glass
surfaces — both small, fixed, and never under the number a person reads in sunlight — every
text/surface pair carried with a computed WCAG ratio (body text ≥ 12.8:1 everywhere, AAA), and
a total CSS cost of **2.16 KB gz** against a declared 6 KB budget. Built, typechecked, and
smoke-rendered at 390 px in both themes: no horizontal scroll, no console errors.

### 1. Reuse Analysis

| Existing Component | File | Overlap | Decision | Justification |
|---|---|---|---|---|
| Inline critical CSS block | `src/layouts/Base.astro` | Was the only styling; carried 44px targets, system stack, `color-scheme` | EXTEND | Same shell, same head contract (hreflang, favicon, viewport); styling replaced by the token files it now inlines. No second layout exists or is created |
| §11 sunlight palette | `application-architecture.md` §11 | All 18 measured pairs | EXTEND | Adopted verbatim as tokens after recomputation (all 18 ratios reproduce exactly — §3). New surfaces added beside it, each with its own computed ratio |
| tokens.css | `src/styles/tokens.css` | none — no token file existed | CREATE_NEW | Named values with computed ratios are the enforcement surface; adjectives in a doc cannot be linted or diffed. Consumers: base.css, components.css, recipes.css, axe CI gate |
| base.css / components.css | `src/styles/` | none — first stylesheet layer | CREATE_NEW | Styles the markup that exists today (ranked list, tabs, report form, CTA); evaluated against keeping styles inside each `.astro` component and rejected: per-component styles duplicate tokens and defeat the single inline-and-minify path |
| recipes.css | `src/styles/recipes.css` | none | CREATE_NEW | Paste-ready CSS for components whose markup has not landed (conf indicator, scorecard, bars, states). Not imported: zero wire bytes. Named consumer: the DELIVER crafter, in the same commit as each component's markup |

Read-only consumed dependencies (prose, not rows): `src/i18n/strings.ts` (`otherLocale`),
the scaffolded components' markup shapes (`RankedList`, `SpotDetail`, `ReportCapture`,
`ReportShell`) — read to bind selectors, never modified.

### 2. Token set

All tokens in `src/styles/tokens.css`, day theme default, dark under
`@media (prefers-color-scheme: dark)` only (no toggle — Decisions needing Andres #5,
0 KB JS). Groups: colour (`--ink --ink-2 --bg --surface --sunken --hairline --ctrl --go
--on-go --go-tint --warn --warn-bg --danger --accent --hero-grad`), glass (`--glass
--glass-blur`), elevation (`--shadow-1 --shadow-2`), type (`--font`, 7 sizes + 2 score
sizes, 3 leadings, 2 trackings), space (`--sp-1..7`, 4 px grid), radius (`--r-s/m/l/full`),
motion (`--ease --dur-1 --dur-2`), touch (`--tap: 44px`).

The palette is the §11 sunlight palette, extended. What makes it feel like the ocean at
first light without a blue-gradient cliché: the neutrals are all cold (ink `#14181D` is a
blue-black, surfaces `#F2F4F6`/`#E9EDF1` are sea-glass greys), the one gradient in the whole
product is the hero card's dawn-sky wash (`#F7FAFC → #EAF1F5` day, `#1A2029 → #1E2A36`
pre-dawn), and colour otherwise appears only as meaning: green = go, amber = stale, red =
error/weakest link. No decorative blue anywhere.

### 3. Measured contrast (computed, not estimated)

WCAG 2.x relative-luminance arithmetic on the exact hex pairs (script preserved in §14).
Recomputation of all 18 §11 pairs reproduced §11's numbers exactly — no drift; those rows are
not repeated here. Targets: body ≥ 7:1 (AAA, the sunlight margin), all text ≥ 4.5:1, non-text
UI ≥ 3:1, measured against the real backdrop including gradient worst stops and glass
composites.

New pairs, day theme:

| Pair | Ratio | Clears |
|---|---:|---|
| body `#14181D` on hero worst stop `#EAF1F5` | 15.62 | AAA |
| secondary `#40484F` on hero worst stop | 8.15 | AAA |
| body on sunken `#E9EDF1` | 15.15 | AAA |
| secondary on sunken (disabled button text) | 7.91 | AAA |
| body on warn chip `#F6EEDC` (noscript, offline) | 15.43 | AAA |
| amber `#7A5200` on warn chip `#F6EEDC` | 5.99 | AA (≥14 px, 600) |
| body on selected-control wash `#EBF3EE` (go-tint over bg) | 15.78 | AAA |
| green `#0A6A2D` on card `#F2F4F6` | 6.12 | AA |
| red `#9E1C23` on card | 7.20 | AAA |
| red on sunken (weakest-link fill, non-text) | 6.75 | AA |
| link `#0B57D0` on card | 5.79 | AA |
| control border `#5F6A73` on bg (non-text) | 5.53 | ≥3:1 |
| focus ring `#0B57D0` on bg (non-text) | 6.39 | ≥3:1 |

New pairs, dark theme:

| Pair | Ratio | Clears |
|---|---:|---|
| body `#EDF1F4` on hero worst stop `#1E2A36` | 12.84 | AAA |
| secondary `#AAB4BE` on hero worst stop | 6.93 | AA |
| body on sunken `#161C24` | 15.08 | AAA |
| secondary on sunken (disabled button text) | 8.14 | AAA |
| body on warn chip `#2B2412` | 13.56 | AAA |
| amber `#E3A83B` on warn chip | 7.28 | AAA |
| body on selected-control wash `#192927` | 13.32 | AAA |
| green `#57C785` on card `#1A2029` | 7.73 | AAA |
| red `#F2707A` on card | 5.75 | AA |
| red on sunken (non-text) | 6.02 | AA |
| link `#8AB4F8` on card | 7.77 | AAA |
| control border `#8A949E` on bg (non-text) | 5.99 | ≥3:1 |

Glass composites (sRGB alpha compositing, the arithmetic browsers apply; worst case = a solid
block of the strongest content colour scrolled fully under the glass):

| Glass surface | Tint | Worst backdrop | Composite | Text on it | Ratio | Clears |
|---|---|---|---|---|---:|---|
| day pill/tray | `rgba(255,255,255,.88)` | ink block `#14181D` | `#E3E3E4` | body `#14181D` | 13.90 | AAA |
| day pill/tray | same | same | same | secondary `#40484F` | 7.25 | AAA |
| day pill/tray | same | typical bg `#FFFFFF` | `#FFFFFF` | body | 17.82 | AAA |
| dark pill/tray | `rgba(16,20,26,.84)` | text block `#EDF1F4` | `#33373D` | body `#EDF1F4` | 10.54 | AAA |
| dark pill/tray | same | same | same | secondary `#AAB4BE` | 5.69 | AA |
| dark pill/tray | same | typical bg `#10141A` | `#10141A` | body | 16.26 | AAA |

Rule derived from that last AA row: **text on glass uses `--ink` only** — secondary-strength
text is not permitted on glass, so the worst case on any glass surface stays AAA.

Reported honestly: hairline separators measure 1.35 (day) / 1.42 (dark) — decorative by
declaration; row separation is also carried by spacing, and no meaning is ever carried by a
hairline alone. Accent colours in the 5.7–6.9 band follow §11's standing policy: ≥ 16 px
semibold or glyph-plus-word, never the sole carrier of meaning.

### 4. Glass: where it earns its place, where it is refused

`backdrop-filter` costs GPU on low-end Android and fights contrast in sun. Two surfaces earn
it; both are small fixed strips whose blur region never exceeds ~64 px of viewport height, and
at most **one** is present per route.

| Surface | Why glass genuinely helps | Fallback |
|---|---|---|
| Language pill (`.lang-toggle`, fixed top-right, all routes) | Floats over scrolling content; translucency signals "above the page, not of it" while the toggle stays reachable | Solid `--bg` via `@supports not` ordering, and again under `prefers-reduced-transparency: reduce` |
| Report CTA tray (`p:has(> a.cta)`, fixed bottom, spot pages) | The thumb-zone bar (decision 23) rides over the scorecard and reports as they scroll; glass keeps the last line of content perceivable behind it | Same solid-first pattern |

Refused, deliberately:

| Surface | Why refused |
|---|---|
| Hero call card | Carries `score_q`, the number read at arm's length at midday. Solid dawn gradient; worst stop measured (15.62 / 12.84) |
| Ranked rows, spot day cards | The product itself. Solid `--bg`/`--surface`, body ink at 16–18:1 |
| The CTA button proper | Primary actions are never translucent; solid `--go`, 6.75:1 / 8.72:1 |
| Report form | A labelling instrument; anything between the surfer and the three taps is friction |
| Any full-height sheet or overlay | Full-viewport blur is exactly the jank case on cheap Androids; no sheet exists in the IA anyway |

Mechanics: solid background declared first, glass only inside
`@supports (backdrop-filter: blur(1px))`, `-webkit-` prefix for older iOS, both surfaces
forced solid under `prefers-reduced-transparency: reduce`. Blur `12px` + `saturate(140%)`,
tint alphas `.88`/`.84` — the alphas are not taste, they are the values at which the worst-case
composites in §3 stay AAA for ink.

### 5. Typography

System stack (`system-ui, sans-serif`): SF Pro on iOS, Roboto on Android, 0 bytes, 0 ms.
The identity work is done by scale, weight contrast, tabular numerals and tracking, which is
most of what reads as "Apple design" anyway.

| Role | Size | Weight | Leading | Tracking | Used for |
|---|---|---|---|---|---|
| score-hero | 3.25rem (52) | 800 | 1 | −0.03em, tabular | hero card score |
| score-day | 1.75rem (28) | 800 | 1 | −0.02em, tabular | spot-page day score |
| score-row | 1.375rem (22) | 700 | 1 | −0.02em, tabular | ranked-row score |
| title-1 | 1.375rem (22) | 800 | 1.15 | −0.02em | page header, hero spot name |
| title-2 | 1.1875rem (19) | 700 | 1.35 | 0 | section heads, legends |
| body | 1.0625rem (17) | 400 | 1.5 | 0 | call text, copy |
| meta | 0.875rem (14) | 500 | 1.35 | +0.01em | row line 2, staleness, footer |
| caption | 0.8125rem (13) | 600 | 1.3 | +0.04em | language pill |

17 px body is the SF Pro text-optical sweet spot and one step above Roboto's default, bought
for sunlight. All numerals that can be compared (`score_q`, counters, times, deltas) set
`font-variant-numeric: tabular-nums` so columns of scores align and "8 de 30" does not shimmy
when it becomes "9 de 30". Vertical rhythm: 4 px grid (`--sp-1..7`); rows are 2 lines
(name/score baseline-aligned on line 1, meta line 2), hero card is title, score, then call at
body size.

Spanish-length survival (Spanish is primary and runs ~20% longer): titles wrap, never
truncate; row meta lines clamp at 2 lines (`-webkit-line-clamp: 2`) rather than ellipsizing a
single line, because a one-line ellipsis would routinely eat the confidence word in Spanish
("Cabeza a un metro más · destrozado · ●●○ media" ≈ 48ch > the ~44ch that fit at 390 px) and
decision 7 says confidence is *always* shown. The meta row is a flex-wrap line in the recipe:
overflow wraps, never hides.

### 6. The score, specifically

The score is **always ink, always tabular, always weight ≥ 700**. Never colour-coded, and
that is a measured decision, not a mood: ink is 17.82:1 / 16.26:1 where the strongest accent
reaches 8.7:1 and green-on-white reaches only 6.75:1 — colouring the digits would cost up to
11 contrast points on the single element the product exists to deliver, and would make 92
readable and 41 less so, which is backwards. It also survives every colour-vision type and a
glare-washed screen for free.

92 versus 41 therefore look identical in treatment and different in everything that matters:
position (array order IS rank), size (52 px hero for rank 1 only, 22 px rows), and the words
beside it (call text, size band, wind, confidence). At a half-second scan the eye reads
column-aligned tabular digits top-to-bottom down a ranked list — the ranking is the redundant
encoding of quality, which is honest: the product's opinion is the ORDER, the score is the
evidence. On day one with placeholder zeros the layout already holds (verified in the 390 px
smoke renders).

### 7. Spacing, radii, elevation

4 px grid: `4 / 8 / 12 / 16 / 24 / 32 / 48`. Radii: 8 (small controls), 12 (cards, buttons,
inputs), 16 (hero), 999 (pills). Elevation in direct sun cannot rely on soft shadows, so
edges come from borders and surface steps first (`--hairline`, `--surface`, `--sunken`);
shadows are secondary reinforcement only (`--shadow-1` cards, `--shadow-2` the floating CTA),
and nothing depends on perceiving them. Touch: every target ≥ 44 px (`--tap`), controls 48 px,
the CTA fixed in the bottom thumb zone with `env(safe-area-inset-bottom)` padding; body gets
`padding-bottom: 7rem` via `body:has(a.cta)` so content never hides behind the tray.

### 8. Motion

Purposeful only; everything transform/opacity (compositor-only, 60 fps by construction);
everything off under `prefers-reduced-motion: reduce` via a global kill switch. Nothing ever
delays content: no entrance animations, no skeleton shimmer (nothing client-fetches — HTML
arrives rendered), no scroll-driven effects, no parallax.

| What | Trigger | Property | Duration / easing |
|---|---|---|---|
| Press feedback (links, buttons, radio cards) | `:active` | `transform: scale(0.98)` | 120ms `cubic-bezier(0.2,0,0,1)` |
| Route crossfade | cross-document navigation | UA view-transition (opacity) | UA default ≈250ms; gated inside `prefers-reduced-motion: no-preference`; pure CSS (`@view-transition{navigation:auto}`), progressive, ~60 B |
| Confidence reason disclosure (recipe) | `<details>` open | `transform: rotate(90deg)` on the marker | 200ms, same easing |
| Stale chip appearance (recipe) | stamp island adds `.on` past 3 h | `opacity 0→1` | 200ms |

That is the complete inventory. Anything not in this table does not animate.

### 9. Components

Shipped now (`components.css` styles only markup that exists — CSS with no consumer is
unjustified bytes, clause `data:consumer-known-before-produced`):

| Component | Selector (existing markup) | Design |
|---|---|---|
| Hero call card (decisions 1, 3) | `ol.ranked li:first-child` | Rank 1 restyled by position alone — array order IS rank, so hero and rank can never disagree and no markup change is needed. Dawn-gradient solid card, r-16, hairline border, name at title-1/800, score at 52 px tabular, call at body size in full ink |
| Ranked row | `ol.ranked li` | 2-line grid `1.75rem / 1fr / auto`: rank (meta, tabular) · name (17 px/600 ink) · score (22 px/700 tabular) baseline-aligned; line 2 = meta at 14 px/500 clamped to 2 lines |
| Day tabs | `nav a[aria-current]` | Real links to separate routes; active = ink + 2 px ink underline; 44 px targets |
| Language pill | `.lang-toggle` | Glass surface #1 (§4), fixed top-right, 44 px, caption/600 ink |
| Spot day cards | `section`, `section strong` | `--surface` card r-12; score-day 28 px/800 tabular beside body call |
| Report controls (three taps) | `fieldset label`, `input[type=radio]` | Radio cards: 48 px, 1.5 px `--ctrl` border r-12; `:checked` via `:has()` = `--go` border + inset ring + `--go-tint` wash + native 20 px dot (`accent-color`) — state is border AND wash AND dot, never colour alone |
| Submit / buttons | `button` | Solid `--go`, 48 px, r-12; disabled = `--sunken` + `--ink-2` at 7.91/8.14:1 — readable in sun even when disabled |
| Report CTA | `.cta` + `p:has(> a.cta)` | Solid green button on glass tray #2, fixed thumb zone (§4, §7) |
| Notices | `noscript p` | `--warn-bg` card, `--warn` border, ink text 15.43/13.56:1 |
| Honesty footer | `footer p` | meta/`--ink-2` over hairline rule; quiet, always present |

Designed now, shipping with their markup (exact paste-ready CSS in `src/styles/recipes.css`;
consumer: DELIVER crafter, same commit as the markup):

| Recipe | Design decision that matters |
|---|---|
| Confidence indicator (decision 7) | `●●○` glyph dots (font glyphs U+25CF/25CB — universal coverage, 0 bytes) + level word, in `--ink-2`; NO colour — confidence is certainty, not verdict, and a green/amber conf would visually collide with the go/stale vocabulary. Reason behind a `<details>`, 44 px summary, rotating marker |
| Accuracy scorecard (decisions 13, 19) | Quiet `--surface` card; the `"7 / 30"` counter at 700/tabular; reads as body prose, not ornament — the honesty block should feel like a statement, not a badge |
| Breakdown bars (decision 17) | 8 px tracks on `--sunken`, fills `--ink-2` (7.91/8.14 non-text); weakest-link fill `--danger` (6.75/6.02) AND named by the arrow + words — colour never carries the callout alone |
| Day-one empty state (decision 19) | Dashed `--ctrl` border card, ink body, counter tabular — visibly "not yet", never blank |
| Image frames (map, photos) | `aspect-ratio` reserves space (zero CLS); `--sunken` well with readable alt text is the loading AND offline state — no shimmer |
| Reveal card (screen 2) | `--surface` card r-16; delta at 700/tabular; queued/no-snapshot variants same card voice |

States are covered without a loading spinner anywhere: pages arrive as rendered HTML
(nothing to wait for), images reserve space and show alt text, offline is the precached
`/sin-senal` page plus the queued-report notice (warn tokens), errors are `--danger` text +
control border with the reason in words (P2 failure behaviour renders through the same notice
recipe).

### 10. Iconography

Inline SVG only, `<symbol>`/`<use>`, `stroke="currentColor"` so icons inherit text colour and
its measured contrast. Wind states (the wireframes' `⤳`/`⤿` arrows are replaced — U+2933-class
glyph coverage on budget Android fonts is not dependable): `w-clean` (two smooth offshore
lines), `w-choppy` (zigzag pair), `w-blown` (crossed gusts + bar). Counted: defs 594 B raw
once per page, 87 B per `<use>` site; 20 rows = 2,334 B raw, **301 B gz** (gzip flattens the
repetition). Confidence dots are font glyphs, 0 bytes. Every icon sits beside its word
(shape + word, never icon alone) and carries `aria-hidden="true"`.

### 11. CSS delivery and the byte budget

**Declared CSS budget: ≤ 6.0 KB gz per route** (the §5 line-item-2 envelope). Measured today:
**7,233 B raw minified → 2,162 B gz** — 36% of budget, 3.8 KB headroom for the recipe blocks
as they land.

Delivery: all three files are raw-imported by `Base.astro`, minified at build time (builder
code, never browser), and inlined as ONE `<style>` block in the head. This deviates from §5's
"full stylesheet, async, content-hashed" line item deliberately, inside the same envelope —
flagged to the application-architecture doc, not silently diverged:

| Why inline wins at this scale | |
|---|---|
| Requests | −1 per session; requests, not bytes, are the binding CloudFront cost (research 08 §12.4) |
| Render path | Zero render-blocking subresources stays literally true; no async-CSS trick needed — the standard `media="print"` swap requires an `onload` handler, i.e. JS for styling, which this product forbids |
| Failure modes | No FOUC branch, no stylesheet-missing branch: the styles travel inside the document they style, like the staleness stamp does |
| Cost | ~2.1 KB gz per document (measured: home 2,662 B gz with CSS, 531 B without); repeat navigations re-pay it until the SW caches routes, which it does from visit one |

Reversal trigger, recorded: if authored CSS exceeds **8 KB gz**, split into a hashed,
`Cache-Control: immutable` stylesheet and re-measure; the trade flips once the per-document
tax outweighs one cached request. Minifier constraint recorded: no CSS string/`content` value
may contain spaces or `{};:,` (currently none do; the one `content: '▸'` lives in
recipes.css).

Measured build (`npm run build` + `gzip -9`, placeholder content, 2026-08-08):

| Route | gz bytes | Ceiling | Headroom |
|---|---:|---:|---|
| `/` (home) | 2,673 | 14,336 | 11.6 KB for 20 real rows + call text |
| `/manana` | 2,680 | 14,336 | same shape |
| `/spots/{slug}` | 2,584 | 14,336 | + lazy map/photos later |
| `/spots/{slug}/reportar` | 2,842 | 6,144 | 3.2 KB (7-band form is the densest static page) |
| `/spots/{slug}/reportado` | 2,559 | 4,096 | shell only, island renders the rest |
| `/en/*` mirror | 2,553–2,799 | same | same |

`npm run typecheck` clean. Smoke at 390 px (Chromium, light + dark, home/spot/report):
horizontal scroll **false** on every route, console errors **0**.

### 12. Enforcement

| Rule | Tooling |
|---|---|
| Contrast never regresses | `axe-core` CLI over built routes in CI (already §9 of application-architecture); the §3 tables are the review-time oracle, axe is the drift gate |
| Byte ceilings incl. CSS | The §5 custom `dist/` walker; CSS has no separate gate because it travels inside the documents that gate already measures |
| Token drift | Hex values live in `tokens.css` ONLY; a grep gate for `#[0-9a-fA-F]{3,6}` outside `src/styles/` keeps colour from leaking into components (recommend adding to CI with the §9 gates) |
| `prefers-reduced-motion` | The global kill switch is structural (one media query disables all transitions/animations); axe + one Playwright reduced-motion smoke |
| Glass fallback | `@supports not` ordering is structural; the poisoned-fixture discipline (clause `check:unfired-is-not-evidence`) applies: the axe run must include one forced-colors/no-backdrop-filter pass before the gate counts as armed |

### 13. What this makes unobservable, and open items

- The Chromium smoke attests layout and console cleanliness, not real-device glass
  performance; the 60 fps claim for `backdrop-filter` on a low-end Android is by-construction
  (tiny fixed regions) but unmeasured — the §15 field smoke on a real phone covers it, and if
  it janks the `@supports` block is deletable without layout change (solid is the base state).
- Ratios are computed for defined pairs; a future component pairing tokens in a combination
  not in §3 needs its row added before it ships — the table is the contract, axe is only the
  net.
- `prefers-reduced-transparency` support is partial in 2026; where unsupported the glass
  worst-case is still AAA by §3, so the media query is an upgrade, not a dependency.
- Flag to `application-architecture.md` (owner: next coherence round): §5 line item 2 reads
  "full stylesheet (async)"; the shipped mechanism is inline-in-document within the same
  envelope (§11 here). One sentence there should adopt or overrule this.
- Flag: `strings.ts` `en.spot.reportCta` is a bracketed placeholder rendered into the built
  English spot page CTA; copy owed before DISTILL freezes strings (Decisions needing
  Andres #6 register check).
