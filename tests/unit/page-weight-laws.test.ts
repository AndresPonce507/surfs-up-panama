// Property laws for the page-weight gate. They drive the production driving
// port (evaluatePageWeight) over generated build outputs, and observe only what
// the gate prints and returns. Nothing here recomputes the gate's arithmetic:
// the laws are self-consistency, monotonicity and equivalence-class coverage,
// so a gate that prints plausible numbers while never measuring fails them.
//
// Ceilings are transcribed from application-architecture.md section 4 (route
// map) and section 5 (the 100 KB first-visit cap, decision 27). KB is 1024 B.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import fc from 'fast-check';
import { afterEach, describe, it } from 'vitest';

import { evaluatePageWeight, pageWeightBudgetIntegration } from '../../scripts/check-page-weight.mjs';

const HOME_CEILING_BYTES = 14 * 1024;
const FIRST_VISIT_CEILING_BYTES = 100 * 1024;
const ICON = '/favicon.svg';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** Deterministic high-entropy filler: repetitive text would gzip away to nothing. */
function incompressibleText(byteLength: number, seed: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = (seed * 2654435761 + 1) >>> 0;
  const characters: string[] = [];
  while (characters.length < byteLength) {
    state = (state * 1664525 + 1013904223) >>> 0;
    characters.push(alphabet.charAt(state % alphabet.length));
  }
  return characters.join('');
}

type Document = { path: string; filler?: number; head?: string; body?: string };

function documentText(document: Document): string {
  const head = document.head ?? '';
  const body = document.body ?? '';
  const filler = document.filler === undefined ? '' : `<p>${incompressibleText(document.filler, document.filler)}</p>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>t</title><link rel="icon" href="${ICON}">${head}<style>body{margin:0}</style></head><body><main>hola${filler}</main>${body}</body></html>`;
}

