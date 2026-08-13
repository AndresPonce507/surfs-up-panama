// decide_subscribe: the pure decision behind POST /api/push
// {action:"subscribe"}. Declared contract: 07-write-path.md §8.1, §10
// (`decide_subscribe(...) -> Plan | Rejection`, pure-function, no adapter or
// AWS SDK import — enforced by CI's dependency-cruiser rule, not just this
// comment).
//
// SCOPE: 01-01 shipped the upsert-by-identity walking skeleton (R10, R11).
// 01-02 added the endpoint-allowlist reject (R12): a request whose
// destination host is not on the caller-declared `allowlist` is rejected
// loudly, before anything is stored. 01-03 closed the other half of R12: a
// destination reached over plain http is rejected the same way, even when
// its host IS on the allowlist -- an allowlisted host over http still leaks
// the subscription and lets anyone on the path forge or read notifications,
// so transport is checked independently of host membership, never folded
// into a single "bad endpoint" branch (that would destroy the loudness the
// ADR's self-reporting mitigation depends on). 01-04 added the daily-quota
// reject (R13): a device that already used its day's 20 sub-writes
// (07-write-path.md §8.4, count ratified) is refused, loudly, in the same
// {what, why, how} vocabulary. Checked FIRST, before the endpoint is even
// parsed -- the write-path sequence diagram's own step order is "cap ->
// schema -> HMAC -> endpoint host allowlist" (§8.6), and quota is the
// cheapest possible gate: no reason to parse a URL for a device that is
// refused regardless of what it names.
//
// 01-05 (this step) closes R14, the unsubscribe half of the single wire
// contract (§8.1's `{"action":"unsubscribe","spot_id":"…","endpoint":"…"}`
// row): the function now dispatches on `request.action` before touching
// `subscription.endpoint`, the fix 01-01 flagged and left for whichever
// step shipped R14. Removal is a plain delete-by-identity, always reported
// as the success outcome `unsubscribed` -- including when the identity was
// never there, or is already gone, which is why this is a "normal ending"
// and not a rejection or a thrown error. Quota and endpoint-allowlist
// gating are declared inputs on the unsubscribe request shape too (the
// caller always supplies them, same as subscribe), but neither gate is
// wired to the removal path here: no criterion or scenario in this step
// exercises a quota- or allowlist-gated unsubscribe, and 07-write-path.md
// §8.1's unsubscribe row names no such gate, so wiring one in now would be
// unrequired behaviour. Left flagged for whichever step, if any, decides
// unsubscribe should also spend a write-quota slot.
//
// APPLY-AT-SEND, not stamp-at-subscribe (this step's implementation notes):
// `threshold_score` is stored exactly as the surfer declared it, explicit
// null when they chose no bar. No default of any kind — not even the 70 the
// architecture doc itself calls "an unfit prior" — is substituted here. The
// send-time rule governing an unbarred subscriber belongs to the notify
// sweep, a later step.

import { createHash } from 'node:crypto';

import { isAllowedHost } from './push-hosts';
import type { StoredSub, SubscribeDecision, SubscribeRequest } from './types';

/** Ratified, unlike the notify-time score threshold (01-10): 20
 *  subscription writes/day/device, ADOPTED by 07-write-path.md §8.4 and
 *  fixed by the slice-01 acceptance fixture. A settled number belongs in a
 *  named constant, not a magic literal at the call site. */
const DAILY_SUBSCRIPTION_WRITE_QUOTA = 20;

/** sha256(endpoint), hex-truncated to 128 bits, per 07-write-path.md §8.1. */
function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

type SubIdentity = Pick<StoredSub, 'spot_id' | 'endpoint_hash'>;

function sameIdentity(a: SubIdentity, b: SubIdentity): boolean {
  return a.spot_id === b.spot_id && a.endpoint_hash === b.endpoint_hash;
}

/**
 * The R14 request shape (07-write-path.md §8.1): its own contract, not a
 * subscribe request bent into shape. It names nothing an unsubscribe body
 * never carries -- no `subscription`, no `lang`, no `threshold_score`.
 * `writes_today` and `allowlist` are still declared inputs (the caller
 * always supplies them, same as a subscribe request), kept here for shape
 * parity even though this step wires neither gate into the removal path
 * (see the file-header note above).
 */
