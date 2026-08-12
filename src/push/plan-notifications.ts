// plan_notifications is the pure planning port for the scheduled notify job.
// It returns the work an adapter may perform later. It never sends a push,
// reads a clock, or chooses a product threshold on a subscriber's behalf.

import type { StoredSub } from './types';

export type PushSpot = {
  spot_id: string;
  slug: string;
  name: string;
  timezone: string;
};

export type PlannedSend = {
  spot_id: string;
  endpoint_hash: string;
  lang: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl_seconds: number;
};

/** A write the scheduled adapter performs after it delivers the planned send. */
export type NotificationWrite = {
  spot_id: string;
  endpoint_hash: string;
  last_notified_date: string;
};

export type NotificationPlan = {
  sends: PlannedSend[];
  writes: NotificationWrite[];
  deferred: number;
  events: { kind: string; deferred?: number }[];
};

export type PlanNotificationsInput = {
  now: string;
  spots: readonly PushSpot[];
  scores: Readonly<Record<string, number>>;
  subscriptions: readonly StoredSub[];
  /** Declared composition-root input for subscribers who left their bar unset. */
  default_threshold_score: number;
  run_cap: number;
};

/**
 * Copy remains intentionally swappable while product owners settle the final
 * morning wording. This step only needs plain Spanish that names the spot and
 * score for a Spanish subscriber.
 */
export const MORNING_NOTIFICATION_COPY_ES = {
  title: (spotName: string, score: number): string => `Mejor: ${spotName}, ${score}`,
  body: (spotName: string, score: number): string => `${spotName} marca ${score} esta mañana. Mira el pronóstico.`,
} as const;

const MORNING_START_HOUR = 6;
const MORNING_END_HOUR = 9;
const FOUR_HOURS_IN_SECONDS = 4 * 60 * 60;

function spotLocalHour(now: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const hour = parts.find((part) => part.type === 'hour')?.value;
  return Number(hour);
}

/**
 * The subscription date is a civil date at its spot, never a UTC or server
 * date. Exporting this keeps the scheduled send and its later follow-up on
 * the same date convention.
 */
export function spotLocalDate(now: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (kind: 'year' | 'month' | 'day'): string => parts.find((candidate) => candidate.type === kind)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isMorningAtSpot(now: string, spot: PushSpot): boolean {
  const hour = spotLocalHour(now, spot.timezone);
  return hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR;
}

function subscriberThresholdScore(subscription: StoredSub, defaultThresholdScore: number): number {
  return subscription.threshold_score ?? defaultThresholdScore;
}

function isAtOrAboveSubscriberBar(
  score: number | undefined,
  subscription: StoredSub,
  defaultThresholdScore: number,
): boolean {
  return score !== undefined && score >= subscriberThresholdScore(subscription, defaultThresholdScore);
}

function hasNotBeenNotifiedForSpotDate(subscription: StoredSub, date: string): boolean {
  return subscription.last_notified_date === null || subscription.last_notified_date < date;
}

function composeSpanishMorningSend(spot: PushSpot, subscription: StoredSub, score: number): PlannedSend {
  return {
    spot_id: spot.spot_id,
    endpoint_hash: subscription.endpoint_hash,
    lang: subscription.lang,
    title: MORNING_NOTIFICATION_COPY_ES.title(spot.name, score),
    body: MORNING_NOTIFICATION_COPY_ES.body(spot.name, score),
    url: `/spots/${spot.slug}/`,
    tag: spot.spot_id,
    ttl_seconds: FOUR_HOURS_IN_SECONDS,
  };
}

type PlannedNotification = { send: PlannedSend; write: NotificationWrite };

function eligibleMorningNotifications(input: PlanNotificationsInput): PlannedNotification[] {
  return input.spots.flatMap((spot) => {
    if (!isMorningAtSpot(input.now, spot)) return [];
    const score = input.scores[spot.spot_id];
    const date = spotLocalDate(input.now, spot.timezone);
    return input.subscriptions
      .filter((subscription) => subscription.spot_id === spot.spot_id)
      .filter((subscription) => isAtOrAboveSubscriberBar(score, subscription, input.default_threshold_score))
      .filter((subscription) => hasNotBeenNotifiedForSpotDate(subscription, date))
      .map((subscription) => ({
        send: composeSpanishMorningSend(spot, subscription, score!),
        write: {
          spot_id: spot.spot_id,
          endpoint_hash: subscription.endpoint_hash,
          last_notified_date: date,
        },
      }));
  });
}

/** What the notify adapter reports back about one attempted send. */
export type SendResponse = {
  endpoint_hash: string;
  status: number;
};

/**
 * All the pruning rule reads off an attempted send is which destination it went
 * to. Asking for less than a full PlannedSend keeps the rule usable by any
 * caller that knows the identity of what it tried.
 */
export type AttemptedSend = {
  endpoint_hash: string;
};

export type PlanSendReactionsInput = {
  /** The run these responses answer. Identity travels on the response, so the
   *  rule does not read this; it stays in the declared input because the run is
   *  what the caller has in hand. */
  sends: readonly AttemptedSend[];
  responses: readonly SendResponse[];
};

/** Deletions the caller must perform. This module performs none of them. */
export type SendReactions = {
  deletions: string[];
  events: { kind: string }[];
};

/**
 * The three answers that mean the destination itself is gone for good, so
 * there is nobody left to reach by trying again.
 */
const GONE_FOR_GOOD_STATUSES: readonly number[] = [404, 410, 403];

function isGoneForGood(response: SendResponse): boolean {
  return GONE_FOR_GOOD_STATUSES.includes(response.status);
}

/**
 * Decide, but do not execute, what a run of sends means for the stored
 * subscriptions. A destination that answered gone is marked at its first
 * failure and carries no retry budget: it no longer exists, and insisting is
 * spending on nobody (07-write-path.md section 8.4). The actual delete belongs
 * to the notify job, which is why this returns the deletions as a value.
 */
export function planSendReactions(input: PlanSendReactionsInput): SendReactions {
  return {
    deletions: input.responses.filter(isGoneForGood).map((response) => response.endpoint_hash),
    events: [],
  };
}

/**
 * Plan, but do not execute, morning Web Push sends. `now`, the surface scores,
 * subscriptions, and run cap are all supplied by the caller so this decision
 * is deterministic and independent of process state.
 */
export function planNotifications(input: PlanNotificationsInput): NotificationPlan {
  const eligible = eligibleMorningNotifications(input);
  const cap = Math.max(0, input.run_cap);
  const notifications = eligible.slice(0, cap);
  const deferred = eligible.length - notifications.length;
  return {
    sends: notifications.map((notification) => notification.send),
    writes: notifications.map((notification) => notification.write),
    deferred,
    events: deferred === 0 ? [] : [{ kind: 'notification_run_cap_reached', deferred }],
  };
}
