// The offline helper (application-architecture.md section 12). One
// self-contained classic script: no import/export, no build step (public/
// is copied verbatim to the origin root -- the only zero-config path to the
// default '/' scope on a static S3 origin). Widest iOS compatibility too.
//
// SUPERSEDING A BAD VERSION: bump CACHE_VERSION. `install` precaches into
// the new named cache and calls skipWaiting() (a new worker never waits on
// an open tab); `activate` deletes every cache whose name is not the
// current CACHE_VERSION and calls clients.claim() (the new worker takes
// every open tab immediately). A bad version is recovered by shipping a new
// CACHE_VERSION, never by asking a surfer to clear their phone.
//
// ROUTER TABLE: application-architecture.md section 12, row for row, first
// match wins. `matches` reads only method + same-origin pathname -- a pure
// decision the network or a cache cannot change, which is what lets
// tests/unit/sw-router-table.test.ts evaluate this exact file and drive its
// `fetch` listener directly. No copy; the tested table cannot drift.
//
// THE WRITE-PATH ROW COVERS SECTION 12 ROWS 5 AND 6 AT ONCE: per
// 07-write-path.md section 4.3 there is no GET reveal URL -- the reveal
// (row 6) IS the POST response (row 5). Fixed cross-feature contract
// (section 12 closure L4): ships before any write path exists, never
// edited by another lane. The fetch listener never calls respondWith for
// it, so the browser's own unintercepted fetch runs: no synthetic response
// can ever stand in for a report that never left the phone, and cache.put
// is only reachable from the GET branches below -- no shared code path can
// cache it by accident.
//
// Every cache read goes through self.caches.open(CACHE_VERSION) first,
// never the bare self.caches.match(...), which searches every cache this
// origin owns -- including a planted or stale one this helper never wrote.
//
// NEW ROW SEAT (01-11, push): a later feature appends
// self.addEventListener('push', ...) / ('notificationclick', ...) at the
// end of this file. Nothing above needs to change.

const CACHE_VERSION = 'psb-offline-v1';
const OFFLINE_DOCUMENT = '/sin-senal';
const WRITE_PATH = '/api/report';
const NETWORK_FIRST_TIMEOUT_MS = 3000;
const MEDIA_CACHE_LIMIT_BYTES = 5 * 1024 * 1024;

const NETWORK_ONLY = 'network-only';
const NETWORK_FIRST = 'network-first';
const CACHE_FIRST = 'cache-first';
const CACHE_FIRST_IMMUTABLE = 'cache-first-immutable';
const CACHE_FIRST_LRU = 'cache-first-lru';

/** application-architecture.md section 12, row order preserved. */
const ROUTER_TABLE = [
  {
    row: 'write-path (section 12 rows 5 and 6, see note above)',
    strategy: NETWORK_ONLY,
    matches: (method, pathname) => method === 'POST' && pathname === WRITE_PATH,
  },
  {
    row: 'report screen 1 HTML',
    strategy: CACHE_FIRST,
    matches: (method, pathname) => method === 'GET' && /\/reportar\/?$/.test(pathname),
  },
  {
    row: 'hashed CSS/JS/icons',
    strategy: CACHE_FIRST_IMMUTABLE,
    matches: (method, pathname) => method === 'GET' && pathname.startsWith('/_astro/'),
  },
  {
    row: 'static map + photo thumbs',
    strategy: CACHE_FIRST_LRU,
    matches: (method, pathname) => method === 'GET' && /\.(?:png|jpe?g|webp)$/i.test(pathname),
  },
  {
    row: 'reading HTML',
    strategy: NETWORK_FIRST,
    matches: (method) => method === 'GET',
  },
];

/** Pure: request in, matched row out. `null` (cross-origin, or no row claims it) means untouched. */
function classifyRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  const method = request.method;
  const pathname = url.pathname;
  for (const entry of ROUTER_TABLE) {
    if (entry.matches(method, pathname)) return entry;
  }
  return null;
}

/** Our own, same-origin, inspectable response -- never a foreign origin's
 * answer, a redirect landing elsewhere, or an opaque one. A cross-origin
 * hop, however 200 OK it looks, never comes back 'basic'. */