export type UnsubscribeRequest = {
  action: 'unsubscribe';
  spot_id: string;
  endpoint: string;
  device_id: string;
  now: string;
  existing: StoredSub[];
  writes_today: number;
  allowlist: string[];
};

/**
 * Merge a subscribe request into the caller-declared `existing` rows.
 *
 * User-declared fields (`lang`, `threshold_score`, `device_id`) are taken
 * fresh from this request every time — a re-ask must not be silently
 * dropped. Notify-job state (`last_notified_date`, `followup_date`)
 * survives from the matching existing row, because a surfer re-asking for
 * avisos must never reset today's 1/day dedup or the afternoon follow-up
 * (07-write-path.md §8.2, decision 23: no nagging).
 */
function upsert(existing: readonly StoredSub[], request: SubscribeRequest, endpointHash: string): StoredSub[] {
  const identity: SubIdentity = { spot_id: request.spot_id, endpoint_hash: endpointHash };
  const priorRow = existing.find((row) => sameIdentity(row, identity));
  const mergedRow: StoredSub = {
    spot_id: request.spot_id,
    endpoint_hash: endpointHash,
    lang: request.lang,
    threshold_score: request.threshold_score ?? null,
    last_notified_date: priorRow?.last_notified_date ?? null,
    followup_date: priorRow?.followup_date ?? null,
    device_id: request.device_id,
  };
  return priorRow === undefined
    ? [...existing, mergedRow]
    : existing.map((row) => (sameIdentity(row, identity) ? mergedRow : row));
}

type ParsedEndpoint = { host: string; protocol: string };

/** Parse the endpoint once; null when it cannot even be parsed as a URL --
 *  an unclassifiable destination is rejected the same as a
 *  classified-but-unknown one (fail closed, no "probably fine" branch).
 *  `URL#protocol` already lower-cases the scheme, so a differently-cased
 *  rendering ("HTTP://...") cannot slip past the transport check below by
 *  string-casing alone. */
function parseEndpoint(rawEndpoint: string): ParsedEndpoint | null {
  try {
    const url = new URL(rawEndpoint);
    return { host: url.hostname, protocol: url.protocol };
  } catch {
    return null;
  }
}

/**
 * The R12 reject: loud by contract (07-write-path.md §8.4), never a silent
 * drop. Names the destination the surfer actually supplied, states why it
 * was refused, and states how to subscribe for real -- the ADR's own
 * mitigation for an incomplete allowlist depends on this rejection being
 * legible, not vague (adr-push-vapid-direct.md).
 */
function rejectUnknownDestination(rawEndpoint: string): SubscribeDecision {
  return {
    outcome: 'rejected',
    stored: [],
    rejection: {
      what: `el destino ${rawEndpoint}`,
      why:
        'los destinos de avisos tienen que venir de un servicio de avisos conocido ' +
        '(FCM, el push web de Apple, el autopush de Mozilla o WNS); aceptar cualquier ' +
        'otro convierte el servidor en un lanzador de tráfico hacia la dirección que le pongan.',
      how:
        'pedí avisos de nuevo desde un navegador real con las notificaciones push ' +
        'habilitadas, para que la suscripción salga de ese mismo servicio de avisos conocido.',
    },
  };
}

/**
 * The other half of the R12 reject (07-write-path.md §8.4): a destination
 * reached over anything but `https:` is refused, loudly, in the same
 * {what, why, how} shape as `rejectUnknownDestination` -- one vocabulary
 * for every refusal a caller has to learn, not two. Kept as its own
 * function (not merged into the allowlist branch) so the two refusal
 * reasons stay distinguishable: an off-allowlist host and an insecure
 * transport are different holes with different fixes.
 */
function rejectInsecureDestination(rawEndpoint: string): SubscribeDecision {
  return {
    outcome: 'rejected',
    stored: [],
    rejection: {
      what: `el destino ${rawEndpoint}`,
      why:
        'los destinos de avisos tienen que llegar por una conexión segura (https); ' +
        'aceptar uno sin cifrar deja la suscripción a la vista de cualquiera en el camino, ' +
        'que puede leer o falsificar los avisos que le llegan a ese teléfono.',
      how:
        'pedí avisos de nuevo desde un navegador real con las notificaciones push ' +
        'habilitadas, para que la suscripción salga por una conexión segura de verdad.',
    },
  };
}

