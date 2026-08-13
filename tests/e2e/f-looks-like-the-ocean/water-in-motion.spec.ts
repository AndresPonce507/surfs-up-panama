// covers: f-looks-like-the-ocean slice-06 (the water moves, legibility holds)
// Acceptance for the ranked-list water treatment, driven through the built
// site at both the phone default and a desktop viewport. Selectors are the
// slice's stable data-dg hooks plus semantic text; scores and names are read
// off the page, never hardcoded (the surface regenerates daily).

import { expect, test } from '@playwright/test';

const DESKTOP = { width: 1440, height: 900 } as const;

test.describe('the water band and the call card', () => {
  test('the home top is deep water carrying the call: name, score, ring, window bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-dg="sea"]')).toBeAttached();
    const topLink = page.locator('ol.ranked li:first-child a').first();
    await expect(topLink).toHaveText(/^VE A /);
    const score = page.locator('ol.ranked li:first-child strong[data-dg="ring"]');
    await expect(score).toBeVisible();
    await expect(score).toHaveText(/^\d{1,3}$/);
    await expect(page.locator('[data-dg="window"]')).toBeVisible();
  });

  test('desktop gets the same water, wider, with no sideways scroll', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expect(page.locator('[data-dg="sea"]')).toBeAttached();
    await expect(page.locator('[data-dg="window"]')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the phone never scrolls sideways either', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('the coast rises as you read', () => {
  test('rows carry the reveal hook and every score stays readable text', async ({ page }) => {
    await page.goto('/');
    const rows = page.locator('[data-dg="reveal"]');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(5);
    // scroll the last row into view: it must end fully visible, not stuck
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeVisible();
    // revealed means the entrance animation finished, not full brightness:
    // the "hoy no vale la pena" tier is DESIGNED dimmed (opacity .78)
    await expect
      .poll(async () => rows.last().evaluate((el) => Number(getComputedStyle(el).opacity)), {
        timeout: 4000,
      })
      .toBeGreaterThan(0.5);
    // every row still carries a numeric score as text
    const scores = await page.locator('[data-dg="reveal"] strong').allTextContents();
    expect(scores.length).toBe(count);
    for (const value of scores) expect(value).toMatch(/^\d{1,3}$/);
  });
});

test.describe('reduced motion strips the show, never the content', () => {
  test('every row is immediately visible with no animation to wait for', async ({ page }) => {
    // emulateMedia rather than test.use: this repo's harness version ignores
    // the context-level reducedMotion option (proven by this test's own
    // reduceApplied guard, which stays as the tripwire).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const state = await page.evaluate(() => ({
      reduceApplied: matchMedia('(prefers-reduced-motion: reduce)').matches,
      htmlClasses: document.documentElement.className,
      hiddenRows: [...document.querySelectorAll('[data-dg="reveal"]')]
        .filter((row) => Number(getComputedStyle(row).opacity) < 0.5).length,
    }));
    expect(state.reduceApplied, 'the harness must actually emulate reduced motion').toBe(true);
    expect(state, 'no row may hide behind an animation under reduced motion').toMatchObject({ hiddenRows: 0 });
    await expect(page.locator('ol.ranked li:first-child strong[data-dg="ring"]')).toBeVisible();
  });
});

test.describe('day and night both hold', () => {
  test('the toggle flips the document theme, text stays legible, and the choice survives reload', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-theme-toggle]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // the hero title must not paint in its background colour in either theme
    const distinct = await page.locator('h1').evaluate((h1) => {
      const style = getComputedStyle(h1);
      return style.color !== style.backgroundColor;
    });
    expect(distinct).toBe(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('tomorrow is the same water', () => {
  test('/manana carries the band and the coast hooks with no sideways scroll', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/manana');
    await expect(page.locator('[data-dg="sea"]')).toBeAttached();
    await expect(page.locator('[data-dg="coast"]')).toBeAttached();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
