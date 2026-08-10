// Slice-02 acceptance steps: the per-spot tide station, the honest return of
// "confianza alta", and the stated absence where no station can be cited.
// JIT DISTILL 2026-08-10.
//
// THE RECORDED BLOCKER, restated so nobody plans around it: the spot seed
// schema has no tide station reference (04-ingest-pipeline.md section 11,
// DELIVER BLOCKER; domain-model.md line 336; Pre-requisite 5 mapping policy
// open; adr-tide-source-chain.md still Proposed). These steps declare the
// station on the seed the scenarios inject (`tide_station`, the field the
// domain lane owes) and the fake tide source answers for ANY spot asked,
// because CO-OPS itself is up: the REFUSAL to attach a number to a spot with
// no station is production behaviour, not fixture behaviour. Today the
// pipeline attaches the served curve to every spot, which is exactly the
// dishonesty the RED half of these scenarios reports.
//
// No cap, boundary or spread constant may move to make any of this pass:
// R30, and the constants guard from step 01-03.

import { Given, Then, When } from '@cucumber/cucumber';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';
import type { SpotSeed } from '../../../../src/scoring/engine';
import {
  assertBehavior,
  captureTrustPublished,
  NAMES_THE_TIDE,
  publishedRowsOrFinding,
  reasonsForSpot,
  SHAPE_GLYPHS,
  TIGHT_MEMBERS,
} from './support/trust-observables';
import {
  ensureSite,
  loadPlantFixture,
  observeRankedRows,
  openBuiltPage,
  sevenChecksOnRankedRow,
  type ObservedConfidence,
} from './support/built-site';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Seeds. `tide_station` is the field the domain lane owes (Balboa 9812501 is
// the only Pacific CO-OPS prediction station, adr-tide-source-chain.md).
// When the seed consult lands in DELIVER, the keystone fixture venaoSeed in
// tests/acceptance/daily-call-with-permanent-receipts/steps/support/fixtures.ts
// must gain its own honest station in the same change (cross-lane edit,
// serialized), or the keystone and slice-01 tide-present mornings lose their
// tide. Recorded in the slice-02 roadmap notes.
// ---------------------------------------------------------------------------

type SeedWithStation = SpotSeed & { readonly tide_station?: string };

const MAPPED_SPOT_ID = 'punta-brava';
const UNMAPPED_SPOT_ID = venaoSeed.spot_id;

const mappedSeed: SeedWithStation = {
  ...venaoSeed,
  spot_id: MAPPED_SPOT_ID,
  name: 'Punta Brava',
  tide_station: '9812501',
};

const microMappedSeed: SeedWithStation = {
  ...venaoSeed,
  spot_id: 'punta-chame',
  name: 'Punta Chame',
  tide: { ...venaoSeed.tide, range_class: 'micro' },
  tide_station: '9812501',
};

const microUnmappedSeed: SeedWithStation = {
  ...venaoSeed,
  spot_id: 'playa-coronado',
  name: 'Playa Coronado',
  tide: { ...venaoSeed.tide, range_class: 'micro' },
};

const MICRO_MAPPED_ID = microMappedSeed.spot_id;
const MICRO_UNMAPPED_ID = microUnmappedSeed.spot_id;

type StationWorld = PipelineWorld & {
  stationMappedSpotId?: string;
  stationUnmappedSpotId?: string;
};

function stationWorld(world: PipelineWorld): StationWorld {
  return world as StationWorld;
}

// ---------------------------------------------------------------------------
// Producer half
// ---------------------------------------------------------------------------

Given(
  'una mañana en que la estación de mareas responde, con una playa que puede citarla y una vecina que no',
  function (this: PipelineWorld) {
    this.spots = [mappedSeed, venaoSeed];
    this.source.members = TIGHT_MEMBERS;
    this.source.tideDark = false;
    const world = stationWorld(this);
    world.stationMappedSpotId = MAPPED_SPOT_ID;
    world.stationUnmappedSpotId = UNMAPPED_SPOT_ID;
  },
);

Given('una playa con estación cuya estación lleva ocho días sin responder', function (this: PipelineWorld) {
  // Port-visible state after 8 silent days, per the 04 section 11 contract: no
  // tide series is derivable any more (the daily cache covers 8 days and a
  // dark CO-OPS degrades nothing for >= 7). A DELIVER whose cache kept serving
  // day-1 harmonics past the window would publish a number here and go red.
  this.spots = [mappedSeed];
  this.source.members = TIGHT_MEMBERS;
  this.source.tideDark = true;
  const world = stationWorld(this);
  world.stationMappedSpotId = MAPPED_SPOT_ID;
  delete world.stationUnmappedSpotId;
});

Given(
  'una mañana en que la estación responde para una playa de mareas chicas y su vecina de mareas chicas no tiene estación',
  function (this: PipelineWorld) {
    this.spots = [microMappedSeed, microUnmappedSeed];
    this.source.members = TIGHT_MEMBERS;
    this.source.tideDark = false;
    const world = stationWorld(this);
    world.stationMappedSpotId = MICRO_MAPPED_ID;
    world.stationUnmappedSpotId = MICRO_UNMAPPED_ID;
  },
);

When('esa mañana se arma y se publica con la marea de cada estación', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await this.publishMorning('la mañana de las estaciones', '2026-08-08');
  await captureTrustPublished(this);
});

