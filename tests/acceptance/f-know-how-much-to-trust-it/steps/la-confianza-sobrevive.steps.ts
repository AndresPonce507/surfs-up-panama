// Slice-04 acceptance steps for F-KNOW-HOW-MUCH-TO-TRUST-IT: the confidence
// story survives its only vendor.
//
// ---------------------------------------------------------------------------
// THE ACCEPTANCE CONTRACT THIS FILE FIXES
// ---------------------------------------------------------------------------
// DELIVER owes two new modules under `src/pipeline/adapters/` (in scope per the
// W4 amendment recorded 2026-08-13 in this feature's feature-delta.md) plus one
// honesty fix in the ingest core. If DELIVER houses any of it elsewhere, that
// is a renegotiation with DISTILL, not a silent move: these steps drive the
// seam recorded here.
//
//   1. `src/pipeline/adapters/noaa-gfswave-source.ts`
//
//        export class NoaaGfswaveForecastSource implements ForecastSource {
//          constructor(
//            spotsById: ReadonlyMap<string, SpotCoordinate>,
//            clock: Clock,
//            fetchImpl?: typeof fetch,
//          )
//        }
//
//      The second, independent wave vendor: NOAA's public gfswave grib_filter
//      (US public domain; adr-openmeteo-vs-raw-grib2.md decision 3). Prior art
//      exists on build/f2-trust (`noaa-gfswave-grib2.ts`) but was written
//      against an older port shape; the re-fit owes FOUR normalizations, all
//      pinned by these scenarios against the real captured cycle:
//        - fetchWavePayload returns the port's string verbatim: a JSON capture
//          envelope carrying each grib_filter sub-response base64'd with its
//          sha256 and URL, because binary GRIB2 cannot ride a JS string
//          honestly and the raw forensic archive stores exactly this envelope.
//        - parseWaveMembers accepts ONLY its own envelope (anything else is
//          malformed), verifies each part's sha256, decodes the concatenated
//          GRIB2 messages, and emits house timestamps: minute precision,
//          `2026-08-13T00:00Z`, matching what the ranking filter and the
//          Open-Meteo attribution already emit. Full-second ISO strings would
//          silently never match `endsWith('T18:00Z')` and never collide with
//          the primary's rows, which would fake independence.
//        - the source id stays `ncep_gfswave016`: the same physical model is
//          the same series to every consumer regardless of vendor
//          (adr-openmeteo-vs-raw-grib2.md, consequences).
//        - the spot's exact 0.16 degree cell is preferred, and when the grid
//          masks it as land (Playa Venao's is masked, verified in the real
//          capture) the adapter reads the nearest OCEAN cell by real distance
//          within two cells; with no ocean cell in that radius the hours stay
//          land_masked. Real distance in metres, deterministically: for Venao
//          that is the cell one step east, 0.76 m / 14.43 s at today 18Z.
//
//   2. `src/pipeline/adapters/source-registry.ts`
//
//        export type RegistryEntry = { readonly id: string; readonly source: ForecastSource };
//        export function registryForecastSource(entries: readonly RegistryEntry[]): ForecastSource;
//
//      The registry seam the ADR promised ("a registry change plus one
//      adapter"): a composite ForecastSource. Order is priority. A later entry
//      is consulted only when every earlier entry failed to deliver a wave
//      payload, so a healthy primary means the fallback gets ZERO calls (the
//      same physical model must never feed the member table twice, which
//      would shrink the spread dishonestly). parseWaveMembers routes to the
//      entry whose parser accepts the payload; when no entry delivered, the
//      registry reports the failure and the ingest core's existing
//      wave_source_unavailable path runs unchanged.
//
//   3. Provider attribution in `src/pipeline/ingest.ts` (in scope per W4,
//      "the source loop only"): the ok arm of ReceivedSourcePayload gains a
//      `provider` name and the raw archive files each payload under the
//      provider that actually produced it. Today the loop hardcodes
//      'open-meteo-marine', which would file NOAA's bytes under the wrong
//      vendor: forensically dishonest provenance.
//
// Nothing else moves. `src/pipeline/build.ts` is untouched: DECLARED_MEMBER_
// SOURCES already names ncep_gfswave016, so the fallback's rows reach the
// member table through the archive exactly like the primary's. The write-once
// rules are untouched: the last scenario proves the fallback CANNOT restate a
// cycle the primary already archived, because the archive's record-grain
// refusal already forbids it.
//
// The seam modules are loaded with a computed dynamic import, so while they do
// not exist every scenario RUNS and fails on the missing seam with the reason
// in the message, never on a static import error, and `tsc --noEmit` stays
// green (the specifier is computed, so the checker does not resolve it).
//
// ---------------------------------------------------------------------------
// THE FIXTURES ARE REAL CAPTURES OF THE SAME MORNING
// ---------------------------------------------------------------------------
// Both vendors were captured live on 2026-08-13 stating the SAME 00Z cycle,
// receipts beside the bytes:
//   - fixtures/noaa-gfswave-20260813/: 17 grib_filter responses, f000..f048
//     every 3 hours, Playa Venao +/- 2 degrees, sha256 per part.
//   - fixtures/open-meteo-marine-playa-venao-20260813.json: the primary's
//     four-model response for the same spot and cycle.
// At 2026-08-13T18:00Z the primary interpolates ncep_gfswave016 at Venao to
// 0.48 m while the raw grid's nearest ocean cell says 0.76 m. Same model, same
// cycle, different vendor extraction: that real difference is the premise of
// the never-rewrites scenario, and nothing about it is synthetic.

