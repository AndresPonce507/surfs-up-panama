// Property laws for the offline helper's router table (public/sw.js,
// application-architecture.md section 12, roadmap step 01-02). This file
// reads and evaluates the REAL shipped script -- never a copy -- so the
// table under test cannot drift from the one that ships to a phone
// (step 01-02 DoD criterion 4). `self` is fabricated (addEventListener,
// caches, clients, skipWaiting, fetch); Request/Response/Headers come from
// Node's own WHATWG-compliant globals (Node 18+), never reimplemented.
//
// Everything is driven port-to-port: fire the captured `install`,
// `activate` and `fetch` listeners the way a browser would, and observe
// only what a phone could observe -- whether `event.respondWith` was
// called, the bytes of the response it resolved to, and the order in which
// the fabricated Cache Storage was touched. No internal function of
// public/sw.js is ever called directly, and CACHE_VERSION's literal value
// is never assumed: cache state is always primed by firing `install`, the
// same way the real helper would prime it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fc from 'fast-check';
import { describe, it, vi } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');
const SW_SOURCE = readFileSync(resolve(REPO_ROOT, 'public/sw.js'), 'utf8');

/**
 * Read, never assumed: the tested guard cannot drift from the real shipped
 * value (same no-copy philosophy as SW_SOURCE itself, top of file).
 */
const NETWORK_FIRST_TIMEOUT_MS = Number(/NETWORK_FIRST_TIMEOUT_MS\s*=\s*(\d+)/.exec(SW_SOURCE)?.[1]);
const ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';
const WRITE_PATH = '/api/report';
const OFFLINE_DOCUMENT = '/sin-senal';
const FAVICON = '/favicon.svg';
const SMALL_PRECACHE_PARTS = [FAVICON, OFFLINE_DOCUMENT] as const;

// ---------- a fabricated Cache Storage, spec-shaped enough to catch a real bug ----------

type Activity = { op: 'cache-match' | 'cache-put' | 'cache-delete' | 'cache-keys' | 'global-match' | 'fetch'; url: string };

function keyOf(request: RequestInfo): string {
  return new URL(typeof request === 'string' ? request : request.url, ORIGIN).toString();
}

function createFakeCache(activity: Activity[], store: Map<string, Response>) {
  return {
    match: async (request: RequestInfo) => {
      const url = keyOf(request);
      activity.push({ op: 'cache-match', url });
      return store.get(url);
    },
    // Real Cache.put throws a TypeError on a non-GET request; a router that
    // ever reaches this with a POST is a router that has stopped being
    // network-only for the write path.
    put: async (request: RequestInfo, response: Response) => {
      if (typeof request !== 'string' && request.method !== 'GET') {
        throw new TypeError('Cache.put: request method must be GET');
      }
      const url = keyOf(request);
      activity.push({ op: 'cache-put', url });
      store.set(url, response);
    },
    delete: async (request: RequestInfo) => {
      const url = keyOf(request);
      activity.push({ op: 'cache-delete', url });
      return store.delete(url);
    },
    keys: async () => {
      activity.push({ op: 'cache-keys', url: '' });
      return [...store.keys()].map((url) => new Request(url));
    },
  };
}

function createFakeCaches(activity: Activity[] = []) {
  const storesByName = new Map<string, Map<string, Response>>();
  const handle = (name: string) => {
    if (!storesByName.has(name)) storesByName.set(name, new Map());
    return createFakeCache(activity, storesByName.get(name)!);
  };
  return {
    open: async (name: string) => handle(name),
    keys: async () => [...storesByName.keys()],
    delete: async (name: string) => storesByName.delete(name),
    // The poison vector: searches every cache this origin owns, including
    // one the helper never wrote. A property below proves the router never
    // calls this.
    match: async (request: RequestInfo) => {
      const url = keyOf(request);
      activity.push({ op: 'global-match', url });
      for (const store of storesByName.values()) {
        const hit = store.get(url);
        if (hit) return hit;
      }
      return undefined;
    },
    activity,
  };
}

type FakeCaches = ReturnType<typeof createFakeCaches>;
/** `init` is optional and unused by most stubs; 01-05's timeout-race test reads `init?.signal` to observe whether the losing fetch was aborted. */
type FetchImpl = (request: Request, init?: { signal?: AbortSignal }) => Promise<Response>;

