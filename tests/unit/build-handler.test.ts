// The Lambda composition root for the hourly Build run, proven the same way
// fetch-handler.test.ts proves Fetch: real pipeline code (runBuildOnce)
// wired to an in-memory BuildStore double, so the wiring and the honesty
// gate prove themselves offline. published-bundle-contract.test.ts and
// production-path-end-to-end.test.ts already prove runBuildOnce's own
// scoring/publish behaviour against real committed data; this suite is
// scoped to what this file adds: S3-shaped composition and build.success
// honesty, nothing about scoring.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runBuild } from '../../src/pipeline/lambda/build-handler';
import * as buildHandlerModule from '../../src/pipeline/lambda/build-handler';
import { BUILD_REFUSED_EVENT, BUILD_SUCCESS_EVENT, PUBLISH_HANDOFF_FAILED_EVENT } from '../../src/pipeline/lambda/log-events';
import type { BuildStore } from '../../src/pipeline/ports';
import type { SpotSeed } from '../../src/scoring/engine';

const MEMBER_SOURCES = ['ncep_gfswave016', 'ncep_gfswave025', 'meteofrance_wave', 'dwd_gwam'] as const;
const TODAY = '2026-08-10';
const TOMORROW = '2026-08-11';
const AT = '2026-08-10T11:22:00Z';

