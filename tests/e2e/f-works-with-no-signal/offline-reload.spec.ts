// @wiring_e2e
// The live reload defect escaped the worker's in-memory harness because a
// failed precache prevents browser activation. This is the real boundary:
// new browser storage, built preview, browser-owned Cache Storage and offline
// navigation.

import { expect, test } from '@playwright/test';

test('a first online visit becomes controlled and an offline reload remains on a cached reading or fallback surface', async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(baseURL!, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(async () => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    const precacheKeys = await page.evaluate(async () => {
      const cache = await caches.open('psb-offline-v1');
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    });
    expect(precacheKeys).toContain('/sin-senal/');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: /^(?:¿Dónde se surfea hoy\?|Sin señal\.)$/u }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
