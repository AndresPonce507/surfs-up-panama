// Slice-04 acceptance steps: the second, independent wave source. JIT
// DISTILL 2026-08-10.
//
// THE ACCEPTANCE CONTRACTS THIS FILE FIXES (slice-01 red-classification
// precedent):
//   1. The source registry rides the ingest deps as `sources`, an ordered
//      list of `{ provider_id, source }` beside the legacy `source` (which
//      stays for compatibility until the registry lands). Today's pipeline
//      ignores `sources`; that gap is the RED of the first scenario.
//   2. The independent provider's raw archive prefix is
//      `raw/noaa-gfswave-grib2/`. The primary keeps `raw/open-meteo-marine/`.
//   3. The adapter module lives at src/pipeline/adapters/noaa-gfswave-grib2.ts
//      and exports `parseGfswaveGrib2(bytes: Uint8Array): MemberSeries[]`,
//      post-ACL domain language like every ForecastSource. Its captured real
//      fixture lives at fixtures/noaa-gfswave-grib2/ (DELIVER captures it,
//      step 04-05: the grib_filter URL is live-verified in HANDOFF section 6).
//
// The independent source serves the two NCEP members through a second,
// vendor-independent transport: same models, different vendor, which is the
// whole point (the premise must survive Open-Meteo, not add a fifth model).
// Both fakes sit at the external HTTP boundary; the registry walk, the raw
// archiving per provider, the natural-key dedupe and the honest member count
// are production behaviour under test.

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed, type MemberSpec } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';
import { FixtureSource } from '../../daily-call-with-permanent-receipts/steps/support/fakes';
import {
  assertBehavior,
  captureTrustPublished,
  publishedRowsOrFinding,
  runMorning,
  TIGHT_MEMBERS,
} from './support/trust-observables';

const INDEPENDENT_PROVIDER = 'noaa-gfswave-grib2';
const INDEPENDENT_RAW_PREFIX = `raw/${INDEPENDENT_PROVIDER}/`;
const PRIMARY_RAW_PREFIX = 'raw/open-meteo-marine/';
const MORNING_DATE = '2026-08-08';

/** The two NCEP members the independent transport carries. */
const INDEPENDENT_MEMBERS: readonly MemberSpec[] = TIGHT_MEMBERS.filter(
  (member) => member.source.startsWith('ncep_'),
);

type SecondSourceWorld = PipelineWorld & {
  independentSource?: FixtureSource;
  expectedMembersUsed?: number;
  adapterOutcome?: { members: unknown } | { failure: string };
};

function secondSourceWorld(world: PipelineWorld): SecondSourceWorld {
  return world as SecondSourceWorld;
}

function independentSource(world: PipelineWorld): FixtureSource {
  const source = secondSourceWorld(world).independentSource;
  assert.ok(source, 'test fixture error: declare the independent source in a Given first');
  return source;
}

async function dualSourceMorning(world: PipelineWorld): Promise<void> {
  const independent = independentSource(world);
  world.source.configureMorning(MORNING_DATE);
  independent.configureMorning(MORNING_DATE);
  await runMorning(world, {
    label: 'la mañana de las dos fuentes',
    date: MORNING_DATE,
    source: world.source,
    spots: world.spots,
    sources: [
      { provider_id: 'open-meteo-marine', source: world.source },
      { provider_id: INDEPENDENT_PROVIDER, source: independent },
    ],
  });
}

// ---------------------------------------------------------------------------
// Givens
// ---------------------------------------------------------------------------

function declareMorning(world: PipelineWorld, opts: { primaryDark: boolean; independentDark: boolean; expected: number }): void {
  world.spots = [venaoSeed];
  world.source.members = TIGHT_MEMBERS;
  world.source.tideDark = false;
  world.source.waveFailure = opts.primaryDark ? 'dark' : null;
  const independent = new FixtureSource();
  independent.members = INDEPENDENT_MEMBERS;
  independent.waveFailure = opts.independentDark ? 'dark' : null;
  const shared = secondSourceWorld(world);
  shared.independentSource = independent;
  shared.expectedMembersUsed = opts.expected;
}

