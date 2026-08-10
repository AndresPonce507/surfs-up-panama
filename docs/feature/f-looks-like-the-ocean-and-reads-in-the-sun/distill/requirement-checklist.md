# Slice-02 and Slice-03 requirement checklist

Feature: `f-looks-like-the-ocean-and-reads-in-the-sun`
Slices entered: `slice-02` and `slice-03 / 03-01`, 2026-08-10

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

## Deferred inventory, not authored

| Slice | Build map | Charter | Acceptance suite | Status |
|---|---|---|---|---|
| slice-03 | Existing roadmap rows 03-01..03-03 | 03-01 present | 03-01 armed | 03-02 and 03-03 remain absent until their dependency turn. |
| slice-04 | Existing roadmap rows 04-01..04-03 | Missing | Missing | JIT DISTILL has not opened it. |
| slice-05 | Existing roadmap rows 05-01..05-03 | Present | Missing | JIT DISTILL has not opened it. |

No future-slice feature file, charter, or step definition was created in this turn. The new
Slice-03 contract covers only the dependency-ready 03-01 route pair.
