// Types for the push write-side decisions (decide_subscribe,
// 07-write-path.md §8.1, §10's `decide_subscribe(...) -> Plan | Rejection`
// pure-function contract). Types only — the pure-core rule (§10: no
// `decide_*` module imports an adapter or the AWS SDK) is enforced in
// decide-subscribe.ts, not here.

/** The settled PushSub row (domain §12) plus the five write-path attrs
 *  (07-write-path.md §8.1): the surfer's language, their bar, the two
 *  notify-job dates, and the device that asked. */
export type StoredSub = {
  spot_id: string;
  endpoint_hash: string;
  lang: string;
  /** Explicit null when the surfer chose no bar. Never a substituted
   *  default — 07-write-path.md's own "unfit prior" of 70 is exactly the
   *  default this type refuses to launder in. */
  threshold_score: number | null;
  last_notified_date: string | null;
  followup_date: string | null;
  device_id: string;
};

export type PushEndpointSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type SubscribeRequest = {
  action: 'subscribe';
  spot_id: string;
  subscription: PushEndpointSubscription;
  lang: string;
  /** Omitted when the surfer chose no bar — never defaulted by this type
   *  or by decideSubscribe. `| undefined` (not just `?`) so callers built
   *  from generated/spread data can carry the key with value `undefined`
   *  under `exactOptionalPropertyTypes`. */
  threshold_score?: number | undefined;
  device_id: string;
  /** Declared input; decideSubscribe never reads an ambient clock. */
  now: string;
  /** Declared input: the caller-supplied current state for this identity. */
  existing: StoredSub[];
  /** Declared input. Unused by this slice's upsert path; the daily-quota
   *  reject is a later slice-01 step. */
  writes_today: number;
  /** Declared input. Unused by this slice's upsert path; the endpoint
   *  allowlist reject is a later slice-01 step. */
  allowlist: string[];
};

export type SubscribeOutcome = 'subscribed' | 'unsubscribed' | 'rejected';

/** What a rejected request tells the surfer: which destination, why it was
 *  refused, and how to subscribe for real (07-write-path.md §8.4). */
export type RejectionDetail = {
  what?: string;
  why?: string;
  how?: string;
  reason?: string;
};

export type SubscribeDecision = {
  outcome: SubscribeOutcome;
  stored: StoredSub[];
  rejection: RejectionDetail | null;
};
