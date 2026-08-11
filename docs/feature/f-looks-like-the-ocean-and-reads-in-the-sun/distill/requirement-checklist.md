# Slice-02, Slice-03 and Slice-04 requirement checklist

Feature: `f-looks-like-the-ocean-and-reads-in-the-sun`
Slices entered: `slice-02`, `slice-03 / 03-01, 03-02`, and `slice-04 / 04-01`, 2026-08-10

## Reconciliation

`09-design-system.md` §4 and the Slice-02 expectation charter are the accepted,
surface-specific truth: the hero call card remains a solid tropical-water gradient because
it carries the score read in direct sunlight. The older feature-delta phrase "big card reads
as glass" was ambiguous. This DISTILL turn corrects it to the built report CTA tray, the only
glass selector with current markup. The accepted palette ADR's general phrase "glass card over
it" does not assign glass to the hero and does not override the explicit surface allocation.

`.lang-toggle` exists only as CSS. `Base.astro` emits no corresponding element and the English
tree is deferred to `F-READ-IT-IN-YOUR-LANGUAGE`. The suite verifies that absence instead of
manufacturing markup or treating the absent control as current user functionality.

## Slice-02 coverage

| Requirement | Scenario / driving surface | Evidence shape |
|---|---|---|
| Solid fallback when glass support is absent | `El teléfono que no puede pintar vidrio...` / real built `/spots/{slug}/` | Contained Astro build with only real `@supports` blocks removed, then Chromium reads the emitted route at 390 and 320 px in both themes. |
| Solid fallback when transparency is reduced | `La transparencia reducida...` / real built `/spots/{slug}/` | Contained Astro build forces the shipped reduced-transparency branch, then Chromium measures the real route. |
| Glass-first regression cannot pass | `Una bandeja que comienza...` / real built `/spots/{slug}/` | Contained copy replaces only the CTA tray's solid base with glass after removing supports; the browser oracle must name the tray background. |
| Language control has not landed | `La píldora de idioma...` / real built `/spots/{slug}/` | Chromium confirms no `.lang-toggle` in emitted spot HTML. This is an honest scope record, not a missing implementation. |
| Supported enhancement and solid hero | `Con vidrio disponible...` / real built `/spots/{slug}/` | Browser sees translucent, filtered CTA tray and confirms the hero has neither transparency nor backdrop filter. |
| Static ready outcome | `La construcción real conserva...` / real built `/spots/{slug}/` | Built spot page has no busy state, exposes the real report route, and still has no invented language control. |

## UI mandate coverage

| Mandate | Slice-02 executable scenario |
|---|---|
| U1 contrast | Solid fallback, reduced transparency, and supported enhancement scenarios measure the CTA text/background pair. |
| U2 small viewport | Solid fallback runs at 390 and 320 px with a browser scroll-width assertion. |
| U3 touch target | Solid fallback measures the real CTA link at 44 px minimum. |
| U4 motion | Browser uses reduced motion and rejects a nonzero transition or animation on the CTA. |
| U5 states | Static public HTML arrives ready with no fake busy state; no async loading, empty, or error flow belongs to this visual-only slice. |
| U6 type rhythm | The suite requires the declared touch and spacing tokens on the real component mechanism. |
| U7 named tokens | The CTA tray's source mechanism is checked for `--bg`, `--sp-3`, and `--sp-4`; rendered checks prove that mechanism reaches the page. |
| U8 charter | `docs/product/expectations/f-looks-like-the-ocean-and-reads-in-the-sun/the-big-card-reads-as-glass-over-water-and-on-a-phone-that-cannot-render-glass-it-still-reads-per.md` is the source-blind observation. Its title/body already state the actual tray and solid hero boundary. |

## Slice-03 / 03-01 coverage

| Requirement | Scenario / driving surface | Evidence shape |
|---|---|---|
| Spot detail and yesterday receipt retain the tropical product identity | `La página de un spot y su recibo de ayer...` / real built Playa Venao and yesterday receipt | A contained production Astro build is served to Chromium at 390 px in both themes; the browser observes only emitted documents. |
| Today and tomorrow retain their useful reading facts | same scenario / real built spot detail | The visible today and tomorrow cards, score, size, window, back link and report action must all remain present and readable. |
| Sunlight, phone, touch and reduced-motion disciplines hold | same scenario / real built routes | Rendered body words clear 7:1, controls are at least 44 px where present, no horizontal scroll occurs, and reduced motion removes movement. |
| Source-blind U8 observation | `every-other-surface-belongs-to-the-same-product-spot-pages-manana-ayer-the-404-and-both-report-sc.md` | The charter carries the roadmap's exact 03-01 observation and negative observations without asking the examiner to inspect code. |

## Slice-03 / 03-02 coverage

