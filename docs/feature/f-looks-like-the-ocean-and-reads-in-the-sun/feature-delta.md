<!-- des-feature-context-bootstrap: {"feature_id":"f-looks-like-the-ocean-and-reads-in-the-sun","intent":"A surfer opens the site on the beach at 6am, in direct sun, and it looks like it belongs to the water it is describing, while every word stays readable.","inventory":[],"schema_version":"1","state":"OPEN"} -->
# Feature context: f-looks-like-the-ocean-and-reads-in-the-sun

Intent: A surfer opens the site on the beach at 6am, in direct sun, and it looks like it belongs to
the water it is describing, while every word stays readable.

Workspace opened 2026-08-09, after Andres approved the rendered proposal. This is a DOCS-ONLY
workspace creation: no acceptance test and no production code exists for this feature yet.

## Why this is a feature and not a polish pass

The project's standing rule is that a user-facing surface ships world-class inside its slice, never
in a deferred cleanup. This feature exists anyway, for one honest reason: **the visual identity
changed after eleven features had already been planned and nine had begun asserting contrast against
the old palette.** Repainting mid-flight would have broken nine lanes at once. So the repaint is
carried as its own dependency-ordered work rather than smuggled into unrelated slices.

It is also not only cosmetic. Body text at 7:1 against the real backdrop is the sunlight margin, a
functional requirement for a product read on a beach at dawn. A saturated palette that loses that
margin is a regression no matter how good it looks on a desk monitor.

## The authority

`docs/product/architecture/adr-blue-tropical-glass-palette.md` (Accepted 2026-08-09) carries the
token values and the ten computed contrast pairs. **If this file and that ADR ever disagree, the ADR
wins.** The rendered proposal at `~/Desktop/surfs-up-panama-ui-proposal.html` is provenance, not
authority: it is a Desktop artifact and is not in the repo.

## Wave: DISCUSS / [REF] Slice Plan

| Slice | Value statement | Status | Annotation | Justification |
|-------|-----------------|--------|------------|---------------|
| slice-01 | A surfer opens the home page and it looks like deep tropical water instead of a grey list, and every word still clears the sunlight margin in both themes. | shipped | @walking_skeleton, owns `src/styles/tokens.css`; fresh U1-U8 proof 2026-08-11 | Thinnest end-to-end vertical: one token file, one surface, both themes, proven by measurement rather than by eye. The tokens are already decided and the ten pairs already computed in the ADR, so this slice's real work is proving the computation holds against the *rendered* backdrop rather than against the hex values in isolation. It is the walking skeleton because every later slice consumes these tokens; if the palette cannot hold 7:1 on the real home page, nothing after it is worth building. Gated on Pre-requisite 1. |
| slice-02 | The built report CTA tray reads as glass over water when supported, and as a deliberate solid card when it is not. | shipped | depends-on slice-01; fresh U1-U8 proof 2026-08-11 | `backdrop-filter: blur(12px) saturate(140%)` already ships at `src/styles/components.css:34` and `:266`; only the report CTA tray has landed markup today. Slice-01 gives it something to blur. This slice is therefore the *fallback*, not the effect: the tokens file already states the rule as "solid-fallback-first everywhere", and `backdrop-filter` carries a real GPU cost on the cheap Android phones this audience uses. The hero call card stays a solid gradient because `09-design-system.md` §4 explicitly refuses glass for the sunlight-read score. `.lang-toggle` remains CSS without built markup until F-READ-IT-IN-YOUR-LANGUAGE and is recorded, never fabricated, by this slice. |
| slice-03 | Every other surface belongs to the same product: spot pages, mañana, ayer, the 404 and both report screens. | shipped | depends-on slice-01; 82-route current-surface sweep and existing U8 proof | Consistency is the difference between a themed home page and a designed product. Held behind slice-01 because a token change proven on one surface is cheap to extend and expensive to unpick. The report screens are the delicate ones: `application-architecture.md` section 8's leak paths forbid the capture route reaching the forecast layer, so this slice may change how those screens look and may not change what they import. |
| slice-04 | The contrast table in the design system says what the code actually does, and CI refuses a build that drifts from it. | shipped | depends-on slice-01; fresh U1-U8 proof 2026-08-11 | `09-design-system.md` carries a contrast table with computed ratios for the OLD palette. Leaving it is worse than having none: a future reader would tune against numbers that no longer describe anything. The `ui` job in `ci:local` already walks built HTML; this slice points it at the new pairs so a palette drift fails loudly instead of silently costing the sunlight margin. This is the slice that makes the whole feature durable rather than a one-time repaint. |
| slice-05 | A surfer reads the ranking at a glance: 70 and 0 look different, and confidence is legible without relying on colour. | shipped | depends-on slice-01; fresh U1-U8 proof 2026-08-11 | The current published page renders every score in identical black type, so twenty rows read as one undifferentiated list and rank is carried only by position. A score bar restores the glance. Confidence gets filled and empty points plus its complete word, never a colour-coded level, per `09-design-system.md` section 9 and the accepted Slice-05 roadmap. A colour-blind surfer and a washed-out screen in direct sun read the same information. Byte cost measured in the proposal at roughly 230 B gz for both. |

