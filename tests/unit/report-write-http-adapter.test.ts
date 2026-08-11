// The deployed Function URL boundary is HTTP.  This proves the compiled
// report/mint core through that boundary against the real on-disk store and
// the actual launch spot-index source, without AWS credentials or a deploy.

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, it } from 'vitest';

import { loadLaunchSpotSeeds } from '../../src/data/launch-spots';
import { loadLaunchSpotCoordinates } from '../../src/pipeline/adapters/spot-coordinates';
import { serializeSpotIndex } from '../../src/pipeline/static-publication';
import { createLocalWriteLambda, type LocalWriteLambda } from '../../src/report/local-lambda';

const SECRET = 'http-adapter-test-credential-secret-long-enough';
const SERVER_NOW = new Date('2026-08-10T18:30:00.000Z');
const DEVICE = 'd_0123456789abcdef0123456789abcdef';

let storeRoot: string | undefined;
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    if (server === undefined) return resolve();
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  server = undefined;
  if (storeRoot !== undefined) await rm(storeRoot, { recursive: true, force: true });
  storeRoot = undefined;
});

describe('report/mint packaged core over an HTTP-shaped adapter', () => {
  it('mints and stores one report using the real durable store and launch spot index', async () => {
    storeRoot = await mkdtemp(join(tmpdir(), 'surfs-up-http-write-'));
    const index = JSON.parse(serializeSpotIndex(loadLaunchSpotSeeds(), loadLaunchSpotCoordinates())) as {
      readonly schema: string;
      readonly spots: Readonly<Record<string, unknown>>;
    };
    const [spotId] = Object.keys(index.spots);
    assert.equal(index.schema, 'spot-index/1');
    assert.equal(Object.keys(index.spots).length, 20, 'the adapter must use the real 20-spot launch index');
    assert.ok(spotId !== undefined);

    const lambda = createLocalWriteLambda({
      storeRoot,
      credentialSecret: SECRET,
      knownSpotIds: Object.keys(index.spots),
      clock: () => SERVER_NOW,
    });
    const baseUrl = await listen(lambda);

    const mint = await fetch(`${baseUrl}/api/mint`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: DEVICE }),
    });
    assert.equal(mint.status, 200);
    const credential = (await mint.json() as { readonly credential: string }).credential;

    const payload = JSON.stringify({
      report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN', spot_id: spotId,
      observed_at: '2026-08-10T18:30:00Z', submitted_at: '2026-08-10T18:30:00Z',
      size_band: 'waist_chest', size_band_schema: 1, wind: 'choppy', quality: 'good',
      trigger: 'organic', photo_ids: [],
    });
    const saved = await postReport(baseUrl, payload, credential);
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), {
      outcome: 'no_snapshot', report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN', predicted: null,
      counter: { n_reports: 1, threshold: 30 },
    });

    const retry = await postReport(baseUrl, payload, credential);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { readonly outcome: string }).outcome, 'queued_duplicate');
    const stored = await readFile(join(storeRoot, 'reports', '01J4QZK8Y3E9RWM2P7T6B1XCVN.json'), 'utf8');
    assert.match(stored, new RegExp(`\\"spot_id\\":\\"${spotId}\\"`));
  });
});

async function listen(lambda: LocalWriteLambda): Promise<string> {
  server = createServer(async (request, response) => {
    const body = await readBody(request);
    const result = await lambda.handle({
      path: request.url === '/api/mint' ? '/api/mint' : '/api/report',
      method: request.method ?? 'GET',
      headers: Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value])),
      body,
      sourceIp: request.socket.remoteAddress ?? '127.0.0.1',
    });
    response.writeHead(result.statusCode, { 'content-type': 'application/json', ...result.headers });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('HTTP adapter did not receive a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function postReport(baseUrl: string, body: string, credential: string): Promise<Response> {
  return fetch(`${baseUrl}/api/report`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-surf-credential': credential }, body,
  });
}
