// Slice-03 acceptance steps: C_spread participation as a per-factor enable
// flag that is DATA, not code. JIT DISTILL 2026-08-10.
//
// THE ACCEPTANCE CONTRACT THIS FILE FIXES (the field-name precedent of
// slice-01's red-classification): the factor enable flags live in the
// data-owned launch policy JSON (data/spots/pa-pacific-launch-v1.json) under
// the key `confidence_factors`, e.g. `{ "confidence_factors": { "spread":
// false } }`, and the pipeline consults them through the launchData.policyPath
// seam that BuildDeps/IngestDeps already carry, EVEN when spots are injected.
// 05 section 9 names "factor enable flags" as constants-file content; the
// launch policy is this repository's data-owned constants surface, and the
// policyPath seam is the only injectable data path the driving ports expose.
// If DELIVER houses the flag elsewhere, that is a contract renegotiation with
// DISTILL, not a silent move: these steps drive the seam recorded here.
//
// These scenarios plant a TEMP COPY of the real policy with the flag added.
// The human-owned policy file is never written.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';
import {
  assertBehavior,
  captureTrustPublished,
  CLAIMS_MODEL_DISAGREEMENT,
  NAMES_ANY_SPREAD_TERM,
  publishedRowsOrFinding,
  runMorning,
  SAYS_NO_USABLE_SIGNAL,
  TIGHT_MEMBERS,
} from './support/trust-observables';

const REAL_POLICY_PATH = resolve('data/spots/pa-pacific-launch-v1.json');

type PolicyWorld = PipelineWorld & { trustPolicyPath?: string };

function policyWorld(world: PipelineWorld): PolicyWorld {
  return world as PolicyWorld;
}

function plantPolicy(spreadEnabled: boolean): string {
  const policy = JSON.parse(readFileSync(REAL_POLICY_PATH, 'utf8')) as Record<string, unknown>;
  policy.confidence_factors = { spread: spreadEnabled };
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-trust-slice-03-policy-'));
  const path = join(root, 'pa-pacific-launch-v1.json');
  writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`);
  return path;
}

Given(
  'una mañana con el dato de la marea completo y los modelos pareciéndose entre ellos',
  function (this: PipelineWorld) {
    this.spots = [venaoSeed];
    this.source.members = TIGHT_MEMBERS;
    this.source.tideDark = false;
  },
);

Given('la política de datos llega con el término del desacuerdo apagado', function (this: PipelineWorld) {
  policyWorld(this).trustPolicyPath = plantPolicy(false);
});

Given('la política de datos llega con todos los factores prendidos', function (this: PipelineWorld) {
  policyWorld(this).trustPolicyPath = plantPolicy(true);
});

When('esa mañana se arma y se publica con esa política de datos', { timeout: 60_000 }, async function (this: PipelineWorld) {
  const policyPath = policyWorld(this).trustPolicyPath;
  assert.ok(policyPath, 'test fixture error: declare the data policy in a Given first');
  this.source.configureMorning('2026-08-08');
  await runMorning(this, {
    label: 'la mañana con política propia',
    date: '2026-08-08',
    source: this.source,
    spots: this.spots,
    launchData: { policyPath },
  });
  await captureTrustPublished(this);
});

Then('cada playa publicada sigue trayendo su palabra de confianza', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  for (const row of rows) {
    if (row.conf_level !== 'low' && row.conf_level !== 'medium' && row.conf_level !== 'high') {
      findings.push(`${row.where}: "${row.spot_id}" se publica sin palabra de confianza`);
    }
  }
  assertBehavior(
    findings,
    'apagar el término del desacuerdo re-proyecta el nivel desde los factores que quedan; la confianza siempre se muestra (decisión 7 reconciliada con investigación 09 sección 3.6), y una fila sin nivel es un fallo de publicación.',
  );
});

Then('ninguna razón nombra el término apagado', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  const reasons = rows.filter((row) => row.reason !== null);
  if (reasons.length === 0 && findings.length === 0) {
    findings.push(`ninguna de las ${rows.length} filas publicadas trae una razón que revisar`);
  }
  for (const row of reasons) {
    const reason = row.reason ?? '';
    if (NAMES_ANY_SPREAD_TERM.test(reason) || CLAIMS_MODEL_DISAGREEMENT.test(reason)) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" nombra el término del desacuerdo con el término apagado: "${reason}"`);
    }
  }
  assertBehavior(
    findings,
    'un factor que no participa no puede aparecer en la razón: el compositor consulta las banderas de la política antes de nombrar un término (cláusula de remoción de 05 sección 6.1).',
  );
});

Then('cada playa se publica con confianza baja', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  for (const row of rows) {
    if (row.conf_level !== 'low') {
      findings.push(`${row.where}: "${row.spot_id}" se publica con confianza "${row.conf_level ?? 'ninguna'}" cuando ningún factor informativo sobrevive`);
    }
  }
  assertBehavior(
    findings,
    'con el spread apagado, el historial sin verificar y ni un reporte, un producto vacío leería 1.0 y diría alta: certeza fabricada. La guardia de 05 sección 6.4 fuerza baja con dominant nulo.',
  );
});

Then('cada razón dice que todavía no hay una señal usable para medir la confianza', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  const reasons = rows.filter((row) => row.reason !== null);
  if (reasons.length === 0 && findings.length === 0) {
    findings.push(`ninguna de las ${rows.length} filas publicadas trae una razón que revisar`);
  }
  for (const row of reasons) {
    if (!SAYS_NO_USABLE_SIGNAL.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" no admite que no queda señal usable: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'cuando ningún factor informativo sobrevive la razón lo dice tal cual (05 sección 6.4): decir cualquier otra causa sería inventar una señal que no existe.',
  );
});