Notes on the plan:

- Row order is dependency order, backward only. Slices 02 through 05 are parallel-safe once slice-01
  lands.
- **Nothing here changes a number, a word, or a behaviour.** This feature is tokens, one style block,
  and two presentation elements. If a slice finds itself editing `src/pipeline/`, `src/scoring/` or
  any copy string, it has left its scope.
- **The byte budget is unchanged and unforgiving.** 14 KB gz per document, 100 KB per route first
  visit. The full repaint measured about 400 B gz in the proposal, so this fits comfortably, but the
  page-weight gate runs inside `npm run build` and a regression fails the build.
- Every slice here is user-visible by definition. There is no non-visual slice in this feature, and a
  slice that claims to be non-visual has been mis-scoped.

## Wave: DISCUSS / [REF] Slice classification

| Slice | Classification | Note |
|---|---|---|
| slice-01 | user-visible | The whole slice is what the home page looks like. U1-U7 plus a U8 charter observation, at 390 px, both themes |
| slice-02 | user-visible | Both states are observable: glass rendered, and the solid fallback with the filter disabled |
| slice-03 | user-visible | Six surfaces, each with its own designed states |
| slice-04 | user-visible | The gate is machinery, but its subject is contrast on rendered pages; the observation is that a drifted palette fails the build |
| slice-05 | user-visible | Score bar and confidence shape are pixels on the ranked list |

## Wave: DISCUSS / [REF] Definition of Done

| # | Done means |
|---|---|
| 1 | `src/styles/tokens.css` carries the ADR's token values exactly, for both themes, and no surface hardcodes a colour outside `src/styles/`. |
| 2 | Every pair in the ADR's table is re-measured against the REAL rendered backdrop, including the gradient's lightest stop, in both themes. Body text clears 7:1. All text clears 4.5:1. Non-text UI clears 3:1. |
| 3 | The gradient's lightest stop is `#0D5866` or darker. `#0E5E70` put body text at 6.70 and failed the sunlight margin; that value is recorded so nobody lightens it back. |
| 4 | Glass is proven legible with `backdrop-filter` disabled, which is what a low-end device renders. The solid fallback is the load-bearing layer. |
| 5 | `09-design-system.md`'s contrast table describes the shipped palette, and the `ui` job fails a build whose rendered contrast drifts from it. |
| 6 | Confidence and the weakest-link callout are carried by shape plus word, never by colour alone. |
| 7 | No horizontal scroll or clipping at 390 px or 320 px, with the longest Spanish spot name present. Touch targets stay at or above 44 px. `prefers-reduced-motion` is honoured; nothing added here animates. |
| 8 | Page-weight gate green: 14 KB gz per document, 100 KB per route first visit. |
| 9 | Zero behaviour change. No number, no word and no route differs from before this feature. |
| 10 | Every Slice Plan row above is flipped `shipped`. |

## Wave: DISCUSS / [REF] Out-of-scope

| Out | Lands in |
|---|---|
| Any copy change, any Spanish wording | The features that own those strings; this feature moves no words |
| The English tree and its styling | F-READ-IT-IN-YOUR-LANGUAGE |
| A manual light/dark toggle | Superseded for Phase07 by the user-authorized light-first, persisted public choice. OS preference is never the first-visit selector. |
| Webfonts | Never. System stack only, 0 bytes. The type hierarchy comes from weight, size and tracking |
| Spot photography, maps, illustration | Not planned. The byte budget and the request-count guardrail both forbid it at launch |
| Animation or transitions | Deliberately none. `prefers-reduced-motion` is honoured by having nothing to reduce |
| The OG share card's visual design | F-PASTE-THE-CALL-INTO-THE-GROUP slice-04 owns it; it may consume these tokens once they land |

## Wave: DISCUSS / [REF] Pre-requisites

