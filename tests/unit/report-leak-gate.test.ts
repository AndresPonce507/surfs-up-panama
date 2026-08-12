import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import fc from 'fast-check';
import { afterEach, describe, it } from 'vitest';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const gateScript = resolve(repositoryRoot, 'scripts/check-report-leak.mjs');
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

async function productionGate() {
  try {
    return await import(pathToFileURL(gateScript).href);
  } catch (error) {
    assert.fail(`WHAT: the report leak gate cannot load. HOW: add ${gateScript}. ${String(error)}`);
  }
}

describe('report leak marker detector', () => {
  it('recognizes every live forecast marker in arbitrary surrounding text, never the observed size band', async () => {
    const gate = await productionGate();
    const markers = gate.FORECAST_MARKERS as readonly string[];
    const detectMarkers = gate.detectForecastMarkers as (text: string) => readonly string[];

    assert.deepEqual(markers, [
      'score_q', 'size_range_m', 'wind_state', 'conf_level', 'confidence_reason',
      'weakest_link', 'best_window', 'predicted', 'data-forecast',
    ]);
    assert.ok(!markers.includes('size_band'));
    fc.assert(
      fc.property(fc.constantFrom(...markers), fc.string(), fc.string(), (marker, before, after) => {
        assert.ok(detectMarkers(`${before}${marker}${after}`).includes(marker));
        assert.ok(!detectMarkers(`${before}size_band${after}`).includes('size_band'));
      }),
    );
  });
});

describe('report leak import boundary', () => {
  it('finds a transitive report-flow reach into the forbidden publish, pipeline, or forecast domains', async () => {
    const gate = await productionGate();
    const sourceRoot = temporaryRoot('report-leak-source-');
    const reportPage = join(sourceRoot, 'pages/spots/[slug]/reportar.astro');
    const bridge = join(sourceRoot, 'components/report-bridge.ts');
    const forbidden = join(sourceRoot, 'pipeline/build.ts');
    mkdirSync(resolve(reportPage, '..'), { recursive: true });
    mkdirSync(resolve(bridge, '..'), { recursive: true });
    mkdirSync(resolve(forbidden, '..'), { recursive: true });
    writeFileSync(reportPage, "import '../../../components/report-bridge';", 'utf8');
    writeFileSync(bridge, "import '../pipeline/build';", 'utf8');
    writeFileSync(forbidden, 'export const forbidden = true;', 'utf8');

    const findings = gate.findForbiddenReportImports(sourceRoot) as readonly { entry: string; chain: readonly string[] }[];
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.entry, /reportar\.astro$/);
    assert.ok(findings[0]!.chain.some((path) => path.endsWith('pipeline/build.ts')));
  });

  // Rooted at the REAL shipped src/, not a synthetic universe, and that is the
  // whole point. The synthetic case above proves the gate can see a violation;
  // this one proves the tree does not have one. Until it existed the gate ran
  // only inside npm run ci:local, so a step could add a forbidden reach, keep
  // the whole vitest suite green, and find out at the gate. That happened here:
  // adding a type-only import of the correction file to the scoring engine
  // pulled the report pages transitively into pipeline/ports.ts, and the gate
  // does not distinguish a type-only import from a value one -- correctly, since
  // it reads source text rather than a build graph, and fails closed.
  it('finds no forbidden reach anywhere in the shipped source tree', async () => {
    const gate = await productionGate();

    const findings = gate.findForbiddenReportImports(
      resolve(repositoryRoot, 'src'),
    ) as readonly { entry: string; chain: readonly string[] }[];

    assert.deepEqual(
      findings.map((finding) => finding.chain.map((path) => path.split('/src/')[1] ?? path).join(' -> ')),
      [],
      'a report page reaches a forecast, publish or pipeline module through the chain above; keep the report flow on capture and observation modules only',
    );
  });
});
