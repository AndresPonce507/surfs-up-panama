// Slice-01 acceptance steps for f-know-how-much-to-trust-it: the per-(spot, day)
// confidence reason.
//
// TWO HALVES, on purpose.
//
//   Producer half (@in-memory). Drives runIngestOnce / runBuildOnce through the
//   same ports the keystone lane uses, with a shaped forecast source, and reads
//   the published bundle. These scenarios own every COMPOSITION rule: which
//   cause the sentence may name, which it may not, the 160-character bound, the
//   binding copy rules of 05 sections 6.2 and 6.3. No sentence planted by this
//   test can satisfy them, because the sentence under test is the one the
//   producer composed.
//
//   Reading half (@real-io). Copies the project to a temp root, plants only
//   producer-shaped values on data/published-surface.json, runs the real
//   `npm run build`, serves the emitted dist/ over real HTTP and reads it in
//   Chromium at 390 px. These scenarios own FIDELITY: that the page shows THIS
//   row's published reason instead of deriving one from the level, the degrade
//   path, the spot page, and the seven visual checks.
//
// Not `astro preview` and not `vite preview`. Vite's SPA fallback serves
// index.html for any unmatched route, which would turn a missing page into a
// passing test; astro preview quietly resolves directory URLs the deploy does
// not. The server below performs exactly the build.format:'file' mapping and
// nothing more, and every navigation asserts HTTP 200 before any oracle runs.
//
// This file NEVER calls setWorldConstructor. It imports the keystone lane's
// PipelineWorld; a second registration would replace the World for every other
// feature in the run.
//
// Step text is deliberately worded differently from slice-07's confidence
// steps: cucumber's step registry is global and a near-identical parameterised
// pattern would collide or silently reuse the other lane's step.

import { After, AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed, type MemberSpec } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type ProfileName = string;

type Profile = {
  readonly conf_level: 'low' | 'medium' | 'high';
  readonly reason_es: string | null;
};

type Fixture = {
  readonly default_profile: { readonly today: ProfileName; readonly tomorrow: ProfileName };
  readonly by_spot: Readonly<Record<string, { today: ProfileName; tomorrow: ProfileName }>>;
  readonly profiles: Readonly<Record<ProfileName, Profile>>;
  readonly spot_page_spot_id: string;
  readonly degraded_spot_id: string;
  readonly longest_spot_id: string;
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-01-confidence-reason-profiles.json', import.meta.url),
  'utf8',
)) as Fixture;

/** The P1 bound this feature owes (application-architecture.md section 7). */
const REASON_MAX_CHARS = 160;

// Self-check: a planted sentence longer than the bound would make the reading
// half assert something the producer half forbids, and the contradiction would
// surface as a confusing GREEN-impossible test rather than as a fixture bug.
for (const [name, profile] of Object.entries(fixture.profiles)) {
  const reason = profile.reason_es;
  if (reason === null) continue;
  assert.ok(
    [...reason].length <= REASON_MAX_CHARS,
    `test fixture error: planted profile "${name}" is ${[...reason].length} characters, over the ${REASON_MAX_CHARS} the published reason is allowed`,
  );
  assert.ok(!/[—–]/u.test(reason), `test fixture error: planted profile "${name}" contains an em dash`);
}

/**
 * Four members that genuinely agree. Verified before authoring: with the tide
 * missing this gives c_spread 0.9922 and c_total exactly 0.7 -- MEDIUM, because
 * cap_missing_tide lands precisely on the high boundary (level = high needs
 * c_total > 0.7). That arithmetic is why no scenario in this slice may assert
 * "alta": it is unreachable today, not merely rare, and lowering the boundary
 * to reach it is the one move this product forbids.
 */
const MODELS_THAT_AGREE: readonly MemberSpec[] = [
  { source: 'ncep_gfswave016', h_m: 0.70, t_s: 12.0, dir_deg: 205 },
  { source: 'ncep_gfswave025', h_m: 0.71, t_s: 12.1, dir_deg: 206 },
  { source: 'meteofrance_wave', h_m: 0.70, t_s: 12.0, dir_deg: 205 },
  { source: 'dwd_gwam', h_m: 0.72, t_s: 12.2, dir_deg: 204 },
];

/**
 * The real 2026-08-08 Venao pull: heights close, periods split 15.5 s against
 * 10.05 s. Verified before authoring: with the tide present this gives
 * dominant = spread_period, so the period disagreement is the cause that binds
 * and the tide is not.
 */
const MODELS_SPLIT_ON_PERIOD: readonly MemberSpec[] = [
  { source: 'ncep_gfswave016', h_m: 0.64, t_s: 15.5, dir_deg: 206 },
  { source: 'ncep_gfswave025', h_m: 0.66, t_s: 15.5, dir_deg: 204 },
  { source: 'meteofrance_wave', h_m: 0.78, t_s: 11.6, dir_deg: 212 },
  { source: 'dwd_gwam', h_m: 0.86, t_s: 10.05, dir_deg: 203 },
];

const MORNING_DATE = '2026-08-08';

// ---------------------------------------------------------------------------
// Domain vocabulary the oracles require, and nothing more
// ---------------------------------------------------------------------------
//
// Pre-requisite 1 (the exact Spanish phrasings, and the reconciliation of the
// 160-character bound with the three binding copy rules) is OPEN. No oracle
// here pins a sentence word for word; each requires only the domain noun that
// any settled wording must contain, singular or plural. Whatever Andres
// settles passes unchanged, which is what keeps DELIVER from having to edit an
// acceptance test at GREEN.

const NAMES_THE_TIDE = /\bmareas?\b/iu;
const NAMES_THE_PERIOD = /\bper[ií]odos?\b/iu;
const NAMES_A_TRACK_RECORD_GAP = /\bhistorial(?:es)?\b/iu;
const SAYS_NOBODY_REPORTED = /nadie[\s\S]*playa|playa[\s\S]*nadie/iu;
const SAYS_ONE_MODEL_ANSWERED = /\b(?:un\s+solo|solo\s+un|[uú]nico)\s+modelo\b|\bun\s+modelo\s+solo\b/iu;

/**
 * Wording that asserts the models disagreed. Forbidden on a row whose models
 * agreed and whose level was capped by a missing input: that is the live
 * misattribution defect this slice closes (Baseline gap 2). Also forbidden on a
 * single-member day, where there is nothing to disagree with.
 */
