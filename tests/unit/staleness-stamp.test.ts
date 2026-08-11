// The staleness age upgrade reads the document's own publish moment. This
// checks the emitted reading documents, not Astro source shape, so it proves
// the machine attribute and the human stamp travel together to a phone.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, it } from 'vitest';

import { forecast } from '../../src/data/forecast';
import { formatPanamaTime } from '../../src/publish/reading-state';

const PROJECT_ROOT = process.cwd();
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'surfs-up-stamp-'));
const ISOLATED_PROJECT = join(TEST_ROOT, 'project');
const OUT_DIR = join(ISOLATED_PROJECT, 'dist');

function copyProjectForBuild(): void {
  mkdirSync(ISOLATED_PROJECT);

  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    copyFileSync(join(PROJECT_ROOT, name), join(ISOLATED_PROJECT, name));
  }

  for (const name of ['data', 'docs', 'public', 'scripts', 'src']) {
    cpSync(join(PROJECT_ROOT, name), join(ISOLATED_PROJECT, name), { recursive: true });
  }

  symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(ISOLATED_PROJECT, 'node_modules'), 'dir');
}

function builtDocument(relativePath: string): string {
  return readFileSync(resolve(OUT_DIR, relativePath), 'utf8');
}

function stampFrom(html: string): { publishedAt: string; visible: string } | null {
  const match = /<time datetime="([^"]+)">Actualizado ([^<]+)<\/time>/.exec(html);
  return match === null ? null : { publishedAt: match[1]!, visible: match[2]! };
}

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('the publish stamp carried by reading documents', () => {
  it('keeps one source instant and one Panama-local clock across every reading surface kind', () => {
    copyProjectForBuild();
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: ISOLATED_PROJECT,
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, `the reading documents need a production build:\n${build.stdout}\n${build.stderr}`);

    const expected = {
      publishedAt: forecast.published_at,
      visible: formatPanamaTime(forecast.published_at),
    };
    const pages: Readonly<Record<string, string>> = {
      home: builtDocument('index.html'),
      tomorrow: builtDocument('manana.html'),
      spot: builtDocument('spots/playa-venao.html'),
    };

    for (const [name, html] of Object.entries(pages)) {
      assert.deepEqual(
        stampFrom(html),
        expected,
        `${name} must carry the forecast publish moment in datetime while exposing only its settled plain clock`,
      );
    }
  }, 60_000);
});
