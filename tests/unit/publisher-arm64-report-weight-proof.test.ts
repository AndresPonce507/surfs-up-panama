// The ARM64 Publisher smoke is the only place that can prove these bytes: it
// owns the real renderer process. This contract test keeps the evidence from
// quietly drifting back to a host-side gzip or a copied fixture.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'vitest';

import {
  assertReportPageGzipEvidence,
  measurePublishedReportPages,
} from '../../scripts/smoke-publish-lambda-arm64.mjs';
import { REPORT_DOCUMENT_GZIP_BUDGETS } from '../../scripts/page-weight-core.mjs';

const smokeScript = fileURLToPath(new URL('../../scripts/smoke-publish-lambda-arm64.mjs', import.meta.url));

describe('Publisher ARM64 report-page weight proof', () => {
  it('records every report page from the renderer upload bodies using the declared ceilings', () => {
    const source = readFileSync(smokeScript, 'utf8');

    assert.match(source, /import\s*\{\s*gzipSync\s*\}\s*from\s*'node:zlib'/, 'the ARM64 runtime, not the host, must gzip the uploaded renderer bytes');
    assert.match(source, /REPORT_DOCUMENT_GZIP_BUDGETS/, 'the smoke must consume the page-weight gate\'s report ceilings, not copy 6 KiB and 4 KiB');
    assert.match(source, /objects\.get\(key\)/, 'the measurement must start from the real Publisher upload body');
    assert.match(source, /gzipSync\(body\)\.length/, 'each upload body must be measured by the ARM64 runtime');
    assert.match(source, /report_page_gzip/, 'successful in-runtime evidence must contain machine-readable report-page measurements');
    assert.match(source, /reportar/, 'reportar must be required');
    assert.match(source, /reportado/, 'reportado must be required');
    assert.match(source, /exceeds its .*ceiling|over its .*ceiling/, 'an over-budget report page must refuse the smoke');
  });

  it('records canonical renderer uploads per spot and rejects missing or over-budget report pages', () => {
    const cleanUploads = new Map([
      ['spots/playa-venao.html', Buffer.from('<html>spot</html>')],
      ['spots/playa-venao/reportar.html', Buffer.from('<html>reportar</html>')],
      ['spots/playa-venao/reportado.html', Buffer.from('<html>reportado</html>')],
    ]);
    const measurements = measurePublishedReportPages(cleanUploads, ['playa-venao']);

    assert.deepEqual(measurements.map(({ route }) => route), [
      '/spots/playa-venao/reportar',
      '/spots/playa-venao/reportado',
    ]);
    assert.deepEqual(
      measurements.map(({ ceiling_bytes }) => ceiling_bytes),
      [REPORT_DOCUMENT_GZIP_BUDGETS.reportar.bytes, REPORT_DOCUMENT_GZIP_BUDGETS.reportado.bytes],
      'the smoke must use the page-weight gate ceilings',
    );
    assert.doesNotThrow(() => assertReportPageGzipEvidence({
      report_route_count: measurements.length,
      report_page_gzip: measurements,
    }));

    const missingReportado = new Map(cleanUploads);
    missingReportado.delete('spots/playa-venao/reportado.html');
    assert.throws(
      () => measurePublishedReportPages(missingReportado, ['playa-venao']),
      /evidence is incomplete/,
      'an emitted spot without both report pages must refuse the ARM64 smoke',
    );

    const oversizedReportar = new Map(cleanUploads);
    oversizedReportar.set('spots/playa-venao/reportar.html', randomBytes(REPORT_DOCUMENT_GZIP_BUDGETS.reportar.bytes + 1));
    assert.throws(
      () => measurePublishedReportPages(oversizedReportar, ['playa-venao']),
      /over its .*ceiling/,
      'a report page over its declared document ceiling must refuse the ARM64 smoke',
    );

    assert.throws(
      () => measurePublishedReportPages(cleanUploads, ['playa-venao', 'playa-ausente']),
      /spots\/playa-ausente\.html is absent/,
      'a current render-input spot without its report route family must refuse the ARM64 smoke',
    );
  });

  it('rejects an evidence payload that omits one report route for a measured spot', () => {
    assert.throws(
      () => assertReportPageGzipEvidence({
        report_route_count: 1,
        report_page_gzip: [{
          route: '/spots/playa-venao/reportar',
          object_key: 'spots/playa-venao/reportar.html',
          gzip_bytes: 100,
          ceiling_bytes: REPORT_DOCUMENT_GZIP_BUDGETS.reportar.bytes,
          ceiling_label: REPORT_DOCUMENT_GZIP_BUDGETS.reportar.label,
          margin_bytes: REPORT_DOCUMENT_GZIP_BUDGETS.reportar.bytes - 100,
        }],
      }),
      /omits \/spots\/playa-venao\/reportado/,
    );
  });
});