const CLAIMS_MODEL_DISAGREEMENT =
  /no\s+se\s+ponen\s+de\s+acuerdo|coinciden\s+solo\s+en\s+parte|se\s+contradicen|\bdifieren\b|\bdiscrepan\b|no\s+coinciden|se\s+parten/iu;

/** Zero beach reports exist in this system today (HANDOFF.md section 5). */
const CLAIMS_BEACH_CONFIRMATION =
  /(alguien|un\s+surfista|un\s+reporte)\s+(confirm\w*|vio|report[oó])|confirmad[oa]\s+desde\s+la\s+playa|reporte\w*\s+desde\s+la\s+playa\s+confirm\w*/iu;

const LEAKS_RAW_DATA =
  /\b(?:ncep|gfs|gfswave|dwd|gwam|ecmwf|meteofrance)(?:[_-]?[a-z0-9]+)*\b|\b(?:c_spread|c_track|c_fresh|conf_value|conf_level|confidence_reason|spread_terms|dominant|track_state|score_q|size_band|json|undefined|nan|null|true|false)\b/iu;

/** Em dash and en dash: forbidden in every UI string (project CLAUDE.md). */
const LONG_DASH = /[—–]/u;

/** The level word beside every score. "alta" is included so a scenario can
 * prove it is ABSENT; no scenario ever requires it to render. */
const LEVEL_WORD = /confianza\s+(alta|media|baja)/iu;

const LEVEL_WORD_ES: Readonly<Record<string, string>> = { high: 'alta', medium: 'media', low: 'baja' };

/** Confidence carries its level by shape as well as by word: the design system
 * specifies glyph dots beside the word and no colour at all
 * (09-design-system.md section 9, "colour never carries meaning alone"). */
const SHAPE_GLYPHS = /[●○]{2,}/u;

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: un surfista decide en segundos si maneja dos horas, y la razón no puede nombrar una causa que no pesó ni prometer más certeza de la que los datos ganaron. HOW: ${how}`,
  );
}

// ---------------------------------------------------------------------------
// Producer half: the published morning, through the pipeline's own ports
// ---------------------------------------------------------------------------

type PublishedReasonRow = {
  readonly where: string;
  readonly spot_id: string;
  readonly conf_level: string | undefined;
  readonly reason: string | null;
};

type TrustWorld = PipelineWorld & {
  trustPublished?: PublishedReasonRow[];
  trustContext?: BrowserContext;
  trustPage?: Page;
  trustRoute?: string;
  trustObservedRows?: ObservedConfidence[];
  trustObservedDays?: ObservedConfidence[];
};

function trustWorld(world: PipelineWorld): TrustWorld {
  return world as TrustWorld;
}

/** Accepts either shape so the oracle binds whichever DELIVER picks: the flat
 * `confidence_reason_es` (the reading surface's `call_es` precedent) or the
 * nested `confidence_reason: { es }` (the bundle's `call: { es }` precedent,
 * P1's canonical name). Anything else is "absent". */
function reasonOf(row: Record<string, unknown>): string | null {
  const flat = row.confidence_reason_es;
  if (typeof flat === 'string') return flat;
  const nested = row.confidence_reason;
  if (typeof nested === 'string') return nested;
  if (typeof nested === 'object' && nested !== null) {
    const spanish = (nested as Record<string, unknown>).es;
    if (typeof spanish === 'string') return spanish;
  }
  return null;
}

async function publishedReasonRows(world: TrustWorld): Promise<PublishedReasonRow[]> {
  const body = await world.store.get('pub/v1/regions/pa-pacific/bundle.json');
  assert.ok(
    body,
    `no region bundle was published at pub/v1/regions/pa-pacific/bundle.json.${world.failureContext()}`,
  );
  const bundle = JSON.parse(body) as {
    days: { date: string; spots: Record<string, unknown>[] }[];
    publish_surface: { days: { date: string; spots: Record<string, unknown>[] }[] };
  };
  const rows: PublishedReasonRow[] = [];
  for (const [index, day] of bundle.days.entries()) {
    for (const spot of day.spots) {
      rows.push({
        where: `el resumen del día ${index} (${day.date})`,
        spot_id: String(spot.spot_id),
        conf_level: typeof spot.conf_level === 'string' ? spot.conf_level : undefined,
        reason: reasonOf(spot),
      });
    }
  }
  for (const [index, day] of bundle.publish_surface.days.entries()) {
    for (const spot of day.spots) {
      rows.push({
        where: `la superficie de lectura del día ${index} (${day.date})`,
        spot_id: String(spot.spot_id),
        conf_level: typeof spot.conf_level === 'string' ? spot.conf_level : undefined,
        reason: reasonOf(spot),
      });
    }
  }
  assert.ok(rows.length > 0, `the published morning carried no ranked rows at all.${world.failureContext()}`);
  return rows;
}

function publishedRows(world: TrustWorld): PublishedReasonRow[] {
  const rows = world.trustPublished;
  assert.ok(rows, 'test fixture error: run "esa mañana se arma y se publica" first');
  return rows;
}

/**
 * Every published row that carries a reason. Deliberately NOT a filter that can
 * empty out silently: `withReasons` is always paired with a caller that fails
 * when the set is empty, so "nothing to inspect" can never read as "all clean".
 */
function reasonsOrFindings(rows: readonly PublishedReasonRow[]): { reasons: PublishedReasonRow[]; findings: string[] } {
  const reasons = rows.filter((row) => row.reason !== null);
  const findings = reasons.length === 0
    ? [`ninguna de las ${rows.length} filas publicadas trae una razón: no hay ni una frase que revisar`]
    : [];
  return { reasons, findings };
}

Given('una mañana sin dato de marea, con los modelos pareciéndose entre ellos', function (this: PipelineWorld) {
  this.spots = [venaoSeed];
  this.source.members = MODELS_THAT_AGREE;
  this.source.tideDark = true;
});

Given('una mañana con el dato de la marea completo y los modelos partidos en el período', function (this: PipelineWorld) {
  this.spots = [venaoSeed];
  this.source.members = MODELS_SPLIT_ON_PERIOD;
  this.source.tideDark = false;
});

Given('una mañana en la que solo respondió un modelo', function (this: PipelineWorld) {
  this.spots = [venaoSeed];
  this.source.members = MODELS_THAT_AGREE;
  this.source.tideDark = true;
  for (const spec of MODELS_THAT_AGREE.slice(1)) this.source.dark.add(spec.source);
});

When('esa mañana se arma y se publica', { timeout: 60_000 }, async function (this: PipelineWorld) {
  const world = trustWorld(this);
  await world.publishMorning('la mañana de la confianza', MORNING_DATE);
  world.trustPublished = await publishedReasonRows(world);
});

Then('la superficie que leen las páginas trae la razón de cada playa y cada día', function (this: PipelineWorld) {
  const rows = publishedRows(trustWorld(this));
  const findings = rows
    .filter((row) => row.reason === null)
    .map((row) => `${row.where} publicó "${row.spot_id}" sin razón`);
  assertBehavior(
    findings,
    'componer la razón por (spot, día) a partir de lo que confidence() ya calcula (la entrada que falta, el término de spread que manda, el estado del historial) y llevarla al resumen del día Y a la superficie que leen las páginas: hoy surfaceCall() y daySummary() descartan las dos.',
  );
});

Then('cada razón nombra la marea que falta', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (!NAMES_THE_TIDE.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" no nombra la marea que falta: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'cuando missing contiene la marea el tope de 0.7 es lo que decide el nivel, así que la razón tiene que nombrar esa ausencia por su nombre (05-scoring-engine.md sección 3.6, fila de aplicación del tope).',
  );
});

Then('ninguna razón culpa a los modelos de un desacuerdo que no hubo', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (CLAIMS_MODEL_DISAGREEMENT.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" habla de desacuerdo entre modelos cuando no lo hubo: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'la razón solo puede nombrar la causa que de verdad ató el nivel; una fila cuyos modelos coinciden y cuyo nivel lo topó una entrada ausente nunca puede leerse como desacuerdo.',
  );
});

Then('cada razón cabe en ciento sesenta caracteres y no filtra nada del código', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    const reason = row.reason ?? '';
    const length = [...reason].length;
    if (length > REASON_MAX_CHARS) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" mide ${length} caracteres, más de ${REASON_MAX_CHARS}`);
    }
    if (LEAKS_RAW_DATA.test(reason)) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" filtra texto del código: "${reason}"`);
    }
    if (LONG_DASH.test(reason)) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" trae una raya larga`);
    }
  }
  assertBehavior(
    findings,
    'la razón publicada está acotada a 160 caracteres por P1 (application-architecture.md sección 7) y la superficie en español no lleva nombres de modelos, nombres de campos ni rayas largas.',
  );
});

