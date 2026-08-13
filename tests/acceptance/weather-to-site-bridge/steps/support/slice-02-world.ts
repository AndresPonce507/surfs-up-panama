// The slice-02 scenario state and Build's half of the driving surface.
//
// The other observable -- the deployment plan -- lives in ./deployment-plan,
// deliberately free of the cucumber lifecycle so its readers can be proven on
// their own against shapes that already exist.
//
// Slice-01's steps/support/world.ts is SHIPPED AND GREEN and is never edited
// or imported from here: this module carries its own WeakMap and its own
// Before hook, scoped to this feature's slice-02 scenarios only. Both hooks
// run and neither knows about the other.
//
// BUILD'S HALF: `runBuild(overrides)` from src/pipeline/lambda/build-handler.ts,
// driven through its production entry point against readings held in memory,
// with the hour's instant, the public page check and the publisher itself as
// the only stand-ins. Steps OBSERVE only port-exposed things: what the
// injected publisher port was handed, what the hour printed, and what runBuild
// answered. Nothing reaches inside the handler.
//
// THE PINNED SEAMS the crafter implements to (feature-delta.md's DISTILL
// slice-02 section carries the same pins in prose):
//
//   src/pipeline/lambda/build-handler.ts
//     BuildOverrides gains ONE key:
//       invokePublisher?: (invocation: { build_id, bundle_key }) => Promise<unknown>
//     Called AFTER the build log lines are printed, only when outcome.published,
//     exactly once. A successful Publisher answer is followed by the
//     public-manifest probe, because that is the first instant fresh pages can
//     exist. Its rejection is
//     caught: never rethrown, never retried in-cycle, and it never changes what
//     runBuild answers. That ordering is load-bearing -- build.success describes
//     Build's own work, which really happened, so a publisher that hangs must
//     not be able to erase it and page a human about a build that worked.
//     The bundle key handed over is `pub/v1/regions/${REGION_ID}/bundle.json`,
//     composed from the REGION_ID constant this file already passes to
//     runBuildOnce, never a second hand-typed literal: that is the exact key
//     src/pipeline/build.ts:212 writes, and BuildOutcome carries no key of its
//     own, so composing it is unavoidable.
//
//   src/pipeline/lambda/log-events.ts
//     export const PUBLISH_HANDOFF_FAILED_EVENT = 'health.publish.handoff_failed'
//     Informational only, in the health.* family that file already defines: no
//     metric filter watches it. The line Build prints is
//     { event, build_id, reason }.

import { Before } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPOSITORY_ROOT, message, type DeploymentPlan } from './deployment-plan';
import { assertStateDelta, type DeltaPredicate, type StateSnapshot } from '../../../../common/state_delta';

export { message, statedAbsence } from './deployment-plan';

/** Cucumber tag expression: this feature's slice-02 scenarios only. Sibling
 * features have @slice-02 scenarios of their own; the hook must not touch them. */
export const SLICE_02 = '@feature-weather-to-site-bridge and @slice-02';

/** The exact key src/pipeline/build.ts:212 writes the region bundle to. */
export const BUNDLE_KEY = 'pub/v1/regions/pa-pacific/bundle.json';

// ---------- the hour's fixture ----------

const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
export const TODAY = '2026-08-10';
const TOMORROW = '2026-08-11';
/** 06:22 in Panama on TODAY: the dawn cycle Build really runs at :22. */
export const HOUR_INSTANT = '2026-08-10T11:22:00Z';

export const BUILD_SUCCESS_EVENT = 'build.success';
export const BUILD_REFUSED_EVENT = 'build.refused';
export const UNREACHABLE_PUBLISHER_MESSAGE = 'acceptance harness: the publisher could not be reached this hour';

type SpotSeedShape = Readonly<Record<string, unknown>>;

function spotSeed(spotId: string, name: string): SpotSeedShape {
  return {
    spot_id: spotId,
    name,
    region_id: 'pa-pacific',
    timezone: 'America/Panama',
    shore_normal_deg: 175,
    swell_window_deg: [150, 210],
    h_ref_m: 1.3,
    s_size: 0.5,
    wind_optimum: { u_star_kt: 5, k_on_kt: 6, k_off_kt: 15, k_cross_kt: 12 },
    tide: { optimum: 'mid_falling', sigma: 'wide', range_class: 'macrotidal' },
  };
}

export const PACIFIC_SPOTS: readonly SpotSeedShape[] = [spotSeed('playa-venao', 'Playa Venao')];

function predictionLine(spotId: string, date: string, heightM: number, source: string): string {
  return JSON.stringify({
    spot_id: spotId,
    source,
    run_ts: `${date}T06:00Z`,
    valid_ts: `${date}T18:00Z`,
    lead_h: 12,
    swell_h_m: heightM,
    swell_t_s: 14,
    swell_dir_deg: 180,
    wind_speed_kt: 8,
    wind_dir_deg: 40,
    tide_m: 2,
    tide_day_low_m: 0.5,
    tide_day_high_m: 3.5,
    land_masked: false,
  });
}

