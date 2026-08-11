// Slice-04 / step 04-02. This feature owns this audit rather than reaching
// into daily-call-with-permanent-receipts' walking skeleton. The walker is
// intentionally the same palette-agnostic, rendered-DOM proof: it asks the
// browser what it paints instead of maintaining a list of colour pairs.

import { expect, test, type Page } from '@playwright/test';

type RouteUnderAudit = {
  name: string;
  path: string;
  requiresPrimaryAction?: boolean;
};

const routesUnderAudit: readonly RouteUnderAudit[] = [
  { name: 'portada de hoy', path: '/', requiresPrimaryAction: true },
  { name: 'lista de mañana', path: '/manana/' },
  { name: 'lectura de un spot', path: '/spots/playa-venao/' },
  { name: 'recibo de ayer', path: '/spots/playa-venao/ayer/' },
  { name: 'primera pantalla de reporte', path: '/spots/playa-venao/reportar/' },
  { name: 'segunda pantalla de reporte', path: '/spots/playa-venao/reportado/' },
  { name: 'dirección que no existe', path: '/404' },
];

async function auditReadingSurface(page: Page, route: RouteUnderAudit): Promise<void> {
  const ui = await page.evaluate(() => {
    type Rgb = [number, number, number];

    const parse = (value: string): Rgb | null => {
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (match?.[1] === undefined) return null;
      const values = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
      if (values.length !== 3 || !values.every(Number.isFinite)) return null;
      return [values[0]!, values[1]!, values[2]!];
    };
    const luminance = ([r, g, b]: Rgb): number => {
      const channel = (value: number): number => {
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
    const paintsOwnText = (element: Element): boolean => [...element.childNodes]
      .some((node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()));
    const contrastFailures = [...document.querySelectorAll('body, h1, h2, p, a, button, label, legend, strong, summary')]
      .filter((element) => (element === document.body || paintsOwnText(element)) && (element as HTMLElement).offsetParent !== null)
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
    const moving = [...document.querySelectorAll('*')]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.animationName !== 'none' || style.transitionDuration !== '0s';
      })
      .map((element) => element.tagName.toLowerCase());
    return {
      contrastFailures,
      tooSmallTargets,
      primaryTargetCount: primaryTargets.length,
      primaryOutsideThumbZone,
      moving,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  expect.soft(ui.contrastFailures, `${route.name}: every visible text colour must meet its real rendered backdrop`).toEqual([]);
  expect.soft(ui.scrollWidth, `${route.name}: the 390px reading surface must not horizontally overflow`).toBeLessThanOrEqual(ui.clientWidth);
  expect.soft(ui.tooSmallTargets, `${route.name}: every visible interactive target must be at least 44px in both dimensions`).toEqual([]);
  expect.soft(ui.moving, `${route.name}: reduced motion must remove animation and transition`).toEqual([]);
  if (route.requiresPrimaryAction) {
    expect.soft(ui.primaryTargetCount, `${route.name}: the phone reading home must identify one primary action`).toBeGreaterThan(0);
    expect.soft(ui.primaryOutsideThumbZone, `${route.name}: the primary action must sit in the lower phone thumb zone`).toEqual([]);
  }
}

test('a surfer can read and tap every feature-owned route in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const route of routesUnderAudit) {
      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response, `${route.name}: the published route must answer`).not.toBeNull();
      await expect(page.locator('body'), `${route.name}: the reading surface must arrive ready`).toBeVisible();
      await auditReadingSurface(page, route);
    }
  }
});