import { Before, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runIngestOnce } from '../../../../src/pipeline/ingest';
import { runBuildOnce } from '../../../../src/pipeline/build';
import type { BuildOutcome, Clock, ForecastSource, IngestOutcome } from '../../../../src/pipeline/ports';
import type { SpotCoordinate } from '../../../../src/pipeline/adapters/spot-coordinates';
import { OpenMeteoForecastSource } from '../../../../src/pipeline/adapters/open-meteo-source';
import {
  CONFIDENCE_FACTORS,
  confidenceReasonEs,
  modelAgreement,
  type ConfidenceLevel,
  type SpreadTerms,
} from '../../../../src/scoring/confidence';
import { FixedClock, InMemoryStore } from '../../daily-call-with-permanent-receipts/steps/support/fakes';
import { venaoSeed } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';

const FIXTURES = join(import.meta.dirname, '../fixtures');
const NOAA_DIR = join(FIXTURES, 'noaa-gfswave-20260813');
const CAPTURE_MORNING = '2026-08-13';
const INGEST_AT = `${CAPTURE_MORNING}T08:02:14Z`;
const SECOND_INGEST_AT = `${CAPTURE_MORNING}T09:02:14Z`;
const BUILD_AT = `${CAPTURE_MORNING}T11:22:00Z`;
const HOUSE_CYCLE = `${CAPTURE_MORNING}T00:00Z`;
const GFSWAVE = 'ncep_gfswave016';

const VENAO_COORD: SpotCoordinate = { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 };

const OM_BODY = readFileSync(join(FIXTURES, 'open-meteo-marine-playa-venao-20260813.json'));
const NOAA_RECEIPT = JSON.parse(readFileSync(join(NOAA_DIR, 'capture-receipt.json'), 'utf8')) as {
  requests: { url: string; body_file: string }[];
};

type PredictionRow = {
  spot_id: string;
  source: string;
  run_ts: string;
  valid_ts: string;
  swell_h_m: number;
  swell_t_s: number;
  swell_dir_deg: number;
  land_masked: boolean;
};

type SurfaceDaySpot = {
  spot_id: string;
  conf_level: ConfidenceLevel;
  confidence_reason?: { spread_terms: SpreadTerms };
};

type SeamModules = {
  registryForecastSource: (entries: readonly { id: string; source: ForecastSource }[]) => ForecastSource;
  NoaaGfswaveForecastSource: new (
    spotsById: ReadonlyMap<string, SpotCoordinate>,
    clock: Clock,
    fetchImpl?: typeof fetch,
  ) => ForecastSource;
};

type SliceState = {
  store: InMemoryStore;
  clock: FixedClock;
  omDark: boolean;
  noaaDark: boolean;
  noaaCalls: number;
  seam: SeamModules | null;
  seamMissing: string | null;
  registry: ForecastSource | null;
  outcome: IngestOutcome | null;
  secondOutcome: IngestOutcome | null;
  buildOutcome: BuildOutcome | null;
  failures: string[];
};

