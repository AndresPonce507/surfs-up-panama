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
import { describe, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../..');
const SW_SOURCE = readFileSync(resolve(REPO_ROOT, 'public/sw.js'), 'utf8');
const ORIGIN = 'https://d1j9u9fxnap4es.cloudfront.net';
const WRITE_PATH = '/api/report';
const OFFLINE_DOCUMENT = '/sin-senal';

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
type FetchImpl = (request: Request) => Promise<Response>;

/** A fetch stub scripted by pathname: a body string answers 200, `'FAIL'` rejects (an unreachable origin). */
function scriptedFetch(responses: Record<string, string | 'FAIL'>): FetchImpl {
  return async (request) => {
    const pathname = new URL(request.url).pathname;
    const outcome = responses[pathname];
    if (outcome === undefined) throw new Error(`test bug: unscripted fetch to ${pathname}`);
    if (outcome === 'FAIL') throw new Error(`network unreachable: ${pathname}`);
    return new Response(outcome, { status: 200 });
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
    fetch: async (request: RequestInfo) => {
      const req = typeof request === 'string' ? new Request(new URL(request, ORIGIN).toString()) : (request as Request);
      caches.activity.push({ op: 'fetch', url: keyOf(req) });
      return fetchImpl(req);
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
  const waits: Promise<unknown>[] = [];
  handlers[0]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}

async function fireFetch(helper: Helper, request: Request): Promise<{ responded: boolean; response: Response | null }> {
  const handlers = helper.listeners.get('fetch') ?? [];
  assert.equal(handlers.length, 1, 'expected exactly one "fetch" listener');
  let responded = false;
  let responsePromise: Promise<Response> | null = null;
  handlers[0]({
    request,
    respondWith(value: Promise<Response> | Response) {
      responded = true;
      responsePromise = Promise.resolve(value);
    },
    waitUntil() {},
  });
  return { responded, response: responded ? await responsePromise! : null };
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

// ---------- tests ----------

describe('the offline helper (public/sw.js)', () => {
  it('registers install, activate and fetch as three independent listeners', () => {
    const helper = loadHelper();
    assert.equal(helper.listeners.get('install')?.length, 1);
    assert.equal(helper.listeners.get('activate')?.length, 1);
    assert.equal(helper.listeners.get('fetch')?.length, 1);
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
        assert.ok(activity.length > 0, `expected the helper to do something for ${method} ${pathname}`);
        // The row-for-row discriminator: a cache-first family always checks
        // the cache before ever touching the network; network-first always
        // tries the network before ever touching the cache.
        assert.equal(
          activity[0].op,
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
