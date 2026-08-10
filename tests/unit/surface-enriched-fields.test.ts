// WHY-NEW-FILE: tests/unit/surface-enriched-fields.test.ts
//   CLOSEST-EXISTING: tests/unit/run-build-cli.test.ts
//   EXTENSION-COST: that file owns the CLI's composition root and its argument
//     contract. This one owns a wire-shape invariant of the published artifact,
//     which has a different lifecycle: the CLI's arguments can change without
//     touching what a reading route may render, and vice versa.
//   PARALLEL-RATIONALE: different concern and different failure meaning. A
//     failure here says the reading surface stopped carrying something a page
//     needs; a failure there says the build cannot be invoked.
//
// The invariant of adr-enriched-fields-reach-the-reading-surface.md.
//
// Three features stopped at this seam on 2026-08-09 rather than invent a wire:
// f-see-what-killed-it needs `weakest_link`, f-know-how-much-to-trust-it needs
// the confidence reason's real terms, f-show-our-track-record needs
// `spot_detail`. All three are computed. None of them reached
// `data/published-surface.json`, which is the file every page reads through
// `src/data/forecast.ts`.
//
// The root cause was one computation with two projections that had silently
// drifted: `daySummary()` kept `weakest_link`, `surfaceCall()` did not. This
// test pins the two projections together at the production entry point, so a
// field added to one and forgotten in the other fails here rather than
// rendering `undefined` on twenty spot pages.
//
// It drives `runProductionBuild`, the real composition root, over the real
// committed predictions. Nothing is faked: if the pipeline cannot publish, this
// test says so rather than asserting against a fixture that proves nothing.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it } from 'vitest';

import { runProductionBuild } from '../../src/pipeline/run-build-cli';

/** The instant the committed prediction snapshot was captured for. */
const CAPTURED_AT = '2026-08-09T11:22:00Z';

function buildOnce(): { readonly publish_surface: any; readonly days: any } {
  const workDir = mkdtempSync(join(tmpdir(), 'surface-enriched-'));
  return {
    get publish_surface() { throw new Error('use built()'); },
    get days() { throw new Error('use built()'); },
    ...({} as never),
    workDir,
  } as never;
}

async function built() {
  const workDir = mkdtempSync(join(tmpdir(), 'surface-enriched-'));
  const { bundlePath } = await runProductionBuild([
    '--at', CAPTURED_AT,
    '--work-dir', workDir,
  ]);
  return JSON.parse(readFileSync(bundlePath, 'utf8'));
}

describe('the reading surface carries what a reading route may render', () => {
  it('promotes weakest_link onto every published call, not only onto the bundle', async () => {
    const bundle = await built();
    const surfaceRows = bundle.publish_surface.days.flatMap((day: any) => day.spots);
    assert.ok(surfaceRows.length > 0, 'the build published no rows at all, so nothing below is meaningful');

    const missing = surfaceRows.filter((row: any) => !('weakest_link' in row));
    assert.deepEqual(
      missing.map((row: any) => row.spot_id),
      [],
      'weakest_link is computed and kept by daySummary but dropped by surfaceCall, so f-see-what-killed-it has nothing to render. One computation, two projections, and they must not drift.',
    );
  });

  it('promotes the confidence reason terms, not a pre-rendered sentence', async () => {
    const bundle = await built();
    const surfaceRows = bundle.publish_surface.days.flatMap((day: any) => day.spots);

    const missing = surfaceRows.filter((row: any) => !('confidence_reason' in row));
    assert.deepEqual(
      missing.map((row: any) => row.spot_id),
      [],
      'the reason terms (dominant, spread_terms, track_state) must reach the surface so the Spanish is composed at render time. Publishing a finished sentence would freeze wording into the artifact and put the 160-character bound in the wrong place.',
    );

    for (const row of surfaceRows) {
      assert.equal(
        typeof row.confidence_reason.dominant, 'string',
        `${row.spot_id} carries no dominant term, so a renderer cannot say WHY confidence is what it is`,
      );
      assert.ok(
        typeof row.confidence_reason.spread_terms?.height === 'number',
        `${row.spot_id} carries no spread terms`,
      );
    }
  });

  it('carries spot_detail on the surface, so a page never has to read the bundle', async () => {
    const bundle = await built();
    assert.ok(
      bundle.publish_surface.spot_detail !== undefined,
      'f-show-our-track-record needs spot_detail on the surface. The bundle has it, but the bundle is written to S3 and never committed, so a page reading it would break reproducible builds.',
    );
  });

  it('keeps the two projections of one computation in step', async () => {
    const bundle = await built();
    // daySummary and surfaceCall both project the same CallRow. Any field on
    // the richer projection that a reading route may render belongs on both.
    const bundleRow = bundle.days[0].spots[0];
    const surfaceRow = bundle.publish_surface.days[0].spots[0];
    assert.equal(bundleRow.spot_id, surfaceRow.spot_id, 'the two projections disagree about ranking order');
    assert.equal(
      bundleRow.weakest_link ?? null,
      surfaceRow.weakest_link ?? null,
      'the same spot has a different weakest link depending on which projection you read',
    );
  });
});
