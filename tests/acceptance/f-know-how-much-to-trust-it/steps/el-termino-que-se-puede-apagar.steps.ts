// Slice-03 acceptance steps for F-KNOW-HOW-MUCH-TO-TRUST-IT: the disagreement
// term is removable, and removing it is a DATA change.
//
// ---------------------------------------------------------------------------
// THE ACCEPTANCE CONTRACT THIS FILE FIXES
// ---------------------------------------------------------------------------
// DELIVER owes three things in `src/scoring/confidence.ts` and one wiring line
// in `src/components/RankedList.astro`. If DELIVER houses any of it elsewhere,
// that is a renegotiation with DISTILL, not a silent move: these steps drive
// the seam recorded here.
//
//   1. The flag itself, a constant in the scoring core, all terms on:
//
//        export type ConfidenceFactors = { readonly spread: boolean };
//        export const CONFIDENCE_FACTORS: ConfidenceFactors = { spread: true };
//
//      05 section 6.1's removal clause names "a per-factor enable flag in the
//      constants file"; this module is the scoring core's constants surface and
//      the only one the render path already imports. Disabling the term is then
//      editing `true` to `false` in one place, which is what the last scenario
//      literally does before rebuilding the site.
//
//   2. A SIXTH, REQUIRED parameter on `confidence`, and a THIRD, REQUIRED
//      parameter on `modelAgreement`, both of type `ConfidenceFactors`. Passed
//      in, never reached for: this project's core reads no ambient state
//      (src/pipeline/ports.ts header, CLAUDE.md "Development Paradigm"). And
//      required, with no default value, because this repository's worst shipped
//      bug was an optional field that silently kept its old behaviour on
//      nineteen of twenty pages while every test stayed green.
//
//   3. The behaviour, all of it already declared upstream:
//      - 05 section 6.4, participating factors: `c_spread` participates
//        "unless removed per section 6.1". With the flag off it leaves the
//        `c_total` product and the level re-projects from what survives.
//      - 05 section 6.4, zero-informative-factor guard, restated as law L17:
//        "spread disabled AND track_state = unverified AND c_fresh = null
//        forces level = low with dominant = null" and "the reason names that
//        no usable confidence signal exists yet". An empty product reads 1.0,
//        alta, which is fabricated certainty.
//      - The reason never names a term that no longer participates, so
//        `modelAgreement` must refuse to produce a `compared` reading with the
//        flag off. It needs its OWN kind (the shape `{ kind: 'no_usable_signal' }`
//        is what these steps expect to see composed). It must NOT reuse
//        `not_comparable`, whose sentence says only one model can see the spot,
//        and must NOT reuse `unknown`, whose sentence claims the models
//        coincide in part. Both would name an agreement that no longer
//        participates. The flag check therefore comes BEFORE the
//        `isSilent(terms) && level === 'low'` branch.
//
// The two casts below are how this file stays RED rather than BROKEN while
// none of that exists: the extra argument is accepted and ignored by the
// current bodies, so every scenario RUNS and fails on the missing behaviour,
// never on an import error. `tsc --noEmit` stays green through the cast, so
// the RED is in the behaviour and nowhere else.
//
// ---------------------------------------------------------------------------
// WHAT THIS SLICE DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
// It does not run the calibration check, which lives in the learning lane and
// cannot run before reports exist. It touches no producer: the pipeline and the
// publish path are out of the approved slice-03 scope, so nothing here builds
// or republishes a bundle. The last scenario rebuilds the SITE from the already
// published surface, which is the render path this branch chose.
//
// Step phrasing is deliberately distant from slice-01's and slice-07's:
// cucumber's step registry is global and `strict: true`, so a near-duplicate
// phrase would bind to another feature's step and this feature would test
// nothing.

