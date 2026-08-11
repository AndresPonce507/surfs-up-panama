// covers: R36
// The page-weight gate. It walks an emitted build output, measures every route
// document and every first-visit asset that document references, and refuses a
// build that would break the two-second beach-3G promise.
//
// WHY THIS IS CI AND NOT A REVIEW NOTE
// ------------------------------------
// "Keep the home light" as guidance loses to the next feature, every time. The
// promise is a number: 400 kbps down, 400 ms RTT, three round trips of setup
// plus one for the first byte leaves about 0.28 s of transfer, which is one
// 14 KB gz document with nothing render-blocking behind it
// (application-architecture.md section 5). A page nobody measured is a promise
// nobody kept.
//
// WHERE THE CEILINGS COME FROM (no number here is invented)
// ---------------------------------------------------------
// - Per-route document ceilings: application-architecture.md section 4, the
//   route map column "Doc budget (gz)".
// - The 100 KB per-route first-visit cap: DISCUSS decision 27, restated in
//   application-architecture.md section 5 ("the cap is per route, first visit,
//   everything on the wire").
// - Zero render-blocking subresources on a reading route: the second of section
//   5's "two hard implications, both enforced".
// - The failure message contract, route + measured bytes + ceiling + the
//   largest three contributors: application-architecture.md section 5, CI
//   enforcement paragraph.
//
// KB means 1024 B throughout. 14 KB is therefore 14,336 B, which is inside the
// ~14,600 B initial congestion window section 5 relies on (RFC 6928, 10 x 1460).
//
// FAILS CLOSED. "I measured it and it passes" and "I could not measure it" are
// different outcomes and never print the same thing.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const FIRST_VISIT_CEILING = { label: '100 KB', bytes: 100 * KB };
const DOCUMENTATION = 'docs/product/architecture/application-architecture.md';

/**
 * Route map, application-architecture.md section 4. `pattern` matches a path
 * relative to the build output, `route` renders the built route it names, and
 * `reading` marks the routes whose whole job is to be read: those carry the
 * two-second first-paint promise and may not wait on a subresource.
 */
const DECLARED_ROUTES = [
  { shape: '/', pattern: /^index\.html$/, route: () => '/', label: '14 KB', bytes: 14 * KB, reading: true },
  { shape: '/manana', pattern: /^manana\.html$/, route: () => '/manana', label: '14 KB', bytes: 14 * KB, reading: true },
  { shape: '/en/tomorrow', pattern: /^en\/tomorrow\.html$/, route: () => '/en/tomorrow', label: '14 KB', bytes: 14 * KB, reading: true },
  { shape: '/en/spots/{slug}', pattern: /^en\/spots\/([^/]+)\.html$/, route: (m) => `/en/spots/${m[1]}`, label: '14 KB', bytes: 14 * KB, reading: true },
  { shape: '/spots/{slug}', pattern: /^spots\/([^/]+)\.html$/, route: (m) => `/spots/${m[1]}`, label: '14 KB', bytes: 14 * KB, reading: true },
  { shape: '/spots/{slug}/ayer', pattern: /^spots\/([^/]+)\/ayer\.html$/, route: (m) => `/spots/${m[1]}/ayer`, label: '14 KB', bytes: 14 * KB, reading: true },
  { shape: '/spots/{slug}/reportar', pattern: /^spots\/([^/]+)\/reportar\.html$/, route: (m) => `/spots/${m[1]}/reportar`, label: '6 KB', bytes: 6 * KB, reading: false },
  { shape: '/spots/{slug}/reportado', pattern: /^spots\/([^/]+)\/reportado\.html$/, route: (m) => `/spots/${m[1]}/reportado`, label: '4 KB', bytes: 4 * KB, reading: false },
  // Slice-06 emits this. A mistyped spot address has to land on words rather
  // than a raw origin error, so it is a reading route and carries the same
  // no-render-blocking-subresource rule as the other reading routes. 4 KB
  // matches the smallest ceiling already in the section 4 route map; the built
  // page measures well inside it.
  { shape: '/404', pattern: /^404\.html$/, route: () => '/404', label: '4 KB', bytes: 4 * KB, reading: true },
  // Slice-01 emits this. The precached fallback a reading or report route
  // falls back to with nothing kept on the phone: it has to arrive with
  // nothing else in flight, so it is a reading route under the same
  // no-render-blocking-subresource rule (application-architecture.md section 4).
  { shape: '/sin-senal', pattern: /^sin-senal\.html$/, route: () => '/sin-senal', label: '3 KB', bytes: 3 * KB, reading: true },
];

/**
 * Declared in section 4, built by later features. Printed, never silently
 * skipped: a reader has to see the edge of what was measured.
 */
