// Slice-05 acceptance steps: the percentile form of C_spread, activated by a
// spot's own accumulated spread history. JIT DISTILL 2026-08-10.
//
// DATA GATE, restated: the PublishedCall log began accumulating 2026-08-08
// and the accepted activation threshold is 30 distinct completed spot-local
// days (Pre-requisite 7, closed). These steps accumulate the history HONESTLY,
// by publishing real mornings through the same driving ports production uses,
// so the history under test is the log the pipeline itself wrote, never a
// planted table. Sixty mornings sit above 30; two sit below. A later ADR that
// changes policy moves HISTORY_MORNINGS, never the oracles.
//
// Contract boundary: valid-but-thin history selects the absolute form. An
// unavailable or malformed durable PublishedCall scope is never reclassified
// as thin: production composition must emit health.startup.refused before any
// call, bundle, or manifest write. The real-IO scenarios in the feature drive
// this through runProductionBuild, rather than a cast or an in-memory fallback.
//
// The engine's SpreadInput union already carries the climatology arm
// (confidence.ts, { kind: 'climatology'; pct }); what is missing, and what
// the RED reports, is the build reading the spot's own history from the log
// and switching forms when the history is long enough (05 section 6.1:
// "switching forms is a data availability change").

import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed, type MemberSpec } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';
import {
  assertBehavior,
  captureTrustPublished,
  COMPARES_AGAINST_SPOT_NORMAL,
  PERIOD_SPLIT_MEMBERS,
  publishedRowsOrFinding,
  SOUNDS_LIKE_PROBABILITY,
  TIGHT_MEMBERS,
} from './support/trust-observables';
import {
  ensureSite,
  loadPlantFixture,
  observeRankedRows,
  openBuiltPage,
  plantKey,
  sevenChecksOnRankedRow,
  type ObservedConfidence,
} from './support/built-site';

const HISTORY_SPOT_ID = venaoSeed.spot_id;
const HISTORY_MORNINGS = 60;
const TODAY = '2026-08-08';

/** Tightly-agreeing members with a small deterministic jitter per morning, so
 * the accumulated history is a real distribution of small spreads and today's
 * period split lands far in its upper tail. */
function jitteredTightMembers(index: number): readonly MemberSpec[] {
  const wave = Math.sin(index * 2.399963); // deterministic, no RNG in tests
  return TIGHT_MEMBERS.map((member, position) => ({
    ...member,
    h_m: Number((member.h_m + 0.015 * wave * (position + 1)).toFixed(3)),
    t_s: Number((member.t_s + 0.08 * wave).toFixed(2)),
  }));
}

function historyDate(index: number): string {
  const date = new Date('2026-06-01T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

async function accumulateHistory(world: PipelineWorld, mornings: number): Promise<void> {
  world.spots = [venaoSeed];
  world.source.tideDark = false;
  for (let index = 0; index < mornings; index += 1) {
    world.source.members = jitteredTightMembers(index);
    await world.publishMorning(`historial ${index + 1}`, historyDate(index));
  }
}

Given(
  'un spot que ya vivió más de sesenta mañanas en el registro con sus modelos casi siempre parecidos',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    await accumulateHistory(this, HISTORY_MORNINGS);
  },
);

Given('un spot con apenas dos mañanas en el registro', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await accumulateHistory(this, 2);
});

Given('hoy los modelos se parten peor que lo normal de ese spot', function (this: PipelineWorld) {
  this.source.members = PERIOD_SPLIT_MEMBERS;
  this.source.tideDark = false;
});

Given('hoy los modelos se parten en el período', function (this: PipelineWorld) {
  this.source.members = PERIOD_SPLIT_MEMBERS;
  this.source.tideDark = false;
});

Given('hoy falta el dato de la marea y los modelos se parecen', function (this: PipelineWorld) {
  this.source.members = TIGHT_MEMBERS;
  this.source.tideDark = true;
});

When('la mañana de hoy se arma y se publica leyendo el historial del spot', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await this.publishMorning('la mañana de hoy', TODAY);
  await captureTrustPublished(this);
});

