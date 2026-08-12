// Bug: RankedList.astro and SpotDetail.astro interpolate the raw
// forecast.published_at ISO string right after "Actualizado", so a surfer
// reads a machine timestamp instead of a local clock time. Settled copy is
// "Actualizado 6:04 a.m." (application-architecture.md section 10), and
// technical text on the Spanish surface is forbidden outright.
//
// The stamp also has to be true with JavaScript off and true for a
// service-worker-served stale copy, "because the stamp travels inside the
// document it describes" (application-architecture.md section 12). That
// rules out a client-side format: the string has to already be the local
// clock time in the emitted HTML.
//
// Oracle: the real production build's output. A unit test on a standalone
// formatting function cannot fail pre-fix -- before the fix there is no
// formatting function to call, the defect is the template interpolating the
// raw field directly. Reading the built HTML (no browser, no JS runtime) is
// also the literal "true with JS off" proof section 12 asks for.

import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { builtDocument, builtSite } from '../common/built-site';

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;
const PANAMA_CLOCK_STAMP = /Actualizado (?:[0-9]|1[0-2]):[0-5][0-9] (?:a\.m\.|p\.m\.)/;

/** Text a surfer can read. Machine metadata in element attributes is the
 * deliberate companion truth of the rendered plain-clock stamp. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

describe('the staleness stamp on a built page', () => {
  it('never prints a machine ISO timestamp to a surfer, and always prints the settled Panama-local clock form', () => {
    // This test never reads the shared `dist/`. Astro clears its output
    // directory at the start of a build, and the CI gate sends `test` and
    // `build` out in the same parallel wave, both against the same worktree.
    // Sharing `dist/` meant the two builds raced: one wiped the tree the other
    // was mid-write on, and the symptoms were ENOENT on `dist/index.html` here
    // and ERR_MODULE_NOT_FOUND on a `.prerender` chunk over in the ui job.
    // Neither is a product defect, and neither reproduces when a job runs
    // alone, which is what made it look like flake. The shared build keeps that
    // property -- it emits into its own throwaway directory -- and since
    // 2026-08-12 it also closes the second half of the same story: this file
    // was itself one of four concurrent `astro build` runs inside `npm test`,
    // colliding on the shared vite dependency cache (tests/common/built-site.ts
    // carries the reproduction). The page-weight gate runs inside `astro build`
    // against whatever directory it emitted (see astro.config.mjs), so it still
    // runs on this build.
    const built = builtSite();
    assert.equal(
      built.status,
      0,
      `the production build must succeed before its emitted HTML can be an oracle:\n${built.stdout}\n${built.stderr}`,
    );

    const pages: Readonly<Record<string, string>> = {
      home: builtDocument('index.html'),
      tomorrow: builtDocument('manana.html'),
      'a spot page': builtDocument('spots/playa-venao.html'),
    };

    for (const [name, html] of Object.entries(pages)) {
      // Falsification guard: this oracle must still fail if an ISO reaches
      // visible text. It must not confuse the required datetime metadata with
      // text a surfer sees.
      assert.match(visibleText(`<p>${forecastPublishedAt(html)}</p>`), ISO_TIMESTAMP);
      assert.doesNotMatch(
        visibleText(html),
        ISO_TIMESTAMP,
        `${name} must never print a machine timestamp: technical text on the Spanish surface is forbidden outright. Found ${JSON.stringify(visibleText(html).match(ISO_TIMESTAMP)?.[0])}.`,
      );
      assert.match(
        html,
        PANAMA_CLOCK_STAMP,
        `${name} must print the settled "Actualizado H:MM a.m./p.m." local-clock form (application-architecture.md section 10), baked in at build time so it stays true with JavaScript off (section 12).`,
      );
    }
  });
});

function forecastPublishedAt(html: string): string {
  const publishedAt = /<time datetime="([^"]+)"/.exec(html)?.[1];
  assert.ok(publishedAt, 'test bug: a reading document has no publish moment metadata to protect');
  return publishedAt;
}
