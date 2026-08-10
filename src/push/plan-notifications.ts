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

export type NotificationPlan = {
  sends: PlannedSend[];
  deferred: number;
  events: { kind: string; deferred?: number }[];
};

export type PlanNotificationsInput = {
  now: string;
  spots: readonly PushSpot[];
  scores: Readonly<Record<string, number>>;
  subscriptions: readonly StoredSub[];
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

function isMorningAtSpot(now: string, spot: PushSpot): boolean {
  const hour = spotLocalHour(now, spot.timezone);
  return hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR;
}

function isAtOrAboveSubscriberBar(score: number | undefined, subscription: StoredSub): boolean {
  return score !== undefined && subscription.threshold_score !== null && score >= subscription.threshold_score;
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

function eligibleMorningSends(input: PlanNotificationsInput): PlannedSend[] {
  return input.spots.flatMap((spot) => {
    if (!isMorningAtSpot(input.now, spot)) return [];
    const score = input.scores[spot.spot_id];
    return input.subscriptions
      .filter((subscription) => subscription.spot_id === spot.spot_id)
      .filter((subscription) => isAtOrAboveSubscriberBar(score, subscription))
      .map((subscription) => composeSpanishMorningSend(spot, subscription, score!));
  });
}

/**
 * Plan, but do not execute, morning Web Push sends. `now`, the surface scores,
 * subscriptions, and run cap are all supplied by the caller so this decision
 * is deterministic and independent of process state.
 */
export function planNotifications(input: PlanNotificationsInput): NotificationPlan {
  const eligible = eligibleMorningSends(input);
  const cap = Math.max(0, input.run_cap);
  const sends = eligible.slice(0, cap);
  const deferred = eligible.length - sends.length;
  return {
    sends,
    deferred,
    events: deferred === 0 ? [] : [{ kind: 'notification_run_cap_reached', deferred }],
  };
}
