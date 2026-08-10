// Property laws for decideSubscribe (07-write-path.md §8.1, §10). Slice-01
// step 01-01 covers the upsert-by-identity walking skeleton (R10, R11).
// Step 01-02 (below) adds the endpoint-allowlist reject (R12). The
// daily-quota reject (R13) and unsubscribe (R14) are later slice-01 steps
// and are not exercised here. House style: fast-check properties over the
// declared driving-port signature, per tests/unit/scoring-laws.test.ts.

import assert from 'node:assert/strict';

import fc from 'fast-check';
import { describe, it } from 'vitest';

import { decideSubscribe } from '../../src/push/decide-subscribe';
import type { StoredSub, SubscribeRequest } from '../../src/push/types';

const identifier = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((value) => value.trim().length > 0);
const lang = fc.constantFrom('es', 'en', 'fr');
const isoDate = fc.constantFrom('2026-08-01', '2026-08-09', '2026-08-10');
const bar = fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined });

function requestFor(
  spotId: string,
  endpoint: string,
  overrides: {
    lang: string;
    threshold_score?: number | undefined;
    device_id: string;
    now: string;
  },
): SubscribeRequest {
  return {
    action: 'subscribe',
    spot_id: spotId,
    subscription: { endpoint, keys: { p256dh: 'clave-publica', auth: 'clave-auth' } },
    lang: overrides.lang,
    threshold_score: overrides.threshold_score,
    device_id: overrides.device_id,
    now: overrides.now,
    existing: [],
    writes_today: 0,
    allowlist: ['fcm.googleapis.com'],
  };
}

const askSequence = fc.array(
  fc.record({
    lang,
    threshold_score: bar,
    device_id: identifier,
    now: fc.constantFrom(
      '2026-08-10T18:00:00-05:00',
      '2026-08-10T18:05:00-05:00',
      '2026-08-10T19:30:00-05:00',
    ),
  }),
  { minLength: 1, maxLength: 6 },
);

const arbitraryStoredSub: fc.Arbitrary<StoredSub> = fc.record({
  spot_id: identifier,
  endpoint_hash: identifier,
  lang,
  threshold_score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  last_notified_date: fc.option(isoDate, { nil: null }),
  followup_date: fc.option(isoDate, { nil: null }),
  device_id: identifier,
});

const arbitraryRequest: fc.Arbitrary<SubscribeRequest> = fc.record({
  action: fc.constant('subscribe' as const),
  spot_id: identifier,
  subscription: fc.record({
    endpoint: identifier.map((s) => `https://fcm.googleapis.com/fcm/send/${s}`),
    keys: fc.record({ p256dh: identifier, auth: identifier }),
  }),
  lang,
  threshold_score: bar,
  device_id: identifier,
  now: fc.constantFrom('2026-08-10T18:00:00-05:00', '2026-08-10T07:25:00-05:00'),
  existing: fc.array(arbitraryStoredSub, { maxLength: 3 }),
  writes_today: fc.integer({ min: 0, max: 25 }),
  allowlist: fc.constant(['fcm.googleapis.com']),
});

