// AWS composition shell for the push Function URL. The core validates the
// browser request; this module only supplies DynamoDB, S3 and SSM ports.

import { createAwsPushStore, type DynamoPushCommandSet } from './aws-push-store';
import { createPushLambda, type PushLambda } from './local-lambda';
import { functionUrlResponse } from '../report/aws-lambda-adapter';

type Constructor = new (input?: Record<string, unknown>) => unknown;
type SdkModule = Record<string, Constructor | { from(client: unknown): { send(command: unknown): Promise<Record<string, unknown>> } }>;
type FunctionUrlEvent = Readonly<{
  readonly body?: string | null;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly rawPath?: string;
  readonly requestContext?: Readonly<{ readonly http?: Readonly<{ readonly method?: string }> }>;
}>;

const composition: Promise<PushLambda> = createComposition();
composition.catch(() => undefined);

export async function handler(event: FunctionUrlEvent) {
  const expectedPath = '/api/push';
  if (event.rawPath !== undefined && event.rawPath !== expectedPath && event.rawPath !== '/') {
    return functionUrlResponse(404, { error: { code: 'not_found', what: 'La ruta de avisos no existe.', why: 'Cada Function URL tiene una sola operación.', how: 'Usa la URL publicada por el sitio.' } });
  }
  const result = await (await composition).handle({
    method: event.requestContext?.http?.method ?? '',
    headers: event.headers ?? {},
    body: event.body ?? '',
  });
  return functionUrlResponse(result.statusCode, result.body);
}

async function createComposition(): Promise<PushLambda> {
  const [dynamo, document, s3, ssm] = await Promise.all([
    loadSdk('@aws-sdk/client-dynamodb'),
    loadSdk('@aws-sdk/lib-dynamodb'),
    loadSdk('@aws-sdk/client-s3'),
    loadSdk('@aws-sdk/client-ssm'),
  ]);
  const DynamoDBClient = constructor(dynamo, 'DynamoDBClient');
  const rawDynamoClient = new DynamoDBClient({});
  const DynamoDBDocumentClient = document.DynamoDBDocumentClient as { from(client: unknown): { send(command: unknown): Promise<Record<string, unknown>> } };
  const documentClient = DynamoDBDocumentClient.from(rawDynamoClient);
  const s3Client = new (s3.S3Client as Constructor)({});
  const ssmClient = new (ssm.SSMClient as Constructor)({});
  const DescribeTableCommand = constructor(dynamo, 'DescribeTableCommand');
  const GetParameterCommand = constructor(ssm, 'GetParameterCommand');
  const GetObjectCommand = constructor(s3, 'GetObjectCommand');

  const [parameter, spotObject, described] = await Promise.all([
    send(new GetParameterCommand({ Name: requiredEnvironment('CREDENTIAL_HMAC_PARAMETER'), WithDecryption: true }), ssmClient),
    // S3Store strips Build's local `pub/` root before upload; this direct S3
    // reader therefore needs the physical bucket key.
    send(new GetObjectCommand({ Bucket: requiredEnvironment('SITE_BUCKET'), Key: 'v1/meta/spot-index.json' }), s3Client),
    send(new DescribeTableCommand({ TableName: requiredEnvironment('WRITE_STORE_TABLE') }), rawDynamoClient),
  ]);
  requireProvisionedTable(described);
  const index = JSON.parse(await objectBody((spotObject as Record<string, unknown>).Body)) as { spots?: Record<string, unknown> };
  const commands: DynamoPushCommandSet = {
    GetCommand: constructor(document, 'GetCommand'),
    DeleteCommand: constructor(document, 'DeleteCommand'),
    TransactWriteCommand: constructor(document, 'TransactWriteCommand'),
  };
  return createPushLambda({
    store: createAwsPushStore(documentClient, commands, requiredEnvironment('WRITE_STORE_TABLE')),
    credentialSecret: readString((parameter as Record<string, unknown>).Parameter, 'Value'),
    knownSpotIds: Object.keys(index.spots ?? {}),
    allowlist: ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com', 'wns.windows.com'],
    clock: () => new Date(),
  });
}

async function loadSdk(name: string): Promise<SdkModule> {
  return import(name) as Promise<SdkModule>;
}

function constructor(module: SdkModule, name: string): Constructor {
  const value = module[name];
  if (typeof value !== 'function') throw new Error(`push Lambda refused: ${name} SDK constructor is unavailable`);
  return value as Constructor;
}

async function send(command: unknown, client: unknown): Promise<unknown> {
  return (client as { send(value: unknown): Promise<unknown> }).send(command);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`push Lambda refused: ${name} is unset`);
  return value;
}

function readString(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) throw new Error(`push Lambda refused: ${key} is absent`);
  const found = (value as Record<string, unknown>)[key];
  if (typeof found !== 'string' || found.length === 0) throw new Error(`push Lambda refused: ${key} is absent`);
  return found;
}

async function objectBody(body: unknown): Promise<string> {
  if (typeof body !== 'object' || body === null) throw new Error('push Lambda refused: S3 body is unavailable');
  if ('transformToByteArray' in body) {
    const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
    const contents = Buffer.from(bytes);
    if (contents[0] === 0x1f && contents[1] === 0x8b) return (await import('node:zlib')).gunzipSync(contents).toString('utf8');
    return contents.toString('utf8');
  }
  if ('transformToString' in body) return (body as { transformToString(): Promise<string> }).transformToString();
  throw new Error('push Lambda refused: S3 body is unavailable');
}

function requireProvisionedTable(described: unknown): void {
  const table = typeof described === 'object' && described !== null ? (described as Record<string, unknown>).Table : undefined;
  if (typeof table !== 'object' || table === null) throw new Error('push Lambda refused: write table does not exist');
  const details = table as Record<string, unknown>;
  const mode = details.BillingModeSummary as Record<string, unknown> | undefined;
  const throughput = details.ProvisionedThroughput as Record<string, unknown> | undefined;
  if (mode?.BillingMode === 'PAY_PER_REQUEST' || throughput === undefined) throw new Error('push Lambda refused: write table is not PROVISIONED');
}
