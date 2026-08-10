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
});
