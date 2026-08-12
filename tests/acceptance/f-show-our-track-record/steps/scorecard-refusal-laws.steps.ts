// Slice-02 acceptance steps: the scorecard arithmetic as refusal laws.
//
// One driving port, deliberately: `projectScorecard` (plus its incremental
// twin `applyReport` for the rebuild law) in src/scorecard/projection. The
// projection takes the two immutable logs as values, a trust config, an
// identity resolution, and an as-of instant, and returns the observable
// outcome: residuals, per-key window stats, and the P5 block per spot. No
// step imports pairing, aggregates or windows directly — those are the
// crafter's internals, exercised through the port (hexagonal boundary).
//
// Zero AWS, zero network, zero page. Fixtures exercise the arithmetic and
// only the arithmetic; they never stand in for the honesty state of any
// shipped surface (red-classification.md contract row 4).
//
// The settled arithmetic these laws pin, cited not invented:
//   - grain + gate: domain-model.md §9 (wind DROPPED from the grain,
//     2026-08-08); adr-scorecard-incremental.md decisions 1-6
//   - G2 trust eligibility + G3 se_gate floor: 06-learning-layer.md §7
//   - sign convention forecast-minus-observed, stated once: 06 §4
//   - sigma_eff: height 0.48 m, score 25 pts: 06 §8
//   - q_obs anchors: src/data/report-vocab.ts (the one constants home)
//   - counter shape + threshold: domain-model.md §13, P5
//
// World: no setWorldConstructor (the daily-call lane owns the only one).
// Module state, reset by a hook scoped to this feature's own tags.

import { Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';

import { QUALITY_OBSERVED_SCORE, QUALITY_TOKENS } from '../../../../src/data/report-vocab';
import { REPORTS_REQUIRED as THRESHOLD } from '../../../../src/scorecard/threshold';

const SCOPE = '@feature-f-show-our-track-record and @slice-02';

// sigma_eff has one home in the design (06-learning-layer.md §8). These are
// oracle constants for the laws, cited; production must carry its own home.
const SIGMA_EFF_HEIGHT_M = 0.48;
const SIGMA_EFF_SCORE_PTS = 25;

const SHIPPED_TRUST_CONFIG = {
  min_credential_age_days: 0,
  min_prior_reports: 0,
  min_prior_spots: 2,
} as const;

type AnyRec = Record<string, unknown>;

type PredictionRow = {
  spot_id: string;
  source: string;
  run_ts: string;
  valid_ts: string;
  lead_h: number;
  swell_h_m: number;
  land_masked: boolean;
};

type ReportRecord = {
  spot_id: string;
  device_id: string;
  observed_at: string;
  size_band: string;
  quality: string;
  credential_issued_at: string;
  received_at: string;
  predicted: { score_q: number };
};

type Slice02State = {
  predictions: PredictionRow[];
  reports: ReportRecord[];
  trustConfig: AnyRec;
  strictTrustConfig: AnyRec | null;
  projection: AnyRec | null;
  result: AnyRec | null;
  strictResult: AnyRec | null;
  zeroResult: AnyRec | null;
  coordinated: AnyRec | null;
  honest: AnyRec | null;
  windError: unknown;
  reportSetArb: fc.Arbitrary<ReportRecord[]> | null;
  newReport: ReportRecord | null;
  baseResult: AnyRec | null;
};

let state: Slice02State;

function reset(): void {
  state = {
    predictions: [],
    reports: [],
    trustConfig: { ...SHIPPED_TRUST_CONFIG },
    strictTrustConfig: null,
    projection: null,
    result: null,
    strictResult: null,
    zeroResult: null,
    coordinated: null,
    honest: null,
    windError: undefined,
    reportSetArb: null,
    newReport: null,
    baseResult: null,
  };
}

reset();

Before({ tags: SCOPE }, function () {
  reset();
});

// ------------------------------------------------------------- fixtures

const SPOTS = ['playa-venao', 'santa-catalina'] as const;
const SOURCE = 'ncep_gfswave016';
const AS_OF = '2026-08-10T12:00:00Z';

function hourIso(daysAgo: number, hour: number): string {
  const base = Date.parse('2026-08-10T00:00:00Z');
  const t = base - daysAgo * 86_400_000 + hour * 3_600_000;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function predictionRow(over: Partial<PredictionRow>): PredictionRow {
  return {
    spot_id: 'playa-venao',
    source: SOURCE,
    run_ts: hourIso(3, 6),
    valid_ts: hourIso(2, 18),
    lead_h: 36,
    swell_h_m: 0.9,
    land_masked: false,
    ...over,
  };
}

function report(over: Partial<ReportRecord>): ReportRecord {
  const observed = over.observed_at ?? hourIso(2, 18);
  return {
    spot_id: 'playa-venao',
    device_id: 'd_veterana_01',
    observed_at: observed,
    size_band: 'waist_chest',
    quality: 'good',
    credential_issued_at: hourIso(40, 0),
    received_at: observed,
    predicted: { score_q: 70 },
    ...over,
  };
}

/** Predictions covering every hour a generated report can land on. */
function coveringPredictions(): PredictionRow[] {
  const rows: PredictionRow[] = [];
  for (const spot of SPOTS) {
    for (let day = 0; day < 100; day += 1) {
      for (const hour of [6, 12, 18]) {
        rows.push(predictionRow({ spot_id: spot, valid_ts: hourIso(day, hour) }));
      }
    }
  }
  return rows;
}

function reportsFromDevices(deviceCount: number, reportCount: number): ReportRecord[] {
  const out: ReportRecord[] = [];
  for (let i = 0; i < reportCount; i += 1) {
    const day = (i % 30) + 1;
    out.push(
      report({
        device_id: `d_persona_${String((i % deviceCount) + 1).padStart(2, '0')}`,
        observed_at: hourIso(day, 12),
        received_at: hourIso(day, 12),
      }),
    );
  }
  return out;
}

const identityResolver = (deviceId: string): string => deviceId;

function projectionInput(over: AnyRec = {}): AnyRec {
  return {
    predictions: state.predictions,
    reports: state.reports,
    trustConfig: state.trustConfig,
    resolveReporter: identityResolver,
    asOf: AS_OF,
    ...over,
  };
}

// ------------------------------------------------------- the driving port

async function loadProjection(): Promise<AnyRec> {
  let mod: AnyRec;
  // Specifier held in a variable on purpose: the module does not exist until
  // DELIVER builds it, and a literal specifier would fail typecheck (BROKEN)
  // instead of failing the run's existence oracle (RED).
  const specifier = '../../../../src/scorecard/projection';
  try {
    mod = (await import(specifier)) as AnyRec;
  } catch {
    assert.fail(
      'src/scorecard/projection does not exist yet: no module computes the scorecard ' +
        'projection (pairing, daily aggregates, 30/90-day windows, gate decision, block ' +
        'assembly) from the two immutable logs. The settled arithmetic is domain-model.md ' +
        'section 9 plus 06-learning-layer.md sections 4-8, and adr-scorecard-incremental.md ' +
        'decisions 1-6. Slice-01 shipped only the decision over an already-formed block; ' +
        'slice-02 owns the arithmetic that forms it.',
    );
  }
  assert.equal(
    typeof mod['projectScorecard'],
    'function',
    'src/scorecard/projection exists but exports no projectScorecard function; the ' +
      'acceptance suite drives the whole slice through that one port.',
  );
  state.projection = mod;
  return mod;
}

function project(input: AnyRec): AnyRec {
  const fn = state.projection?.['projectScorecard'] as ((i: AnyRec) => AnyRec) | undefined;
  assert.ok(fn, 'test harness error: projection not loaded before use');
  const out = fn(input);
  assert.ok(out !== null && typeof out === 'object', 'projectScorecard returned no structured outcome');
  return out as AnyRec;
}

// ------------------------------------------------------- result accessors

function residualsOf(result: AnyRec): AnyRec[] {
  const residuals = result['residuals'];
  assert.ok(
    Array.isArray(residuals),
    'the projection outcome exposes no residuals array; the pairing law cannot be observed ' +
      'at the port without it (each residual names its spot, source, lead bucket, variable, ' +
      'paired hour, signed error and reporter).',
  );
  return residuals as AnyRec[];
}

function blocksOf(result: AnyRec): Record<string, AnyRec> {
  const blocks = result['blocks'];
  assert.ok(
    blocks !== null && typeof blocks === 'object',
    'the projection outcome exposes no blocks record; the P5 block per spot is the ' +
      'user-facing observable of this slice (domain-model.md section 13).',
  );
  return blocks as Record<string, AnyRec>;
}

function keyStatsOf(result: AnyRec): AnyRec[] {
  const keys = result['keys'];
  assert.ok(
    Array.isArray(keys),
    'the projection outcome exposes no keys array with per-key window stats ' +
      '(n, bias, mae, se_sample, se_gate, distinct_reporters per window).',
  );
  return keys as AnyRec[];
}

function floorUtcHour(iso: string): string {
  const t = new Date(iso);
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function canonicalCounts(result: AnyRec): string {
  const rows = keyStatsOf(result)
    .map((k) => ({
      spot: String(k['spot_id']),
      source: String(k['source']),
      lead: String(k['lead_bucket']),
      variable: String(k['variable']),
      window: String(k['window'] ?? ''),
      n: Number(k['n']),
      bias: Number(k['bias']),
      mae: Number(k['mae']),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(rows);
}

function canonicalDailyCounts(result: AnyRec): string {
  const rows = result['daily'];
  assert.ok(Array.isArray(rows), 'the projection outcome exposes no daily aggregates at its port');
  assert.ok(rows.length > 0, 'pairable reports produced no daily aggregate at the projection port');
  return JSON.stringify(
    (rows as AnyRec[])
      .map((row) => ({
        spot: String(row['spot_id']),
        source: String(row['source']),
        lead: String(row['lead_bucket']),
        variable: String(row['variable']),
        day: String(row['day']),
        n: Number(row['n']),
        sumErr: Number(row['sum_err']),
        sumAbsErr: Number(row['sum_abs_err']),
        sumSqErr: Number(row['sum_sq_err']),
        devices: [...(row['device_ids'] as string[])].sort(),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

// ---------------------------------------------------------------- Given

Given('un registro de pronósticos y reportes de prueba con horas y playas variadas', function () {
  state.predictions = [
    predictionRow({ spot_id: 'playa-venao', valid_ts: hourIso(2, 18), swell_h_m: 1.2 }),
    predictionRow({ spot_id: 'playa-venao', valid_ts: hourIso(2, 12), swell_h_m: 0.8 }),
    predictionRow({ spot_id: 'santa-catalina', valid_ts: hourIso(2, 18), swell_h_m: 1.0 }),
    // A land-masked row at an hour a report will land on: must form no pair.
    predictionRow({ spot_id: 'playa-venao', valid_ts: hourIso(1, 18), land_masked: true }),
  ];
  state.reports = [
    // Pairs with the 1.2 m forecast at its floored hour (18:41 -> 18:00).
    report({ observed_at: hourIso(2, 18).replace('T18:00', 'T18:41'), size_band: 'waist_chest' }),
    // Same hour, other spot: must pair only with its own spot's row.
    report({ spot_id: 'santa-catalina', observed_at: hourIso(2, 18) }),
    // Lands on the land-masked hour: must form no height pair from that row.
    report({ observed_at: hourIso(1, 18) }),
    // No prediction row exists for this hour at all: forms no pair, never guessed.
    report({ observed_at: hourIso(1, 3) }),
  ];
});

Given('datos de prueba que intentan colar una variable de viento en el historial', function () {
  state.predictions = coveringPredictions().slice(0, 30);
  state.reports = reportsFromDevices(3, 6);
});

Given('cualquier conjunto de reportes de prueba emparejables', function () {
  state.predictions = coveringPredictions();
  state.reportSetArb = fc.array(
    fc
      .record({
        spot: fc.constantFrom(...SPOTS),
        day: fc.integer({ min: 1, max: 40 }),
        hour: fc.constantFrom(6, 12, 18),
        device: fc.integer({ min: 1, max: 9 }),
        quality: fc.constantFrom(...QUALITY_TOKENS),
      })
      .map(({ spot, day, hour, device, quality }) =>
        report({
          spot_id: spot,
          observed_at: hourIso(day, hour),
          received_at: hourIso(day, hour),
          device_id: `d_persona_${device}`,
          quality,
        }),
      ),
    { minLength: 1, maxLength: 25 },
  );
});

Given('una cuenta construida con reportes de prueba de varios días', function () {
  state.predictions = coveringPredictions();
  state.reports = [
    report({ observed_at: hourIso(5, 12), received_at: hourIso(5, 12), device_id: 'd_persona_1' }),
    report({ observed_at: hourIso(4, 12), received_at: hourIso(4, 12), device_id: 'd_persona_2' }),
    report({ observed_at: hourIso(3, 18), received_at: hourIso(3, 18), device_id: 'd_persona_3' }),
  ];
  state.newReport = report({
    observed_at: hourIso(1, 12),
    received_at: hourIso(1, 12),
    device_id: 'd_persona_4',
  });
});

Given('una cuenta con reportes de prueba repartidos en más de noventa días', function () {
  state.predictions = coveringPredictions();
  const out: ReportRecord[] = [];
  for (let day = 1; day <= 100; day += 3) {
    out.push(
      report({
        observed_at: hourIso(day, 12),
        received_at: hourIso(day, 12),
        device_id: `d_persona_${(day % 7) + 1}`,
      }),
    );
  }
  state.reports = out;
});

Given(
  'dos conjuntos de prueba del mismo tamaño y el mismo sesgo, uno coordinado sin variación y uno honesto',
  function () {
    state.predictions = coveringPredictions();
    // n = 22, the worked example of 06-learning-layer.md section 11. The
    // coordinated set reports the identical band every time (zero variance);
    // the honest set varies around the same mean.
    const coordinated: ReportRecord[] = [];
    const honest: ReportRecord[] = [];
    // 13 waist-to-chest midpoints (0.9 m) plus 9 head-overhead midpoints
    // (2.0 m) average exactly the coordinated chest-head midpoint (1.35 m),
    // while retaining real sample variance: (13 * 0.9 + 9 * 2.0) / 22 = 1.35.
    const honestBands = Array.from({ length: 22 }, (_, index) => (index < 13 ? 'waist_chest' : 'head_overhead'));
    const floor = (0.5 * SIGMA_EFF_HEIGHT_M) / Math.sqrt(22);
    state.predictions = state.predictions.map((prediction) => ({ ...prediction, swell_h_m: 1.35 + 1.5 * floor }));
    for (let i = 0; i < 22; i += 1) {
      const day = i + 1;
      coordinated.push(
        report({
          observed_at: hourIso(day, 12),
          received_at: hourIso(day, 12),
          device_id: `d_coord_${(i % 6) + 1}`,
          size_band: 'chest_head',
        }),
      );
      honest.push(
        report({
          observed_at: hourIso(day, 12),
          received_at: hourIso(day, 12),
          device_id: `d_honesta_${(i % 6) + 1}`,
          size_band: honestBands[i]!,
        }),
      );
    }
    state.coordinated = { reports: coordinated };
    state.honest = { reports: honest };
  },
);

Given('reportes de prueba donde una credencial nació ayer y las demás son veteranas', function () {
  state.predictions = coveringPredictions();
  const veterans = reportsFromDevices(5, 15);
  const young = [
    report({
      device_id: 'd_joven_01',
      observed_at: hourIso(1, 12),
      received_at: hourIso(1, 12),
      credential_issued_at: hourIso(1, 11), // one hour before its report
    }),
    report({
      device_id: 'd_joven_01',
      observed_at: hourIso(1, 18),
      received_at: hourIso(1, 18),
      credential_issued_at: hourIso(1, 11),
    }),
  ];
  state.reports = [...veterans, ...young];
});

Given('una configuración de confianza de prueba que exige credenciales con edad', function () {
  state.strictTrustConfig = { min_credential_age_days: 7, min_prior_reports: 0, min_prior_spots: 2 };
});

Given('cualquier conjunto de reportes de prueba con menos de cinco personas elegibles', function () {
  state.predictions = coveringPredictions();
  state.reportSetArb = fc
    .record({
      devices: fc.integer({ min: 1, max: 4 }),
      count: fc.integer({ min: 10, max: 40 }),
    })
    .map(({ devices, count }) => reportsFromDevices(devices, count));
});

Given('cualquier conjunto de reportes de prueba con menos de diez pares', function () {
  state.predictions = coveringPredictions();
  state.reportSetArb = fc
    .record({
      devices: fc.integer({ min: 1, max: 9 }),
      count: fc.integer({ min: 0, max: 9 }),
    })
    .map(({ devices, count }) => reportsFromDevices(Math.min(Math.max(devices, 1), 9), count));
});

Given('cualquier estado de la cuenta de una playa', function () {
  state.predictions = coveringPredictions();
  state.reportSetArb = fc
    .record({
      devices: fc.integer({ min: 1, max: 9 }),
      count: fc.integer({ min: 0, max: 60 }),
    })
    .map(({ devices, count }) => reportsFromDevices(devices, count));
});

Given('un reporte de prueba con cada etiqueta de calidad', function () {
  state.predictions = coveringPredictions();
  state.reports = QUALITY_TOKENS.map((quality, i) =>
    report({
      quality,
      observed_at: hourIso(i + 1, 12),
      received_at: hourIso(i + 1, 12),
      device_id: `d_persona_${i + 1}`,
      predicted: { score_q: 70 },
    }),
  );
});

Given('cualquier conjunto de reportes de prueba acumulado reporte por reporte', function () {
  state.predictions = coveringPredictions();
  state.reportSetArb = fc
    .record({
      devices: fc.integer({ min: 1, max: 9 }),
      count: fc.integer({ min: 1, max: 30 }),
    })
    .map(({ devices, count }) => reportsFromDevices(devices, count));
});

// ----------------------------------------------------------------- When

When('la proyección del historial empareja los reportes contra el registro', async function () {
  await loadProjection();
  state.result = project(projectionInput());
});

When('la proyección del historial procesa esos datos', async function () {
  await loadProjection();
  try {
    state.result = project(projectionInput({ variables: ['swell_h', 'score', 'wind'] }));
    state.windError = undefined;
  } catch (error) {
    state.windError = error;
  }
});

When('la proyección procesa el conjunto en dos órdenes distintos', async function () {
  await loadProjection();
});

When('la proyección suma un reporte nuevo', async function () {
  await loadProjection();
  state.baseResult = project(projectionInput());
  assert.ok(state.newReport, 'test harness error: no new report prepared');
  state.result = project(projectionInput({ reports: [...state.reports, state.newReport] }));
});

When('la proyección deriva las ventanas de 30 y 90 días', async function () {
  await loadProjection();
  state.result = project(projectionInput());
});

When('la proyección deriva el margen de cada uno', async function () {
  await loadProjection();
  const coordinated = state.coordinated?.['reports'] as ReportRecord[] | undefined;
  const honest = state.honest?.['reports'] as ReportRecord[] | undefined;
  assert.ok(coordinated && honest, 'test harness error: the two fixture sets were not built');
  state.coordinated = project(projectionInput({ reports: coordinated }));
  state.honest = project(projectionInput({ reports: honest }));
});

When('la proyección cuenta a las personas que respaldan cada llave', async function () {
  await loadProjection();
  assert.ok(state.strictTrustConfig, 'test harness error: no strict trust config prepared');
  state.zeroResult = project(projectionInput({ trustConfig: { ...SHIPPED_TRUST_CONFIG } }));
  state.strictResult = project(projectionInput({ trustConfig: state.strictTrustConfig }));
});

When('la proyección decide qué dice el recuadro', async function () {
  await loadProjection();
});

When('la proyección arma el bloque del historial', async function () {
  await loadProjection();
});

When('la proyección forma el residuo de puntaje de cada uno', async function () {
  await loadProjection();
  state.result = project(projectionInput());
});

When('la proyección recalcula todo desde cero con los mismos registros', async function () {
  const mod = await loadProjection();
  assert.equal(
    typeof mod['applyReport'],
    'function',
    'src/scorecard/projection exports no applyReport function; the rebuild law compares the ' +
      'incremental fold (one report at a time, adr-scorecard-incremental decision 2) against ' +
      'the batch recompute (decision 6) and needs both entries at the port.',
  );
});

// ----------------------------------------------------------------- Then

Then('cada residuo proviene de un pronóstico de la misma playa y la misma hora redondeada', function () {
  const result = state.result;
  assert.ok(result, 'test harness error: the projection did not run');
  const residuals = residualsOf(result);
  assert.ok(residuals.length > 0, 'the fixture contains pairable reports, yet the projection formed zero residuals');
  const predicted = new Set(
    state.predictions.filter((p) => !p.land_masked).map((p) => `${p.spot_id}|${p.valid_ts}`),
  );
  for (const r of residuals) {
    const key = `${String(r['spot_id'])}|${String(r['paired_valid_ts'] ?? r['valid_ts'])}`;
    assert.ok(
      predicted.has(key),
      `a residual claims the pair ${key}, but no live prediction row exists for that spot and hour; ` +
        'pairing must join on (spot_id, floor_utc_hour(observed_at)) = (spot_id, valid_ts) only ' +
        '(domain-model.md section 5 join key).',
    );
  }
  const orphan = state.reports.find((rep) => rep.observed_at === hourIso(1, 3));
  assert.ok(orphan, 'test harness error: the no-prediction-hour report is missing from the fixture');
  const orphanResiduals = residuals.filter(
    (r) => String(r['paired_valid_ts'] ?? r['valid_ts']) === floorUtcHour(orphan.observed_at),
  );
  assert.equal(
    orphanResiduals.length,
    0,
    'a report whose hour has no prediction row formed a residual anyway; an unpaired report is ' +
      'counted as unpaired, never guessed against a neighbouring hour.',
  );
});

Then('el signo de cada residuo es pronóstico menos observado', function () {
  const result = state.result;
  assert.ok(result, 'test harness error: the projection did not run');
  const residuals = residualsOf(result);
  // The 1.2 m forecast paired against a waist_chest report (midpoint 0.9 m,
  // domain-model.md section 7.2) must read positive: forecast minus observed.
  const heightResiduals = residuals.filter(
    (r) => String(r['variable']) === 'swell_h' && String(r['spot_id']) === 'playa-venao',
  );
  assert.ok(heightResiduals.length > 0, 'no height residual was formed for the fixture pair that pins the sign');
  const signed = heightResiduals.map((r) => Number(r['err']));
  assert.ok(
    signed.every((v) => Number.isFinite(v)),
    `height residuals carry non-numeric errors: ${JSON.stringify(signed)}`,
  );
  assert.ok(
    signed.some((v) => v > 0),
    'the fixture forecasts 1.2 m against an observed waist-to-chest band, and forecast minus ' +
      `observed must come out positive; observed errors: ${JSON.stringify(signed)} (06-learning-layer.md section 4).`,
  );
});

Then('las filas de pronóstico marcadas como tierra no forman ningún par', function () {
  const result = state.result;
  assert.ok(result, 'test harness error: the projection did not run');
  const residuals = residualsOf(result);
  const maskedHour = hourIso(1, 18);
  const fromMasked = residuals.filter(
    (r) => String(r['paired_valid_ts'] ?? r['valid_ts']) === maskedHour && String(r['spot_id']) === 'playa-venao',
  );
  assert.equal(
    fromMasked.length,
    0,
    'a land-masked prediction row formed a pair; land_masked rows are excluded from residual ' +
      'formation (domain-model.md section 5, C1 to C4 exclusion).',
  );
});

Then('la variable de viento se rechaza en voz alta, nombrándola', function () {
  assert.ok(
    state.windError !== undefined,
    'the projection accepted a wind variable silently; wind was dropped from the scorecard ' +
      'grain on 2026-08-08 (domain-model.md section 9, adr-scorecard-incremental decision 1) ' +
      'and a wind row must be a loud failure, never a silent extra.',
  );
  const message = state.windError instanceof Error ? state.windError.message : String(state.windError);
  assert.ok(
    /wind|viento/i.test(message),
    `the rejection does not name the wind variable; a maintainer reading it cannot tell what was refused: ${message}`,
  );
});

Then('ningún residuo de viento aparece en ninguna cuenta', function () {
  if (state.result === null) return; // the projection refused the whole input: nothing was counted
  const residuals = residualsOf(state.result);
  const windRows = residuals.filter((r) => /wind/i.test(String(r['variable'])));
  assert.equal(windRows.length, 0, 'a wind residual appears in the projection outcome');
});

Then('las cuentas diarias y las ventanas quedan idénticas en ambos órdenes', { timeout: 120_000 }, function () {
  const arb = state.reportSetArb;
  assert.ok(arb, 'test harness error: no report-set generator prepared');
  fc.assert(
    fc.property(arb, (reports) => {
      const forward = project(projectionInput({ reports }));
      const reversed = project(projectionInput({ reports: [...reports].reverse() }));
      assert.equal(
        `${canonicalDailyCounts(forward)}|${canonicalCounts(forward)}`,
        `${canonicalDailyCounts(reversed)}|${canonicalCounts(reversed)}`,
        'the same report set produced different window stats in a different arrival order; ' +
          'daily aggregates must be additive and order-free (requirement R15).',
      );
    }),
    { numRuns: 40 },
  );
});

Then('el día del reporte nuevo es el único cuya cuenta cambia', function () {
  const before = state.baseResult;
  const after = state.result;
  assert.ok(before && after, 'test harness error: the before/after projections did not run');
  const daily = (result: AnyRec): Map<string, string> => {
    const rows = result['daily'];
    assert.ok(
      Array.isArray(rows),
      'the projection outcome exposes no daily array; the ScorecardDay complement invariant ' +
        '(appending a pair never mutates a prior day, domain-model.md section 10) cannot be ' +
        'observed at the port without the daily aggregates.',
    );
    const map = new Map<string, string>();
    for (const row of rows as AnyRec[]) {
      const key = `${String(row['spot_id'])}|${String(row['source'])}|${String(row['lead_bucket'])}|${String(row['variable'])}|${String(row['day'])}`;
      map.set(key, JSON.stringify(row));
    }
    return map;
  };
  const beforeDays = daily(before);
  const afterDays = daily(after);
  const newDay = floorUtcHour(state.newReport!.observed_at).slice(0, 10);
  for (const [key, row] of beforeDays) {
    if (key.endsWith(`|${newDay}`)) continue;
    assert.equal(
      afterDays.get(key),
      row,
      `appending one report changed the already-counted day ${key}; prior days' items are ` +
        'frozen by the complement invariant (domain-model.md section 10).',
    );
  }
});

Then('el sesgo de cada ventana es el promedio de sus errores, con su error absoluto medio al lado', function () {
  const result = state.result;
  assert.ok(result, 'test harness error: the projection did not run');
  const stats = keyStatsOf(result);
  const windows = new Set(stats.map((k) => String(k['window'])));
  assert.ok(
    windows.has('30d') && windows.has('90d'),
    `the projection derives windows ${JSON.stringify([...windows])}, not the settled 30d and 90d pair`,
  );
  const residuals = residualsOf(result);
  for (const stat of stats) {
    const n = Number(stat['n']);
    if (!Number.isFinite(n) || n === 0) continue;
    const windowDays = String(stat['window']) === '30d' ? 30 : 90;
    const cutoff = Date.parse(AS_OF) - windowDays * 86_400_000;
    const mine = residuals.filter(
      (r) =>
        String(r['spot_id']) === String(stat['spot_id']) &&
        String(r['source']) === String(stat['source']) &&
        String(r['lead_bucket']) === String(stat['lead_bucket']) &&
        String(r['variable']) === String(stat['variable']) &&
        Date.parse(String(r['paired_valid_ts'] ?? r['valid_ts'])) >= cutoff,
    );
    if (mine.length === 0) continue;
    const errs = mine.map((r) => Number(r['err']));
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
    assert.ok(
      Math.abs(Number(stat['bias']) - mean) < 1e-9,
      `window bias ${String(stat['bias'])} is not the mean of its own errors ${mean} for ${JSON.stringify(stat)}`,
    );
    assert.ok(
      Math.abs(Number(stat['mae']) - mae) < 1e-9,
      `window mae ${String(stat['mae'])} is not the mean absolute error ${mae} for ${JSON.stringify(stat)}`,
    );
  }
});

Then('las personas distintas se resuelven a través de la identidad al momento de leer', async function () {
  // Two devices that the identity resolution maps to one person must count
  // as one distinct reporter (adr-scorecard-incremental decision 4).
  const merged = project(
    projectionInput({
      resolveReporter: (deviceId: string) => (deviceId.startsWith('d_persona_') ? 'p_misma_persona' : deviceId),
    }),
  );
  const stats = keyStatsOf(merged).filter((k) => Number(k['n']) > 0);
  assert.ok(stats.length > 0, 'no populated key stats to observe the identity resolution on');
  for (const stat of stats) {
    assert.equal(
      Number(stat['distinct_reporters']),
      1,
      'devices merged into one person still count as separate reporters; raw device ids are ' +
        'stored and resolved through the identity at read time (adr decision 4).',
    );
  }
});

Then('el margen guardado nunca baja del piso físico del ruido', function () {
  const coordinated = state.coordinated;
  assert.ok(coordinated, 'test harness error: the coordinated projection did not run');
  const stats = keyStatsOf(coordinated).filter(
    (k) => String(k['variable']) === 'swell_h' && Number(k['n']) >= 10,
  );
  assert.ok(stats.length > 0, 'the coordinated fixture produced no populated height key at n >= 10');
  for (const stat of stats) {
    const n = Number(stat['n']);
    const floor = (0.5 * SIGMA_EFF_HEIGHT_M) / Math.sqrt(n);
    const seGate = Number(stat['se_gate'] ?? stat['se']);
    assert.ok(
      Number.isFinite(seGate),
      `the key stat carries no se_gate (nor se) field: ${JSON.stringify(stat)}`,
    );
    assert.ok(
      seGate >= floor - 1e-12,
      `se_gate ${seGate} fell below the physical noise floor ${floor} at n=${n}; ` +
        'se_gate = max(se_sample, 0.5 * sigma_eff / sqrt(n)) and the stored se carries the ' +
        'floored value (06-learning-layer.md section 7 G3).',
    );
  }
});

Then('bajo el límite del piso el conjunto coordinado todavía no publica', function () {
  const coordinated = state.coordinated;
  const honest = state.honest;
  assert.ok(coordinated && honest, 'test harness error: the two projections did not run');
  // Both sets share n and a bias below 2*floor. Zero variance may reach the
  // floor but cannot buy past it; without that floor its raw error is zero.
  const gateOf = (result: AnyRec): number => {
    const stat = keyStatsOf(result).find(
      (k) => String(k['variable']) === 'swell_h' && String(k['window']) === '30d' && Number(k['n']) >= 10,
    );
    assert.ok(stat, 'no populated 30d height key found to compare the two sets');
    return Number(stat['se_gate'] ?? stat['se']);
  };
  const coordinatedGate = gateOf(coordinated);
  gateOf(honest);
  const floor = (0.5 * SIGMA_EFF_HEIGHT_M) / Math.sqrt(22);
  assert.ok(
    Math.abs(coordinatedGate - floor) < 1e-12,
    `the zero-variance set must bind exactly at the sigma floor ${floor}, got ${coordinatedGate}; removing the floor makes this assertion fail`,
  );
  const claimOf = (result: AnyRec): boolean =>
    Object.values(blocksOf(result)).some((b) => b['claim_ok'] === true);
  assert.equal(
    claimOf(coordinated),
    false,
    'a bias below 2*se_gate must not publish; removing the sigma floor lets coordinated zero-variance samples pass this boundary',
  );
});

Then('las muestras de la credencial joven quedan fuera de toda cuenta con reja', function () {
  const strict = state.strictResult;
  assert.ok(strict, 'test harness error: the strict-config projection did not run');
  const residuals = residualsOf(strict);
  const youngPaired = residuals.filter((r) => String(r['device_id'] ?? r['reporter_key'] ?? '').startsWith('d_joven'));
  const stats = keyStatsOf(strict).filter((k) => Number(k['n']) > 0);
  assert.ok(stats.length > 0, 'no populated key stats under the strict config');
  // The young credential filed reports; under the strict config none of its
  // samples may appear in any gated count (n, distinct reporters).
  const zero = state.zeroResult;
  assert.ok(zero, 'test harness error: the zero-config projection did not run');
  const totalN = (result: AnyRec): number =>
    keyStatsOf(result)
      .filter((k) => String(k['window']) === '90d' && String(k['variable']) === 'swell_h')
      .reduce((a, k) => a + Number(k['n'] || 0), 0);
  assert.ok(
    totalN(strict) < totalN(zero),
    `the strict config (min_credential_age_days 7) removed no samples: gated n stayed at ${totalN(zero)}; ` +
      'the young credential filed reports one hour after its credential was minted and must drop ' +
      `out of every gated count (06-learning-layer.md section 7 G2). Young samples paired: ${youngPaired.length}.`,
  );
});

Then('con la configuración en ceros la cuenta es idéntica a no filtrar', function () {
  const zero = state.zeroResult;
  assert.ok(zero, 'test harness error: the zero-config projection did not run');
  const unfiltered = project(projectionInput({ trustConfig: null }));
  assert.equal(
    canonicalCounts(zero),
    canonicalCounts(unfiltered),
    'at the shipped all-zero config the eligible set must equal the full set bit-identically ' +
      '(06-learning-layer.md section 7 G2, "no-op at launch, confirmed in writing").',
  );
});

Then('la decisión es siempre el estado del contador, jamás una afirmación', { timeout: 120_000 }, function () {
  const arb = state.reportSetArb;
  assert.ok(arb, 'test harness error: no report-set generator prepared');
  fc.assert(
    fc.property(arb, (reports) => {
      const result = project(projectionInput({ reports }));
      const blocks = Object.entries(blocksOf(result));
      if (reports.length > 0) {
        assert.ok(blocks.length > 0, 'pairable reports produced no per-spot gate decision at the projection port');
      }
      for (const [spot, block] of blocks) {
        assert.equal(
          block['claim_ok'],
          false,
          `below the gate the block for ${spot} still claims: ${JSON.stringify(block)}; ` +
            'n >= 10 AND distinct trust-eligible reporters >= 5 AND |bias| > 2*se_gate, all three ' +
            'or nothing (domain-model.md section 9).',
        );
        assert.ok(
          block['headline'] === null || block['headline'] === undefined,
          `below the gate the block for ${spot} carries a headline: ${JSON.stringify(block)}`,
        );
      }
    }),
    { numRuns: 40 },
  );
});

Then('da igual cuán grande sea el sesgo o cuántas observaciones haya', function () {
  // Bound into the previous property by construction: the generator ranges n
  // up to 40 with at most 4 distinct persons, and the refusal held for every
  // generated case. This step records the quantifier in the narrative.
  assert.ok(state.reportSetArb, 'test harness error: the refusal property did not run');
});

Then('el contador del bloque son sus propios dos enteros unidos con la barra', { timeout: 120_000 }, function () {
  const arb = state.reportSetArb;
  assert.ok(arb, 'test harness error: no report-set generator prepared');
  fc.assert(
    fc.property(arb, (reports) => {
      const result = project(projectionInput({ reports }));
      for (const [spot, block] of Object.entries(blocksOf(result))) {
        const nObs = Number(block['n_obs']);
        assert.ok(Number.isInteger(nObs) && nObs >= 0, `block for ${spot} carries no integer n_obs: ${JSON.stringify(block)}`);
        assert.equal(
          block['counter'],
          `${nObs} / ${THRESHOLD}`,
          `the counter for ${spot} is not composed from the block's own two integers ` +
            `(expected "${nObs} / ${THRESHOLD}"): ${JSON.stringify(block)} — the "N / 30" shape is ` +
            'contractual (P5, domain-model.md section 13).',
        );
      }
    }),
    { numRuns: 40 },
  );
});

Then('el umbral treinta viene de su única casa exportada', function () {
  assert.equal(THRESHOLD, 30, 'the exported threshold home no longer says 30');
  const result = project(projectionInput({ reports: [] }));
  for (const [spot, block] of Object.entries(blocksOf(result))) {
    assert.equal(
      block['threshold'],
      THRESHOLD,
      `the block for ${spot} does not carry the threshold from src/scorecard/threshold: ${JSON.stringify(block)}`,
    );
  }
});

Then('cada residuo usa el ancla asentada de su etiqueta desde la única casa de constantes', function () {
  const result = state.result;
  assert.ok(result, 'test harness error: the projection did not run');
  const residuals = residualsOf(result).filter((r) => String(r['variable']) === 'score');
  assert.ok(residuals.length > 0, 'no score residual was formed from the four labelled reports');
  for (const r of residuals) {
    const quality = String(r['quality'] ?? '');
    const anchor = QUALITY_OBSERVED_SCORE[quality as keyof typeof QUALITY_OBSERVED_SCORE];
    assert.ok(anchor !== undefined, `a score residual carries an unknown quality label: ${JSON.stringify(r)}`);
    assert.equal(
      Number(r['err']),
      70 - anchor,
      `the score residual for quality "${quality}" is not predicted score minus the settled ` +
        `anchor (${70} - ${anchor}): ${JSON.stringify(r)} — anchors live in src/data/report-vocab.ts only.`,
    );
  }
});

Then('el piso de ruido del puntaje es un paso de ancla, veinticinco puntos', function () {
  const result = state.result;
  assert.ok(result, 'test harness error: the projection did not run');
  const stat = keyStatsOf(result).find((k) => String(k['variable']) === 'score' && Number(k['n']) > 0);
  if (stat === undefined) return; // four single reports may not populate a window key; the law is pinned by the floor check below
  const n = Number(stat['n']);
  const floor = (0.5 * SIGMA_EFF_SCORE_PTS) / Math.sqrt(n);
  const seGate = Number(stat['se_gate'] ?? stat['se']);
  assert.ok(
    seGate >= floor - 1e-12,
    `the score se_gate ${seGate} fell below the 25-point-anchor-step floor ${floor} at n=${n} ` +
      '(sigma_eff_score = 25, an unfit prior, 06-learning-layer.md section 8, cited not invented).',
  );
});

Then('las dos cuentas quedan idénticas hasta el último número', { timeout: 120_000 }, function () {
  const arb = state.reportSetArb;
  assert.ok(arb, 'test harness error: no report-set generator prepared');
  const apply = state.projection?.['applyReport'] as
    | ((acc: unknown, report: ReportRecord, input: AnyRec) => unknown)
    | undefined;
  assert.ok(apply, 'test harness error: applyReport was not verified before this step');
  fc.assert(
    fc.property(arb, (reports) => {
      const batch = project(projectionInput({ reports }));
      let acc: unknown = null;
      for (const one of reports) {
        acc = apply(acc, one, projectionInput({ reports: [] }));
      }
      const folded = project(projectionInput({ reports, fromAccumulator: acc }));
      assert.equal(
        canonicalCounts(folded),
        canonicalCounts(batch),
        'the incremental fold and the from-scratch recompute disagree; the scorecard is a ' +
          'projection of the two immutable logs and must be rebuildable from them exactly ' +
          '(adr-scorecard-incremental decision 6).',
      );
    }),
    { numRuns: 30 },
  );
});
