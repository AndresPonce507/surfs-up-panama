# Slice-02 and Slice-03 red classification

Feature: `f-looks-like-the-ocean-and-reads-in-the-sun`

## 2026-08-11 terminal repair: browser and installed-app chrome

Command run from a clean worktree at exact `origin/main` base
`1f5315a4c142c7061561ed5eab932a6ad3fe7470` after `npm ci`:

```text
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-06 and @step-06-01'
```

Classification: `MISSING_FUNCTIONALITY`.

The real production build completed, emitted `dist/index.html` and
`dist/manifest.webmanifest`, and reached the observable assertion. It failed because the emitted
light browser chrome still uses the superseded surface rather than the current token-backed page
background:

```text
AssertionError [ERR_ASSERTION]: el borde claro publicado es #FFFFFF, pero el fondo claro publicado es #F2F8FA
```

This is the right RED. It is not an absent proposed module, a Cucumber import failure, a fixture
failure, or an unbuilt artifact. The manifest also still serializes `background_color: #FFFFFF`
and `theme_color: #0A6A2D`; the second and later assertions deliberately remain unreached until
the first observable mismatch is repaired.

The repair is forward-only. Its roadmap step 06-01 assigns production ownership to a token-derived
build-time chrome reader, `Base.astro`, and a generated manifest endpoint. It does not claim that
the five historical Design slices had this evidence.
Slices entered: `slice-02` and `slice-03 / 03-01, 03-02`, 2026-08-10

## Commands observed

```sh
npm run test:at -- --dry-run --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-02'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-02'
```

The binding run had 11 scenarios and 130 steps. It had zero undefined,
ambiguous, pending, skipped, fixture, import, browser-startup, or setup failures.
Every browser scenario builds a contained copy of the real Astro application, serves the
emitted page over HTTP, and reads the built spot route through Chromium.

## Classification

| Scenario group | Observable exercised | Classification | Evidence |
|---|---|---|---|
| Glass support removed, both themes and widths | Built `/spots/{slug}/` CTA tray | `GUARD_GREEN` | Existing solid-first declaration rendered a fully opaque, unfiltered tray. CTA contrast, width, touch target, motion, and named-token checks passed. |
| Reduced-transparency branch forced | Built `/spots/{slug}/` CTA tray | `GUARD_GREEN` | The contained build forced only the shipped media branch; it rendered the same solid, unfiltered tray. |
| Glass-first regression | Built `/spots/{slug}/` CTA tray | `MISSING_FUNCTIONALITY` when deliberately mutated | The contained copy replaced the real tray's solid base with `var(--glass)` after removing supports. The browser oracle rejected it naming the tray background. The Cucumber scenario passes because the rejection is required. |
| No language-pill invention | Built `/spots/{slug}/` | `GUARD_GREEN` | `.lang-toggle` is absent from the emitted page. This is an honest scope fact, not a missing user feature. |
| Supported tray and solid hero | Built spot route plus home route | `GUARD_GREEN` | The real tray has active translucent blur and a readable CTA. The real first ranked card has no backdrop filter and retains its `linear-gradient`. |
| Static ready route | Built `/spots/{slug}/` | `GUARD_GREEN` | The page is ready with its real report-route href and no invented language control. |

## Gate result

This recovery is a DISTILL/map repair around styling that is already present, so the positive
scenarios are honestly green rather than fabricated RED. The one deliberate regression reaches
the rendered behavior oracle and proves the guard would be RED for missing solid-fallback
functionality. No failure is classified as BROKEN. No later-slice test was authored.

## Slice-03 / 03-01 commands observed

```sh
npm run typecheck
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-03 and @step-03-01'
```

## Slice-03 / 03-01 classification

| Scenario group | Observable exercised | Classification | Evidence |
|---|---|---|---|
| Playa Venao and its yesterday receipt, light and dark | Real emitted spot and yesterday documents at 390 px | `GUARD_GREEN` | The contained production build reached Chromium in both themes. The user-visible today/tomorrow cards, score, size, window, navigation, report action, reading margin, touch surfaces, viewport and reduced-motion checks all reached their browser oracles. |

The inherited token cascade already satisfies this visual consistency contract, so a missing-style
RED is not honestly available. This is a guard contract, not a fabricated failure.

## Slice-03 / 03-02 commands observed

```sh
npm run typecheck
npm run test:at -- --dry-run --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-03 and @step-03-02'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-03 and @step-03-02'
```

## Slice-03 / 03-02 classification

| Scenario group | Observable exercised | Classification | Evidence |
|---|---|---|---|
| Unknown page, capture screen and reveal screen, light and dark | Real emitted 404 and report documents at 390 px | `MISSING_FUNCTIONALITY` | The reveal screen's only live link, `Playa Venao`, measures 92×20 px in both themes. The contract requires 44×44 px minimum for an interactive target, so this is a user-visible RED rather than a setup failure. |
| Raw unknown-page regression | Contained emitted 404 document | `GUARD_GREEN` | Replacing the human Spanish explanation with `AccessDenied` is rejected by the built-surface oracle. |
| Early prediction regression | Contained emitted report document | `GUARD_GREEN` | Adding the current forecast call as plain visible text to the capture document is rejected by the browser oracle before publication. |

