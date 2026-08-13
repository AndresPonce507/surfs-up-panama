import { describe, expect, it } from 'vitest';

import { createAwsPushStore } from '../../src/push/aws-push-store';
import type { DynamoDocumentClient } from '../../src/report/aws-write-store';

class GetCommand { constructor(readonly input: Record<string, unknown>) {} }
class DeleteCommand { constructor(readonly input: Record<string, unknown>) {} }
class TransactWriteCommand { constructor(readonly input: Record<string, unknown>) {} }

const commands = { GetCommand, DeleteCommand, TransactWriteCommand };
const subscription = {
  spot_id: 'playa-venao',
  endpoint_hash: 'a'.repeat(32),
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  p256dh: 'B'.repeat(87),
  auth: 'A'.repeat(22),
  lang: 'es',
  threshold_score: 70,
  last_notified_date: null,
  followup_date: null,
  device_id: 'd_0123456789abcdef0123456789abcdef',
};

describe('DynamoDB push-store adapter', () => {
  it('atomically consumes the daily write quota and owns only the PUSH row', async () => {
    const received: unknown[] = [];
    const client: DynamoDocumentClient = { async send(command) { received.push(command); return {}; } };
    const store = createAwsPushStore(client, commands, 'surfs-up-panama-write-store');

    await expect(store.subscribe(subscription, '2026-08-13')).resolves.toBe('stored');

    const [transaction] = received as [TransactWriteCommand];
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems).toEqual([
      expect.objectContaining({
        Update: expect.objectContaining({
          Key: { pk: 'DEV#d_0123456789abcdef0123456789abcdef', sk: 'QUOTA#2026-08-13' },
          ConditionExpression: 'attribute_not_exists(push_writes) OR push_writes < :limit',
          ExpressionAttributeValues: expect.objectContaining({ ':limit': 20 }),
        }),
      }),
      expect.objectContaining({
        Update: expect.objectContaining({
          Key: { pk: 'SPOT#playa-venao', sk: `PUSH#${subscription.endpoint_hash}` },
          ConditionExpression: 'attribute_not_exists(device_id) OR device_id = :device',
        }),
      }),
    ]);
  });

  it('only returns a stored subscription to the same credential-derived device', async () => {
    const client: DynamoDocumentClient = {
      async send(command) {
        if (command instanceof GetCommand) return { Item: { pk: 'SPOT#playa-venao', sk: `PUSH#${subscription.endpoint_hash}`, ...subscription } };
        return {};
      },
    };
    const store = createAwsPushStore(client, commands, 'write-store');

    await expect(store.read(subscription.spot_id, subscription.endpoint_hash, subscription.device_id)).resolves.toEqual(subscription);
    await expect(store.read(subscription.spot_id, subscription.endpoint_hash, 'd_ffffffffffffffffffffffffffffffff')).resolves.toBeNull();
  });
});
