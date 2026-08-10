// decide_subscribe: the pure decision behind POST /api/push
// {action:"subscribe"}. Declared contract: 07-write-path.md §8.1, §10
// (`decide_subscribe(...) -> Plan | Rejection`, pure-function, no adapter or
// AWS SDK import — enforced by CI's dependency-cruiser rule, not just this
// comment).
//
// SCOPE OF THIS SLICE (01-01, covers R10/R11 only): the upsert-by-identity
// walking skeleton. `writes_today` and `allowlist` already arrive as
// declared inputs (criterion 4) so later steps that add the daily-quota
// reject (R12) and the endpoint-allowlist reject (R13) only add branches,
// never change the signature; this function does not yet read either.
//
// APPLY-AT-SEND, not stamp-at-subscribe (this step's implementation notes):
// `threshold_score` is stored exactly as the surfer declared it, explicit
// null when they chose no bar. No default of any kind — not even the 70 the
// architecture doc itself calls "an unfit prior" — is substituted here. The
// send-time rule governing an unbarred subscriber belongs to the notify
// sweep, a later step.

import { createHash } from 'node:crypto';

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

export function decideSubscribe(request: SubscribeRequest): SubscribeDecision {
  const endpointHash = hashEndpoint(request.subscription.endpoint);
  return {
    outcome: 'subscribed',
    stored: upsert(request.existing, request, endpointHash),
    rejection: null,
  };
}
