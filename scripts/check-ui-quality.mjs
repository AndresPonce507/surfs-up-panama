#!/usr/bin/env node
// covers: R42, R44, R45
// UI quality gate. Blocks a merge when a user-visible surface misses the bar.
//
// WHY THIS IS CI AND NOT A REVIEW NOTE
// ------------------------------------
// "Make it look good" as guidance gets deprioritised under deadline, every
// time. The mandates it enforces are nWave's nw-ui-quality-mandates U1-U7.
// U8 (does it look finished) is deliberately absent: taste cannot be asserted,
// and a test that tries passes happily on ugly work. U8 belongs to the human
// examiner.
//
// ARMED ONLY WHEN THERE IS A SURFACE. A repo with no built HTML is not
// failed, it is skipped loudly. A gate that fails backend-only repos gets
// disabled, and a disabled gate protects nothing.
//
// ADAPT: DIST and MIN_WIDTH per repo. Everything else is stack-agnostic.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = process.env.UI_DIST ?? 'dist';
const MIN_WIDTH = 390; // narrowest supported viewport, phone-first

const findings = [];
const note = (mandate, file, msg) => findings.push({ mandate, file, msg });

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(DIST);
const html = files.filter((f) => extname(f) === '.html');
const css = files.filter((f) => extname(f) === '.css');
const shippedSourceStyles = [
  'src/styles/base.css',
  'src/styles/components.css',
].filter((f) => existsSync(f));

if (html.length === 0) {
  console.log(`ui-quality: SKIPPED, no built HTML under ${DIST}/`);
  console.log('  Not a failure. This repo has no user-visible surface to gate,');
  console.log('  or the build has not run. Build first if that is unexpected.');
  process.exit(0);
}

// Every stylesheet plus every inline <style>, since critical CSS is usually inlined.
const styleText = [
  ...css.map((f) => readFileSync(f, 'utf8')),
  ...html.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
  ),
].join('\n');

// ── U4: motion is opt-out ────────────────────────────────────────────
// Any animation or transition at all obliges a reduced-motion branch.
// Checked as presence, not per-rule: one honest branch covering the sheet
// is the normal shape, and per-rule matching produces false positives that
// teach people to ignore the gate.
const animates = /(?:^|[^-])animation\s*:|(?:^|[^-])transition\s*:|@keyframes/.test(styleText);
const hasReducedMotion = /prefers-reduced-motion/.test(styleText);
if (animates && !hasReducedMotion) {
  note('U4', '(stylesheets)', 'animation or transition present with no prefers-reduced-motion branch');
}

// ── U2: no fixed widths that can overflow the narrowest viewport ─────
for (const m of styleText.matchAll(/(?:^|[^-\w])width\s*:\s*(\d{3,4})px/gi)) {
  const px = Number(m[1]);
  if (px > MIN_WIDTH) {
    note('U2', '(stylesheets)', `fixed width: ${px}px exceeds the ${MIN_WIDTH}px minimum viewport`);
    break; // one finding is enough to fail; listing every instance is noise
  }
}

// ── U2: the viewport meta has to exist and must not block zoom ───────
for (const f of html) {
  const doc = readFileSync(f, 'utf8');
  const vp = doc.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
  if (!vp) {
    note('U2', f, 'no viewport meta tag');
  } else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![\d.])/i.test(vp[0])) {
    note('U2', f, 'viewport blocks zoom, which fails WCAG and hurts anyone with poor eyesight');
  }
}

// ── U7: tokens, not scattered raw values ─────────────────────────────
// Raw hex outside a token declaration means colour lives in components,
// which is how a palette silently drifts. Custom-property DEFINITIONS are
// the legitimate home, so they do not count.
// Two traps here, both found by running this against a real design system:
//
//  1. Critical CSS is inlined into EVERY page, so a single finding counts once
//     per document. Dedupe the source text first, and count DISTINCT colours,
//     because "how many colours live outside the token system" is the real
//     question, not "how many times did they appear".
//  2. A hex inside a token's VALUE still belongs to the token, including when
//     it is nested in a function: `--hero-grad: linear-gradient(0deg,#a,#b)`
//     is a definition, not drift. Matching only `--token:#fff` flags a
//     correct design system, and a gate that fires on correct work gets
//     ignored, which is worse than not having it.
const uniqueStyleBlocks = [...new Set(
  [
    ...css.map((f) => readFileSync(f, 'utf8')),
    ...html.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    ),
  ].map((s) => s.trim()),
)].join('\n');

// Strip every custom-property declaration, then anything left holding a hex is
// a colour used directly in a rule.
const outsideTokens = uniqueStyleBlocks.replace(/--[\w-]+\s*:[^;}]*/g, '');
const rawHex = new Set(
  [...outsideTokens.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()),
);
if (rawHex.size > 4) {
  note('U7', '(stylesheets)',
    `${rawHex.size} distinct colours used outside the token system: ${[...rawHex].slice(0, 6).join(' ')}`);
}

// ── U6: type values come from the declared scale ─────────────────────
// Shipped component and base styles may choose a token, never a one-off
// size. Tokens themselves remain the one deliberate place where values live.
for (const f of shippedSourceStyles) {
  const source = readFileSync(f, 'utf8');
  const rawType = [...source.matchAll(/font-size\s*:\s*([^;]+);/gi)]
    .filter((match) => {
      const value = match[1]?.trim().toLowerCase();
      return value !== undefined && !value.startsWith('var(') && value !== 'inherit';
    })
    .map((match) => match[0].trim());
  if (rawType.length > 0) {
    note('U6', f, `raw type value outside the token scale: ${rawType[0]}`);
  }
}

// ── report ───────────────────────────────────────────────────────────
console.log(`ui-quality: ${html.length} documents, ${css.length} stylesheets`);
console.log('');

if (findings.length === 0) {
  console.log('  U2 viewport and width  ok');
  console.log(`  U4 reduced motion      ${animates ? 'ok' : 'n/a, nothing animates'}`);
  console.log('  U6 type scale          ok');
  console.log('  U7 tokens              ok');
  console.log('');
  console.log('Passed. Note U1 (contrast) and U3 (touch targets) need rendered');
  console.log('geometry and belong in the browser suite, and U8 (does it look');
  console.log('finished) is the examiner\'s judgement, not a test.');
  process.exit(0);
}

for (const f of findings) {
  console.log(`  FAIL ${f.mandate}  ${f.file}`);
  console.log(`       ${f.msg}`);
}
console.log('');
console.log(`${findings.length} UI mandate violation(s). Mandates: nw-ui-quality-mandates U1-U8.`);
process.exit(1);
