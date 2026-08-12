// Slice-01 acceptance steps for f-see-what-killed-it: the spot page names the
// one factor that ruined the day, per day section, in plain Spanish.
//
// HOW THESE DRIVE PRODUCTION
// --------------------------
// Every browser scenario builds an isolated copy of the production Astro
// surface with `npm run build` (the same command CI runs: publish:surface
// --verify then astro build) and serves the emitted dist/ over real HTTP from
// this process. Chromium then reads it at 390 px. The worktree's own data and
// dist are never written.
//
// NOT `astro preview`, and NOT `vite preview`. Both were rejected for this
// lane: vite preview's SPA fallback silently serves index.html for any
// unmatched route, which turns a missing spot page into a false pass; and the
// project must not depend on a preview server's own routing when the emitted
// artefact is what ships to S3. The server below resolves exactly three ways
// and then gives up with a real 404:
//     /x        -> dist/x        -> dist/x.html      -> dist/x/index.html
//     /x/       -> dist/x/index.html                 -> dist/x.html
// The trailing-slash rule mirrors the CloudFront rewrite the deploy owes:
// `build.format: 'file'` emits dist/spots/<id>.html while paths.spot() links
// to /spots/<id>/. That mismatch is Pre-requisite 6 (hosted preview 403s), a
// keystone/deploy concern; resolving it here keeps this lane's scenarios
// failing on the callout, which is what slice-01 owes, rather than on hosting,
// which it does not.
//
// THE MARKUP CONTRACT THIS SLICE FIXES
// ------------------------------------
// The culprit sentence renders as ONE element per day section:
//     section[data-day="today"]    [data-field="weakest-link"]
//     section[data-day="tomorrow"] [data-field="weakest-link"]
// following the house data-field convention already used for score, size and
// window. A day with no published culprit renders NO such element at all --
// not an empty one. Selectors live here, never in the Gherkin.
//
// FIXTURE DISCIPLINE
// ------------------
// The Given plants only what the pipeline is allowed to publish: a
// `weakest_link` value per spot-day on the reading surface. It never plants a
// rendered sentence. Two spots deliberately carry the honest negatives (an
// explicit null, and the field absent entirely), and every other spot carries
// a culprit, so "19 of 20 rows silently blank" cannot pass here the way it
// passed CI once before.
//
// SHARED WORLD
// ------------
// The cucumber World is registered once, globally, by the keystone lane's
// support module. This file imports it (read-only) and must never call
// setWorldConstructor: a second registration would replace the World for every
// other feature in the same run.

import { After, AfterAll, Given, Then, When } from '@cucumber/cucumber';
import { chromium, type Browser, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

import type { PipelineWorld } from '../../daily-call-with-permanent-receipts/steps/support/world';
import '../../daily-call-with-permanent-receipts/steps/support/world';
import { venaoSeed } from '../../daily-call-with-permanent-receipts/steps/support/fixtures';
import { publishedWeakestLinkSubscore } from '../../../../src/pipeline/build';
import {
  decideStaticMapAssets,
  parseStaticMapPolicy,
  type StaticMapDecision,
  type StaticMapManifest,
  type StaticMapPolicy,
} from '../../../../src/publish/static-map-policy';
import { planStaticMaps, writeStaticMaps } from '../../../../scripts/generate-static-maps';
import trackedMapManifestJson from '../../../../data/maps/pa-pacific-map-manifest.json' with { type: 'json' };
import { renderStaticMapDiagram } from '../../../../src/publish/static-map-diagram';
import { loadLaunchSpotOrientations } from '../../../../src/pipeline/adapters/spot-coordinates';

const projectRoot = process.cwd();

// ---------------------------------------------------------------- fixture --

type Factor = 'dir' | 'size' | 'wind' | 'tide';

type ProducerSubscores = Readonly<{
  dir: number;
  size: number;
  wind: number | null;
  tide: number | null;
}>;

type DamageReceipt = Readonly<Record<Factor, number>>;

/**
 * One already-scored hour of Slice-04's published projection. Same four keys
 * the producer writes, nulls included: a missing observation is planted as a
 * missing observation, never as a zero the page could round into a bar.
 */
type HourSubscores = Readonly<{
  dir: number;
  size: number;
  wind: number | null;
  tide: number | null;
}>;

type ProfileDay = {
  readonly link?: Factor | null;
  /**
   * The one scalar the published row has already paired with its named
   * factor. This is only a morning input for Slice-02's browser contract,
   * never a sentence the fixture expects the page to produce.
   */
  readonly subscore?: number;
  /**
   * Slice-04 inputs, declared BY ROLE rather than by clock time. The window
   * hour is whichever hour this day's own published `best_window` starts in,
   * so the fixture survives a morning that moves its windows; every other
   * planted hour of that day gets `neighbour_hours`, which the fixture keeps
   * deliberately more attractive so averaging or hour-hopping is visible.
   */
  readonly window_hour?: HourSubscores;
  readonly neighbour_hours?: HourSubscores;
  /** Publishes this day with no window at all: the accepted normal omission. */
  readonly drop_best_window?: boolean;
  /** Full score record is producer-only input; the browser receives one selected scalar. */
  readonly producer_subscores?: ProducerSubscores;
  readonly score_q?: number;
  /** Applied model correction. It stays in producer arithmetic, never in page markup. */
  readonly delta_q?: number;
  /** `legacy` deliberately plants neither fresh counterfactual representation. */
  readonly counterfactual_score_q?: number | 'legacy';
  readonly counterfactual_suppression?: 'rounded_equal';
  /** Producer-side arithmetic witness; it never reaches the emitted reading surface. */
  readonly damages?: DamageReceipt;
  readonly omit?: boolean;
  readonly drop_wind_state?: boolean;
};

type Profile = {
  readonly spot_id: string;
  readonly today: ProfileDay;
  readonly tomorrow: ProfileDay;
  /**
   * Publishes this spot's detail with NO `hourly` key at all: a surface from
   * before the projection existed. Distinct from an empty array, which the
   * validator refuses, and distinct from a day with no window.
   */
  readonly omit_hourly?: boolean;
};

type Fixture = {
  readonly factor_words: Readonly<Record<Factor, string>>;
  readonly default_cycle: { readonly today: readonly Factor[]; readonly tomorrow: readonly Factor[] };
  readonly profiles: Readonly<Record<string, Profile>>;
};

type Slice02Fixture = Pick<Fixture, 'profiles'>;
type Slice03Fixture = Pick<Fixture, 'profiles'>;
type Slice04Fixture = Pick<Fixture, 'profiles'> & {
  readonly default_hours: { readonly window: HourSubscores; readonly neighbour: HourSubscores };
};

const fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-01-weakest-link-profiles.json', import.meta.url),
  'utf8',
)) as Fixture;

const slice02Fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-02-weakest-link-subscores.json', import.meta.url),
  'utf8',
)) as Slice02Fixture;

const slice03Fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-03-counterfactual-profiles.json', import.meta.url),
  'utf8',
)) as Slice03Fixture;

const slice04Fixture = JSON.parse(readFileSync(
  new URL('../fixtures/slice-04-breakdown-profiles.json', import.meta.url),
  'utf8',
)) as Slice04Fixture;

const profiles: Readonly<Record<string, Profile>> = {
  ...fixture.profiles,
  ...slice02Fixture.profiles,
  ...slice03Fixture.profiles,
  ...slice04Fixture.profiles,
};

const FACTOR_WORD: Readonly<Record<Factor, RegExp>> = {
  dir: new RegExp(fixture.factor_words.dir, 'i'),
  size: new RegExp(fixture.factor_words.size, 'i'),
  wind: new RegExp(fixture.factor_words.wind, 'i'),
  tide: new RegExp(fixture.factor_words.tide, 'i'),
};

type DayPlan = {
  readonly link: Factor | null;
  readonly subscore?: number;
  readonly producerSubscores?: ProducerSubscores;
  readonly scoreQ?: number;
  readonly deltaQ?: number;
  readonly counterfactualScore?: number | 'legacy';
  readonly counterfactualSuppression?: 'rounded_equal';
  readonly damages?: DamageReceipt;
  readonly omit: boolean;
  readonly dropWindState: boolean;
  /** The four values planted at this day's own best-window hour. */
  readonly windowHour: HourSubscores;
  /** The four values planted at every OTHER hour of that day. */
  readonly neighbourHour: HourSubscores;
  readonly dropBestWindow: boolean;
};
type SpotPlan = { readonly today: DayPlan; readonly tomorrow: DayPlan; readonly omitHourly: boolean };

function requiredProfile(name: string): Profile {
  const profile = profiles[name];
  assert.ok(profile, `test fixture error: unknown slice-01 profile "${name}"`);
  return profile;
}

function dayPlan(declared: ProfileDay | undefined, fallback: Factor): DayPlan {
  const defaults = {
    windowHour: slice04Fixture.default_hours.window,
    neighbourHour: slice04Fixture.default_hours.neighbour,
    dropBestWindow: false,
  } as const;
  if (declared === undefined) return { link: fallback, omit: false, dropWindState: false, ...defaults };
  const link = declared.omit === true ? null : declared.link === undefined ? fallback : declared.link;
  const producerSubscore = declared.producer_subscores === undefined || link === null
    ? undefined
    : publishedWeakestLinkSubscore({ weakest_link: link, sub: declared.producer_subscores });
  return {
    link,
    ...(producerSubscore === undefined && declared.subscore === undefined ? {} : { subscore: producerSubscore ?? declared.subscore }),
    ...(declared.producer_subscores === undefined ? {} : { producerSubscores: declared.producer_subscores }),
    ...(declared.score_q === undefined ? {} : { scoreQ: declared.score_q }),
    ...(declared.delta_q === undefined ? {} : { deltaQ: declared.delta_q }),
    ...(declared.counterfactual_score_q === undefined ? {} : { counterfactualScore: declared.counterfactual_score_q }),
    ...(declared.counterfactual_suppression === undefined ? {} : { counterfactualSuppression: declared.counterfactual_suppression }),
    ...(declared.damages === undefined ? {} : { damages: declared.damages }),
    omit: declared.omit === true,
    dropWindState: declared.drop_wind_state === true,
    windowHour: declared.window_hour ?? defaults.windowHour,
    neighbourHour: declared.neighbour_hours ?? defaults.neighbourHour,
    dropBestWindow: declared.drop_best_window === true,
  };
}

/**
 * The published morning this lane asserts against, decided once from the
 * installed ranking so the Given and every Then read the same plan. Named
 * profiles win; every other spot gets a culprit from the rotating cycle, so no
 * row is accidentally blank.
 */
function buildPlan(): ReadonlyMap<string, SpotPlan> {
  const surface = JSON.parse(readFileSync(join(projectRoot, 'data/published-surface.json'), 'utf8')) as {
    current: { calls: { spot_id: string }[] };
  };
  const named = new Map(Object.values(profiles).map((p) => [p.spot_id, p]));
  const plan = new Map<string, SpotPlan>();
  surface.current.calls.forEach((call, index) => {
    const profile = named.get(call.spot_id);
    const todayFallback = fixture.default_cycle.today[index % fixture.default_cycle.today.length] ?? 'size';
    const tomorrowFallback = fixture.default_cycle.tomorrow[index % fixture.default_cycle.tomorrow.length] ?? 'tide';
    plan.set(call.spot_id, {
      today: dayPlan(profile?.today, todayFallback),
      tomorrow: dayPlan(profile?.tomorrow, tomorrowFallback),
      omitHourly: profile?.omit_hourly === true,
    });
  });
  return plan;
}

const PLAN = buildPlan();

function plannedSpot(spotId: string): SpotPlan {
  const planned = PLAN.get(spotId);
  assert.ok(planned, `test fixture error: "${spotId}" is not in the installed ranking`);
  return planned;
}

function plannedFor(profileName: string): { spotId: string; plan: SpotPlan } {
  const spotId = requiredProfile(profileName).spot_id;
  return { spotId, plan: plannedSpot(spotId) };
}

// ------------------------------------------------------- isolated surface --

function credentialFreeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(environment)) {
    if (/^(?:AWS_|AZURE_|GOOGLE_|GCP_|GH_TOKEN$|GITHUB_TOKEN$|NPM_TOKEN$|ANTHROPIC_|OPENAI_)/.test(key)) {
      delete environment[key];
    }
  }
  // Child builds invoke their own tsx CLI. Re-importing the parent's loader
  // through NODE_OPTIONS starts a second esbuild service before validation.
  delete environment.NODE_OPTIONS;
  return environment;
}

function copyProjectForSurface(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-killed-it-'));
  for (const name of ['astro.config.mjs', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json']) {
    copyFileSync(join(projectRoot, name), join(root, name));
  }
  for (const name of ['data', 'public', 'scripts', 'src']) {
    cpSync(join(projectRoot, name), join(root, name), { recursive: true });
  }
  // A directory junction keeps the isolated build offline while using the
  // exact installed dependency tree. Nothing is installed or downloaded.
  symlinkSync(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}

type SurfaceRow = {
  spot_id: string;
  score_q: number;
  weakest_link?: Factor | null;
  weakest_link_subscore?: number;
  counterfactual_score_q?: number;
  counterfactual_suppression?: 'rounded_equal';
  wind_state?: string;
  best_window?: { start: string; end: string };
};

type SurfaceHourlyPoint = { t: string; sub: HourSubscores };
type SurfaceSpotDetailRow = { name: string; hourly?: SurfaceHourlyPoint[] };

/**
 * Panama keeps one offset all year, so a planted stamp can carry it literally.
 * The numeric offset is not decoration: the validator refuses a `Z` instant
 * because accepting one would push the local-hour decision onto whoever reads
 * it, which is the browser clock work this product forbids.
 */
const PANAMA_OFFSET = '-05:00';

/**
 * The spot-local hours this fixture projects for each published day. Wide
 * enough to contain every published `best_window.start` in the installed
 * ranking; the Given asserts that containment rather than trusting it, so a
 * future morning that moves a window fails as a fixture error instead of
 * silently planting a projection with no hour to select.
 */
const PLANTED_HOURS: readonly string[] = [
  '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
];

function panamaCivilDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function nextCivilDate(date: string): string {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function applyDayPlan(rows: SurfaceRow[], which: 'today' | 'tomorrow'): void {
  for (const row of rows) {
    const planned = plannedSpot(row.spot_id)[which];
    if (planned.dropBestWindow) delete row.best_window;
    if (planned.omit) {
      delete row.weakest_link;
    } else {
      row.weakest_link = planned.link;
    }
    if (typeof planned.subscore === 'number' && planned.link !== null && !planned.omit) {
      row.weakest_link_subscore = planned.subscore;
    } else {
      delete row.weakest_link_subscore;
    }
    if (typeof planned.scoreQ === 'number') row.score_q = planned.scoreQ;
    delete row.counterfactual_score_q;
    delete row.counterfactual_suppression;
    if (planned.link !== null && !planned.omit) {
      if (planned.counterfactualSuppression === 'rounded_equal') {
        row.counterfactual_suppression = 'rounded_equal';
      } else if (planned.counterfactualScore !== 'legacy') {
        // Every unnamed fixture row is fresh and must not accidentally become
        // a legacy compatibility case just because this scenario does not
        // inspect it. The score is an input to the emitted reading surface,
        // never a browser calculation.
        const counterfactualScore = planned.counterfactualScore ?? (row.score_q < 100 ? row.score_q + 1 : undefined);
        if (counterfactualScore === undefined) row.counterfactual_suppression = 'rounded_equal';
        else row.counterfactual_score_q = counterfactualScore;
      }
    }
    if (planned.dropWindState) delete row.wind_state;
  }
}

/**
 * The two-day hourly projection this morning publishes for one spot, planted
 * exactly the way the producer writes it: one point per scored hour, carrying
 * only a precomputed spot-local stamp and the four raw sub-scores.
 *
 * The values are placed BY ROLE. Whichever planted hour contains that day's
 * own published `best_window.start` receives `windowHour`; every other hour of
 * that day receives `neighbourHour`, which the fixture keeps more attractive
 * on purpose. A day published with no window has no window hour, so all of its
 * points are neighbours -- there is nothing for the page to select and nothing
 * for it to invent.
 */
function plantedHourly(row: SurfaceRow | undefined, plan: DayPlan, date: string): SurfaceHourlyPoint[] {
  const windowHour = row?.best_window?.start.slice(0, 2);
  return PLANTED_HOURS.map((hour) => ({
    t: `${date}T${hour}:00:00${PANAMA_OFFSET}`,
    sub: hour === windowHour ? plan.windowHour : plan.neighbourHour,
  }));
}

/**
 * Plants the producer's hourly projection on the reading surface, spot by
 * spot, across both published civil days. One profile deliberately keeps NO
 * `hourly` key at all: that is a surface published before the projection
 * existed, and the morning must degrade by omitting its bars and recording the
 * gap once, not by failing the page or inventing plausible values.
 *
 * Like every other Given here, this is an INPUT the pipeline is allowed to
 * publish. It plants no rendered row, no bar length and no sentence.
 */
function applyPublishedHourly(
  detail: Record<string, SurfaceSpotDetailRow>,
  calls: SurfaceRow[],
  days: [{ date: string; spots: SurfaceRow[] }, { date: string; spots: SurfaceRow[] }],
): void {
  for (const [spotId, entry] of Object.entries(detail)) {
    const planned = PLAN.get(spotId);
    if (planned === undefined || planned.omitHourly) {
      delete entry.hourly;
      continue;
    }
    entry.hourly = [
      ...plantedHourly(calls.find((row) => row.spot_id === spotId), planned.today, days[0].date),
      ...plantedHourly(days[1].spots.find((row) => row.spot_id === spotId), planned.tomorrow, days[1].date),
    ];
  }
}

/**
 * Plants the pipeline's own output on the reading surface: one named cause,
 * and where supplied, its already-paired value, per spot-day. This is an
 * INPUT, never an expected rendering.
 */
function applyPublishedCulprits(root: string): void {
  const path = join(root, 'data/published-surface.json');
  const surface = JSON.parse(readFileSync(path, 'utf8')) as {
    current: {
      surf_date: string;
      published_at: string;
      calls: SurfaceRow[];
      days: [{ date: string; spots: SurfaceRow[] }, { date: string; spots: SurfaceRow[] }];
      spot_detail: Record<string, SurfaceSpotDetailRow>;
    };
  };
  // The copied surface is a fresh morning for this real build, not a stale
  // archived document. Keep its two-day wire invariant while the calendar
  // advances, otherwise publish:surface correctly refuses the test before a
  // surfer can reach the behavior this slice owns.
  const today = panamaCivilDate();
  surface.current.surf_date = today;
  surface.current.published_at = `${today}T12:05:00.000Z`;
  surface.current.days[0].date = today;
  surface.current.days[1].date = nextCivilDate(today);
  applyDayPlan(surface.current.calls, 'today');
  applyDayPlan(surface.current.days[0].spots, 'today');
  applyDayPlan(surface.current.days[1].spots, 'tomorrow');
  // After the day plans, never before: a day whose window was dropped must
  // have no window hour to plant against.
  applyPublishedHourly(surface.current.spot_detail, surface.current.calls, surface.current.days);
  writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
}

type UiGate = { readonly status: number | null; readonly output: string; readonly buildOutput: string };

function buildSurface(root: string): UiGate {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (build.status !== 0) {
    throw new Error(`Slice-01 surface setup failed before the behavior oracle:\n${build.stdout}\n${build.stderr}`);
  }
  const gate = spawnSync('node', ['scripts/check-ui-quality.mjs'], {
    cwd: root,
    env: credentialFreeEnvironment({ UI_DIST: 'dist' }),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    status: gate.status,
    output: `${gate.stdout}${gate.stderr}`,
    buildOutput: `${build.stdout}${build.stderr}`,
  };
}

// ------------------------------------------------- emitted dist over HTTP --

const CONTENT_TYPE: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function resolveEmittedFile(distRoot: string, requestUrl: string): string | null {
  const withoutQuery = requestUrl.split('?')[0] ?? '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  const clean = normalize(decoded);
  if (!clean.startsWith('/')) return null;
  const candidates = clean.endsWith('/')
    ? [`${clean}index.html`, `${clean.slice(0, -1)}.html`]
    : [clean, `${clean}.html`, `${clean}/index.html`];
  const base = resolve(distRoot);
  for (const candidate of candidates) {
    const full = resolve(base, `.${candidate}`);
    if (full !== base && !full.startsWith(base + sep)) continue;
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      // not emitted under that name; try the next resolution
    }
  }
  return null;
}

async function unusedPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createNetServer();
    probe.once('error', rejectPort);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close();
        rejectPort(new Error('test fixture error: could not allocate a port for the emitted surface'));
        return;
      }
      probe.close((error) => (error === undefined ? resolvePort(address.port) : rejectPort(error)));
    });
  });
}

