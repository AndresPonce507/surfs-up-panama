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
  /** The morning send omits this legacy discriminator. Slice-03 names its
   *  distinct report-solicitation contract so delivery can route its deep
   *  link without guessing from copy. */
  kind?: 'followup';
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
const FOLLOWUP_START_HOUR = 14;
const FOLLOWUP_END_HOUR = 17;
const FOLLOWUP_TITLE_ES = '¿Cómo estuvo?';

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

function isAfternoonAtSpot(now: string, spot: PushSpot): boolean {
  const hour = spotLocalHour(now, spot.timezone);
  return hour >= FOLLOWUP_START_HOUR && hour < FOLLOWUP_END_HOUR;
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

function composeSpanishFollowupSend(spot: PushSpot, subscription: StoredSub): PlannedSend {
  return {
    spot_id: spot.spot_id,
    endpoint_hash: subscription.endpoint_hash,
    lang: subscription.lang,
    title: FOLLOWUP_TITLE_ES,
    body: FOLLOWUP_TITLE_ES,
    url: `/spots/${spot.slug}/reportar?t=ps`,
    tag: spot.spot_id,
    ttl_seconds: FOUR_HOURS_IN_SECONDS,
    kind: 'followup',
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

/**
 * Follow-ups deliberately read only the fact of today's successful morning
 * notice and a prior follow-up. The current score and call are not inputs to
 * eligibility: changing conditions after the morning must not reintroduce
 * selection bias by cancelling the question.
 */
function eligibleAfternoonFollowups(input: PlanNotificationsInput): PlannedSend[] {
  return input.spots.flatMap((spot) => {
    if (!isAfternoonAtSpot(input.now, spot)) return [];
    const date = spotLocalDate(input.now, spot.timezone);
    return input.subscriptions
      .filter((subscription) => subscription.spot_id === spot.spot_id)
      .filter((subscription) => subscription.last_notified_date === date)
      .filter((subscription) => subscription.followup_date === null || subscription.followup_date < date)
      .map((subscription) => composeSpanishFollowupSend(spot, subscription));
  });
}

/**
 * The push service's answer to one planned send, as the scheduled adapter
 * observed it. Only the status is read here: a body tells this decision
 * nothing a status code does not already say.
 */
export type SendResponse = {
  endpoint_hash: string;
  status: number;
};

/** One pruned destination, named. A deletion with no witness is a subscriber
 *  lost with nobody to notice, which is the silent failure this project's
 *  loud-skip discipline exists to refuse (07-write-path.md §8.4). */
export type PruneEvent = {
  kind: 'push_subscription_pruned';
  endpoint_hash: string;
  status: number;
};

export type SendReactions = {
  deletions: string[];
  events: PruneEvent[];
};

export type PlanSendReactionsInput = {
  sends: readonly Pick<PlannedSend, 'endpoint_hash'>[];
  responses: readonly SendResponse[];
};

/**
 * The three definitive rejections (07-write-path.md §8.4,
 * adr-push-vapid-direct.md decision 4). Everything outside this set —
 * 2xx acks, 429 throttles, 5xx transients — leaves the subscription alone.
 * The partition is the rule: widening it to "every failure" would delete live
 * subscribers on a bad afternoon at the push service.
 */
const GONE_STATUSES: readonly number[] = [404, 410, 403];

function isGone(status: number): boolean {
  return GONE_STATUSES.includes(status);
}

/**
 * React to what the push service answered, without executing anything. Returns
 * the deletions the scheduled adapter should perform and a loud witness for
 * each one. Pruning is first-failure with no retry budget: a destination that
 * answers 404, 410 or 403 no longer exists, and retrying it spends egress on
 * nobody.
 *
 * A response naming a destination this run never sent to is evidence about
 * nothing, so it prunes nothing — deleting on it would destroy a live
 * subscription on a mismatched or replayed answer.
 */
export function planSendReactions(input: PlanSendReactionsInput): SendReactions {
  const sentHashes = new Set(input.sends.map((send) => send.endpoint_hash));
  const pruned = input.responses
    .filter((response) => sentHashes.has(response.endpoint_hash))
    .filter((response) => isGone(response.status));
  return {
    deletions: pruned.map((response) => response.endpoint_hash),
    events: pruned.map((response) => ({
      kind: 'push_subscription_pruned',
      endpoint_hash: response.endpoint_hash,
      status: response.status,
    })),
  };
}

/**
 * Plan, but do not execute, morning Web Push sends. `now`, the surface scores,
 * subscriptions, and run cap are all supplied by the caller so this decision
 * is deterministic and independent of process state.
 */
export function planNotifications(input: PlanNotificationsInput): NotificationPlan {
  const morning = eligibleMorningNotifications(input);
  const followups = eligibleAfternoonFollowups(input);
  const eligible = [...morning, ...followups];
  const cap = Math.max(0, input.run_cap);
  const notifications = eligible.slice(0, cap);
  const deferred = eligible.length - notifications.length;
  return {
    sends: notifications.map((notification) => 'send' in notification ? notification.send : notification),
    // Slice-03 only plans its delivery. The real send adapter still owns the
    // successful-delivery followup_date write, which is deploy/VAPID-gated.
    writes: notifications
      .filter((notification): notification is PlannedNotification => 'write' in notification)
      .map((notification) => notification.write),
    deferred,
    events: deferred === 0 ? [] : [{ kind: 'notification_run_cap_reached', deferred }],
  };
}
