#!/usr/bin/env node
//
// check-copy-surface.mjs — refuse machine text on a human surface.
//
// WHY THIS EXISTS
// ---------------
// On 2026-08-10 a source-blind examiner found `Actualizado 2026-08-10T12:05:00.000Z`
// rendered on the home page and all twenty spot pages. All ten CI jobs were
// green. The same examiner then found a page that said "this is the last thing
// we saw" and never said when. Both are the same defect: the machine's internal
// state leaking onto a surface a person reads, or the machine withholding what a
// person needs while sounding certain.
//
// Copy is the least-tested surface in most products because it has no obvious
// oracle. It does have one: there are strings a person would never write. This
// checks for those.
//
// WHAT IT REFUSES, and why each is not a style preference
//   ISO-8601 timestamps   a person says "7:05 a.m.", never "2026-08-10T12:05:00Z"
//   em dashes             a house rule, and a reliable tell of machine-written copy
//   placeholder tokens    {name}, %s, ${...}, TODO, lorem — a template that never filled
//   engine tokens         snake_case and SCREAMING_CASE identifiers reaching the page
//   raw JSON or objects   {"key": — a serialised structure shown to a reader
//   English on a non-English surface, checked against a list of words that do
//     not appear in the target language and cannot be a proper noun
//
// It reads the document's own `lang` attribute rather than guessing from the
// path, so a route can move without the gate lying.
//
// EXIT CODES
//   0  clean, or nothing built to check
//   1  machine text found on a human surface

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSurface } from './surface-text.mjs';

const repoRoot = process.argv[2] ?? process.cwd();
const distDir = process.argv[3] ?? join(repoRoot, 'dist');

if (!existsSync(distDir)) {
  process.stdout.write('\x1b[33m○ copy surface\x1b[0m no dist/ — run the build first\n');
  process.exit(0);
}

// English words chosen to be unambiguous: none is a Spanish word, a proper noun,
// or a brand. Deliberately small — a false positive here trains people to ignore
// the gate, which is worse than a miss.
const ENGLISH_TELLS = [
  'updated', 'loading', 'error', 'settings', 'submit', 'cancel', 'search',
  'yesterday', 'tomorrow', 'today', 'morning', 'evening', 'wind', 'wave',
  'height', 'confidence', 'forecast', 'report', 'save', 'saved', 'send',
];

const RULES = [
  {
    id: 'iso-timestamp',
    why: 'a person says "7:05 a.m.", never a machine timestamp',
    find: (text) => text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g),
  },
  {
    id: 'em-dash',
    why: 'house rule: no em dashes in any UI string, and a reliable tell of machine-written copy',
    find: (text) => text.match(/—/g),
  },
  {
    id: 'placeholder',
    why: 'a template that never got filled in',
    find: (text) => text.match(/\{\{?\s*[A-Za-z_][\w.]*\s*\}?\}|\$\{[^}]*\}|%[sd]\b|\bTODO\b|\bFIXME\b|\blorem ipsum\b/gi),
  },
  {
    id: 'engine-token',
    why: 'an internal identifier reached the page',
    find: (text) => {
      const hits = (text.match(/\b[a-z]+(?:_[a-z0-9]+){1,}\b|\b[A-Z]{2,}(?:_[A-Z0-9]+){1,}\b/g) ?? [])
        // A file name a person may legitimately read is not an engine token.
        .filter((token) => !/\.(png|jpg|svg|pdf|csv)$/i.test(token));
      return hits.length === 0 ? null : hits;
    },
  },
  {
    id: 'raw-structure',
    why: 'a serialised object or array shown to a reader',
    find: (text) => text.match(/\{\s*"[^"]+"\s*:/g),
  },
];

const findings = [];
const surface = readSurface(distDir, repoRoot);

for (const doc of surface) {
  for (const rule of RULES) {
    const hits = rule.find(doc.text);
    if (hits === null || hits.length === 0) continue;
    findings.push({ doc: doc.short, rule: rule.id, why: rule.why, sample: [...new Set(hits)].slice(0, 3) });
  }

  // English on a surface that declares itself another language. Word-boundary
  // matched and case-insensitive, against the small unambiguous list above.
  if (doc.lang !== null && doc.lang !== 'en') {
    const found = ENGLISH_TELLS.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(doc.text));
    if (found.length > 0) {
      findings.push({
        doc: doc.short,
        rule: `english-on-${doc.lang}`,
        why: `the document declares lang="${doc.lang}" and the surface carries English`,
        sample: found.slice(0, 5),
      });
    }
  }
}

if (surface.length === 0) {
  process.stdout.write('\x1b[33m○ copy surface\x1b[0m dist/ has no documents\n');
  process.exit(0);
}

if (findings.length === 0) {
  process.stdout.write(`\x1b[32m✓ copy surface\x1b[0m ${surface.length} document(s), no machine text on a human surface\n`);
  process.exit(0);
}

process.stdout.write(`\x1b[31m✗ copy surface\x1b[0m machine text is reaching people, in ${new Set(findings.map((f) => f.doc)).size} document(s)\n\n`);
for (const finding of findings) {
  process.stdout.write(`  ${finding.doc}\n    ${finding.rule}: ${finding.sample.map((s) => JSON.stringify(s)).join(', ')}\n    ${finding.why}\n`);
}
process.stdout.write('\nCopy never runs ahead of the data, and a machine never speaks in its own voice to a person.\n');
process.exit(1);