async function startDistServer(distRoot: string, port: number): Promise<Server> {
  const server = createHttpServer((request, response) => {
    const file = resolveEmittedFile(distRoot, request.url ?? '/');
    if (file === null) {
      // A real 404 with the emitted 404 document. No SPA fallback, ever: a
      // fallback would serve the list page for a missing spot page and turn a
      // missing feature into a passing test.
      let body = 'No encontramos esa página.';
      try {
        body = readFileSync(join(distRoot, '404.html'), 'utf8');
      } catch {
        // the surface emitted no 404 document; the plain sentence stands in
      }
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPE[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ready());
  });
  return server;
}

type Harness = { readonly root: string; readonly url: string; readonly server: Server; readonly uiGate: UiGate };

// Built once per run: every browser scenario reads the SAME published morning,
// which is also what makes the scenarios a chained narrative rather than ten
// unrelated fixtures.
let harness: Harness | null = null;

async function ensureHarness(): Promise<Harness> {
  if (harness !== null) return harness;
  const root = copyProjectForSurface();
  applyPublishedCulprits(root);
  const uiGate = buildSurface(root);
  const port = await unusedPort();
  const server = await startDistServer(join(root, 'dist'), port);
  harness = { root, url: `http://127.0.0.1:${port}`, server, uiGate };
  return harness;
}

function requiredHarness(): Harness {
  assert.ok(harness, 'test fixture error: the published morning was never built');
  return harness;
}

function buildCounterfactualHealthSurface(): string {
  const root = copyProjectForSurface();
  try {
    applyPublishedCulprits(root);
    return buildSurface(root).buildOutput;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

type PublishRefusal = { readonly status: number | null; readonly output: string };

/**
 * This drives the production publication validator over a contained copy of
 * the public surface. It intentionally never starts HTTP or Chromium: an
 * impossible lower counterfactual must be rejected before a page exists.
 */
function rejectLowerCounterfactualBeforeRendering(): PublishRefusal {
  const root = copyProjectForSurface();
  try {
    applyPublishedCulprits(root);
    const path = join(root, 'data/published-surface.json');
    const surface = JSON.parse(readFileSync(path, 'utf8')) as {
      current: { calls: SurfaceRow[]; days: [{ spots: SurfaceRow[] }, { spots: SurfaceRow[] }] };
    };
    const { spotId } = plannedFor('nombre-mas-largo');
    for (const rows of [surface.current.calls, surface.current.days[0].spots, surface.current.days[1].spots]) {
      const row = rows.find((candidate) => candidate.spot_id === spotId);
      if (row === undefined) continue;
      row.counterfactual_score_q = row.score_q - 1;
      delete row.counterfactual_suppression;
    }
    writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
    const validation = spawnSync('npm', ['run', 'publish:surface', '--', '--verify'], {
      cwd: root,
      env: credentialFreeEnvironment(),
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    return { status: validation.status, output: `${validation.stdout}${validation.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function verifyPublication(root: string): PublishRefusal {
  const validation = spawnSync('npm', ['run', 'publish:surface', '--', '--verify'], {
    cwd: root,
    env: credentialFreeEnvironment(),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return { status: validation.status, output: `${validation.stdout}${validation.stderr}` };
}

/**
 * Drives the production publication validator over a contained copy whose
 * hourly projection carries one bare `Z` instant instead of a precomputed
 * spot-local stamp.
 *
 * This is the producer-contract error the slice must NOT disguise as an old
 * surface: a fresh projection the page cannot read locally has to be refused
 * before a page exists, not degraded into plausible bars.
 */
function rejectMalformedHourlyBeforeRendering(): PublishRefusal {
  const root = copyProjectForSurface();
  try {
    applyPublishedCulprits(root);
    const path = join(root, 'data/published-surface.json');
    const surface = JSON.parse(readFileSync(path, 'utf8')) as {
      current: { spot_detail: Record<string, SurfaceSpotDetailRow> };
    };
    const { spotId } = plannedFor('desglose-honesto');
    const point = surface.current.spot_detail[spotId]?.hourly?.[0];
    assert.ok(point, `test fixture error: ${spotId} was never planted with an hourly projection to malform`);
    point.t = `${point.t.slice(0, 19)}Z`;
    writeFileSync(path, `${JSON.stringify(surface, null, 2)}\n`);
    return verifyPublication(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The morning this run actually published, read back from the built copy. */
function publishedMorning(root: string): {
  calls: SurfaceRow[];
  days: [{ date: string; spots: SurfaceRow[] }, { date: string; spots: SurfaceRow[] }];
  spot_detail: Record<string, SurfaceSpotDetailRow>;
} {
  const surface = JSON.parse(readFileSync(join(root, 'data/published-surface.json'), 'utf8')) as {
    current: {
      calls: SurfaceRow[];
      days: [{ date: string; spots: SurfaceRow[] }, { date: string; spots: SurfaceRow[] }];
      spot_detail: Record<string, SurfaceSpotDetailRow>;
    };
  };
  return surface.current;
}

function breakdownHealthEvents(output: string): readonly PublishHealthEvent[] {
  return output.split(/\r?\n/u).flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? [parsed as PublishHealthEvent]
        : [];
    } catch {
      return [];
    }
  }).filter((entry) => entry.event === 'health.publish.breakdown_hourly_missing');
}

// ------------------------------------------------------------- the reader --

/**
 * One rendered factor row of a day's best-window breakdown, read the way a
 * surfer receives it. `value` and `absence` are separate on purpose: a row
 * shows a published number OR states a missing observation, never both, and a
 * reader that merged them could not tell a real 0.00 from "nobody saw it".
 *
 * `trackWidth` is -1 when the row has no track element at all, which is what
 * an absent factor must look like. A zero-width fill would read on screen as
 * the worst possible reading rather than as a missing one.
 */
type BreakdownRowReading = {
  readonly factor: string;
  readonly text: string;
  readonly value: string;
  readonly absence: string;
  readonly weakest: boolean;
  readonly arrow: boolean;
  readonly trackWidth: number;
  readonly fillWidth: number;
};

type DayBreakdownReading = {
  readonly count: number;
  readonly rows: readonly BreakdownRowReading[];
};

type CalloutReading = {
  readonly today: string | null;
  readonly tomorrow: string | null;
  readonly todayCount: number;
  readonly tomorrowCount: number;
  readonly breakdownToday: DayBreakdownReading;
  readonly breakdownTomorrow: DayBreakdownReading;
  readonly scoreToday: string;
  readonly scoreTomorrow: string;
  readonly sizeToday: string;
  readonly windowToday: string;
  readonly sizeTomorrow: string;
  readonly windowTomorrow: string;
  readonly bodyText: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
};

// Every text read below is `innerText`, never `textContent`, and that choice is
// load-bearing. `textContent` returns the words of an element that is
// display:none, visibility:hidden or zero-sized, so markup that ships but never
// renders would satisfy every oracle in this file. `innerText` returns '' for
// an element nobody can see, which `calloutFindings` already reports as an
// empty box. This repo's worst shipped bug passed all ten CI jobs; a callout
// the surfer cannot read must not pass this one.
//
// No named const helpers inside page.evaluate: tsx/esbuild wraps named
// function bindings in a `__name(...)` call that does not exist once
// Playwright serialises the closure into the browser context. Every lookup is
// inlined, deliberately.
async function readCallouts(page: Page): Promise<CalloutReading> {
  return page.evaluate(() => ({
    today: (document.querySelector('section[data-day="today"] [data-field="weakest-link"]') as HTMLElement | null)?.innerText?.trim() ?? null,
    tomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="weakest-link"]') as HTMLElement | null)?.innerText?.trim() ?? null,
    todayCount: document.querySelectorAll('section[data-day="today"] [data-field="weakest-link"]').length,
    tomorrowCount: document.querySelectorAll('section[data-day="tomorrow"] [data-field="weakest-link"]').length,
    breakdownToday: {
      count: document.querySelectorAll('section[data-day="today"] [data-field="breakdown"]').length,
      rows: [...document.querySelectorAll('section[data-day="today"] [data-field="breakdown"] > li')].map((row) => ({
        factor: row.getAttribute('data-factor') ?? '',
        text: (row as HTMLElement).innerText.trim(),
        value: (row.querySelector('.value') as HTMLElement | null)?.innerText?.trim() ?? '',
        absence: (row.querySelector('.absence') as HTMLElement | null)?.innerText?.trim() ?? '',
        weakest: row.classList.contains('weakest'),
        arrow: row.querySelector('.arrow') !== null,
        trackWidth: row.querySelector('.track')?.getBoundingClientRect().width ?? -1,
        fillWidth: row.querySelector('.fill')?.getBoundingClientRect().width ?? -1,
      })),
    },
    breakdownTomorrow: {
      count: document.querySelectorAll('section[data-day="tomorrow"] [data-field="breakdown"]').length,
      rows: [...document.querySelectorAll('section[data-day="tomorrow"] [data-field="breakdown"] > li')].map((row) => ({
        factor: row.getAttribute('data-factor') ?? '',
        text: (row as HTMLElement).innerText.trim(),
        value: (row.querySelector('.value') as HTMLElement | null)?.innerText?.trim() ?? '',
        absence: (row.querySelector('.absence') as HTMLElement | null)?.innerText?.trim() ?? '',
        weakest: row.classList.contains('weakest'),
        arrow: row.querySelector('.arrow') !== null,
        trackWidth: row.querySelector('.track')?.getBoundingClientRect().width ?? -1,
        fillWidth: row.querySelector('.fill')?.getBoundingClientRect().width ?? -1,
      })),
    },
    scoreToday: (document.querySelector('section[data-day="today"] [data-field="score"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    scoreTomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="score"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    sizeToday: (document.querySelector('section[data-day="today"] [data-field="size"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    windowToday: (document.querySelector('section[data-day="today"] [data-field="window"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    sizeTomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="size"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    windowTomorrow: (document.querySelector('section[data-day="tomorrow"] [data-field="window"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    bodyText: document.body.innerText,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

type Slice01World = PipelineWorld & {
  killedItBrowser?: Browser;
  killedItPage?: Page;
  killedItOpened?: string;
  killedItReading?: CalloutReading;
  killedItNeighbour?: CalloutReading;
  killedItSweep?: Map<string, CalloutReading>;
  killedItListText?: string;
  killedItListCallouts?: number;
  killedItMonochrome?: { readonly today: string | null; readonly tomorrow: string | null };
  killedItVisual?: RawVisualAudit;
  killedItHealthBuildOutput?: string;
  killedItCounterfactualRefusal?: PublishRefusal;
  killedItHourlyVerdicts?: { readonly fresh: PublishRefusal; readonly malformed: PublishRefusal };
  killedItBreakdownVisual?: RawVisualAudit;
  killedItMapReading?: MapReading;
  killedItMapVisual?: RawVisualAudit;
  /** The theme and motion the scenario opened with, so a second page can match them. */
  killedItTheme?: string;
  killedItMovement?: string;
};

function world01(world: PipelineWorld): Slice01World {
  return world as Slice01World;
}

async function ensurePage(
  world: Slice01World,
  width: number,
  theme: string,
  movement: string,
): Promise<Page> {
  if (world.killedItBrowser === undefined) {
    world.killedItBrowser = await chromium.launch({ headless: true });
  }
  if (world.killedItPage !== undefined) await world.killedItPage.close().catch(() => undefined);
  const page = await world.killedItBrowser.newPage({ viewport: { width, height: 844 } });
  await page.emulateMedia({
    colorScheme: theme === 'oscuro' ? 'dark' : 'light',
    reducedMotion: movement === 'reducido' ? 'reduce' : 'no-preference',
  });
  world.killedItPage = page;
  return page;
}

function requiredPage(world: Slice01World): Page {
  assert.ok(world.killedItPage, 'test fixture error: no page is open yet');
  return world.killedItPage;
}

function requiredReading(world: Slice01World): CalloutReading {
  assert.ok(world.killedItReading, 'test fixture error: no spot page has been read yet');
  return world.killedItReading;
}

function requiredSweep(world: Slice01World): Map<string, CalloutReading> {
  assert.ok(world.killedItSweep, 'test fixture error: the list of beaches was never walked');
  return world.killedItSweep;
}

async function openSpot(world: Slice01World, spotId: string, width: number, theme: string, movement: string): Promise<CalloutReading> {
  const active = await ensureHarness();
  const page = await ensurePage(world, width, theme, movement);
  const response = await page.goto(`${active.url}/spots/${spotId}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    response?.status(),
    200,
    `test fixture error: the emitted surface did not serve /spots/${spotId}/ (status ${String(response?.status())}); the behavior oracle was never reached`,
  );
  return readCallouts(page);
}

function assertBehavior(findings: readonly string[], how: string): void {
  assert.deepEqual(
    findings,
    [],
    `WHAT: ${findings.join('; ')}. WHY: el surfista abre su playa para saber qué se la arruinó, y una frase que falta, que miente o que solo se distingue por el color no le sirve. HOW: ${how}`,
  );
}

const CODE_LEAK = /\b(?:dir|size|wind|tide|weakest[_ -]?link|null|undefined|NaN|true|false|the|today|tomorrow)\b/i;
const EM_DASH = /[—]|--/;

function calloutFindings(label: string, text: string | null, expected: Factor | null): string[] {
  if (expected === null) {
    if (text === null) return [];
    return [`${label}: la mañana no publicó culpable y la página igual muestra "${text}"`];
  }
  if (text === null) return [`${label}: la mañana publicó un culpable y la página no lo nombra`];
  if (text.length === 0) return [`${label}: la página dejó el recuadro del culpable vacío`];
  if (!FACTOR_WORD[expected].test(text)) {
    return [`${label}: se publicó ${expected} y la frase dice "${text}", que no lo nombra en palabras`];
  }
  return [];
}

/** A printed value is a whole two-place decimal token, never a prefix of a longer number. */
function hasPrintedTwoPlaceValue(text: string, value: number): boolean {
  const token = value.toFixed(2).replace('.', '\\.')
  return new RegExp(`(?:^|[^0-9.])${token}(?![0-9])`).test(text);
}

function legacySentenceFindings(label: string, text: string | null, expected: Factor | null): string[] {
  const findings = calloutFindings(label, text, expected);
  if (text === null) return findings;
  if (/\b(?:0|1)\.\d{2}\b/u.test(text)) findings.push(`${label}: la fila legada inventa una cifra en "${text}"`);
  if (!text.endsWith('.')) findings.push(`${label}: la frase legada no termina completa: "${text}"`);
  if (/,[\s.]*$/u.test(text)) findings.push(`${label}: la frase legada deja puntuación colgando: "${text}"`);
  if (CODE_LEAK.test(text) || EM_DASH.test(text)) findings.push(`${label}: la frase legada filtra texto técnico: "${text}"`);
  return findings;
}

function exactCounterfactualFindings(label: string, plan: DayPlan): string[] {
  const findings: string[] = [];
  if (plan.link === null || plan.damages === undefined || typeof plan.counterfactualScore !== 'number' || plan.scoreQ === undefined || plan.deltaQ === undefined) {
    return [`${label}: la mañana de prueba no trae el recibo completo de la mejora honesta`];
  }
  const totalDamage = Object.values(plan.damages).reduce((sum, damage) => sum + damage, 0);
  const clip = (value: number): number => Math.min(1, Math.max(0, value));
  const withoutNamedWeakness = Math.round(100 * clip(Math.exp(-(totalDamage - plan.damages[plan.link])) + plan.deltaQ));
  const displayed = Math.round(100 * clip(Math.exp(-totalDamage) + plan.deltaQ));
  const uncorrected = Math.round(100 * clip(Math.exp(-(totalDamage - plan.damages[plan.link]))));
  if (withoutNamedWeakness !== plan.counterfactualScore) {
    findings.push(`${label}: el recibo recompone ${withoutNamedWeakness}, no el ${plan.counterfactualScore} que la mañana publicó`);
  }
  if (displayed !== plan.scoreQ) {
    findings.push(`${label}: el recibo recompone puntaje ${displayed}, no el ${plan.scoreQ} de esa sección`);
  }
  if (uncorrected === plan.counterfactualScore) {
    findings.push(`${label}: la corrección no cambia la mejora y no puede probar que el productor la conserva`);
  }
  return findings;
}

/** A whole score token is never accepted as a prefix of another displayed number. */
function hasPrintedWholeScore(text: string, value: number): boolean {
  return new RegExp(`(?:^|[^0-9])${String(value)}(?![0-9])`).test(text);
}

type PublishHealthEvent = Readonly<{
  readonly event?: unknown;
  readonly spot_id?: unknown;
  readonly day?: unknown;
  readonly published_at?: unknown;
}>;

function counterfactualHealthEvents(output: string): readonly PublishHealthEvent[] {
  return output.split(/\r?\n/u).flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? [parsed as PublishHealthEvent]
        : [];
    } catch {
      return [];
    }
  }).filter((entry) => entry.event === 'health.publish.counterfactual_field_missing');
}

// ------------------------------------------------------------------ Given --

Given(
  'una mañana publicada donde cada playa trae el punto débil que salió del cálculo',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    await ensureHarness();
  },
);

Given(
  'una mañana publicada donde cada playa trae la causa y el valor que le corresponde',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    await ensureHarness();
    const { plan } = plannedFor('nombre-mas-largo');
    assert.equal(plan.today.subscore, 0.18, 'test fixture error: hoy must carry the published value 0.18');
    assert.equal(plan.tomorrow.subscore, 0.62, 'test fixture error: mañana must carry the published value 0.62');
  },
);

Given(
  'una mañana publicada donde cada día conserva la corrección que formó su puntaje',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('nombre-mas-largo');
    const findings = [
      ...exactCounterfactualFindings('hoy', plan.today),
      ...exactCounterfactualFindings('mañana', plan.tomorrow),
    ];
    assert.deepEqual(
      findings,
      [],
      `test fixture error: ${findings.join('; ')}. La prueba necesita números que la mañana pueda publicar sin inventarlos.`,
    );
  },
);