function mappedSpotId(world: PipelineWorld): string {
  const id = stationWorld(world).stationMappedSpotId;
  assert.ok(id, 'test fixture error: no station-bearing beach was declared in a Given');
  return id;
}

function unmappedSpotId(world: PipelineWorld): string {
  const id = stationWorld(world).stationUnmappedSpotId;
  assert.ok(id, 'test fixture error: no stationless beach was declared in a Given');
  return id;
}

Then(
  'las horas archivadas de la playa con estación traen su número de marea y las de la vecina quedan sin él',
  async function (this: PipelineWorld) {
    const mapped = mappedSpotId(this);
    const unmapped = unmappedSpotId(this);
    const rows = await this.predictionRows();
    const findings: string[] = [];
    const mappedRows = rows.filter((row) => row.spot_id === mapped);
    const unmappedRows = rows.filter((row) => row.spot_id === unmapped);
    if (mappedRows.length === 0) findings.push(`el registro no archivó ni una hora de "${mapped}"${this.failureContext()}`);
    if (unmappedRows.length === 0) findings.push(`el registro no archivó ni una hora de "${unmapped}"${this.failureContext()}`);
    const mappedWithoutTide = mappedRows.filter((row) => row.tide_m === null).length;
    if (mappedWithoutTide > 0) {
      findings.push(`"${mapped}" cita la estación 9812501 y aun así ${mappedWithoutTide} de sus ${mappedRows.length} horas quedaron sin marea`);
    }
    const unmappedWithTide = unmappedRows.filter((row) => row.tide_m !== null).length;
    if (unmappedWithTide > 0) {
      findings.push(`"${unmapped}" no puede citar ninguna estación y aun así ${unmappedWithTide} de sus ${unmappedRows.length} horas traen un número de marea que ninguna estación suya defiende`);
    }
    assertBehavior(
      findings,
      'la marea es dato por playa: se calcula desde la estación que ESA playa referencia en la semilla, y una playa sin referencia honesta se queda con la ausencia declarada; prestarle a todas la misma curva atribuye un número real a playas a cientos de kilómetros (la regla del PROVENANCE).',
    );
  },
);

