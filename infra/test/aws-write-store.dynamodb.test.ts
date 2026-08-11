import assert from 'node:assert/strict';
import { execFile as execute } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import {
  CreateTableCommand,
  DynamoDBClient,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { createAwsWriteStore, type DynamoCommandSet, type DynamoDocumentClient } from '../../src/report/aws-write-store';

const execFile = promisify(execute);
const tableName = `surfs-up-report-${randomUUID().replaceAll('-', '')}`;
const containerName = `surfs-up-dynamodb-${randomUUID().replaceAll('-', '')}`;
let containerId: string;
let client: DynamoDBClient;

const commands: DynamoCommandSet = {
  GetCommand: GetCommand as unknown as DynamoCommandSet['GetCommand'],
  PutCommand: PutCommand as unknown as DynamoCommandSet['PutCommand'],
  TransactWriteCommand: TransactWriteCommand as unknown as DynamoCommandSet['TransactWriteCommand'],
};

describe('DynamoDB write-store adapter over DynamoDB Local', { timeout: 30_000 }, () => {
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
  }, 30_000);

  afterAll(async () => {
    if (client !== undefined) await client.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined);
    if (containerId !== undefined) await execFile('docker', ['rm', '--force', containerId]).catch(() => undefined);
  }, 30_000);

  it('persists one immutable receipt and returns it on a duplicate without incrementing the counter again', async () => {
    const document = DynamoDBDocumentClient.from(client) as unknown as DynamoDocumentClient;
    const store = createAwsWriteStore(document, commands, tableName);
    const report = {
      report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN', spot_id: 'playa-venao',
      observed_at: '2026-08-10T18:30:00Z', submitted_at: '2026-08-10T18:30:00Z',
      size_band: 'waist_chest' as const, size_band_schema: 1 as const, wind: 'choppy' as const,
      quality: 'good' as const, trigger: 'organic' as const, photo_ids: [],
    };
    const write = () => store.storeReport(
      report,
      'd_0123456789abcdef0123456789abcdef',
      '2026-08-10',
      20,
      '2026-08-10T18:30:00.000Z',
      '2026-08-10T17:00:00.000Z',
      { outcome: 'no_snapshot', predicted: null },
    );

    const accepted = await write();
    const duplicate = await write();
    assert.deepEqual(accepted, {
      kind: 'accepted',
      receipt: {
        outcome: 'no_snapshot', report_id: report.report_id, predicted: null,
        counter: { n_reports: 1, threshold: 30 },
      },
    });
    assert.deepEqual(duplicate, {
      kind: 'duplicate',
      receipt: {
        outcome: 'queued_duplicate', report_id: report.report_id, predicted: null,
        counter: { n_reports: 1, threshold: 30 },
      },
    });
    const counter = await document.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'SPOT#playa-venao', sk: 'COUNTER' },
      ConsistentRead: true,
    }));
    assert.equal((counter.Item as { n_reports?: unknown } | undefined)?.n_reports, 1);
  });

  it('retries a counter collision without misclassifying either report as quota-exceeded', async () => {
    const document = DynamoDBDocumentClient.from(client) as unknown as DynamoDocumentClient;
    const store = createAwsWriteStore(document, commands, tableName);
    const writes = await Promise.all([
      store.storeReport(reportFor('parallel-one'), 'd_11111111111111111111111111111111', '2026-08-10', 20, '2026-08-10T18:30:00.000Z', '2026-08-10T17:00:00.000Z', { outcome: 'no_snapshot', predicted: null }),
      store.storeReport(reportFor('parallel-two'), 'd_22222222222222222222222222222222', '2026-08-10', 20, '2026-08-10T18:30:00.000Z', '2026-08-10T17:00:00.000Z', { outcome: 'no_snapshot', predicted: null }),
    ]);
    assert.deepEqual(writes.map((write) => write.kind).sort(), ['accepted', 'accepted']);
  });

  it('returns quota-exceeded only after the device day has twenty durable reports', async () => {
    const document = DynamoDBDocumentClient.from(client) as unknown as DynamoDocumentClient;
    const store = createAwsWriteStore(document, commands, tableName);
    const deviceId = 'd_33333333333333333333333333333333';
    for (let index = 0; index < 20; index += 1) {
      const result = await store.storeReport(reportFor(`quota-${index}`), deviceId, '2026-08-11', 20, '2026-08-11T18:30:00.000Z', '2026-08-11T17:00:00.000Z', { outcome: 'no_snapshot', predicted: null });
      assert.equal(result.kind, 'accepted');
    }
    const overflow = await store.storeReport(reportFor('quota-overflow'), deviceId, '2026-08-11', 20, '2026-08-11T18:30:00.000Z', '2026-08-11T17:00:00.000Z', { outcome: 'no_snapshot', predicted: null });
    assert.equal(overflow.kind, 'quota_exceeded');
  });
});

function reportFor(reportId: string) {
  return {
    report_id: reportId, spot_id: 'playa-venao',
    observed_at: '2026-08-10T18:30:00Z', submitted_at: '2026-08-10T18:30:00Z',
    size_band: 'waist_chest' as const, size_band_schema: 1 as const, wind: 'choppy' as const,
    quality: 'good' as const, trigger: 'organic' as const, photo_ids: [],
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
