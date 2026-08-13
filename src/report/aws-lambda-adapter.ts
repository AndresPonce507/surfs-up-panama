// Imperative shell for the two deployed write Function URLs.  This is built
// into infra/lambda-src/report-mint.mjs; the decision and validation logic
// remains in createWriteLambda and stays AWS-free.

import { createAwsWriteStore, type DynamoCommandSet, type DynamoDocumentClient } from './aws-write-store';
import { resolveReportReveal, type SpotIndexEntry } from './call-log-reader';
import { createWriteLambda, type LocalWriteLambda } from './local-lambda';

type Constructor = new (input?: Record<string, unknown>) => unknown;
type SdkModule = Record<string, Constructor | { from(client: unknown): DynamoDocumentClient }>;
type FunctionUrlEvent = Readonly<{
  readonly body?: string | null;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly rawPath?: string;
  readonly requestContext?: Readonly<{ readonly http?: Readonly<{ readonly method?: string; readonly sourceIp?: string }> }>;
}>;

// Composition starts at module load, not first request. The Lambda init
// phase runs with full-vCPU boost and its own 10s budget regardless of the
// 128 MB memory guardrail, while in-handler cold composition (four SDK
// imports plus SSM + DynamoDB round trips) on 128 MB's fractional vCPU
// could not fit inside the 5 s guardrail timeout: every cold mint/report
// died as a silent Status: timeout. Both guardrails stay as declared.
const composition: Promise<LocalWriteLambda> = createComposition();
// Swallow only the UNHANDLED-rejection signal: if composition fails before
// the first request, the handler's own await below still receives and
// reports the real error per-request instead of the runtime crashing.
composition.catch(() => undefined);

export async function handler(event: FunctionUrlEvent) {
  const writeLambda = composition;
  const expectedPath = requiredEnvironment('WRITE_PATH');
  if (event.rawPath !== undefined && event.rawPath !== expectedPath && event.rawPath !== '/') {
    return functionUrlResponse(404, { error: { code: 'not_found', what: 'La ruta de escritura no existe.', why: 'Cada Function URL tiene una sola operación.', how: 'Usa la URL publicada por el sitio.' } });
  }
  const result = await (await writeLambda).handle({
    path: expectedPath as '/api/mint' | '/api/report',
    method: event.requestContext?.http?.method ?? '',
    headers: event.headers ?? {},
    body: event.body ?? '',
    sourceIp: event.requestContext?.http?.sourceIp ?? '',
  });
  return functionUrlResponse(result.statusCode, result.body, result.headers);
}

