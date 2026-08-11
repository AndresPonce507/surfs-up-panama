# Live offline reload RCA

## Scope and conclusion

**Problem.** On 2026-08-10, Vera loaded `https://d1j9u9fxnap4es.cloudfront.net/` online, switched Chrome offline, and reloaded `/`. Chrome showed `ERR_INTERNET_DISCONNECTED` instead of the precached `/sin-senal/` fallback.

**Impact.** Every first visit on the released origin fails to activate the offline worker. No navigation on that installation is intercepted while offline.

**Conclusion.** This is a production URL mismatch that aborts service-worker installation. It is **not** an invalid first-visit timing assumption, a service-worker scope/control problem, or a CloudFront cache-header problem.

## Evidence

| Check | Observation | Result |
| --- | --- | --- |
| Released worker, `ef2ca01` | `OFFLINE_DOCUMENT = "/sin-senal"`; its precache list contains that exact string. | The worker requests the no-trailing-slash path. |
| Live origin | `GET /sin-senal` returned `404` and the application 404 document. `GET /sin-senal/` returned `200` and the offline document. | The precache request is not successful. |
| Release publisher | `scripts/preview/publish-preview.mjs` uploads `sin-senal.html` and the literal directory alias `sin-senal/`, not `sin-senal`. | The live URLs exactly explain the HTTP results. |
| Real Chrome, after online load | Cache `psb-offline-v1` contained only `/favicon.svg`; `getRegistration('/')` was `null`; `navigator.serviceWorker.controller` was `null`; `navigator.serviceWorker.ready` was still pending after 2 seconds. | The first precache entry succeeded, then install did not activate. |
| Live headers | `/`, `/sw.js`, and `/sin-senal/` were HTTPS `200` with `Cache-Control: no-cache`; `/sw.js` is at origin root. | Headers and worker scope do not block registration. |
| Local production build | Astro emitted `dist/sin-senal.html`, no `dist/sin-senal/index.html`. | The publisher's aliasing is necessary and must be represented by the worker's request URL. |
| Existing worker test | `tests/unit/sw-router-table.test.ts` fixes `OFFLINE_DOCUMENT = '/sin-senal'` and stubs that URL as a `200`; 10/10 tests passed. | Tests validate a fabricated path, not the built/deployed route contract. |

The worker's install handler calls `event.waitUntil(precacheSmallSharedParts().then(() => self.skipWaiting()))`. `precacheSmallSharedParts()` runs `Promise.all` over the favicon and `OFFLINE_DOCUMENT`, and throws for any response that is not `ok` and `basic`. The live `/sin-senal` response is `404`, so `Promise.all` rejects. Chrome discards the installing worker. The favicon remains in Cache Storage because it was written before the rejection, which accounts for the observed partial cache.

## Five whys

```
WHY 1: Offline reload had no fallback.
  Evidence: Vera observed ERR_INTERNET_DISCONNECTED; real Chrome had no controller.
WHY 2: The navigation was not intercepted.
  Evidence: getRegistration('/') was null and serviceWorker.ready was pending.
WHY 3: The worker failed to install.
  Evidence: cache contained only the first precache part (/favicon.svg), not the fallback; install waits for Promise.all.
WHY 4: The fallback precache fetch failed.
  Evidence: worker fetches /sin-senal; the live origin returns 404 for that URL, while /sin-senal/ is 200.
WHY 5: The worker owns a duplicated, stale spelling of the offline route, and release tests do not bind it to the static artifact/deployed alias contract.
  Evidence: src/i18n/routes.ts defines /sin-senal/; public/sw.js hard-codes /sin-senal; the test independently hard-codes the latter and stubs a success.

ROOT CAUSE: duplicated route literal without a build/deployment contract test.
```

Completeness check:

- **Install timing:** normally a first page can be uncontrolled until activation, but this worker calls `skipWaiting()` and `clients.claim()`. Here it never reaches either due to the failed precache. Waiting or reloading cannot repair a permanently failed install.
- **Scope/control:** `/sw.js` has root scope. Lack of control is an effect of failed installation, not a scope limitation.
- **CloudFront headers/cache strategy:** live worker and successful fallback path return valid HTTPS responses. The failing path is specifically a `404`; caching policy is not causal.
- **Navigation strategy:** `networkFirst` would return the fallback after a network error if installation and precache succeeded. It is not reached in the observed failure.

## Backwards validation

If the root cause exists, `/sin-senal` returns a non-OK response, the `Promise.all` install rejects after the favicon may be cached, no registration becomes active, and offline browser navigation falls through to Chrome network failure. Each consequence was observed independently. The chain has no contradiction with the healthy root-scope script or response headers.

## Smallest safe fix

Change only the worker's fallback constant to the deployed canonical URL:

```js
const OFFLINE_DOCUMENT = '/sin-senal/';
```

Keep `paths.offline()` as the canonical route. Do not workaround this by adding another S3 alias: that retains two public route spellings and leaves route ownership duplicated.

Because the existing installed worker never activated, deployment of the fixed `sw.js` lets the next online page visit install and claim normally. The cache name need not change for correctness: the failed install never populated the fallback. Bumping the cache version is optional hygiene, not required for remediation.

## Required regression coverage

1. Derive the worker fallback URL from the same route manifest/build contract used by the page, or assert `public/sw.js`'s extracted `OFFLINE_DOCUMENT` equals `paths.offline()`.
2. Build the production artifact, apply the exact release alias mapping, and verify every precache URL returns a `200` `text/html`/basic response. In particular, assert `/sin-senal/` succeeds and `/sin-senal` is not the chosen URL.
3. Browser E2E on a fresh Chrome profile: open `/` online; wait until `navigator.serviceWorker.ready` and a non-null controller; assert `psb-offline-v1` contains `/sin-senal/`; force the browser offline; reload `/`; assert the visible offline page heading/copy. This gate must fail if the worker is uncontrolled or the fallback cache key is absent.

The current unit test passing is useful only after it stops hard-coding a successful fake endpoint. It cannot be the release gate for this integration.

## Solution map

| Root cause | Immediate mitigation | Permanent prevention | Detection |
| --- | --- | --- | --- |
| Worker fallback URL differs from deployment alias | Patch `OFFLINE_DOCUMENT` to `/sin-senal/` and redeploy. | One source of route truth plus build/deployment contract assertion. | Fresh-profile offline E2E required before release. |

## Review status

The required troubleshooter peer-review lane could not be started because all 11 agent slots were occupied. This report has not been peer-reviewed; no production changes or deployment were made during the investigation.