/**
 * The R13 reject (07-write-path.md §8.4): loud, in the same {what, why,
 * how} shape as the two endpoint rejects above -- one vocabulary for every
 * refusal a caller has to learn, not three. Deliberately blind to whether
 * `existing` carries a row matching this request's identity: an upsert of
 * an already-subscribed device is still one write, so it is gated the same
 * as a brand-new subscribe, never exempted and never punished twice for
 * being a repeat.
 */
function rejectDailyQuotaExceeded(): SubscribeDecision {
  return {
    outcome: 'rejected',
    stored: [],
    rejection: {
      what: 'el cupo de escrituras de suscripción de este teléfono para hoy',
      why:
        `este teléfono ya usó su cupo de ${DAILY_SUBSCRIPTION_WRITE_QUOTA} escrituras de suscripción del día; ` +
        'sin ese tope, un dispositivo comprometido podría inundar el servidor de suscripciones basura ' +
        '(07-write-path.md sección 8.4).',
      how: 'volvé a pedir avisos mañana, cuando el cupo del día se reinicia.',
    },
  };
}

/** A personal bar is a whole score on the published 0–100 scale. Reject it
 * before touching the existing subscription universe: rounding, clamping, or
 * substituting a default would silently change the surfer's intent. */
function rejectInvalidThreshold(existing: StoredSub[]): SubscribeDecision {
  return {
    outcome: 'rejected',
    stored: existing,
    rejection: {
      what: 'la barra elegida para los avisos',
      why: 'la barra tiene que ser un número entero entre 0 y 100 para que el aviso respete exactamente la mañana que querés.',
      how: 'elegí un número entero entre 0 y 100 y volvé a pedir avisos.',
    },
  };
}

/**
 * The R14 decision (07-write-path.md §8.1): a plain delete-by-identity,
 * always reported as the success outcome `unsubscribed` -- whether the
 * identity was on file or was already gone. There is no rejection branch:
 * removing something absent is a normal ending, not an error, which is the
 * whole point of this step. `stored` carries the same shape `upsert`
 * returns for a subscribe -- the caller-declared `existing` rows, minus
 * the removed identity if it was there -- so a caller reading the plan
 * never has to special-case unsubscribe's response shape.
 */
function decideUnsubscribe(request: UnsubscribeRequest): SubscribeDecision {
  const identity: SubIdentity = {
    spot_id: request.spot_id,
    endpoint_hash: hashEndpoint(request.endpoint),
  };
  return {
    outcome: 'unsubscribed',
    stored: request.existing.filter((row) => !sameIdentity(row, identity)),
    rejection: null,
  };
}

export function decideSubscribe(request: SubscribeRequest | UnsubscribeRequest): SubscribeDecision {
  if (request.action === 'unsubscribe') {
    return decideUnsubscribe(request);
  }
  if (
    request.threshold_score !== undefined &&
    (!Number.isInteger(request.threshold_score) || request.threshold_score < 0 || request.threshold_score > 100)
  ) {
    return rejectInvalidThreshold(request.existing);
  }
  if (request.writes_today >= DAILY_SUBSCRIPTION_WRITE_QUOTA) {
    return rejectDailyQuotaExceeded();
  }
  const rawEndpoint = request.subscription.endpoint;
  const parsed = parseEndpoint(rawEndpoint);
  if (parsed === null) {
    return rejectUnknownDestination(rawEndpoint);
  }
  if (parsed.protocol !== 'https:') {
    return rejectInsecureDestination(rawEndpoint);
  }
  if (!isAllowedHost(parsed.host, request.allowlist)) {
    return rejectUnknownDestination(rawEndpoint);
  }
  const endpointHash = hashEndpoint(rawEndpoint);
  return {
    outcome: 'subscribed',
    stored: upsert(request.existing, request, endpointHash),
    rejection: null,
  };
}