Given('una mañana en que el vendor de siempre y la fuente independiente respondieron los dos', function (this: PipelineWorld) {
  declareMorning(this, { primaryDark: false, independentDark: false, expected: 4 });
});

Given('esa mañana ya se armó y se publicó con las dos fuentes declaradas', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await dualSourceMorning(this);
  this.takeSnapshot('la primera pasada', 'predictions/v1/');
});

Given('una mañana en que el vendor de siempre no respondió y la fuente independiente sí', function (this: PipelineWorld) {
  declareMorning(this, { primaryDark: true, independentDark: false, expected: 2 });
});

Given('una mañana en que la fuente independiente no respondió y el vendor de siempre sí', function (this: PipelineWorld) {
  declareMorning(this, { primaryDark: false, independentDark: true, expected: 4 });
});

Given('una mañana en que entre todas las fuentes respondió un solo modelo', function (this: PipelineWorld) {
  declareMorning(this, { primaryDark: false, independentDark: true, expected: 1 });
  for (const member of TIGHT_MEMBERS.slice(1)) this.source.dark.add(member.source);
});

// ---------------------------------------------------------------------------
// Whens
// ---------------------------------------------------------------------------

When('esa mañana se arma y se publica con las dos fuentes declaradas', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await dualSourceMorning(this);
  await captureTrustPublished(this);
});

When('esa misma mañana se vuelve a armar', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await dualSourceMorning(this);
  await captureTrustPublished(this);
});

// ---------------------------------------------------------------------------
// Thens
// ---------------------------------------------------------------------------

Then('el archivo en bruto de esa mañana guarda la respuesta de cada fuente tal cual llegó', async function (this: PipelineWorld) {
  const findings: string[] = [];
  const primaryKeys = await this.store.list(PRIMARY_RAW_PREFIX);
  const independentKeys = await this.store.list(INDEPENDENT_RAW_PREFIX);
  if (primaryKeys.length === 0) {
    findings.push(`el archivo en bruto no guarda nada del vendor de siempre bajo ${PRIMARY_RAW_PREFIX}${this.failureContext()}`);
  }
  if (independentKeys.length === 0) {
    findings.push(`el archivo en bruto no guarda nada de la fuente independiente bajo ${INDEPENDENT_RAW_PREFIX}: la mañana corrió como si esa fuente no existiera${this.failureContext()}`);
  }
  assertBehavior(
    findings,
    'cada fuente declarada en el registro se consulta y su respuesta cruda se archiva bajo su propio prefijo desde su primera hora desplegada; el registro no se puede rellenar hacia atrás (HANDOFF secciones 3 y 5).',
  );
});

Then(
  'el registro de predicciones trae las filas de esa mañana una sola vez, sin duplicar un modelo que llegó por dos caminos',
  async function (this: PipelineWorld) {
    const rows = await this.predictionRows();
    const findings: string[] = [];
    if (rows.length === 0) findings.push(`el registro de predicciones quedó vacío${this.failureContext()}`);
    const seen = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.spot_id}|${row.source}|${row.run_ts}|${row.valid_ts}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) findings.push(`la fila ${key} aparece ${count} veces: un modelo que llegó por dos caminos se archivó dos veces`);
    }
    assertBehavior(
      findings,
      'la llave natural (spot, fuente, corrida, hora) escribe una sola vez: el primer camino gana y el segundo es un duplicado verificado, nunca una segunda fila (semántica de PUT condicional del registro).',
    );
  },
);

Then('el registro de predicciones queda exactamente como la primera vez', function (this: PipelineWorld) {
  const before = this.getSnapshot('la primera pasada');
  const after = this.store.snapshot('predictions/v1/');
  const findings: string[] = [];
  for (const [key, body] of before) {
    const now = after.get(key);
    if (now === undefined) findings.push(`la repetición borró ${key}`);
    else if (now !== body) findings.push(`la repetición reescribió ${key}`);
  }
  for (const key of after.keys()) {
    if (!before.has(key)) findings.push(`la repetición inventó ${key} para una mañana que ya estaba archivada`);
  }
  assertBehavior(
    findings,
    'el registro es insert-only por diseño: repetir la mañana produce duplicados verificados, jamás una reescritura, un borrado o un relleno hacia atrás.',
  );
});

