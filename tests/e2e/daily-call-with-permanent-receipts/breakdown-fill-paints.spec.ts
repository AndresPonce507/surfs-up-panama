// Regression: a scored factor bar on the spot page must PAINT its fill.
//
// The bug this pins (live since the breakdown shipped, spotted 2026-08-13):
// Breakdown.astro renders its meter as `<span class="track"><span
// class="fill">`. The track is a grid item of `.bar`, so the grid container
// blockifies it and its 8px height renders; the fill inside it is NOT a grid
// item, stays `display: inline`, and an inline box ignores width and height.
// Every scored factor therefore painted a 0x0 fill: the number said 1.00 and
// the bar beside it said nothing at all. All computed-style checks passed
// (background-color resolved fine); only the rendered BOX was empty, which
// is why this spec measures getBoundingClientRect on the real page instead
// of reading styles.
//
// Route form: the file path (`/spots/{slug}.html`), never the directory form
// -- the e2e vite preview serves index.html for directory routes (the
// SPA-fallback wrinkle spot-own-page.steps.ts documents). The slug is read
// from the home page's own first spot link so the spec follows the published
// ranking instead of pinning a beach that could drop out of the data.
import { expect, test } from '@playwright/test';

test('a scored breakdown factor paints a visible fill box', async ({ page }) => {
  // Reduced motion, deliberately: the spot page's reveal treatment tweens
  // fills from scaleX(0) right after load, so an eager measurement races the
  // animation and reads a legitimate 0. Under reduce the reveal script exits
  // and base.css kills every transition, leaving exactly the static truth
  // this spec pins: the fill's rendered box, no motion in between. The
  // pre-fix bug (an inline fill ignoring its width) failed this spec in both
  // motion modes.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const firstSpotHref = await page
    .locator('ol.ranked li a[href^="/spots/"]')
    .first()
    .getAttribute('href');
  expect(firstSpotHref).not.toBeNull();
  const fileRoute = `${(firstSpotHref as string).replace(/\/$/, '')}.html`;

  await page.goto(fileRoute);
  const scoredFills = page.locator(
    'section[data-day="today"] [data-field="breakdown"] .bar .fill',
  );
  // Today always scores direction, size and wind (only tide can be absent),
  // so a page with zero scored fills means the selector contract broke --
  // fail loud rather than green a vacuous assertion.
  expect(await scoredFills.count()).toBeGreaterThan(0);

  const boxes = await scoredFills.evaluateAll((fills) =>
    fills.map((fill) => {
      const rect = fill.getBoundingClientRect();
      return { width: rect.width, height: rect.height, inlineWidth: (fill as HTMLElement).style.width };
    }),
  );
  for (const box of boxes) {
    // Every emitted fill carries a producer-computed inline width of at
    // least 1%; the rendered box must agree with it instead of collapsing.
    expect(box.width, `fill declared ${box.inlineWidth} but painted ${box.width}px wide`).toBeGreaterThan(0);
    expect(box.height, `fill painted ${box.height}px tall`).toBeGreaterThan(0);
  }
});
