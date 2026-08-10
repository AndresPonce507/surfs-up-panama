// f-read-it-in-your-language acceptance steps.
//
// Authored at DISTILL open (2026-08-10). READ-01 steps are REAL drivers over
// the emitted `dist/` tree (the visitor's actual reading surface): today they
// fail at their behaviour oracles because no English tree and no toggle is
// emitted — genuine RED (MISSING_FUNCTIONALITY), recorded in
// docs/feature/f-read-it-in-your-language/distill/red-classification.md.
//
// Steps for READ-02 through READ-08 are scaffolded `pending`, the unskip
// contract of ADR-025: each slice's DELIVER entry replaces its pending
// bodies with real drivers (the three checks drive contained seeded
// fixtures, the f-bill shape) and must observe MISSING_FUNCTIONALITY before
// GREEN. DELIVER is not allowed to edit the .feature files.
//
// Copy discipline: no step body pins an English string that Pre-requisite 1
// has not settled. Unsettled copy is asserted by property (present, English,
// never bracketed, never Spanish).

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

interface ReadWorld {
  currentPath?: string;
  englishDocs?: string[];
  allDocs?: string[];
  pageWeight?: { status: number | null; out: string };
  yesterdayRoutes?: { es: string; en: string };
}

const DIST = resolve(process.cwd(), 'dist');

// --- helpers over the emitted tree -----------------------------------------

function walkHtml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walkHtml(path));
    else if (entry.endsWith('.html')) out.push(path);
  }
  return out;
}

function urlOf(file: string): string {
  let rel = file.slice(DIST.length).split(sep).join('/');
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'index.html'.length);
  else if (rel.endsWith('.html')) rel = `${rel.slice(0, -'.html'.length)}/`;
  return rel === '' || rel === '/' ? '/' : rel;
}

function resolveDoc(urlPath: string): string | undefined {
  if (urlPath === '/') {
    const home = join(DIST, 'index.html');
    return existsSync(home) ? home : undefined;
  }
  const clean = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const candidates = [join(DIST, clean, 'index.html'), join(DIST, `${clean}.html`)];
  return candidates.find((candidate) => existsSync(candidate));
}

function readDoc(urlPath: string, why: string): string {
  const doc = resolveDoc(urlPath);
  assert.ok(
    doc,
    `WHAT: no page is emitted at ${urlPath}. WHY: ${why}. HOW: the build must emit this page; run npm run build and check the route's builder.`,
  );
  return readFileSync(doc, 'utf8');
}

function anchorsOf(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*?href="([^"]+)"/g)].map((m) => m[1]!);
}

function internalAnchors(html: string): string[] {
  return anchorsOf(html)
    .filter((href) => href.startsWith('/'))
    .map((href) => {
      const bare = href.split('#')[0]!.split('?')[0]!;
      return bare.endsWith('/') ? bare : `${bare}/`;
    });
}

function strippedText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

const SEG_ES_TO_EN: Readonly<Record<string, string>> = {
  manana: 'tomorrow',
  ayer: 'yesterday',
  reportar: 'report',
  reportado: 'reported',
  'sin-senal': 'offline',
  acerca: 'about',
};
const SEG_EN_TO_ES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SEG_ES_TO_EN).map(([es, en]) => [en, es]),
);

function twinOf(urlPath: string): string {
  if (urlPath === '/') return '/en/';
  if (urlPath === '/en/') return '/';
  const segments = urlPath.split('/').filter(Boolean);
  if (segments[0] === 'en') {
    const mapped = segments.slice(1).map((s) => SEG_EN_TO_ES[s] ?? s);
    return `/${mapped.join('/')}/`;
  }
  const mapped = segments.map((s) => SEG_ES_TO_EN[s] ?? s);
  return `/en/${mapped.join('/')}/`;
}

function langOf(html: string): string | undefined {
  return /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1];
}

function spotSlugsInOrder(html: string, prefix: string): string[] {
  const pattern = new RegExp(`^${prefix.replace(/\//g, '\\/')}([^/]+)\\/$`);
  const slugs: string[] = [];
  for (const href of internalAnchors(html)) {
    const match = pattern.exec(href);
    if (match) slugs.push(match[1]!);
  }
  return slugs;
}