Then('cada razón dice que todavía nadie ha reportado desde la playa', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (!SAYS_NOBODY_REPORTED.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" no dice que nadie ha reportado desde la playa: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'con c_fresh nulo la regla de copia de 05 sección 6.3 obliga a nombrar la ausencia, y tiene que salir de ese dato de entrada, no escrito a mano, para que la frase se dé vuelta sola el día que existan reportes.',
  );
});

Then('cada razón dice que este spot todavía no tiene historial verificado', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (!NAMES_A_TRACK_RECORD_GAP.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" no dice que no hay historial verificado: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'con track_state en "unverified" la regla de copia de 05 sección 6.2 obliga a nombrarlo, y tiene que salir de ese dato de entrada para que la frase cambie sola el día que el scorecard pase sus puertas.',
  );
});

Then('ninguna razón publicada reclama ni sugiere una confirmación desde la playa', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (CLAIMS_BEACH_CONFIRMATION.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" reclama o sugiere una confirmación desde la playa: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'hoy no existe ni un reporte de playa en el sistema; la razón nunca puede escribir que alguien confirmó o vio las condiciones.',
  );
});

Then('ninguna playa se publica con confianza alta', function (this: PipelineWorld) {
  const rows = publishedRows(trustWorld(this));
  const findings = rows
    .filter((row) => row.conf_level === 'high')
    .map((row) => `${row.where}: "${row.spot_id}" se publicó con confianza alta sin el dato de la marea`);
  assertBehavior(
    findings,
    'con la marea ausente cap_missing_tide = 0.7 cae justo sobre la frontera de alta (alta necesita c_total > 0.7), así que alta es inalcanzable hoy por aritmética. La alcanza slice-02 con marea real, jamás bajando un tope ni una frontera.',
  );
});

Then('cada razón nombra el desacuerdo de período', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (!NAMES_THE_PERIOD.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" no nombra el período, que es el término que manda: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'spread_terms ya trae la descomposición de la penalización y dominant ya dice cuál manda; la razón nombra ese término en palabras de surfista (05-scoring-engine.md sección 6.1).',
  );
});

Then('ninguna razón nombra la marea', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (NAMES_THE_TIDE.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" nombra la marea aunque la marea llegó completa: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'con missing vacío ningún tope ató el nivel, así que nombrar la marea sería nombrar una causa que no pesó.',
  );
});

Then('cada razón dice que respondió un solo modelo', function (this: PipelineWorld) {
  const { reasons, findings } = reasonsOrFindings(publishedRows(trustWorld(this)));
  for (const row of reasons) {
    if (!SAYS_ONE_MODEL_ANSWERED.test(row.reason ?? '')) {
      findings.push(`${row.where}: la razón de "${row.spot_id}" no dice que respondió un solo modelo: "${row.reason}"`);
    }
  }
  assertBehavior(
    findings,
    'con members_used = 1 el tope f(M) de 0.4 es lo que decide (05-scoring-engine.md sección 6.1); la razón lo dice tal cual en vez de fingir un desacuerdo que no puede existir con un solo modelo.',
  );
});

// ---------------------------------------------------------------------------
// Reading half: the real build, served over real HTTP, read in Chromium
// ---------------------------------------------------------------------------

const projectRoot = process.cwd();

type BuiltSite = {
  readonly root: string;
  readonly distRoot: string;
  readonly baseUrl: string;
  readonly server: http.Server;
  readonly planted: Map<string, Profile>;
  readonly dates: readonly [string, string];
};

let builtSitePromise: Promise<BuiltSite> | null = null;
let browserPromise: Promise<Browser> | null = null;

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

function copyProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-trust-slice-01-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    cpSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  // A directory junction keeps the isolated build offline while using the exact
  // installed dependency tree. Nothing is installed or downloaded.
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

