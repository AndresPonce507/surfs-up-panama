// surface-text.mjs — walk built documents and extract what a person actually reads.
//
// Written once, on purpose. Three separate gates need the same primitive, and
// three copies of "strip the markup and see what is left" would drift apart and
// disagree about what counts as visible.
//
// The hard part is not stripping tags. It is being honest about what a reader
// sees versus what the document contains. A `datetime` attribute on `<time>` is
// machine-readable metadata and is NOT read aloud to anyone; the text inside
// that element is. A `<script>` body is not visible. An `aria-label` IS
// announced to a screen reader and therefore counts as surface. Getting these
// distinctions wrong in either direction makes a gate that cries wolf or one
// that sleeps.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/** Every built HTML document under a dist directory. */
export function builtDocuments(distDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extname(entry.name) === '.html') out.push(full);
    }
  };
  if (existsSync(distDir) && statSync(distDir).isDirectory()) walk(distDir);
  return out.sort();
}

const DROPPED_ELEMENTS = /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * The text a person reads, plus the text a screen reader announces.
 *
 * Deliberately keeps aria-label and alt: those are surface, even though they are
 * attributes. Deliberately drops datetime, content, href, class and every other
 * attribute: those are machine plumbing and a reader never meets them.
 */
export function visibleText(html) {
  let text = html.replace(DROPPED_ELEMENTS, ' ');

  const announced = [];
  for (const match of text.matchAll(/\b(?:aria-label|alt|title)\s*=\s*"([^"]*)"/gi)) {
    if (match[1].trim() !== '') announced.push(match[1]);
  }

  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

  return `${text} ${announced.join(' ')}`.replace(/\s+/g, ' ').trim();
}

/**
 * Which locale tree a document belongs to, read from the document's own lang
 * attribute rather than guessed from its path. A route can move; the declared
 * language is what the browser and the screen reader actually use.
 */
export function declaredLanguage(html) {
  const match = /<html\b[^>]*\blang\s*=\s*"([^"]+)"/i.exec(html);
  return match === null ? null : match[1].toLowerCase().split('-')[0];
}

/** Read every built document once, with its text and language already resolved. */
export function readSurface(distDir, repoRoot = distDir) {
  return builtDocuments(distDir).map((path) => {
    const html = readFileSync(path, 'utf8');
    return {
      path,
      short: relative(repoRoot, path),
      html,
      text: visibleText(html),
      lang: declaredLanguage(html),
    };
  });
}