const SPANISH_DIACRITICS = /[áéíóúñ¿¡]/i;
// Guard vocabulary drawn from the feature-delta Translation inventory (§B/§C
// day-one offenders), diacritic-free words included so known Spanish surface
// copy cannot slip through. Deliberately excludes language-neutral proper
// nouns (spot names like "Playa Venao" are legitimate on English pages) and
// words that are also English ("normal", "sin"). This is the acceptance-layer
// heuristic; the STRUCTURAL detector is READ-02's coverage check.
const SPANISH_SURFACE_WORDS =
  /\b(limpio|picado|destrozado|viento|mejor|condiciones|ventana|puntos|llamado|confianza|volver|lista|existe|encontramos|publicadas|publicado|estuvo|datos|malo|bueno|grande)\b/i;

function englishDocsOrFail(): string[] {
  const docs = walkHtml(join(DIST, 'en'));
  assert.ok(
    docs.length > 0,
    'WHAT: the built site emits no English page at all. WHY: the English tree is the feature; with zero /en/ pages every English observable is vacuously untestable. HOW: READ-01 recreates /en/ and /en/tomorrow/ with real translation.',
  );
  return docs;
}

function pendingUntil(slice: string): () => string {
  return function pendingScaffold(): string {
    void slice; // unskipped at this slice's DELIVER entry (ADR-025 scaffold)
    return 'pending';
  };
}

// --- shared background ------------------------------------------------------

Given('the day\'s call is published and the site is built', function () {
  assert.ok(
    existsSync(join(DIST, 'index.html')),
    'WHAT: no built site found at dist/. WHY: these scenarios drive the visitor\'s real reading surface, the emitted tree. HOW: run npm run build first.',
  );
});

// --- READ-01: real drivers over the emitted tree ---------------------------

When(
  'the visitor on the Spanish home taps the language toggle at the top of the page',
  function (this: ReadWorld) {
    const home = readDoc('/', 'the Spanish home is the entry point of the journey');
    const toggle = internalAnchors(home).find((href) => href === '/en/');
    assert.ok(
      toggle,
      'WHAT: the Spanish home carries no language toggle. WHY: section 4 requires the toggle as a plain link to the twin address at the top of every page; Base.astro currently drops altPath and renders no toggle. HOW: render the toggle link to /en/ on the home.',
    );
    this.currentPath = '/en/';
  },
);

Then('the visitor is reading the English home', function (this: ReadWorld) {
  const html = readDoc('/en/', 'the English home is the twin the toggle promises');
  assert.equal(
    langOf(html),
    'en',
    'WHAT: the English home does not declare English. WHY: the page must declare its own language. HOW: set the language per page from the locale.',
  );
  this.currentPath = '/en/';
});

Then(
  'the English home ranks the same twenty spots as the Spanish home, in the same order',
  function () {
    const spanish = spotSlugsInOrder(readDoc('/', 'the Spanish ranking is the reference'), '/spots/');
    const english = spotSlugsInOrder(
      readDoc('/en/', 'the English ranking must mirror the Spanish one'),
      '/en/spots/',
    );
    assert.ok(
      new Set(spanish).size === 20,
      `WHAT: the Spanish home ranks ${new Set(spanish).size} distinct spots, expected 20. WHY: the reference ranking itself is broken. HOW: fix the Spanish home before mirroring it.`,
    );
    assert.deepEqual(
      english,
      spanish,
      'WHAT: the English home does not rank the same spots in the same order as the Spanish home. WHY: same call, same ranking, different words only. HOW: render both trees from the same published surface.',
    );
  },
);

// NOTE: 'the visitor is reading the English home' and "the visitor is reading
// tomorrow's ranking in English" are each defined ONCE above and serve both
// Given (precondition) and Then (outcome) positions: cucumber matches text,
// not keyword, and the chained narrative reuses the previous scenario's
// outcome as the next scenario's precondition (Pillar 2).

