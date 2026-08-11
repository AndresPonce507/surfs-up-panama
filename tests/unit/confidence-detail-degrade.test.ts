// Step 01-08: a row published without a reason must show its confidence word
// and stay quiet -- no disclosure body at all, never an empty one.
//
// Oracle: a real Astro build of ConfidenceDetail.astro, isolated in a tmp
// project copy with its own synthetic page (this lane may not add a page
// under the real src/pages/, and no production page mounts this component
// yet -- that cross-lane wiring is serialized behind other steps). A unit
// test asserting against the .astro source text would be the banned
// AST-shape pattern; this reads the compiled HTML instead, the same oracle
// the acceptance suite reads, just without the browser or the full site.
//
// Two degrade shapes, both required by application-architecture.md section 7:
//   - reason absent (the prop never passed): level remains, with no disclosure.
//   - reason "" (present but empty): exactly the same, never a box a surfer
//     taps expecting an explanation and finds blank.
// A third case (a real reason) proves the fix does not also swallow content.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const CASE_BOUNDARY = /<hr[^>]*data-sep="case-boundary"[^>]*>/g;

const REAL_REASON = 'Hoy no tenemos el dato de la marea, así que el nivel no sube de media.';

/**
 * Step 01-10 boundary exception, recorded loudly rather than done quietly:
 * this file is not in step 01-10's files_to_modify, but 01-10 adds a
 * non-colour shape indicator span inside <summary> (09-design-system.md
 * section 9's confidence-indicator recipe), which is required to sit inside
 * <summary> so the acceptance oracle's `summary.innerText()` sees it. That
 * necessarily changes every compiled <summary> element's markup, so the
 * exact-literal `/<summary>Confianza baja<\/summary>/` this file used before
 * 01-10 fails on ANY summary content -- not on a behaviour regression. The
 * behavioural contract these three assertions guard, per their own failure
 * message, is "the level word must always render" -- not "the summary's
 * total markup is frozen forever". This pattern preserves that contract
 * (still requires "Confianza baja" as the summary's own leading text, still
 * fails if the word were removed, renamed or moved) while tolerating
 * additional trailing content inside the same <summary>, such as 01-10's
 * shape span. It does not touch `nonSummaryContent(...)`, which is the
 * assertion that actually enforces this file's degrade contract (no
 * non-summary child rendered) and is unaffected by 01-10's change because
 * the shape span lives inside <summary>, before `</summary>`.
 */
const SUMMARY_OPENS_WITH_LEVEL_WORD = /<summary>Confianza baja[\s\S]*<\/summary>/;
const QUIET_LEVEL_WITH_SHAPE = /Confianza baja[\s\S]*●○○/;

