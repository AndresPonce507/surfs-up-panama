# Slice-02 red classification

Feature: `f-looks-like-the-ocean-and-reads-in-the-sun`
Slice entered: `slice-02`, 2026-08-10

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