import { After, Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import {
  confidence,
  confidenceReasonEs,
  modelAgreement,
  type ConfidenceLevel,
  type ConfidenceResult,
  type ModelAgreement,
  type SpreadInput,
  type SpreadTerms,
} from '../../../../src/scoring/confidence';
import type { MemberRow } from '../../../../src/scoring/engine';

// ---------- the contract, expressed as types (see the header) ----------

type ConfidenceFactors = { readonly spread: boolean };

type ConfidenceWithFactors = (
  members: MemberRow[],
  spread: SpreadInput,
  track: { mae: number; mae_ref: number } | null,
  last_report_age_h: number | null,
  missing: ('wind' | 'tide')[],
  factors: ConfidenceFactors,
) => ConfidenceResult;

type ModelAgreementWithFactors = (
  terms: SpreadTerms,
  level: ConfidenceLevel,
  factors: ConfidenceFactors,
) => ModelAgreement;

const readConfidence = confidence as unknown as ConfidenceWithFactors;
const readAgreement = modelAgreement as unknown as ModelAgreementWithFactors;

/** The one edit that must be enough to switch the term off. */
const FACTOR_CONSTANT_ON = /(export\s+const\s+CONFIDENCE_FACTORS\b[^=]*=\s*\{[^}]*?\bspread\s*:\s*)true/u;

// ---------- fixture ----------

type MemberSet = { readonly label: string; readonly members: MemberRow[] };
type TrackRecord = { readonly label: string; readonly mae: number; readonly mae_ref: number };

type Fixture = {
  readonly split_on_period: MemberSet;
  readonly tight_agreement: MemberSet;
  readonly verified_track: TrackRecord;
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-03-factor-switch.json', import.meta.url),
  'utf8',
)) as Fixture;

const projectRoot = process.cwd();

// ---------- world ----------

type Reading = {
  readonly level: ConfidenceLevel;
  readonly reason: string;
};

type Disclosure = {
  readonly level: string;
  readonly reason: string;
};

type SwitchWorld = PipelineWorld & {
  switchMembers?: MemberRow[];
  switchTrack?: { mae: number; mae_ref: number } | null;
  switchMissing?: ('wind' | 'tide')[];
  switchFactors?: ConfidenceFactors;
  switchReading?: Reading;
  switchRoot?: string;
  switchConstantWasFound?: boolean;
  switchDisclosures?: Disclosure[];
};

function switchWorld(world: PipelineWorld): SwitchWorld {
  return world as SwitchWorld;
}

// ---------- observables, read as a surfer reads them ----------

/** The three things a surfer can act on. With the term off, none of them may
 * appear: a factor that does not participate cannot be named as a cause. */
const NAMES_A_SPREAD_VARIABLE = /tama[ñn]o|per[íi]odo|direcci[óo]n/iu;
/** Naming the period as the one they split on, in either shape the composed
 * sentence can take today. */
const NAMES_THE_PERIOD_SPLIT = /(?:no\s+coinciden\s+en|pero\s+no\s+en)[^.]*per[íi]odo/iu;
const CLAIMS_AGREEMENT = /modelos\s+coinciden/iu;
/** Settled copy (HANDOFF.md section 5, not to be relitigated). Switching a
 * term off must not blank the honest half of the sentence. */
const SAYS_NOBODY_REPORTED_HERE = /nadie\s+ha\s+mandado\s+un\s+reporte\s+desde\s+la\s+playa/iu;
/** 05 section 6.4: "the reason names that no usable confidence signal exists
 * yet". The wording is DELIVER's; the admission is not optional. */
const SAYS_NO_USABLE_SIGNAL = /no\s+hay\b[^.]{0,60}\bse[ñn]al\s+usable/iu;
/** Research 09 section 3.6: a qualitative flag, never a calibrated number. */
const SHOWS_A_FIGURE = /\d|%/u;