| # | Pre-requisite | Blocks | Owner | Status |
|---|---|---|---|---|
| 1 | **The current DELIVER wave lands first.** Nine lanes are authoring UI right now and their U1-U7 acceptance checks assert contrast against the OLD palette. Repainting while they run reds all nine at once, for a reason that has nothing to do with their code. | every slice | this feature's lane | open, and it is a hard gate, not a preference |
| 2 | The palette ADR is Accepted | slice-01 | Andres | ANSWERED 2026-08-09. `adr-blue-tropical-glass-palette.md` is Accepted, with the token values and the ten computed pairs |
| 3 | Confirmation that `backdrop-filter` is acceptable on the target device class, or an explicit decision to ship the solid fallback as the only layer | slice-02's effect, not its fallback | Andres | open. Recommendation: ship the effect as enhancement and treat the fallback as the real design, which is what the tokens file already says |
| 4 | Whether the score bar's fill encodes score by colour as well as length | slice-05 | Andres | open. Recommendation: length only, with colour reserved for the weakest-link callout, so the ranked list has exactly one colour that means something |

## Reuse Analysis

| Existing component | File | Overlap | Decision | Justification |
|---|---|---|---|---|
| Design tokens | `src/styles/tokens.css` | **bounded-change**: every value is replaced, the structure and the token names are not | EXTEND | The token names are already consumed correctly everywhere. This feature exists precisely because swapping values is all that should be needed |
| Component styles | `src/styles/components.css` | **bounded-change**: the glass rules at lines 34 and 266 already exist and already reference the right tokens | EXTEND | The machinery is shipped. It renders nothing only because the surfaces behind it are near-white |
| Base layout | `src/layouts/Base.astro` | none: it raw-imports and inlines the CSS, and that mechanism does not change | REUSE | Nothing to change |
| Ranked list | `src/components/RankedList.astro` | **bounded-change** in slice-05 only: the score bar and the confidence shape are new elements inside the existing markup | EXTEND | Rebuilding it would discard the top-card special-casing and the WhatsApp slot another feature just added |
| UI quality gate | `scripts/check-ui-quality.mjs` | **bounded-change** in slice-04: the pairs it checks are repointed | EXTEND | The walker over built HTML is production-owned and shipped |

## Prefactoring Assessment

**NONE, justified.** The tokens are already the single source of colour, every consumer already reads
them by name, and the glass rules already exist. That is exactly the shape that makes a repaint a
value swap. No component needs a flag, a second path or a special case to receive this work. If one
turns out to, that is a finding worth reporting rather than working around.

## Wave: DESIGN / [REF] Forward theme-choice contract

| Origin | Commitment | DDD | Impact |
|--------|------------|-----|--------|
| User request 2026-08-11 | First visit is light on every public Spanish and English route, independent of the device preference. | n/a | Replaces only the earlier launch default so sunlight reading is deterministic. |
| User request 2026-08-11 | A top-left, 44 px accessible control changes between light and dark with the selected action named in the route language. | n/a | Gives the surfer agency without making the page layout or palette authority route-specific. |
| User request 2026-08-11 | The selected choice survives reloads and ES/EN route changes; browser chrome follows it. | n/a | Requires one public preference boundary shared by every rendered document and the page metadata. |
| User request 2026-08-11 | JavaScript-off remains legibly light and initial paint never flashes the opposite mode. | n/a | Makes light CSS the no-script truth and requires a synchronous chosen-theme bootstrap before styles paint. |

### Reconciliation

The earlier DISCUSS out-of-scope row and application architecture decision 5 said “no manual
light/dark toggle” and relied on `prefers-color-scheme`. That was a launch choice, not a safety or
palette invariant. The later explicit user instruction is the controlling authority. It supersedes
that choice for new phase 07 only; all historical phase results remain unchanged. The accepted
aquatic palette, named-token authority, 44 px floor, reduced-motion rule, route budgets and the
static manifest's light/default limitation still stand.

### Minimal production ownership (for 07-01 only)

| Path | Ownership | Boundary |
|------|-----------|----------|
| `src/layouts/Base.astro` | Emits the top-left semantic control and runs the synchronous light-first selection before inline CSS paints. | No route data, score, or feature-specific copy. |
| `src/styles/tokens.css` | Remains the only palette authority; exposes selected-theme token scopes without inventing values. | Aquatic values and contrast floors remain unchanged. |
| `src/styles/base.css` | Styles the top-left 44 px control using named tokens. | Deliberately avoids active slice-02 `components.css`. |
| `src/styles/theme-controller.ts` | Reads/writes the chosen public preference, changes root state, and synchronizes browser theme-color. | No page-specific controller and no delayed hydration. |
| `src/i18n/strings.ts` | Owns Spanish and English accessible action labels. | Labels name the next action, not the current mode. |
| `src/pages/manifest.webmanifest.ts` | Keeps the generated manifest's static light/default color token-derived. | A manifest cannot express one person’s stored choice. |
| `src/styles/chrome-colors.ts` | Derives the light-first opening canvas and browser chrome from the named background tokens. | No authored hexadecimal authority outside tokens.css. |
| `src/styles/offline.css` | Keeps compact fallback documents light-first and gives their emitted toggle the same 44 px top-left geometry. | Must remain within the 3 KB offline document ceiling. |
| `src/pages/en/tomorrow.astro`, `src/pages/en/spots/[slug].astro`, and `scripts/page-weight-core.mjs` | Publish the already-architected English reading route, its existing linked English spot target, and measure both against the 14 KB reading ceiling. | This is the exact authorized English seam, not a new English tree. |
| `tests/e2e/daily-call-with-permanent-receipts/walking-skeleton.spec.ts` | Reconciles its legacy OS-dark setup with the new public contract by making an explicit saved-dark choice. | Keeps its dark behavior coverage without restoring an OS-dark production fallback. |