function seed(spot_id: string, name: string): SpotSeed {
  return {
    spot_id,
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

function predictionLine(spot_id: string, date: string, height_m: number, source: string): string {
  return JSON.stringify({
    spot_id,
    source,
    run_ts: `${date}T06:00Z`,
    valid_ts: `${date}T18:00Z`,
    lead_h: 12,
    swell_h_m: height_m,
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

function bodyForDate(spot_id: string, height_m: number, date: string): string {
  return MEMBER_SOURCES.map((source) => predictionLine(spot_id, date, height_m, source)).join('\n');
}

class InMemoryBuildStore implements BuildStore {
  readonly predictions = new Map<string, string>();
  readonly putBundleKeys: string[] = [];
  readonly putManifestKeys: string[] = [];

  /** Heights differ per day so tomorrow's ranking is genuinely its own list,
   * never a byte-clone of today's (build.ts's clone guard). */
  seed(spot_id: string): void {
    const heightByDate: Readonly<Record<string, number>> = { [TODAY]: 1.2, [TOMORROW]: 0.6 };
    for (const date of [TODAY, TOMORROW]) {
      this.predictions.set(`predictions/v1/dt=${date}/${spot_id}.jsonl`, bodyForDate(spot_id, heightByDate[date]!, date));
    }
  }

  async getPrediction(key: string): Promise<string | null> {
    return this.predictions.get(key) ?? null;
  }

  async listPredictions(prefix: string): Promise<string[]> {
    return [...this.predictions.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async getCorrection(): Promise<string | null> {
    return null;
  }

  async putCallIfAbsent(): Promise<'created' | 'already-exists'> {
    return 'created';
  }

  async putBundle(key: string): Promise<void> {
    this.putBundleKeys.push(key);
  }

  async putManifest(key: string): Promise<void> {
    this.putManifestKeys.push(key);
  }
}

describe('runBuild (Lambda Build composition root)', () => {
  it('publishes the bundle and manifest and logs build.success with the real build id when the build has usable data', async () => {
    const store = new InMemoryBuildStore();
    store.seed('playa-venao');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
      probePublicManifest: async () => {},
    });

    expect(outcome.published).toBe(true);
    expect(store.putBundleKeys).toEqual([
      'pub/v1/regions/pa-pacific/bundle.json',
      'pub/v1/meta/spot-index.json',
    ]);
    expect(store.putManifestKeys).toEqual(['pub/v1/manifest.json']);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string; build_id?: string });
    expect(loggedLines).toEqual([{ event: BUILD_SUCCESS_EVENT, build_id: outcome.published ? outcome.build_id : undefined }]);

    logSpy.mockRestore();
  });

  it('never logs build.success, and logs the refusal reason instead, when no spot has any usable prediction', async () => {
    const store = new InMemoryBuildStore(); // seeded with nothing
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
    });

    expect(outcome.published).toBe(false);
    expect(store.putBundleKeys).toEqual([]);
    expect(store.putManifestKeys).toEqual([]);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string });
    expect(loggedLines.some((line) => line.event === BUILD_SUCCESS_EVENT)).toBe(false);
    expect(loggedLines.some((line) => line.event === BUILD_REFUSED_EVENT)).toBe(true);

    logSpy.mockRestore();
  });

  it('hands the publisher the build it just finished, with the composed bundle key, only after build.success is printed', async () => {
    const store = new InMemoryBuildStore();
    store.seed('playa-venao');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const invokedAfter: string[] = [];
    const invokePublisher = vi.fn(async () => {
      invokedAfter.push(...logSpy.mock.calls.map(([line]) => (JSON.parse(String(line)) as { event: string }).event));
      return { statusCode: 200 };
    });

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
      probePublicManifest: async () => {},
      invokePublisher,
    });

    expect(outcome.published).toBe(true);
    expect(invokePublisher).toHaveBeenCalledTimes(1);
    expect(invokePublisher).toHaveBeenCalledWith({
      build_id: outcome.published ? outcome.build_id : undefined,
      bundle_key: 'pub/v1/regions/pa-pacific/bundle.json',
    });
    expect(invokedAfter).toEqual([BUILD_SUCCESS_EVENT]);

    logSpy.mockRestore();
  });

  it('catches a rejecting publisher, writes down the failed handover with the rejection\'s own reason, and still answers that it published', async () => {
    const store = new InMemoryBuildStore();
    store.seed('playa-venao');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const invokePublisher = vi.fn(async () => {
      throw new Error('acceptance harness: the publisher could not be reached this hour');
    });

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
      probePublicManifest: async () => {},
      invokePublisher,
    });

    expect(outcome.published).toBe(true);
    expect(invokePublisher).toHaveBeenCalledTimes(1);

    const loggedLines = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string; build_id?: string; reason?: string });
    expect(loggedLines).toEqual([
      { event: BUILD_SUCCESS_EVENT, build_id: outcome.published ? outcome.build_id : undefined },
      {
        event: PUBLISH_HANDOFF_FAILED_EVENT,
        build_id: outcome.published ? outcome.build_id : undefined,
        reason: 'acceptance harness: the publisher could not be reached this hour',
      },
    ]);

    logSpy.mockRestore();
  });

  it('never calls the publisher when the build refused', async () => {
    const store = new InMemoryBuildStore(); // seeded with nothing
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const invokePublisher = vi.fn(async () => ({ statusCode: 200 }));

    const outcome = await runBuild({
      store,
      spots: [seed('playa-venao', 'Playa Venao')],
      clock: { now: () => new Date(AT) },
      invokePublisher,
    });

    expect(outcome.published).toBe(false);
    expect(invokePublisher).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

// The platform review's HIGH-1: every test above INJECTS invokePublisher, but
// the deployed `handler` called runBuild() bare, so overrides.invokePublisher
// was always undefined and handOverToPublisher silently no-oped -- the
// Publisher had no caller at all. These tests pin the production composition
// the way defaultStore is pinned by the S3-shaped tests above: a real
// invoker, addressed by PUBLISH_FUNCTION_NAME, synchronous RequestResponse,
// and -- load-bearing -- SDK retries capped at 1 attempt. The CFN template's
// MaximumRetryAttempts: 0 governs ASYNC invokes only and is inert on this
// synchronous path; SDK v3's default of 3 attempts x 300 s behind reserved
// concurrency 1 would serialize to ~900 s, blow Build's 420 s budget, and
// triple-bill a wedged render.
type PublisherInvocation = Readonly<{ build_id: string; bundle_key: string }>;
type FakeLambdaClient = Readonly<{ send: (command: unknown) => Promise<unknown> }>;
type InvokerFactory = (client?: FakeLambdaClient) => (invocation: PublisherInvocation) => Promise<unknown>;
type SentCommand = Readonly<{ input: Readonly<Record<string, unknown>> }>;

const PUBLISHER_ENV = 'PUBLISH_FUNCTION_NAME';
const PUBLISHER_NAME_UNDER_TEST = 'surfs-up-panama-publish-under-test';
const INVOCATION: PublisherInvocation = {
  build_id: 'b_2026-08-10T11Z',
  bundle_key: 'pub/v1/regions/pa-pacific/bundle.json',
};

function payloadAsJson(payload: unknown): unknown {
  if (typeof payload === 'string') return JSON.parse(payload);
  return JSON.parse(new TextDecoder().decode(payload as Uint8Array));
}

describe('the production composition really calls the Publisher (review blocker HIGH-1)', () => {
  const moduleExports = buildHandlerModule as Readonly<Record<string, unknown>>;
  let previousName: string | undefined;

  beforeEach(() => {
    previousName = process.env[PUBLISHER_ENV];
    process.env[PUBLISHER_ENV] = PUBLISHER_NAME_UNDER_TEST;
  });

  afterEach(() => {
    if (previousName === undefined) delete process.env[PUBLISHER_ENV];
    else process.env[PUBLISHER_ENV] = previousName;
  });

  it("wires the handler's production overrides with a live publisher invoker", () => {
    const compose = moduleExports['productionBuildOverrides'];
    expect(
      compose,
      'stated absence: build-handler exports no productionBuildOverrides; the deployed handler calls runBuild() bare, so overrides.invokePublisher is always undefined and handOverToPublisher silently no-ops',
    ).toBeTypeOf('function');
    const overrides = (compose as () => buildHandlerModule.BuildOverrides)();
    expect(
      overrides.invokePublisher,
      'the production overrides must hand runBuild a live invoker, or the Publisher is never invoked',
    ).toBeTypeOf('function');
  });

  it('sends exactly one synchronous RequestResponse invoke addressed by PUBLISH_FUNCTION_NAME, with the invocation as its payload', async () => {
    const factory = moduleExports['defaultInvokePublisher'];
    expect(
      factory,
      'stated absence: build-handler exports no defaultInvokePublisher; no LambdaClient/InvokeCommand exists anywhere in src/',
    ).toBeTypeOf('function');
    const sent: SentCommand[] = [];
    const fakeClient: FakeLambdaClient = {
      send: async (command) => {
        sent.push(command as SentCommand);
        return { StatusCode: 200 };
      },
    };

    await (factory as InvokerFactory)(fakeClient)(INVOCATION);

    expect(sent).toHaveLength(1);
    const input = sent[0]!.input;
    expect(input['FunctionName']).toBe(PUBLISHER_NAME_UNDER_TEST);
    expect(input['InvocationType']).toBe('RequestResponse');
    expect(payloadAsJson(input['Payload'])).toEqual(INVOCATION);
  });

  it('composes its SDK client with retries capped at one attempt, never the default three', async () => {
    const factory = moduleExports['publisherInvokeClient'];
    expect(
      factory,
      'stated absence: build-handler exports no publisherInvokeClient; an uncapped LambdaClient defaults to 3 attempts x 300 s behind reserved concurrency 1, ~900 s serialized against Build\'s 420 s budget',
    ).toBeTypeOf('function');
    const client = (factory as () => { config: { maxAttempts: () => number | Promise<number> }; destroy: () => void })();
    expect(await client.config.maxAttempts()).toBe(1);
    client.destroy();

    // The control this cap exists against: the SDK's own default really is 3.
    const { LambdaClient } = await import('@aws-sdk/client-lambda');
    const uncapped = new LambdaClient({});
    expect(await uncapped.config.maxAttempts(), 'the SDK default the explicit cap overrides').toBe(3);
    uncapped.destroy();
  });

  it('surfaces a FunctionError answer as a rejection, so Build writes down the failed handover', async () => {
    const factory = moduleExports['defaultInvokePublisher'];
    expect(
      factory,
      'stated absence: build-handler exports no defaultInvokePublisher',
    ).toBeTypeOf('function');
    const fakeClient: FakeLambdaClient = {
      send: async () => ({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: new TextEncoder().encode('{"errorMessage":"render exploded"}'),
      }),
    };

    await expect((factory as InvokerFactory)(fakeClient)(INVOCATION)).rejects.toThrow(/render exploded/);
  });

  it('refuses loudly at composition when PUBLISH_FUNCTION_NAME is missing, in the house WHAT/WHY/HOW shape', () => {
    const factory = moduleExports['defaultInvokePublisher'];
    expect(
      factory,
      'stated absence: build-handler exports no defaultInvokePublisher',
    ).toBeTypeOf('function');
    delete process.env[PUBLISHER_ENV];

    expect(() => (factory as InvokerFactory)()).toThrow(/PUBLISH_FUNCTION_NAME/);
  });
});
