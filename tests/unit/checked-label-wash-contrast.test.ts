// The clock-refusal screen state (report capture with answers picked and the
// refusal notice shown) measured 2.37:1 in tonight's acceptance triage. The
// notice itself is innocent: it inherits --ink on --bg (14.90:1 day, 15.56:1
// dark). The 2.37 belongs to the CHECKED radio labels. Their selected wash is
// a translucent tint (--go-tint), and every getComputedStyle-based contrast
// reader in this repo -- the acceptance harness's inspect() walk included --
// parses "rgba(10, 106, 45, 0.08)" with /^rgba?\((\d+),\s*(\d+),\s*(\d+)/,
// which drops the alpha and treats the wash as SOLID --go. --ink on --go is
// exactly 2.37:1 day and ~1.86:1 dark.
//
// The mandate is AA on the real background, and the real (composited)
// backdrop passes today -- but a declared color that every measuring tool
// reads as a 2.37:1 surface is a wash that cannot be audited. The fix keeps
// the rendered pixels (the tint precomposited over --bg, same arithmetic the
// browser runs) while making the declaration opaque, so measured contrast
// equals real contrast.
//
// Two floors, per theme:
//   1. DECLARED: the wash's rgb triplet read the way the harness reads it
//      (alpha dropped) must clear 4.5:1 against --ink. RED on the pre-fix
//      tint, GREEN once the declaration is opaque.
//   2. REAL: the wash composited over --bg (identity when already opaque)
//      must clear 4.5:1 against --ink, so floor 1 can never be satisfied by
//      an opaque color that actually reads badly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';

type Rgb = readonly [number, number, number];
type Theme = 'day' | 'dark';

const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const componentsCss = readFileSync(join(process.cwd(), 'src/styles/components.css'), 'utf8');

const themeBlock: Record<Theme, string> = (() => {
  const darkStart = tokensCss.indexOf(':root[data-theme="dark"]');
  assert.ok(darkStart > 0, 'tokens.css lost its dark theme block');
  return { day: tokensCss.slice(0, darkStart), dark: tokensCss.slice(darkStart) };
})();

function declaredValue(theme: Theme, token: string): string {
  const value = themeBlock[theme].match(new RegExp(`${token}\\s*:\\s*([^;]+);`))?.[1];
  assert.ok(value, `tokens.css declares no ${token} in the ${theme} theme`);
  return value.trim();
}

/** A color as its channels plus the alpha the declaration actually carries. */
function parseColor(value: string): { rgb: Rgb; alpha: number } {
  const raw = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (raw !== undefined) {
    return {
      rgb: [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)],
      alpha: 1,
    };
  }
  const fn = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  assert.ok(fn, `unparseable color declaration: ${value}`);
  return { rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])], alpha: fn[4] === undefined ? 1 : Number(fn[4]) };
}

/** Source-over composite, the arithmetic the browser runs painting the wash on --bg. */
function composite(over: { rgb: Rgb; alpha: number }, under: Rgb): Rgb {
  const blend = (i: 0 | 1 | 2): number => Math.round(over.alpha * over.rgb[i] + (1 - over.alpha) * under[i]);
  return [blend(0), blend(1), blend(2)];
}

/** Relative luminance per WCAG 2.x. */
function luminance(rgb: Rgb): number {
  const channel = (part: number): number => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = luminance(a) >= luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('checked radio label wash (--go-tint) stays readable as declared', () => {
  it('is the color the checked-label rule actually paints', () => {
    const rule = componentsCss.match(/label:has\(input:checked\)\s*{[^}]*}/);
    assert.ok(rule, 'components.css lost the checked-label rule');
    assert.match(rule[0], /background:\s*var\(--go-tint\)/, 'the checked-label wash no longer comes from --go-tint; retarget this test at whatever paints it');
  });

  for (const theme of ['day', 'dark'] as const) {
    it(`${theme}: the DECLARED wash clears WCAG AA against --ink, read alpha-blind like every computed-style checker`, () => {
      const wash = parseColor(declaredValue(theme, '--go-tint'));
      const ink = parseColor(declaredValue(theme, '--ink'));
      const ratio = contrast(ink.rgb, wash.rgb);
      assert.ok(
        ratio >= 4.5,
        `--ink on the declared --go-tint triplet reads ${ratio.toFixed(2)}:1 (< 4.5:1) in the ${theme} theme; declare the wash as its opaque composite over --bg so measured contrast equals real contrast`,
      );
    });

    it(`${theme}: the REAL composited wash over --bg clears WCAG AA against --ink`, () => {
      const wash = parseColor(declaredValue(theme, '--go-tint'));
      const ink = parseColor(declaredValue(theme, '--ink'));
      const bg = parseColor(declaredValue(theme, '--bg'));
      const ratio = contrast(ink.rgb, composite(wash, bg.rgb));
      assert.ok(
        ratio >= 4.5,
        `--ink on the rendered checked-label backdrop reads ${ratio.toFixed(2)}:1 (< 4.5:1) in the ${theme} theme`,
      );
    });
  }
});