/**
 * Node's `new Response(...)` always reports `type: 'default'` -- that flag
 * only comes from the browser's own fetch/redirect handling, never from a
 * constructor. This stamps it onto a real Response so a fixture can stand in
 * for what an actual same-origin fetch ('basic'), a foreign one ('cors'), or
 * a not-inspectable one ('opaque') hands back, without reimplementing
 * Response itself.
 */
function withResponseType(response: Response, type: 'basic' | 'cors' | 'opaque'): Response {
  Object.defineProperty(response, 'type', { value: type, configurable: true });
  return response;
}

/** A fetch stub scripted by pathname: a body string answers 200 from our own origin, `'FAIL'` rejects (an unreachable origin). */
function scriptedFetch(responses: Record<string, string | 'FAIL'>): FetchImpl {
  return async (request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === FAVICON && responses[pathname] === undefined) {
      return withResponseType(new Response('favicon', { status: 200 }), 'basic');
    }
    const outcome = responses[pathname];
    if (outcome === undefined) throw new Error(`test bug: unscripted fetch to ${pathname}`);
    if (outcome === 'FAIL') throw new Error(`network unreachable: ${pathname}`);
    return withResponseType(new Response(outcome, { status: 200 }), 'basic');
  };
}

// ---------- evaluating the real shipped file against a fabricated self ----------

function loadHelper(options: { fetchImpl?: FetchImpl; caches?: FakeCaches } = {}) {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const caches = options.caches ?? createFakeCaches();
  const claimCalls: number[] = [];
  const skipWaitingCalls: number[] = [];
  const fetchImpl = options.fetchImpl ?? (async () => new Response('stub', { status: 200 }));
  const fakeSelf = {
    addEventListener(type: string, handler: (event: unknown) => void) {
      const existing = listeners.get(type) ?? [];
      existing.push(handler);
      listeners.set(type, existing);
    },
    caches,
    location: { origin: ORIGIN },
    clients: { claim: async () => { claimCalls.push(1); } },
    skipWaiting: async () => { skipWaitingCalls.push(1); },
    fetch: async (request: RequestInfo, init?: { signal?: AbortSignal }) => {
      const req = typeof request === 'string' ? new Request(new URL(request, ORIGIN).toString()) : (request as Request);
      caches.activity.push({ op: 'fetch', url: keyOf(req) });
      return fetchImpl(req, init);
    },
  };
  // eslint-disable-next-line no-new-func -- evaluating the real shipped script, deliberately, per DoD criterion 4.
  const evaluate = new Function('self', SW_SOURCE);
  evaluate(fakeSelf);
  return { self: fakeSelf, listeners, caches, claimCalls, skipWaitingCalls };
}

type Helper = ReturnType<typeof loadHelper>;