Given(
  'una mañana publicada donde la mejora redondeada no cambia el puntaje de cada día',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('minimo-no-publicado');
    assert.ok(
      plan.today.counterfactualSuppression === 'rounded_equal' && plan.tomorrow.counterfactualSuppression === 'rounded_equal',
      'test fixture error: both rounded-equality days must carry their honest suppression marker',
    );
  },
);

Given(
  'una mañana publicada donde una playa conserva sus causas pero no la mejora nueva',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('fila-legada');
    assert.ok(
      plan.today.counterfactualScore === 'legacy' && plan.tomorrow.counterfactualScore === 'legacy',
      'test fixture error: both named legacy days must omit both fresh counterfactual representations',
    );
  },
);

Given(
  'una mañana publicada donde una playa salió perfecta, sin nada que la tumbara',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('dia-perfecto');
    assert.ok(
      plan.today.link === null && plan.tomorrow.link === null,
      'test fixture error: the perfect-day profile must publish no named cause in either section',
    );
  },
);

Given('una mañana publicada con una ausencia heredada en sus dos días', function () {
  const legacy = plannedFor('fila-legada');
  const rounded = plannedFor('minimo-no-publicado');
  const clean = plannedFor('dia-perfecto');
  assert.ok(
    legacy.plan.today.counterfactualScore === 'legacy' && legacy.plan.tomorrow.counterfactualScore === 'legacy'
      && rounded.plan.today.counterfactualSuppression === 'rounded_equal' && rounded.plan.tomorrow.counterfactualSuppression === 'rounded_equal'
      && clean.plan.today.link === null && clean.plan.tomorrow.link === null,
    'test fixture error: this publication needs named legacy, rounded-equality, and clean rows to keep their distinct meanings',
  );
});

Given(
  'una mañana publicada donde el viento es la causa pero la marea tuvo un valor menor sin publicar',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    await ensureHarness();
    const { plan } = plannedFor('minimo-no-publicado');
    const scores = plan.today.producerSubscores;
    assert.ok(
      plan.today.link === 'wind'
        && typeof plan.today.subscore === 'number'
        && scores?.wind !== null
        && scores?.wind !== undefined
        && scores?.tide !== null
        && scores?.tide !== undefined
        && plan.today.subscore === scores.wind
        && scores.tide < scores.wind,
      'a published wind cause must keep wind 0.64 even when the same score record carries lower tide 0.12',
    );
  },
);

Given(
  'una mañana publicada donde una fila legada nombra sus causas pero no trae sus valores',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    await ensureHarness();
    const { plan } = plannedFor('fila-legada');
    assert.ok(
      plan.today.link !== null
        && plan.tomorrow.link !== null
        && plan.today.subscore === undefined
        && plan.tomorrow.subscore === undefined,
      'test fixture error: the legacy row must retain both named factors and omit only their scalar fields',
    );
  },
);

Given('en esa misma mañana una playa salió perfecta, sin nada que la tumbara', function () {
  const { spotId, plan } = plannedFor('dia-perfecto');
  assert.ok(
    plan.today.link === null && plan.tomorrow.link === null && !plan.today.omit && !plan.tomorrow.omit,
    `test fixture error: ${spotId} must be published with an explicit "no culprit" on both days`,
  );
});

Given('en esa misma mañana una playa se publicó sin ese dato en ninguno de sus dos días', function () {
  const { spotId, plan } = plannedFor('campo-ausente');
  assert.ok(
    plan.today.omit && plan.tomorrow.omit,
    `test fixture error: ${spotId} must be published with the culprit field absent on both days`,
  );
});

Given('en esa misma mañana una playa no tuvo dato de viento hoy y su culpable publicado es la marea', function () {
  const { spotId, plan } = plannedFor('sin-dato-de-viento');
  assert.ok(
    plan.today.dropWindState && plan.today.link === 'tide',
    `test fixture error: ${spotId} must be published today with no wind observation and tide as the culprit`,
  );
});

Given('una playa con sus constantes y una mañana completa de modelos, viento y marea', function (this: PipelineWorld) {
  this.spots = [venaoSeed];
  this.source.configureMorning(this.today);
});

// ------------------------------------------------------------------- When --

When('el surfista abre la playa {string} a {int} px', { timeout: 600_000 }, async function (this: PipelineWorld, profileName: string, width: number) {
  const world = world01(this);
  const { spotId } = plannedFor(profileName);
  world.killedItOpened = profileName;
  world.killedItReading = await openSpot(world, spotId, width, 'claro', 'normal');
});

When(
  'el surfista abre la playa {string} a {int} px, con tema {string} y movimiento {string}',
  { timeout: 600_000 },
  async function (this: PipelineWorld, profileName: string, width: number, theme: string, movement: string) {
    const world = world01(this);
    const { spotId } = plannedFor(profileName);
    world.killedItOpened = profileName;
    world.killedItTheme = theme;
    world.killedItMovement = movement;
    world.killedItReading = await openSpot(world, spotId, width, theme, movement);
    world.killedItVisual = await auditVisualQuality(requiredPage(world));
    world.killedItBreakdownVisual = await auditBreakdownQuality(requiredPage(world));
    world.killedItMapReading = await readStaticMap(requiredPage(world));
    world.killedItMapVisual = await auditMapQuality(requiredPage(world));
  },
);

When(
  'el surfista abre la playa {string} a {int} px con la pantalla lavada, sin color',
  { timeout: 600_000 },
  async function (this: PipelineWorld, profileName: string, width: number) {
    const world = world01(this);
    const { spotId } = plannedFor(profileName);
    world.killedItOpened = profileName;
    world.killedItReading = await openSpot(world, spotId, width, 'claro', 'normal');
    const page = requiredPage(world);
    // What this proves, stated plainly so nobody over-reads it: the oracle is
    // that the factor is NAMED IN WORDS the reader can see. It is not a
    // simulated colour-blind render. Flattening every colour signal to one ink
    // on one paper is the honest way to make that claim hold under a washed-out
    // screen too: after it, only text survives, and because the reading below
    // uses innerText, a culprit conveyed by a coloured swatch (or by markup
    // that is present but not rendered) reads as empty rather than as passing.
    await page.addStyleTag({
      content: '*,*::before,*::after{color:rgb(17,17,17) !important;background-color:rgb(255,255,255) !important;background-image:none !important;border-color:rgb(17,17,17) !important;fill:rgb(17,17,17) !important;stroke:rgb(17,17,17) !important;box-shadow:none !important;}',
    });
    const flattened = await readCallouts(page);
    world.killedItMonochrome = { today: flattened.today, tomorrow: flattened.tomorrow };
  },
);

When('el surfista recorre todas las playas de la lista', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const sweep = new Map<string, CalloutReading>();
  for (const spotId of PLAN.keys()) {
    sweep.set(spotId, await openSpot(world, spotId, 390, 'claro', 'normal'));
  }
  world.killedItSweep = sweep;
});

Given(
  'el surfista ya miró la lista de hoy sin culpables',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    const world = world01(this);
    const active = await ensureHarness();
    const page = await ensurePage(world, 390, 'claro', 'normal');
    await page.goto(active.url, { waitUntil: 'domcontentloaded' });
    const list = await page.evaluate(() => ({
      text: document.body.innerText,
      callouts: document.querySelectorAll('[data-field="weakest-link"]').length,
    }));
    world.killedItListText = list.text;
    world.killedItListCallouts = list.callouts;
  },
);

When('esa mañana se publica', { timeout: 60_000 }, async function (this: PipelineWorld) {
  await this.publishMorning('killed-it-morning', this.today);
});

When('la mañana queda lista para leerse', { timeout: 600_000 }, function (this: PipelineWorld) {
  world01(this).killedItHealthBuildOutput = buildCounterfactualHealthSurface();
});

When('la publicación revisa una mejora menor que el puntaje publicado', { timeout: 600_000 }, function (this: PipelineWorld) {
  world01(this).killedItCounterfactualRefusal = rejectLowerCounterfactualBeforeRendering();
});

// ------------------------------------------------------------------- Then --

Then('la sección de hoy nombra en palabras el punto débil publicado para hoy', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  assertBehavior(
    calloutFindings('hoy', requiredReading(world).today, plan.today.link),
    'renderizar el weakest_link publicado del día 0 con su palabra en español, en la sección de hoy.',
  );
});

Then('la sección de mañana nombra en palabras el punto débil publicado para mañana', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  assertBehavior(
    calloutFindings('mañana', requiredReading(world).tomorrow, plan.tomorrow.link),
    'renderizar el weakest_link publicado del día 1 con su palabra en español, en la sección de mañana.',
  );
});

Then('ninguna de las dos secciones nombra el punto débil del otro día', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (plan.today.link !== null && plan.tomorrow.link !== null && plan.today.link !== plan.tomorrow.link) {
    if (reading.today !== null && FACTOR_WORD[plan.tomorrow.link].test(reading.today)) {
      findings.push(`hoy nombra el culpable de mañana: "${reading.today}"`);
    }
    if (reading.tomorrow !== null && FACTOR_WORD[plan.today.link].test(reading.tomorrow)) {
      findings.push(`mañana nombra el culpable de hoy: "${reading.tomorrow}"`);
    }
  }
  assertBehavior(findings, 'leer el weakest_link del día que esa sección muestra, nunca el del otro día.');
});

Then('la sección de hoy nombra el punto débil publicado para hoy con el valor que le corresponde', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).today;
  const findings = calloutFindings('hoy', text, plan.today.link);
  const expected = plan.today.subscore;
  if (expected === undefined) {
    findings.push('la mañana de hoy no trae el valor que este escenario necesita comprobar');
  } else if (text === null || !hasPrintedTwoPlaceValue(text, expected)) {
    findings.push(`hoy no deja leer el valor publicado ${expected.toFixed(2)} dentro de su frase`);
  }
  assertBehavior(
    findings,
    'leer la causa y el valor que la misma fila publicada ya emparejó para hoy; la página no elige ni calcula otro número.',
  );
});

Then('la sección de mañana nombra el punto débil publicado para mañana con el valor que le corresponde', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).tomorrow;
  const findings = calloutFindings('mañana', text, plan.tomorrow.link);
  const expected = plan.tomorrow.subscore;
  if (expected === undefined) {
    findings.push('la mañana de mañana no trae el valor que este escenario necesita comprobar');
  } else if (text === null || !hasPrintedTwoPlaceValue(text, expected)) {
    findings.push(`mañana no deja leer el valor publicado ${expected.toFixed(2)} dentro de su frase`);
  }
  assertBehavior(
    findings,
    'leer la causa y el valor que la misma fila publicada ya emparejó para mañana; la página no elige ni calcula otro número.',
  );
});

Then('ninguna sección toma el valor publicado del otro día', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const today = plan.today.subscore?.toFixed(2);
  const tomorrow = plan.tomorrow.subscore?.toFixed(2);
  const findings: string[] = [];
  if (today !== undefined && reading.tomorrow !== null && hasPrintedTwoPlaceValue(reading.tomorrow, Number(today))) {
    findings.push(`mañana toma el valor de hoy (${today})`);
  }
  if (tomorrow !== undefined && reading.today !== null && hasPrintedTwoPlaceValue(reading.today, Number(tomorrow))) {
    findings.push(`hoy toma el valor de mañana (${tomorrow})`);
  }
  assertBehavior(
    findings,
    'mantener cada valor junto a la causa de su propio día: hoy y mañana nunca se prestan una cifra entre sí.',
  );
});

Then('la sección de hoy dice cuánto marcaría sin su causa publicada', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).today;
  const findings = calloutFindings('hoy', text, plan.today.link);
  if (typeof plan.today.counterfactualScore !== 'number') {
    findings.push('la mañana de hoy no trae la mejora honesta que este escenario necesita');
  } else if (text === null || !hasPrintedWholeScore(text, plan.today.counterfactualScore)) {
    findings.push(`hoy no deja leer el ${plan.today.counterfactualScore} publicado sin su causa`);
  }
  assertBehavior(
    findings,
    'repetir el puntaje entero que la mañana ya publicó sin el punto débil de hoy; la página no vuelve a hacer esa cuenta.',
  );
});

Then('la sección de mañana dice cuánto marcaría sin su causa publicada', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).tomorrow;
  const findings = calloutFindings('mañana', text, plan.tomorrow.link);
  if (typeof plan.tomorrow.counterfactualScore !== 'number') {
    findings.push('la mañana de mañana no trae la mejora honesta que este escenario necesita');
  } else if (text === null || !hasPrintedWholeScore(text, plan.tomorrow.counterfactualScore)) {
    findings.push(`mañana no deja leer el ${plan.tomorrow.counterfactualScore} publicado sin su causa`);
  }
  assertBehavior(
    findings,
    'repetir el puntaje entero que la mañana ya publicó sin el punto débil de mañana; la página no vuelve a hacer esa cuenta.',
  );
});

Then('ninguna sección toma la cifra de mejora del otro día', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (typeof plan.today.counterfactualScore === 'number' && reading.tomorrow !== null && hasPrintedWholeScore(reading.tomorrow, plan.today.counterfactualScore)) {
    findings.push(`mañana toma el ${plan.today.counterfactualScore} de hoy`);
  }
  if (typeof plan.tomorrow.counterfactualScore === 'number' && reading.today !== null && hasPrintedWholeScore(reading.today, plan.tomorrow.counterfactualScore)) {
    findings.push(`hoy toma el ${plan.tomorrow.counterfactualScore} de mañana`);
  }
  assertBehavior(
    findings,
    'mantener cada explicación junto a la causa y el número publicados por su propio día.',
  );
});

function suppressedCounterfactualFindings(label: string, text: string | null, link: Factor | null): string[] {
  const findings: string[] = [];
  findings.push(...calloutFindings(label, text, link));
  if (text === null) return findings;
  if (/\bmarcaría\b/iu.test(text)) findings.push(`${label} repite o inventa una mejora en "${text}"`);
  if (!text.endsWith('.')) findings.push(`${label} deja una frase incompleta: "${text}"`);
  if (CODE_LEAK.test(text) || EM_DASH.test(text)) findings.push(`${label} filtra texto crudo: "${text}"`);
  return findings;
}

Then('las dos frases de la causa quedan completas sin una mejora repetida', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const findings = [
    ...suppressedCounterfactualFindings('hoy', reading.today, plan.today.link),
    ...suppressedCounterfactualFindings('mañana', reading.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'dejar completa la causa publicada cuando la mejora redondea igual al puntaje que ya se ve, sin repetir esa cifra.',
  );
});

Then('las dos frases de la causa quedan completas sin una mejora inventada', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const findings = [
    ...suppressedCounterfactualFindings('hoy', reading.today, plan.today.link),
    ...suppressedCounterfactualFindings('mañana', reading.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'conservar una frase española terminada cuando una mañana antigua no publicó la mejora nueva, sin fabricar una cifra.',
  );
});

Then('la publicación señala una sola ausencia heredada por día sin confundirla con los otros silencios', function (this: PipelineWorld) {
  const legacy = plannedFor('fila-legada');
  const rounded = plannedFor('minimo-no-publicado');
  const clean = plannedFor('dia-perfecto');
  const output = world01(this).killedItHealthBuildOutput;
  assert.ok(output !== undefined, 'test fixture error: the published morning was never prepared for its health observation');
  const events = counterfactualHealthEvents(output);
  const expected = new Set([
    `${legacy.spotId}:today`,
    `${legacy.spotId}:tomorrow`,
  ]);
  const actual = events.map((entry) => `${String(entry.spot_id)}:${String(entry.day)}`);
  const findings: string[] = [];
  if (events.length !== expected.size) findings.push(`la publicación señaló ${events.length} ausencia(s) heredada(s), no ${expected.size}`);
  for (const key of expected) {
    if (actual.filter((candidate) => candidate === key).length !== 1) findings.push(`falta o se repite la ausencia heredada ${key}`);
  }
  for (const entry of events) {
    if (typeof entry.published_at !== 'string' || entry.published_at.length === 0) {
      findings.push(`la ausencia heredada ${String(entry.spot_id)}:${String(entry.day)} no trae su momento de publicación`);
    }
  }
  if (rounded.plan.today.counterfactualSuppression !== 'rounded_equal' || rounded.plan.tomorrow.counterfactualSuppression !== 'rounded_equal') {
    findings.push('la mañana de choque no quedó marcada como una igualdad honesta');
  }
  if (clean.plan.today.link !== null || clean.plan.tomorrow.link !== null) findings.push('la mañana perfecta no quedó sin causa');
  assertBehavior(
    findings,
    'anotar una falta heredada por cada día que conserva su causa sin la mejora nueva, sin tratar una igualdad honesta ni un día perfecto como una falla.',
  );
});

Then('la publicación se niega antes de preparar una página', function (this: PipelineWorld) {
  const refusal = world01(this).killedItCounterfactualRefusal;
  assert.ok(refusal, 'test fixture error: the publication was never asked to validate the impossible improvement');
  assert.notEqual(refusal.status, 0, 'la publicación aceptó una mejora menor que el puntaje y habría dejado que una página la leyera');
  assert.match(
    refusal.output,
    /counterfactual_score_q|counterfactual.*score|two well-formed ranked civil days/i,
    `la publicación se negó por otra razón antes de validar la mejora imposible:\n${refusal.output}`,
  );
});

Then('la sección de hoy conserva el viento y su valor publicado, no la marea menor', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const text = requiredReading(world).today;
  const expected = plan.today.subscore;
  const lower = plan.today.producerSubscores?.tide;
  const findings = calloutFindings('hoy', text, plan.today.link);
  if (expected === undefined || lower === undefined || lower === null) {
    findings.push('la mañana no conserva el par publicado y su menor no publicado para este caso');
  }
  if (text !== null && expected !== undefined && !hasPrintedTwoPlaceValue(text, expected)) {
    findings.push(`hoy no deja leer el valor publicado ${expected.toFixed(2)} junto al viento`);
  }
  if (text !== null && lower !== undefined && lower !== null && hasPrintedTwoPlaceValue(text, lower)) {
    findings.push(`hoy inventa el menor de marea ${lower.toFixed(2)} en vez del par publicado`);
  }
  assertBehavior(
    findings,
    'mostrar solo la pareja factor-valor que la fila publicó: ni escoger el mínimo de otro factor ni llevar al navegador el registro completo.',
  );
});

Then('las dos frases legadas siguen completas sin cifra ni puntuación rota', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const reading = requiredReading(world);
  const findings = [
    ...legacySentenceFindings('hoy', reading.today, plan.today.link),
    ...legacySentenceFindings('mañana', reading.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'dejar la causa histórica como una frase española terminada cuando su mañana nunca publicó el valor nuevo, sin fabricar una cifra ni una coma colgando.',
  );
});