function buildIsolatedHarness(): { outDir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-confidence-detail-'));
  const outDir = mkdtempSync(join(tmpdir(), 'surfs-up-confidence-detail-out-'));

  // Minimal static config: no page-weight integration, no `site` -- this
  // harness builds one synthetic page to read compiled HTML, not the product.
  writeFileSync(
    join(root, 'astro.config.mjs'),
    "import { defineConfig } from 'astro/config';\nexport default defineConfig({ output: 'static' });\n",
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'confidence-detail-harness', type: 'module', private: true }));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ extends: 'astro/tsconfigs/strictest' }));

  mkdirSync(join(root, 'src/components'), { recursive: true });
  mkdirSync(join(root, 'src/scoring'), { recursive: true });
  mkdirSync(join(root, 'src/pages'), { recursive: true });

  // The component under test, unmodified, plus its one runtime dependency
  // (confidence.ts, type-only-importing engine.ts). Copying the real files
  // rather than hand-writing fixtures means this harness exercises exactly
  // what ships.
  cpSync(join(PROJECT_ROOT, 'src/components/ConfidenceDetail.astro'), join(root, 'src/components/ConfidenceDetail.astro'));
  cpSync(join(PROJECT_ROOT, 'src/scoring/confidence.ts'), join(root, 'src/scoring/confidence.ts'));
  cpSync(join(PROJECT_ROOT, 'src/scoring/engine.ts'), join(root, 'src/scoring/engine.ts'));

  // Three cases, in order, separated by an unambiguous marker so the test can
  // split the compiled HTML back into per-case chunks without an HTML parser.
  writeFileSync(
    join(root, 'src/pages/index.astro'),
    [
      '---',
      "import ConfidenceDetail from '../components/ConfidenceDetail.astro';",
      '---',
      '<!doctype html><html><body>',
      '<ConfidenceDetail level="low" />',
      '<hr data-sep="case-boundary">',
      '<ConfidenceDetail level="low" reason="" />',
      '<hr data-sep="case-boundary">',
      `<ConfidenceDetail level="low" reason="${REAL_REASON}" />`,
      '</body></html>',
      '',
    ].join('\n'),
  );

  // Reuse the installed dependency tree; nothing is installed or downloaded.
  symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(root, 'node_modules'), 'dir');

  const build = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(
    build.status,
    0,
    `the isolated harness build must succeed before its emitted HTML can be an oracle:\n${build.stdout}\n${build.stderr}`,
  );

  return { outDir, root };
}

let harness: { outDir: string; root: string } | undefined;
let cases: string[] | undefined;

function harnessCases(): string[] {
  if (cases) return cases;
  harness = buildIsolatedHarness();
  const html = readFileSync(join(harness.outDir, 'index.html'), 'utf8');
  cases = html.split(CASE_BOUNDARY);
  assert.equal(cases.length, 3, `expected 3 cases separated by the boundary marker, found ${cases.length}: ${html}`);
  return cases;
}

function detailsBlock(caseHtml: string): string {
  const match = /<details[\s\S]*?<\/details>/.exec(caseHtml);
  assert.ok(match, `no <details class="confidence"> block found in: ${caseHtml}`);
  return match[0];
}

/**
 * Everything after `</summary>` and before `</details>`, trimmed. Structural
 * rather than tag-specific on purpose: the criterion is "no non-summary child
 * at all" and "the reason as the single non-summary child", not "no `<div>`
 * tag". A degrade that swapped `<div>` for `<p>`, or padded an absent reason
 * with a stray space or `&nbsp;`, must still fail here.
 */
function nonSummaryContent(block: string): string {
  const match = /<\/summary>([\s\S]*)<\/details>$/.exec(block);
  assert.ok(match, `no content found after </summary> in: ${block}`);
  return match[1]!.trim();
}

function assertQuietLevel(caseHtml: string): void {
  assert.match(caseHtml, QUIET_LEVEL_WITH_SHAPE, `the level word and shape must remain visible: ${caseHtml}`);
  assert.doesNotMatch(caseHtml, /<details\b/, `no reason was published, so nothing may be offered to open: ${caseHtml}`);
}

afterAll(() => {
  if (harness) {
    rmSync(harness.outDir, { recursive: true, force: true });
    rmSync(harness.root, { recursive: true, force: true });
  }
});

describe('ConfidenceDetail degrades a reasonless row without an empty box', () => {
  it('shows the level word and shape without a disclosure when reason is absent', () => {
    assertQuietLevel(harnessCases()[0]!);
  });

  it('shows the level word and shape without a disclosure when reason is empty', () => {
    assertQuietLevel(harnessCases()[1]!);
  });

  it('shows the level word and the published reason verbatim when a reason exists', () => {
    const block = detailsBlock(harnessCases()[2]!);
    assert.match(block, SUMMARY_OPENS_WITH_LEVEL_WORD, `the level word must always render: ${block}`);
    assert.equal(
      nonSummaryContent(block),
      `<div>${REAL_REASON}</div>`,
      `the published reason must render verbatim as the single non-summary child, nothing added or trimmed: ${block}`,
    );
  });
}, 60_000);