const LEVEL_WORDS: readonly string[] = ['low', 'medium', 'high'];

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: si el chequeo de calibración algún día prueba que el término del desacuerdo miente, quitarlo tiene que costar una constante y no una obra, porque si cuesta obra alguien lo va a dejar puesto mintiendo. HOW: ${how}`,
  );
}

// ---------- the reading, exactly as the published row composes it ----------

/**
 * The same two calls the render path makes, in the same order:
 * `RankedList.astro` derives the agreement from the published terms and the
 * level, and `Confidence.astro` composes the sentence from the level and that
 * agreement. Nothing here reaches past those two entry points.
 */
function readAsThePublishedRowDoes(world: SwitchWorld): Reading {
  const members = world.switchMembers;
  const factors = world.switchFactors;
  assert.ok(members, 'error de fixture: declare la mañana del spot en un Given primero');
  assert.ok(factors, 'error de fixture: declare el estado de las constantes en un Given primero');

  const result = readConfidence(
    members,
    { kind: 'absolute' },
    world.switchTrack ?? null,
    null,
    world.switchMissing ?? [],
    factors,
  );
  const agreement = readAgreement(result.spread_terms, result.level, factors);
  return { level: result.level, reason: confidenceReasonEs(result.level, agreement) };
}

function requiredReading(world: SwitchWorld): Reading {
  assert.ok(world.switchReading, 'error de fixture: lea la confianza del spot en el When primero');
  return world.switchReading;
}

// ---------- Given ----------

Given('un spot cuya mañana parte a los modelos en el período, con historial verificado', function (this: PipelineWorld) {
  const world = switchWorld(this);
  world.switchMembers = fixture.split_on_period.members;
  world.switchTrack = { mae: fixture.verified_track.mae, mae_ref: fixture.verified_track.mae_ref };
  world.switchMissing = [];
});

/**
 * The second, one-scenario line. It stands alone on purpose: the models
 * agreeing well is precisely what makes the switched-off term the ONLY thing
 * that could have carried signal, which is the case 05 section 6.4's guard
 * exists for. Chaining it onto the split morning would have been a Given that
 * overwrites everything the previous one set, which reads like a continuation
 * and is not one.
 */
Given(
  'un spot cuya mañana deja a los modelos pareciéndose entre ellos, sin historial verificado y sin un solo reporte de playa',
  function (this: PipelineWorld) {
    const world = switchWorld(this);
    world.switchMembers = fixture.tight_agreement.members;
    world.switchTrack = null;
    world.switchMissing = [];
  },
);

Given('ese mismo spot además se quedó sin dato de marea', function (this: PipelineWorld) {
  const world = switchWorld(this);
  assert.ok(world.switchMembers, 'error de fixture: este Given continúa la mañana del anterior');
  world.switchMissing = ['tide'];
});

Given('las constantes del proyecto llegan con todos los términos prendidos', function (this: PipelineWorld) {
  switchWorld(this).switchFactors = { spread: true };
});

Given('las constantes del proyecto llegan con el término del desacuerdo apagado', function (this: PipelineWorld) {
  switchWorld(this).switchFactors = { spread: false };
});

// ---------- When ----------

When('se lee la confianza de ese spot como la arma su fila publicada', function (this: PipelineWorld) {
  const world = switchWorld(this);
  world.switchReading = readAsThePublishedRowDoes(world);
});

// ---------- Then, the in-memory readings ----------

Then('la lectura nombra el período como la cosa en la que los modelos se parten', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = NAMES_THE_PERIOD_SPLIT.test(reading.reason)
    ? []
    : [`con todos los términos prendidos la lectura no nombra el período: "${reading.reason}"`];
  assertBehavior(
    findings,
    'con la bandera en true nada cambia: la lectura de siempre sigue nombrando la cosa en la que los modelos se parten, como desde slice-01.',
  );
});

Then('la lectura trae su palabra de confianza', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = LEVEL_WORDS.includes(reading.level)
    ? []
    : [`la lectura sale sin palabra de confianza: "${reading.level}"`];
  assertBehavior(
    findings,
    'apagar un término re-proyecta el nivel desde los que quedan; la confianza siempre se muestra (decisión 7 reconciliada con research 09 sección 3.6) y una lectura sin nivel es un fallo.',
  );
});

Then('la lectura conserva la frase de que nadie mandó todavía un reporte desde ese spot', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = SAYS_NOBODY_REPORTED_HERE.test(reading.reason)
    ? []
    : [`la lectura perdió la frase honesta de la falta de reportes: "${reading.reason}"`];
  assertBehavior(
    findings,
    'quitar el término del desacuerdo quita ese término y nada más: la frase de HANDOFF sección 5 no se toca, ni siquiera reemplazando la razón entera.',
  );
});

Then('la lectura no nombra ni el tamaño, ni el período, ni la dirección', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = NAMES_A_SPREAD_VARIABLE.test(reading.reason)
    ? [`con el término apagado la lectura todavía nombra una de las tres cosas: "${reading.reason}"`]
    : [];
  assertBehavior(
    findings,
    'con la bandera en false, modelAgreement no puede devolver una lectura comparada: sale antes, con su propia forma, y la frase no nombra ninguna de las tres cosas.',
  );
});

Then('el nivel sube a lo que el historial verificado gana por sí solo', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = reading.level === 'high'
    ? []
    : [`con el término apagado el nivel quedó en "${reading.level}" en vez de subir a alta, que es lo que el historial verificado gana solo`];
  assertBehavior(
    findings,
    'el término apagado sale del producto de 05 sección 6.4: queda c_track = clip(1 - 3/12) = 0.75, por encima de 0.7, y el nivel lo refleja en vez de arrastrar la penalización de un factor que ya no participa.',
  );
});

Then('la lectura no muestra ninguna cifra ni ningún porcentaje', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = SHOWS_A_FIGURE.test(reading.reason)
    ? [`la lectura muestra una cifra: "${reading.reason}"`]
    : [];
  assertBehavior(
    findings,
    'la confianza es una palabra y una explicación, nunca una cifra calibrada (research 09 sección 3.6), y apagar un término no es excusa para empezar a mostrar una.',
  );
});

Then('la marea ausente le pone techo al nivel y la lectura se queda justo debajo de confianza alta', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings: string[] = [];
  if (reading.level === 'high') {
    findings.push('con la marea a oscuras la lectura llegó a confianza alta, o sea que el tope de la marea ausente dejó de aplicar');
  } else if (reading.level !== 'medium') {
    findings.push(`con la marea a oscuras y el término apagado la lectura quedó en "${reading.level}" en vez de quedarse justo en el tope que la marea ausente le permite`);
  }
  assertBehavior(
    findings,
    'apagar un término no apaga los demás: el tope por dato ausente de 05 sección 6.4 sigue mordiendo, min(0.75, 0.7) = 0.7, o sea media y nunca alta.',
  );
});

Then('la lectura sale con confianza baja', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = reading.level === 'low'
    ? []
    : [`sin ningún factor informando la lectura salió con confianza "${reading.level}" en vez de baja`];
  assertBehavior(
    findings,
    'con el término apagado, el historial sin verificar y ni un reporte, un producto vacío leería 1.0 y diría alta: certeza fabricada. La guardia de 05 sección 6.4, ley L17, fuerza baja.',
  );
});

Then('la lectura admite que todavía no hay una señal usable para medir la confianza', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = SAYS_NO_USABLE_SIGNAL.test(reading.reason)
    ? []
    : [`la lectura no admite que no queda señal usable: "${reading.reason}"`];
  assertBehavior(
    findings,
    'cuando ningún factor informativo sobrevive la razón lo dice tal cual (05 sección 6.4): nombrar cualquier otra causa sería inventar una señal que no existe.',
  );
});

Then('la lectura nunca dice que los modelos coinciden', function (this: PipelineWorld) {
  const reading = requiredReading(switchWorld(this));
  const findings = CLAIMS_AGREEMENT.test(reading.reason)
    ? [`con el término apagado la lectura todavía reclama acuerdo entre modelos: "${reading.reason}"`]
    : [];
  assertBehavior(
    findings,
    'los modelos sí se parecían, pero el término que leía ese parecido está apagado: repetir su conclusión sería publicar la salida de un factor que ya no participa.',
  );
});

// ---------- the rebuilt site: removing it really is a data change ----------

function credentialFreeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  return environment;
}

/** Same isolation contract slice-01 and slice-07 use: an isolated copy of the
 * production site, never the committed tree. */
function copyProjectForRebuild(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-trust-switch-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    cpSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

/** The whole claim of this slice, executed literally: ONE constant edited from
 * true to false, nothing else touched. Returns false when the constant does not
 * exist yet, which is itself the finding. */
function switchTheTermOffInTheConstants(root: string): boolean {
  const path = join(root, 'src/scoring/confidence.ts');
  const source = readFileSync(path, 'utf8');
  if (!FACTOR_CONSTANT_ON.test(source)) return false;
  writeFileSync(path, source.replace(FACTOR_CONSTANT_ON, '$1false'));
  return true;
}

function rebuildSite(root: string): void {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`El sitio no se pudo rearmar antes de poder observar nada:\n${build.stdout}\n${build.stderr}`);
  }
}

function stripMarkup(html: string): string {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

/** Every page of the Spanish surface the rebuild emitted. Walked rather than
 * listed so a new route cannot quietly escape the check; `dist/en` is left out
 * because the reason copy this slice governs is composed in Spanish only. */
function spanishPagesIn(distRoot: string, relative = ''): string[] {
  const pages: string[] = [];
  for (const entry of readdirSync(join(distRoot, relative), { withFileTypes: true })) {
    const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      if (next === 'en' || next === '_astro') continue;
      pages.push(...spanishPagesIn(distRoot, next));
    } else if (entry.name.endsWith('.html')) {
      pages.push(next);
    }
  }
  return pages;
}

/** Every confidence disclosure the rebuilt site actually wrote, read off the
 * emitted HTML: green tests do not mean it works, so the oracle is what a
 * browser would receive. */
function disclosuresIn(root: string): Disclosure[] {
  const distRoot = join(root, 'dist');
  const found: Disclosure[] = [];
  for (const page of spanishPagesIn(distRoot)) {
    const html = readFileSync(join(distRoot, page), 'utf8');
    for (const block of html.matchAll(/<details[^>]*data-level="([^"]*)"[^>]*>([\s\S]*?)<\/details>/gu)) {
      const body = block[2] ?? '';
      const reason = body.replace(/<summary[\s\S]*?<\/summary>/u, '');
      found.push({ level: block[1] ?? '', reason: stripMarkup(reason) });
    }
  }
  return found;
}

When(
  'se rearma el sitio entero con esas constantes y se leen las razones que quedaron escritas',
  { timeout: 300_000 },
  function (this: PipelineWorld) {
    const world = switchWorld(this);
    const factors = world.switchFactors;
    assert.ok(factors, 'error de fixture: declare el estado de las constantes en un Given primero');
    assert.equal(factors.spread, false, 'error de fixture: este escenario existe para el término apagado');
    world.switchRoot = copyProjectForRebuild();
    world.switchConstantWasFound = switchTheTermOffInTheConstants(world.switchRoot);
    rebuildSite(world.switchRoot);
    world.switchDisclosures = disclosuresIn(world.switchRoot);
  },
);

function requiredDisclosures(world: SwitchWorld): Disclosure[] {
  assert.ok(world.switchDisclosures, 'error de fixture: rearme el sitio en el When primero');
  return world.switchDisclosures;
}

/** The missing constant leads every finding list on this scenario, so a run
 * against a branch where the flag does not exist yet says so in one line
 * instead of only reporting the copy it failed to change. */
function constantFindings(world: SwitchWorld): string[] {
  return world.switchConstantWasFound === true
    ? []
    : ['src/scoring/confidence.ts no declara todavía la constante CONFIDENCE_FACTORS con spread en true, así que no hubo nada que apagar'];
}

/** The rebuilt surface carries forty disclosures, so one broken rule produces
 * forty identical lines. Three examples and a count say the same thing and stay
 * readable in a terminal. */
function firstFew(offenders: readonly string[], what: string): string[] {
  if (offenders.length === 0) return [];
  const examples = offenders.slice(0, 3);
  const rest = offenders.length - examples.length;
  return rest === 0 ? examples : [...examples, `y ${rest} razón(es) más con ${what}`];
}

Then('ninguna razón del sitio rearmado nombra ni el tamaño, ni el período, ni la dirección', function (this: PipelineWorld) {
  const world = switchWorld(this);
  const disclosures = requiredDisclosures(world);
  const findings = constantFindings(world);
  if (disclosures.length === 0) {
    findings.push('el sitio rearmado no escribió ni una sola razón de confianza que revisar');
  }
  findings.push(...firstFew(
    disclosures
      .filter((disclosure) => NAMES_A_SPREAD_VARIABLE.test(disclosure.reason))
      .map((disclosure) => `una razón del sitio rearmado todavía nombra una de las tres cosas: "${disclosure.reason}"`),
    'el mismo problema',
  ));
  assertBehavior(
    findings,
    'RankedList.astro pasa CONFIDENCE_FACTORS a modelAgreement, así que editar esa constante de true a false y rearmar basta: quitar el término es un cambio de datos, no una obra.',
  );
});

Then('cada fila del sitio rearmado sigue trayendo su palabra de confianza', function (this: PipelineWorld) {
  const world = switchWorld(this);
  const disclosures = requiredDisclosures(world);
  const findings = constantFindings(world);
  if (disclosures.length === 0) {
    findings.push('el sitio rearmado no escribió ni una sola palabra de confianza');
  }
  findings.push(...firstFew(
    disclosures
      .filter((disclosure) => !LEVEL_WORDS.includes(disclosure.level))
      .map((disclosure) => `una fila del sitio rearmado salió sin palabra de confianza: "${disclosure.level}"`),
    'la palabra perdida',
  ));
  assertBehavior(
    findings,
    'apagar el término re-proyecta el nivel desde los que quedan y nunca blanquea la fila: una fila sin confianza es un fallo de publicación, no un efecto secundario aceptable.',
  );
});

Then('cada razón del sitio rearmado conserva la frase de que nadie mandó todavía un reporte', function (this: PipelineWorld) {
  const world = switchWorld(this);
  const disclosures = requiredDisclosures(world);
  const findings = constantFindings(world);
  if (disclosures.length === 0) {
    findings.push('el sitio rearmado no escribió ni una sola razón que revisar');
  }
  findings.push(...firstFew(
    disclosures
      .filter((disclosure) => !SAYS_NOBODY_REPORTED_HERE.test(disclosure.reason))
      .map((disclosure) => `una razón del sitio rearmado perdió la frase honesta de la falta de reportes: "${disclosure.reason}"`),
    'la frase perdida',
  ));
  assertBehavior(
    findings,
    'quitar el término del desacuerdo quita ese término y nada más: la frase settled de HANDOFF sección 5 sobrevive intacta en el HTML emitido.',
  );
});

// Scoped to BOTH tags: `@slice-03` alone also selects slices in five other
// features, and a cleanup hook has no business running inside them.
After({ tags: '@feature-f-know-how-much-to-trust-it and @slice-03', timeout: 15_000 }, function (this: PipelineWorld) {
  const world = switchWorld(this);
  if (world.switchRoot !== undefined) {
    rmSync(world.switchRoot, { recursive: true, force: true });
  }
});
