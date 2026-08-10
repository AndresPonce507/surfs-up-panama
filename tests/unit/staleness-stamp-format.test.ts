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
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it } from 'vitest';

const PROJECT_ROOT = process.cwd();

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;
const PANAMA_CLOCK_STAMP = /Actualizado (?:[0-9]|1[0-2]):[0-5][0-9] (?:a\.m\.|p\.m\.)/;

function readBuiltPage(relativePath: string): string {
  return readFileSync(resolve(PROJECT_ROOT, 'dist', relativePath), 'utf8');
}

describe('the staleness stamp on a built page', () => {
  it('never prints a machine ISO timestamp to a surfer, and always prints the settled Panama-local clock form', () => {
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(
      build.status,
      0,
      `the production build must succeed before its emitted HTML can be an oracle:\n${build.stdout}\n${build.stderr}`,
    );

    const pages: Readonly<Record<string, string>> = {
      home: readBuiltPage('index.html'),
      tomorrow: readBuiltPage('manana.html'),
      'a spot page': readBuiltPage('spots/playa-venao.html'),
    };

    for (const [name, html] of Object.entries(pages)) {
      assert.doesNotMatch(
        html,
        ISO_TIMESTAMP,
        `${name} must never print a machine timestamp: technical text on the Spanish surface is forbidden outright. Found ${JSON.stringify(html.match(ISO_TIMESTAMP)?.[0])}.`,
      );
      assert.match(
        html,
        PANAMA_CLOCK_STAMP,
        `${name} must print the settled "Actualizado H:MM a.m./p.m." local-clock form (application-architecture.md section 10), baked in at build time so it stays true with JavaScript off (section 12).`,
      );
    }
  }, 60_000);
});