| Requirement | Scenario / driving surface | Evidence shape |
|---|---|---|
| The unknown page and both report screens remain one readable product | `La página que no existe y las dos pantallas de reportar...` / real emitted 404, capture and reveal documents | A contained production Astro build is served to Chromium at 390 px in both themes. The browser checks palette, AA contrast, no horizontal scroll, ready state and 44 px interactive targets. |
| Selection and unavailable report action do not rely on colour alone | same scenario / real emitted capture document | Chromium selects a real radio card, observes its native checked state plus its card treatment, and confirms the disabled action remains visible and legible at its full control size. |
| Reporting does not visibly reveal the prediction before the surfer reports | same scenario / real emitted capture and reveal documents | Chromium rejects score, call, size, wind and forecast markers in both built documents. The architecture's separate CI source-dependency rule remains its own enforcement mechanism, not a substitute acceptance assertion. |
| A raw unexplained unknown page is rejected | `Una playa inexistente que no explica qué pasó...` / contained mutated 404 document | The copy emits only a raw denial word, and the same built-surface oracle must reject it. |
| A report page that visibly advances the prediction is rejected | `Una pantalla de reportar que adelanta la llamada...` / contained mutated report document | The copy adds the real current forecast call as plain visible text and the browser oracle rejects the emitted report before publication. |
| Source-blind U8 observation | `every-other-surface-belongs-to-the-same-product-spot-pages-manana-ayer-the-404-and-both-report-sc.md` | The charter states the 03-02 observation and its two user-visible failure modes without asking the examiner to inspect source. |

## Slice-03 / 03-03 coverage

| Requirement | Scenario / driving surface | Evidence shape |
|---|---|---|
| Every emitted Slice-03 document receives the same product treatment | `Cada pantalla publicada conserva...` / contained `npm run build`, then literal emitted HTML routes | The production command includes publish verification and the page-weight gate. The test enumerates actual `dist/` documents after that build rather than deriving a sample from data. |
| Every spot has its detail, yesterday, report-capture and report-result documents | same scenario / all `dist/spots/**.html` | Each emitted spot family must contain all four public documents. `manana.html` and `404.html` are required alongside those families. |
| The terminal pass cannot be vacuous | `Una publicación sin pantallas...` / controlled empty published population | The population guard rejects zero inspected documents and names that exact reason. |
| Palette, reading, mobile fit, reduced motion and ready state hold across the population | same scenario / Chromium at 390 px in clear and dark themes with reduced motion | For every emitted document in both themes, the browser compares the real palette to the built home surface and rejects blank, overflowed, moving or unreadable pages with their literal emitted filename. Translucent layers are composited over their real backdrop and gradients are measured at every emitted stop. |
| Report screens preserve their non-forecast boundary | same scenario / locked report import commitments | The two report-component import lists are compared exactly against their accepted boundary before the terminal pass is accepted. |

## Slice-03 / 03-03 UI mandate coverage

| Mandate | Terminal-sweep evidence |
|---|---|
| U1 contrast | Each emitted document in clear and dark themes has a real browser contrast pass for visible reading text against its rendered backdrop. Translucent surfaces are composited and every gradient stop is checked. |
| U2 small viewport | Each emitted document is opened at 390 px and rejects horizontal overflow. |
| U3 touch target | N/A for the terminal: it adds no new control. The unrestricted `@slice-03` run retains the 03-01 and 03-02 control checks. |
| U4 motion | Each emitted document is inspected with reduced motion and rejects active transitions or animations. |
| U5 states | The sweep rejects blank or busy documents; the zero-population scenario proves the terminal cannot report a made-up ready state. |
| U6 type rhythm | Each emitted document proves its computed body family, body scale and body leading resolve from the product type tokens. |
| U7 design-system compliance | Each emitted document proves the emitted stylesheet both declares and uses the product’s type, colour, spacing, radius, elevation, motion and touch tokens. |
| U8 charter | The source-blind charter above requires the exhaustive public walk, names its observed population, and defines zero inspection as failure. |

## Slice-04 / 04-01 contrast-record coverage

| Requirement | Scenario / driving surface | Evidence shape |
|---|---|---|
| §3 contrast table describes the shipped blue-tropical home page, in both themes | `La tabla de contraste cuenta exactamente cómo se lee la portada publicada...` / `npm run build` then the emitted home document at 390 px | Chromium reads the production-built home in each theme. The contract compares its rendered body, hero-title, hero-copy, background and gradient-stop values with the ratios and floors the design record must state. |
| Old neutral values are removed rather than preserved beside the new record | same scenario / design-system contrast record | The acceptance oracle rejects the known neutral values and names every missing blue-tropical pair, so a half-rewritten table cannot pass. |
| The record remains part of the production protection path | same scenario / local CI entry plus Cucumber discovery | The scenario proves the normal acceptance job discovers contracts and the same local review retains the build-and-page-weight boundary. It adds no side CI job. |
| The drift oracle is falsifiable | `Una tabla que todavía muestra una pareja...` / isolated in-memory copy of the existing record | The negative copy retains the old table without writing production files; the oracle must name an obsolete grey value and a required tropical pair. |

