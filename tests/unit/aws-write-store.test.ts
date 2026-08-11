import { describe, expect, it } from 'vitest';

import { createAwsWriteStore } from '../../src/report/aws-write-store';
import type { DynamoCommandSet, DynamoDocumentClient } from '../../src/report/aws-write-store';

class GetCommand { constructor(readonly input: Record<string, unknown>) {} }
class PutCommand { constructor(readonly input: Record<string, unknown>) {} }
class TransactWriteCommand { constructor(readonly input: Record<string, unknown>) {} }

const commands: DynamoCommandSet = { GetCommand, PutCommand, TransactWriteCommand };
const report = {
  report_id: '01J4QZK8Y3E9RWM2P7T6B1XCVN', spot_id: 'playa-venao',
  observed_at: '2026-08-10T18:30:00Z', submitted_at: '2026-08-10T18:30:00Z',
  size_band: 'waist_chest' as const, size_band_schema: 1 as const, wind: 'choppy' as const,
  quality: 'good' as const, trigger: 'organic' as const, photo_ids: [],
};

describe('DynamoDB write-store adapter', () => {
  it('uses the synthesized table key names and makes exactly the report quota, immutable report, and counter plan', async () => {
    const received: unknown[] = [];
    const client: DynamoDocumentClient = {
      async send(command) {
        received.push(command);
        if (command instanceof GetCommand) return { Item: { n_reports: 7 } };
        return {};
      },
    };
    const store = createAwsWriteStore(client, commands, 'surfs-up-panama-write-store');
    const result = await store.storeReport(report, 'd_0123456789abcdef0123456789abcdef', '2026-08-10', 20, '2026-08-10T18:30:00.000Z', '2026-08-10T17:00:00.000Z', { outcome: 'no_snapshot', predicted: null });
    if (result.kind !== 'accepted') throw new Error('expected accepted report');

    expect(result).toEqual({ kind: 'accepted', receipt: { outcome: 'no_snapshot', report_id: report.report_id, predicted: null, counter: { n_reports: 8, threshold: 30 } } });
    const [, transaction] = received as [GetCommand, TransactWriteCommand];
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ Update: expect.objectContaining({ Key: { pk: 'DEV#d_0123456789abcdef0123456789abcdef', sk: 'QUOTA#2026-08-10' } }) }),
      expect.objectContaining({ Update: expect.objectContaining({ Key: { pk: 'SPOT#playa-venao', sk: 'COUNTER' }, ExpressionAttributeValues: { ':current': 7, ':next': 8 } }) }),
      expect.objectContaining({ Put: expect.objectContaining({ Item: expect.objectContaining({ pk: `REP#${report.report_id}`, sk: 'REPORT', receipt: result.receipt }) }) }),
    ]));
  });

  it('reuses the original credential record after a conditional re-mint instead of resetting its age', async () => {
    const original = { device_id: 'd_0123456789abcdef0123456789abcdef', issued_at: '2026-08-01T00:00:00.000Z', issued_at_epoch: 1_754_006_400, src_hash: 'a'.repeat(32) };
    const client: DynamoDocumentClient = {
      async send(command) {
        if (command instanceof PutCommand) {
          const error = new Error('exists');
          error.name = 'ConditionalCheckFailedException';
          throw error;
        }
        if (command instanceof GetCommand) return { Item: original };
        return {};
      },
    };
    await expect(createAwsWriteStore(client, commands, 'write-store').mintCredential({ ...original, issued_at: '2026-08-10T00:00:00.000Z', issued_at_epoch: 1_754_784_000 }))
      .resolves.toEqual(original);
  });

  it('returns the stored original receipt after a duplicate instead of inventing a new counter', async () => {
    const original = { outcome: 'compared' as const, report_id: report.report_id, predicted: { score_q: 82, size_band: 'chest_head', size_range_m: [1.1, 1.6] as const, wind_state: 'clean', conf_level: 'medium' }, delta: { score_points: 12, size_bands: 1 }, counter: { n_reports: 9, threshold: 30 } };
    const client: DynamoDocumentClient = {
      async send(command) {
        if (command instanceof TransactWriteCommand) {
          const error = new Error('conditional');
          error.name = 'TransactionCanceledException';
          throw error;
        }
        if (command instanceof GetCommand) return { Item: { receipt: original } };
        return {};
      },
    };
    await expect(createAwsWriteStore(client, commands, 'write-store').storeReport(report, 'd_0123456789abcdef0123456789abcdef', '2026-08-10', 20, '2026-08-10T18:30:00.000Z', '2026-08-10T17:00:00.000Z', { outcome: 'no_snapshot', predicted: null }))
      .resolves.toEqual({ kind: 'duplicate', receipt: { ...original, outcome: 'queued_duplicate' } });
  });

  it('recovers the durable receipt when the transaction commits but its response is interrupted', async () => {
    let stored: Record<string, unknown> | undefined;
    const client: DynamoDocumentClient = {
      async send(command) {
        if (command instanceof GetCommand) return { Item: stored };
        if (command instanceof TransactWriteCommand) {
          const reportPut = (command.input.TransactItems as { Put?: { Item?: Record<string, unknown> } }[])
            .find((entry) => entry.Put !== undefined)?.Put?.Item;
          stored = reportPut;
          throw new Error('transport interrupted after DynamoDB committed the transaction');
        }
        return {};
      },
    };
    await expect(createAwsWriteStore(client, commands, 'write-store').storeReport(
      report,
      'd_0123456789abcdef0123456789abcdef',
      '2026-08-10',
      20,
      '2026-08-10T18:30:00.000Z',
      '2026-08-10T17:00:00.000Z',
      { outcome: 'no_snapshot', predicted: null },
    )).resolves.toEqual({
      kind: 'duplicate',
      receipt: {
        outcome: 'queued_duplicate', report_id: report.report_id, predicted: null,
        counter: { n_reports: 1, threshold: 30 },
      },
    });
  });

  it('does not turn an unresolved counter collision into a quota response', async () => {
    const client: DynamoDocumentClient = {
      async send(command) {
        if (command instanceof GetCommand) return {};
        if (command instanceof TransactWriteCommand) {
          const error = new Error('counter collision');
          error.name = 'TransactionCanceledException';
          Object.assign(error, { CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }] });
          throw error;
        }
        return {};
      },
    };
    await expect(createAwsWriteStore(client, commands, 'write-store').storeReport(
      report,
      'd_0123456789abcdef0123456789abcdef',
      '2026-08-10',
      20,
      '2026-08-10T18:30:00.000Z',
      '2026-08-10T17:00:00.000Z',
      { outcome: 'no_snapshot', predicted: null },
    )).rejects.toThrow('concurrent report counter');
  });
});
