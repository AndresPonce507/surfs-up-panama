// DynamoDB shell for the narrow PushStore port. It can alter only a
// device-day quota and its matching SPOT#/PUSH# subscription row.

import type { DynamoDocumentClient } from '../report/aws-write-store';
import type { PushStore, StoredPushSubscription } from './local-lambda';

type Command = unknown;
type CommandConstructor = new (input: Record<string, unknown>) => Command;

export type DynamoPushCommandSet = {
  readonly GetCommand: CommandConstructor;
  readonly DeleteCommand: CommandConstructor;
  readonly TransactWriteCommand: CommandConstructor;
};

const DAILY_PUSH_WRITE_LIMIT = 20;
const QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60;

export function createAwsPushStore(
  client: DynamoDocumentClient,
  commands: DynamoPushCommandSet,
  tableName: string,
): PushStore {
  return {
    async subscribe(subscription, receivedDay) {
      try {
        await client.send(new commands.TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: quotaKey(subscription.device_id, receivedDay),
                UpdateExpression: 'ADD push_writes :one SET #ttl = :ttl',
                ConditionExpression: 'attribute_not_exists(push_writes) OR push_writes < :limit',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: {
                  ':one': 1,
                  ':limit': DAILY_PUSH_WRITE_LIMIT,
                  ':ttl': Math.floor(Date.parse(`${receivedDay}T00:00:00.000Z`) / 1000) + QUOTA_TTL_SECONDS,
                },
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: pushKey(subscription.spot_id, subscription.endpoint_hash),
                UpdateExpression: [
                  'SET endpoint = :endpoint',
                  'p256dh = :p256dh',
                  'auth = :auth',
                  'lang = :lang',
                  'threshold_score = :threshold',
                  'device_id = :device',
                  'last_notified_date = if_not_exists(last_notified_date, :empty)',
                  'followup_date = if_not_exists(followup_date, :empty)',
                ].join(', '),
                ConditionExpression: 'attribute_not_exists(device_id) OR device_id = :device',
                ExpressionAttributeValues: {
                  ':endpoint': subscription.endpoint,
                  ':p256dh': subscription.p256dh,
                  ':auth': subscription.auth,
                  ':lang': subscription.lang,
                  ':threshold': subscription.threshold_score,
                  ':device': subscription.device_id,
                  ':empty': null,
                },
              },
            },
          ],
        }));
        return 'stored';
      } catch (error) {
        if (!isTransactionCancelled(error)) throw error;
        if (cancellationAt(error, 0)) return 'quota_exceeded';
        if (cancellationAt(error, 1)) return 'ownership_conflict';
        throw error;
      }
    },

    async unsubscribe(spotId, endpointHash, deviceId) {
      try {
        await client.send(new commands.DeleteCommand({
          TableName: tableName,
          Key: pushKey(spotId, endpointHash),
          ConditionExpression: 'device_id = :device',
          ExpressionAttributeValues: { ':device': deviceId },
        }));
      } catch (error) {
        // Unsubscribe is deliberately idempotent. An absent row and a row
        // owned by another device reveal neither fact to the caller.
        if (!isConditionalFailure(error)) throw error;
      }
    },

    async read(spotId, endpointHash, deviceId) {
      const result = await client.send(new commands.GetCommand({
        TableName: tableName,
        Key: pushKey(spotId, endpointHash),
        ConsistentRead: true,
      }));
      const item = result.Item;
      if (!isStoredSubscription(item) || item.device_id !== deviceId) return null;
      return {
        spot_id: item.spot_id,
        endpoint_hash: item.endpoint_hash,
        endpoint: item.endpoint,
        p256dh: item.p256dh,
        auth: item.auth,
        lang: item.lang,
        threshold_score: item.threshold_score,
        last_notified_date: item.last_notified_date,
        followup_date: item.followup_date,
        device_id: item.device_id,
      };
    },
  };
}

function quotaKey(deviceId: string, day: string) {
  return { pk: `DEV#${deviceId}`, sk: `QUOTA#${day}` };
}

function pushKey(spotId: string, endpointHash: string) {
  return { pk: `SPOT#${spotId}`, sk: `PUSH#${endpointHash}` };
}

function isTransactionCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TransactionCanceledException';
}

function isConditionalFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'ConditionalCheckFailedException';
}

function cancellationAt(error: unknown, index: number): boolean {
  const reasons = typeof error === 'object' && error !== null ? (error as { CancellationReasons?: unknown }).CancellationReasons : undefined;
  const reason = Array.isArray(reasons) ? reasons[index] : undefined;
  return typeof reason === 'object' && reason !== null && (reason as { Code?: unknown }).Code === 'ConditionalCheckFailed';
}

function isStoredSubscription(value: unknown): value is StoredPushSubscription {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.spot_id === 'string'
    && typeof item.endpoint_hash === 'string'
    && typeof item.endpoint === 'string'
    && typeof item.p256dh === 'string'
    && typeof item.auth === 'string'
    && typeof item.lang === 'string'
    && (typeof item.threshold_score === 'number' || item.threshold_score === null)
    && (typeof item.last_notified_date === 'string' || item.last_notified_date === null)
    && (typeof item.followup_date === 'string' || item.followup_date === null)
    && typeof item.device_id === 'string';
}
