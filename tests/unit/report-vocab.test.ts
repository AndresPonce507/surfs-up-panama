// WHY-NEW-FILE: tests/unit/report-vocab.test.ts
//   CLOSEST-EXISTING: tests/unit/confidence-reason-copy.test.ts
//   EXTENSION-COST: that file owns the honesty of *published forecast* copy
//     and imports src/scoring/confidence. This one owns the *report capture*
//     vocabulary, which is forecast-free by construction (leak path L1,
//     application-architecture.md section 9). Putting them behind one name
//     would put a module that may reach the forecast layer and a module that
//     may never reach it in the same file.
//   PARALLEL-RATIONALE: different concern (wire-contract enum tokens, not
//     rendered wording) and a different lifecycle — these tokens are frozen
//     by the write-path contract and cannot change on a copy review, which is
//     exactly the opposite of the confidence reason strings.
//
// The canonical wind and quality enum tokens (f-tell-us-what-you-saw-cold
// Pre-requisite 1, decided by Andres 2026-08-09).
//
// Why this is load-bearing rather than tidy-up: domain-model.md section 7.4
// replays a queued report byte-identical, so whatever token the capture form
// writes into IndexedDB today is the token that gets POSTed the day the
// endpoint exists. A `wind-placeholder-2` committed now is a schema-invalid
// POST later, and the record cannot be repaired because no edit command
// exists on the SurfReport aggregate (domain-model.md section 10).
//
// Wind was never actually an open question: `bumpy` appears in zero lines of
// code, `WindState` has shipped as clean|choppy|blown_out, and the live
// surface carries 28 clean / 27 choppy / 5 blown_out across 60 rows.
// 05-scoring-engine.md section 7 is the stale side and is corrected with this
// commit. Quality had no code vote anywhere; bad|ok|good|epic is the decided
// canon, matching 06-learning-layer.md's Bad/OK/Good/Epic q_obs anchors.
//
// Driving port: `src/i18n/strings.ts`, the module the capture form actually
// reads its option values from, plus a filesystem scan of `src/` for the
// scaffold placeholder shape. Both assert behaviour, not wiring.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'vitest';

import {
  QUALITY_TOKENS,
  WIND_STATE_TOKENS,
  type QualityToken,
  type WindStateToken,
} from '../../src/data/report-vocab';
import { locales, strings } from '../../src/i18n/strings';

const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));

/** The scaffold shape the placeholders took, so the scan cannot pass by luck. */
const PLACEHOLDER_PATTERN = /(wind|quality|band)-placeholder-\d+/g;

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : [full];
  });
}

describe('canonical report vocabulary', () => {
  it('fixes the wind tokens at the three the published surface already ships', () => {
    // Ordering is the form's display order (Limpio, Picado, Destrozado) and
    // also the scoring engine's descending-quality order, so one array serves
    // the capture form and the windWord thresholds without a second mapping.
    assert.deepEqual(
      [...WIND_STATE_TOKENS],
      ['clean', 'choppy', 'blown_out'],
      'The wire contract, the published surface and the capture form must name wind with the same three tokens.',
    );
  });

  it('fixes the quality tokens at the four the learning layer anchors', () => {
    assert.deepEqual(
      [...QUALITY_TOKENS],
      ['bad', 'ok', 'good', 'epic'],
      "06-learning-layer.md section 6 anchors q_obs at Bad 20, OK 45, Good 70, Epic 90; the token spelling is the lowercased label so the anchor table has exactly one reading.",
    );
  });

  it('emits the canonical token as every wind option value, in both languages', () => {
    for (const locale of locales) {
      const values = strings[locale].report.windOptions.map((option) => option.value);
      assert.deepEqual(
        values,
        [...WIND_STATE_TOKENS],
        `The ${locale} capture form must submit canonical wind tokens; a queued report replays byte-identical and cannot be repaired.`,
      );
    }
  });

  it('emits the canonical token as every quality option value, in both languages', () => {
    for (const locale of locales) {
      const values = strings[locale].report.qualityOptions.map((option) => option.value);
      assert.deepEqual(
        values,
        [...QUALITY_TOKENS],
        `The ${locale} capture form must submit canonical quality tokens; a queued report replays byte-identical and cannot be repaired.`,
      );
    }
  });

  it('keeps the settled Spanish and English labels untouched by the token change', () => {
    // The decision changed token spellings only. If a label moved with it,
    // the form is no longer the copy that section 10 settled.
    assert.deepEqual(
      strings.es.report.windOptions.map((option) => option.label),
      ['Limpio', 'Picado', 'Destrozado'],
    );
    assert.deepEqual(
      strings.es.report.qualityOptions.map((option) => option.label),
      ['Malo', 'Normal', 'Bueno', 'Épico'],
    );
    assert.deepEqual(
      strings.en.report.windOptions.map((option) => option.label),
      ['Clean', 'Choppy', 'Blown out'],
    );
    assert.deepEqual(
      strings.en.report.qualityOptions.map((option) => option.label),
      ['Bad', 'OK', 'Good', 'Epic'],
    );
  });

  it('leaves no scaffold placeholder token anywhere under src/', () => {
    const offenders = sourceFiles(SRC_DIR)
      .map((file) => ({ file, hits: readFileSync(file, 'utf8').match(PLACEHOLDER_PATTERN) ?? [] }))
      .filter((entry) => entry.hits.length > 0)
      .map((entry) => `${entry.file.slice(SRC_DIR.length + 1)}: ${entry.hits.join(', ')}`);

    assert.deepEqual(
      offenders,
      [],
      'A placeholder token left in src/ is a schema-invalid report the moment the endpoint exists.',
    );
  });

  it('types the tokens so a misspelling cannot compile', () => {
    // Compile-time assertions: these lines fail `npm run typecheck`, not this
    // runner, if the union drifts from the array.
    const wind: WindStateToken = 'blown_out';
    const quality: QualityToken = 'epic';
    assert.ok(WIND_STATE_TOKENS.includes(wind));
    assert.ok(QUALITY_TOKENS.includes(quality));
  });
});
