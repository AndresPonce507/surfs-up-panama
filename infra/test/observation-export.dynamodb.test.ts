// The nightly export against a real DynamoDB, on the house precedent
// (aws-write-store.dynamodb.test.ts): DynamoDB Local in a container, a real
// table, real items of all four shapes the store holds.
//
// <!-- DES-ENFORCEMENT : exempt --> HANDOFF.md section 10 waiver.
//
// Two claims are made here that no in-memory double can make. The first is
// that the scan really pages: DynamoDB hands back a LastEvaluatedKey and the
// reader must keep asking, or a night quietly exports its first page and calls
// that the day. The second is that the whole run wires up -- real table in,
// real gzip bytes on a real disk out -- which is the only place the scan
// adapter, the pure core and the storage adapter meet before they meet in
// production.

import assert from 'node:assert/strict';
import { execFile as execute } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

import {
  CreateTableCommand,
  DynamoDBClient,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { createAwsStoredItemReader, type DynamoScanCommandSet } from '../../src/export/aws-item-reader';
import { runExport } from '../../src/export/run-export';
import type { DynamoDocumentClient } from '../../src/report/aws-write-store';
import { FilesystemStore } from '../../src/pipeline/adapters/filesystem-store';

const execFile = promisify(execute);
const tableName = `surfs-up-export-${randomUUID().replaceAll('-', '')}`;
const containerName = `surfs-up-dynamodb-${randomUUID().replaceAll('-', '')}`;
let containerId: string;
let client: DynamoDBClient;
let document: DynamoDocumentClient;

const commands: DynamoScanCommandSet = {
  ScanCommand: ScanCommand as unknown as DynamoScanCommandSet['ScanCommand'],
};

const CLOSED_DAY = '2026-08-12';
const VENAO_TILE = 'd1qf';
const SEEDED_SPOTS = [
  { spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 },
  { spot_id: 'santa-catalina-la-punta', lat: 7.6342047, lon: -81.2546103 },
];

describe('the nightly export over DynamoDB Local', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const started = await execFile('docker', [
      'run', '--rm', '--detach', '--name', containerName, '--publish', '127.0.0.1::8000',
      'amazon/dynamodb-local:2.5.3', '-jar', 'DynamoDBLocal.jar', '-inMemory', '-sharedDb',
    ]);
    containerId = started.stdout.trim();
    const address = (await execFile('docker', ['port', containerId, '8000/tcp'])).stdout.trim();
    client = new DynamoDBClient({
      endpoint: `http://${address}`,
      region: 'us-east-1',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    await eventually(async () => {
      await client.send(new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
        ProvisionedThroughput: { ReadCapacityUnits: 25, WriteCapacityUnits: 25 },
      }));
    });
    await eventually(async () => {
      const table = await client.send(new DescribeTableCommand({ TableName: tableName }));
      assert.equal(table.Table?.TableStatus, 'ACTIVE');
    });
    document = DynamoDBDocumentClient.from(client) as unknown as DynamoDocumentClient;
    for (const item of storedItems()) {
      await document.send(new PutCommand({ TableName: tableName, Item: item }));
    }
  }, 60_000);

  afterAll(async () => {
    if (client !== undefined) await client.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined);
    if (containerId !== undefined) await execFile('docker', ['rm', '--force', containerId]).catch(() => undefined);
  }, 30_000);

  // covers: R10
  it('pages through the whole table and hands back every shape it holds, exactly once', async () => {
    const reader = createAwsStoredItemReader(document, commands, tableName, 2);

    const items = await reader.scanItems();

    assert.equal(
      items.length,
      storedItems().length,
      'a page is not a night. DynamoDB caps a scan page and returns a LastEvaluatedKey; a reader that stopped at the first page would export part of a day and seal the file anyway.',
    );
    assert.deepEqual(
      items.map((item) => (item as Record<string, unknown>)['pk']).sort(),
      storedItems().map((item) => item['pk']).sort(),
      'every item comes back once: none skipped across a page boundary, none returned twice',
    );
  });

  // covers: R1 R6 R9a
  it('turns a real table into real gzip rows and a real signals file in one run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'observation-export-dynamodb-'));
    const store = new FilesystemStore(root);
    try {
      const outcome = await runExport({
        store: createAwsStoredItemReader(document, commands, tableName, 2),
        log: { putIfAbsent: (key, body) => store.appendLogIfAbsent(key, body) },
        signals: { putIfAbsent: (key, body) => store.appendLogIfAbsent(key, body) },
        clock: { now: () => new Date('2026-08-13T00:30:00Z') },
        spots: SEEDED_SPOTS,
        timezone: 'America/Panama',
      });

      assert.equal(outcome.day, CLOSED_DAY, 'a 00:30Z run closes the day before it');
      assert.equal(outcome.rows, 2, 'the two accepted reports of that day became rows; the credential, quota and counter items did not');

      const rows = gunzipSync(await readFile(join(root, `log/observations/v1/dt=${CLOSED_DAY}/${VENAO_TILE}.jsonl.gz`)));
      assert.deepEqual(
        rows.toString('utf8').split('\n').filter((line) => line !== '')
          .map((line) => (JSON.parse(line) as Record<string, unknown>)['report_id']).sort(),
        ['01JDYNAMO000000000000001', '01JDYNAMO000000000000002'],
        'both of the beach\'s accepted reports left, as real gzip, read back off the disk',
      );

      const signals = JSON.parse(await readFile(join(root, `ops/abuse-signals/v1/dt=${CLOSED_DAY}.json`), 'utf8')) as Record<string, unknown>;
      assert.equal((signals['mints_per_src_hash'] as Record<string, unknown>)['counts'] instanceof Array, true);
      assert.deepEqual(
        (signals['mints_per_src_hash'] as { counts: unknown[] }).counts,
        [{ src_hash: 'sh_real_host', mints: 1 }],
        'the mint ledger item in the real table reached the signals file, which is the only place section 7.4 sends a src_hash',
      );
      assert.ok(
        !rows.toString('utf8').includes('sh_real_host'),
        'and it reached no row: the log is immutable, so a src_hash written into it could never be taken back out',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/** All four shapes the deployed table holds today, plus one report of the wrong day. */
function storedItems(): Record<string, unknown>[] {
  return [
    reportItem('01JDYNAMO000000000000001', `${CLOSED_DAY}T13:05:00Z`),
    reportItem('01JDYNAMO000000000000002', `${CLOSED_DAY}T18:40:00Z`),
    reportItem('01JDYNAMO000000000000003', '2026-08-13T00:10:00Z'),
    { pk: 'CRED#d_real', sk: 'MINT', device_id: 'd_real', issued_at: `${CLOSED_DAY}T10:00:00Z`, src_hash: 'sh_real_host' },
    { pk: 'DEV#d_real', sk: `QUOTA#${CLOSED_DAY}`, reports: 2, ttl: 1_800_000_000 },
    { pk: 'SPOT#playa-venao', sk: 'COUNTER', n_reports: 41 },
  ];
}

function reportItem(reportId: string, receivedAt: string): Record<string, unknown> {
  return {
    pk: `REP#${reportId}`,
    sk: 'REPORT',
    report_id: reportId,
    device_id: 'd_real',
    received_at: receivedAt,
    credential_issued_at: '2026-07-01T12:00:00Z',
    record: {
      report_id: reportId,
      spot_id: 'playa-venao',
      observed_at: receivedAt,
      submitted_at: receivedAt,
      size_band: 'waist_chest',
      size_band_schema: 1,
      wind: 'choppy',
      quality: 'good',
      trigger: 'organic',
      photo_ids: [],
    },
    receipt: { outcome: 'no_snapshot', report_id: reportId, predicted: null, counter: { n_reports: 1, threshold: 30 } },
  };
}

async function eventually(action: () => Promise<void>): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await action();
      return;
    } catch (error) {
      last = error;
      await new Promise((resolve) => { setTimeout(resolve, 100); });
    }
  }
  throw last;
}