/** Readings held in memory, the shape tests/unit/build-handler.test.ts already
 * proves runBuild composes against. Heights differ per day so tomorrow's
 * ranking is genuinely its own list, never a byte-clone (build.ts's guard).
 * Every method validates its inputs the way the real store would: a double
 * that accepts what the real adapter rejects is a double that lies. */
export class ReadingsHeldInMemory {
  readonly predictions = new Map<string, string>();

  seedPacific(): void {
    const heightByDate: Readonly<Record<string, number>> = { [TODAY]: 1.2, [TOMORROW]: 0.6 };
    for (const spot of PACIFIC_SPOTS) {
      const spotId = String(spot['spot_id']);
      for (const date of [TODAY, TOMORROW]) {
        this.predictions.set(
          `predictions/v1/dt=${date}/${spotId}.jsonl`,
          MEMBER_SOURCES.map((source) => predictionLine(spotId, date, heightByDate[date]!, source)).join('\n'),
        );
      }
    }
  }

  async getPrediction(key: string): Promise<string | null> {
    assert.ok(typeof key === 'string' && key.length > 0, 'test double: getPrediction needs a key');
    return this.predictions.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    assert.ok(typeof prefix === 'string', 'test double: listPredictions needs a prefix');
    return [...this.predictions.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(): Promise<string | null> {
    return null;
  }

  async putCallIfAbsent(key: string, body: string): Promise<'created' | 'already-exists'> {
    assert.ok(typeof key === 'string' && key.length > 0, 'test double: putCallIfAbsent needs a key');
    assert.ok(typeof body === 'string' && body.length > 0, 'test double: putCallIfAbsent needs a body');
    return 'created';
  }

  async putBundle(key: string, body: string): Promise<void> {
    assert.ok(typeof key === 'string' && key.length > 0, 'test double: putBundle needs a key');
    assert.ok(typeof body === 'string' && body.length > 0, 'test double: putBundle needs a body');
  }

  async putManifest(key: string, body: string): Promise<void> {
    assert.ok(typeof key === 'string' && key.length > 0, 'test double: putManifest needs a key');
    assert.ok(typeof body === 'string' && body.length > 0, 'test double: putManifest needs a body');
  }
}

// ---------- scenario state ----------

export type PublisherHandoff = Readonly<{ build_id: unknown; bundle_key: unknown }>;
export type LoggedLine = Readonly<Record<string, unknown>>;

export type PublisherAnswer =
  | Readonly<{ kind: 'published' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unreachable' }>;

export type Slice02Scenario = {
  absences: string[];
  plan: DeploymentPlan | null;
  readings: ReadingsHeldInMemory;
  freshPagesTurnUpPublicly: boolean;
  publisherAnswer: PublisherAnswer;
  handoffs: PublisherHandoff[];
  /** Handoffs already recorded before the hour under test: the baseline a
   * chained Given leaves behind (Pillar 2). */
  handoffsBeforeThisHour: number;
  logbook: LoggedLine[];
  logbookBeforeThisHour: number;
  buildOutcome: Readonly<Record<string, unknown>> | null;
  buildFailure: unknown;
  handoffResolvedBeforeHourEnded: boolean | null;
  before: StateSnapshot | null;
};

const scenarios = new WeakMap<object, Slice02Scenario>();

export function slice02(world: object): Slice02Scenario {
  const state = scenarios.get(world);
  assert.ok(state, 'test bug: no slice-02 state; the slice-02 Before hook did not run');
  return state;
}

Before({ tags: SLICE_02 }, async function (this: object) {
  const scenario: Slice02Scenario = {
    absences: [],
    plan: null,
    readings: new ReadingsHeldInMemory(),
    freshPagesTurnUpPublicly: true,
    publisherAnswer: { kind: 'published' },
    handoffs: [],
    handoffsBeforeThisHour: 0,
    logbook: [],
    logbookBeforeThisHour: 0,
    buildOutcome: null,
    buildFailure: null,
    handoffResolvedBeforeHourEnded: null,
    before: null,
  };
  scenarios.set(this, scenario);
  await noteMissingHandoffEventName(scenario);
});

/** The one seam whose absence can be NAMED by inspection rather than inferred
 * from an empty list: the handoff-failure event name Build must print. Same
 * convention slice-01 uses for derivePublishLogLines. */
async function noteMissingHandoffEventName(scenario: Slice02Scenario): Promise<void> {
  try {
    const module = await logEventsModule();
    if (typeof module['PUBLISH_HANDOFF_FAILED_EVENT'] !== 'string') {
      scenario.absences.push('src/pipeline/lambda/log-events.ts exports no PUBLISH_HANDOFF_FAILED_EVENT yet');
    }
  } catch (error) {
    scenario.absences.push(`src/pipeline/lambda/log-events.ts failed to load (${message(error)})`);
  }
}

function logEventsModule(): Promise<Record<string, unknown>> {
  return import(
    pathToFileURL(resolve(REPOSITORY_ROOT, 'src/pipeline/lambda/log-events.ts')).href
  ) as Promise<Record<string, unknown>>;
}

export async function handoffFailedEventName(): Promise<string> {
  try {
    const name = (await logEventsModule())['PUBLISH_HANDOFF_FAILED_EVENT'];
    if (typeof name === 'string') return name;
  } catch {
    // absence already recorded by the Before hook
  }
  return 'health.publish.handoff_failed';
}

// ---------- driving Build's hourly cycle ----------

/** Runs one hourly Build cycle through the production composition root, with
 * the publisher, the public page check and the hour's instant injected. */
export async function runOneHourlyCycle(scenario: Slice02Scenario): Promise<void> {
  scenario.handoffsBeforeThisHour = scenario.handoffs.length;
  scenario.logbookBeforeThisHour = scenario.logbook.length;
  scenario.buildOutcome = null;
  scenario.buildFailure = null;

  let module: Record<string, unknown>;
  try {
    module = (await import(
      pathToFileURL(resolve(REPOSITORY_ROOT, 'src/pipeline/lambda/build-handler.ts')).href
    )) as Record<string, unknown>;
  } catch (error) {
    scenario.absences.push(`src/pipeline/lambda/build-handler.ts failed to load (${message(error)})`);
    return;
  }
  const runBuild = module['runBuild'];
  if (typeof runBuild !== 'function') {
    scenario.absences.push('src/pipeline/lambda/build-handler.ts exports no runBuild function');
    return;
  }

  let handoffSettled = false;
  const invokePublisher = async (invocation: PublisherHandoff): Promise<unknown> => {
    scenario.handoffs.push(invocation);
    // A MACROTASK on purpose, not a microtask. Microtasks drain before the
    // outer `await runBuild(...)` resolves, so a fire-and-forget handover
    // (`void invokePublisher(...)`) would still look settled and the one
    // assertion carrying the SYNCHRONOUS claim -- the whole justification for
    // Build's longer limit -- would pass on code that does not wait.
    await new Promise((settle) => { setTimeout(settle, 0); });
    handoffSettled = true;
    if (scenario.publisherAnswer.kind === 'unreachable') throw new Error(UNREACHABLE_PUBLISHER_MESSAGE);
    return { statusCode: scenario.publisherAnswer.kind === 'published' ? 200 : 204 };
  };

  const probePublicManifest = async (): Promise<void> => {
    if (!scenario.freshPagesTurnUpPublicly) {
      throw new Error('health.publish.mismatch: the fresh pages never turned up publicly this hour.');
    }
  };

  const originalLog = console.log;
  console.log = (...args: readonly unknown[]): void => {
    const [first] = args;
    try {
      scenario.logbook.push(JSON.parse(String(first)) as LoggedLine);
    } catch {
      scenario.logbook.push({ event: '<not a structured line>', text: String(first) });
    }
  };
  try {
    scenario.buildOutcome = (await (runBuild as (overrides: unknown) => Promise<Record<string, unknown>>)({
      store: scenario.readings,
      spots: PACIFIC_SPOTS,
      clock: { now: () => new Date(HOUR_INSTANT) },
      probePublicManifest,
      invokePublisher,
    }));
  } catch (error) {
    scenario.buildFailure = error;
  } finally {
    console.log = originalLog;
  }
  scenario.handoffResolvedBeforeHourEnded = scenario.handoffs.length > scenario.handoffsBeforeThisHour
    ? handoffSettled
    : null;
}

// ---------- the observable universe (Mandate 8: port-exposed names only) ----------
//
// Both names are things the hour EXPOSES, never a field inside anything: what
// the publisher port was handed, and what the hour actually printed.

export const HOUR_UNIVERSE = ['publisher.handoffs', 'logbook.events'] as const;

export function handoffLabel(handoff: PublisherHandoff): string {
  return `${String(handoff.build_id)}|${String(handoff.bundle_key)}`;
}

export function captureHour(scenario: Slice02Scenario): StateSnapshot {
  return {
    'publisher.handoffs': scenario.handoffs.map(handoffLabel),
    'logbook.events': scenario.logbook.map((line) => String(line['event'])),
  };
}

export function assertHourDelta(
  scenario: Slice02Scenario,
  expected: Readonly<Record<string, DeltaPredicate>>,
  why: string,
): void {
  assert.ok(scenario.before !== null, 'test bug: no before snapshot; the hourly cycle never ran');
  try {
    assertStateDelta(scenario.before, captureHour(scenario), [...HOUR_UNIVERSE], expected);
  } catch (error) {
    assert.fail(
      `WHAT: this hour's observable surface is not the declared delta (${message(error)}). `
        + `WHY: ${why}. `
        + `HOW: hand the publisher exactly the build just finished and the bundle just written, print exactly the lines the hour earned, and nothing else.`
        + `${scenario.absences.length === 0 ? '' : ` Stated absence: ${scenario.absences.join(' | ')}.`}`,
    );
  }
}