function buildOutput(documents: readonly Document[], assets: Readonly<Record<string, string>> = {}): string {
  const cleanupRoot = mkdtempSync(join(tmpdir(), 'page-weight-law-'));
  roots.push(cleanupRoot);
  const root = join(cleanupRoot, 'dist');
  mkdirSync(root, { recursive: true });
  writeFileSync(resolve(root, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
  for (const document of documents) {
    const path = resolve(root, document.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, documentText(document), 'utf8');
  }
  for (const [name, content] of Object.entries(assets)) {
    const path = resolve(root, name.replace(/^\//, ''));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  return root;
}

type Measured = { route: string; documentBytes: number; firstVisitBytes: number };

async function measure(documents: readonly Document[], assets?: Readonly<Record<string, string>>) {
  const lines: string[] = [];
  const result = await evaluatePageWeight({
    distRoot: buildOutput(documents, assets),
    output: { write: (line: string) => lines.push(line), error: (line: string) => lines.push(line) },
  });
  const output = lines.join('\n');
  const measured: Measured[] = [
    ...output.matchAll(/^route\s+(\S+)\s.*?document\s+([\d,]+)\s*B\s*gz.*?first visit\s+([\d,]+)\s*B\s*gz/gm),
  ].map((match) => ({
    route: match[1]!,
    documentBytes: Number(match[2]!.replaceAll(',', '')),
    firstVisitBytes: Number(match[3]!.replaceAll(',', '')),
  }));
  return { exitCode: result.exitCode, output, measured };
}

const slugs = fc
  .stringMatching(/^[a-z][a-z0-9-]{1,24}$/)
  .filter((slug) => !slug.endsWith('-') && !slug.includes('--'));

describe('page-weight gate laws', () => {
  it('reports a measurement for every emitted route, and the verdict agrees with what it reported', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 60_000 }), async (filler) => {
        const { exitCode, output, measured } = await measure([{ path: 'index.html', filler }]);
        assert.equal(measured.length, 1, `one emitted document must produce one measurement\n${output}`);
        const home = measured[0]!;
        assert.equal(home.route, '/', `index.html is route /\n${output}`);
        const withinCeilings = home.documentBytes <= HOME_CEILING_BYTES && home.firstVisitBytes <= FIRST_VISIT_CEILING_BYTES;
        assert.equal(
          exitCode === 0,
          withinCeilings,
          `the verdict must follow the reported measurement: reported ${home.documentBytes} B gz against ${HOME_CEILING_BYTES} B gz, exit ${exitCode}\n${output}`,
        );
      }),
      { numRuns: 24 },
    );
  });

  it('measures the document that was actually emitted: more bytes in, more bytes reported', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4_000 }),
        fc.integer({ min: 4_001, max: 20_000 }),
        async (small, large) => {
          const lighter = await measure([{ path: 'index.html', filler: small }]);
          const heavier = await measure([{ path: 'index.html', filler: large }]);
          assert.ok(
            heavier.measured[0]!.documentBytes > lighter.measured[0]!.documentBytes,
            `a heavier document must report more bytes\n${lighter.output}\n---\n${heavier.output}`,
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it('counts the document inside its own first-visit total, and the referenced assets on top', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 6_000 }), fc.integer({ min: 1, max: 30_000 }), async (filler, assetSize) => {
        const bare = await measure([{ path: 'index.html', filler }]);
        const withAsset = await measure(
          [{ path: 'index.html', filler, head: '<script src="/island.js" defer></script>' }],
          { '/island.js': incompressibleText(assetSize, assetSize) },
        );
        assert.ok(
          bare.measured[0]!.firstVisitBytes >= bare.measured[0]!.documentBytes,
          `first visit includes the document itself\n${bare.output}`,
        );
        assert.ok(
          withAsset.measured[0]!.firstVisitBytes > bare.measured[0]!.firstVisitBytes,
          `a referenced first-visit asset must be added to the route total\n${withAsset.output}`,
        );
      }),
      { numRuns: 12 },
    );
  });

  it('measures every declared route shape for any spot slug, and leaves none unmeasured', async () => {
    await fc.assert(
      fc.asyncProperty(slugs, async (slug) => {
        const { exitCode, output, measured } = await measure([
          { path: 'index.html' },
          { path: 'manana.html' },
          { path: `spots/${slug}.html` },
          { path: `spots/${slug}/ayer.html` },
          { path: `spots/${slug}/reportar.html` },
          { path: `spots/${slug}/reportado.html` },
        ]);
        assert.equal(exitCode, 0, `every route is far inside its ceiling\n${output}`);
        assert.deepEqual(
          measured.map((entry) => entry.route).sort(),
          [
            '/',
            '/manana',
            `/spots/${slug}`,
            `/spots/${slug}/ayer`,
            `/spots/${slug}/reportado`,
            `/spots/${slug}/reportar`,
          ].sort(),
          `every emitted document must be named by its own route\n${output}`,
        );
        assert.ok(!output.includes('cannot measure'), `nothing here is unmeasurable\n${output}`);
      }),
      { numRuns: 16 },
    );
  });

  it('refuses any emitted document it has no declared ceiling for, and names it', async () => {
    await fc.assert(
      fc.asyncProperty(slugs, slugs, async (slug, undeclared) => {
        const path = `spots/${slug}/${undeclared}.html`;
        const { exitCode, output } = await measure([{ path: 'index.html' }, { path }]);
        assert.notEqual(exitCode, 0, `an emitted document with no ceiling cannot be reported green\n${output}`);
        assert.ok(output.includes(path), `the refusal must name the document it could not measure\n${output}`);
        assert.ok(output.includes('cannot measure'), `an unmeasured document must not read like a measured one\n${output}`);
      }),
      { numRuns: 16 },
    );
  });

  it('stops the build it is wired into whenever it refuses, and lets a clean build through', async () => {
    const hook = pageWeightBudgetIntegration().hooks['astro:build:done'];
    const silent = { write: () => {}, error: () => {} };

    const clean = buildOutput([{ path: 'index.html', filler: 400 }]);
    await hook({ dir: pathToFileURL(`${clean}/`), output: silent });

    const oversize = buildOutput([{ path: 'index.html', filler: 60_000 }]);
    await assert.rejects(
      hook({ dir: pathToFileURL(`${oversize}/`), output: silent }),
      /page-weight gate refused this build/,
      'a build whose emitted page breaks a ceiling must not finish successfully',
    );
  });

  it('refuses a reading route that waits on a subresource, and accepts a deferred asset on a report route', async () => {
    const blocked = await measure(
      [{ path: 'index.html', head: '<link rel="stylesheet" href="/late.css">' }],
      { '/late.css': 'body{color:#14181d}' },
    );
    assert.notEqual(blocked.exitCode, 0, `a reading route may not wait on a subresource\n${blocked.output}`);
    assert.ok(blocked.output.includes('render-blocking'), `the refusal must say what it found\n${blocked.output}`);
    assert.ok(blocked.output.includes('/late.css'), `the refusal must name the subresource\n${blocked.output}`);

    const island = await measure(
      [
        { path: 'index.html' },
        { path: 'spots/playa-venao/reportar.html', head: '<script src="/report.js" defer></script>' },
      ],
      { '/report.js': 'export const ok = 1;' },
    );
    assert.equal(island.exitCode, 0, `a deferred island on a report route is the declared design\n${island.output}`);
  });
});