describe('decideSubscribe', () => {
  // covers: R10, R11
  it('upserts by (spot_id, endpoint_hash): repeated asks from the same identity always leave exactly one row carrying the latest lang/bar/device, notify-job state already on file survives, an unrelated identity is left untouched, and all five declared attributes are stored with an omitted bar as an explicit null', () => {
    fc.assert(
      fc.property(
        identifier,
        identifier.map((s) => `https://fcm.googleapis.com/fcm/send/${s}`),
        isoDate,
        isoDate,
        askSequence,
        (spotId, endpoint, notifiedBeforeAny, followupBeforeAny, asks) => {
          const otherRow: StoredSub = {
            spot_id: `${spotId}-ajeno`,
            endpoint_hash: 'hash-de-otro-suscriptor',
            lang: 'en',
            threshold_score: 55,
            last_notified_date: '2026-07-01',
            followup_date: '2026-07-01',
            device_id: 'dispositivo-ajeno',
          };

          // First ask establishes the identity's row.
          const firstAsk = asks[0]!;
          const opened = decideSubscribe(requestFor(spotId, endpoint, firstAsk));
          let stored = [otherRow, ...opened.stored];
          const mineAfterFirst = stored.filter(
            (row) => row.spot_id === spotId && row.device_id !== otherRow.device_id,
          );
          assert.equal(
            mineAfterFirst.length,
            1,
            'The very first subscribe request for a new identity must create exactly one row.',
          );

          // Simulate the notify job stamping today's dedup state onto that
          // row, exactly as 07-write-path.md §8.2 would after a real send.
          const identityHash = mineAfterFirst[0]!.endpoint_hash;
          stored = stored.map((row) =>
            row.spot_id === spotId && row.endpoint_hash === identityHash
              ? { ...row, last_notified_date: notifiedBeforeAny, followup_date: followupBeforeAny }
              : row,
          );

          // Fold every remaining ask through decideSubscribe, feeding each
          // decision's stored rows forward as the next ask's existing state.
          let lastAsk = firstAsk;
          for (const ask of asks.slice(1)) {
            lastAsk = ask;
            const decision = decideSubscribe(
              Object.assign(requestFor(spotId, endpoint, ask), { existing: stored }),
            );
            stored = decision.stored;
          }

          const mine = stored.filter((row) => row.spot_id === spotId && row.endpoint_hash === identityHash);
          assert.equal(
            mine.length,
            1,
            'Any sequence of subscribe requests sharing (spot_id, endpoint_hash) must fold to exactly one stored row, never a stack of rows.',
          );
          const [row] = mine;
          assert.ok(row !== undefined, 'The identity row must still exist after the full sequence of asks.');
          assert.equal(
            row?.lang,
            lastAsk.lang,
            'The stored row must carry the most recent request\'s language, so a re-ask is not silently dropped.',
          );
          assert.equal(
            row?.threshold_score,
            lastAsk.threshold_score ?? null,
            'The stored row must carry the most recent request\'s bar, explicit null when the surfer chose none — decideSubscribe never substitutes a default.',
          );
          assert.equal(
            row?.device_id,
            lastAsk.device_id,
            'The stored row must carry the most recent request\'s device id.',
          );
          assert.equal(
            row?.last_notified_date,
            notifiedBeforeAny,
            'Re-asking for avisos must never reset the notify-job dedup date already on file.',
          );
          assert.equal(
            row?.followup_date,
            followupBeforeAny,
            'Re-asking for avisos must never reset the afternoon follow-up date already on file.',
          );
          for (const field of ['lang', 'threshold_score', 'last_notified_date', 'followup_date', 'device_id'] as const) {
            assert.ok(row !== undefined && field in row, `The stored row must carry the key ${field}, present even when its value is null.`);
          }

          const untouched = stored.find(
            (candidate) => candidate.spot_id === otherRow.spot_id && candidate.endpoint_hash === otherRow.endpoint_hash,
          );
          assert.deepEqual(
            untouched,
            otherRow,
            'A different identity already on file must be left byte-for-byte untouched by an unrelated upsert.',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // covers: contract:declared-inputs-not-ambient-reads
  it('is a deterministic pure function of its declared inputs: identical declared inputs always produce a bit-identical decision', () => {
    fc.assert(
      fc.property(arbitraryRequest, (request) => {
        const first = decideSubscribe(structuredClone(request));
        const second = decideSubscribe(structuredClone(request));
        assert.deepEqual(
          second,
          first,
          'Identical declared inputs must produce a bit-identical decision so the call never depends on a clock, environment, or filesystem read.',
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ------------------------------------------------ endpoint-allowlist (R12)
//
// The law is host membership (implementation notes, step 01-02): any
// endpoint whose host is absent from the caller-declared `allowlist` is
// refused, loudly, with nothing stored; any endpoint whose host is on it is
// not refused for that reason. `request.allowlist` is a declared input, so
// these properties generate their OWN synthetic allowlists rather than
// importing the shipped production list (push-hosts.ts) -- the acceptance
// suite already proves the production list is wired in; what these
// properties prove is that the matching rule itself cannot be fooled.

const dnsLabel = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 3, maxLength: 10 })
  .map((chars) => chars.join(''));

/** A syntactically valid two-label host under the IANA-reserved "test" TLD
 *  (RFC 6761), so it can never collide with a real vendor host. */
const knownHost = fc.tuple(dnsLabel, dnsLabel).map(([service, vendor]) => `${service}-${vendor}.test`);

function requestWithEndpoint(endpoint: string, allowlist: string[]): SubscribeRequest {
  return {
    action: 'subscribe',
    spot_id: 'playa-venao',
    subscription: { endpoint, keys: { p256dh: 'clave-publica', auth: 'clave-auth' } },
    lang: 'es',
    device_id: 'dispositivo-de-prueba',
    now: '2026-08-10T18:00:00-05:00',
    existing: [],
    writes_today: 0,
    allowlist,
  };
}

describe('decideSubscribe -- endpoint-allowlist reject (R12)', () => {
  // covers: R12 (accept branch)
  it('never refuses a host that matches its declared allowlist: an exact entry accepts that exact host and an uppercase rendering of it; a domain-suffix entry (leading ".") also accepts the bare suffix and a genuine subdomain of it', () => {
    fc.assert(
      fc.property(
        knownHost,
        dnsLabel,
        fc.constantFrom('exact-lower', 'exact-upper', 'suffix-root', 'suffix-subdomain'),
        dnsLabel,
        (base, token, shape, subLabel) => {
          const usesSuffixEntry = shape === 'suffix-root' || shape === 'suffix-subdomain';
          const entry = usesSuffixEntry ? `.${base}` : base;
          const host =
            shape === 'exact-upper'
              ? base.toUpperCase()
              : shape === 'suffix-subdomain'
                ? `${subLabel}.${base}`
                : base;
          const endpoint = `https://${host}/push/${token}`;
          const decision = decideSubscribe(requestWithEndpoint(endpoint, [entry]));
          assert.equal(
            decision.outcome,
            'subscribed',
            `a "${shape}" rendering of an allowlisted host must be accepted (entry: ${entry}, host: ${host})`,
          );
          assert.equal(decision.rejection, null, `an accepted destination must carry no rejection (shape: ${shape})`);
        },
      ),
      { numRuns: 100 },
    );
  });

  // covers: R12 (reject branch) -- the point of this step
  it('rejects loudly, storing nothing, any endpoint whose host is not on the allowlist -- including a suffix attack, a look-alike subdomain, a userinfo trick, an unrelated host, and a trailing-dot rendering of an allowlisted host', () => {
    fc.assert(
      fc.property(
        knownHost,
        dnsLabel,
        fc.constantFrom('unrelated', 'suffix-attack', 'lookalike-subdomain', 'userinfo-trick', 'trailing-dot'),
        (allowed, attackerLabel, shape) => {
          const endpoint = ((): string => {
            switch (shape) {
              case 'suffix-attack':
                // defeats a naive host.startsWith(allowed) / .includes(allowed) check
                return `https://${allowed}.${attackerLabel}-atacante.test/push`;
              case 'lookalike-subdomain':
                // defeats a naive host.endsWith(allowed) check against an
                // EXACT (non-suffix) allowlist entry
                return `https://${attackerLabel}.${allowed}/push`;
              case 'userinfo-trick':
                // the real host is the attacker's; `allowed` sits only in userinfo
                return `https://${allowed}@${attackerLabel}-atacante.test/push`;
              case 'trailing-dot':
                // a different string from the allowlisted host -- fail
                // closed rather than deciding it is "probably the same"
                return `https://${allowed}./push`;
              default:
                return `https://${attackerLabel}-nunca-listado.test/push`;
            }
          })();
          const decision = decideSubscribe(requestWithEndpoint(endpoint, [allowed]));
          assert.equal(
            decision.outcome,
            'rejected',
            `a "${shape}" near-miss of an allowlisted host must be rejected, not accepted (endpoint: ${endpoint})`,
          );
          assert.deepEqual(decision.stored, [], `a rejected subscribe request must store nothing (shape: ${shape})`);
          const rejection = decision.rejection;
          assert.ok(rejection !== null, 'a rejection must carry a stated reason, never a silent drop');
          assert.ok(
            (rejection?.what ?? '').includes(endpoint),
            'the rejection must name the destination the surfer actually supplied',
          );
          assert.ok((rejection?.why ?? '').trim().length > 0, 'the rejection must say why it was refused');
          assert.ok((rejection?.how ?? '').trim().length > 0, 'the rejection must say how to subscribe for real');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// -------------------------------------------- insecure transport (R12, 01-03)
//
// The law this step adds (implementation notes, step 01-03): transport is
// checked INDEPENDENTLY of host membership. A host being on the allowlist
// must never exempt its endpoint from also being reached over https --
// which is exactly why 01-02's allowlist properties are not enough on
// their own to prove this law: they only ever exercise https endpoints, so
// an implementation that forgot the transport check entirely would still
// pass every one of them.

describe('decideSubscribe -- insecure transport reject (R12, step 01-03)', () => {
  // covers: R12 (transport reject) -- the point of this step
  it('never accepts a non-https destination, even one that looks secure at a glance: an uppercase HTTP scheme, a userinfo segment spelling "https", a scheme-relative URL, and plain http on an otherwise-allowlisted host', () => {
    fc.assert(
      fc.property(
        knownHost,
        dnsLabel,
        fc.constantFrom('uppercase-scheme', 'userinfo-trick', 'scheme-relative', 'allowed-host-http'),
        (allowedHost, token, shape) => {
          const endpoint = ((): string => {
            switch (shape) {
              case 'uppercase-scheme':
                // defeats a naive case-sensitive `startsWith('http://')` guard
                return `HTTP://${allowedHost}/push/${token}`;
              case 'userinfo-trick':
                // the string CONTAINS "https", but the scheme is still http
                return `http://https@${allowedHost}/push/${token}`;
              case 'scheme-relative':
                // no scheme at all -- defeats a naive `!includes('http://')` guard
                return `//${allowedHost}/push/${token}`;
              default:
                // the direct case: host IS allowlisted, transport is not
                return `http://${allowedHost}/push/${token}`;
            }
          })();
          const decision = decideSubscribe(requestWithEndpoint(endpoint, [allowedHost]));
          assert.equal(
            decision.outcome,
            'rejected',
            `a "${shape}" non-https destination must be rejected even when its host is allowlisted (endpoint: ${endpoint})`,
          );
          assert.deepEqual(decision.stored, [], `a rejected subscribe request must store nothing (shape: ${shape})`);
        },
      ),
      { numRuns: 100 },
    );
  });

  // covers: R12 (transport reject shape parity)
  it('rejects an insecure destination in the same {what, why, how} shape as an off-allowlist rejection, naming the destination it refused', () => {
    fc.assert(
      fc.property(knownHost, dnsLabel, (allowedHost, token) => {
        const insecureEndpoint = `http://${allowedHost}/push/${token}`;
        const insecureDecision = decideSubscribe(requestWithEndpoint(insecureEndpoint, [allowedHost]));

        const unknownEndpoint = `https://${token}-nunca-listado.test/push`;
        const unknownDecision = decideSubscribe(requestWithEndpoint(unknownEndpoint, [allowedHost]));

        assert.equal(insecureDecision.outcome, 'rejected', 'an insecure destination must be rejected');
        assert.deepEqual(insecureDecision.stored, [], 'a rejected subscribe request must store nothing');

        const insecureRejection = insecureDecision.rejection;
        const unknownRejection = unknownDecision.rejection;
        assert.ok(
          insecureRejection !== null && unknownRejection !== null,
          'both the insecure refusal and the off-allowlist refusal must carry a stated reason',
        );
        assert.deepEqual(
          Object.keys(insecureRejection ?? {}).sort(),
          Object.keys(unknownRejection ?? {}).sort(),
          'the insecure refusal must carry the same {what, why, how} shape as the off-allowlist refusal',
        );
        for (const field of ['what', 'why', 'how'] as const) {
          assert.ok(
            (insecureRejection?.[field] ?? '').trim().length > 0,
            `the insecure refusal must fill in ${field}, same as the off-allowlist refusal`,
          );
        }
        assert.ok(
          (insecureRejection?.what ?? '').includes(insecureEndpoint),
          'the insecure refusal must name the destination the surfer actually supplied',
        );
      }),
      { numRuns: 50 },
    );
  });
});
