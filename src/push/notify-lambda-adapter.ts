// AWS shell for the hourly, never-public notify job. It reads the published
// bundle once, queries only PUSH rows by spot, and delegates every selection
// and delivery-state decision to the narrow push ports.

import * as webPush from 'web-push';

import type { DynamoDocumentClient } from '../report/aws-write-store';
import { createNotifyHandler, type NotifyStore } from './notify-handler';
import type { StoredPushSubscription } from './local-lambda';
import type { PushSpot } from './plan-notifications';
import { createWebPushSender } from './web-push-sender';

type Constructor = new (input?: Record<string, unknown>) => unknown;
type SdkModule = Record<string, Constructor | { from(client: unknown): DynamoDocumentClient }>;
type Command = unknown;
type CommandConstructor = new (input: Record<string, unknown>) => Command;

const composition = createComposition();
composition.catch(() => undefined);

export async function handler(): Promise<void> {
  const result = await (await composition).run();
  console.log(JSON.stringify({ kind: 'push_notify_run', ...result }));
}

async function createComposition() {
  const [dynamo, document, s3, ssm] = await Promise.all([
    loadSdk('@aws-sdk/client-dynamodb'),
    loadSdk('@aws-sdk/lib-dynamodb'),
    loadSdk('@aws-sdk/client-s3'),
    loadSdk('@aws-sdk/client-ssm'),
  ]);
  const DynamoDBClient = constructor(dynamo, 'DynamoDBClient');
  const rawDynamo = new DynamoDBClient({});
  const DynamoDBDocumentClient = document.DynamoDBDocumentClient as { from(client: unknown): DynamoDocumentClient };
  const client = DynamoDBDocumentClient.from(rawDynamo);
  const s3Client = new (s3.S3Client as Constructor)({});
  const ssmClient = new (ssm.SSMClient as Constructor)({});
  const QueryCommand = constructor(document, 'QueryCommand');
  const UpdateCommand = constructor(document, 'UpdateCommand');
  const DeleteCommand = constructor(document, 'DeleteCommand');
  const GetParameterCommand = constructor(ssm, 'GetParameterCommand');
  const GetObjectCommand = constructor(s3, 'GetObjectCommand');

  const [keyParameter, bundleObject] = await Promise.all([
    send(new GetParameterCommand({ Name: requiredEnvironment('VAPID_PRIVATE_KEY_PARAMETER'), WithDecryption: true }), ssmClient),
    send(new GetObjectCommand({ Bucket: requiredEnvironment('SITE_BUCKET'), Key: 'pub/v1/regions/pa-pacific/bundle.json' }), s3Client),
  ]);
  const spots = parseSpots(requiredEnvironment('PUSH_SPOTS_JSON'));
  const scores = parseScores(await objectBody((bundleObject as Record<string, unknown>).Body));
  const commands = { QueryCommand, UpdateCommand, DeleteCommand };
  return createNotifyHandler({
    clock: () => new Date(),
    spots,
    scores,
    store: createAwsNotifyStore(client, commands, requiredEnvironment('WRITE_STORE_TABLE')),
    sender: createWebPushSender(webPush, {
      subject: requiredEnvironment('PUBLIC_SITE_ORIGIN'),
      publicKey: requiredEnvironment('VAPID_PUBLIC_KEY'),
      privateKey: readString((keyParameter as Record<string, unknown>).Parameter, 'Value'),
    }),
  });
}

function createAwsNotifyStore(
  client: DynamoDocumentClient,
  commands: { readonly QueryCommand: CommandConstructor; readonly UpdateCommand: CommandConstructor; readonly DeleteCommand: CommandConstructor },
  tableName: string,
): NotifyStore {
  return {
    async list(spotId) {
      const items: StoredPushSubscription[] = [];
      let cursor: Record<string, unknown> | undefined;
      do {
        const page = await client.send(new commands.QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': `SPOT#${spotId}`, ':prefix': 'PUSH#' },
          ...(cursor === undefined ? {} : { ExclusiveStartKey: cursor }),
        }));
        for (const item of Array.isArray(page.Items) ? page.Items : []) {
          const subscription = asStoredSubscription(item);
          if (subscription !== null) items.push(subscription);
        }
        cursor = isRecord(page.LastEvaluatedKey) ? page.LastEvaluatedKey : undefined;
      } while (cursor !== undefined);
      return items;
    },
    async stamp(write) {
      const field = 'last_notified_date' in write ? 'last_notified_date' : 'followup_date';
      const value = 'last_notified_date' in write ? write.last_notified_date : write.followup_date;
      await client.send(new commands.UpdateCommand({
        TableName: tableName,
        Key: pushKey(write.spot_id, write.endpoint_hash),
        UpdateExpression: `SET ${field} = :date`,
        ExpressionAttributeValues: { ':date': value },
      }));
    },
    async prune(spotId, endpointHash) {
      await client.send(new commands.DeleteCommand({ TableName: tableName, Key: pushKey(spotId, endpointHash) }));
    },
  };
}

