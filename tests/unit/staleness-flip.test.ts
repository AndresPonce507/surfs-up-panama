// The age notice is an inline progressive enhancement, so this drives the
// emitted script against the document elements it actually consumes. It keeps
// the clock injected: no three-hour wall-clock wait belongs in a unit test.
//
// The emitted HTML still comes from a real `npm run build` -- that has not
// changed, and a fixture here would delete the only reason this test exists.
// What changed (2026-08-12) is that the build is the run's single shared one
// (tests/common/built-site.ts) instead of a fourth concurrent one racing three
// siblings on the shared vite dependency cache.

import assert from 'node:assert/strict';
import vm from 'node:vm';

import { describe, it } from 'vitest';

import { builtDocument, builtSite } from '../common/built-site';
import { forecast } from '../../src/data/forecast';
import { formatPanamaTime } from '../../src/publish/reading-state';

const THREE_HOURS = 3 * 60 * 60 * 1000;

type Notice = { hidden: boolean; textContent: string };

function renderedAgeScript(relativePath: string): string {
  const html = builtDocument(relativePath);
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

describe('the inline reading-document age notice', () => {
  it('keeps the notice hidden through exactly three hours, then reveals the shared Panama-clock truth', () => {
    const built = builtSite();
    assert.equal(built.status, 0, `the age notice needs a production build:\n${built.stdout}\n${built.stderr}`);

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
  });
});