Then('la razón de hoy compara el día contra lo normal del propio spot', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  const today = rows.filter((row) => row.spot_id === HISTORY_SPOT_ID && row.day === 0);
  const reasons = today.filter((row) => row.reason !== null);
  if (today.length === 0 && findings.length === 0) {
    findings.push(`"${HISTORY_SPOT_ID}" no aparece en la mañana publicada`);
  } else if (reasons.length === 0 && findings.length === 0) {
    findings.push(`ninguna fila de hoy de "${HISTORY_SPOT_ID}" trae una razón que revisar`);
  }
  for (const row of reasons) {
    if (!COMPARES_AGAINST_SPOT_NORMAL.test(row.reason ?? '')) {
      findings.push(`${row.where}: con más de ${HISTORY_MORNINGS} mañanas de historial propio y un día partido en la cola alta, la razón de "${HISTORY_SPOT_ID}" sigue sin comparar contra lo normal del spot: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'con historial propio suficiente el percentil del desacuerdo de ESTE spot reemplaza a los umbrales absolutos (05 sección 6.1) y la razón lo dice como persona: hoy se parten más de lo normal acá. Es la única forma que la investigación dice que carga señal.',
  );
});

Then('ninguna razón compara el día contra lo normal del spot', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  const reasons = rows.filter((row) => row.reason !== null);
  if (reasons.length === 0 && findings.length === 0) {
    findings.push(`ninguna de las ${rows.length} filas publicadas trae una razón que revisar`);
  }
  for (const row of reasons) {
    if (COMPARES_AGAINST_SPOT_NORMAL.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" compara contra un normal que este spot no tiene todavía: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'comparar un día contra un historial que no existe, o contra uno más corto que el umbral, es fabricar el contexto: los spots por debajo del umbral conservan la forma absoluta y sus palabras de siempre.',
  );
});

Then('ninguna razón publicada muestra un porcentaje ni habla de probabilidad', function (this: PipelineWorld) {
  const { rows, findings } = publishedRowsOrFinding(this);
  const reasons = rows.filter((row) => row.reason !== null);
  if (reasons.length === 0 && findings.length === 0) {
    findings.push(`ninguna de las ${rows.length} filas publicadas trae una razón que revisar`);
  }
  for (const row of reasons) {
    if (SOUNDS_LIKE_PROBABILITY.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" muestra un porcentaje o suena a probabilidad: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'el término del desacuerdo es una bandera cualitativa, jamás una barra de error calibrada ni un percentil en pantalla (investigación 09 sección 3.6; contradicción épica C4, cerrada para siempre).',
  );
});

// ---------------------------------------------------------------------------
// Reading half
// ---------------------------------------------------------------------------

const fixture05 = loadPlantFixture(new URL('../fixtures/slice-05-climatology-profiles.json', import.meta.url));

type ReadingWorld = PipelineWorld & { trustObservedRows?: ObservedConfidence[]; trustPage?: import('@playwright/test').Page };

function readingWorld(world: PipelineWorld): ReadingWorld {
  return world as ReadingWorld;
}

Given(
  'una mañana publicada donde una playa compara su día contra su propio normal',
  { timeout: 600_000 },
  async function () {
    await ensureSite('slice-05', fixture05);
  },
);

When(
  'el surfista abre la lista del día de esa mañana y toca la confianza de cada fila',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const site = await ensureSite('slice-05', fixture05);
    const page = await openBuiltPage(this, site, '/', 'claro', 'normal');
    readingWorld(this).trustObservedRows = await observeRankedRows(page, 0);
  },
);

When(
  'el surfista abre la lista del día de esa mañana a {int} px con tema {string} y movimiento {string}',
  { timeout: 120_000 },
  async function (this: PipelineWorld, width: number, theme: string, movement: string) {
    assert.equal(width, 390, 'test fixture error: this feature declares 390 px as its smallest width');
    const site = await ensureSite('slice-05', fixture05);
    const page = await openBuiltPage(this, site, '/', theme, movement);
    readingWorld(this).trustObservedRows = await observeRankedRows(page, 0);
  },
);

Then('la razón abierta de esa playa es exactamente la publicada y compara contra lo normal', async function (this: PipelineWorld) {
  const rows = readingWorld(this).trustObservedRows;
  assert.ok(rows, 'test fixture error: open the published list and tap its confidence first');
  const site = await ensureSite('slice-05', fixture05);
  const planted = site.planted.get(plantKey(HISTORY_SPOT_ID, 0));
  assert.ok(planted?.reason_es, 'test fixture error: the fixture must plant a reason for the history-rich beach');
  const row = rows.find((candidate) => candidate.spot_id === HISTORY_SPOT_ID);
  const findings: string[] = [];
  if (row === undefined) {
    findings.push(`"${HISTORY_SPOT_ID}" no aparece en la lista del día`);
  } else {
    if (row.reasonText !== planted.reason_es) {
      findings.push(`${row.label} abre "${row.reasonText}" cuando su mañana publicó "${planted.reason_es}"`);
    }
    if (!COMPARES_AGAINST_SPOT_NORMAL.test(row.reasonText)) {
      findings.push(`${row.label} no compara contra lo normal del spot: "${row.reasonText}"`);
    }
  }
  assertBehavior(
    findings,
    'la página muestra la razón publicada tal cual, sin agregar ni recortar: la comparación contra lo normal del spot es un valor por (spot, día) del paquete, nunca una frase derivada en la página.',
  );
});

Then(
  'esa razón y su confianza cumplen las siete comprobaciones visuales sobre el fondo real',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const page = readingWorld(this).trustPage;
    assert.ok(page, 'test fixture error: the built list must be open first');
    const findings = await sevenChecksOnRankedRow(page, HISTORY_SPOT_ID);
    assertBehavior(
      findings,
      'la frase nueva es la más humana del producto y se lee con la calidad del resto: AA contra el fondo real, 44 px de toque, sin movimiento bajo la preferencia reducida y envolviendo sin recortarse a 390 px.',
    );
  },
);