function panamaCivilDate(offsetDays: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function profileFor(spotId: string, day: 0 | 1): Profile {
  const assignment = fixture.by_spot[spotId] ?? fixture.default_profile;
  const name = day === 0 ? assignment.today : assignment.tomorrow;
  const profile = fixture.profiles[name];
  assert.ok(profile, `test fixture error: unknown profile "${name}"`);
  return profile;
}

function plantKey(spotId: string, day: 0 | 1): string {
  return `${spotId}::${day}`;
}

/**
 * Plants producer-shaped values on THIS ISOLATED COPY of the published surface
 * only. The shared, committed data/published-surface.json is never written:
 * a dedicated producer lane owns regenerating that one with real values.
 *
 * The surface is also re-dated to Panama's today and tomorrow, because
 * `publish:surface --verify` refuses a surface whose first day is not today.
 * Without this the suite would go BROKEN the morning after the committed data
 * was generated, and a setup failure is not a RED.
 */
function plantPerRowReasons(root: string): { planted: Map<string, Profile>; dates: readonly [string, string] } {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as {
    current: {
      surf_date: string;
      calls: Record<string, unknown>[];
      days: [{ date: string; spots: Record<string, unknown>[] }, { date: string; spots: Record<string, unknown>[] }];
    };
  };
  const dates = [panamaCivilDate(0), panamaCivilDate(1)] as const;
  surface.current.surf_date = dates[0];
  surface.current.days[0].date = dates[0];
  surface.current.days[1].date = dates[1];

  const planted = new Map<string, Profile>();
  const apply = (row: Record<string, unknown>, day: 0 | 1): void => {
    const spotId = String(row.spot_id);
    const profile = profileFor(spotId, day);
    row.conf_level = profile.conf_level;
    if (profile.reason_es === null) delete row.confidence_reason_es;
    else row.confidence_reason_es = profile.reason_es;
    planted.set(plantKey(spotId, day), profile);
  };

  // forecast.ts reads today from `current.calls` (its documented legacy alias
  // for days[0]) and tomorrow from `current.days[1].spots`. days[0].spots is
  // planted identically so the two halves of the same day can never disagree.
  for (const row of surface.current.calls) apply(row, 0);
  for (const row of surface.current.days[0].spots) apply(row, 0);
  for (const row of surface.current.days[1].spots) apply(row, 1);

  assert.ok(
    planted.has(plantKey(fixture.degraded_spot_id, 0)),
    `test fixture error: ${fixture.degraded_spot_id} is not in the installed ranking`,
  );
  assert.ok(
    planted.has(plantKey(fixture.spot_page_spot_id, 0)) && planted.has(plantKey(fixture.spot_page_spot_id, 1)),
    `test fixture error: ${fixture.spot_page_spot_id} is not in both installed day rankings`,
  );

  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
  return { planted, dates };
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * `build.format: 'file'` emits `dist/manana.html` and `dist/spots/<id>.html`,
 * while the links point at `/manana/` and `/spots/<id>/`. This resolver does
 * exactly that mapping and nothing more: exact file, else trailing-slash
 * stripped plus `.html`, else `.html` appended, else a real 404. No SPA
 * fallback and no directory index, so a route this feature fails to emit
 * surfaces as a 404 the step asserts on, never as a silent index.html.
 */
function resolveDocument(distRoot: string, pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;
  const candidates: string[] = [];
  if (safe === '/' || safe === '') candidates.push('index.html');
  else if (safe.endsWith('/')) candidates.push(`${safe.replace(/\/+$/, '')}.html`, `${safe}index.html`);
  else candidates.push(safe, `${safe}.html`, `${safe}/index.html`);
  for (const candidate of candidates) {
    const path = resolve(distRoot, candidate.replace(/^\//, ''));
    if (!path.startsWith(distRoot)) return null;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

async function startStaticServer(distRoot: string): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolveServer, rejectServer) => {
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const document = resolveDocument(distRoot, pathname);
      if (document === null) {
        response.writeHead(404, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': CONTENT_TYPES[extname(document)] ?? 'application/octet-stream',
      });
      response.end(readFileSync(document));
    });
    server.on('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        rejectServer(new Error('test fixture error: the static server reported no port'));
        return;
      }
      resolveServer({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function ensureBuiltSite(): Promise<BuiltSite> {
  builtSitePromise ??= (async (): Promise<BuiltSite> => {
    const root = copyProject();
    const { planted, dates } = plantPerRowReasons(root);
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: root,
      env: credentialFreeEnvironment(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (build.status !== 0) {
      throw new Error(`test fixture error: the published surface failed to build before any behavior oracle:\n${build.stdout}\n${build.stderr}`);
    }
    const distRoot = resolve(root, 'dist');
    const { server, baseUrl } = await startStaticServer(distRoot);
    return { root, distRoot, baseUrl, server, planted, dates };
  })();
  return builtSitePromise;
}

function ensureBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ headless: true });
  return browserPromise;
}

async function openPage(
  world: TrustWorld,
  route: string,
  theme: string,
  movement: string,
): Promise<Page> {
  const site = await ensureBuiltSite();
  const browser = await ensureBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const response = await page.goto(`${site.baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  assert.ok(
    response !== null && response.status() === 200,
    `test fixture error: ${route} answered ${response === null ? 'nothing' : response.status()}; the oracle never ran`,
  );
  world.trustContext = context;
  world.trustPage = page;
  world.trustRoute = route;
  return page;
}

function requiredPage(world: TrustWorld): Page {
  assert.ok(world.trustPage, 'test fixture error: the built surface must be open first');
  return world.trustPage;
}

/** What one confidence block actually shows a person. */
type ObservedConfidence = {
  readonly label: string;
  readonly spot_id: string;
  readonly day: 0 | 1;
  /** The whole container's visible text before anything is opened. */
  readonly closedText: string;
  /** The visible level word, e.g. "Confianza media", or '' when absent. */
  readonly wordText: string;
  /** The text revealed by tapping, with the trigger's own words removed. */
  readonly reasonText: string;
  readonly hasDisclosure: boolean;
};

/**
 * innerText, never textContent, and that is load-bearing. textContent returns
 * the words of an element that is display:none, visibility:hidden or zero
 * sized, so an implementation that emitted the markup and never rendered it
 * would satisfy every text oracle below. With innerText an invisible reason
 * reads as '' and the assertion reports an empty box.
 */
async function observeConfidence(
  page: Page,
  containerSelector: string,
  label: string,
  spotId: string,
  day: 0 | 1,
): Promise<ObservedConfidence> {
  const container = page.locator(containerSelector);
  if ((await container.count()) === 0) {
    return { label, spot_id: spotId, day, closedText: '', wordText: '', reasonText: '', hasDisclosure: false };
  }
  const closedText = ((await container.innerText()).trim());
  const summary = container.locator('details.confidence summary');
  const hasDisclosure = (await summary.count()) > 0;
  let reasonText = '';
  let wordText = '';
  if (hasDisclosure) {
    wordText = (await summary.innerText()).trim();
    await summary.click();
    const opened = (await container.locator('details.confidence').innerText()).trim();
    reasonText = opened.startsWith(wordText) ? opened.slice(wordText.length).trim() : opened;
    // Every disclosure shares name="confidence" (an exclusive HTML5 group), so
    // closing it here keeps this block's panel from covering the next one.
    await summary.click();
  } else {
    wordText = closedText;
  }
  return { label, spot_id: spotId, day, closedText, wordText, reasonText, hasDisclosure };
}

async function observeRankedRows(page: Page, day: 0 | 1): Promise<ObservedConfidence[]> {
  const rows = page.locator('ol.ranked > li');
  const count = await rows.count();
  assert.ok(count > 0, 'test fixture error: the published ranking rendered no rows at all');
  const observed: ObservedConfidence[] = [];
  for (let index = 0; index < count; index += 1) {
    const href = await rows.nth(index).locator('a[href^="/spots/"]').first().getAttribute('href');
    assert.ok(href, `test fixture error: row ${index + 1} has no link to its spot page`);
    const spotId = href.replace(/^\/spots\//, '').replace(/\/$/, '');
    observed.push(await observeConfidence(page, `ol.ranked > li >> nth=${index}`, `la fila ${index + 1} (${spotId})`, spotId, day));
  }
  return observed;
}

function observedRows(world: TrustWorld): ObservedConfidence[] {
  const rows = world.trustObservedRows;
  assert.ok(rows, 'test fixture error: open a published list and tap its confidence first');
  return rows;
}

function observedDays(world: TrustWorld): ObservedConfidence[] {
  const days = world.trustObservedDays;
  assert.ok(days, 'test fixture error: open the spot page and tap its confidence first');
  return days;
}

function routeForList(list: string): { route: string; day: 0 | 1 } {
  if (list === 'la lista de hoy') return { route: '/', day: 0 };
  if (list === 'la lista de mañana') return { route: '/manana/', day: 1 };
  throw new Error(`test fixture error: unknown list "${list}"`);
}

Given('una mañana publicada donde cada playa trae su propia razón', { timeout: 600_000 }, async function () {
  await ensureBuiltSite();
});

When(
  'el surfista abre {string} y toca la confianza de cada fila',
  { timeout: 120_000 },
  async function (this: PipelineWorld, list: string) {
    const world = trustWorld(this);
    const { route, day } = routeForList(list);
    const page = await openPage(world, route, 'claro', 'normal');
    world.trustObservedRows = await observeRankedRows(page, day);
  },
);

When(
  'el surfista abre la página de su playa y toca la confianza de cada día',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const world = trustWorld(this);
    const page = await openPage(world, `/spots/${fixture.spot_page_spot_id}/`, 'claro', 'normal');
    world.trustObservedDays = [
      await observeConfidence(page, 'section[data-day="today"]', 'la sección de hoy', fixture.spot_page_spot_id, 0),
      await observeConfidence(page, 'section[data-day="tomorrow"]', 'la sección de mañana', fixture.spot_page_spot_id, 1),
    ];
  },
);

When(
  'el surfista abre la página de su playa a {int} px con tema {string} y movimiento {string}',
  { timeout: 120_000 },
  async function (this: PipelineWorld, width: number, theme: string, movement: string) {
    assert.equal(width, 390, 'test fixture error: this feature declares 390 px as its smallest width');
    const world = trustWorld(this);
    const page = await openPage(world, `/spots/${fixture.spot_page_spot_id}/`, theme, movement);
    world.trustObservedDays = [
      await observeConfidence(page, 'section[data-day="today"]', 'la sección de hoy', fixture.spot_page_spot_id, 0),
      await observeConfidence(page, 'section[data-day="tomorrow"]', 'la sección de mañana', fixture.spot_page_spot_id, 1),
    ];
  },
);

async function plantedReason(spotId: string, day: 0 | 1): Promise<string | null> {
  const site = await ensureBuiltSite();
  const profile = site.planted.get(plantKey(spotId, day));
  assert.ok(profile, `test fixture error: nothing was planted for ${spotId} on day ${day}`);
  return profile.reason_es;
}

function assertReasonNamesItsOwnDay(rows: readonly ObservedConfidence[]): void {
  const findings: string[] = [];
  for (const row of rows) {
    if (!row.hasDisclosure) continue;
    const expected = row.day === 0 ? 'Hoy' : 'Mañana';
    const otherDay = row.day === 0 ? 'Mañana' : 'Hoy';
    if (!new RegExp(`\\b${expected}\\b`, 'iu').test(row.reasonText)) {
      findings.push(`${row.label} abre una razón de ${row.day === 0 ? 'hoy' : 'mañana'} que no nombra "${expected}": "${row.reasonText}"`);
    }
    if (new RegExp(`\\b${otherDay}\\b`, 'iu').test(row.reasonText)) {
      findings.push(`${row.label} abre una razón de ${row.day === 0 ? 'hoy' : 'mañana'} que nombra "${otherDay}": "${row.reasonText}"`);
    }
  }
  assertBehavior(
    findings,
    'cada razón publicada pertenece a su propio día: las filas y secciones de Hoy dicen "Hoy", las de Mañana dicen "Mañana". Una razón ausente sigue callada y no inventa ninguno de los dos.',
  );
}

Then('cada fila abre la razón publicada para esa playa y ese día', async function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this));
  const findings: string[] = [];
  let inspected = 0;
  for (const row of rows) {
    const published = await plantedReason(row.spot_id, row.day);
    if (published === null) continue;
    inspected += 1;
    if (row.reasonText !== published) {
      findings.push(`${row.label} abre "${row.reasonText}" cuando su mañana publicó "${published}"`);
    }
  }
  if (inspected === 0) findings.push('ninguna fila de esta lista tenía razón publicada: no hay nada que comparar');
  assertBehavior(
    findings,
    'pasarle a <Confidence /> la razón de ESA fila y ESE día y renderizarla tal cual; hoy la razón se deriva del nivel con confidenceReasonEs(level), así que las veinte filas dicen exactamente lo mismo.',
  );
  assertReasonNamesItsOwnDay(rows);
});

Then('dos playas con razones distintas no muestran el mismo texto', async function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this));
  const findings: string[] = [];
  const seen = new Map<string, { spot: string; shown: string }>();
  for (const row of rows) {
    const published = await plantedReason(row.spot_id, row.day);
    if (published === null) continue;
    const twin = seen.get(row.reasonText);
    if (twin !== undefined && twin.shown !== published) {
      findings.push(`"${row.spot_id}" y "${twin.spot}" muestran el mismo texto aunque sus mañanas publicaron razones distintas`);
    }
    seen.set(row.reasonText, { spot: row.spot_id, shown: published });
  }
  if (seen.size === 0) findings.push('ninguna fila de esta lista abrió una razón: no hay nada que comparar');
  assertBehavior(
    findings,
    'la razón es un valor por (spot, día) del paquete publicado; dos playas con razones distintas no pueden terminar mostrando la misma frase.',
  );
});

Then('ninguna razón mostrada pasa de ciento sesenta caracteres', function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this)).filter((row) => row.reasonText !== '');
  const findings = rows.length === 0 ? ['ninguna fila abrió una razón: no hay nada que medir'] : [];
  for (const row of rows) {
    const length = [...row.reasonText].length;
    if (length > REASON_MAX_CHARS) {
      findings.push(`${row.label} muestra ${length} caracteres: "${row.reasonText}"`);
    }
  }
  assertBehavior(
    findings,
    'la razón publicada está acotada a 160 caracteres por P1 y la página la muestra tal cual; hoy la frase genérica derivada del nivel mide más de 200.',
  );
});

Then('ninguna razón mostrada agrega ni recorta nada de lo publicado', async function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this));
  const findings: string[] = [];
  let inspected = 0;
  for (const row of rows) {
    const published = await plantedReason(row.spot_id, row.day);
    if (published === null) continue;
    inspected += 1;
    if (row.reasonText.length > published.length && row.reasonText.includes(published)) {
      findings.push(`${row.label} le agrega texto a la razón publicada: "${row.reasonText}"`);
    } else if (published.startsWith(row.reasonText) && row.reasonText !== published) {
      findings.push(`${row.label} recorta la razón publicada: muestra "${row.reasonText}"`);
    } else if (row.reasonText !== published) {
      findings.push(`${row.label} muestra una razón que no es la publicada: "${row.reasonText}"`);
    }
  }
  if (inspected === 0) findings.push('ninguna fila tenía razón publicada: no hay nada que comparar');
  assertBehavior(findings, 'la página renderiza la razón publicada literalmente: ni la completa, ni la corta, ni la reescribe.');
});

Then('ninguna razón mostrada trae texto técnico, inglés ni rayas largas', function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this)).filter((row) => row.reasonText !== '');
  const findings = rows.length === 0 ? ['ninguna fila abrió una razón: no hay ni una frase que revisar'] : [];
  for (const row of rows) {
    if (LEAKS_RAW_DATA.test(row.reasonText)) findings.push(`${row.label} muestra texto del código: "${row.reasonText}"`);
    if (LONG_DASH.test(row.reasonText)) findings.push(`${row.label} muestra una raya larga`);
    if (CLAIMS_BEACH_CONFIRMATION.test(row.reasonText)) findings.push(`${row.label} sugiere una confirmación desde la playa: "${row.reasonText}"`);
  }
  assertBehavior(findings, 'la superficie en español no lleva nombres de modelos ni de campos, ni rayas largas, ni una confirmación de playa que no existe.');
});

Then(
  'la playa publicada sin razón muestra su palabra de confianza y no ofrece nada que abrir',
  function (this: PipelineWorld) {
    const rows = observedRows(trustWorld(this));
    const row = rows.find((candidate) => candidate.spot_id === fixture.degraded_spot_id);
    const findings: string[] = [];
    if (row === undefined) {
      findings.push(`"${fixture.degraded_spot_id}" no aparece en la lista de hoy`);
    } else {
      if (!LEVEL_WORD.test(row.wordText)) {
        findings.push(`${row.label} no muestra su palabra de confianza (encontrado: "${row.wordText}")`);
      }
      if (row.reasonText !== '') {
        findings.push(`${row.label} se publicó sin razón y aun así abre un texto: "${row.reasonText}"`);
      }
      if (row.hasDisclosure) {
        findings.push(`${row.label} se publicó sin razón y aun así ofrece un detalle que abrir`);
      }
    }
    assertBehavior(
      findings,
      'sin confidence_reason el bloque de la razón se omite y solo queda la palabra del nivel (P1: razón ausente degrada, conf_level ausente falla la publicación). Nunca una caja vacía, nunca una razón inventada.',
    );
  },
);

Then('en esa misma mañana la playa de al lado sí abre la suya', async function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this));
  const findings: string[] = [];
  const neighbours = rows.filter((row) => row.spot_id !== fixture.degraded_spot_id);
  let withReason = 0;
  for (const row of neighbours) {
    const published = await plantedReason(row.spot_id, row.day);
    if (published === null) continue;
    if (row.reasonText === published) withReason += 1;
  }
  if (withReason === 0) {
    findings.push(`ninguna de las ${neighbours.length} playas de al lado abre su razón publicada, así que el silencio de "${fixture.degraded_spot_id}" no prueba nada`);
  }
  assertBehavior(
    findings,
    'la ausencia solo es una decisión de diseño si sus vecinas sí muestran la suya en la misma mañana; si nadie la muestra, la página simplemente no tiene la función.',
  );
});

Then('cada sección de día muestra su palabra de confianza', async function (this: PipelineWorld) {
  const days = observedDays(trustWorld(this));
  const site = await ensureBuiltSite();
  const findings: string[] = [];
  for (const day of days) {
    const profile = site.planted.get(plantKey(day.spot_id, day.day));
    assert.ok(profile, `test fixture error: nothing planted for ${day.spot_id} day ${day.day}`);
    const expected = LEVEL_WORD_ES[profile.conf_level] ?? profile.conf_level;
    if (!LEVEL_WORD.test(day.wordText)) {
      findings.push(`${day.label} de la página de la playa no muestra ninguna palabra de confianza (encontrado: "${day.wordText}")`);
    } else if (!new RegExp(`confianza\\s+${expected}`, 'iu').test(day.wordText)) {
      findings.push(`${day.label} muestra "${day.wordText}" cuando su mañana publicó "${expected}"`);
    }
  }
  assertBehavior(
    findings,
    'montar <Confidence /> en las dos secciones de día de SpotDetail.astro, que hoy no renderiza confianza en ninguna: el charter pide la confianza en las filas de hoy, las de mañana Y las páginas de spot.',
  );
});

Then('cada sección de día abre la razón publicada para ese día', async function (this: PipelineWorld) {
  const days = observedDays(trustWorld(this));
  const findings: string[] = [];
  for (const day of days) {
    const published = await plantedReason(day.spot_id, day.day);
    if (published === null) {
      findings.push(`test fixture error: ${day.label} debería tener razón publicada`);
      continue;
    }
    if (day.reasonText !== published) {
      findings.push(`${day.label} abre "${day.reasonText}" cuando su mañana publicó "${published}"`);
    }
  }
  if (days.length < 2) findings.push('la página de la playa no tiene dos secciones de día que revisar');
  assertBehavior(
    findings,
    'cada sección de día usa la razón de SU día; hoy y mañana no comparten frase, igual que no comparten número.',
  );
  assertReasonNamesItsOwnDay(days);
});

Then('ningún color distingue un nivel de confianza de otro', async function (this: PipelineWorld) {
  const world = trustWorld(this);
  const page = requiredPage(world);
  const rows = observedRows(world);
  const findings: string[] = [];
  // The hero row is deliberately painted in a different ink (it sits on the
  // dawn gradient, 09-design-system.md), so it is excluded: this check is about
  // colour varying with LEVEL, not with position.
  const triggers = page.locator('ol.ranked > li:not(:first-child) details.confidence summary');
  const count = await triggers.count();
  if (count === 0) {
    findings.push('ninguna fila fuera del héroe muestra un disparador de confianza que medir');
  }
  const painted = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const state = await triggers.nth(index).evaluate((el) => {
      const computed = getComputedStyle(el);
      const details = el.closest('details');
      return {
        level: details?.getAttribute('data-level') ?? '',
        colour: `${computed.color} sobre ${computed.backgroundColor}`,
      };
    });
    painted.add(state.colour);
  }
  if (painted.size > 1) {
    findings.push(`las filas pintan la confianza de ${painted.size} maneras distintas (${[...painted].join(' / ')}): el color estaría cargando el nivel`);
  }
  if (rows.length === 0) findings.push('la lista no trajo filas');
  assertBehavior(
    findings,
    'la confianza es certeza, no veredicto: se pinta siempre con el mismo token de tinta y jamás en verde, ámbar o rojo (09-design-system.md secciones 6 y 9).',
  );
});

Then('cada nivel se lee por su forma además de su palabra', function (this: PipelineWorld) {
  const rows = observedRows(trustWorld(this));
  const findings: string[] = [];
  let inspected = 0;
  for (const row of rows) {
    if (row.wordText === '') {
      findings.push(`${row.label} no muestra palabra de confianza`);
      continue;
    }
    inspected += 1;
    if (!LEVEL_WORD.test(row.wordText)) {
      findings.push(`${row.label} no dice el nivel en palabras: "${row.wordText}"`);
    }
    if (!SHAPE_GLYPHS.test(row.wordText)) {
      findings.push(`${row.label} no lleva la forma del nivel junto a la palabra: "${row.wordText}"`);
    }
  }
  if (inspected === 0) findings.push('ninguna fila mostró confianza que revisar');
  assertBehavior(
    findings,
    'el indicador de confianza es puntos de glifo más la palabra del nivel, forma y palabra siempre juntas (09-design-system.md sección 9, receta del indicador de confianza).',
  );
});

// The contrast walker is passed to evaluate() as a STRING, not a function
// reference: this project's loader (tsx/esbuild) wraps named bindings in a
// __name(...) helper that does not exist inside Playwright's isolated realm.
// Walks up to the first ancestor that actually paints (a solid backgroundColor
// or gradient stops) and returns the worst-case ratio against the element's own
// text colour -- WCAG AA measured against the REAL rendered backdrop, never
// against white.
const CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT = `(el) => {
  const parseColor = (value) => {
    const match = value.match(/rgba?\\(([^)]+)\\)/i);
    if (!match || match[1] === undefined) return null;
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    const r = parts[0], g = parts[1], b = parts[2], a = parts[3];
    if (r === undefined || g === undefined || b === undefined) return null;
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  };
  const luminance = (c) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };
  const contrast = (fg, bg) => {
    const first = luminance(fg);
    const second = luminance(bg);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };
  const foreground = parseColor(getComputedStyle(el).color);
  if (foreground === null) return null;
  let node = el;
  while (node !== null) {
    const computed = getComputedStyle(node);
    const backgrounds = [];
    const solid = parseColor(computed.backgroundColor);
    if (solid !== null && solid.a > 0.99) backgrounds.push(solid);
    for (const match of computed.backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)) {
      const stop = parseColor(match[0]);
      if (stop !== null) backgrounds.push(stop);
    }
    if (backgrounds.length > 0) return Math.min(...backgrounds.map((background) => contrast(foreground, background)));
    node = node.parentElement;
  }
  return null;
}`;

/** The declared type scale (09-design-system.md section 5), in px. U6 refuses a
 * size that is not on it. */
const DECLARED_TYPE_SIZES_PX = [52, 28, 22, 22, 19, 17, 14, 13];

Then(
  'la confianza de cada día cumple las siete comprobaciones visuales sobre el fondo real',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const world = trustWorld(this);
    const page = requiredPage(world);
    const days = observedDays(world);
    const findings: string[] = [];

    // Count first. A visual audit over an empty set is the vacuous pass this
    // repository has already shipped once: "nothing to measure" must never read
    // as "AA is fine".
    const blocks = page.locator('section[data-day] details.confidence');
    const count = await blocks.count();
    if (count < 2) {
      findings.push(`se esperaban 2 bloques de confianza en la página de la playa (hoy y mañana) y hay ${count}: no hay nada que medir contra el fondo real`);
      assertBehavior(findings, 'montar la confianza en las dos secciones de día de la página de la playa antes de que ninguna comprobación visual pueda significar algo.');
      return;
    }

    // U2, page level: no horizontal scroll at 390 px.
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (geometry.scrollWidth > geometry.clientWidth) {
      findings.push(`U2: la página se desborda: scrollWidth ${geometry.scrollWidth} > clientWidth ${geometry.clientWidth}`);
    }

    for (let index = 0; index < count; index += 1) {
      const block = blocks.nth(index);
      const summary = block.locator('summary');
      const label = `el bloque de confianza ${index + 1}`;

      // U1: the trigger, measured against the real rendered backdrop.
      const summaryContrast: number | null = await summary.evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT);
      if (summaryContrast !== null && summaryContrast < 4.5) {
        findings.push(`U1: ${label} deja la palabra en ${summaryContrast.toFixed(2)}:1 contra su fondo real`);
      }

      // U3 + U4 + U6 + U7, measured on the trigger.
      const trigger = await summary.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const computed = getComputedStyle(el);
        return {
          width: rect.width,
          height: rect.height,
          right: rect.right,
          left: rect.left,
          fontSizePx: Number.parseFloat(computed.fontSize),
          lineHeight: computed.lineHeight,
          transitionDuration: computed.transitionDuration,
          animationName: computed.animationName,
          inlineStyle: el.getAttribute('style') ?? '',
          clientWidth: document.documentElement.clientWidth,
        };
      });
      if (trigger.width < 44 || trigger.height < 44) {
        findings.push(`U3: ${label} mide ${Math.round(trigger.width)}x${Math.round(trigger.height)} px, por debajo de 44`);
      }
      const moves = trigger.transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
        || (trigger.animationName.trim() !== '' && trigger.animationName.trim() !== 'none');
      if (moves) {
        findings.push(`U4: ${label} conserva movimiento con la preferencia del sistema puesta`);
      }
      if (!DECLARED_TYPE_SIZES_PX.some((size) => Math.abs(size - trigger.fontSizePx) < 0.6)) {
        findings.push(`U6: ${label} usa ${trigger.fontSizePx.toFixed(1)} px, que no está en la escala declarada`);
      }
      if (/#[0-9a-f]{3,8}\b/iu.test(trigger.inlineStyle)) {
        findings.push(`U7: ${label} lleva un color crudo en su atributo style: "${trigger.inlineStyle}"`);
      }
      if (trigger.right > trigger.clientWidth + 1 || trigger.left < -1) {
        findings.push(`U2: ${label} se sale de los 390 px`);
      }

      // U1 + U2 + U5 + U6, measured on the opened reason: the longest published
      // Spanish sentence must be readable, unclipped and never an empty box.
      await summary.click();
      const opened = await block.evaluate((el) => {
        const panel = el.querySelector(':scope > *:not(summary)') ?? el;
        const rect = panel.getBoundingClientRect();
        const computed = getComputedStyle(panel as Element);
        return {
          text: (panel as HTMLElement).innerText.trim(),
          clipped: panel.scrollHeight > rect.height + 1 || panel.scrollWidth > rect.width + 1,
          right: rect.right,
          left: rect.left,
          fontSizePx: Number.parseFloat(computed.fontSize),
          lineHeightPx: Number.parseFloat(computed.lineHeight),
          inlineStyle: (panel as HTMLElement).getAttribute('style') ?? '',
          clientWidth: document.documentElement.clientWidth,
        };
      });
      const measuredReasonContrast: unknown = await block
        .locator(':scope > *:not(summary)')
        .first()
        .evaluate(CONTRAST_AGAINST_REAL_BACKGROUND_SCRIPT)
        .catch(() => null);
      const reasonContrast: number | null = typeof measuredReasonContrast === 'number' ? measuredReasonContrast : null;
      await summary.click();

      if (opened.text === '') {
        findings.push(`U5: ${label} abre una caja vacía en vez de un estado diseñado`);
      }
      if (opened.clipped) {
        findings.push(`U6: ${label} recorta su razón en vez de dejarla envolver`);
      }
      if (opened.right > opened.clientWidth + 1 || opened.left < -1) {
        findings.push(`U2: ${label} abre su razón fuera de los 390 px`);
      }
      if (reasonContrast !== null && reasonContrast < 4.5) {
        findings.push(`U1: ${label} deja su razón en ${reasonContrast.toFixed(2)}:1 contra su fondo real`);
      }
      if (Number.isFinite(opened.lineHeightPx) && opened.lineHeightPx < opened.fontSizePx * 1.2) {
        findings.push(`U6: ${label} aprieta la razón a ${opened.lineHeightPx.toFixed(1)} px de interlínea sobre ${opened.fontSizePx.toFixed(1)} px de texto`);
      }
      if (/#[0-9a-f]{3,8}\b/iu.test(opened.inlineStyle)) {
        findings.push(`U7: ${label} lleva un color crudo en el atributo style de su razón`);
      }
    }

    // U5, the honest states: the two day sections must actually carry the
    // published reason, not a placeholder.
    for (const day of days) {
      if (day.reasonText === '') {
        findings.push(`U5: ${day.label} no tiene razón que mostrar`);
      }
    }

    assertBehavior(
      findings,
      'la confianza de la página de la playa se diseña con la calidad del resto: tokens nombrados, 44 px de toque, sin movimiento bajo la preferencia reducida, contraste AA contra el fondo real de la tarjeta y la frase más larga en español envolviendo sin recortarse.',
    );
  },
);

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

After({ tags: '@feature-f-know-how-much-to-trust-it', timeout: 30_000 }, async function (this: PipelineWorld) {
  const world = trustWorld(this);
  await world.trustPage?.close().catch(() => undefined);
  await world.trustContext?.close().catch(() => undefined);
});

AfterAll({ timeout: 30_000 }, async function () {
  if (browserPromise !== null) {
    await (await browserPromise).close().catch(() => undefined);
    browserPromise = null;
  }
  if (builtSitePromise !== null) {
    const site = await builtSitePromise.catch(() => null);
    builtSitePromise = null;
    if (site !== null) {
      await new Promise<void>((done) => site.server.close(() => done()));
      rmSync(site.root, { recursive: true, force: true });
    }
  }
});