When('the visitor flips to tomorrow', function (this: ReadWorld) {
  const html = readDoc(this.currentPath ?? '/en/', 'the visitor stands on the English home');
  const tomorrow = internalAnchors(html).find((href) => href === '/en/tomorrow/');
  assert.ok(
    tomorrow,
    'WHAT: the English home offers no way to tomorrow inside the English tree. WHY: every link on an English page must keep the visitor in their language. HOW: link the tomorrow tab to /en/tomorrow/.',
  );
  this.currentPath = '/en/tomorrow/';
});

Then('the visitor is reading tomorrow\'s ranking in English', function (this: ReadWorld) {
  const html = readDoc('/en/tomorrow/', 'tomorrow is half of the daily promise');
  assert.equal(
    langOf(html),
    'en',
    'WHAT: the English tomorrow page does not declare English. HOW: set the language per page.',
  );
  const rows = spotSlugsInOrder(html, '/en/spots/');
  assert.ok(
    rows.length > 0,
    'WHAT: the English tomorrow page ranks no spots. WHY: tomorrow carries the same ranked coast as today. HOW: render the ranking from the published surface.',
  );
  this.currentPath = '/en/tomorrow/';
});

Then('every ranked row reads in English words', function (this: ReadWorld) {
  const text = strippedText(readDoc(this.currentPath ?? '/en/tomorrow/', 'the rows just read'));
  assert.ok(
    !SPANISH_DIACRITICS.test(text) && !SPANISH_SURFACE_WORDS.test(text),
    'WHAT: the English page renders Spanish words. WHY: partial translation is a failure state, not a milestone. HOW: every row string flows from the English copy tree.',
  );
});

When('the visitor taps the language toggle at the top of the page', function (this: ReadWorld) {
  const from = this.currentPath ?? '/en/tomorrow/';
  const html = readDoc(from, 'the visitor stands on a page of the English tree');
  const twin = twinOf(from);
  const toggle = internalAnchors(html).find((href) => href === twin);
  assert.ok(
    toggle,
    `WHAT: the page at ${from} carries no toggle link to its twin ${twin}. WHY: the toggle is a plain link to the exact twin address, never the other tree's home. HOW: build the toggle from the route map's twin of the current page.`,
  );
  this.currentPath = twin;
});

Then(
  'the visitor lands on the Spanish tomorrow page, the exact twin of where they stood',
  function (this: ReadWorld) {
    // The exact-twin promise was asserted at tap time (the toggle anchor must
    // equal twinOf(currentPath)); the oracle here is the product artifact.
    const html = readDoc('/manana/', 'the Spanish tomorrow page is the twin');
    assert.equal(langOf(html), 'es', 'WHAT: the Spanish tomorrow page does not declare Spanish.');
  },
);

When('the visitor follows every link on every English page', function (this: ReadWorld) {
  this.englishDocs = englishDocsOrFail();
});