let s: SliceState;

Before({ tags: '@slice-04' }, async function () {
  s = {
    store: new InMemoryStore(),
    clock: new FixedClock(INGEST_AT),
    omDark: false,
    noaaDark: false,
    noaaCalls: 0,
    seam: null,
    seamMissing: null,
    registry: null,
    outcome: null,
    secondOutcome: null,
    buildOutcome: null,
    failures: [],
  };
  await loadSeam();
});

async function loadSeam(): Promise<void> {
  const adapters = '../../../../src/pipeline/adapters/';
  try {
    // Computed specifiers: while the seam does not exist this throws at RUN
    // time and the scenario fails on the missing behaviour with this reason,
    // never on a static import error, and tsc stays green.
    const registryModule = (await import(`${adapters}source-registry`)) as Partial<SeamModules>;
    const noaaModule = (await import(`${adapters}noaa-gfswave-source`)) as Partial<SeamModules>;
    if (typeof registryModule.registryForecastSource !== 'function') {
      s.seamMissing = 'src/pipeline/adapters/source-registry.ts existe pero no exporta registryForecastSource';
      return;
    }
    if (typeof noaaModule.NoaaGfswaveForecastSource !== 'function') {
      s.seamMissing = 'src/pipeline/adapters/noaa-gfswave-source.ts existe pero no exporta NoaaGfswaveForecastSource';
      return;
    }
    s.seam = {
      registryForecastSource: registryModule.registryForecastSource,
      NoaaGfswaveForecastSource: noaaModule.NoaaGfswaveForecastSource,
    };
  } catch (error) {
    s.seamMissing = `el registro de fuentes todavía no existe en src/pipeline/adapters/: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ---------- the two vendors, real adapters over the real captures ----------

const omFetch: typeof fetch = (input) => {
  const url = String(input);
  if (s.omDark) return Promise.resolve(new Response('', { status: 404 }));
  if (url.startsWith('https://marine-api.open-meteo.com/v1/marine')) {
    return Promise.resolve(new Response(OM_BODY, { status: 200, headers: { date: new Date(s.clock.now()).toUTCString() } }));
  }
  return Promise.resolve(new Response('', { status: 404 }));
};

const noaaFetch: typeof fetch = (input) => {
  s.noaaCalls += 1;
  const url = String(input);
  if (s.noaaDark) return Promise.resolve(new Response('', { status: 404 }));
  // Served by forecast step and run directory; the byte-exact URL (window
  // bounds included) is asserted against the receipt at the unit level.
  const hour = /file=gfswave\.t00z\.global\.0p16\.(f\d{3})\.grib2/.exec(url)?.[1];
  const captured = NOAA_RECEIPT.requests.find(
    (request) => hour !== undefined && request.url.includes(`.${hour}.`) && url.includes('%2Fgfs.20260813%2F00%2F'),
  );
  if (captured === undefined) return Promise.resolve(new Response('', { status: 404 }));
  return Promise.resolve(new Response(readFileSync(join(NOAA_DIR, captured.body_file)), { status: 200 }));
};

function composeRegistry(): void {
  if (s.seam === null || s.registry !== null) return;
  const spotsById = new Map([[VENAO_COORD.spot_id, VENAO_COORD]]);
  const om = new OpenMeteoForecastSource(spotsById, s.clock, omFetch);
  const noaa = new s.seam.NoaaGfswaveForecastSource(spotsById, s.clock, noaaFetch);
  s.registry = s.seam.registryForecastSource([
    { id: 'open-meteo', source: om },
    { id: 'noaa-gfswave', source: noaa },
  ]);
}

async function runIngest(label: string): Promise<IngestOutcome | null> {
  composeRegistry();
  if (s.registry === null) {
    s.failures.push(`${label}: ${s.seamMissing ?? 'el registro de fuentes no se pudo componer'}`);
    return null;
  }
  try {
    return await runIngestOnce({ source: s.registry, store: s.store, clock: s.clock, spots: [venaoSeed] });
  } catch (error) {
    s.failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function context(): string {
  const parts = [...s.failures];
  if (s.seamMissing !== null) parts.push(s.seamMissing);
  return parts.length === 0 ? '' : ` (contexto: ${parts.join(' | ')})`;
}

async function predictionRows(): Promise<PredictionRow[]> {
  const keys = await s.store.list('predictions/v1/');
  const rows: PredictionRow[] = [];
  for (const key of keys) {
    const body = await s.store.get(key);
    if (body === null) continue;
    for (const line of body.split('\n')) {
      if (line.trim() !== '') rows.push(JSON.parse(line) as PredictionRow);
    }
  }
  return rows;
}

// ---------- givens ----------

Given('la playa Venao con sus coordenadas verificadas', function () {
  // venaoSeed and VENAO_COORD are the committed launch-seed values; the NOAA
  // capture window (leftlon 277.8 .. toplat 9.4) derives from exactly these.
  assert.equal(venaoSeed.spot_id, VENAO_COORD.spot_id);
});

Given('el proveedor principal responde con su captura real de esta mañana', function () {
  s.omDark = false;
});

Given('el proveedor principal no responde esta mañana', function () {
  s.omDark = true;
});

Given('la fuente independiente está lista con su propia captura real', function () {
  s.noaaDark = false;
});

Given('la fuente independiente tampoco responde', function () {
  s.noaaDark = true;
});

Given('el proveedor principal ya archivó su ciclo de esta mañana', async function () {
  s.omDark = false;
  s.noaaDark = false;
  s.clock.set(INGEST_AT);
  s.outcome = await runIngest('primer corrida con el principal sano');
  const rows = await predictionRows();
  assert.ok(
    rows.some((row) => row.source === GFSWAVE && row.run_ts === HOUSE_CYCLE),
    `la primera corrida no archivó el ciclo ${HOUSE_CYCLE} del principal.${context()}`,
  );
});

Given('luego el principal se apaga y la fuente independiente ve el mismo ciclo con otros números', function () {
  // Real data, not an arranged contradiction: the raw grid's nearest ocean
  // cell (0.76 m at 18Z) genuinely differs from the primary's interpolated
  // 0.48 m for the same model and cycle.
  s.omDark = true;
  s.noaaDark = false;
});

// ---------- actions ----------

When('corre la captura horaria con el registro de dos fuentes', async function () {
  s.clock.set(INGEST_AT);
  s.outcome = await runIngest('captura horaria');
});

When('se arma y publica la mañana desde el archivo', async function () {
  s.clock.set(BUILD_AT);
  try {
    s.buildOutcome = await runBuildOnce({ store: s.store, clock: s.clock, spots: [venaoSeed], region_id: 'pa-pacific' });
  } catch (error) {
    s.failures.push(`armado de la mañana: ${error instanceof Error ? error.message : String(error)}`);
  }
});

When('corre la captura horaria otra vez', async function () {
  s.clock.set(SECOND_INGEST_AT);
  s.secondOutcome = await runIngest('segunda corrida');
});

// ---------- el archivo de predicciones ----------

Then('el archivo de predicciones guarda las cuatro opiniones del proveedor principal', async function () {
  const rows = await predictionRows();
  const sources = new Set(rows.map((row) => row.source));
  assert.deepEqual(
    [...sources].sort(),
    ['dwd_gwam', 'meteofrance_wave', 'ncep_gfswave016', 'ncep_gfswave025'],
    `el archivo debía tener exactamente las cuatro fuentes del principal, tiene [${[...sources].sort().join(', ')}].${context()}`,
  );
});

Then('la segunda fuente no recibió ni una sola llamada', function () {
  assert.equal(
    s.noaaCalls,
    0,
    `con el principal sano la fuente independiente no se consulta (el mismo modelo no puede alimentar la tabla dos veces), pero recibió ${s.noaaCalls} llamadas.${context()}`,
  );
});

Then('la respuesta cruda del principal queda archivada bajo su propio nombre', async function () {
  const rawKeys = await s.store.list('raw/open-meteo-marine/');
  assert.ok(rawKeys.length > 0, `no hay captura cruda bajo raw/open-meteo-marine/.${context()}`);
});

Then(
  'el archivo de predicciones guarda las filas de la fuente independiente bajo su fuente y su ciclo exacto',
  async function () {
    const keys = await s.store.list('predictions/v1/');
    assert.ok(keys.length > 0, `el archivo de predicciones quedó vacío.${context()}`);
    for (const key of keys) {
      assert.ok(
        key.startsWith(`predictions/v1/dt=${CAPTURE_MORNING}/src=${GFSWAVE}/cyc=00Z/`),
        `cada objeto debía vivir bajo dt=${CAPTURE_MORNING}/src=${GFSWAVE}/cyc=00Z/, encontrado: ${key}`,
      );
    }
    const rows = await predictionRows();
    assert.ok(rows.length > 0, `no hay filas de predicción.${context()}`);
    for (const row of rows) {
      assert.equal(row.source, GFSWAVE, 'la fila debe declarar el modelo real, el mismo id de serie que usa el principal');
      assert.equal(row.run_ts, HOUSE_CYCLE, `la fila debe traer el ciclo exacto en formato de la casa (${HOUSE_CYCLE}), trae ${row.run_ts}`);
    }
  },
);

Then(
  'cada fila trae el tamaño, el período y la dirección en las unidades de la casa, desde la celda de mar más cercana',
  async function () {
    const rows = await predictionRows();
    const today18 = rows.find((row) => row.valid_ts === `${CAPTURE_MORNING}T18:00Z`);
    const tomorrow18 = rows.find((row) => row.valid_ts === '2026-08-14T18:00Z');
    assert.ok(today18, `falta la hora que rankea el día de hoy (${CAPTURE_MORNING}T18:00Z, formato de la casa al minuto).${context()}`);
    assert.ok(tomorrow18, `falta la hora que rankea mañana (2026-08-14T18:00Z).${context()}`);
    // The real capture, decoded at the nearest ocean cell by real distance:
    // Venao's exact cell is land-masked in this grid, the honest reading is
    // the sea one step east. Metres and seconds, already normalized.
    assert.ok(Math.abs(today18.swell_h_m - 0.76) < 0.01, `hoy 18Z debía leer 0.76 m desde la celda de mar más cercana, leyó ${today18.swell_h_m}`);
    assert.ok(Math.abs(today18.swell_t_s - 14.43) < 0.01, `hoy 18Z debía leer 14.43 s, leyó ${today18.swell_t_s}`);
    assert.ok(Math.abs(tomorrow18.swell_h_m - 0.78) < 0.01, `mañana 18Z debía leer 0.78 m, leyó ${tomorrow18.swell_h_m}`);
    assert.ok(Math.abs(tomorrow18.swell_t_s - 18.76) < 0.01, `mañana 18Z debía leer 18.76 s, leyó ${tomorrow18.swell_t_s}`);
    assert.equal(today18.land_masked, false, 'la celda de mar más cercana no es tierra');
    for (const row of rows) {
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(row.valid_ts), `valid_ts debe venir al minuto como el resto de la casa, vino ${row.valid_ts}`);
    }
  },
);

Then(
  'la respuesta cruda de la fuente independiente queda archivada bajo su propio nombre, nunca bajo el del principal',
  async function () {
    const noaaRaw = await s.store.list('raw/noaa-gfswave/');
    const omRaw = await s.store.list('raw/open-meteo-marine/');
    assert.ok(noaaRaw.length > 0, `no hay captura cruda bajo raw/noaa-gfswave/.${context()}`);
    assert.equal(
      omRaw.length,
      0,
      `el principal estaba oscuro y no produjo bytes, pero hay ${omRaw.length} capturas bajo raw/open-meteo-marine/: procedencia falsa.${context()}`,
    );
  },
);

// ---------- la superficie publicada ----------

Then('la superficie publicada trae la fila de la playa en los dos días', async function () {
  const days = await publishedDays();
  assert.equal(days.length, 2, `la superficie debía traer dos días, trae ${days.length}.${context()}`);
  for (const day of days) {
    assert.ok(
      day.spots.some((spot) => spot.spot_id === 'playa-venao'),
      `la playa desapareció de un día publicado: eso es dejar la fila en blanco.${context()}`,
    );
  }
});

Then('su confianza es {string} y nunca más alta', async function (word: string) {
  assert.equal(word, 'baja', 'el contrato fija el nivel del día de un solo modelo');
  for (const spot of await venaoOnBothDays()) {
    assert.equal(spot.conf_level, 'low', `un solo modelo no puede ganar más que confianza baja, publicó ${spot.conf_level}.${context()}`);
  }
});

Then('su razón dice que no hay con qué comparar, nunca que los modelos coinciden', async function () {
  for (const spot of await venaoOnBothDays()) {
    assert.ok(spot.confidence_reason, `la fila publicada no trae confidence_reason.${context()}`);
    const reason = confidenceReasonEs(
      spot.conf_level,
      modelAgreement(spot.confidence_reason.spread_terms, spot.conf_level, CONFIDENCE_FACTORS),
    );
    assert.ok(reason.includes('no hay con qué comparar'), `la razón debía decir que no hay con qué comparar, dice: "${reason}"`);
    assert.ok(!reason.includes('coinciden'), `la razón de un solo modelo nunca puede decir que los modelos coinciden, dice: "${reason}"`);
  }
});

async function publishedDays(): Promise<{ date: string; spots: SurfaceDaySpot[] }[]> {
  const body = await s.store.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(
    body,
    `no se publicó el bundle en pub/v1/regions/pa-pacific/bundle.json` +
      `${s.buildOutcome !== null && !('build_id' in s.buildOutcome && s.buildOutcome.published) ? ` (el armado se negó: ${JSON.stringify(s.buildOutcome)})` : ''}.${context()}`,
  );
  const bundle = JSON.parse(body) as { publish_surface: { days: { date: string; spots: SurfaceDaySpot[] }[] } };
  return bundle.publish_surface.days;
}

async function venaoOnBothDays(): Promise<SurfaceDaySpot[]> {
  const days = await publishedDays();
  const rows = days.flatMap((day) => day.spots.filter((spot) => spot.spot_id === 'playa-venao'));
  assert.equal(rows.length, 2, `esperaba la fila de la playa en los dos días, encontré ${rows.length}.${context()}`);
  return rows;
}

// ---------- las dos fuentes oscuras ----------

Then('el archivo de predicciones queda sin filas nuevas', async function () {
  const keys = await s.store.list('predictions/v1/');
  assert.equal(keys.length, 0, `las dos fuentes estaban oscuras y aun así se escribieron ${keys.length} objetos.${context()}`);
});

Then('el evento dice que la fuente de olas no estuvo disponible', function () {
  assert.ok(s.outcome, `la corrida no dejó resultado.${context()}`);
  assert.ok(
    s.outcome.events.some((event) => event.type === 'wave_source_unavailable'),
    `esperaba el evento wave_source_unavailable, hay: [${s.outcome.events.map((event) => event.type).join(', ')}].${context()}`,
  );
});

Then('la corrida termina completa, sin inventar un miembro ni un número', async function () {
  assert.ok(s.outcome, `la corrida no dejó resultado.${context()}`);
  assert.equal(s.outcome.completed, true, 'una fuente oscura no es un crash: la corrida reporta completa y el hueco queda dicho');
  assert.equal((await predictionRows()).length, 0, 'ninguna fila fabricada');
});

// ---------- la reescritura rechazada ----------

Then('el intento se rechaza y el archivo conserva los números que ya tenía', async function () {
  const rows = await predictionRows();
  const today18 = rows.filter((row) => row.source === GFSWAVE && row.valid_ts === `${CAPTURE_MORNING}T18:00Z`);
  assert.equal(today18.length, 1, `debía quedar exactamente una fila del ciclo para hoy 18Z, quedan ${today18.length}.${context()}`);
  // The primary's interpolated value survives; the fallback's 0.76 for the
  // same natural key was refused, not filed beside it.
  assert.ok(
    Math.abs(today18[0]!.swell_h_m - 0.48) < 0.01,
    `el archivo debía conservar el 0.48 m que el principal ya archivó, tiene ${today18[0]!.swell_h_m}.${context()}`,
  );
});

Then('la salud registra que se rechazó una reescritura', function () {
  assert.ok(s.secondOutcome, `la segunda corrida no dejó resultado.${context()}`);
  const types = s.secondOutcome.events.map((event) => event.type);
  assert.ok(
    types.includes('health.archive.rewrite_refused'),
    `esperaba health.archive.rewrite_refused, hay: [${types.join(', ')}].${context()}`,
  );
});