Then('la mañana igual se publica con los miembros que sí llegaron', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  const withLevel = rows.filter((row) => row.conf_level !== undefined);
  if (rows.length > 0 && withLevel.length === 0) {
    findings.push('la mañana publicó filas pero ninguna trae palabra de confianza');
  }
  assertBehavior(
    findings,
    'una fuente caída encoge el conteo de miembros, jamás apaga la mañana: investigación 09 sección 14.4 exige decir lo que no sabemos, no callar; la fila en blanco está prohibida.',
  );
});

Then('el conteo de modelos de esa mañana es el de los que de verdad respondieron', async function (this: PipelineWorld) {
  const expected = secondSourceWorld(this).expectedMembersUsed;
  assert.ok(expected !== undefined, 'test fixture error: the Given must declare the expected member count');
  const rows = await this.callRows();
  const findings: string[] = [];
  if (rows.length === 0) findings.push(`el registro de llamadas quedó vacío${this.failureContext()}`);
  for (const row of rows) {
    if (row.members_used !== expected) {
      findings.push(`la llamada de ${row.spot_id} a las ${row.valid_ts} dice members_used=${row.members_used} cuando respondieron ${expected}`);
    }
  }
  assertBehavior(
    findings,
    'members_used cuenta los miembros que de verdad respondieron entre todas las fuentes: ni un miembro fabricado para disimular la caída, ni uno de menos.',
  );
});

Then('el archivo en bruto de esa mañana no guarda nada de la fuente que calló', async function (this: PipelineWorld) {
  const independentKeys = await this.store.list(INDEPENDENT_RAW_PREFIX);
  const findings = independentKeys.length === 0
    ? []
    : [`la fuente independiente calló y aun así el archivo en bruto guarda ${independentKeys.length} respuestas bajo ${INDEPENDENT_RAW_PREFIX}`];
  assertBehavior(
    findings,
    'una fuente oscura no deja rastro fabricado: sin respuesta no hay archivo, y el conteo encogido más el registro sin sus filas ES el estado honesto de esa mañana.',
  );
});

Then('ninguna playa pasa de confianza baja', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  for (const row of rows) {
    if (row.conf_level !== 'low') {
      findings.push(`${row.where}: "${row.spot_id}" se publica con confianza "${row.conf_level ?? 'ninguna'}" en un día de un solo modelo`);
    }
  }
  assertBehavior(
    findings,
    'con un solo miembro el tope f(M) fija c_spread en 0.4 y ningún otro factor puede subirlo: un día de un solo modelo nunca lee por encima de baja (05 sección 6.1 y 6.4).',
  );
});

// ---------------------------------------------------------------------------
// Adapter integration: the real captured response through the real adapter.
// ---------------------------------------------------------------------------

const ADAPTER_FIXTURE_DIR = fileURLToPath(new URL('../fixtures/noaa-gfswave-grib2/', import.meta.url));
const ADAPTER_MODULE = '../../../../src/pipeline/adapters/noaa-gfswave-grib2';
const ADAPTER_CAPTURE = 'gfswave.t00z.epacif.0p16.f000.20260808.grib2';
const ADAPTER_RECEIPT = 'capture-receipt.json';

Given('una respuesta real de la fuente independiente capturada tal cual llegó', function (this: PipelineWorld) {
  // Existence is asserted in the Then with the rest of the outcome, so a
  // missing capture reads as the behaviour gap it is, not as a setup crash.
  const world = secondSourceWorld(this);
  delete world.adapterOutcome;
});

