// @walking_skeleton
// covers: R1, R7, R38, R39, R40, R41, R43, R46, R47, R48, R49
// The sole browser E2E for this feature. It exercises the published reading
// surface, not a mock component or a forecast JSON request.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const selectedDawnPublishedAt = '2026-08-07T11:22:00Z';

async function auditReadingSurface(page: Page, requiresPrimaryAction: boolean): Promise<void> {
  const ui = await page.evaluate(() => {
    type Rgb = [number, number, number];

    const parse = (value: string): Rgb | null => {
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (match?.[1] === undefined) return null;
      const values = match[1]
        .split(',')
        .slice(0, 3)
        .map((part) => Number(part.trim()));
      if (values.length !== 3 || !values.every(Number.isFinite)) return null;
      return [values[0]!, values[1]!, values[2]!];
    };
    const luminance = ([r, g, b]: Rgb): number => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (foreground: Rgb, background: Rgb): number => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const backgrounds = (element: Element): Rgb[] => {
      for (let current: Element | null = element; current !== null; current = current.parentElement) {
        const style = getComputedStyle(current);
        const gradient = [...style.backgroundImage.matchAll(/rgba?\([^)]+\)/gi)]
          .map((match) => parse(match[0]))
          .filter((color): color is Rgb => color !== null);
        if (gradient.length > 0) return gradient;
        const color = parse(style.backgroundColor);
        if (color !== null && style.backgroundColor !== 'rgba(0, 0, 0, 0)') return [color];
      }
      return [[255, 255, 255]];
    };
    const contrastFailures = [...document.querySelectorAll('body, h1, h2, p, a, button, label, legend, strong, summary')]
      .filter((element) => element.textContent?.trim() && (element as HTMLElement).offsetParent !== null)
      .flatMap((element) => {
        const foreground = parse(getComputedStyle(element).color);
        if (foreground === null) return [`could not parse text colour for <${element.tagName.toLowerCase()}>`];
        const threshold = element === document.body ? 7 : 4.5;
        return backgrounds(element)
          .filter((background) => contrast(foreground, background) < threshold)
          .map((background) => `<${element.tagName.toLowerCase()}> contrast ${contrast(foreground, background).toFixed(2)}:1 below ${threshold}:1 against rgb(${background.join(', ')})`);
      });
    const tooSmallTargets = [...document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, summary')]
      .filter((element) => element.offsetParent !== null)
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44
          ? [`<${element.tagName.toLowerCase()}> ${Math.round(rect.width)}x${Math.round(rect.height)}px: ${element.textContent?.trim() ?? ''}`]
          : [];
      });
    const primaryTargets = [...document.querySelectorAll<HTMLElement>('[data-primary-action]')]
      .filter((element) => element.offsetParent !== null);
    const primaryOutsideThumbZone = primaryTargets
      .filter((element) => element.getBoundingClientRect().top < window.innerHeight * 0.45)
      .map((element) => element.textContent?.trim() ?? '<unnamed>');
    return {
      contrastFailures,
      tooSmallTargets,
      primaryTargetCount: primaryTargets.length,
      primaryOutsideThumbZone,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect.soft(ui.contrastFailures, 'every visible text colour must meet 4.5:1 against its actual backdrop, and body text must meet 7:1').toEqual([]);
  expect.soft(ui.scrollWidth, 'the 390px reading surface must not horizontally overflow').toBeLessThanOrEqual(ui.clientWidth);
  expect.soft(ui.tooSmallTargets, 'every visible interactive target must be at least 44px in both dimensions').toEqual([]);
  if (requiresPrimaryAction) {
    expect.soft(ui.primaryTargetCount, 'the phone reading home must identify one primary action').toBeGreaterThan(0);
    expect.soft(ui.primaryOutsideThumbZone, 'the primary action must sit in the lower phone thumb zone').toEqual([]);
  }
}

test('a surfer can read a real Spanish call and yesterday remains a separate public receipt', async ({ page }) => {
  const requestedUrls: string[] = [];
  page.on('request', (request) => requestedUrls.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  await expect.soft(page.getByRole('link', { name: 'Playa Venao' })).toBeVisible({ timeout: 1_000 });
  await expect.soft(page.locator('ol.ranked li').first().locator('strong')).toHaveText(/^(?:[1-9][0-9]?|100)$/, { timeout: 1_000 });
  await expect.soft(page.locator('ol.ranked li').first().locator('p')).not.toHaveText(/placeholder/i, { timeout: 1_000 });
  await expect.soft(page.locator('body')).not.toContainText(/placeholder/i, { timeout: 1_000 });
  await expect.soft(page.locator('body')).not.toContainText('Updated', { timeout: 1_000 });
  await expect.soft(page.locator('a[href^="/en/"]'), 'this Spanish-only feature must not ship an English route').toHaveCount(0, { timeout: 1_000 });
  const englishCandidates = [
    'en',
    'en/tomorrow',
    'en/spots/playa-venao',
    'en/spots/playa-venao/report',
    'en/spots/playa-venao/reported',
  ];
  expect.soft(
    englishCandidates.filter((route) => existsSync(join(process.cwd(), 'dist', route))),
    'the generated candidate must not contain an English route or English route tree in slice-01',
  ).toEqual([]);
  await auditReadingSurface(page, true);

  await page.goto('/spots/playa-venao/ayer');
  await expect.soft(page).toHaveURL(/\/spots\/playa-venao\/ayer\/?$/);
  await expect.soft(page.getByRole('heading', { name: 'Playa Venao' })).toBeVisible({ timeout: 1_000 });
  await expect.soft(page.locator('body')).not.toContainText(/placeholder/i, { timeout: 1_000 });
  await expect.soft(page.locator('body')).not.toContainText('Updated', { timeout: 1_000 });
  await expect.soft(
    page.locator('[role="progressbar"], [data-reading-state="loading"], .spinner, .skeleton'),
    'a publish-time reading route must not show a spinner, skeleton, or synthetic loading state',
  ).toHaveCount(0, { timeout: 1_000 });
  await expect.soft(page.locator('body')).not.toContainText(/cargando|carga\.\.\./i, { timeout: 1_000 });
  await expect.soft(
    page.locator('time[datetime]').filter({ hasText: /\d/ }),
    'the yesterday receipt must expose its own exact publish time in HTML, even with JavaScript off',
  ).toHaveCount(1, { timeout: 1_000 });
  await expect.soft(page.locator('time[datetime]')).toHaveAttribute('datetime', selectedDawnPublishedAt, { timeout: 1_000 });
  await expect.soft(page.locator('time[datetime]')).toContainText('6:22 a.m.', { timeout: 1_000 });
  await auditReadingSurface(page, false);

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const route of ['/', '/spots/playa-venao/ayer']) {
      await page.goto(route);
      await auditReadingSurface(page, route === '/');
    }
  }

  expect.soft(requestedUrls, 'the reading page must not fetch forecast JSON in the browser').not.toContainEqual(expect.stringMatching(/predictions\/|\.json(?:$|\?)/i));

  const rawPrediction = await page.goto('/predictions/v1/dt=2026-08-08/src=ncep_gfswave016/cyc=06Z/all.jsonl.gz');
  expect(
    rawPrediction?.headers()['content-type'] ?? '',
    'raw prediction snapshots must never be served as JSON, gzip, or a generic binary payload',
  ).not.toMatch(/json|gzip|octet-stream/i);
  await expect(page.locator('body')).not.toContainText('ncep_gfswave016');
});