function parseSpots(value: string): PushSpot[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('notify Lambda refused: PUSH_SPOTS_JSON is not an array');
  return parsed.map((candidate) => {
    if (!isRecord(candidate) || !isText(candidate.spot_id) || !isText(candidate.slug) || !isText(candidate.name) || !isText(candidate.timezone)) {
      throw new Error('notify Lambda refused: PUSH_SPOTS_JSON has an invalid spot');
    }
    return { spot_id: candidate.spot_id, slug: candidate.slug, name: candidate.name, timezone: candidate.timezone };
  });
}

function parseScores(body: string): Record<string, number> {
  const parsed: unknown = JSON.parse(body);
  if (!isRecord(parsed) || !Array.isArray(parsed.days) || !isRecord(parsed.days[0]) || !Array.isArray(parsed.days[0].spots)) {
    throw new Error('notify Lambda refused: current bundle has no first ranked day');
  }
  const scores: Record<string, number> = {};
  for (const item of parsed.days[0].spots) {
    if (isRecord(item) && isText(item.spot_id) && typeof item.score_q === 'number' && Number.isInteger(item.score_q) && item.score_q >= 0 && item.score_q <= 100) {
      scores[item.spot_id] = item.score_q;
    }
  }
  return scores;
}

function asStoredSubscription(value: unknown): StoredPushSubscription | null {
  if (!isRecord(value)
    || !isText(value.spot_id) || !isText(value.endpoint_hash) || !isText(value.endpoint)
    || !isText(value.p256dh) || !isText(value.auth) || !isText(value.lang) || !isText(value.device_id)
    || !(typeof value.threshold_score === 'number' || value.threshold_score === null)
    || !(typeof value.last_notified_date === 'string' || value.last_notified_date === null)
    || !(typeof value.followup_date === 'string' || value.followup_date === null)) return null;
  return {
    spot_id: value.spot_id, endpoint_hash: value.endpoint_hash, endpoint: value.endpoint,
    p256dh: value.p256dh, auth: value.auth, lang: value.lang, threshold_score: value.threshold_score,
    last_notified_date: value.last_notified_date, followup_date: value.followup_date, device_id: value.device_id,
  };
}

function pushKey(spotId: string, endpointHash: string) {
  return { pk: `SPOT#${spotId}`, sk: `PUSH#${endpointHash}` };
}

async function loadSdk(name: string): Promise<SdkModule> { return import(name) as Promise<SdkModule>; }
function constructor(module: SdkModule, name: string): Constructor {
  const value = module[name];
  if (typeof value !== 'function') throw new Error(`notify Lambda refused: ${name} SDK constructor is unavailable`);
  return value as Constructor;
}
async function send(command: unknown, client: unknown): Promise<unknown> { return (client as { send(value: unknown): Promise<unknown> }).send(command); }
function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`notify Lambda refused: ${name} is unset`);
  return value;
}
function readString(value: unknown, key: string): string {
  if (!isRecord(value) || !isText(value[key])) throw new Error(`notify Lambda refused: ${key} is absent`);
  return value[key];
}
async function objectBody(body: unknown): Promise<string> {
  if (!isRecord(body)) throw new Error('notify Lambda refused: S3 body is unavailable');
  if ('transformToByteArray' in body && typeof body.transformToByteArray === 'function') {
    const contents = Buffer.from(await (body.transformToByteArray as () => Promise<Uint8Array>)());
    if (contents[0] === 0x1f && contents[1] === 0x8b) return (await import('node:zlib')).gunzipSync(contents).toString('utf8');
    return contents.toString('utf8');
  }
  if ('transformToString' in body && typeof body.transformToString === 'function') return body.transformToString() as Promise<string>;
  throw new Error('notify Lambda refused: S3 body is unavailable');
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isText(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