## Slice-04 / 04-01 UI mandate coverage

| Mandate | Executable evidence |
|---|---|
| U1 contrast | Built home at 390 px in clear and dark themes is measured before the table is accepted; every required row includes its literal ratio and AA/AAA floor. |
| U2 small viewport | The real 390 px home rejects horizontal overflow. |
| U3 touch target | Every interactive home control is measured at 44 px minimum. This documentation step adds no new control. |
| U4 motion | The real home opens with reduced motion and rejects active transitions or animation. |
| U5 states | The built home must arrive with ranked content rather than an invented blank or busy state; this step adds no asynchronous state. |
| U6 type rhythm | Computed home body typography must retain the declared system family, 17 px body scale and 1.5 leading. |
| U7 named tokens | The emitted home mechanism and its sources prove named colour, spacing, radius, elevation and motion tokens; the local CI acceptance and build path discovers this contract. |
| U8 charter | `docs/product/expectations/f-looks-like-the-ocean-and-reads-in-the-sun/the-contrast-table-in-the-design-system-says-what-the-code-actually-does-and-ci-refuses-a-build-t.md` supplies the source-blind observation and explicit stale-record failure. |

## Slice-05 / contract coverage

| Requirement | Scenario / driving surface | Evidence shape |
|---|---|---|
| Every visible score gains a length-only bar without changing forecast facts | `Cada puntaje conserva su lugar y gana una barra proporcional...` / production `npm run build`, then emitted `/` and `/manana.html` through Chromium | The browser compares every rendered score and its descending order to the published surface, requires one complete bar per row, measures each fill against its own score, and rejects a second bar colour vocabulary. |
| Every visible confidence level keeps its word and gains the settled filled/empty-point shape | `La confianza conserva su palabra y suma puntos...` / same production-built routes | The browser observes every rendered confidence disclosure, checks its published level, full Spanish word, settled point shape, shared colour, touch size, reduced-motion behaviour, and contrast against the painted reading backdrop. |
| The presentation change preserves phone reading and the named design system | all Slice-05 scenarios / real built routes at 390px in light and dark themes | The browser rejects overflow, a busy page, moving new elements, weak bar contrast, missing named measures, and a missing visible bar or confidence point. |
| Source-blind U8 observation | `a-surfer-reads-the-ranking-at-a-glance-84-and-6-look-different-and-confidence-is-legible-without-.md` | The charter carries the exact three roadmap observations for 05-01 through 05-03. It intentionally awaits a post-GREEN human observation rather than inventing a visual verdict in DISTILL. |

## Slice-05 / UI mandate coverage

| Mandate | Executable evidence |
|---|---|
| U1 contrast | The real browser measures every score-bar fill against its rendered track at the 3:1 non-text floor, and keeps visible confidence word and point colours aligned. |
| U2 small viewport | Both emitted ranking routes reject horizontal overflow at 390px in light and dark themes. |
| U3 touch | Score bars and points add no action; every existing confidence disclosure still measures at least 44 by 44px. |
| U4 motion | With reduced motion emulated, new fills and confidence points declare neither transition nor animation. |
| U5 states | Both static reading routes must arrive complete with all published rows and no busy state. |
| U6 type rhythm | The emitted routes must resolve the named caption, spacing, and radius measures that keep scores and confidence in the existing reading rhythm. |
| U7 named tokens | The emitted ranking routes must resolve the product's named spacing, radius, type, secondary-ink, and sunken-surface measures. |
| U8 charter | The source-blind charter names the three required observations. Its append-only session log remains empty until a post-GREEN examiner can observe the finished surface. |

## Deferred inventory, not authored

| Slice | Build map | Charter | Acceptance suite | Status |
|---|---|---|---|---|
| slice-03 | Existing roadmap rows 03-01..03-03 | 03-01, 03-02 and 03-03 present | 03-01 green; 03-02 depends on its recorded product fix; 03-03 terminal sweep armed | 03-03 is a contract-only terminal sweep; it changes no product source. |
| slice-04 | Existing roadmap row 04-01 mapped to `@slice-04 @step-04-01`; 04-02..04-03 remain unarmed | 04-01 present | `contrast-gate-drift.feature` and matching steps present, deliberately RED until §3 is rewritten | 04-01 is contract-only and owns no product source; it preserves the blocked 02-02 and completed Slice-03 evidence. |
| slice-05 | Existing roadmap rows 05-01..05-03, corrected to the current published 70-to-0 spread | Present | `score-bar-and-confidence-shape.feature` with matching TypeScript steps | Armed RED: all three step tags bind; 05-01 reaches the real built home and Mañana surfaces before failing only on the missing score bars. |

No further future-slice feature file, charter, or step definition was created in this turn. The
new Slice-05 contract covers only the dependency-ready ranking routes and leaves other feature
slices unchanged.