When('esa respuesta se traduce al idioma de los miembros', { timeout: 60_000 }, async function (this: PipelineWorld) {
  const world = secondSourceWorld(this);
  if (!existsSync(ADAPTER_FIXTURE_DIR) || readdirSync(ADAPTER_FIXTURE_DIR).length === 0) {
    world.adapterOutcome = {
      failure: `no hay ninguna respuesta capturada en ${ADAPTER_FIXTURE_DIR}: DELIVER debe capturar una respuesta real del grib_filter de NOAA (paso 04-05) antes de traducir nada`,
    };
    return;
  }
  try {
    const adapter = (await import(ADAPTER_MODULE)) as Record<string, unknown>;
    const parse = adapter.parseGfswaveGrib2;
    if (typeof parse !== 'function') {
      world.adapterOutcome = { failure: `el adaptador existe pero no expone parseGfswaveGrib2` };
      return;
    }
    const bytes = readFileSync(join(ADAPTER_FIXTURE_DIR, ADAPTER_CAPTURE));
    world.adapterOutcome = { members: (parse as (b: Uint8Array) => unknown)(bytes) };
  } catch (error) {
    world.adapterOutcome = {
      failure: `el adaptador de la fuente independiente no existe todavía en src/pipeline/adapters/noaa-gfswave-grib2.ts: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

Then('salen miembros con su corrida atribuida y sus horas en el idioma de la casa', function (this: PipelineWorld) {
  const outcome = secondSourceWorld(this).adapterOutcome;
  const findings: string[] = [];
  if (outcome === undefined) {
    findings.push('la traducción nunca corrió');
  } else if ('failure' in outcome) {
    findings.push(outcome.failure);
  } else {
    const members = outcome.members;
    if (!Array.isArray(members) || members.length === 0) {
      findings.push('la traducción no produjo ni un miembro');
    } else {
      for (const member of members as Record<string, unknown>[]) {
        if (typeof member.source !== 'string' || member.source === '') {
          findings.push('un miembro salió sin nombre de fuente');
        }
        if (typeof member.run_ts !== 'string' || Number.isNaN(Date.parse(member.run_ts))) {
          findings.push(`el miembro "${String(member.source)}" salió sin corrida atribuida`);
        }
        const hours = member.hours;
        if (!Array.isArray(hours) || hours.length === 0) {
          findings.push(`el miembro "${String(member.source)}" salió sin horas`);
        }
      }
      const receipt = JSON.parse(readFileSync(join(ADAPTER_FIXTURE_DIR, ADAPTER_RECEIPT), 'utf8')) as {
        request: { url: string };
        response: { body_file: string; byte_count: number; sha256: string };
      };
      const captured = readFileSync(join(ADAPTER_FIXTURE_DIR, receipt.response.body_file));
      if (!receipt.request.url.includes('filter_gfswave.pl') || receipt.response.body_file !== ADAPTER_CAPTURE) {
        findings.push('el recibo de captura no identifica la petición NOAA ni el archivo GRIB2 que el adaptador leyó');
      }
      if (captured.byteLength !== receipt.response.byte_count) {
        findings.push(`la captura tiene ${captured.byteLength} bytes, no los ${receipt.response.byte_count} asentados en el recibo`);
      }
      if (createHash('sha256').update(captured).digest('hex') !== receipt.response.sha256) {
        findings.push('la huella SHA-256 de la captura no coincide con su recibo de NOAA');
      }
      const first = (members as { source?: unknown; run_ts?: unknown; hours?: unknown }[])[0];
      const hour = Array.isArray(first?.hours) ? first.hours[0] as { valid_ts?: unknown; swell?: unknown; land_masked?: unknown } | undefined : undefined;
      const swell = hour?.swell as { h_m?: unknown; t_s?: unknown; dir_deg?: unknown } | undefined;
      if (first?.source !== 'ncep_gfswave016' || first.run_ts !== '2026-08-08T00:00:00.000Z') {
        findings.push('la captura NOAA no conserva el miembro ncep_gfswave016 ni su corrida 2026-08-08T00:00:00.000Z');
      }
      if (hour?.valid_ts !== '2026-08-08T00:00:00.000Z' || hour?.land_masked !== false
        || swell?.h_m !== 3.31 || swell.t_s !== 8.5 || swell.dir_deg !== 146.63) {
        findings.push('la captura NOAA no conserva la hora, unidades normalizadas o decisión de máscara asentadas independientemente');
      }
    }
  }
  assertBehavior(
    findings,
    'el adaptador habla el idioma post-ACL del puerto: unidades normalizadas, UTC, corrida atribuida y máscara de tierra ya traducida, probado contra una respuesta real capturada porque los datos sintéticos esconden los desajustes de formato.',
  );
});
