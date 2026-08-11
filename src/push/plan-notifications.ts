import type { StoredSub } from './types';

type Spot = {
  spot_id: string;
  slug: string;
  name: string;
  timezone: string;
};

type PlannedSend = {
  spot_id: string;
  endpoint_hash: string;
  lang: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl_seconds: number;
  kind?: 'followup';
};

export type NotifyPlan = {
  sends: PlannedSend[];
  deferred: number;
  events: { kind: string; deferred?: number }[];
};

export type PlanNotificationsInput = {
  now: string;
  spots: readonly Spot[];
  scores: Readonly<Record<string, number>>;
  subscriptions: readonly StoredSub[];
  run_cap: number;
};

type SpotLocalTime = { date: string; hour: number };

const FOLLOWUP_TITLE = '¿Cómo estuvo?';
const FOLLOWUP_START_HOUR = 14;
const FOLLOWUP_END_HOUR = 17;

function spotLocalTime(now: string, timezone: string): SpotLocalTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) };
}

function isAfternoon(hour: number): boolean {
  return hour >= FOLLOWUP_START_HOUR && hour < FOLLOWUP_END_HOUR;
}

function isEligibleForFollowup(subscription: StoredSub, date: string): boolean {
  return subscription.last_notified_date === date &&
    (subscription.followup_date === null || subscription.followup_date < date);
}

function planFollowup(spot: Spot, subscription: StoredSub): PlannedSend {
  return {
    spot_id: spot.spot_id,
    endpoint_hash: subscription.endpoint_hash,
    lang: subscription.lang,
    title: FOLLOWUP_TITLE,
    body: FOLLOWUP_TITLE,
    url: `/spots/${spot.slug}/reportar?t=ps`,
    tag: spot.spot_id,
    ttl_seconds: 14_400,
    kind: 'followup',
  };
}

/**
 * Pure notify planning port. This slice only plans the afternoon follow-up;
 * it neither sends a notification nor mutates subscription state.
 */
export function planNotifications(input: PlanNotificationsInput): NotifyPlan {
  const sends = input.spots.flatMap((spot) => {
    const local = spotLocalTime(input.now, spot.timezone);
    if (!isAfternoon(local.hour)) return [];
    return input.subscriptions
      .filter((subscription) => subscription.spot_id === spot.spot_id)
      .filter((subscription) => isEligibleForFollowup(subscription, local.date))
      .map((subscription) => planFollowup(spot, subscription));
  });
  return { sends, deferred: 0, events: [] };
}
