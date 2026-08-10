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

export type PushResponse = {
  endpoint_hash: string;
  status: number;
};

export type SendReactionPlan = {
  deletions: string[];
  events: { kind: string; endpoint_hash: string; status: number }[];
};

export type PlanSendReactionsInput = {
  sends: readonly PlannedSend[];
  responses: readonly PushResponse[];
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

type SpotLocalTime = { date: string; hour: number };

function spotLocalTime(now: string, timezone: string): SpotLocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const part = (kind: 'year' | 'month' | 'day' | 'hour'): string => parts.find((candidate) => candidate.type === kind)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
  };
}

/**
 * The subscription date is a civil date at its spot, never a UTC or server
 * date. Exporting this keeps the scheduled send and its later follow-up on
 * the same date convention.
 */
export function spotLocalDate(now: string, timezone: string): string {
  return spotLocalTime(now, timezone).date;
}

function isMorningHour(hour: number): boolean {
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
    const localTime = spotLocalTime(input.now, spot.timezone);
    if (!isMorningHour(localTime.hour)) return [];
    const score = input.scores[spot.spot_id];
    return input.subscriptions
      .filter((subscription) => subscription.spot_id === spot.spot_id)
      .filter((subscription) => isAtOrAboveSubscriberBar(score, subscription, input.default_threshold_score))
      .filter((subscription) => hasNotBeenNotifiedForSpotDate(subscription, localTime.date))
      .map((subscription) => ({
        send: composeSpanishMorningSend(spot, subscription, score!),
        write: {
          spot_id: spot.spot_id,
          endpoint_hash: subscription.endpoint_hash,
          last_notified_date: localTime.date,
        },
      }));
  });
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

const GONE_PUSH_STATUSES = new Set([403, 404, 410]);

function firstResponseForEndpoint(responses: readonly PushResponse[], endpointHash: string): PushResponse | undefined {
  return responses.find((response) => response.endpoint_hash === endpointHash);
}

function goneEndpointHashes(input: PlanSendReactionsInput): string[] {
  const plannedEndpoints = new Set(input.sends.map((send) => send.endpoint_hash));
  return [...plannedEndpoints].filter((endpointHash) => {
    const response = firstResponseForEndpoint(input.responses, endpointHash);
    return response !== undefined && GONE_PUSH_STATUSES.has(response.status);
  });
}

/**
 * React to completed Web Push attempts without performing I/O. A gone endpoint
 * is declared for deletion after its first response; retries and deletes stay
 * exclusively at the adapter boundary.
 */
export function planSendReactions(input: PlanSendReactionsInput): SendReactionPlan {
  const deletions = goneEndpointHashes(input);
  return {
    deletions,
    events: deletions.map((endpointHash) => {
      const response = firstResponseForEndpoint(input.responses, endpointHash)!;
      return { kind: 'push_subscription_prune_planned', endpoint_hash: endpointHash, status: response.status };
    }),
  };
}
