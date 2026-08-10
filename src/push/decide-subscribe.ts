// decide_subscribe: the pure decision behind POST /api/push
// {action:"subscribe"}. Declared contract: 07-write-path.md §8.1, §10
// (`decide_subscribe(...) -> Plan | Rejection`, pure-function, no adapter or
// AWS SDK import — enforced by CI's dependency-cruiser rule, not just this
// comment).
//
// SCOPE: 01-01 shipped the upsert-by-identity walking skeleton (R10, R11).
// 01-02 (this step) adds the endpoint-allowlist reject (R12): a request
// whose destination host is not on the caller-declared `allowlist` is
// rejected loudly, before anything is stored. The daily-quota reject (R13)
// still does not read `writes_today` -- that is a later slice-01 step and
// only adds another branch, never changes the signature.
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

/** sha256(endpoint), hex-truncated to 128 bits, per 07-write-path.md §8.1. */
function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

type SubIdentity = Pick<StoredSub, 'spot_id' | 'endpoint_hash'>;

function sameIdentity(a: SubIdentity, b: SubIdentity): boolean {
  return a.spot_id === b.spot_id && a.endpoint_hash === b.endpoint_hash;
}

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

/** The parsed destination host, or null when the endpoint cannot even be
 *  parsed as a URL -- an unclassifiable destination is rejected the same as
 *  a classified-but-unknown one (fail closed, no "probably fine" branch). */
function destinationHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname;
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

export function decideSubscribe(request: SubscribeRequest): SubscribeDecision {
  const rawEndpoint = request.subscription.endpoint;
  const host = destinationHost(rawEndpoint);
  if (host === null || !isAllowedHost(host, request.allowlist)) {
    return rejectUnknownDestination(rawEndpoint);
  }
  const endpointHash = hashEndpoint(rawEndpoint);
  return {
    outcome: 'subscribed',
    stored: upsert(request.existing, request, endpointHash),
    rejection: null,
  };
}