Then('la razón de la playa con estación deja de nombrar la marea', function (this: PipelineWorld) {
  const spotId = mappedSpotId(this);
  const { rows, findings } = publishedRowsOrFinding(this);
  const { reasons, findings: reasonFindings } = reasonsForSpot(rows, spotId);
  findings.push(...reasonFindings);
  for (const row of reasons) {
    if (NAMES_THE_TIDE.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${spotId}" sigue nombrando la marea aunque su estación la puso: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'con la marea puesta desde su estación, "tide" sale de missing, el tope de 0.7 deja de atar y nombrar la marea sería nombrar una causa que no pesó (05 sección 3.6).',
  );
});

Then('la razón de la vecina sigue nombrando la marea que falta', function (this: PipelineWorld) {
  const spotId = unmappedSpotId(this);
  const { rows, findings } = publishedRowsOrFinding(this);
  const { reasons, findings: reasonFindings } = reasonsForSpot(rows, spotId);
  findings.push(...reasonFindings);
  for (const row of reasons) {
    if (!NAMES_THE_TIDE.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${spotId}" dejó de nombrar la marea que sigue faltando: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'una playa sin estación honesta conserva tide_m nulo, conserva el tope y lo sigue diciendo claro; la marea de otra estación a cientos de kilómetros no es la suya.',
  );
});

Then('la playa con estación se publica con confianza alta', function (this: PipelineWorld) {
  const spotId = mappedSpotId(this);
  const { rows, findings } = publishedRowsOrFinding(this);
  const forSpot = rows.filter((row) => row.spot_id === spotId);
  if (forSpot.length === 0) findings.push(`"${spotId}" no aparece en la mañana publicada`);
  for (const row of forSpot) {
    if (row.conf_level !== 'high') {
      findings.push(`${row.where}: "${spotId}" se publica con confianza "${row.conf_level ?? 'ninguna'}" en una mañana de modelos que de verdad se parecen y con su marea puesta`);
    }
  }
  assertBehavior(
    findings,
    'con la marea real puesta c_total = c_spread = 0.9922 > 0.7 con las constantes intactas: la alta se gana con datos, nunca bajando un tope ni una frontera (guardia de constantes del paso 01-03).',
  );
});

Then('la vecina sin estación se queda en confianza media', function (this: PipelineWorld) {
  const spotId = unmappedSpotId(this);
  const { rows, findings } = publishedRowsOrFinding(this);
  const forSpot = rows.filter((row) => row.spot_id === spotId);
  if (forSpot.length === 0) findings.push(`"${spotId}" no aparece en la mañana publicada`);
  for (const row of forSpot) {
    if (row.conf_level !== 'medium') {
      findings.push(`${row.where}: "${spotId}" se publica con confianza "${row.conf_level ?? 'ninguna'}" sin tener marea propia: con el tope de 0.7 la media exacta es lo máximo que sus datos ganaron`);
    }
  }
  assertBehavior(
    findings,
    'sin estación propia el tope cap_missing_tide = 0.7 sigue atando y cae exacto sobre la frontera de alta: media es el techo honesto, y pasar de ahí solo puede significar una marea prestada o una vara bajada.',
  );
});

Then('la razón de la playa con estación vuelve a nombrar la marea que falta', function (this: PipelineWorld) {
  const spotId = mappedSpotId(this);
  const { rows, findings } = publishedRowsOrFinding(this);
  const { reasons, findings: reasonFindings } = reasonsForSpot(rows, spotId);
  findings.push(...reasonFindings);
  for (const row of reasons) {
    if (!NAMES_THE_TIDE.test(row.reason ?? '')) {
      findings.push(`${row.where}: la estación lleva más de siete días muda y la razón de "${spotId}" no vuelve a nombrar la marea: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'una estación muda más de 7 días devuelve la serie a nulo: el tope vuelve, la ausencia vuelve a decirse con su nombre y ninguna caché puede seguir sirviendo armónicos viejos como si fueran de hoy (04 sección 11).',
  );
});

Then('la razón de la playa de mareas chicas con estación no nombra la marea', function (this: PipelineWorld) {
  const spotId = mappedSpotId(this);
  const { rows, findings } = publishedRowsOrFinding(this);
  const { reasons, findings: reasonFindings } = reasonsForSpot(rows, spotId);
  findings.push(...reasonFindings);
  for (const row of reasons) {
    if (NAMES_THE_TIDE.test(row.reason ?? '')) {
      findings.push(`${row.where}: "${spotId}" es de mareas chicas con su marea puesta y su razón nombra la marea: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'la neutralidad microtidal es un S_tide = 1.0 REAL con dato presente, no una ausencia: nada de la marea ató el nivel y la razón no puede nombrarla (05 secciones 3.5 y 3.6).',
  );
});

Then(
  'su vecina de mareas chicas sigue nombrando la marea que falta y no pasa de confianza media',
  function (this: PipelineWorld) {
    const spotId = unmappedSpotId(this);
    const { rows, findings } = publishedRowsOrFinding(this);
    const forSpot = rows.filter((row) => row.spot_id === spotId);
    if (forSpot.length === 0) findings.push(`"${spotId}" no aparece en la mañana publicada`);
    const { reasons, findings: reasonFindings } = reasonsForSpot(rows, spotId);
    findings.push(...reasonFindings);
    for (const row of reasons) {
      if (!NAMES_THE_TIDE.test(row.reason ?? '')) {
        findings.push(`${row.where}: la razón de "${spotId}" no nombra la marea que le falta: "${row.reason}"`);
      }
    }
    for (const row of forSpot) {
      if (row.conf_level === 'high') {
        findings.push(`${row.where}: "${spotId}" se publica con confianza alta sin marea propia`);
      }
    }
    assertBehavior(
      findings,
      'mareas chicas no significa marea opcional: sin dato presente la playa sigue en ausencia declarada, con el tope y con la razón nombrándola; neutralidad y ausencia se distinguen (05 sección 3.6).',
    );
  },
);

// ---------------------------------------------------------------------------
// Reading half
// ---------------------------------------------------------------------------

const fixture02 = loadPlantFixture(new URL('../fixtures/slice-02-tide-station-profiles.json', import.meta.url));

type ReadingWorld = PipelineWorld & { trustObservedRows?: ObservedConfidence[]; trustPage?: import('@playwright/test').Page };

function readingWorld(world: PipelineWorld): ReadingWorld {
  return world as ReadingWorld;
}

Given(
  'una mañana publicada en que una playa ganó confianza alta y su vecina sigue sin marea',
  { timeout: 600_000 },
  async function () {
    await ensureSite('slice-02', fixture02);
  },
);

When(
  'el surfista abre la lista del día y toca la confianza de las dos playas',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const site = await ensureSite('slice-02', fixture02);
    const page = await openBuiltPage(this, site, '/', 'claro', 'normal');
    readingWorld(this).trustObservedRows = await observeRankedRows(page, 0);
  },
);

When(
  'el surfista abre la lista del día a {int} px con tema {string} y movimiento {string}',
  { timeout: 120_000 },
  async function (this: PipelineWorld, width: number, theme: string, movement: string) {
    assert.equal(width, 390, 'test fixture error: this feature declares 390 px as its smallest width');
    const site = await ensureSite('slice-02', fixture02);
    const page = await openBuiltPage(this, site, '/', theme, movement);
    readingWorld(this).trustObservedRows = await observeRankedRows(page, 0);
  },
);

function observedRows(world: PipelineWorld): ObservedConfidence[] {
  const rows = readingWorld(world).trustObservedRows;
  assert.ok(rows, 'test fixture error: open the published list and tap its confidence first');
  return rows;
}

Then('la playa que la ganó muestra su confianza alta por forma y palabra', function (this: PipelineWorld) {
  const rows = observedRows(this);
  const row = rows.find((candidate) => candidate.spot_id === MAPPED_SPOT_ID);
  const findings: string[] = [];
  if (row === undefined) {
    findings.push(`"${MAPPED_SPOT_ID}" no aparece en la lista del día`);
  } else {
    if (!/confianza\s+alta/iu.test(row.wordText)) {
      findings.push(`${row.label} ganó confianza alta y muestra "${row.wordText}"`);
    }
    if (!SHAPE_GLYPHS.test(row.wordText)) {
      findings.push(`${row.label} no lleva la forma del nivel junto a la palabra: "${row.wordText}"`);
    }
  }
  assertBehavior(
    findings,
    'el día que una playa gana la alta con datos, la fila lo dice por palabra y por forma (puntos de glifo del sistema de diseño), nunca por color.',
  );
});

Then('la razón abierta de su vecina dice claro que falta la marea', function (this: PipelineWorld) {
  const rows = observedRows(this);
  const row = rows.find((candidate) => candidate.spot_id === UNMAPPED_SPOT_ID);
  const findings: string[] = [];
  if (row === undefined) {
    findings.push(`"${UNMAPPED_SPOT_ID}" no aparece en la lista del día`);
  } else if (row.reasonText === '') {
    findings.push(`${row.label} no abre ninguna razón que leer`);
  } else if (!NAMES_THE_TIDE.test(row.reasonText)) {
    findings.push(`${row.label} abre una razón que no nombra la marea que le falta: "${row.reasonText}"`);
  }
  assertBehavior(
    findings,
    'donde falta la marea la razón lo dice claro, en la misma lista donde la vecina con estación gana su alta: la diferencia entre las dos ES el producto.',
  );
});

Then(
  'la confianza alta y su razón cumplen las siete comprobaciones visuales sobre el fondo real',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const page = readingWorld(this).trustPage;
    assert.ok(page, 'test fixture error: the built list must be open first');
    const findings = await sevenChecksOnRankedRow(page, MAPPED_SPOT_ID);
    assertBehavior(
      findings,
      'la fila que por fin gana la alta se diseña con la calidad del resto: tokens nombrados, 44 px de toque, sin movimiento bajo la preferencia reducida, contraste AA contra el fondo real y la razón envolviendo sin recortarse a 390 px.',
    );
  },
);