The 03-02 scaffold compiles, all four scenarios bind, and its two deliberate regressions reach
their intended oracles. The remaining positive failure is an honest product gap, not an import,
fixture, browser-startup or assertion-shape failure. Slice-03/03-03 remains unarmed and absent.

## Slice-03 / 03-03 commands observed

```sh
npm run typecheck
npm run test:at -- --dry-run --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-03'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-03'
```

## Slice-03 / 03-03 classification

| Scenario group | Observable exercised | Classification | Evidence |
|---|---|---|---|
| Exhaustive emitted-route walk | Contained `npm run build`, then every Slice-03 document over Chromium at 390 px in clear and dark themes | `GUARD_GREEN` | The production build and page-weight gate ran before each browser walk. The output named 82 documents in each theme: 20 spot, 20 yesterday, 20 report capture, 20 report result, one tomorrow and one unknown-page document. Text is measured against solid, translucent-composited and every gradient-stop backdrop. |
| Empty published population | Explicit zero-document population passed to the terminal population guard | `MISSING_FUNCTIONALITY` when deliberately falsified | The guard rejects the population with the exact "inspeccionó cero pantallas" reason. The Cucumber scenario passes because that rejection is required. |

The terminal sweep is honestly green. It has no style change to drive: the inherited token cascade
reached every emitted document. The prior 03-02 interactive-target RED was remediated by
`320b1be`; the full unrestricted Slice-03 run now passes 10 scenarios and 136 steps. The former
03-02 evidence above remains historical evidence, rather than being rewritten.

## Slice-04 / 04-01 commands observed

```sh
npm run typecheck
npm run test:at -- --dry-run --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-04 and @step-04-01'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-04 and @step-04-01'
```

## Slice-04 / 04-01 classification

| Scenario group | Observable exercised | Classification | Evidence |
|---|---|---|---|
| Design contrast record compared with the clear and dark home | Real `npm run build`, emitted home at 390 px, Chromium computed styles, then `09-design-system.md` §3 | `MISSING_FUNCTIONALITY` | The built page paints the approved blue-tropical body, hero title, hero copy, backgrounds and load-bearing gradient stop. The design record lacks the required clear- and dark-theme blue-tropical rows, including `#E8F7FA` on `#0D5866` at 7.34:1 AAA. The run reaches that record mismatch, not an import, build, preview or browser fault. |
| Deliberately stale record | Isolated in-memory valid record, deliberately dirtied before comparison | `GUARD_GREEN` | The negative scenario restores a known neutral value and removes a required tropical value; the oracle names both. It writes no production file and remains valid after the production record is corrected. |

The 04-01 steps typecheck, all three scenarios bind, and the real target run is RED for the
intended document drift. It does not modify the blocked Slice-02/02-02 work or any completed
Slice-03 evidence. The later browser-wide gate and mutated-build proof remain unarmed 04-02 and
04-03 work, respectively.

## Slice-05 / 05-01 commands observed

```sh
npm run typecheck
npm run test:at -- --dry-run --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-05'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-05 and @step-05-01'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-05 and @step-05-02'
npm run test:at -- --tags '@feature-f-looks-like-the-ocean-and-reads-in-the-sun and @slice-05 and @step-05-03'
```

## Slice-05 / 05-01 classification

| Scenario group | Observable exercised | Classification | Evidence |
|---|---|---|---|
| Length-only score bars on today and tomorrow | Production `npm run build`, emitted `/` and `/manana.html`, Chromium at 390px in clear and dark themes | `MISSING_FUNCTIONALITY` | The real build, preview, browser, both routes, both themes, and all 40 ranked rows complete before the first business assertion. It fails only because each row reports `no tiene una barra completa`; no import, fixture, build, browser, preview, route, or data-order failure occurs. |
| Confidence shape plus word | Same rendered rows and production component contract | `MISSING_FUNCTIONALITY` | The real built routes, both themes, and all 40 ranked rows complete before the business assertion. Each row then reports `no conserva palabra y puntos` because the current emitted confidence disclosure has its word but no settled `.dots` shape. |
| Full colour-independent reading pass | Same production build and browser surface, then an emitted-page grayscale and zero-saturation pass | `MISSING_FUNCTIONALITY` | The executed terminal scenario reaches the production build and browser surface, then fails at the first missing-bar assertion. Its post-GREEN path removes hue from the emitted page and compares the remaining visible bar lengths, words, and points rather than claiming colour safety from source text. |

The Slice-05 feature file binds five scenarios and 80 steps, including two contained rendered-surface
regressions that reject a removed bar or removed confidence points. `npm run typecheck` passes and the
dry run discovers all bindings. The executed 05-01 run is a right-reason RED: it reaches the
production-built surface and fails at the observable absence of the requested bar, not test setup.
The charter's U8 session log is intentionally unsealed until a post-GREEN source-blind examination.
