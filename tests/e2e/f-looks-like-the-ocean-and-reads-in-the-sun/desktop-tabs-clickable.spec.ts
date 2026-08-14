// Regression: the Hoy/Mañana tabs must actually receive clicks on a desktop
// viewport.
//
// The bug this pins (found live 2026-08-13, user-reported as "the Mañana
// button does nothing"): every ranked-list content block shares one
// `position: relative` rule, and on desktop the intro block floats left while
// `ol.ranked` follows it in the DOM. Two positioned boxes at z-index auto
// stack in DOM order, so the list's (transparent) border box painted OVER the
// floated intro's tab targets and swallowed every click. The links were
// present, styled, 44px tall, keyboard-reachable, and dead to a mouse. No
// existing check could see it: the touch audit measures boxes, not hit
// targets, and every other navigation test calls goto() or click() on
// mobile, where the single-column flow never overlaps the tabs.
//
// So this spec clicks the real element at a desktop width and asserts the
// URL changed. It deliberately asserts ONLY the URL: the vite preview server
// behind the e2e project serves index.html for directory-form routes (the
// SPA-fallback wrinkle spot-own-page.steps.ts documents), so the served
// document is not trustworthy here, but the URL proves the click landed on
// the anchor instead of a covering box, which is the whole regression.
import { expect, test } from '@playwright/test';

test.describe('desktop tab hit targets', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('clicking Mañana on the home page navigates', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Mañana' }).click();
    await expect(page).toHaveURL(/\/manana\/?$/);
  });
});