Then('la playa sin ese dato también queda sin frase ni cifra sola', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId } = plannedFor('campo-ausente');
  const missing = await openSpot(world, spotId, 390, 'claro', 'normal');
  const findings: string[] = [];
  if (missing.today !== null || missing.tomorrow !== null) {
    findings.push(`la playa sin dato muestra hoy="${String(missing.today)}" mañana="${String(missing.tomorrow)}"`);
  }
  if (missing.todayCount !== 0 || missing.tomorrowCount !== 0) {
    findings.push(`la playa sin dato dejó ${String(missing.todayCount + missing.tomorrowCount)} elemento(s) del culpable`);
  }
  assertBehavior(
    findings,
    'omitir el elemento entero cuando el dato no llegó, igual que en el día perfecto, para que nunca aparezca una cifra huérfana.',
  );
});

Then('ninguna de las dos secciones nombra un culpable', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (reading.today !== null) findings.push(`hoy muestra "${reading.today}" sin que se haya publicado culpable`);
  if (reading.tomorrow !== null) findings.push(`mañana muestra "${reading.tomorrow}" sin que se haya publicado culpable`);
  assertBehavior(findings, 'no renderizar nada cuando el weakest_link publicado es nulo o no viene: nunca un culpable inventado.');
});

Then('no queda un recuadro vacío ni una palabra suelta donde iría el culpable', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (reading.todayCount !== 0) findings.push(`hoy dejó ${reading.todayCount} recuadro(s) del culpable en la página`);
  if (reading.tomorrowCount !== 0) findings.push(`mañana dejó ${reading.tomorrowCount} recuadro(s) del culpable en la página`);
  if (/\bnull\b|\bundefined\b|\bNaN\b/i.test(reading.bodyText)) findings.push('la página imprime una palabra del código donde iría el culpable');
  assertBehavior(findings, 'omitir el elemento entero cuando no hay culpable, en vez de renderizarlo vacío.');
});

Then('la página sigue mostrando el puntaje, el tamaño y la ventana de los dos días', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  for (const [label, text] of [
    ['puntaje de hoy', reading.scoreToday],
    ['puntaje de mañana', reading.scoreTomorrow],
    ['tamaño de hoy', reading.sizeToday],
    ['ventana de hoy', reading.windowToday],
    ['tamaño de mañana', reading.sizeTomorrow],
    ['ventana de mañana', reading.windowTomorrow],
  ] as const) {
    if (text.trim().length === 0) findings.push(`${label} quedó vacío`);
  }
  assertBehavior(findings, 'dejar intacto el resto de la sección del día cuando el culpable no se muestra.');
});

Then('la página se lee completa, sin error crudo ni texto en blanco', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const findings: string[] = [];
  if (reading.bodyText.trim().length === 0) findings.push('la página quedó en blanco');
  if (/\b(?:TypeError|ReferenceError|Internal Server Error|Cannot GET|stack trace)\b/i.test(reading.bodyText)) {
    findings.push('la página expone un error crudo');
  }
  if (reading.scoreToday.trim().length === 0) findings.push('el puntaje de hoy quedó vacío');
  assertBehavior(findings, 'tratar la ausencia del campo como un estado normal de la página, no como un fallo de render.');
});

Then('en esa misma mañana la playa de al lado sí nombra el suyo', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId, plan } = plannedFor('dos-dias-distintos');
  const neighbour = await openSpot(world, spotId, 390, 'claro', 'normal');
  world.killedItNeighbour = neighbour;
  const findings = [
    ...calloutFindings('la playa de al lado, hoy', neighbour.today, plan.today.link),
    ...calloutFindings('la playa de al lado, mañana', neighbour.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'renderizar el culpable de cada playa desde su propia fila publicada: el silencio de una playa sin dato no puede ser el silencio de todas.',
  );
});

Then('la sección de hoy nombra la marea', function (this: PipelineWorld) {
  const world = world01(this);
  assertBehavior(
    calloutFindings('hoy', requiredReading(world).today, 'tide'),
    'renderizar el weakest_link publicado tal cual: la marea, porque es lo que se publicó.',
  );
});

Then('la sección de hoy no nombra el viento como culpable', function (this: PipelineWorld) {
  const world = world01(this);
  const today = requiredReading(world).today;
  const findings: string[] = [];
  if (today !== null && FACTOR_WORD.wind.test(today)) {
    findings.push(`la frase del culpable dice "${today}", y hoy no hubo dato de viento en esa playa`);
  }
  assertBehavior(
    findings,
    'no deducir el culpable de los sub-puntajes ni del estado del viento: el motor ya garantiza que nunca nombra un factor sin observación (L16), y la página solo repite esa etiqueta.',
  );
});

Then('cada playa cuya mañana trae culpable lo nombra en sus dos secciones', function (this: PipelineWorld) {
  const world = world01(this);
  const sweep = requiredSweep(world);
  const findings: string[] = [];
  let named = 0;
  let expected = 0;
  for (const [spotId, reading] of sweep) {
    const plan = plannedSpot(spotId);
    if (plan.today.link !== null) {
      expected += 1;
      if (reading.today !== null && FACTOR_WORD[plan.today.link].test(reading.today)) named += 1;
      else findings.push(`${spotId} (hoy) no nombra su culpable publicado`);
    }
    if (plan.tomorrow.link !== null) {
      expected += 1;
      if (reading.tomorrow !== null && FACTOR_WORD[plan.tomorrow.link].test(reading.tomorrow)) named += 1;
      else findings.push(`${spotId} (mañana) no nombra su culpable publicado`);
    }
  }
  const summary = findings.length === 0 ? [] : [`${named} de ${expected} días con culpable publicado lo nombran; faltan: ${findings.slice(0, 6).join(', ')}${findings.length > 6 ? ` y ${findings.length - 6} más` : ''}`];
  assertBehavior(
    summary,
    'renderizar el culpable en TODA fila publicada que lo trae: una sola playa correcta y diecinueve calladas es exactamente el fallo que ya pasó por CI una vez.',
  );
});

Then('cada frase del punto débil está en español, sin palabras del código, sin inglés y sin guiones largos', function (this: PipelineWorld) {
  const world = world01(this);
  const sweep = requiredSweep(world);
  const findings: string[] = [];
  let seen = 0;
  for (const [spotId, reading] of sweep) {
    const plan = plannedSpot(spotId);
    for (const [label, text, link] of [
      ['hoy', reading.today, plan.today.link],
      ['mañana', reading.tomorrow, plan.tomorrow.link],
    ] as const) {
      if (link === null) continue;
      if (text === null) continue;
      seen += 1;
      if (CODE_LEAK.test(text)) findings.push(`${spotId} (${label}) filtra una palabra del código: "${text}"`);
      if (EM_DASH.test(text)) findings.push(`${spotId} (${label}) usa un guión largo: "${text}"`);
      if (/[{}\[\]"]/.test(text)) findings.push(`${spotId} (${label}) filtra puntuación de datos: "${text}"`);
    }
  }
  if (seen === 0) findings.unshift('no hay ni una frase de punto débil en toda la lista de playas que revisar');
  assertBehavior(
    findings,
    'escribir la frase en español desde src/i18n/strings.ts con el nombre del factor tomado del módulo de vocabulario compartido, nunca el token del motor ni texto inglés.',
  );
});

Then('la lista de hoy sigue igual, sin nombrar culpables', function (this: PipelineWorld) {
  const world = world01(this);
  const findings: string[] = [];
  if ((world.killedItListCallouts ?? 0) !== 0) {
    findings.push(`la lista de hoy muestra ${String(world.killedItListCallouts)} frase(s) de punto débil`);
  }
  if ((world.killedItListText ?? '').trim().length === 0) findings.push('la lista de hoy quedó en blanco');
  assertBehavior(
    findings,
    'dejar la lista de hoy intacta: el aviso vive en un componente propio montado solo en la página de la playa.',
  );
});

Then('la página de esa playa sí nombra el suyo', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  assertBehavior(
    calloutFindings('hoy', requiredReading(world).today, plan.today.link),
    'montar el aviso en la página de la playa, que es la única superficie que este corte toca.',
  );
});

Then('el punto débil se sigue leyendo en palabras, sin que el color cargue el aviso', function (this: PipelineWorld) {
  const world = world01(this);
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const flattened = world.killedItMonochrome;
  assert.ok(flattened, 'test fixture error: the flattened-colour reading was never taken');
  const findings = [
    ...calloutFindings('con la pantalla lavada, hoy', flattened.today, plan.today.link),
    ...calloutFindings('con la pantalla lavada, mañana', flattened.tomorrow, plan.tomorrow.link),
  ];
  assertBehavior(
    findings,
    'nombrar el factor con palabras dentro del propio aviso: el color puede reforzarlo, nunca cargarlo solo (09-design-system.md línea 237).',
  );
});

// Contrast math runs in Node, never inside page.evaluate: a named const helper
// bound inside an evaluate callback gets wrapped by tsx/esbuild in a
// `__name(...)` call that the browser context does not define. The browser
// side only collects raw computed-style strings.
function parseRgb(value: string): readonly number[] | null {
  const match = /rgba?\(([^)]+)\)/i.exec(value);
  if (!match || match[1] === undefined) return null;
  const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

function relativeLuminance(rgb: readonly number[]): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0);
}

function contrastRatio(foreground: readonly number[], background: readonly number[]): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

interface RawVisualAudit {
  readonly pieces: readonly { readonly day: string; readonly color: string; readonly backdrop: string; readonly fontSize: string; readonly lineHeight: string }[];
  readonly taps: readonly { readonly where: string; readonly width: number; readonly height: number }[];
  readonly ctaWidth: number;
  readonly ctaHeight: number;
  readonly moving: readonly string[];
  readonly loadingCount: number;
  readonly inlineHex: number;
  readonly reducedMotion: boolean;
}

