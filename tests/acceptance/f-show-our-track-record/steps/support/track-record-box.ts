// What the track-record box is, and how this slice observes it.
//
// The box is located by the recipes this repository already ships for it:
// `.scorecard` and `.state-empty` in src/styles/recipes.css 61-116, both
// commented to decisions 13 and 19. Selecting on them is not an invented
// contract, it IS requirement R37 (U7: the box uses the shipped tokens and
// recipes). If the box arrives under different classes this locator fails,
// and that is R37 doing its job.
//
// Nothing here names a payload field. `spot_detail`, `BundleSpotDetail` and
// the P5 `scorecard{...}` wire are deliberately absent from this whole lane:
// today the bundle's spot_detail carries `{name}` only and the page reads
// data/published-surface.json, so the producer-to-page wire for this block
// does not exist. Authoring an assertion against a payload field that has no
// producer would be inventing the design. Every oracle below is a
// user-visible observable on the built page instead.

import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The day-one empty state, verbatim from
 * docs/product/architecture/application-architecture.md section 10 line 419,
 * with the block's two integers substituted: n = 0 (no surf report has ever
 * been filed) and threshold = 30 (decision 19).
 */
export const SETTLED_EMPTY_STATE_ES =
  'Todavía no podemos decirte si acertamos aquí. Van 0 reportes de los 30 que hacen falta.';

export const THRESHOLD = 30;

export type DigitCarrier = { readonly ownText: string; readonly fontVariantNumeric: string };

export type BoxObservation = {
  readonly found: boolean;
  readonly text: string;
  readonly digits: readonly string[];
  readonly color: string;
  readonly background: string;
  readonly borderStyle: string;
  readonly dangerColor: string;
  readonly digitCarriers: readonly DigitCarrier[];
  readonly boxScrollWidth: number;
  readonly boxClientWidth: number;
  readonly documentScrollWidth: number;
  readonly viewportWidth: number;
  readonly clippedDescendants: number;
  readonly animatedDescendants: number;
  readonly tomorrowSectionPresent: boolean;
  readonly reportCtaPresent: boolean;
  readonly followsTomorrowSection: boolean;
  readonly precedesReportCta: boolean;
};

/** Reads the box out of a live page. Returns found:false rather than throwing. */
export async function observeBox(page: Page): Promise<BoxObservation> {
  // No named function or const helper bindings inside this callback:
  // tsx/esbuild wraps named bindings with a `__name(...)` call that is not
  // defined once Playwright serialises the closure into the browser context.
  // Everything below is written inline for that reason.
  const raw = await page.evaluate(() => {
    const empty = {
      found: false,
      text: '',
      digits: [] as string[],
      color: '',
      background: '',
      borderStyle: '',
      dangerColor: '',
      digitCarriers: [] as { ownText: string; fontVariantNumeric: string }[],
      boxScrollWidth: 0,
      boxClientWidth: 0,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      clippedDescendants: 0,
      animatedDescendants: 0,
      tomorrowSectionPresent: document.querySelector('section[data-day="tomorrow"]') !== null,
      reportCtaPresent: document.querySelector('a.cta, a[href$="/reportar/"]') !== null,
      followsTomorrowSection: false,
      precedesReportCta: false,
    };

    const box = document.querySelector('.scorecard, .state-empty');
    if (box === null) return empty;

    const boxStyle = window.getComputedStyle(box);

    let background = boxStyle.backgroundColor;
    let walker: Element | null = box;
    while (walker !== null && /^(?:transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/.test(background)) {
      walker = walker.parentElement;
      background = walker === null ? 'rgb(255, 255, 255)' : window.getComputedStyle(walker).backgroundColor;
    }

    const carriers: { ownText: string; fontVariantNumeric: string }[] = [];
    let clipped = 0;
    let animated = 0;
    const subtree: Element[] = [box, ...Array.from(box.querySelectorAll('*'))];
    for (const element of subtree) {
      let own = '';
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === 3) own += node.textContent ?? '';
      }
      const style = window.getComputedStyle(element);
      if (/\d/.test(own)) carriers.push({ ownText: own.replace(/\s+/g, ' ').trim(), fontVariantNumeric: style.fontVariantNumeric });
      if (style.textOverflow === 'ellipsis' && style.overflow !== 'visible') clipped += 1;
      if (style.animationName !== 'none' || Number.parseFloat(style.transitionDuration) > 0) animated += 1;
    }

    const tomorrow = document.querySelector('section[data-day="tomorrow"]');
    const cta = document.querySelector('a.cta, a[href$="/reportar/"]');

    return {
      found: true,
      text: (box.textContent ?? '').replace(/\s+/g, ' ').trim(),
      digits: ((box.textContent ?? '').match(/\d+/g) ?? []) as string[],
      color: boxStyle.color,
      background,
      borderStyle: boxStyle.borderStyle,
      dangerColor: window.getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(),
      digitCarriers: carriers,
      boxScrollWidth: box.scrollWidth,
      boxClientWidth: box.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      clippedDescendants: clipped,
      animatedDescendants: animated,
      tomorrowSectionPresent: tomorrow !== null,
      reportCtaPresent: cta !== null,
      // 2 = DOCUMENT_POSITION_PRECEDING, 4 = DOCUMENT_POSITION_FOLLOWING,
      // spelled numerically so the callback carries no global lookups that
      // could differ between the serialised closure and the page context.
      followsTomorrowSection: tomorrow !== null && (box.compareDocumentPosition(tomorrow) & 2) !== 0,
      precedesReportCta: cta !== null && (box.compareDocumentPosition(cta) & 4) !== 0,
    };
  });
  return raw as BoxObservation;
}

/** Relative luminance per WCAG 2.x, from a computed "rgb(r, g, b)" string. */
function luminance(rgb: string): number {
  const parts = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const channels = parts.map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The settled sentence as it must appear in served bytes: whitespace in HTML
 * source is free, the words are not.
 */
export function containsSettledSentence(html: string): boolean {
  return normalise(stripTags(html)).includes(SETTLED_EMPTY_STATE_ES);
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function readDocument(path: string): string {
  return readFileSync(path, 'utf8');
}