async function createComposition(): Promise<LocalWriteLambda> {
  const [dynamo, document, s3, ssm] = await Promise.all([
    loadSdk('@aws-sdk/client-dynamodb'),
    loadSdk('@aws-sdk/lib-dynamodb'),
    loadSdk('@aws-sdk/client-s3'),
    loadSdk('@aws-sdk/client-ssm'),
  ]);
  const DynamoDBClient = constructor(dynamo, 'DynamoDBClient');
  const rawDynamoClient = new DynamoDBClient({});
  const DynamoDBDocumentClient = document.DynamoDBDocumentClient as { from(client: unknown): DynamoDocumentClient };
  const documentClient = DynamoDBDocumentClient.from(rawDynamoClient);
  const DescribeTableCommand = constructor(dynamo, 'DescribeTableCommand');
  const GetParameterCommand = constructor(ssm, 'GetParameterCommand');
  const GetObjectCommand = constructor(s3, 'GetObjectCommand');
  const s3Client = new (s3.S3Client as Constructor)({});
  const parameterRequest = send(
    new (GetParameterCommand as Constructor)({ Name: requiredEnvironment('CREDENTIAL_HMAC_PARAMETER'), WithDecryption: true }),
    new (ssm.SSMClient as Constructor)({}),
  );
  // Build calls this its local `pub/` artifact, but S3Store strips that local
  // root before upload. Function URLs speak to S3 directly, so they must use
  // the physical bucket key rather than the pipeline-local path.
  const spotRequest = requiredEnvironment('WRITE_PATH') === '/api/report'
    ? send(new (GetObjectCommand as Constructor)({ Bucket: requiredEnvironment('SITE_BUCKET'), Key: 'v1/meta/spot-index.json' }), s3Client)
    : Promise.resolve(undefined);
  const tableProbe = send(new DescribeTableCommand({ TableName: requiredEnvironment('WRITE_STORE_TABLE') }), rawDynamoClient);
  const [parameter, spotObject, described] = await Promise.all([parameterRequest, spotRequest, tableProbe]);
  requireProvisionedTable(described);
  const secret = readString((parameter as Record<string, unknown>).Parameter, 'Value');
  const index = spotObject === undefined
    ? { spots: {} }
    : JSON.parse(await objectBody((spotObject as Record<string, unknown>).Body)) as { spots?: Record<string, SpotIndexEntry> };
  const knownSpotIds = Object.keys(index.spots ?? {});
  const commands: DynamoCommandSet = {
    GetCommand: constructor(document, 'GetCommand'),
    PutCommand: constructor(document, 'PutCommand'),
    TransactWriteCommand: constructor(document, 'TransactWriteCommand'),
  };
  const callCache = new Map<string, string | null>();
  return createWriteLambda({
    store: createAwsWriteStore(documentClient, commands, requiredEnvironment('WRITE_STORE_TABLE')),
    credentialSecret: secret,
    knownSpotIds,
    clock: () => new Date(),
    resolveReveal: (record) => resolveReportReveal(record, index.spots ?? {}, {
      async get(key) {
        const cached = callCache.get(key);
        if (cached !== undefined) return cached;
        try {
          const object = await send(new (GetObjectCommand as Constructor)({ Bucket: requiredEnvironment('SITE_BUCKET'), Key: key }), s3Client);
          const body = await objectBody((object as Record<string, unknown>).Body);
          callCache.set(key, body);
          return body;
        } catch {
          callCache.set(key, null);
          return null;
        }
      },
    }),
  });
}

async function loadSdk(name: string): Promise<SdkModule> {
  return import(name) as Promise<SdkModule>;
}

function constructor(module: SdkModule, name: string): Constructor {
  const value = module[name];
  if (typeof value !== 'function') throw new Error(`report write Lambda refused: ${name} SDK constructor is unavailable`);
  return value as Constructor;
}

async function send(command: unknown, client: unknown): Promise<unknown> {
  return (client as { send(value: unknown): Promise<unknown> }).send(command);
}

function readString(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) throw new Error(`report write Lambda refused: ${key} is absent`);
  const found = (value as Record<string, unknown>)[key];
  if (typeof found !== 'string' || found.length === 0) throw new Error(`report write Lambda refused: ${key} is absent`);
  return found;
}

async function objectBody(body: unknown): Promise<string> {
  if (typeof body !== 'object' || body === null) throw new Error('report write Lambda refused: S3 body is unavailable');
  if ('transformToByteArray' in body) {
    const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
    const contents = Buffer.from(bytes);
    if (contents[0] === 0x1f && contents[1] === 0x8b) return (await import('node:zlib')).gunzipSync(contents).toString('utf8');
    return contents.toString('utf8');
  }
  if ('transformToString' in body) return (body as { transformToString(): Promise<string> }).transformToString();
  throw new Error('report write Lambda refused: S3 body is unavailable');
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`report write Lambda refused: ${name} is unset`);
  return value;
}

function requireProvisionedTable(described: unknown): void {
  const table = typeof described === 'object' && described !== null ? (described as Record<string, unknown>).Table : undefined;
  if (typeof table !== 'object' || table === null) throw new Error('report write Lambda refused: write table does not exist');
  const details = table as Record<string, unknown>;
  const mode = details.BillingModeSummary as Record<string, unknown> | undefined;
  const throughput = details.ProvisionedThroughput as Record<string, unknown> | undefined;
  if (mode?.BillingMode === 'PAY_PER_REQUEST' || throughput === undefined) throw new Error('report write Lambda refused: write table is not PROVISIONED');
}

export function functionUrlResponse(
  statusCode: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): { readonly statusCode: number; readonly headers: Readonly<Record<string, string>>; readonly body: string } {
  const headersWithoutCacheControl = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'cache-control'),
  );
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headersWithoutCacheControl, 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}