async function auditVisualQuality(page: Page): Promise<RawVisualAudit> {
  return page.evaluate(() => {
    const callouts = [...document.querySelectorAll('section[data-day] [data-field="weakest-link"]')];
    const pieces = callouts.map((el) => {
      let backdrop = 'rgba(0, 0, 0, 0)';
      let node: Element | null = el;
      while (node !== null) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          backdrop = candidate;
          break;
        }
        node = node.parentElement;
      }
      const style = getComputedStyle(el);
      return {
        day: el.closest('section[data-day]')?.getAttribute('data-day') ?? '?',
        color: style.color,
        backdrop,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    });
    const taps = callouts.flatMap((el) => [...el.querySelectorAll('a,button,summary,[role="button"],input,select')].map((control) => {
      const rect = control.getBoundingClientRect();
      return { where: `${el.closest('section[data-day]')?.getAttribute('data-day') ?? '?'} ${control.tagName.toLowerCase()}`, width: rect.width, height: rect.height };
    }));
    const cta = document.querySelector('a.cta')?.getBoundingClientRect();
    const moving = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? callouts
        .filter((el) => getComputedStyle(el).transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
          || getComputedStyle(el).animationName !== 'none')
        .map((el) => el.closest('section[data-day]')?.getAttribute('data-day') ?? '?')
      : [];
    const loadingCount = callouts.filter((el) => el.querySelector('[role="progressbar"], .spinner, .skeleton') !== null).length;
    const inlineHex = callouts.filter((el) => /#[0-9a-f]{3,8}/i.test(el.getAttribute('style') ?? '')).length;
    return {
      pieces,
      taps,
      ctaWidth: cta?.width ?? 0,
      ctaHeight: cta?.height ?? 0,
      moving,
      loadingCount,
      inlineHex,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

/**
 * The same seven-mandate audit, pointed at the breakdown instead of the
 * callout sentence. Both the scored rows and the absence sentences are
 * measured, because a missing observation that nobody can read is the one
 * state this component exists to state out loud. Every backdrop is walked up
 * to the first painted ancestor, so contrast is measured over the real page
 * in both themes rather than over white.
 */
async function auditBreakdownQuality(page: Page): Promise<RawVisualAudit> {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('section[data-day] [data-field="breakdown"] > li')]
      .flatMap((row) => [...row.querySelectorAll('.factor, .value, .absence')]);
    const pieces = cells.map((el) => {
      let backdrop = 'rgba(0, 0, 0, 0)';
      let node: Element | null = el;
      while (node !== null) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          backdrop = candidate;
          break;
        }
        node = node.parentElement;
      }
      const style = getComputedStyle(el);
      return {
        day: `${el.closest('section[data-day]')?.getAttribute('data-day') ?? '?'} ${el.closest('li')?.getAttribute('data-factor') ?? '?'}`,
        color: style.color,
        backdrop,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    });
    const lists = [...document.querySelectorAll('section[data-day] [data-field="breakdown"]')];
    const taps = lists.flatMap((el) => [...el.querySelectorAll('a,button,summary,[role="button"],input,select')].map((control) => {
      const rect = control.getBoundingClientRect();
      return { where: `${el.closest('section[data-day]')?.getAttribute('data-day') ?? '?'} ${control.tagName.toLowerCase()}`, width: rect.width, height: rect.height };
    }));
    const cta = document.querySelector('a.cta')?.getBoundingClientRect();
    const moving = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? lists
        .flatMap((el) => [el, ...el.querySelectorAll('*')])
        .filter((el) => getComputedStyle(el).transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
          || getComputedStyle(el).animationName !== 'none')
        .map((el) => el.closest('section[data-day]')?.getAttribute('data-day') ?? '?')
      : [];
    const loadingCount = lists.filter((el) => el.querySelector('[role="progressbar"], .spinner, .skeleton') !== null).length;
    const inlineHex = lists
      .flatMap((el) => [el, ...el.querySelectorAll('*')])
      .filter((el) => /#[0-9a-f]{3,8}/i.test(el.getAttribute('style') ?? '')).length;
    return {
      pieces,
      taps,
      ctaWidth: cta?.width ?? 0,
      ctaHeight: cta?.height ?? 0,
      moving,
      loadingCount,
      inlineHex,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

Then('la frase del punto débil cumple las siete comprobaciones visuales sobre el fondo real', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const audit = world.killedItVisual;
  assert.ok(audit, 'test fixture error: the visual audit was never taken');
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const expectedPieces = (plan.today.link === null ? 0 : 1) + (plan.tomorrow.link === null ? 0 : 1);
  const findings: string[] = [];

  if (audit.pieces.length !== expectedPieces) {
    findings.push(`U1/U5: se esperaban ${expectedPieces} frases de punto débil que comprobar y hay ${audit.pieces.length}; no hay nada que medir contra el fondo real`);
  }
  for (const piece of audit.pieces) {
    const foreground = parseRgb(piece.color);
    const background = parseRgb(piece.backdrop);
    if (foreground === null || background === null) {
      findings.push(`U1: no se pudo medir el contraste de la frase de ${piece.day}`);
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) findings.push(`U1: la frase de ${piece.day} queda en ${ratio.toFixed(2)}:1 sobre su fondo real`);
    const fontSize = Number.parseFloat(piece.fontSize);
    const lineHeight = Number.parseFloat(piece.lineHeight);
    if (!Number.isFinite(fontSize) || fontSize < 14) findings.push(`U6: la frase de ${piece.day} se compone a ${piece.fontSize}`);
    if (Number.isFinite(lineHeight) && Number.isFinite(fontSize) && lineHeight < fontSize * 1.2) {
      findings.push(`U6: la frase de ${piece.day} tiene un interlineado apretado (${piece.lineHeight} sobre ${piece.fontSize})`);
    }
  }
  if (reading.scrollWidth > reading.clientWidth) {
    findings.push(`U2: la página desborda a 390 px con el nombre de playa más largo (${reading.scrollWidth} > ${reading.clientWidth})`);
  }
  for (const tap of audit.taps) {
    if (tap.width < 44 || tap.height < 44) findings.push(`U3: ${tap.where} mide ${Math.round(tap.width)} por ${Math.round(tap.height)} px`);
  }
  if (audit.ctaWidth < 44 || audit.ctaHeight < 44) {
    findings.push(`U3: el llamado a reportar quedó desplazado u ocluido (${Math.round(audit.ctaWidth)} por ${Math.round(audit.ctaHeight)} px)`);
  }
  if (audit.moving.length > 0) findings.push(`U4: con movimiento reducido la frase sigue animándose en ${audit.moving.join(', ')}`);
  if (audit.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial dentro del aviso');
  if (audit.inlineHex !== 0) findings.push('U7: el aviso trae color en crudo en su atributo de estilo, en vez de un token');
  const gate = requiredHarness().uiGate;
  if (gate.status !== 0) findings.push(`U2/U4/U6/U7: el gate visual de la superficie falló: ${gate.output.trim()}`);

  assertBehavior(
    findings,
    'construir el aviso con los tokens y la escala tipográfica ya declarados (09-design-system.md línea 237), medido sobre el fondo real de la página en los dos temas, no sobre blanco.',
  );
});

Then('la explicación publicada no deja cálculo ni seguimiento en el teléfono', function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId } = plannedFor(world.killedItOpened ?? '');
  const dist = join(requiredHarness().root, 'dist');
  const emitted = readFileSync(join(dist, 'spots', `${spotId}.html`), 'utf8');
  const scripts = [...emitted.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]
    .flatMap((match) => {
      const inline = match[2] ?? '';
      const source = /\bsrc=["']([^"']+)["']/iu.exec(match[1] ?? '')?.[1];
      if (source === undefined) return [inline];
      const asset = resolveEmittedFile(dist, source);
      return asset === null ? [`unresolved emitted script: ${source}`] : [inline, readFileSync(asset, 'utf8')];
    });
  const findings: string[] = [];
  if (!emitted.includes('data-field="weakest-link"')) {
    findings.push('la explicación no quedó en el documento publicado');
  }
  for (const script of scripts) {
    if (script.startsWith('unresolved emitted script:')) {
      findings.push(script);
      continue;
    }
    if (/counterfactual|weakest-link|health\.publish|telemetry|sendBeacon/iu.test(script)) {
      findings.push('el documento publicado manda el cálculo o su registro a código del teléfono');
      break;
    }
  }
  assertBehavior(
    findings,
    'dejar la explicación como texto ya publicado en el documento: sin cálculo, telemetría ni código propio en el teléfono.',
  );
});

Then(
  'el recibo del día y la superficie de lectura nombran el mismo punto débil, playa por playa y día por día',
  async function (this: PipelineWorld) {
    const body = await this.store.get('pub/v1/regions/pa-pacific/bundle.json');
    assert.ok(body, `no region bundle was published; the behavior oracle was never reached.${this.failureContext()}`);
    const bundle = JSON.parse(body) as {
      days: { date: string; spots: { spot_id: string; weakest_link?: unknown }[] }[];
      publish_surface: { days: { date: string; spots: { spot_id: string; weakest_link?: unknown }[] }[] };
    };
    const findings: string[] = [];
    bundle.days.forEach((day, index) => {
      const readingDay = bundle.publish_surface.days[index];
      if (readingDay === undefined) {
        findings.push(`la superficie de lectura no trae el día ${day.date}`);
        return;
      }
      for (const receipt of day.spots) {
        const reading = readingDay.spots.find((row) => row.spot_id === receipt.spot_id);
        if (reading === undefined) {
          findings.push(`${receipt.spot_id} (${day.date}) está en el recibo y no en la superficie de lectura`);
          continue;
        }
        if (!('weakest_link' in reading)) {
          findings.push(`${receipt.spot_id} (${day.date}): el recibo dice ${JSON.stringify(receipt.weakest_link)} y la superficie de lectura no lleva el campo`);
          continue;
        }
        if (reading.weakest_link !== receipt.weakest_link) {
          findings.push(`${receipt.spot_id} (${day.date}): el recibo dice ${JSON.stringify(receipt.weakest_link)} y la superficie de lectura ${JSON.stringify(reading.weakest_link)}`);
        }
      }
    });
    assertBehavior(
      findings,
      'llevar weakest_link también en surfaceCall(), para que la superficie que leen las páginas diga lo mismo que el recibo del día.',
    );
  },
);

// ------------------------------------------ slice-04: four honest bar rows --
//
// THE MARKUP CONTRACT THIS SLICE ADDS
// -----------------------------------
// One breakdown list per day section, at the same house data-field address the
// callout, score, size and window already use:
//     section[data-day="today"]    [data-field="breakdown"] > li[data-factor]
//     section[data-day="tomorrow"] [data-field="breakdown"] > li[data-factor]
// A day with no published window renders NO such element -- not an empty one,
// and not a list of four blanks. Selectors live here, never in the Gherkin.
//
// WHAT MAKES THESE ORACLES FALSIFIABLE
// ------------------------------------
// The planted morning is built so that three plausible wrong implementations
// all fail loudly:
//   - marking the shortest bar instead of the published weakest_link fails,
//     because the published culprit is deliberately NOT the lowest of its four
//     values on any slice-04 profile;
//   - averaging, interpolating or falling back to an adjacent hour fails,
//     because every neighbouring hour is deliberately more attractive than the
//     window hour, so any of those reads a different number;
//   - drawing a zero-width bar for a missing observation fails, because an
//     absent row must carry no track element at all, and `trackWidth` reports
//     -1 only when there is none.

const BREAKDOWN_FACTOR_ORDER: readonly Factor[] = ['dir', 'size', 'wind', 'tide'];

function windowValue(sub: HourSubscores, factor: Factor): number | null {
  return sub[factor];
}

/** The factor carrying the lowest published value of a window hour. */
function lowestScoredFactor(sub: HourSubscores): Factor {
  return BREAKDOWN_FACTOR_ORDER.reduce((lowest, factor) => {
    const candidate = windowValue(sub, factor);
    const current = windowValue(sub, lowest);
    if (candidate === null) return lowest;
    if (current === null) return factor;
    return candidate < current ? factor : lowest;
  }, 'dir' as Factor);
}

function dayWord(day: 'today' | 'tomorrow'): string {
  return day === 'today' ? 'hoy' : 'mañana';
}

function breakdownOf(reading: CalloutReading, day: 'today' | 'tomorrow'): DayBreakdownReading {
  return day === 'today' ? reading.breakdownToday : reading.breakdownTomorrow;
}

/**
 * Every finding a day's four rows can produce about the values it printed.
 * Scored rows must repeat their published number to two places and carry a
 * track; absent rows must state the missing observation in Spanish, name their
 * own factor and day, and carry no number and no track at all.
 */
function breakdownRowFindings(label: string, breakdown: DayBreakdownReading, plan: DayPlan, day: 'today' | 'tomorrow'): string[] {
  const findings: string[] = [];
  if (breakdown.count !== 1) {
    findings.push(`${label}: la sección trae ${breakdown.count} desglose(s) y debía traer exactamente uno`);
    return findings;
  }
  if (breakdown.rows.length !== BREAKDOWN_FACTOR_ORDER.length) {
    findings.push(`${label}: el desglose trae ${breakdown.rows.length} filas y la ventana se explica con ${BREAKDOWN_FACTOR_ORDER.length}`);
    return findings;
  }
  BREAKDOWN_FACTOR_ORDER.forEach((factor, index) => {
    const row = breakdown.rows[index];
    if (row === undefined) return;
    if (row.factor !== factor) {
      findings.push(`${label}: la fila ${index + 1} es "${row.factor}" y el orden publicado la quiere en "${factor}"`);
      return;
    }
    const published = windowValue(plan.windowHour, factor);
    if (published === null) {
      if (row.absence.length === 0) {
        findings.push(`${label}/${factor}: la mañana no observó ese dato y la fila no lo dice: "${row.text}"`);
        return;
      }
      if (!new RegExp(`^sin dato de ${FACTOR_WORD[factor].source} ${dayWord(day)}$`, 'iu').test(row.absence)) {
        findings.push(`${label}/${factor}: la ausencia dice "${row.absence}" en vez de nombrar su propio factor y su propio día`);
      }
      if (row.value.length !== 0) findings.push(`${label}/${factor}: una observación ausente vino con la cifra "${row.value}"`);
      if (/\d/u.test(row.absence)) findings.push(`${label}/${factor}: la ausencia inventa una cifra: "${row.absence}"`);
      if (row.trackWidth !== -1) findings.push(`${label}/${factor}: una observación ausente dibujó una barra de ${Math.round(row.trackWidth)} px, que se lee como el peor dato posible`);
      return;
    }
    if (row.absence.length !== 0) {
      findings.push(`${label}/${factor}: la mañana publicó ${published.toFixed(2)} y la fila lo cuenta como ausencia: "${row.absence}"`);
      return;
    }
    if (row.value !== published.toFixed(2)) {
      findings.push(`${label}/${factor}: la fila imprime "${row.value}" y su hora publicada dice ${published.toFixed(2)}`);
    }
    if (row.trackWidth <= 0) findings.push(`${label}/${factor}: una fila con valor publicado no dibujó su barra`);
  });
  if (CODE_LEAK.test(breakdown.rows.map((row) => row.text).join(' ')) || EM_DASH.test(breakdown.rows.map((row) => row.text).join(' '))) {
    findings.push(`${label}: el desglose filtra texto técnico: "${breakdown.rows.map((row) => row.text).join(' | ')}"`);
  }
  return findings;
}

// ------------------------------------------------------------------ Given --

Given(
  'una mañana publicada que trae el desglose hora por hora de sus dos días',
  { timeout: 600_000 },
  async function () {
    const active = await ensureHarness();
    const morning = publishedMorning(active.root);
    const findings: string[] = [];
    for (const [spotId, planned] of PLAN) {
      if (planned.omitHourly) continue;
      const hourly = morning.spot_detail[spotId]?.hourly;
      if (hourly === undefined || hourly.length === 0) {
        findings.push(`${spotId} no recibió proyección horaria`);
        continue;
      }
      for (const point of hourly) {
        if (!/T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u.test(point.t)) {
          findings.push(`${spotId} plantó "${point.t}" sin su desfase horario propio`);
          break;
        }
        if (!morning.days.some((day) => day.date === point.t.slice(0, 10))) {
          findings.push(`${spotId} plantó una hora fuera de los dos días publicados: "${point.t}"`);
          break;
        }
      }
      ([morning.calls, morning.days[1].spots] as const).forEach((rows, index) => {
        const start = rows.find((row) => row.spot_id === spotId)?.best_window?.start;
        if (start === undefined) return;
        const date = morning.days[index]?.date;
        const inside = hourly.filter((point) => point.t.slice(0, 10) === date && point.t.slice(11, 13) === start.slice(0, 2));
        if (inside.length !== 1) {
          findings.push(`${spotId} (${index === 0 ? 'hoy' : 'mañana'}) tiene ${inside.length} horas plantadas dentro de su ventana de las ${start}`);
        }
      });
    }
    assert.deepEqual(
      findings,
      [],
      `test fixture error: ${findings.join('; ')}. La mañana de prueba debe publicar una hora calificada por cada hora, con su desfase propio, dentro de sus dos días.`,
    );
  },
);

Given('en esa misma mañana una playa vieja se publicó sin ese desglose', function () {
  const { spotId } = plannedFor('sin-desglose-legado');
  const detail = publishedMorning(requiredHarness().root).spot_detail[spotId];
  assert.ok(
    detail !== undefined && !Object.hasOwn(detail, 'hourly'),
    `test fixture error: ${spotId} debe publicarse sin la clave del desglose, que es distinto de publicarla vacía`,
  );
});

Given('una playa con sus constantes y una mañana de modelos y marea que se quedó sin viento', function (this: PipelineWorld) {
  this.spots = [venaoSeed];
  this.source.configureMorning(this.today);
  // The observation never arrived. It is not zero, and it is not calm.
  this.source.windDark = true;
});

Given(
  'una mañana publicada donde las horas vecinas se ven mejor que la hora de la ventana',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('desglose-honesto');
    const findings: string[] = [];
    for (const [label, day] of [['hoy', plan.today], ['mañana', plan.tomorrow]] as const) {
      for (const factor of BREAKDOWN_FACTOR_ORDER) {
        const inside = windowValue(day.windowHour, factor);
        const beside = windowValue(day.neighbourHour, factor);
        if (inside === null || beside === null || beside <= inside) {
          findings.push(`${label}/${factor}: la hora vecina no es más atractiva que la hora de la ventana`);
        }
      }
    }
    const shared = BREAKDOWN_FACTOR_ORDER
      .map((factor) => windowValue(plan.today.windowHour, factor))
      .filter((value) => BREAKDOWN_FACTOR_ORDER.some((factor) => windowValue(plan.tomorrow.windowHour, factor) === value));
    if (shared.length > 0) findings.push(`los dos días comparten el valor ${shared.join(', ')} y una fuga entre secciones quedaría oculta`);
    assert.deepEqual(
      findings,
      [],
      `test fixture error: ${findings.join('; ')}. Sin horas vecinas más atractivas, promediar o saltar de hora pasaría desapercibido.`,
    );
  },
);

Given(
  'una mañana publicada donde la hora de la ventana trae un valor menor que el punto débil publicado',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('desglose-honesto');
    const findings: string[] = [];
    for (const [label, day] of [['hoy', plan.today], ['mañana', plan.tomorrow]] as const) {
      const lowest = lowestScoredFactor(day.windowHour);
      const published = day.link;
      const lowestValue = windowValue(day.windowHour, lowest);
      const publishedValue = published === null ? null : windowValue(day.windowHour, published);
      if (published === null || publishedValue === null || lowestValue === null || lowest === published || lowestValue >= publishedValue) {
        findings.push(`${label}: el punto débil publicado tendría que ser distinto de la barra más baja, y no lo es`);
      }
    }
    assert.deepEqual(
      findings,
      [],
      `test fixture error: ${findings.join('; ')}. Si el culpable publicado fuera además el mínimo, marcar la barra más corta pasaría esta prueba.`,
    );
  },
);

Given(
  'una mañana publicada donde una hora de ventana perdió el viento y otra perdió la marea',
  { timeout: 600_000 },
  async function () {
    await ensureHarness();
    const { plan } = plannedFor('sin-viento-en-la-ventana');
    const findings: string[] = [];
    if (plan.today.windowHour.wind !== null || plan.today.windowHour.tide === null || plan.today.link !== 'tide') {
      findings.push('hoy debe perder el viento, conservar la marea y publicar la marea como culpable');
    }
    if (plan.tomorrow.windowHour.tide !== null || plan.tomorrow.windowHour.wind === null || plan.tomorrow.link !== 'wind') {
      findings.push('mañana debe perder la marea, conservar el viento y publicar el viento como culpable');
    }
    assert.deepEqual(
      findings,
      [],
      `test fixture error: ${findings.join('; ')}. La prueba necesita las dos ausencias y un culpable publicado que ninguna de ellas pueda robar.`,
    );
  },
);

Given(
  'una mañana publicada donde un día no trae ventana y una playa vieja no trae desglose',
  { timeout: 600_000 },
  async function () {
    const active = await ensureHarness();
    const morning = publishedMorning(active.root);
    const sinVentana = plannedFor('sin-ventana');
    const legado = plannedFor('sin-desglose-legado');
    const findings: string[] = [];
    if (morning.calls.find((row) => row.spot_id === sinVentana.spotId)?.best_window !== undefined) {
      findings.push(`${sinVentana.spotId} debía publicarse hoy sin ventana`);
    }
    if (morning.days[1].spots.find((row) => row.spot_id === sinVentana.spotId)?.best_window === undefined) {
      findings.push(`${sinVentana.spotId} debía conservar su ventana de mañana, para que el silencio de hoy no sea el de la página entera`);
    }
    if (Object.hasOwn(morning.spot_detail[legado.spotId] ?? {}, 'hourly')) {
      findings.push(`${legado.spotId} debía publicarse sin la clave del desglose`);
    }
    assert.deepEqual(
      findings,
      [],
      `test fixture error: ${findings.join('; ')}. Los dos silencios de este corte son distintos y la mañana debe traer los dos.`,
    );
  },
);

// ------------------------------------------------------------------- When --

When(
  'la publicación revisa esa mañana y una copia con una hora malformada',
  { timeout: 600_000 },
  function (this: PipelineWorld) {
    world01(this).killedItHourlyVerdicts = {
      fresh: verifyPublication(requiredHarness().root),
      malformed: rejectMalformedHourlyBeforeRendering(),
    };
  },
);

// ------------------------------------------------------------------- Then --

Then(
  'acepta el desglose fresco junto a la ausencia heredada, y se niega antes de preparar una página con la hora malformada',
  function (this: PipelineWorld) {
    const verdicts = world01(this).killedItHourlyVerdicts;
    assert.ok(verdicts, 'test fixture error: la publicación nunca revisó esta mañana');
    const findings: string[] = [];
    if (verdicts.fresh.status !== 0) {
      findings.push(`la publicación rechazó una mañana honesta que trae el desglose fresco junto a una playa vieja sin él: ${verdicts.fresh.output.trim()}`);
    }
    if (verdicts.malformed.status === 0) {
      findings.push('la publicación aceptó una hora fresca que la página no puede leer sin calcular una zona horaria');
    }
    if (verdicts.malformed.status !== 0 && !/spot_detail/u.test(verdicts.malformed.output)) {
      findings.push(`la negativa no dice que el problema está en el desglose publicado: ${verdicts.malformed.output.trim()}`);
    }
    assertBehavior(
      findings,
      'validar el desglose entero cuando viene, y solo entonces: una clave ausente es una superficie vieja que degrada omitiendo barras, y una hora malformada es un error del productor que debe parar la publicación.',
    );
  },
);

Then(
  'el desglose publicado repite cada hora calificada y deja el viento ausente, sin un cero en su lugar',
  async function (this: PipelineWorld) {
    const body = await this.store.get('pub/v1/regions/pa-pacific/bundle.json');
    assert.ok(body, `no region bundle was published; the behavior oracle was never reached.${this.failureContext()}`);
    const bundle = JSON.parse(body) as {
      publish_surface: {
        days: { date: string }[];
        spot_detail: Record<string, { hourly?: { t: string; sub: HourSubscores }[] }>;
      };
    };
    const horizon = bundle.publish_surface.days.map((day) => day.date);
    const projected = bundle.publish_surface.spot_detail[venaoSeed.spot_id]?.hourly;
    const scored = (await this.callRows()).filter((row) => row.spot_id === venaoSeed.spot_id);
    // The join is by instant, not by string: a spot-local stamp with its own
    // offset names the same moment as the producer's UTC valid_ts, so this
    // never reimplements the production time rule to check it.
    const inHorizon = scored.filter((row) => horizon.includes(panamaCivilDate(new Date(row.valid_ts))));
    const findings: string[] = [];
    if (projected === undefined) {
      findings.push('la mañana publicada no trae desglose horario para esa playa');
    } else {
      if (projected.length !== inHorizon.length) {
        findings.push(`la mañana calificó ${inHorizon.length} horas dentro de sus dos días y publicó ${projected.length} puntos`);
      }
      for (const point of projected) {
        const matches = scored.filter((row) => Date.parse(row.valid_ts) === Date.parse(point.t));
        if (matches.length !== 1) {
          findings.push(`el punto ${point.t} no corresponde a exactamente una hora calificada`);
          continue;
        }
        const row = matches[0]!;
        if (JSON.stringify(point.sub) !== JSON.stringify({ dir: row.sub.dir, size: row.sub.size, wind: row.sub.wind, tide: row.sub.tide })) {
          findings.push(`el punto ${point.t} publica ${JSON.stringify(point.sub)} y su hora calificada dice ${JSON.stringify(row.sub)}`);
        }
        if (point.sub.wind !== null) {
          findings.push(`el punto ${point.t} rellena el viento que nadie observó con ${JSON.stringify(point.sub.wind)}`);
        }
      }
      if (inHorizon.length === 0) findings.push('la mañana de prueba no calificó ni una hora dentro de sus dos días publicados');
    }
    assertBehavior(
      findings,
      'proyectar cada hora ya calificada tal cual, conservando su instante y cada ausencia: un cero en lugar de una observación que nadie hizo es la mentira más barata que este producto puede contar.',
    );
  },
);

Then(
  'cada día imprime los cuatro valores de su propia hora de ventana, sin promediar ni saltar a la hora vecina',
  function (this: PipelineWorld) {
    const world = world01(this);
    const reading = requiredReading(world);
    const { plan } = plannedFor(world.killedItOpened ?? '');
    const findings: string[] = [];
    for (const [label, day, dayPlanned] of [['hoy', 'today', plan.today], ['mañana', 'tomorrow', plan.tomorrow]] as const) {
      findings.push(...breakdownRowFindings(label, breakdownOf(reading, day), dayPlanned, day));
      const printed = breakdownOf(reading, day).rows.map((row) => row.value).filter((value) => value.length > 0);
      for (const factor of BREAKDOWN_FACTOR_ORDER) {
        const inside = windowValue(dayPlanned.windowHour, factor);
        const beside = windowValue(dayPlanned.neighbourHour, factor);
        if (inside === null || beside === null) continue;
        if (printed.includes(beside.toFixed(2))) {
          findings.push(`${label}: el desglose imprime ${beside.toFixed(2)}, que es la hora vecina y no la que abre su ventana`);
        }
        const averaged = (beside + inside + beside) / 3;
        if (printed.includes(averaged.toFixed(2))) {
          findings.push(`${label}: el desglose imprime ${averaged.toFixed(2)}, que es el promedio de tres horas y no un número que alguien haya calificado`);
        }
      }
    }
    const todayPrinted = reading.breakdownToday.rows.map((row) => row.value).filter((value) => value.length > 0);
    const tomorrowPrinted = reading.breakdownTomorrow.rows.map((row) => row.value).filter((value) => value.length > 0);
    for (const value of todayPrinted) {
      if (tomorrowPrinted.includes(value)) findings.push(`las dos secciones imprimen ${value}, así que una está leyendo la hora de la otra`);
    }
    assertBehavior(
      findings,
      'seleccionar un solo punto ya publicado, el de la hora que contiene el inicio de esa ventana, y copiarlo: sin promedio, sin interpolación, sin hora de repuesto y sin la ventana del otro día.',
    );
  },
);

Then(
  'la flecha marca el punto débil publicado y la fila más baja queda como una fila común',
  function (this: PipelineWorld) {
    const world = world01(this);
    const reading = requiredReading(world);
    const { plan } = plannedFor(world.killedItOpened ?? '');
    const findings: string[] = [];
    for (const [label, day, dayPlanned, sentence] of [
      ['hoy', 'today', plan.today, reading.today],
      ['mañana', 'tomorrow', plan.tomorrow, reading.tomorrow],
    ] as const) {
      const rows = breakdownOf(reading, day).rows;
      const marked = rows.filter((row) => row.weakest);
      if (marked.length !== 1) {
        findings.push(`${label}: ${marked.length} fila(s) llevan la marca del punto débil y solo una la publicó`);
        continue;
      }
      const mark = marked[0]!;
      if (mark.factor !== dayPlanned.link) {
        findings.push(`${label}: la marca cayó en "${mark.factor}" y la mañana publicó "${String(dayPlanned.link)}"`);
      }
      if (!mark.arrow) findings.push(`${label}: la fila del punto débil no lleva su flecha`);
      const lowest = lowestScoredFactor(dayPlanned.windowHour);
      const lowestRow = rows.find((row) => row.factor === lowest);
      if (lowestRow?.weakest === true || lowestRow?.arrow === true) {
        findings.push(`${label}: la barra más baja ("${lowest}") se quedó con la marca que la mañana no le dio`);
      }
      // Colour never carries the callout alone: the same factor is named in
      // words beside the bars, so a washed-out screen loses nothing.
      if (dayPlanned.link !== null && (sentence === null || !FACTOR_WORD[dayPlanned.link].test(sentence))) {
        findings.push(`${label}: la fila marcada no está nombrada en palabras junto al desglose`);
      }
    }
    assertBehavior(
      findings,
      'marcar la fila que el resumen del día publicó como weakest_link y ninguna otra: el motor pesa los factores antes de compararlos, así que la barra más corta no es la culpable.',
    );
  },
);

Then('ninguna fila sin dato se queda con la flecha', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId, plan } = plannedFor('sin-viento-en-la-ventana');
  const reading = await openSpot(world, spotId, 390, 'claro', 'normal');
  const findings: string[] = [];
  for (const [label, day, dayPlanned] of [['hoy', 'today', plan.today], ['mañana', 'tomorrow', plan.tomorrow]] as const) {
    for (const row of breakdownOf(reading, day).rows) {
      const published = windowValue(dayPlanned.windowHour, row.factor as Factor);
      if (published === null && (row.weakest || row.arrow)) {
        findings.push(`${label}: la fila sin observación de "${row.factor}" se quedó con la marca del punto débil`);
      }
      if (row.factor === dayPlanned.link && !row.weakest) {
        findings.push(`${label}: el punto débil publicado "${String(dayPlanned.link)}" perdió su marca`);
      }
    }
  }
  assertBehavior(
    findings,
    'dejar que solo el weakest_link publicado marque una fila: una observación que falta no es una condición mala, y no puede robarle la flecha a la que sí se publicó.',
  );
});

