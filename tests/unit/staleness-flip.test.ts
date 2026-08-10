// The age notice is an inline progressive enhancement, so this drives the
// emitted script against the document elements it actually consumes. It keeps
// the clock injected: no three-hour wall-clock wait belongs in a unit test.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

import { afterAll, describe, it } from 'vitest';

import { forecast } from '../../src/data/forecast';
import { formatPanamaTime } from '../../src/publish/reading-state';

const PROJECT_ROOT = process.cwd();
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'surfs-up-staleness-flip-'));
const ISOLATED_PROJECT = join(TEST_ROOT, 'project');
const OUT_DIR = join(ISOLATED_PROJECT, 'dist');
const THREE_HOURS = 3 * 60 * 60 * 1000;

type Notice = { hidden: boolean; textContent: string };

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

function renderedAgeScript(relativePath: string): string {
  const html = readFileSync(resolve(OUT_DIR, relativePath), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? '')
    .find((body) => body.includes('data-stale-notice'));
  assert.ok(script, `${relativePath} needs its inline age notice script in emitted HTML`);
  return script;
}

function renderAgeNotice(script: string, elapsedMs: number): Notice {
  const stamp = { dateTime: forecast.published_at };
  const notice: Notice = { hidden: true, textContent: '' };
  class PhoneClock extends Date {
    static override now(): number {
      return Date.parse(forecast.published_at) + elapsedMs;
    }
  }
  const document = {
    querySelector(selector: string): typeof stamp | Notice | null {
      if (selector === 'time[datetime]') return stamp;
      if (selector === '[data-stale-notice]') return notice;
      return null;
    },
  };
  vm.runInNewContext(script, { Date: PhoneClock, document });
  return notice;
}

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('the inline reading-document age notice', () => {
  it('keeps the notice hidden through exactly three hours, then reveals the shared Panama-clock truth', () => {
    copyProjectForBuild();
    const build = spawnSync('npm', ['run', 'build'], { cwd: ISOLATED_PROJECT, encoding: 'utf8' });
    assert.equal(build.status, 0, `the age notice needs a production build:\n${build.stdout}\n${build.stderr}`);

    const expected = `Viejo. Lo último que vimos fue a las ${formatPanamaTime(forecast.published_at)} No pudimos sacar datos nuevos esta mañana.`;
    for (const page of ['index.html', 'manana.html', 'spots/playa-venao.html']) {
      const script = renderedAgeScript(page);
      assert.deepEqual(
        renderAgeNotice(script, THREE_HOURS),
        { hidden: true, textContent: '' },
        `${page} must never call an exactly-three-hour forecast old`,
      );
      assert.deepEqual(
        renderAgeNotice(script, THREE_HOURS + 1),
        { hidden: false, textContent: expected },
        `${page} must show the settled Viejo line with the publish moment's Panama clock once old`,
      );
    }
  }, 60_000);
});