async function fireLifecycle(helper: Helper, type: 'install' | 'activate'): Promise<void> {
  const handlers = helper.listeners.get(type) ?? [];
  assert.equal(handlers.length, 1, `expected exactly one "${type}" listener`);
  const handler = handlers[0];
  assert.ok(handler, `expected a "${type}" listener function, found none`);
  const waits: Promise<unknown>[] = [];
  handler({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}

/**
 * Fires the "fetch" listener and returns the raw response promise, without
 * awaiting it. 01-05's timeout-race test needs to observe the promise mid-
 * flight (settled or not, at a precise fake-clock instant); every other
 * caller wants the settled response and uses `fireFetch` below.
 */
function fireFetchRaw(helper: Helper, request: Request): { responded: boolean; responsePromise: Promise<Response> | null } {
  const handlers = helper.listeners.get('fetch') ?? [];
  assert.equal(handlers.length, 1, 'expected exactly one "fetch" listener');
  const handler = handlers[0];
  assert.ok(handler, 'expected a "fetch" listener function, found none');
  let responded = false;
  let responsePromise: Promise<Response> | null = null;
  handler({
    request,
    respondWith(value: Promise<Response> | Response) {
      responded = true;
      responsePromise = Promise.resolve(value);
    },
    waitUntil() {},
  });
  return { responded, responsePromise };
}

async function fireFetch(helper: Helper, request: Request): Promise<{ responded: boolean; response: Response | null }> {
  const { responded, responsePromise } = fireFetchRaw(helper, request);
  return { responded, response: responded ? await responsePromise! : null };
}

/** Node cannot construct a navigation Request, but a browser gives the helper
 * this observable request mode for a document visit. Keep it explicit so the
 * fallback property cannot accidentally grant assets the offline document. */
function navigationRequest(pathname: string): Request {
  const request = new Request(`${ORIGIN}${pathname}`);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

// ---------- generators: one exemplar path per section 12 row ----------

const reportScreenPath = fc
  .tuple(fc.constantFrom('playa-venao', 'punta-chame', 'x'), fc.boolean())
  .map(([slug, trailingSlash]) => `/spots/${slug}/reportar${trailingSlash ? '/' : ''}`);

const hashedAssetPath = fc
  .tuple(fc.constantFrom('js', 'css', 'svg'), fc.stringMatching(/^[0-9a-f]{8}$/))
  .map(([extension, hash]) => `/_astro/chunk.${hash}.${extension}`);

const mediaPath = fc
  .tuple(fc.constantFrom('png', 'jpg', 'jpeg', 'webp', 'PNG', 'WEBP'), fc.constantFrom('map', 'photo-1', 'thumb'))
  .map(([extension, name]) => `/spots/playa-venao/${name}.${extension}`);

const readingHtmlPath = fc.constantFrom('/', '/manana', '/spots/playa-venao', '/spots/playa-venao/ayer', '/acerca', '/404', OFFLINE_DOCUMENT);

const exemplarRoute = fc.oneof(
  reportScreenPath.map((pathname) => ({ method: 'GET', pathname, family: 'cache-first' as const })),
  hashedAssetPath.map((pathname) => ({ method: 'GET', pathname, family: 'cache-first' as const })),
  mediaPath.map((pathname) => ({ method: 'GET', pathname, family: 'cache-first' as const })),
  readingHtmlPath.map((pathname) => ({ method: 'GET', pathname, family: 'network-first' as const })),
  fc.constant({ method: 'POST', pathname: WRITE_PATH, family: 'network-only' as const }),
);

/** Every route whose strategy ever writes a network answer into the cache -- everything except the write path, which is network-only by construction and covered on its own above. */
const cacheWritingRoute = exemplarRoute.filter((route) => route.family !== 'network-only');

// ---------- generator: every shape a planted network answer can take ----------

/**
 * The four shapes application-architecture.md section 9
 * (clause check:unfired-is-not-evidence) asks this guard to refuse, plus the
 * one it must still accept. A cross-origin hop -- whether the origin we
 * asked answered directly from elsewhere, or a redirect carried us there --
 * never comes back 'basic' per the Fetch API's own tainting rules, however
 * 200 OK its status looks; that is what lets 'foreign-origin' and
 * 'redirected-elsewhere' share one real shape below and still stand for two
 * different attack stories.
 */
type PlantedResponseShape = 'legitimate' | 'foreign-origin' | 'redirected-elsewhere' | 'opaque' | 'bad-status';

const plantedResponseShape = fc.constantFrom<PlantedResponseShape>(
  'legitimate',
  'foreign-origin',
  'redirected-elsewhere',
  'opaque',
  'bad-status',
);

function buildNetworkResponse(shape: PlantedResponseShape, body: string): Response {
  switch (shape) {
    case 'legitimate':
      return withResponseType(new Response(body, { status: 200 }), 'basic');
    case 'foreign-origin':
    case 'redirected-elsewhere':
      return withResponseType(new Response(body, { status: 200 }), 'cors');
    case 'opaque':
      return withResponseType(new Response(body, { status: 200 }), 'opaque');
    case 'bad-status':
      return withResponseType(new Response(body, { status: 500 }), 'basic');
  }
}

// ---------- tests ----------

describe('the offline helper (public/sw.js)', () => {
  it('registers install, activate and fetch as three independent listeners', () => {
    const helper = loadHelper();
    assert.equal(helper.listeners.get('install')?.length, 1);
    assert.equal(helper.listeners.get('activate')?.length, 1);
    assert.equal(helper.listeners.get('fetch')?.length, 1);
  });

  it('installs only the two explicit small shared parts, then serves each from the phone when the origin is unreachable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SMALL_PRECACHE_PARTS),
        async (part) => {
          const responses: Record<string, string | 'FAIL'> = {
            [FAVICON]: 'favicon',
            [OFFLINE_DOCUMENT]: 'offline-document',
          };
          const helper = loadHelper({ fetchImpl: scriptedFetch(responses) });

          await fireLifecycle(helper, 'install');

          const installFetches = helper.caches.activity
            .filter((entry) => entry.op === 'fetch')
            .map((entry) => new URL(entry.url).pathname)
            .sort();
          assert.deepEqual(
            installFetches,
            [...SMALL_PRECACHE_PARTS].sort(),
            'expected install to make exactly the explicit small precache list, never a whole-site crawl',
          );

          responses[part] = 'FAIL';
          helper.caches.activity.length = 0;
          const { response } = await fireFetch(helper, new Request(`${ORIGIN}${part}`));
          assert.equal(await response!.text(), part === FAVICON ? 'favicon' : 'offline-document');
          assert.ok(
            helper.caches.activity.some((entry) => entry.op === 'cache-match' && new URL(entry.url).pathname === part),
            `expected ${part} to be served from the phone after install`,
          );
          if (part === FAVICON) {
            assert.equal(
              helper.caches.activity.some((entry) => entry.op === 'fetch' && new URL(entry.url).pathname === part),
              false,
              'expected the immutable favicon to come from the phone without an unnecessary revalidation',
            );
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it('uses the precached sin señal document only for a failed report-screen navigation, never for an asset or report POST', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportScreenPath,
        hashedAssetPath,
        fc.string({ minLength: 4, maxLength: 20 }).map((body) => `offline-${body}`),
        async (reportPath, assetPath, offlineBody) => {
          const helper = loadHelper({
            fetchImpl: async (request) => {
              const pathname = new URL(request.url).pathname;
              if (pathname === FAVICON) {
                return withResponseType(new Response('favicon', { status: 200 }), 'basic');
              }
              if (pathname === OFFLINE_DOCUMENT) {
                return withResponseType(new Response(offlineBody, { status: 200 }), 'basic');
              }
              throw new Error('network unreachable');
            },
          });
          await fireLifecycle(helper, 'install');

          helper.caches.activity.length = 0;
          const reportNavigation = await fireFetch(helper, navigationRequest(reportPath));
          assert.equal(await reportNavigation.response!.text(), offlineBody);
          assert.ok(
            helper.caches.activity.some((entry) => entry.op === 'cache-match' && new URL(entry.url).pathname === OFFLINE_DOCUMENT),
            'expected a failed report-screen navigation to use the precached sin señal document',
          );

          helper.caches.activity.length = 0;
          await assert.rejects(
            fireFetch(helper, new Request(`${ORIGIN}${assetPath}`)),
            /network unreachable/,
            'expected a missing immutable asset to preserve its own network failure, never become a document',
          );
          assert.equal(
            helper.caches.activity.some((entry) => entry.op === 'cache-match' && new URL(entry.url).pathname === OFFLINE_DOCUMENT),
            false,
            'expected an asset request never to look up the navigation-only document fallback',
          );

          helper.caches.activity.length = 0;
          const reportPost = await fireFetch(helper, new Request(`${ORIGIN}${WRITE_PATH}`, { method: 'POST', body: 'report' }));
          assert.equal(reportPost.responded, false, 'expected report POST to remain network-only, never be given the offline document');
          assert.deepEqual(helper.caches.activity, [], 'expected report POST never to touch Cache Storage');
        },
      ),
      { numRuns: 30 },
    );
  });

  it('dispatches every route to the strategy family section 12 assigns it, row for row', async () => {
    await fc.assert(
      fc.asyncProperty(exemplarRoute, async ({ method, pathname, family }) => {
        const helper = loadHelper({ fetchImpl: async () => new Response('ok', { status: 200 }) });
        const request = new Request(`${ORIGIN}${pathname}`, { method });
        const { responded } = await fireFetch(helper, request);
        const activity = helper.caches.activity;

        if (family === 'network-only') {
          assert.equal(responded, false, `expected ${method} ${pathname} to pass straight through, untouched`);
          assert.deepEqual(activity, [], `expected zero cache/fetch activity for ${method} ${pathname}`);
          return;
        }
        assert.equal(responded, true, `expected ${method} ${pathname} to be answered by the helper`);
        const firstActivity = activity[0];
        assert.ok(firstActivity, `expected the helper to do something for ${method} ${pathname}`);
        // The row-for-row discriminator: a cache-first family always checks
        // the cache before ever touching the network; network-first always
        // tries the network before ever touching the cache.
        assert.equal(
          firstActivity.op,
          family === 'cache-first' ? 'cache-match' : 'fetch',
          `expected ${method} ${pathname} (a ${family} row) to check `
            + `${family === 'cache-first' ? 'the cache' : 'the network'} first; saw ${JSON.stringify(activity)}`,
        );
      }),
      { numRuns: 60 },
    );
  });

  it('never intercepts, caches, or reads from a cache for the write path -- even a planted, poisoned one', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string({ minLength: 3, maxLength: 20 }), async (body, plantedMark) => {
        const caches = createFakeCaches();
        // A planted answer sitting in a cache this helper never wrote to,
        // keyed by the write-path address -- the poisoned fixture the
        // acceptance suite plants on a real phone, reproduced here.
        const foreign = await caches.open('planted-by-someone-else');
        await foreign.put(WRITE_PATH, new Response(JSON.stringify({ mark: plantedMark }), { status: 200 }));
        caches.activity.length = 0; // that setup is not part of the request under test

        const helper = loadHelper({
          caches,
          fetchImpl: async () => {
            throw new Error('network unreachable');
          },
        });
        const request = new Request(`${ORIGIN}${WRITE_PATH}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        const { responded } = await fireFetch(helper, request);

        assert.equal(responded, false, 'a sent report must never be answered with a synthetic response');
        assert.deepEqual(caches.activity, [], 'a sent report must never touch any cache, planted or its own');
      }),
      { numRuns: 40 },
    );
  });

  it('never writes a foreign, redirected-elsewhere, opaque, or badly-statused answer into the cache -- only its own successful, same-origin, inspectable one -- and a cache-first route with nothing better on the phone still hands the page whatever the network gave back', async () => {
    // 01-04 note: before this step, an untrustworthy reply was never CACHED
    // (01-03's invariant, unchanged below) but was still SERVED verbatim on
    // every family, network-first included -- the captive-portal gap this
    // step closes. A network-first route now prefers the forecast already
    // on the phone (or, with nothing yet on the phone, the precached
    // offline document) over an untrustworthy reply; a cache-first route,
    // which has no such fallback to prefer on a cache miss, is unchanged
    // and still serves whatever the network gave back. The write-refusal
    // half of this property is asserted across every family, including
    // network-first, so 01-03's invariant is proven to still hold under
    // 01-04's code.
    await fc.assert(
      fc.asyncProperty(
        // Excludes the offline document's own path: this test's fetchImpl
        // reserves that path to answer the install-time precache, so the
        // tested route and the fallback target must stay distinct.
        cacheWritingRoute.filter((route) => route.pathname !== OFFLINE_DOCUMENT),
        plantedResponseShape,
        fc.string({ minLength: 4, maxLength: 10 }),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `offline-${s}`),
        async ({ method, pathname, family }, shape, body, offlineStamp) => {
          const networkResponse = buildNetworkResponse(shape, body);
          const helper = loadHelper({
            fetchImpl: async (request) =>
              new URL(request.url).pathname === FAVICON
                ? withResponseType(new Response('favicon', { status: 200 }), 'basic')
                : new URL(request.url).pathname === OFFLINE_DOCUMENT
                ? withResponseType(new Response(offlineStamp, { status: 200 }), 'basic')
                : networkResponse,
          });
          // Precaches the offline document exactly the way the real helper
          // does, through install -- what a network-first row falls back to
          // with nothing better yet on the phone.
          await fireLifecycle(helper, 'install');
          helper.caches.activity.length = 0; // that setup is not part of the request under test

          const request = new Request(`${ORIGIN}${pathname}`, { method });
          const { responded, response } = await fireFetch(helper, request);

          assert.equal(responded, true, `expected ${method} ${pathname} to still be answered by the helper for a ${shape} network reply`);

          const servedBody = await response!.text();
          if (shape === 'legitimate') {
            assert.equal(servedBody, body, `expected ${method} ${pathname} to receive the network's own answer for a legitimate reply`);
          } else if (family === 'cache-first') {
            assert.equal(
              servedBody,
              body,
              `expected a cache-first miss with nothing better on the phone to still hand ${method} ${pathname} whatever the network answered`,
            );
          } else {
            assert.equal(
              servedBody,
              offlineStamp,
              `expected a network-first route to fall back to the precached offline document for a ${shape} reply, never hand back ${method} ${pathname}'s untrustworthy body`,
            );
          }

          const cachePutCalls = helper.caches.activity.filter((entry) => entry.op === 'cache-put');
          if (shape === 'legitimate') {
            assert.ok(cachePutCalls.length > 0, `expected a legitimate same-origin answer for ${method} ${pathname} to be cached`);
          } else {
            assert.deepEqual(
              cachePutCalls,
              [],
              `expected a ${shape} answer for ${method} ${pathname} to never be written to the cache; saw ${JSON.stringify(cachePutCalls)}`,
            );
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('never returns a fabricated body for a reading route -- the network copy, the last cached copy, or the precached offline page, never anything else', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `offline-${s}`),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `first-${s}`),
        fc.boolean(),
        fc.boolean(),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `second-${s}`),
        async (offlineStamp, firstNetworkStamp, hasPriorCachedCopy, secondNetworkAvailable, secondNetworkStamp) => {
          const scripted: Record<string, string | 'FAIL'> = { [OFFLINE_DOCUMENT]: offlineStamp };
          const helper = loadHelper({ fetchImpl: scriptedFetch(scripted) });
          // Primes the offline document into the current version's own
          // cache exactly the way the real helper does -- through install,
          // never by seeding a cache under an assumed name.
          await fireLifecycle(helper, 'install');

          if (hasPriorCachedCopy) {
            scripted['/'] = firstNetworkStamp;
            const first = await fireFetch(helper, new Request(`${ORIGIN}/`));
            assert.equal(await first.response!.text(), firstNetworkStamp, 'test bug: first visit did not serve the network copy');
          }

          scripted['/'] = secondNetworkAvailable ? secondNetworkStamp : 'FAIL';
          const second = await fireFetch(helper, new Request(`${ORIGIN}/`));
          assert.ok(second.responded, 'expected the reading route to be answered by the helper');
          const body = await second.response!.text();

          if (secondNetworkAvailable) {
            assert.equal(body, secondNetworkStamp);
          } else if (hasPriorCachedCopy) {
            assert.equal(body, firstNetworkStamp);
          } else {
            assert.equal(body, offlineStamp);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  // ---------- 01-04: the origin going unreachable, every shape that covers ----------

  /**
   * Step 01-04's payoff property. "Unreachable" is not one example -- a
   * stalled/DNS-dead connection that never resolves (network.fetch rejects),
   * or a same-origin 5xx, or a captive portal / redirect-elsewhere handing
   * back someone else's page dressed as 200 OK (never 'basic' per the Fetch
   * API's own tainting rules, however good its status looks). Every one of
   * those must be treated exactly like a dead network: the surfer keeps
   * reading the last forecast that loaded, stamp intact, never the
   * intruder's body.
   */
  type UnreachableOriginShape = { kind: 'connection-never-resolves' } | { kind: 'bad-reply'; shape: Exclude<PlantedResponseShape, 'legitimate'> };

  const unreachableOriginShape = fc.oneof(
    fc.constant<UnreachableOriginShape>({ kind: 'connection-never-resolves' }),
    fc
      .constantFrom<Exclude<PlantedResponseShape, 'legitimate'>>('foreign-origin', 'redirected-elsewhere', 'opaque', 'bad-status')
      .map((shape) => ({ kind: 'bad-reply', shape }) as const),
  );

  it('serves the last cached forecast, stamp intact, whatever shape the origin going unreachable takes -- never the failing reply itself', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `offline-${s}`),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `first-${s}`),
        fc.boolean(),
        unreachableOriginShape,
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `intruder-${s}`),
        async (offlineStamp, firstNetworkStamp, hasPriorCachedCopy, outcome, intruderBody) => {
          let signalIsUp = true;
          const fetchImpl: FetchImpl = async (request) => {
            const pathname = new URL(request.url).pathname;
            if (pathname === FAVICON) return withResponseType(new Response('favicon', { status: 200 }), 'basic');
            if (pathname === OFFLINE_DOCUMENT) return withResponseType(new Response(offlineStamp, { status: 200 }), 'basic');
            if (signalIsUp) return withResponseType(new Response(firstNetworkStamp, { status: 200 }), 'basic');
            if (outcome.kind === 'connection-never-resolves') throw new Error('network unreachable');
            return buildNetworkResponse(outcome.shape, intruderBody);
          };
          const helper = loadHelper({ fetchImpl });
          // Primes the offline document into the current version's own
          // cache exactly the way the real helper does -- through install.
          await fireLifecycle(helper, 'install');

          if (hasPriorCachedCopy) {
            const first = await fireFetch(helper, new Request(`${ORIGIN}/`));
            assert.equal(await first.response!.text(), firstNetworkStamp, 'test bug: first visit did not serve the network copy');
          }

          signalIsUp = false;
          helper.caches.activity.length = 0; // everything from here on is the request under test
          const second = await fireFetch(helper, new Request(`${ORIGIN}/`));
          assert.ok(second.responded, 'expected the reading route to still be answered once the origin went unreachable');
          const body = await second.response!.text();

          assert.notEqual(
            body,
            intruderBody,
            `expected an unreachable origin (${JSON.stringify(outcome)}) to never be served as the forecast`,
          );
          if (hasPriorCachedCopy) {
            assert.equal(
              body,
              firstNetworkStamp,
              `expected the forecast already on the phone, stamp intact, for an unreachable origin shaped ${JSON.stringify(outcome)}`,
            );
          } else {
            assert.equal(
              body,
              offlineStamp,
              `expected the precached offline document for an unreachable origin shaped ${JSON.stringify(outcome)} with nothing yet on the phone`,
            );
          }

          const poisonedCachePuts = helper.caches.activity.filter(
            (entry) => entry.op === 'cache-put' && entry.url === `${ORIGIN}/`,
          );
          if (outcome.kind === 'bad-reply') {
            assert.equal(
              poisonedCachePuts.length,
              0,
              `expected an unreachable origin shaped ${JSON.stringify(outcome)} to never overwrite the cached forecast`,
            );
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  // ---------- 01-05: the network-first timeout races the network, an injected clock proves it ----------

  /**
   * Step 01-05's payoff property. The network-first row is a RACE, not a
   * wait: a network that never answers must never keep the surfer waiting
   * past NETWORK_FIRST_TIMEOUT_MS, and a network that answers before that
   * must never be held up by the guard. Both halves are proven on the same
   * injected clock -- no real sleep, per the step's own DoD criterion 4 --
   * by observing the response promise's settled state at precise instants,
   * never by awaiting it blind.
   *
   * The 'hangs' arm also proves the losing fetch is actually abandoned: the
   * step's own implementation_notes forbid leaving it "running unbounded",
   * so the fetch stub captures the AbortSignal networkFirst hands it and the
   * property asserts abort() fires exactly when the timer wins, never
   * before and never for a fetch that answered in time.
   */
  it('gives up on a network that never answers exactly at the three-second guard, and never delays a network that answers first', async () => {
    assert.ok(
      Number.isFinite(NETWORK_FIRST_TIMEOUT_MS) && NETWORK_FIRST_TIMEOUT_MS > 0,
      'test bug: could not read NETWORK_FIRST_TIMEOUT_MS out of the real shipped public/sw.js',
    );

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `offline-${s}`),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `first-${s}`),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `fresh-${s}`),
        fc.boolean(),
        fc.boolean(),
        async (offlineStamp, firstNetworkStamp, freshNetworkStamp, hasPriorCachedCopy, networkAnswersInTime) => {
          vi.useFakeTimers();
          try {
            let abortedSignal: AbortSignal | undefined;
            // Flips true once the priming read (if any) has been served, so the
            // fetch stub can tell "prime the cache" apart from "the request
            // under test" without depending on request order or timing.
            let primingComplete = !hasPriorCachedCopy;
            const fetchImpl: FetchImpl = async (request, init) => {
              const pathname = new URL(request.url).pathname;
              if (pathname === FAVICON) {
                return withResponseType(new Response('favicon', { status: 200 }), 'basic');
              }
              if (pathname === OFFLINE_DOCUMENT) {
                return withResponseType(new Response(offlineStamp, { status: 200 }), 'basic');
              }
              if (!primingComplete) {
                // the priming read: always answers, so a forecast is on the
                // phone before the request under test ever fires.
                return withResponseType(new Response(firstNetworkStamp, { status: 200 }), 'basic');
              }
              if (networkAnswersInTime) {
                return withResponseType(new Response(freshNetworkStamp, { status: 200 }), 'basic');
              }
              // the stall: accepted, never answered -- a real hang, never resolving and never rejecting on its own
              abortedSignal = init?.signal;
              return new Promise<Response>(() => {});
            };
            const helper = loadHelper({ fetchImpl });
            await fireLifecycle(helper, 'install');

            if (hasPriorCachedCopy) {
              const primed = await fireFetch(helper, new Request(`${ORIGIN}/`));
              assert.equal(await primed.response!.text(), firstNetworkStamp, 'test bug: prime read did not serve the network copy');
              primingComplete = true;
            }
            helper.caches.activity.length = 0; // everything from here on is the request under test

            const { responded, responsePromise } = fireFetchRaw(helper, new Request(`${ORIGIN}/`));
            assert.ok(responded, 'expected the reading route to be answered by the helper');
            let settled = false;
            let settledResponse: Response | null = null;
            responsePromise!.then((response) => {
              settled = true;
              settledResponse = response;
            });
            // flushes the microtasks between caches.open() resolving and the
            // timer actually being scheduled, so the boundary checks below
            // measure against a timer that genuinely exists.
            await vi.advanceTimersByTimeAsync(0);

            if (networkAnswersInTime) {
              assert.equal(settled, true, 'expected a network reply that answers immediately to never be delayed by the timeout guard');
              assert.equal(await settledResponse!.text(), freshNetworkStamp, 'expected the network\'s own answer when it beats the guard');
              assert.equal(abortedSignal, undefined, 'expected a network that answered first to never be aborted');
              return;
            }

            assert.equal(settled, false, 'expected the response not to resolve before the three-second guard elapses');
            await vi.advanceTimersByTimeAsync(NETWORK_FIRST_TIMEOUT_MS - 1);
            assert.equal(settled, false, 'expected the guard not to fire one millisecond early');
            assert.notEqual(abortedSignal, undefined, 'test bug: fetch stub never captured a signal to observe');
            assert.equal(abortedSignal!.aborted, false, 'expected the abandoned fetch not to be aborted before the guard elapses');

            await vi.advanceTimersByTimeAsync(1);
            assert.equal(settled, true, 'expected the guard to fire exactly at the three-second mark and serve the cached copy');
            assert.equal(
              abortedSignal!.aborted,
              true,
              'expected the abandoned fetch to be aborted the instant the guard wins the race, per this step\'s own '
                + 'implementation_notes: never leave it running unbounded',
            );
            const body = await settledResponse!.text();
            assert.equal(
              body,
              hasPriorCachedCopy ? firstNetworkStamp : offlineStamp,
              `expected the guard to fall back to ${hasPriorCachedCopy ? 'the forecast already on the phone' : 'the precached offline document'}`,
            );
          } finally {
            vi.useRealTimers();
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('activate deletes every cache from an older version, keeps the current one, and claims every open tab', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.string({ minLength: 3, maxLength: 12 }).filter((s) => s.trim().length > 0), { minLength: 0, maxLength: 4 }),
        fc.string({ minLength: 4, maxLength: 10 }).map((s) => `offline-${s}`),
        async (staleNames, offlineStamp) => {
          const scripted: Record<string, string | 'FAIL'> = { [OFFLINE_DOCUMENT]: offlineStamp };
          const helper = loadHelper({ fetchImpl: scriptedFetch(scripted) });
          await fireLifecycle(helper, 'install'); // the current version's own cache now exists and is populated
          for (const name of staleNames) await helper.self.caches.open(name); // leftover caches from older deploys

          await fireLifecycle(helper, 'activate');

          const remaining = await helper.self.caches.keys();
          for (const name of staleNames) {
            assert.ok(!remaining.includes(name), `expected the stale cache "${name}" to be deleted on activate`);
          }
          assert.equal(helper.claimCalls.length, 1, 'expected activate to claim every open tab');

          scripted['/'] = 'FAIL';
          const { response } = await fireFetch(helper, new Request(`${ORIGIN}/`));
          assert.equal(await response!.text(), offlineStamp, 'expected activate to leave the current version cache intact');
        },
      ),
      { numRuns: 25 },
    );
  });
});
