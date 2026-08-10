// WHY-NEW-FILE: tests/unit/weakest-link-vocab.test.ts
//   CLOSEST-EXISTING: tests/unit/report-vocab.test.ts
//   EXTENSION-COST: that file owns the *capture form's* enum tokens under
//     src/data, which are a wire contract: frozen by the write path, never
//     rendered, never translated. This one owns *rendered Spanish nouns* for
//     the published forecast surface, which are copy and can change on a copy
//     review. Sharing one file would put a module that may never reach the
//     forecast layer (leak path L1, application-architecture.md section 9) and
//     a module that exists only for that layer behind one name.
//   PARALLEL-RATIONALE: different concern (displayed wording vs stored token)
//     and a different lifecycle, and this file additionally guards a *move*
//     (import-freedom) that report-vocab.ts does not owe.
//
// The four scoring factors said in Spanish, once, in a module that can be
// moved into the shared data lane later without a refactor.
//
// Driving port: `factorWord()` in src/publish/factor-vocab.ts. Every behaviour
// below is asserted through that function or over the module's own source
// text; nothing here reaches into private state.
//
// Two of these tests read files rather than call functions, and both are the
// stated criterion rather than an AST-shape habit:
//   - import-freedom is the whole reason the module lives in src/publish today
//     instead of src/data, and no runtime call can observe it;
//   - the single-source scan is what stops step 01-05 from typing "la marea"
//     straight into a component instead of taking the noun from here.
// The scan is scoped to src/publish/** because that is this module's lane;
// src/components and src/pipeline already say "viento" and "tamaño" about
// wind_state and size_band, which are different words about different things
// and outside this step's boundary.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import type { Factor } from '../../src/scoring/engine';
import {
  FACTOR_TOKENS,
  factorWord,
  type FactorToken,
} from '../../src/publish/factor-vocab';

const PUBLISH_DIR = fileURLToPath(new URL('../../src/publish', import.meta.url));
const VOCAB_FILE = join(PUBLISH_DIR, 'factor-vocab.ts');

/** Exactly the shapes the acceptance suite's copy gate uses, so this test
 *  fails first and locally instead of at the end of a browser sweep.
 *  (tests/acceptance/f-see-what-killed-it/steps/weakest-link-callout.steps.ts) */
const CODE_LEAK = /\b(?:dir|size|wind|tide|weakest[_ -]?link|null|undefined|NaN|true|false|the|today|tomorrow)\b/i;
const EM_DASH = /[—]|--/;
const DATA_PUNCTUATION = /[{}[\]"]/;

const anyToken = fc.constantFrom<FactorToken>(...FACTOR_TOKENS);

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : [full];
  });
}

describe('the Spanish factor vocabulary', () => {
  it('resolves every factor token to a clean Spanish word', () => {
    fc.assert(
      fc.property(anyToken, (token) => {
        const { article, noun } = factorWord(token);
        const phrase = `${article} ${noun}`;

        assert.ok(noun.trim().length > 0, `${token} resolves to an empty Spanish word`);
        assert.ok(!CODE_LEAK.test(phrase), `${token} says "${phrase}", which leaks an engine token or English`);
        assert.ok(!EM_DASH.test(phrase), `${token} says "${phrase}", which uses a long dash`);
        assert.ok(!DATA_PUNCTUATION.test(phrase), `${token} says "${phrase}", which leaks data punctuation`);
      }),
    );
  });

  it('gives each factor its own word, so no two factors are named the same', () => {
    fc.assert(
      fc.property(anyToken, anyToken, (left, right) => {
        const sameWord = factorWord(left).noun === factorWord(right).noun;
        assert.equal(
          sameWord,
          left === right,
          `${left} and ${right} both resolve to "${factorWord(left).noun}"`,
        );
      }),
    );
  });

  it('carries exactly the factors the scoring engine scores', () => {
    // Held equal by hand rather than by an import: the module under test must
    // not depend on src/scoring, so the agreement is asserted here, at the
    // publish boundary. The two records make drift a typecheck failure as
    // well; the deepEqual makes it a test failure, which is the faster signal.
    const engineToVocab: Readonly<Record<Factor, FactorToken>> = {
      dir: 'dir',
      size: 'size',
      wind: 'wind',
      tide: 'tide',
    };
    const vocabToEngine: Readonly<Record<FactorToken, Factor>> = {
      dir: 'dir',
      size: 'size',
      wind: 'wind',
      tide: 'tide',
    };

    assert.deepEqual([...FACTOR_TOKENS].sort(), Object.keys(engineToVocab).sort());
    assert.deepEqual([...FACTOR_TOKENS].sort(), Object.keys(vocabToEngine).sort());
  });

  it('imports nothing, so moving it into the shared data lane stays a file move', () => {
    const source = readFileSync(VOCAB_FILE, 'utf8');
    const edges = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .filter((line) => /(^|\s)import\s|\brequire\s*\(|\bfrom\s+['"]/.test(line));

    assert.deepEqual(edges, [], `factor-vocab.ts has grown ${edges.length} import(s): ${edges.join(' | ')}`);
  });

  it('is the only place in the publish lane that says these words in Spanish', () => {
    const nouns = FACTOR_TOKENS.map((token) => factorWord(token).noun).filter((noun) => noun.length > 0);
    const duplicates = sourceFiles(PUBLISH_DIR)
      .filter((file) => file !== VOCAB_FILE && ['.ts', '.astro'].includes(extname(file)))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return nouns.filter((noun) => text.includes(noun)).map((noun) => `${file} says "${noun}"`);
      });

    assert.deepEqual(duplicates, [], `a second copy of the factor vocabulary exists: ${duplicates.join('; ')}`);
  });
});
