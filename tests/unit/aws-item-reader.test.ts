import { describe, expect, it } from 'vitest';

import { createAwsStoredItemReader } from '../../src/export/aws-item-reader';
import type { DynamoScanCommandSet } from '../../src/export/aws-item-reader';
import type { DynamoDocumentClient } from '../../src/report/aws-write-store';

class ScanCommand {
  constructor(readonly input: Record<string, unknown>) {}
}

const commands: DynamoScanCommandSet = { ScanCommand };

describe('DynamoDB observation item reader', () => {
  // bypass: this adapter contract is the exact DynamoDB command shape it sends.
  it('uses a strongly consistent scan on every page so a completed report is in the sealed export', async () => {
    const received: unknown[] = [];
    const client: DynamoDocumentClient = {
      async send(command) {
        received.push(command);
        return received.length === 1
          ? { Items: [{ pk: 'REP#first' }], LastEvaluatedKey: { pk: 'REP#next', sk: 'REPORT' } }
          : { Items: [{ pk: 'REP#next' }] };
      },
    };

    const reader = createAwsStoredItemReader(client, commands, 'surfs-up-panama-write-store', 1);

    await expect(reader.scanItems()).resolves.toEqual([{ pk: 'REP#first' }, { pk: 'REP#next' }]);
    expect(received).toEqual([
      expect.objectContaining({ input: { TableName: 'surfs-up-panama-write-store', Limit: 1, ConsistentRead: true } }),
      expect.objectContaining({
        input: {
          TableName: 'surfs-up-panama-write-store',
          Limit: 1,
          ExclusiveStartKey: { pk: 'REP#next', sk: 'REPORT' },
          ConsistentRead: true,
        },
      }),
    ]);
  });
});