Then('every destination stays inside the English tree', function (this: ReadWorld) {
  const violations: string[] = [];
  for (const doc of this.englishDocs ?? englishDocsOrFail()) {
    const self = urlOf(doc);
    const twin = twinOf(self);
    for (const href of internalAnchors(readFileSync(doc, 'utf8'))) {
      if (!href.startsWith('/en/') && href !== twin) violations.push(`${self} -> ${href}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `WHAT: links on English pages leave the English tree: ${violations.join(', ')}. WHY: the address the visitor saves must open in the language they chose, and every hop must preserve it. HOW: build internal links through the route map with the page's locale.`,
  );
});

Then('the only way out of the tree on any page is the language toggle', function () {
  // "on any page" means BOTH trees (R3 is symmetric): a Spanish page linking
  // into /en/ anywhere but the toggle is the same defect as the reverse.
  englishDocsOrFail();
  for (const doc of walkHtml(DIST)) {
    const self = urlOf(doc);
    const twin = twinOf(self);
    const inEnglishTree = self.startsWith('/en/');
    const crossers = [
      ...new Set(
        internalAnchors(readFileSync(doc, 'utf8')).filter((href) =>
          inEnglishTree ? !href.startsWith('/en/') : href.startsWith('/en/'),
        ),
      ),
    ];
    assert.deepEqual(
      crossers,
      [twin],
      `WHAT: the page at ${self} crosses trees via ${JSON.stringify(crossers)}, expected exactly its twin ${twin}. WHY: the toggle is the one deliberate exit, on every page of both trees. HOW: no other link may point at the other tree, and the toggle must be present.`,
    );
  }
});

When('every page of both trees is inspected', function (this: ReadWorld) {
  this.allDocs = walkHtml(DIST);
  englishDocsOrFail();
});

Then('each page declares its own language', function (this: ReadWorld) {
  for (const doc of this.allDocs ?? walkHtml(DIST)) {
    const expected = urlOf(doc).startsWith('/en/') ? 'en' : 'es';
    assert.equal(
      langOf(readFileSync(doc, 'utf8')),
      expected,
      `WHAT: the page at ${urlOf(doc)} does not declare its language as ${expected}. WHY: the page's language is a per-page fact. HOW: set it from the locale in the shared shell.`,
    );
  }
});

Then(
  'each page names itself and its exact twin in the other language with full addresses',
  function (this: ReadWorld) {
    for (const doc of this.allDocs ?? walkHtml(DIST)) {
      const self = urlOf(doc);
      const html = readFileSync(doc, 'utf8');
      const alternates = new Map(
        [...html.matchAll(/<link\b[^>]*rel="alternate"[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)].map(
          (m) => [m[1]!, m[2]!],
        ),
      );
      const ownLang = self.startsWith('/en/') ? 'en' : 'es';
      const otherLang = ownLang === 'en' ? 'es' : 'en';
      for (const [lang, expectedPath] of [
        [ownLang, self],
        [otherLang, twinOf(self)],
      ] as const) {
        const href = alternates.get(lang);
        assert.ok(
          href,
          `WHAT: the page at ${self} names no ${lang} alternate. WHY: a saved or shared address must announce its twin on every page. HOW: emit both language alternates in the shared shell.`,
        );
        assert.ok(
          href.startsWith('https://'),
          `WHAT: the ${lang} alternate on ${self} is not a full address: ${href}. WHY: relative alternates were a placeholder until the site address settled; it settled. HOW: derive the alternates from the configured site.`,
        );
        assert.equal(
          new URL(href).pathname,
          expectedPath,
          `WHAT: the ${lang} alternate on ${self} points at ${new URL(href).pathname}, expected ${expectedPath}. WHY: alternates name the page itself and its exact twin. HOW: build both from the route map.`,
        );
      }
    }
  },
);

When('a visitor with scripts unavailable opens the English home', function (this: ReadWorld) {
  readDoc('/en/', 'reading never needs a script');
  this.currentPath = '/en/';
});

Then('that visitor is reading the English home, unredirected', function (this: ReadWorld) {
  const html = readDoc('/en/', 'the page just opened');
  assert.ok(
    !/http-equiv="refresh"/i.test(html),
    'WHAT: the English home carries a redirect. WHY: redirects break caching and surprise people on bad signal; the design forbids them. HOW: serve the page at its own address, no forwarding.',
  );
});

Then(
  'no page of either tree sniffs, redirects, or stores a language choice',
  function (this: ReadWorld) {
    const forbidden = [/navigator\.language/i, /accept-language/i, /document\.cookie/i, /localStorage/i, /http-equiv="refresh"/i];
    for (const doc of this.allDocs ?? walkHtml(DIST)) {
      const html = readFileSync(doc, 'utf8');
      for (const pattern of forbidden) {
        assert.ok(
          !pattern.test(html),
          `WHAT: the page at ${urlOf(doc)} carries locale machinery matching ${pattern}. WHY: the choice persists as the address tree, never as a sniff, a redirect, or stored state. HOW: delete the machinery; the toggle is a plain link.`,
        );
      }
    }
  },
);

When('every English page is read end to end', function (this: ReadWorld) {
  this.englishDocs = englishDocsOrFail();
});

Then('no English page renders missing text', function (this: ReadWorld) {
  for (const doc of this.englishDocs ?? englishDocsOrFail()) {
    const text = strippedText(readFileSync(doc, 'utf8'));
    assert.ok(
      !/\bundefined\b/.test(text),
      `WHAT: the page at ${urlOf(doc)} renders the word undefined. WHY: a missing value must render as a stated absence, never as leaked emptiness. HOW: give the value an honest English absence string.`,
    );
  }
});

Then('no English page renders a bracketed placeholder', function (this: ReadWorld) {
  for (const doc of this.englishDocs ?? englishDocsOrFail()) {
    const text = strippedText(readFileSync(doc, 'utf8'));
    assert.ok(
      !/\[[^\]]{2,}\]/.test(text),
      `WHAT: the page at ${urlOf(doc)} renders a bracketed placeholder. WHY: a bracketed string is a missing string by its own admission. HOW: settle the copy through the sign-off batch, then render it.`,
    );
  }
});

Then('no English page renders Spanish copy', function (this: ReadWorld) {
  for (const doc of this.englishDocs ?? englishDocsOrFail()) {
    const text = strippedText(readFileSync(doc, 'utf8'));
    assert.ok(
      !SPANISH_DIACRITICS.test(text) && !SPANISH_SURFACE_WORDS.test(text),
      `WHAT: the page at ${urlOf(doc)} renders Spanish copy. WHY: partial translation is a failure state. HOW: every visible string flows from the English copy tree.`,
    );
  }
});

// U3 measurement is browser work: it rides the UI gate's real measurement at
// DELIVER (HANDOFF §4 reuse convention). Scaffolded pending, not faked here.
When('the language toggle is measured on the built pages', pendingUntil('READ-01'));
Then('its target is at least 44 pixels on every page of both trees', pendingUntil('READ-01'));

When('the page-weight gate runs over the built site', function (this: ReadWorld) {
  englishDocsOrFail();
  const run = spawnSync('node', ['scripts/check-page-weight.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  this.pageWeight = { status: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
});

Then('every English page sits at or under its ceiling', function (this: ReadWorld) {
  assert.ok(this.pageWeight, 'WHAT: the page-weight gate never ran. HOW: run the gate step first.');
  assert.equal(
    this.pageWeight.status,
    0,
    `WHAT: the page-weight gate refused the built tree. WHY: every document, English included, lives inside its byte ceiling. HOW: read the gate's own output: ${this.pageWeight.out}`,
  );
});

// --- READ-04: the yesterday route through the route map (real driver) ------

When('the yesterday route is looked up for both languages', async function (this: ReadWorld) {
  const routes = (await import('../../../../src/i18n/routes.ts')) as {
    paths: Record<string, ((locale: 'es' | 'en', spotId: string) => string) | undefined>;
  };
  const yesterday = routes.paths['yesterday'];
  assert.ok(
    yesterday,
    'WHAT: the route map has no yesterday builder. WHY: the yesterday twin is settled as /en/spots/{slug}/yesterday and the page hand-types its own address today. HOW: add the yesterday builder to the route map and read it from the page.',
  );
  this.yesterdayRoutes = {
    es: yesterday('es', 'playa-venao'),
    en: yesterday('en', 'playa-venao'),
  };
});

Then(
  'the route map answers with the Spanish yesterday address and its English twin',
  function (this: ReadWorld) {
    assert.ok(this.yesterdayRoutes, 'WHAT: the yesterday route was never looked up.');
    assert.equal(this.yesterdayRoutes.es, '/spots/playa-venao/ayer/');
    assert.equal(this.yesterdayRoutes.en, '/en/spots/playa-venao/yesterday/');
  },
);

Then(
  'the emitted Spanish yesterday page sits at the exact address the route map builds',
  function (this: ReadWorld) {
    assert.ok(this.yesterdayRoutes, 'WHAT: the yesterday route was never looked up.');
    assert.ok(
      resolveDoc(this.yesterdayRoutes.es),
      `WHAT: no page is emitted at the route map's yesterday address ${this.yesterdayRoutes.es}. WHY: the map and the tree must agree. HOW: the yesterday page reads its address from the route map.`,
    );
  },
);

// --- READ-02: translation-coverage check (scaffolded pending) ---------------

Given('a contained copy fixture whose English tree carries a bracketed placeholder', pendingUntil('READ-02'));
Given('a contained copy fixture carrying a user-facing export whose name encodes Spanish only', pendingUntil('READ-02'));
Given('a contained copy fixture whose exports are ordinary English words ending in es', pendingUntil('READ-02'));
Given('a contained built tree whose English page renders missing text where its call should be', pendingUntil('READ-02'));
Given('the known offenders are recorded in the exceptions file with a written reason per line', pendingUntil('READ-02'));
Given('the exceptions file recorded a set of offenders', pendingUntil('READ-02'));
When('the translation-coverage check inspects the contained fixture', pendingUntil('READ-02'));
When('the translation-coverage check inspects the contained built tree', pendingUntil('READ-02'));
When('the translation-coverage check inspects a contained fixture carrying one recorded offender and one new offender', pendingUntil('READ-02'));
When('the translation-coverage check sees the exceptions file grow', pendingUntil('READ-02'));
Then('the translation-coverage check does not succeed', pendingUntil('READ-02'));
Then('the refusal names the exact file, the key path, and the missing language', pendingUntil('READ-02'));
Then('the seeded fixture and the repository stay unchanged', pendingUntil('READ-02'));
Then('the refusal names that export and the language it lacks', pendingUntil('READ-02'));
Then('the translation-coverage check succeeds and names no offender', pendingUntil('READ-02'));
Then('the refusal names the page and what failed to render', pendingUntil('READ-02'));
Then('the recorded offender passes as measured debt', pendingUntil('READ-02'));
Then('the new offender is refused by name', pendingUntil('READ-02'));
Then('the refusal says the debt grew and names the added line', pendingUntil('READ-02'));

// --- READ-03: hidden-copy check (scaffolded pending) ------------------------

Given('a contained page fixture carrying an inline Spanish sentence in its template', pendingUntil('READ-03'));
Given('a contained page fixture whose every visible string flows from a registered copy home', pendingUntil('READ-03'));
Given('a contained page fixture carrying a class name, an accessibility token, a data marker, a time format and a style block', pendingUntil('READ-03'));
Given('a contained page fixture carrying a genuinely ambiguous literal absent from the exceptions file', pendingUntil('READ-03'));
When('the hidden-copy check inspects the contained fixture', pendingUntil('READ-03'));
Then('the hidden-copy check does not succeed', pendingUntil('READ-03'));
Then('the refusal names the file and the line carrying the inline sentence', pendingUntil('READ-03'));
Then('the hidden-copy check succeeds and names no offender', pendingUntil('READ-03'));
Then('the same literal with a written debt line and reason passes as measured debt', pendingUntil('READ-03'));

// --- READ-04: route-conformance check over contained fixtures (pending) -----

Given('a contained site fixture whose route map builds an address family with no emitted page', pendingUntil('READ-04'));
Given('a contained site fixture carrying a Spanish page whose English twin is missing and unrecorded', pendingUntil('READ-04'));
Given('a contained site fixture whose emitted pages and route map agree in both directions', pendingUntil('READ-04'));
When('the route-conformance check inspects the contained fixture', pendingUntil('READ-04'));
Then('the route-conformance check does not succeed', pendingUntil('READ-04'));
Then('the refusal names the dead builder and the address it builds', pendingUntil('READ-04'));
Then('the refusal names the twinless page and the twin address it expects', pendingUntil('READ-04'));
Then('the same page with a written debt line and reason passes as measured debt', pendingUntil('READ-04'));
Then('the route-conformance check succeeds', pendingUntil('READ-04'));
Then('the report names every address family as resolved', pendingUntil('READ-04'));

// --- READ-05: English spot page and honest yesterday (pending) --------------

Given('the visitor is reading a spot\'s own page in English', pendingUntil('READ-05'));
When('the visitor taps a ranked row', pendingUntil('READ-05'));
Then('the visitor is reading that spot\'s own page in English', pendingUntil('READ-05'));
Then('the page carries today\'s and tomorrow\'s numbers, the size in body-height words, and the window', pendingUntil('READ-05'));
When('the size line is read on every English spot page', pendingUntil('READ-05'));
Then('the body-height word comes first and the numeric range second with the approximation mark', pendingUntil('READ-05'));
Then('the open-ended band never claims a ceiling', pendingUntil('READ-05'));
Given('a spot whose day is missing a window or a size', pendingUntil('READ-05'));
When('the visitor reads that spot\'s own page on the English tree', pendingUntil('READ-05'));
Then('each missing value is stated as an absence in English words', pendingUntil('READ-05'));
Then('no missing value renders as missing text or as Spanish copy', pendingUntil('READ-05'));
Given('a receipt that was minted in Spanish before English existed', pendingUntil('READ-05'));
When('the visitor reads that spot\'s yesterday page on the English tree', pendingUntil('READ-05'));
Then('the page presents no English narrative that was never published', pendingUntil('READ-05'));
Then('the page either quotes the Spanish call as the historical artifact or plainly states the narrative exists in Spanish only', pendingUntil('READ-05'));
Given('a spot with no receipt for yesterday', pendingUntil('READ-05'));
Then('the page plainly states there is nothing to show for yesterday, in English', pendingUntil('READ-05'));
Then('the page invents no number and no narrative', pendingUntil('READ-05'));

// --- READ-06: English share card (pending; gated on f-paste 01-04) ----------

When('the visitor shares the day\'s call', pendingUntil('READ-06'));
Then('the pasted message is the settled English template carrying that build\'s real values', pendingUntil('READ-06'));
Then('the pasted link is the full address of the shared page carrying the build marker', pendingUntil('READ-06'));
When('the link preview declarations of every page are inspected', pendingUntil('READ-06'));
Then('every page declares Spanish Panama as its locale with the English alternate beside it', pendingUntil('READ-06'));

// --- READ-07: English report flow and locale-blind wire (pending) -----------

When('the visitor looks for the report invitation', pendingUntil('READ-07'));
Then('the invitation reads real English words', pendingUntil('READ-07'));
Then('the invitation never reads as a bracketed placeholder', pendingUntil('READ-07'));
When('the visitor opens the report screen', pendingUntil('READ-07'));
Then('the screen asks How big?, Wind? and How was it? with the settled English answers', pendingUntil('READ-07'));
Then('the send action and the no-script line read in settled English', pendingUntil('READ-07'));
Given('one visitor on the Spanish tree and one on the English tree', pendingUntil('READ-07'));
When('each answers the same three questions the same way and sends', pendingUntil('READ-07'));
Then('the two committed records are the same bytes', pendingUntil('READ-07'));
Then('every answer travels as its canonical token, never as its display words', pendingUntil('READ-07'));
Then('neither record carries a language', pendingUntil('READ-07'));
Given('the visitor has sent a report from the English tree', pendingUntil('READ-07'));
When('the flow moves through its states', pendingUntil('READ-07'));
Then('queued, arrival, reveal, refusal and the counter each read in English', pendingUntil('READ-07'));
Then('no state renders Spanish copy or missing text', pendingUntil('READ-07'));

// --- READ-08: settle, absolute mode, the sentence end to end (pending) ------

Given('the copy-shipping lanes have settled', pendingUntil('READ-08'));
When('the three checks run in absolute mode', pendingUntil('READ-08'));
Then('all three succeed with zero recorded debt', pendingUntil('READ-08'));
Then('no exceptions mechanism remains to grow back', pendingUntil('READ-08'));
When('the emitted trees are compared in both directions', pendingUntil('READ-08'));
Then('every Spanish page has its English twin and every English page maps back', pendingUntil('READ-08'));
Then('zero debt lines remain in either direction', pendingUntil('READ-08'));
Given('the visitor is reading any page of either tree', pendingUntil('READ-08'));
When('the visitor taps the language toggle, reads the call, the confidence reasons and the report flow, and returns the next day to a saved address', pendingUntil('READ-08'));
Then('every tap lands on the exact twin page', pendingUntil('READ-08'));
Then('the call, the reasons and the report flow read in the chosen language', pendingUntil('READ-08'));
Then('the saved address opens in the language the visitor chose', pendingUntil('READ-08'));
When('every settled string is compared against its source of record', pendingUntil('READ-08'));
Then('not one verbatim string differs in either language', pendingUntil('READ-08'));
Then('no new string carries an em dash', pendingUntil('READ-08'));
Then('the Spanish surface carries zero English and the English surface zero Spanish beyond the immutable receipt quote, if quoting is how the receipt resolved', pendingUntil('READ-08'));
