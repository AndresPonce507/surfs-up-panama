// The report write driving port through its local Lambda composition. The
// backing store is a real temporary directory: recreating the composition is
// the durability boundary a memory fake cannot prove.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, it } from 'vitest';

import { functionUrlResponse } from '../../src/report/aws-lambda-adapter';
import { createLocalWriteLambda, type LocalWriteLambda } from '../../src/report/local-lambda';

const SECRET = 'test-only-credential-secret-that-is-long-enough';
const SERVER_NOW = new Date('2026-08-10T18:30:00.000Z');
const DEVICE = 'd_0123456789abcdef0123456789abcdef';

let root: string;
let lambda: LocalWriteLambda;

describe('report/mint Function URL response boundary', () => {
  it('marks every report or mint response network-only without erasing CORS headers', () => {
    for (const statusCode of [200, 400, 401, 429, 503]) {
      const result = functionUrlResponse(statusCode, { statusCode }, {
        'access-control-allow-origin': 'https://surfsup.example',
        'Cache-Control': 'public, max-age=31536000',
      });
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.equal(result.headers['access-control-allow-origin'], 'https://surfsup.example');
      assert.equal(Object.keys(result.headers).filter((name) => name.toLowerCase() === 'cache-control').length, 1);
    }
  });
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'surfs-up-report-write-'));
  lambda = createLambda(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function createLambda(storeRoot: string, now = SERVER_NOW): LocalWriteLambda {
  return createLocalWriteLambda({
    storeRoot,
    credentialSecret: SECRET,
    knownSpotIds: ['playa-venao'],
    clock: () => now,
  });
}

function request(path: '/api/mint' | '/api/report', body: unknown, credential?: string) {
  return lambda.handle({
    path,
    method: 'POST',
    headers: credential === undefined ? { 'content-type': 'application/json' } : {
      'content-type': 'application/json',
      'x-surf-credential': credential,
    },
    body: JSON.stringify(body),
    sourceIp: '198.51.100.10',
  });
}

async function mint(): Promise<string> {
  const response = await request('/api/mint', { device_id: DEVICE });
  assert.equal(response.statusCode, 200);
  return (response.body as { credential: string }).credential;
}

function report(reportId = '01J4QZK8Y3E9RWM2P7T6B1XCVN') {
  return {
    report_id: reportId,
    spot_id: 'playa-venao',
    observed_at: '2026-08-10T18:30:00Z',
    submitted_at: '2026-08-10T18:30:00Z',
    size_band: 'waist_chest',
    size_band_schema: 1,
    wind: 'choppy',
    quality: 'good',
    trigger: 'organic',
    photo_ids: [],
  };
}

describe('local report write Lambda', () => {
  it('countersigns every valid device once, retaining its original server time without retaining its source IP', async () => {
    const first = await request('/api/mint', { device_id: DEVICE });
    const nextDay = createLambda(root, new Date('2026-08-11T18:30:00.000Z'));
    const second = await nextDay.handle({
      path: '/api/mint', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: DEVICE }), sourceIp: '203.0.113.9',
    });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.deepEqual(second.body, first.body, 're-minting must not reset credential age');
    const ledger = await readFile(join(root, 'credentials', `${DEVICE}.json`), 'utf8');
    assert.ok(!ledger.includes('198.51.100.10') && !ledger.includes('203.0.113.9'), 'the mint ledger stores a source hash, never a raw IP');
    assert.match(JSON.parse(ledger).src_hash, /^[0-9a-f]{32}$/, 'the mint ledger preserves the contracted 128-bit hexadecimal source hash');
  });

  it('keeps one first-seen time when two local Lambda compositions mint the same device concurrently', async () => {
    const earlier = createLambda(root, new Date('2026-08-10T18:30:00.000Z'));
    const later = createLambda(root, new Date('2026-08-11T18:30:00.000Z'));
    const results = await Promise.all(Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? earlier : later).handle({
      path: '/api/mint', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: DEVICE }), sourceIp: index % 2 === 0 ? '198.51.100.10' : '203.0.113.9',
    })));
    const first = results[0]!;
    const second = results[1]!;

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.deepEqual(first.body, second.body, 'parallel first mints must converge on one credential age');
    for (const result of results.slice(2)) assert.deepEqual(result.body, first.body, 'high-contention minting keeps the first server-issued credential');
  });

  it('stores a valid report durably and returns the original receipt on a byte-identical retry', async () => {
    const credential = await mint();
    const savedReport = { ...report(), queued_offline: true, lang: 'es' };
    const first = await request('/api/report', savedReport, credential);
    lambda = createLambda(root);
    const retry = await request('/api/report', savedReport, credential);

    assert.deepEqual(first, {
      statusCode: 200,
      body: {
        outcome: 'no_snapshot', report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN',
        predicted: null, counter: { n_reports: 1, threshold: 30 },
      },
    });
    assert.deepEqual(retry, {
      statusCode: 200,
      body: {
        outcome: 'queued_duplicate', report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN',
        predicted: null, counter: { n_reports: 1, threshold: 30 },
      },
    });
    const stored = await readFile(join(root, 'reports', '01J4QZK8Y3E9RWM2P7T6B1XCVN.json'), 'utf8');
    assert.ok(!stored.includes('queued_offline') && !stored.includes('"lang"'), 'transport-only fields are accepted but never persisted');
    assert.match(stored, /"received_at":"2026-08-10T18:30:00\.000Z"/, 'the server, not the phone, stamps receipt time');
    assert.match(stored, /"credential_issued_at":"2026-08-10T18:30:00\.000Z"/, 'the immutable report carries the credential age basis for later trust calculation');
  });

  it('accepts one report once when two Lambda compositions receive the same saved identity concurrently', async () => {
    const credential = await mint();
    const other = createLambda(root);
    const saved = JSON.stringify(report());
    const [first, second] = await Promise.all([
      lambda.handle({ path: '/api/report', method: 'POST', headers: { 'content-type': 'application/json', 'x-surf-credential': credential }, body: saved, sourceIp: '198.51.100.10' }),
      other.handle({ path: '/api/report', method: 'POST', headers: { 'content-type': 'application/json', 'x-surf-credential': credential }, body: saved, sourceIp: '198.51.100.10' }),
    ]);
    const outcomes = [first.body, second.body].map((body) => (body as { outcome: string }).outcome).sort();

    assert.deepEqual(outcomes, ['no_snapshot', 'queued_duplicate']);
    assert.deepEqual(
      [first.body, second.body].map((body) => (body as { counter: { n_reports: number } }).counter.n_reports),
      [1, 1],
      'the retry receives the original counter and cannot overcount the arrival',
    );
    assert.deepEqual(await readdir(join(root, 'reports')), ['01J4QZK8Y3E9RWM2P7T6B1XCVN.json'], 'one durable report file represents one arrival');
  });

  it('rejects forged credentials and invalid reports before a local write, and defers only the twenty-first valid report for a day', async () => {
    const credential = await mint();
    const forged = `${credential.slice(0, -1)}${credential.endsWith('A') ? 'B' : 'A'}`;
    const forgedResponse = await request('/api/report', report(), forged);
    const unknownResponse = await request('/api/report', { ...report(), spot_id: 'not-a-known-spot' }, credential);
    const futureResponse = await request('/api/report', { ...report(), observed_at: '2026-08-10T18:46:00Z' }, credential);
    const malformedResponse = await request('/api/report', { ...report(), unexpected: true }, credential);
    const nonJsonResponse = await lambda.handle({
      path: '/api/report', method: 'POST', headers: { 'x-surf-credential': credential },
      body: JSON.stringify(report()), sourceIp: '198.51.100.10',
    });

    assert.deepEqual([forgedResponse.statusCode, unknownResponse.statusCode, futureResponse.statusCode, malformedResponse.statusCode, nonJsonResponse.statusCode], [401, 400, 400, 400, 400]);
    assert.equal((forgedResponse.body as { error: { code: string } }).error.code, 'credential_invalid');
    assert.equal((unknownResponse.body as { error: { code: string } }).error.code, 'unknown_spot');
    assert.equal((futureResponse.body as { error: { code: string } }).error.code, 'observed_at_out_of_range');
    assert.equal((malformedResponse.body as { error: { code: string } }).error.code, 'schema_invalid');

    for (let number = 0; number < 20; number += 1) {
      const response = await request('/api/report', report(`01J4QZK8Y3E9RWM2P7T6B1XC${number.toString().padStart(2, '0')}`), credential);
      assert.equal(response.statusCode, 200);
    }

    const overflow = await request('/api/report', report('01J4QZK8Y3E9RWM2P7T6B1XCZZ'), credential);
    assert.equal(overflow.statusCode, 429);
    assert.equal((overflow.body as { error: { code: string } }).error.code, 'quota_exceeded');
  });

  it('fails closed when the required HMAC secret is absent', () => {
    assert.throws(
      () => createLocalWriteLambda({ storeRoot: root, credentialSecret: '', knownSpotIds: ['playa-venao'], clock: () => SERVER_NOW }),
      /credential secret must be at least 256 bits/,
    );
    assert.throws(
      () => createLocalWriteLambda({ storeRoot: root, credentialSecret: 'x'.repeat(31), knownSpotIds: ['playa-venao'], clock: () => SERVER_NOW }),
      /credential secret must be at least 256 bits/,
    );
  });

  it('returns the documented 503 response when the durable store cannot be opened', async () => {
    const blockedRoot = join(root, 'not-a-directory');
    await writeFile(blockedRoot, 'blocked');
    const blocked = createLocalWriteLambda({ storeRoot: blockedRoot, credentialSecret: SECRET, knownSpotIds: ['playa-venao'], clock: () => SERVER_NOW });

    const response = await blocked.handle({
      path: '/api/mint', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: DEVICE }), sourceIp: '198.51.100.10',
    });

    assert.equal(response.statusCode, 503);
    assert.equal((response.body as { error: { code: string } }).error.code, 'store_unavailable');
  });

  it('fails closed when a pre-existing durable transaction lock cannot be released', async () => {
    const credential = await mint();
    await writeFile(join(root, '.write-store.lock'), 'wedged');

    const response = await request('/api/report', report(), credential);

    assert.equal(response.statusCode, 503);
    assert.equal((response.body as { error: { code: string } }).error.code, 'store_unavailable');
  });
});
