#!/usr/bin/env node
//
// check-cold-load.mjs — every address must be able to state its own truth.
//
// WHY THIS EXISTS
// ---------------
// On 2026-08-10 a source-blind examiner found that `/spots/{slug}/reportado/`
// was permanently blank on a cold load. Reload, a fresh tab, a bookmark — all
// showed nothing but a stray link, seconds after a surfer had submitted a
// report. The confirmation text only ever painted via the in-app transition
// from the previous page. The served document carried zero `<script>` tags, so
// it had no way to re-derive anything.
//
// The root cause was a planning gap: no roadmap step owned that route, so
// nobody was ever assigned to make it stand alone. Every automated test passed,
// because every test arrived at the page the way the app does — from the page
// before it.
//
// THE RULE, and why it is checkable statically
// --------------------------------------------
// A document can legitimately be filled by client script. It cannot legitimately
// be filled by a DIFFERENT page's script. So:
//
//   every built document must either carry real text of its own,
//   or ship a script of its own.
//
// A document with neither can only ever be populated by whatever ran before it,
// which means it is blank for anyone who arrives directly. That is the bug, and
// it generalises: any future route with the same shape fails here rather than
// eight steps later in an examiner's session.
//
// This does not prove a scripted page works on cold load — only a browser can
// prove that, and the acceptance suite is where that belongs. It proves the page
// has some means of speaking for itself, which is the part that was missing.
//
// EXIT CODES
//   0  every document can speak for itself, or nothing is built
//   1  at least one address is mute on arrival

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSurface } from './surface-text.mjs';

const repoRoot = process.argv[2] ?? process.cwd();
const distDir = process.argv[3] ?? join(repoRoot, 'dist');

if (!existsSync(distDir)) {
  process.stdout.write('\x1b[33m○ cold load\x1b[0m no dist/ — run the build first\n');
  process.exit(0);
}

// Six words. A real page carries at least a heading and a short sentence; the
// blank confirmation carried two words, both of them a stray link. Set low on
// purpose: this gate should fire only on genuinely mute documents, because a
// gate that argues about thin-but-real pages gets ignored.
const MINIMUM_WORDS = 6;

// A document that intentionally has almost no text and no script — an error page
// that is deliberately terse, say — declares itself here rather than being
// argued about every build.
const DELIBERATELY_TERSE = new Set([
  // none yet; add with a comment saying why, never silently
]);

const surface = readSurface(distDir, repoRoot);
if (surface.length === 0) {
  process.stdout.write('\x1b[33m○ cold load\x1b[0m dist/ has no documents\n');
  process.exit(0);
}

const mute = [];
for (const doc of surface) {
  if (DELIBERATELY_TERSE.has(doc.short)) continue;

  const words = doc.text.split(/\s+/).filter((word) => word !== '').length;
  // Its OWN script: an inline script body, or a module it loads itself. Either
  // gives the document a way to fill itself on arrival.
  const hasOwnScript = /<script\b[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(doc.html)
    || /<script\b[^>]*\bsrc\s*=/i.test(doc.html);

  if (words >= MINIMUM_WORDS || hasOwnScript) continue;

  mute.push({ doc: doc.short, words, text: doc.text.slice(0, 90) });
}

if (mute.length === 0) {
  const scripted = surface.filter((doc) => /<script\b/i.test(doc.html)).length;
  process.stdout.write(
    `\x1b[32m✓ cold load\x1b[0m ${surface.length} document(s) can speak for themselves ` +
    `(${surface.length - scripted} static, ${scripted} carrying their own script)\n`,
  );
  process.exit(0);
}

process.stdout.write(`\x1b[31m✗ cold load\x1b[0m ${mute.length} address(es) are blank for anyone who arrives directly\n\n`);
for (const entry of mute) {
  process.stdout.write(
    `  ${entry.doc}\n` +
    `    ${entry.words} word(s) of text and no script of its own: ${JSON.stringify(entry.text)}\n` +
    `    A reload, a fresh tab or a shared link lands here and shows nothing.\n`,
  );
}
process.stdout.write(
  '\nGive the document real content, or a script of its own that derives what it should say.\n' +
  'A page filled only by the page before it is blank for everybody else.\n',
);
process.exit(1);