Then(
  'cada día muestra cuatro filas con su valor publicado o con su ausencia dicha en palabras',
  function (this: PipelineWorld) {
    const world = world01(this);
    const reading = requiredReading(world);
    const { plan } = plannedFor(world.killedItOpened ?? '');
    const findings = [
      ...breakdownRowFindings('hoy', reading.breakdownToday, plan.today, 'today'),
      ...breakdownRowFindings('mañana', reading.breakdownTomorrow, plan.tomorrow, 'tomorrow'),
    ];
    assertBehavior(
      findings,
      'escribir las cuatro razones de la ventana en español, cada una con el número que su hora publicó o con la frase que dice que ese dato no llegó, nunca con un cero ni con una barra vacía en su lugar.',
    );
  },
);

Then('el desglose cumple las siete comprobaciones visuales sobre el fondo real', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const audit = world.killedItBreakdownVisual;
  assert.ok(audit, 'test fixture error: the breakdown visual audit was never taken');
  const { plan } = plannedFor(world.killedItOpened ?? '');
  const expectedCells = ([plan.today, plan.tomorrow] as const)
    .reduce((total, day) => total + BREAKDOWN_FACTOR_ORDER.reduce((cells, factor) => cells + (windowValue(day.windowHour, factor) === null ? 1 : 2), 0), 0);
  const findings: string[] = [];

  if (audit.pieces.length !== expectedCells) {
    findings.push(`U1/U5: se esperaban ${expectedCells} piezas del desglose que comprobar y hay ${audit.pieces.length}; no hay nada que medir contra el fondo real`);
  }
  for (const piece of audit.pieces) {
    const foreground = parseRgb(piece.color);
    const background = parseRgb(piece.backdrop);
    if (foreground === null || background === null) {
      findings.push(`U1: no se pudo medir el contraste de ${piece.day}`);
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) findings.push(`U1: ${piece.day} queda en ${ratio.toFixed(2)}:1 sobre su fondo real`);
    const fontSize = Number.parseFloat(piece.fontSize);
    const lineHeight = Number.parseFloat(piece.lineHeight);
    if (!Number.isFinite(fontSize) || fontSize < 14) findings.push(`U6: ${piece.day} se compone a ${piece.fontSize}`);
    if (Number.isFinite(lineHeight) && Number.isFinite(fontSize) && lineHeight < fontSize * 1.2) {
      findings.push(`U6: ${piece.day} tiene un interlineado apretado (${piece.lineHeight} sobre ${piece.fontSize})`);
    }
  }
  if (reading.scrollWidth > reading.clientWidth) {
    findings.push(`U2: la página desborda a 390 px con el desglose montado (${reading.scrollWidth} > ${reading.clientWidth})`);
  }
  for (const tap of audit.taps) {
    if (tap.width < 44 || tap.height < 44) findings.push(`U3: ${tap.where} mide ${Math.round(tap.width)} por ${Math.round(tap.height)} px`);
  }
  if (audit.ctaWidth < 44 || audit.ctaHeight < 44) {
    findings.push(`U3: el llamado a reportar quedó desplazado u ocluido (${Math.round(audit.ctaWidth)} por ${Math.round(audit.ctaHeight)} px)`);
  }
  if (audit.moving.length > 0) findings.push(`U4: con movimiento reducido el desglose sigue animándose en ${audit.moving.join(', ')}`);
  if (audit.loadingCount !== 0) findings.push('U5: una lectura ya publicada muestra carga artificial dentro del desglose');
  if (audit.inlineHex !== 0) findings.push('U7: el desglose trae color en crudo en un atributo de estilo, en vez de un token');
  const gate = requiredHarness().uiGate;
  if (gate.status !== 0) findings.push(`U2/U4/U6/U7: el gate visual de la superficie falló: ${gate.output.trim()}`);

  assertBehavior(
    findings,
    'construir las barras con los tokens y la escala tipográfica ya declaradas, medidas sobre el fondo real de la página en los dos temas, y dejar el llamado a reportar donde el pulgar lo alcanza.',
  );
});

/**
 * R17 names the longest Spanish spot name specifically, and it is the hardest
 * case this component has: four label-track-value rows at 390 px next to a name
 * that already fills the line. The absence profile above cannot cover it,
 * because a spot may hold only one profile and the longest name is already
 * `nombre-mas-largo`. So this step reopens that page in the SAME theme and
 * motion the scenario is running, and measures the bars there too.
 */
Then('el nombre de playa más largo tampoco desborda sus cuatro filas', { timeout: 600_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId, plan } = plannedFor('nombre-mas-largo');
  const reading = await openSpot(world, spotId, 390, world.killedItTheme ?? 'claro', world.killedItMovement ?? 'normal');
  const audit = await auditBreakdownQuality(requiredPage(world));
  const findings = [
    ...breakdownRowFindings('hoy', reading.breakdownToday, plan.today, 'today'),
    ...breakdownRowFindings('mañana', reading.breakdownTomorrow, plan.tomorrow, 'tomorrow'),
  ];
  if (reading.scrollWidth > reading.clientWidth) {
    findings.push(`U2: el nombre más largo desborda a 390 px con el desglose montado (${reading.scrollWidth} > ${reading.clientWidth})`);
  }
  for (const piece of audit.pieces) {
    const foreground = parseRgb(piece.color);
    const background = parseRgb(piece.backdrop);
    if (foreground === null || background === null) {
      findings.push(`U1: no se pudo medir el contraste de ${piece.day} en la playa de nombre más largo`);
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) findings.push(`U1: ${piece.day} queda en ${ratio.toFixed(2)}:1 sobre su fondo real`);
    const fontSize = Number.parseFloat(piece.fontSize);
    if (!Number.isFinite(fontSize) || fontSize < 14) findings.push(`U6: ${piece.day} se compone a ${piece.fontSize}`);
  }
  if (audit.ctaWidth < 44 || audit.ctaHeight < 44) {
    findings.push(`U3: el llamado a reportar quedó desplazado u ocluido (${Math.round(audit.ctaWidth)} por ${Math.round(audit.ctaHeight)} px)`);
  }
  if (audit.moving.length > 0) findings.push(`U4: con movimiento reducido el desglose sigue animándose en ${audit.moving.join(', ')}`);
  assertBehavior(
    findings,
    'dejar que las cuatro filas se compriman con la columna y no con la ventana: el nombre más largo del catálogo no puede empujar la página fuera de un teléfono de 390 px.',
  );
});

Then(
  'el día sin ventana no deja ni desglose ni recuadro vacío, y el otro día conserva el suyo',
  function (this: PipelineWorld) {
    const world = world01(this);
    const reading = requiredReading(world);
    const { plan } = plannedFor(world.killedItOpened ?? '');
    const findings: string[] = [];
    if (reading.breakdownToday.count !== 0) {
      findings.push(`el día sin ventana dejó ${reading.breakdownToday.count} desglose(s) donde no hay ventana que explicar`);
    }
    if (reading.breakdownToday.rows.length !== 0) {
      findings.push(`el día sin ventana dejó ${reading.breakdownToday.rows.length} fila(s) sueltas`);
    }
    findings.push(...breakdownRowFindings('mañana', reading.breakdownTomorrow, plan.tomorrow, 'tomorrow'));
    if (reading.windowToday.trim().length === 0 || reading.scoreToday.trim().length === 0 || reading.sizeToday.trim().length === 0) {
      findings.push('el resto de la sección de hoy se cayó con la ventana');
    }
    assertBehavior(
      findings,
      'omitir el elemento entero cuando el día no publicó ventana, dejando intacto el resto de su sección y el desglose del otro día.',
    );
  },
);

Then(
  'la playa sin desglose heredado queda sin barras y la mañana lo registra una sola vez por día',
  { timeout: 600_000 },
  async function (this: PipelineWorld) {
    const world = world01(this);
    const active = requiredHarness();
    const { spotId } = plannedFor('sin-desglose-legado');
    const legacy = await openSpot(world, spotId, 390, 'claro', 'normal');
    const findings: string[] = [];
    if (legacy.breakdownToday.count !== 0 || legacy.breakdownTomorrow.count !== 0) {
      findings.push(`la playa vieja mostró ${legacy.breakdownToday.count + legacy.breakdownTomorrow.count} desglose(s) sin tener horas publicadas`);
    }
    if (legacy.today === null && legacy.tomorrow === null) {
      findings.push('la playa vieja perdió también su frase del punto débil, y esa sí la publicó');
    }
    const events = breakdownHealthEvents(active.uiGate.buildOutput);
    // Identity, not line count: the same spot-day is rendered once per locale,
    // so the fact recorded is one gap per spot-day, not one line per document.
    const recorded = [...new Set(events.map((event) => `${String(event.spot_id)}/${String(event.day)}`))].sort();
    if (JSON.stringify(recorded) !== JSON.stringify([`${spotId}/today`, `${spotId}/tomorrow`])) {
      findings.push(`la mañana registró ${JSON.stringify(recorded)} y la única ausencia heredada es la de ${spotId} en sus dos días`);
    }
    if (events.some((event) => typeof event.published_at !== 'string' || String(event.published_at).length === 0)) {
      findings.push('un registro de ausencia heredada llegó sin el sello de publicación de esa mañana');
    }
    assertBehavior(
      findings,
      'omitir las barras y registrar una sola ausencia heredada por playa y día durante la publicación, sin confundirla con un día sin ventana ni con un error del productor, y sin telemetría en el teléfono.',
    );
  },
);

Then('el desglose publicado no deja cálculo ni código en el teléfono', function (this: PipelineWorld) {
  const world = world01(this);
  const { spotId } = plannedFor(world.killedItOpened ?? '');
  const dist = join(requiredHarness().root, 'dist');
  const emitted = readFileSync(join(dist, 'spots', `${spotId}.html`), 'utf8');
  const scripts = [...emitted.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]
    .flatMap((match) => {
      const inline = match[2] ?? '';
      const source = /\bsrc=["']([^"']+)["']/iu.exec(match[1] ?? '')?.[1];
      if (source === undefined) return [inline];
      const asset = resolveEmittedFile(dist, source);
      return asset === null ? [`unresolved emitted script: ${source}`] : [inline, readFileSync(asset, 'utf8')];
    });
  const findings: string[] = [];
  if (!emitted.includes('data-field="breakdown"')) {
    findings.push('el desglose no quedó en el documento publicado');
  }
  for (const script of scripts) {
    if (script.startsWith('unresolved emitted script:')) {
      findings.push(script);
      continue;
    }
    if (/breakdown|hourly|best_window|weakest_link|health\.publish|telemetry|sendBeacon/iu.test(script)) {
      findings.push('el documento publicado manda la selección de la hora o su registro a código del teléfono');
      break;
    }
  }
  assertBehavior(
    findings,
    'resolver la hora, los cuatro valores y la fila marcada en la publicación, y enviar al teléfono solo el resultado ya escrito: sin isla, sin fetch, sin reloj y sin telemetría.',
  );
});

// ------------------------------------------- slice-05: the static break map --
//
// The map behaviours drive two surfaces, never a third: the real map-asset
// build port (a pure decision over the tracked policy, plus the generator that
// writes bytes), and the already-built emitted `dist/` this file serves over
// HTTP. No scenario here contacts a tile server, a provider, or the network:
// there is no provider. X11 settled the launch path as an orientation-only
// diagram drawn from the human-owned seed, so every input these steps use is
// on disk and citable.
//
// BLOCKED, DELIBERATELY: X12 (the service-worker cache grant owned by
// F-WORKS-WITH-NO-SIGNAL) is not granted, so nothing here asserts cache-first
// behaviour or edits public/sw.js. The native reserved-frame degrade, which
// the roadmap requires independently of the cache owner, is asserted instead.

type MapDecisionsUnderTest = {
  readonly tracked: readonly StaticMapDecision[];
  readonly withoutCredit: readonly StaticMapDecision[];
  readonly strippedSpotId: string;
};

const URL_SCHEME = /https?:\/\//iu;
const RAW_DEGREE = /\d\s*(?:°|deg\b|grados\b)/iu;

/** The committed manifest, as the page reads it. */
function trackedMapManifest(): StaticMapManifest {
  return trackedMapManifestJson as unknown as StaticMapManifest;
}

/** The tracked artefacts, read from the worktree. Never written by a test. */
function loadStaticMapPolicy(): StaticMapPolicy {
  return parseStaticMapPolicy(
    JSON.parse(readFileSync(join(projectRoot, 'data/maps/pa-pacific-map-policy.json'), 'utf8')),
  );
}

function loadLaunchSpotIds(): readonly string[] {
  const launch = JSON.parse(
    readFileSync(join(projectRoot, 'data/spots/pa-pacific-launch-v1.json'), 'utf8'),
  ) as { launch_spot_ids: readonly string[] };
  return launch.launch_spot_ids;
}

function decisionsUnderTest(): MapDecisionsUnderTest {
  const policy = loadStaticMapPolicy();
  const launchSpotIds = loadLaunchSpotIds();
  const strippedSpotId = launchSpotIds[0]!;
  const stripped: StaticMapPolicy = {
    ...policy,
    spots: Object.fromEntries(
      Object.entries(policy.spots).map(([spotId, record]) => (
        spotId === strippedSpotId
          ? [spotId, { ...record, coordinate_attribution: '' }]
          : [spotId, record]
      )),
    ),
  };
  return {
    tracked: decideStaticMapAssets(policy, launchSpotIds),
    withoutCredit: decideStaticMapAssets(stripped, launchSpotIds),
    strippedSpotId,
  };
}

type Slice05World = Slice01World & { killedItMapDecisions?: MapDecisionsUnderTest };

Given('la política de mapas que este proyecto sí puede mostrar', function (this: PipelineWorld) {
  // The tracked policy is the Given. It is read, never written: a test that
  // planted its own policy would prove nothing about what ships.
  const policy = loadStaticMapPolicy();
  assert.equal(policy.path, 'orientation-only', 'test fixture error: X11 settled the orientation-only path');
});

When(
  'la construcción decide playa por playa, junto a una copia sin el crédito de una playa',
  function (this: PipelineWorld) {
    (world01(this) as Slice05World).killedItMapDecisions = decisionsUnderTest();
  },
);

Then(
  'cada playa aprobada trae su crédito visible en español, la playa sin fuente de orientación queda fuera, y la copia sin crédito se niega antes de dibujar',
  function (this: PipelineWorld) {
    const decided = (world01(this) as Slice05World).killedItMapDecisions;
    assert.ok(decided, 'test fixture error: the map decision was never taken');
    const findings: string[] = [];
    const launchSpotIds = loadLaunchSpotIds();

    if (decided.tracked.length !== launchSpotIds.length) {
      findings.push(`la política decidió ${decided.tracked.length} playas de ${launchSpotIds.length}`);
    }
    const approved = decided.tracked.filter((decision) => decision.kind === 'approved');
    if (approved.length === 0) findings.push('ninguna playa quedó aprobada, así que no hay mapa que mostrar');

    for (const decision of approved) {
      const caption = decision.caption;
      if (!caption.includes(decision.coordinate_attribution)) {
        findings.push(`${decision.spot_id} no muestra de dónde salió su ubicación`);
      }
      if (!caption.includes(decision.orientation_attribution)) {
        findings.push(`${decision.spot_id} no muestra de dónde salió su orientación`);
      }
      if (EM_DASH.test(caption)) findings.push(`${decision.spot_id} usa un guión largo en su crédito`);
      if (URL_SCHEME.test(caption)) findings.push(`${decision.spot_id} muestra una dirección cruda en su crédito`);
      if (RAW_DEGREE.test(caption)) findings.push(`${decision.spot_id} muestra grados crudos en su crédito`);
      if (CODE_LEAK.test(caption)) findings.push(`${decision.spot_id} filtra una palabra del código en su crédito`);
    }

    // The two Chiriquí beaches carry `orientation_source: null` in the human-
    // owned seed: no source states their facing. Drawing an arrow for them
    // would be the exact invention this product forbids.
    const refusedIds = decided.tracked
      .filter((decision) => decision.kind === 'refused')
      .map((decision) => decision.spot_id);
    for (const spotId of ['playa-la-barqueta', 'las-lajas']) {
      if (!refusedIds.includes(spotId)) {
        findings.push(`${spotId} recibió un mapa aunque ninguna fuente dice hacia dónde mira`);
      }
    }

    const strippedDecision = decided.withoutCredit.find((decision) => decision.spot_id === decided.strippedSpotId);
    if (strippedDecision?.kind !== 'refused') {
      findings.push('una playa sin crédito de ubicación igual recibió su mapa');
    }
    const unchanged = decided.withoutCredit.filter((decision) => decision.spot_id !== decided.strippedSpotId);
    const before = decided.tracked.filter((decision) => decision.spot_id !== decided.strippedSpotId);
    if (JSON.stringify(unchanged) !== JSON.stringify(before)) {
      findings.push('quitarle el crédito a una playa cambió la decisión de otra');
    }

    assertBehavior(
      findings,
      'aprobar solo las playas cuya ubicación y orientación tienen fuente citable, componer su crédito visible en español desde esa fuente, y negar el mapa de la playa a la que le falta, sin tocar a las demás.',
    );
  },
);