function isTrustworthyResponse(response) {
  return Boolean(response) && response.ok && response.type === 'basic';
}

function raceWithTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-first timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The last forecast that loaded, stamp intact -- or, with nothing yet on the phone, the precached offline document. */
function lastKnownGoodResponse(cache, request) {
  return cache.match(request).then((cached) => cached || cache.match(OFFLINE_DOCUMENT));
}

/** Network-first, 3 s timeout, fall back to cache, then the precached offline document.
 *
 * "The origin is unreachable" is not one shape: a stalled or DNS-dead
 * connection never resolves (the timeout race rejects), and a same-origin
 * 5xx or a captive portal / redirect-elsewhere handing back someone else's
 * page still RESOLVES the fetch, 200 OK and all. Both are treated the same
 * way -- neither is trustworthy, so neither is ever handed to the page or
 * written into the cache; only the forecast already on the phone is. */
function networkFirst(request) {
  return self.caches.open(CACHE_VERSION).then((cache) =>
    raceWithTimeout(self.fetch(request), NETWORK_FIRST_TIMEOUT_MS)
      .then((response) => {
        if (!isTrustworthyResponse(response)) return lastKnownGoodResponse(cache, request);
        cache.put(request, response.clone());
        return response;
      })
      .catch(() => lastKnownGoodResponse(cache, request)),
  );
}

/** Cache-first: a hit answers immediately, a miss fetches and stores the response. */
function cacheFirst(request) {
  return self.caches.open(CACHE_VERSION).then((cache) =>
    cache.match(request).then(
      (cached) =>
        cached ||
        self.fetch(request).then((response) => {
          if (isTrustworthyResponse(response)) cache.put(request, response.clone());
          return response;
        }),
    ),
  );
}

/** Byte length of a stored response, from its own Content-Length header. Unknown sizes count as 0. */
function storedResponseBytes(response) {
  if (!response) return 0;
  const length = response.headers ? response.headers.get('content-length') : null;
  return length ? Number(length) : 0;
}

/** Evicts the oldest entries (Cache.keys() insertion order) until the store is back under its cap. */
function trimToLimit(cache, limitBytes) {
  return cache.keys().then((keys) =>
    Promise.all(keys.map((key) => cache.match(key).then((response) => [key, storedResponseBytes(response)]))).then(
      (sized) => {
        let total = sized.reduce((sum, entry) => sum + entry[1], 0);
        const deletions = [];
        for (const [key, size] of sized) {
          if (total <= limitBytes) break;
          deletions.push(cache.delete(key));
          total -= size;
        }
        return Promise.all(deletions);
      },
    ),
  );
}

/** Cache-first, LRU capped: same read path as cache-first, trims the store after every write. */
function cacheFirstLru(request) {
  return self.caches.open(CACHE_VERSION).then((cache) =>
    cache.match(request).then(
      (cached) =>
        cached ||
        self.fetch(request).then((response) => {
          if (isTrustworthyResponse(response)) {
            cache.put(request, response.clone());
            trimToLimit(cache, MEDIA_CACHE_LIMIT_BYTES);
          }
          return response;
        }),
    ),
  );
}

function dispatch(entry, request) {
  switch (entry.strategy) {
    case CACHE_FIRST:
    case CACHE_FIRST_IMMUTABLE:
      return cacheFirst(request);
    case CACHE_FIRST_LRU:
      return cacheFirstLru(request);
    case NETWORK_FIRST:
      return networkFirst(request);
    default:
      // NETWORK_ONLY never reaches here; defensive fallback only.
      return self.fetch(request);
  }
}

function precacheOfflineDocument() {
  return self.caches.open(CACHE_VERSION).then((cache) =>
    self.fetch(OFFLINE_DOCUMENT).then((response) => {
      if (isTrustworthyResponse(response)) return cache.put(OFFLINE_DOCUMENT, response.clone());
      return undefined;
    }),
  );
}

function deleteStaleCaches() {
  return self.caches
    .keys()
    .then((names) => Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => self.caches.delete(name))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheOfflineDocument()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteStaleCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const entry = classifyRequest(event.request);
  if (!entry || entry.strategy === NETWORK_ONLY) return;
  event.respondWith(dispatch(entry, event.request));
});