const DECLARED_BUT_UNBUILT = '/acerca (8 KB), and the remaining /en/ mirror (deferred to F-READ-IT-IN-YOUR-LANGUAGE)';

function count(bytes) {
  return bytes.toLocaleString('en-US');
}

function gzipBytes(content) {
  return gzipSync(content).length;
}

function walk(root, directory = root, found = []) {
  for (const entry of readdirSync(directory).sort()) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(root, path, found);
      continue;
    }
    found.push(relative(root, path).split(sep).join('/'));
  }
  return found;
}

function declaredRouteFor(documentPath) {
  for (const declared of DECLARED_ROUTES) {
    const match = declared.pattern.exec(documentPath);
    if (match) return { declared, route: declared.route(match) };
  }
  return null;
}

function attributeOf(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  if (match) return match[2] ?? match[3] ?? match[4] ?? '';
  return new RegExp(`\\s${name}(\\s|$|>)`, 'i').test(tag) ? '' : null;
}

/**
 * What a browser pulls down before the visitor has done anything: the
 * stylesheets, icons, manifest, preloads, scripts and eager images the document
 * points at. Lazy images and anything behind an interaction are not first
 * visit, and `rel="alternate"` is a navigation hint, not a download.
 */
function firstVisitReferences(html) {
  const references = [];
  for (const match of html.matchAll(/<(link|script|img)\b[^>]*>/gi)) {
    const tag = match[0];
    const element = match[1].toLowerCase();
    if (element === 'link') {
      const rel = (attributeOf(tag, 'rel') ?? '').toLowerCase();
      if (!['stylesheet', 'icon', 'apple-touch-icon', 'manifest', 'preload'].includes(rel)) continue;
      const href = attributeOf(tag, 'href');
      if (href) {
        const media = attributeOf(tag, 'media');
        const blocking = rel === 'stylesheet' && (media === null || ['all', 'screen'].includes(media.trim().toLowerCase()));
        references.push({ reference: href, blocking, why: blocking ? 'stylesheet the document waits on' : null });
      }
      continue;
    }
    if (element === 'script') {
      const source = attributeOf(tag, 'src');
      if (!source) continue;
      const type = (attributeOf(tag, 'type') ?? '').toLowerCase();
      const deferred = attributeOf(tag, 'defer') !== null || attributeOf(tag, 'async') !== null || type === 'module';
      references.push({ reference: source, blocking: !deferred, why: deferred ? null : 'script the document waits on' });
      continue;
    }
    const source = attributeOf(tag, 'src');
    if (!source) continue;
    if ((attributeOf(tag, 'loading') ?? '').toLowerCase() === 'lazy') continue;
    references.push({ reference: source, blocking: false, why: null });
  }
  return references;
}

/**
 * The named parts of a document, so a refusal says what to cut rather than only
 * that the page is too heavy. Inline style and script blocks are named one by
 * one; what is left is split at the end of the head, because "the head grew" and
 * "the content grew" are different problems with different cuts.
 */
function documentContributors(html) {
  const parts = [];
  let markup = html;
  let styles = 0;
  let scripts = 0;
  for (const match of html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)) {
    styles += 1;
    parts.push({ name: `inline <style> #${styles}`, bytes: Buffer.byteLength(match[0]) });
    markup = markup.replace(match[0], '');
  }
  for (const match of html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)) {
    scripts += 1;
    parts.push({ name: `inline <script> #${scripts}`, bytes: Buffer.byteLength(match[0]) });
    markup = markup.replace(match[0], '');
  }
  const headEnd = markup.toLowerCase().indexOf('</head>');
  if (headEnd === -1) {
    parts.push({ name: 'markup', bytes: Buffer.byteLength(markup) });
  } else {
    parts.push({ name: 'head markup', bytes: Buffer.byteLength(markup.slice(0, headEnd + '</head>'.length)) });
    parts.push({ name: 'body markup', bytes: Buffer.byteLength(markup.slice(headEnd + '</head>'.length)) });
  }
  return parts
    .sort((left, right) => right.bytes - left.bytes)
    .map((part) => `${part.name} ${count(part.bytes)} B raw`);
}

function largestThree(contributors) {
  return contributors.slice(0, 3).join('; ');
}

class Report {
  constructor(output) {
    this.output = output;
    this.lines = [];
    this.refusals = 0;
  }

  say(line) {
    this.lines.push(line);
    this.output.write(line);
  }

  refuse(headline, why, repair, detail) {
    this.refusals += 1;
    const write = typeof this.output.error === 'function' ? (line) => this.output.error(line) : (line) => this.output.write(line);
    for (const line of [headline, `  why: ${why}`, ...(detail ? [`  ${detail}`] : []), `  restore: ${repair}`]) {
      this.lines.push(line);
      write(line);
    }
  }

