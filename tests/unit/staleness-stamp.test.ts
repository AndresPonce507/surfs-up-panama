// The staleness age upgrade reads the document's own publish moment. This
// checks the emitted reading documents, not Astro source shape, so it proves
// the machine attribute and the human stamp travel together to a phone.
//
// Still a real `npm run build`; since 2026-08-12 it is the run's single shared
// one (tests/common/built-site.ts) rather than one of four concurrent builds
// racing on the shared vite dependency cache.

import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { builtDocument, builtSite } from '../common/built-site';
import { forecast } from '../../src/data/forecast';
import { formatPanamaTime } from '../../src/publish/reading-state';

function stampFrom(html: string): { publishedAt: string; visible: string } | null {
  const match = /<time datetime="([^"]+)">Actualizado ([^<]+)<\/time>/.exec(html);
  return match === null ? null : { publishedAt: match[1]!, visible: match[2]! };
}

describe('the publish stamp carried by reading documents', () => {
  it('keeps one source instant and one Panama-local clock across every reading surface kind', () => {
    const built = builtSite();
    assert.equal(built.status, 0, `the reading documents need a production build:\n${built.stdout}\n${built.stderr}`);

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
  });
});