type DrawnMaps = {
  readonly first: StaticMapManifest;
  readonly second: StaticMapManifest;
  readonly assetDir: string;
  readonly brokenRefusal: string;
  readonly brokenWrote: readonly string[];
};

/** A copy carrying only what the generator reads, so no scenario touches the worktree. */
function isolatedMapProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'surfs-up-killed-it-maps-'));
  cpSync(join(projectRoot, 'data/maps'), join(root, 'data/maps'), { recursive: true });
  cpSync(join(projectRoot, 'data/spots'), join(root, 'data/spots'), { recursive: true });
  return root;
}

type Slice05MapWorld = Slice01World & { killedItDrawnMaps?: DrawnMaps };

When(
  'la construcción dibuja los mapas, los vuelve a dibujar sin cambiar nada, y luego lo intenta con una política rota',
  { timeout: 120_000 },
  async function (this: PipelineWorld) {
    const root = isolatedMapProject();
    const first = await writeStaticMaps({ projectRoot: root });
    const second = await writeStaticMaps({ projectRoot: root });

    const brokenRoot = isolatedMapProject();
    writeFileSync(join(brokenRoot, 'data/maps/pa-pacific-map-policy.json'), '{"schema":"static-map-policy/1"}\n');
    let brokenRefusal = '';
    try {
      await writeStaticMaps({ projectRoot: brokenRoot });
    } catch (error) {
      brokenRefusal = error instanceof Error ? error.message : String(error);
    }
    const brokenAssetDir = join(brokenRoot, 'public');

    (world01(this) as Slice05MapWorld).killedItDrawnMaps = {
      first,
      second,
      assetDir: join(root, 'public/maps'),
      brokenRefusal,
      brokenWrote: existsSync(brokenAssetDir) ? readdirSync(brokenAssetDir) : [],
    };
    rmSync(brokenRoot, { recursive: true, force: true });
  },
);

Then(
  'cada playa aprobada queda con su propio archivo liviano y su fila en el listado, el segundo dibujo repite las mismas identidades, y la política rota se niega antes de escribir un archivo',
  function (this: PipelineWorld) {
    const drawn = (world01(this) as Slice05MapWorld).killedItDrawnMaps;
    assert.ok(drawn, 'test fixture error: no map was ever drawn');
    const findings: string[] = [];
    const approved = Object.values(drawn.first.spots);

    if (approved.length === 0) findings.push('la construcción no dibujó ni un mapa');
    const emitted = readdirSync(drawn.assetDir);
    if (emitted.length !== approved.length) {
      findings.push(`quedaron ${emitted.length} archivos para ${approved.length} playas aprobadas`);
    }

    for (const row of approved) {
      const file = join(drawn.assetDir, row.path.slice(row.path.lastIndexOf('/') + 1));
      if (!existsSync(file)) {
        findings.push(`${row.spot_id} tiene fila en el listado pero no tiene archivo`);
        continue;
      }
      const bytes = readFileSync(file);
      if (bytes.length > 12 * 1024) findings.push(`el mapa de ${row.spot_id} pesa ${bytes.length} bytes`);
      if (bytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
        findings.push(`el archivo de ${row.spot_id} no es la imagen que su fila dice`);
      }
      if (!row.path.startsWith('/maps/')) findings.push(`${row.spot_id} se sirve desde fuera del sitio: ${row.path}`);
      if (!row.path.includes(row.digest.slice(0, 12))) {
        findings.push(`la dirección de ${row.spot_id} no lleva la identidad de sus propios bytes`);
      }
      if (row.seed_revision.length === 0 || row.generator_version.length === 0) {
        findings.push(`${row.spot_id} perdió el rastro de la semilla o de quién lo dibujó`);
      }
    }

    if (JSON.stringify(drawn.second) !== JSON.stringify(drawn.first)) {
      findings.push('volver a dibujar sin cambiar nada produjo otro listado');
    }
    if (!/static map policy refused/.test(drawn.brokenRefusal)) {
      findings.push('una política rota no detuvo la construcción');
    }
    if (drawn.brokenWrote.length > 0) {
      findings.push(`la política rota alcanzó a escribir ${drawn.brokenWrote.join(', ')}`);
    }

    assertBehavior(
      findings,
      'dibujar cada mapa aprobado antes de la construcción del sitio, como un archivo local liviano cuyo nombre son sus propios bytes, con una fila que lo acredita; repetir exactamente lo mismo cuando nada cambió; y negarse antes de escribir cuando la política no se puede leer.',
    );
  },
);

type TurnedMaps = {
  readonly before: StaticMapManifest;
  readonly turned: StaticMapManifest;
  readonly turnedSpotId: string;
  readonly blanked: StaticMapManifest;
  readonly blankedSpotId: string;
  readonly blankedDir: string;
  readonly declaredFacings: ReadonlyMap<string, number | null>;
  readonly drawnBearings: ReadonlyMap<string, number>;
};

/** Rewrites exactly one seed row's declared facing, inside a copy. */
function rewriteSeedFacing(root: string, spot_id: string, facing: string): void {
  const seedPath = join(root, 'data/spots/pa-pacific.yaml');
  const seed = readFileSync(seedPath, 'utf8');
  const rowStart = seed.indexOf(`  - spot_id: ${spot_id}\n`);
  assert.ok(rowStart > 0, `test fixture error: ${spot_id} is not in the seed copy`);
  const rowEnd = seed.indexOf('\n  - spot_id: ', rowStart + 1);
  const row = seed.slice(rowStart, rowEnd);
  writeFileSync(
    seedPath,
    seed.slice(0, rowStart) + row.replace(/shore_normal_deg: \d+/u, `shore_normal_deg: ${facing}`) + seed.slice(rowEnd),
  );
}

/**
 * The bearing an arrow actually points, read back off the drawn line. Computed
 * here with this file's own trigonometry, never by calling the drawing code:
 * asking the production module to confirm its own answer would agree with any
 * mutation of it.
 */