  result() {
    return { exitCode: this.refusals > 0 ? 1 : 0, lines: this.lines };
  }
}

function refuseUnmeasurable(report, what, why, repair) {
  report.refuse(`REFUSED: cannot measure ${what}`, why, repair);
}

/**
 * Measures a build output against the declared ceilings.
 *
 * @param {{ distRoot: string, output: { write(line: string): void, error?(line: string): void } }} options
 * @returns {Promise<{ exitCode: number, lines: string[] }>}
 */
export async function evaluatePageWeight({ distRoot, output }) {
  const report = new Report(output);
  const root = resolve(distRoot);

  // The measured directory is named first. A measurement of the wrong output
  // reads exactly like a measurement of the right one unless the root is on the
  // page, and a stale or copied build output is the easy way to fool this gate.
  report.say(`page-weight gate: measuring the build output at ${root}`);
  report.say(`page-weight gate: ceilings declared in ${DOCUMENTATION} section 4 (route map) and section 5 (${FIRST_VISIT_CEILING.label} first visit, decision 27). KB means 1024 B.`);
  for (const declared of DECLARED_ROUTES) {
    report.say(`declared ceiling ${declared.shape}: document ceiling ${declared.label} (${count(declared.bytes)} B gz), first-visit ceiling ${FIRST_VISIT_CEILING.label} (${count(FIRST_VISIT_CEILING.bytes)} B gz)`);
  }
  report.say(`not measured, declared in section 4 but not built by this feature: ${DECLARED_BUT_UNBUILT}`);

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    refuseUnmeasurable(
      report,
      `${root}: there is no build output there`,
      'a page weight nobody measured is a promise nobody kept, and an absent build must never read as a passing one',
      `run "npm run build" first, or point the gate at a real build output with "npm run budget -- --dist ${root}"`,
    );
    return report.result();
  }

  const emitted = walk(root);
  const documents = emitted.filter((path) => path.endsWith('.html'));
  if (documents.length === 0) {
    refuseUnmeasurable(
      report,
      `${root}: it holds no route document`,
      'an empty build output cannot be reported as inside its ceilings',
      'run "npm run build" and re-run the gate against the output it produced',
    );
    return report.result();
  }

  const measurements = [];
  for (const documentPath of documents) {
    const matched = declaredRouteFor(documentPath);
    if (!matched) {
      refuseUnmeasurable(
        report,
        `${documentPath}: it is emitted but no declared route ceiling covers it`,
        `every emitted route is on the wire whether or not anyone budgeted it, so an unbudgeted document cannot be reported as inside a ceiling it does not have`,
        `declare its ceiling in ${DOCUMENTATION} section 4 and add it to DECLARED_ROUTES in scripts/page-weight-core.mjs, or stop emitting it`,
      );
      continue;
    }

    const { declared, route } = matched;
    const html = readFileSync(resolve(root, documentPath), 'utf8');
    const documentBytes = gzipBytes(html);

    let firstVisitBytes = documentBytes;
    const assets = [];
    const wireContributors = [{ name: `document ${documentPath}`, bytes: documentBytes }];
    let unmeasurableAsset = false;

    for (const { reference, blocking, why } of firstVisitReferences(html)) {
      if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(reference)) {
        refuseUnmeasurable(
          report,
          `${reference}, a first-visit asset of ${route}`,
          'it is served by somebody else, so its bytes and its availability are outside this build and outside the two-second promise',
          `serve it from this site so the gate can weigh it, or drop it (${DOCUMENTATION} adr-performance-budget-cuts.md rules third-party assets out)`,
        );
        unmeasurableAsset = true;
        continue;
      }
      if (reference.startsWith('data:') || reference.startsWith('#') || reference.startsWith('mailto:')) continue;
      const assetPath = reference.startsWith('/')
        ? reference.slice(1)
        : `${documentPath.split('/').slice(0, -1).join('/')}/${reference}`.replace(/^\//, '');
      const assetFile = resolve(root, assetPath);
      if (!existsSync(assetFile) || !statSync(assetFile).isFile()) {
        refuseUnmeasurable(
          report,
          `${reference}, a first-visit asset ${route} points at`,
          'the built page asks for it on first visit and the build did not emit it, so nobody can say what that route weighs',
          'emit the asset in the build output or remove the reference from the page',
        );
        unmeasurableAsset = true;
        continue;
      }
      const assetBytes = gzipBytes(readFileSync(assetFile));
      firstVisitBytes += assetBytes;
      assets.push(reference);
      wireContributors.push({ name: reference, bytes: assetBytes });
      if (blocking && declared.reading) {
        report.refuse(
          `REFUSED route ${route} (${documentPath}): render-blocking first-visit subresource ${reference}`,
          `a reading route has to arrive in one paint: the ${why} costs an extra round trip, which the two seconds on beach 3G do not have (${DOCUMENTATION} section 5)`,
          'inline what first paint needs and load the rest after paint (async stylesheet, deferred or module script)',
        );
      }
    }

    measurements.push({ route, documentPath, documentBytes, firstVisitBytes, assets, declared, unmeasurableAsset });
  }

  for (const measurement of [...measurements].sort((left, right) => right.documentBytes - left.documentBytes)) {
    const { route, documentPath, documentBytes, firstVisitBytes, assets, declared } = measurement;
    report.say(
      `route ${route} (${documentPath}): document ${count(documentBytes)} B gz / ceiling ${declared.label} (${count(declared.bytes)} B gz); `
      + `first visit ${count(firstVisitBytes)} B gz / ceiling ${FIRST_VISIT_CEILING.label} (${count(FIRST_VISIT_CEILING.bytes)} B gz); `
      + `first-visit assets: ${assets.length === 0 ? 'none' : assets.join(', ')}`,
    );
  }

  for (const measurement of measurements) {
    const { route, documentPath, documentBytes, firstVisitBytes, declared } = measurement;
    if (documentBytes > declared.bytes) {
      const html = readFileSync(resolve(root, documentPath), 'utf8');
      report.refuse(
        `REFUSED route ${route} (${documentPath}): document ${count(documentBytes)} B gz over its ceiling ${declared.label} (${count(declared.bytes)} B gz)`,
        `first render on beach 3G has one document-sized round trip to spend, so a document over ${declared.label} gz cannot land inside two seconds (${DOCUMENTATION} section 5)`,
        'cut the largest contributor first. On the ranked rows that means call text on rows 2-20, never the honesty elements: the publish stamp, the confidence line, the today-and-tomorrow-only footer',
        `largest contributors: ${largestThree(documentContributors(html))}`,
      );
    }
    if (firstVisitBytes > FIRST_VISIT_CEILING.bytes) {
      const contributors = [{ name: `document ${documentPath}`, bytes: documentBytes }];
      for (const reference of measurement.assets) {
        const assetFile = resolve(root, reference.replace(/^\//, ''));
        contributors.push({ name: reference, bytes: gzipBytes(readFileSync(assetFile)) });
      }
      report.refuse(
        `REFUSED route ${route} (${documentPath}): first visit ${count(firstVisitBytes)} B gz over the ceiling ${FIRST_VISIT_CEILING.label} (${count(FIRST_VISIT_CEILING.bytes)} B gz)`,
        `the cap is per route, first visit, everything on the wire (decision 27, ${DOCUMENTATION} section 5)`,
        'drop or defer the heaviest first-visit asset. Nothing on a reading route may compete with the forecast for bytes',
        `largest contributors: ${largestThree(
          contributors.sort((left, right) => right.bytes - left.bytes).map((part) => `${part.name} ${count(part.bytes)} B gz`),
        )}`,
      );
    }
  }

  const shapes = new Set(measurements.map((measurement) => measurement.declared.shape));
  if (report.refusals > 0) {
    report.say(`page-weight gate: ${measurements.length} documents measured across ${shapes.size} declared routes, ${report.refusals} refusal(s). The build does not keep the two-second beach-3G promise.`);
    return report.result();
  }

  const heaviest = [...measurements].sort((left, right) => right.documentBytes - left.documentBytes)[0];
  report.say(
    `page-weight gate: ${measurements.length} documents measured across ${shapes.size} declared routes, `
    + `heaviest ${heaviest.route} at ${count(heaviest.documentBytes)} B gz of ${count(heaviest.declared.bytes)} B gz. `
    + 'The build comes in under every ceiling.',
  );
  return report.result();
}

const STREAM_OUTPUT = {
  write: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
};

/**
 * Wires the gate into the build itself, so it measures whatever the build
 * emitted (`--outDir` included) and a build that breaks a ceiling cannot finish
 * successfully. The output port is injectable so the refusal path is testable
 * without a full build; the build always gets the streams.
 */
export function pageWeightBudgetIntegration() {
  return {
    name: 'page-weight-budget',
    hooks: {
      'astro:build:done': async ({ dir, output = STREAM_OUTPUT }) => {
        const result = await evaluatePageWeight({
          distRoot: fileURLToPath(dir),
          output,
        });
        if (result.exitCode !== 0) {
          throw new Error(
            'page-weight gate refused this build: see the refusals above for the route, the measured bytes and the ceiling',
          );
        }
      },
    },
  };
}
