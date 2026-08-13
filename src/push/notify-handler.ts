// Scheduled send orchestration. Selection stays in plan-notifications; this
// shell makes the irreversible promise explicit: a dedup date changes only
// after the browser push service has accepted the encrypted delivery.

import type { StoredPushSubscription } from './local-lambda';
import { planNotifications, type NotificationWrite, type PlannedSend, type PushSpot } from './plan-notifications';
import type { WebPushSender } from './web-push-sender';

const DEFAULT_THRESHOLD_SCORE = 70;
const RUN_CAP = 10_000;
const SEND_CONCURRENCY = 50;
const GONE_STATUSES = new Set([403, 404, 410]);

export type NotifyStore = {
  list(spotId: string): Promise<readonly StoredPushSubscription[]>;
  stamp(write: NotificationWrite): Promise<void>;
  prune(spotId: string, endpointHash: string): Promise<void>;
};

export type NotifyHandler = {
  run(): Promise<{ readonly sent: number; readonly pruned: number; readonly deferred: number }>;
};

export function createNotifyHandler(dependencies: {
  readonly clock: () => Date;
  readonly spots: readonly PushSpot[];
  readonly scores: Readonly<Record<string, number>>;
  readonly store: NotifyStore;
  readonly sender: WebPushSender;
}): NotifyHandler {
  return {
    async run() {
      const subscriptions = (await Promise.all(dependencies.spots.map((spot) => dependencies.store.list(spot.spot_id)))).flat();
      const plan = planNotifications({
        now: dependencies.clock().toISOString(),
        spots: dependencies.spots,
        scores: dependencies.scores,
        subscriptions,
        default_threshold_score: DEFAULT_THRESHOLD_SCORE,
        run_cap: RUN_CAP,
      });
      const byDestination = new Map(subscriptions.map((subscription) => [destinationKey(subscription.spot_id, subscription.endpoint_hash), subscription]));
      const writes = new Map(plan.writes.map((write) => [destinationKey(write.spot_id, write.endpoint_hash), write]));
      const outcomes = await settleInBatches(plan.sends, SEND_CONCURRENCY, async (send) => {
        const subscription = byDestination.get(destinationKey(send.spot_id, send.endpoint_hash));
        if (subscription === undefined) return { status: 0, send };
        try {
          const response = await dependencies.sender.send(subscription, payload(send));
          return { status: response.status, send };
        } catch {
          return { status: 0, send };
        }
      });

      let sent = 0;
      let pruned = 0;
      await Promise.all(outcomes.map(async ({ status, send }) => {
        const key = destinationKey(send.spot_id, send.endpoint_hash);
        if (status >= 200 && status < 300) {
          const write = writes.get(key);
          if (write !== undefined) {
            await dependencies.store.stamp(write);
            sent += 1;
          }
        } else if (GONE_STATUSES.has(status)) {
          await dependencies.store.prune(send.spot_id, send.endpoint_hash);
          pruned += 1;
        }
      }));
      return { sent, pruned, deferred: plan.deferred };
    },
  };
}

function destinationKey(spotId: string, endpointHash: string): string {
  return `${spotId}:${endpointHash}`;
}

function payload(send: PlannedSend) {
  return {
    title: send.title,
    body: send.body,
    url: send.url,
    tag: send.tag,
    ttl_seconds: send.ttl_seconds,
  };
}

async function settleInBatches<T, R>(items: readonly T[], limit: number, operation: (item: T) => Promise<R>): Promise<R[]> {
  const values: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) values[index] = await operation(item);
    }
  });
  await Promise.all(workers);
  return values;
}