function drawnBearingOf(svg: string, width: number, height: number): number {
  const shaft = /<line\b[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"/u.exec(svg);
  assert.ok(shaft, 'the diagram drew no orientation arrow');
  const dx = Number(shaft[1]) - width / 2;
  const dy = height / 2 - Number(shaft[2]);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

type Slice05SeedWorld = Slice01World & { killedItTurnedMaps?: TurnedMaps };

Given('la semilla que dice hacia dónde mira cada playa', function () {
  const facings = loadLaunchSpotOrientations();
  assert.ok(facings.length > 0, 'test fixture error: the seed lists no launch spot');
});

When(
  'la construcción dibuja los mapas, luego gira una sola playa, y luego le borra la orientación a otra',
  { timeout: 180_000 },
  async function (this: PipelineWorld) {
    const declaredFacings = new Map(
      loadLaunchSpotOrientations().map((row) => [row.spot_id, row.shore_normal_deg] as const),
    );

    const baseRoot = isolatedMapProject();
    const before = (await planStaticMaps({ projectRoot: baseRoot })).manifest;
    const drawnBearings = new Map(
      Object.keys(before.spots).map((spot_id) => [
        spot_id,
        drawnBearingOf(
          renderStaticMapDiagram(before.frame, {
            spot_id,
            shore_normal_deg: declaredFacings.get(spot_id) ?? null,
          }),
          before.frame.width,
          before.frame.height,
        ),
      ] as const),
    );

    const turnedSpotId = Object.keys(before.spots)[3]!;
    rewriteSeedFacing(baseRoot, turnedSpotId, '42');
    const turned = (await planStaticMaps({ projectRoot: baseRoot })).manifest;

    const blankedRoot = isolatedMapProject();
    const blankedSpotId = Object.keys(before.spots)[0]!;
    rewriteSeedFacing(blankedRoot, blankedSpotId, 'null');
    const blanked = await writeStaticMaps({ projectRoot: blankedRoot });

    (world01(this) as Slice05SeedWorld).killedItTurnedMaps = {
      before,
      turned,
      turnedSpotId,
      blanked,
      blankedSpotId,
      blankedDir: join(blankedRoot, 'public/maps'),
      declaredFacings,
      drawnBearings,
    };
    rmSync(baseRoot, { recursive: true, force: true });
  },
);

Then(
  'cada flecha sale de la orientación declarada de su propia playa, girar una mueve solo su mapa, y la playa sin orientación usable se queda sin mapa',
  function (this: PipelineWorld) {
    const maps = (world01(this) as Slice05SeedWorld).killedItTurnedMaps;
    assert.ok(maps, 'test fixture error: no map was ever turned');
    const findings: string[] = [];

    for (const [spot_id, bearing] of maps.drawnBearings) {
      const declared = maps.declaredFacings.get(spot_id);
      if (declared === null || declared === undefined) {
        findings.push(`${spot_id} recibió una flecha sin orientación declarada`);
        continue;
      }
      if (Math.abs(bearing - declared) > 0.5) {
        findings.push(`la flecha de ${spot_id} apunta a ${Math.round(bearing)} y su semilla dice ${declared}`);
      }
    }

    // Six distinct facings across eighteen spots: a generic regional arrow would
    // collapse them to one, and reading the row above would shift them all.
    if (new Set(maps.drawnBearings.values()).size < 2) {
      findings.push('todas las playas comparten una sola flecha regional');
    }

    const turnedRow = maps.turned.spots[maps.turnedSpotId];
    if (turnedRow === undefined || turnedRow.digest === maps.before.spots[maps.turnedSpotId]!.digest) {
      findings.push(`girar ${maps.turnedSpotId} no movió su propio mapa`);
    }
    for (const [spot_id, row] of Object.entries(maps.before.spots)) {
      if (spot_id === maps.turnedSpotId) continue;
      if (maps.turned.spots[spot_id]?.digest !== row.digest) {
        findings.push(`girar ${maps.turnedSpotId} también movió ${spot_id}`);
      }
    }
    if (maps.turned.frame.width !== maps.before.frame.width || maps.turned.frame.height !== maps.before.frame.height) {
      findings.push('girar una playa cambió el tamaño de las imágenes');
    }

    if (maps.blanked.spots[maps.blankedSpotId] !== undefined) {
      findings.push(`${maps.blankedSpotId} conservó su mapa sin una orientación que la semilla declare`);
    }
    if (maps.blanked.refused[maps.blankedSpotId] !== 'orientation_absent_from_seed') {
      findings.push(`${maps.blankedSpotId} no quedó registrado como una orientación que la semilla no declara`);
    }
    if (readdirSync(maps.blankedDir).some((file) => file.startsWith(`${maps.blankedSpotId}-`))) {
      findings.push(`quedó un archivo de mapa de ${maps.blankedSpotId} después de negarlo`);
    }

    assertBehavior(
      findings,
      'tomar la orientación de la propia fila de cada playa en la semilla y hornearla en su flecha, de modo que girar una playa mueva solo su imagen y una playa sin orientación declarada no reciba ninguna.',
    );
  },
);

// ------------------------------------------- slice-05: the rendered figure --

type MapReading = {
  readonly figures: number;
  readonly alt: string | null;
  readonly caption: string | null;
  readonly src: string | null;
  readonly loading: string | null;
  readonly declaredWidth: string | null;
  readonly declaredHeight: string | null;
  readonly frameAspectRatio: string;
  readonly frameBackground: string;
  readonly frameHasSize: boolean;
  readonly spinners: number;
  readonly figureOverflows: boolean;
};

async function readStaticMap(page: Page): Promise<MapReading> {
  return page.evaluate(() => {
    const figures = document.querySelectorAll('[data-field="static-map"]');
    const figure = figures[0] ?? null;
    const image = figure?.querySelector('img') ?? null;
    const frame = figure?.querySelector('.img-frame') ?? null;
    const frameStyle = frame === null ? null : getComputedStyle(frame);
    const frameRect = frame?.getBoundingClientRect();
    return {
      figures: figures.length,
      alt: image?.getAttribute('alt') ?? null,
      caption: (figure?.querySelector('figcaption') as HTMLElement | null)?.innerText.trim() ?? null,
      src: image?.getAttribute('src') ?? null,
      loading: image?.getAttribute('loading') ?? null,
      declaredWidth: image?.getAttribute('width') ?? null,
      declaredHeight: image?.getAttribute('height') ?? null,
      frameAspectRatio: frameStyle?.aspectRatio ?? '',
      frameBackground: frameStyle?.backgroundColor ?? '',
      frameHasSize: (frameRect?.width ?? 0) > 0 && (frameRect?.height ?? 0) > 0,
      spinners: figure?.querySelectorAll('[role="progressbar"], .spinner, .skeleton').length ?? 0,
      figureOverflows: figure === null
        ? false
        : (figure as HTMLElement).scrollWidth > document.documentElement.clientWidth,
    };
  });
}

async function auditMapQuality(page: Page): Promise<RawVisualAudit> {
  return page.evaluate(() => {
    const figures = [...document.querySelectorAll('[data-field="static-map"]')];
    const cells = figures.flatMap((figure) => [...figure.querySelectorAll('figcaption, .img-frame')]);
    const pieces = cells.map((el) => {
      let backdrop = 'rgba(0, 0, 0, 0)';
      let node: Element | null = el;
      while (node !== null) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          backdrop = candidate;
          break;
        }
        node = node.parentElement;
      }
      const style = getComputedStyle(el);
      return {
        day: el.tagName.toLowerCase(),
        color: style.color,
        backdrop,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    });
    const taps = figures.flatMap((el) => [...el.querySelectorAll('a,button,summary,[role="button"],input,select')].map((control) => {
      const rect = control.getBoundingClientRect();
      return { where: `mapa ${control.tagName.toLowerCase()}`, width: rect.width, height: rect.height };
    }));
    const cta = document.querySelector('a.cta')?.getBoundingClientRect();
    const moving = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? figures
        .flatMap((el) => [el, ...el.querySelectorAll('*')])
        .filter((el) => getComputedStyle(el).transitionDuration.split(',').some((duration) => Number.parseFloat(duration) > 0)
          || getComputedStyle(el).animationName !== 'none')
        .map(() => 'el mapa')
      : [];
    const loadingCount = figures.filter((el) => el.querySelector('[role="progressbar"], .spinner, .skeleton') !== null).length;
    const inlineHex = figures
      .flatMap((el) => [el, ...el.querySelectorAll('*')])
      .filter((el) => /#[0-9a-f]{3,8}/i.test(el.getAttribute('style') ?? '')).length;
    return {
      pieces,
      taps,
      ctaWidth: cta?.width ?? 0,
      ctaHeight: cta?.height ?? 0,
      moving,
      loadingCount,
      inlineHex,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
}

Then(
  'el mapa de su playa aparece una sola vez, con su crédito visible y su texto alternativo en español',
  function (this: PipelineWorld) {
    const world = world01(this);
    const map = world.killedItMapReading;
    assert.ok(map, 'test fixture error: the map was never read');
    const { spotId } = plannedFor(world.killedItOpened ?? '');
    const row = trackedMapManifest().spots[spotId];
    assert.ok(row, `test fixture error: ${spotId} has no approved map to read`);
    const findings: string[] = [];

    if (map.figures !== 1) findings.push(`la playa muestra ${map.figures} mapas`);
    if (map.src !== row.path) findings.push(`el mapa sirve ${map.src} y su ficha acredita ${row.path}`);
    if (map.caption !== row.caption) findings.push(`el crédito visible dice "${map.caption}" y no lo que acredita su ficha`);
    if (map.alt === null || map.alt.trim().length < 20) {
      findings.push(`el texto alternativo del mapa no explica nada: "${map.alt}"`);
    }
    for (const [label, text] of [['el crédito', map.caption], ['el texto alternativo', map.alt]] as const) {
      if (text === null) continue;
      if (EM_DASH.test(text)) findings.push(`${label} usa un guión largo`);
      if (URL_SCHEME.test(text)) findings.push(`${label} muestra una dirección cruda`);
      if (RAW_DEGREE.test(text)) findings.push(`${label} muestra grados crudos`);
      if (CODE_LEAK.test(text)) findings.push(`${label} filtra una palabra del código: "${text}"`);
    }

    assertBehavior(
      findings,
      'montar una sola figura por playa, servir exactamente el archivo que su ficha acredita, mostrar ese crédito a la vista y describir el diagrama en español para quien no puede verlo.',
    );
  },
);

Then(
  'el mapa reserva su espacio y llega tarde, sin girar una rueda ni pedir nada al abrir',
  function (this: PipelineWorld) {
    const world = world01(this);
    const map = world.killedItMapReading;
    assert.ok(map, 'test fixture error: the map was never read');
    const findings: string[] = [];

    if (map.loading !== 'lazy') findings.push(`la imagen del mapa carga con loading="${map.loading}"`);
    if (map.declaredWidth === null || map.declaredHeight === null) {
      findings.push('la imagen del mapa no declara su tamaño, así que la página salta cuando llega');
    }
    // A reserved frame is the whole degrade surface: the alt text renders inside
    // it when the image never arrives, and nothing moves when it does.
    if (map.frameAspectRatio === 'auto' || map.frameAspectRatio === '') {
      findings.push('el recuadro del mapa no reserva su proporción antes de que llegue la imagen');
    }
    if (!map.frameHasSize) findings.push('el recuadro del mapa ocupa cero espacio antes de cargar');
    if (map.frameBackground === 'rgba(0, 0, 0, 0)' || map.frameBackground === '') {
      findings.push('el recuadro del mapa es invisible, así que un fallo de carga no deja nada donde estaba');
    }
    if (map.spinners > 0) findings.push('el mapa muestra una rueda de carga');
    if (map.figureOverflows) findings.push('el mapa desborda el ancho de la pantalla');
    if (map.src !== null && !map.src.startsWith('/maps/')) {
      findings.push(`el mapa pide su imagen a ${map.src}, fuera del propio sitio`);
    }

    assertBehavior(
      findings,
      'reservar el espacio del mapa con su propia proporción y su fondo hundido, cargarlo tarde desde el propio sitio, y dejar que el texto alternativo ocupe ese mismo recuadro cuando la imagen no llega: sin rueda, sin salto y sin pedido a nadie más.',
    );
  },
);

Then('el mapa cumple las siete comprobaciones visuales sobre el fondo real', function (this: PipelineWorld) {
  const world = world01(this);
  const reading = requiredReading(world);
  const audit = world.killedItMapVisual;
  assert.ok(audit, 'test fixture error: the map visual audit was never taken');
  const findings: string[] = [];

  if (audit.pieces.length < 2) {
    findings.push(`U1/U5: se esperaban el recuadro y el crédito del mapa y hay ${audit.pieces.length} piezas; no hay nada que medir contra el fondo real`);
  }
  for (const piece of audit.pieces) {
    const foreground = parseRgb(piece.color);
    const background = parseRgb(piece.backdrop);
    if (foreground === null || background === null) {
      findings.push(`U1: no se pudo medir el contraste de ${piece.day}`);
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) findings.push(`U1: ${piece.day} queda en ${ratio.toFixed(2)}:1 sobre su fondo real`);
    const fontSize = Number.parseFloat(piece.fontSize);
    const lineHeight = Number.parseFloat(piece.lineHeight);
    if (!Number.isFinite(fontSize) || fontSize < 14) findings.push(`U6: ${piece.day} se compone a ${piece.fontSize}`);
    if (Number.isFinite(lineHeight) && Number.isFinite(fontSize) && lineHeight < fontSize * 1.2) {
      findings.push(`U6: ${piece.day} tiene un interlineado apretado (${piece.lineHeight} sobre ${piece.fontSize})`);
    }
  }
  if (reading.scrollWidth > reading.clientWidth) {
    findings.push(`U2: la página desborda a 390 px con el mapa montado (${reading.scrollWidth} > ${reading.clientWidth})`);
  }
  for (const tap of audit.taps) {
    if (tap.width < 44 || tap.height < 44) findings.push(`U3: ${tap.where} mide ${Math.round(tap.width)} por ${Math.round(tap.height)} px`);
  }
  if (audit.ctaWidth < 44 || audit.ctaHeight < 44) {
    findings.push(`U3: el llamado a reportar quedó desplazado u ocluido (${Math.round(audit.ctaWidth)} por ${Math.round(audit.ctaHeight)} px)`);
  }
  if (audit.moving.length > 0) findings.push('U4: con movimiento reducido el mapa sigue animándose');
  if (audit.loadingCount !== 0) findings.push('U5: el mapa muestra carga artificial en vez de su recuadro reservado');
  if (audit.inlineHex !== 0) findings.push('U7: el mapa trae color en crudo en su atributo de estilo, en vez de un token');
  const gate = requiredHarness().uiGate;
  if (gate.status !== 0) findings.push(`U2/U4/U6/U7: el gate visual de la superficie falló: ${gate.output.trim()}`);

  assertBehavior(
    findings,
    'construir el mapa con los tokens y la escala tipográfica ya declarados, medido sobre el fondo real de la página en los dos temas, no sobre blanco.',
  );
});

// ------------------------------------- slice-05: the map's place on the site --
//
// X12 IS NOT GRANTED, so nothing below asserts cache-first behaviour and nothing
// edits public/sw.js. The offline half of this step's contract is deferred with
// its owner (F-WORKS-WITH-NO-SIGNAL). What the roadmap requires independently of
// the cache owner IS asserted: the map adds no document weight and no route
// JavaScript, it exists on exactly one route, and its reserved frame degrades on
// its own.

/** Routes the map is forbidden from reaching, and the emitted file behind each. */
const MAP_FREE_ROUTES: readonly (readonly [string, string])[] = [
  ['la lista de hoy', 'index.html'],
  ['mañana', 'manana.html'],
  ['el reporte', 'spots/playa-venao/reportar.html'],
  ['el ayer', 'spots/playa-venao/ayer.html'],
];

Then(
  'el mapa vive solo en la ficha de la playa, y la lista, mañana, el reporte y el ayer siguen sin mapa',
  function (this: PipelineWorld) {
    const world = world01(this);
    const { spotId } = plannedFor(world.killedItOpened ?? '');
    const dist = join(requiredHarness().root, 'dist');
    const spotDocument = readFileSync(join(dist, 'spots', `${spotId}.html`), 'utf8');
    const findings: string[] = [];

    const mounted = spotDocument.match(/data-field="static-map"/gu)?.length ?? 0;
    if (mounted !== 1) findings.push(`la ficha de ${spotId} monta ${mounted} mapas`);
    // The host keeps everything it had. A map that displaced a day summary or
    // the report action would be a regression dressed as a feature.
    for (const [label, marker] of [
      ['el resumen de hoy', 'data-day="today"'],
      ['el resumen de mañana', 'data-day="tomorrow"'],
      ['el botón de reportar', 'class="cta"'],
    ] as const) {
      if (!spotDocument.includes(marker)) findings.push(`la ficha perdió ${label}`);
    }

    for (const [label, file] of MAP_FREE_ROUTES) {
      const emitted = readFileSync(join(dist, file), 'utf8');
      if (/data-field="static-map"|\/maps\//u.test(emitted)) findings.push(`${label} recibió un mapa`);
    }

    assertBehavior(
      findings,
      'montar el mapa una sola vez, en la ficha en español de la playa, sin desplazar sus dos días ni su botón de reportar, y sin que ninguna otra pantalla lo herede.',
    );
  },
);

Then(
  'el mapa no le suma peso al documento ni código al teléfono, y la página sigue bajo su techo',
  function (this: PipelineWorld) {
    const world = world01(this);
    const { spotId } = plannedFor(world.killedItOpened ?? '');
    const harness = requiredHarness();
    const dist = join(harness.root, 'dist');
    const emitted = readFileSync(join(dist, 'spots', `${spotId}.html`), 'utf8');
    const findings: string[] = [];

    const image = /<img\b[^>]*src="\/maps\/[^"]+"[^>]*>/u.exec(emitted)?.[0] ?? '';
    if (image === '') findings.push('la ficha no emitió la imagen del mapa');
    if (!/\bloading="lazy"/u.test(image)) findings.push('la imagen del mapa no queda fuera de la primera visita');

    const scripts = [...emitted.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]
      .flatMap((match) => {
        const inline = match[2] ?? '';
        const source = /\bsrc=["']([^"']+)["']/iu.exec(match[1] ?? '')?.[1];
        if (source === undefined) return [inline];
        const asset = resolveEmittedFile(dist, source);
        return asset === null ? [`unresolved emitted script: ${source}`] : [inline, readFileSync(asset, 'utf8')];
      });
    for (const script of scripts) {
      if (script.startsWith('unresolved emitted script:')) {
        findings.push(script);
        continue;
      }
      if (/maps\/|shore_normal|leaflet|mapbox|maplibre|tile|IntersectionObserver/iu.test(script)) {
        findings.push('el documento publicado manda código de mapa al teléfono');
        break;
      }
    }

    // The gate the whole site already lives under, re-run over this build.
    const budget = spawnSync('node', ['scripts/check-page-weight.mjs'], {
      cwd: harness.root,
      env: credentialFreeEnvironment(),
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    const budgetOutput = `${budget.stdout}${budget.stderr}`;
    if (budget.status !== 0) findings.push(`la página se pasó de su techo: ${budgetOutput.trim()}`);
    const spotRoute = /^route \/spots\/\{slug\}.*?document ([\d,]+) B gz/mu.exec(budgetOutput)
      ?? /^route .*?spots.*?document ([\d,]+) B gz/mu.exec(budgetOutput);
    if (spotRoute === null) findings.push('el gate de peso no midió la ficha de la playa');

    assertBehavior(
      findings,
      'servir el mapa como una imagen local que llega tarde, fuera de los bytes de la primera visita, sin una sola línea de código de mapa en el documento, y sin acercar la ficha a su techo.',
    );
  },
);

Then(
  'la construcción se niega cuando el listado acredita una imagen que ya no está',
  { timeout: 180_000 },
  function () {
    // A FULL production build over a copy whose bytes were swapped under a
    // credit that stayed. The oracle is the real `npm run build`, not the
    // generator in isolation: the contract is that no page is emitted at all.
    const root = copyProjectForSurface();
    const findings: string[] = [];
    try {
      const row = Object.values(trackedMapManifest().spots)[0]!;
      writeFileSync(join(root, 'public/maps', row.path.slice(row.path.lastIndexOf('/') + 1)), 'otra imagen');

      const build = spawnSync('npm', ['run', 'build'], {
        cwd: root,
        env: credentialFreeEnvironment(),
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      const output = `${build.stdout}${build.stderr}`;
      if (build.status === 0) findings.push('la construcción aceptó un listado que acredita otra imagen');
      if (!/static map build refused/u.test(output)) {
        findings.push(`la construcción falló sin decir por qué: ${output.trim().slice(-300)}`);
      }
      if (existsSync(join(root, 'dist', 'spots', `${row.spot_id}.html`))) {
        findings.push('la construcción alcanzó a emitir la ficha de la playa antes de negarse');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    assertBehavior(
      findings,
      'comprobar, antes de emitir una sola página, que cada imagen en el sitio es exactamente la que su fila acredita, y negarse cuando no lo es.',
    );
  },
);

// ------------------------------ slice-05: the built surface, every beach --

type MapProfiles = {
  readonly approved_count: number;
  readonly refused: readonly { readonly spot_id: string; readonly reason: string }[];
  readonly roles: Readonly<Record<string, string>>;
};

const mapProfiles = JSON.parse(readFileSync(
  join(projectRoot, 'tests/acceptance/f-see-what-killed-it/fixtures/slice-05-map-profiles.json'),
  'utf8',
)) as MapProfiles;

type OfflineMapReading = MapReading & {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameText: string;
  readonly imageLoaded: boolean;
  readonly ctaWidth: number;
  readonly ctaHeight: number;
  readonly pageOverflows: boolean;
  readonly technicalText: string[];
};

async function readOfflineMap(page: Page): Promise<OfflineMapReading> {
  const base = await readStaticMap(page);
  const extra = await page.evaluate(() => {
    const figure = document.querySelector('[data-field="static-map"]');
    const frame = figure?.querySelector('.img-frame') ?? null;
    const rect = frame?.getBoundingClientRect();
    const image = figure?.querySelector('img') as HTMLImageElement | null;
    const cta = document.querySelector('a.cta')?.getBoundingClientRect();
    const text = (figure as HTMLElement | null)?.innerText ?? '';
    return {
      frameWidth: rect?.width ?? 0,
      frameHeight: rect?.height ?? 0,
      // What a reader can actually see inside the reserved box. A broken image
      // renders its alt text here; an empty string means the box says nothing.
      frameText: `${image?.getAttribute('alt') ?? ''} ${text}`.trim(),
      imageLoaded: image !== null && image.naturalWidth > 0,
      ctaWidth: cta?.width ?? 0,
      ctaHeight: cta?.height ?? 0,
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      technicalText: [...document.querySelectorAll('body *')]
        .map((el) => (el as HTMLElement).innerText ?? '')
        .filter((value) => /https?:\/\/|\.webp\b|undefined|NaN|\[object|Error:/u.test(value))
        .slice(0, 4),
    };
  });
  return { ...base, ...extra };
}

type Slice05BuiltWorld = Slice01World & {
  killedItMapSweep?: ReadonlyMap<string, MapReading>;
  killedItMapRequests?: readonly string[];
  killedItOfflineMap?: OfflineMapReading;
};

When(
  'el surfista recorre todas las playas y mira el mapa de cada una',
  { timeout: 900_000 },
  async function (this: PipelineWorld) {
    const world = world01(this);
    const active = await ensureHarness();
    const page = await ensurePage(world, 390, 'claro', 'normal');
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    const sweep = new Map<string, MapReading>();
    for (const spot_id of loadLaunchSpotIds()) {
      const response = await page.goto(`${active.url}/spots/${spot_id}/`, { waitUntil: 'load' });
      assert.equal(response?.status(), 200, `test fixture error: /spots/${spot_id}/ did not serve`);
      sweep.set(spot_id, await readStaticMap(page));
    }
    (world as Slice05BuiltWorld).killedItMapSweep = sweep;
    (world as Slice05BuiltWorld).killedItMapRequests = requests;
  },
);

Then(
  'cada playa con mapa muestra el suyo, con su propia orientación y su propio crédito, y las que no tienen fuente no muestran ninguno',
  function (this: PipelineWorld) {
    const sweep = (world01(this) as Slice05BuiltWorld).killedItMapSweep;
    assert.ok(sweep, 'test fixture error: the beaches were never walked');
    const manifest = trackedMapManifest();
    const findings: string[] = [];
    const seenPaths = new Map<string, string>();

    for (const [spot_id, reading] of sweep) {
      const row = manifest.spots[spot_id];
      if (row === undefined) {
        if (reading.figures !== 0) findings.push(`${spot_id} muestra un mapa que nadie acreditó`);
        continue;
      }
      if (reading.figures !== 1) {
        findings.push(`${spot_id} muestra ${reading.figures} mapas`);
        continue;
      }
      if (reading.src !== row.path) findings.push(`${spot_id} sirve ${reading.src} y su ficha acredita ${row.path}`);
      if (reading.caption !== row.caption) findings.push(`${spot_id} muestra un crédito que no es el suyo`);
      if (reading.loading !== 'lazy') findings.push(`${spot_id} no carga su mapa tarde`);
      const owner = seenPaths.get(reading.src ?? '');
      if (owner !== undefined && row.path !== manifest.spots[owner]?.path) {
        findings.push(`${spot_id} y ${owner} comparten la misma dirección de mapa`);
      }
      seenPaths.set(reading.src ?? '', spot_id);
    }

    for (const refused of mapProfiles.refused) {
      const reading = sweep.get(refused.spot_id);
      if (reading === undefined) {
        findings.push(`${refused.spot_id} no se pudo abrir`);
        continue;
      }
      if (reading.figures !== 0) findings.push(`${refused.spot_id} recibió un mapa sin fuente que lo respalde`);
    }
    if (Object.keys(manifest.spots).length !== mapProfiles.approved_count) {
      findings.push(`el listado acredita ${Object.keys(manifest.spots).length} mapas y se esperaban ${mapProfiles.approved_count}`);
    }

    assertBehavior(
      findings,
      'darle a cada playa aprobada su propio diagrama, servido desde la dirección que su propia fila acredita y con el crédito de esa misma fila, y no darle ninguno a la playa cuya orientación ninguna fuente declara.',
    );
  },
);

Then(
  'ninguna playa pide un mosaico, una biblioteca de mapas ni nada fuera del sitio',
  function (this: PipelineWorld) {
    const requests = (world01(this) as Slice05BuiltWorld).killedItMapRequests;
    assert.ok(requests, 'test fixture error: no requests were recorded');
    const origin = requiredHarness().url;
    const findings: string[] = [];

    for (const url of requests) {
      if (!url.startsWith(origin)) findings.push(`la página pidió algo fuera del sitio: ${url}`);
      if (/tile|mapbox|maplibre|leaflet|openstreetmap\.org|arcgis|google.*maps/iu.test(url)) {
        findings.push(`la página pidió un mosaico o una biblioteca de mapas: ${url}`);
      }
    }
    if (requests.length === 0) findings.push('no se registró ni un pedido, así que no hay nada que comprobar');

    assertBehavior(
      findings,
      'servir todo el mapa desde el propio sitio, como un archivo ya dibujado: ni un mosaico, ni un token, ni una biblioteca, ni un pedido a un tercero.',
    );
  },
);

When(
  'el surfista abre la playa del nombre más largo sin poder bajar su mapa, a 390 px, con tema {string} y movimiento {string}',
  { timeout: 600_000 },
  async function (this: PipelineWorld, theme: string, movement: string) {
    const world = world01(this);
    const active = await ensureHarness();
    const page = await ensurePage(world, 390, theme, movement);
    // No signal for this one file, and only this one: everything else about the
    // already-cached document still works, which is exactly the offline case the
    // charter describes.
    await page.route('**/maps/**', (route) => route.abort());
    const spot_id = mapProfiles.roles.longest_name!;
    const response = await page.goto(`${active.url}/spots/${spot_id}/`, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, `test fixture error: /spots/${spot_id}/ did not serve`);
    world.killedItOpened = 'nombre-mas-largo';
    world.killedItTheme = theme;
    world.killedItMovement = movement;
    (world as Slice05BuiltWorld).killedItOfflineMap = await readOfflineMap(page);
    // The @ui-* tags on this scenario have to mean something: the same seven
    // checks run against the DEGRADED figure, where the readable thing is the
    // alt text on the sunken frame rather than the image.
    world.killedItReading = await readCallouts(page);
    world.killedItMapVisual = await auditMapQuality(page);
  },
);

Then(
  'el recuadro del mapa conserva su tamaño y su texto sigue explicando qué debía estar ahí',
  function (this: PipelineWorld) {
    const offline = (world01(this) as Slice05BuiltWorld).killedItOfflineMap;
    assert.ok(offline, 'test fixture error: the offline map was never read');
    const findings: string[] = [];

    if (offline.imageLoaded) findings.push('test fixture error: la imagen sí cargó, no hay degradación que comprobar');
    if (offline.figures !== 1) findings.push(`sin señal la playa muestra ${offline.figures} recuadros de mapa`);
    if (offline.frameWidth < 100 || offline.frameHeight < 40) {
      findings.push(`el recuadro se encogió a ${Math.round(offline.frameWidth)} por ${Math.round(offline.frameHeight)} px`);
    }
    if (offline.frameText.length < 20) findings.push(`el recuadro no dice qué debía estar ahí: "${offline.frameText}"`);
    if (offline.spinners > 0) findings.push('sin señal el mapa muestra una rueda girando');
    if (offline.caption === null || offline.caption.length === 0) findings.push('sin señal el crédito desapareció');

    assertBehavior(
      findings,
      'dejar el mismo recuadro reservado, del mismo tamaño, con su texto alternativo legible y su crédito, cuando la imagen no llega: sin rueda, sin salto y sin desaparecer.',
    );
  },
);

Then(
  'la página no desborda, no muestra un error técnico y el botón de reportar sigue a la mano',
  function (this: PipelineWorld) {
    const offline = (world01(this) as Slice05BuiltWorld).killedItOfflineMap;
    assert.ok(offline, 'test fixture error: the offline map was never read');
    const findings: string[] = [];

    if (offline.pageOverflows) findings.push('la página desborda a 390 px con el mapa caído');
    if (offline.technicalText.length > 0) {
      findings.push(`la página muestra texto técnico: ${offline.technicalText.join(' | ')}`);
    }
    if (offline.ctaWidth < 44 || offline.ctaHeight < 44) {
      findings.push(`el botón de reportar quedó en ${Math.round(offline.ctaWidth)} por ${Math.round(offline.ctaHeight)} px`);
    }

    assertBehavior(
      findings,
      'sostener la página completa cuando el mapa no llega: sin desbordar a 390 px, sin una dirección cruda ni un error en pantalla, y con el botón de reportar todavía alcanzable con el pulgar.',
    );
  },
);

// ---------------------------------------------------------------- cleanup --

After({ tags: '@feature-f-see-what-killed-it', timeout: 30_000 }, async function (this: PipelineWorld) {
  const world = world01(this);
  await world.killedItPage?.close().catch(() => undefined);
  await world.killedItBrowser?.close().catch(() => undefined);
  delete world.killedItPage;
  delete world.killedItBrowser;
});

AfterAll({ timeout: 30_000 }, async function () {
  if (harness === null) return;
  const active = harness;
  harness = null;
  await new Promise<void>((done) => active.server.close(() => done()));
  rmSync(active.root, { recursive: true, force: true });
});