## Wave: DISTILL / [REF] Theme-choice scenarios

| Scenario | Tags | Tier | Observable boundary |
|----------|------|------|---------------------|
| La surfista abre cualquier ruta sin elección previa y empieza a leer en claro | `@walking_skeleton @slice-07 @step-07-01 @real-io @ui-u1..u7` | A | Built public site, Chromium/WebKit matrix and emitted document sweep. |
| La surfista elige oscuro y su elección la acompaña en español e inglés | `@slice-07 @step-07-01 @real-io @ui-u1..u7` | A | Toggle, reload, route transition, and browser-chrome outcome. |
| La surfista sin JavaScript sigue leyendo una publicación clara | `@slice-07 @step-07-01 @real-io @ui-u1,u2,u4,u5,u6,u7` | A | JavaScript-off public document on a dark-preference phone. |
| Una elección anterior que ya no se entiende vuelve a una lectura clara | `@slice-07 @step-07-01 @real-io @negative @error @ui-u1,u2,u4,u5,u6,u7` | A | Real browser preference recovery from a malformed stored value. |
| Una publicación cuyo borde del navegador no sigue el tema elegido se rechaza antes de publicar | `@slice-07 @step-07-01 @real-io @negative @error @ui-u7` | A | Isolated generated-document regression check. |

Tier B is intentionally absent: this is a configuration-shaped preference journey with a small,
explicit state space; the production composition and real browser are the valuable proof.

### Adapter and environment coverage

| Boundary | Mechanism | Scenario coverage |
|----------|-----------|-------------------|
| Built reading surface | Real `npm run build`, local Astro preview, emitted `dist/` | All five scenarios |
| Browser engines | Chromium at 390, 320 and desktop; Safari/WebKit at mobile and desktop | Walking skeleton |
| Preference storage | Real browser preference through click, reload and route change | Chosen-mode scenario |
| JavaScript-off fallback | Real browser context with JavaScript disabled | No-JavaScript scenario |
| Generated browser chrome | Real emitted theme-color plus isolated artifact mutation | Walking skeleton and negative scenario |
| Named-token authority | The existing `npm run test:ui` static style boundary, kept separate from the source-blind acceptance suite | U7 command in 07-01 |

The environment names map directly to the published proof: `clean` is the credential-free build
and fresh preview; `with-pre-commit` is the same build under the repository's installed checks;
and `with-stale-config` is the malformed previous preference in the recovery scenario. The acceptance
suite observes only the published surface. The separate U7 static check protects the named-token
boundary without turning an end-user scenario into a source-file inspection.

### RED scaffolds and placement

The real public composition already exists, so no production scaffold is needed. The first scenario
must fail on current main because a dark-preference first visit paints dark rather than the same
light reading surface, before any test reaches a missing-module or setup branch. The executable
contract is `tests/acceptance/f-looks-like-the-ocean-and-reads-in-the-sun/theme-choice-begins-light.feature`
with its matching TypeScript steps; source-blind U8 examination lives at
`docs/product/expectations/f-looks-like-the-ocean-and-reads-in-the-sun/la-surfista-elige-claro-u-oscuro-sin-perder-la-lectura.md`.

### [HOW] Domain language fact-to-step table

| Fact / observation | Step surface |
|--------------------|--------------|
| The visitor has not chosen a reading mode. | `la surfista abre la portada sin haber elegido un tema` |
| The publication opens across the supported reading environments. | `la publicación real se construye y se abre en teléfonos claros y oscuros, en escritorio y en Safari` |
| The visitor chooses the darker reading mode and continues browsing. | `la surfista activa el modo oscuro, recarga y sigue una ruta en español y su gemela en inglés` |
| The reading surface begins in the light mode. | `la página empieza clara aunque el teléfono prefiera oscuro` |
| The accessible control announces its next action. | `el control anuncia “Activar modo claro” en español y “Switch to light mode” en inglés` |
| The reading surface works without script. | `ambas llegan listas, claras, legibles y sin movimiento antes de que exista una elección guardada` |
