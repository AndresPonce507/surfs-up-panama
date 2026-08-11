// DynamoDB adapter for the shared report/mint decision core.  It deliberately
// exposes only the two mutations approved for these handlers: CRED records for
// mint, and report/quota/counter records for report.

import type { ReportRecord } from './report-record';
import type { Receipt, ReportReveal, StoredCredential, StoredReportResult } from './local-write-store';
import type { WriteStore } from './local-lambda';

type Command = unknown;
type CommandConstructor = new (input: Record<string, unknown>) => Command;

export interface DynamoCommandSet {
  readonly GetCommand: CommandConstructor;
  readonly PutCommand: CommandConstructor;
  readonly TransactWriteCommand: CommandConstructor;
}

export interface DynamoDocumentClient {
  send(command: Command): Promise<Record<string, unknown>>;
}

export function createAwsWriteStore(
  client: DynamoDocumentClient,
  commands: DynamoCommandSet,
  tableName: string,
): WriteStore {
  return {
    async mintCredential(candidate): Promise<StoredCredential> {
      const key = credentialKey(candidate.device_id);
      try {
        await client.send(new commands.PutCommand({
          TableName: tableName,
          Item: { pk: key.pk, sk: key.sk, ...candidate },
          ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }));
        return candidate;
      } catch (error) {
        if (!isConditionalFailure(error)) throw error;
        const existing = await client.send(new commands.GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }));
        const item = existing.Item as StoredCredential | undefined;
        if (item === undefined) throw error;
        return {
          device_id: item.device_id,
          issued_at: item.issued_at,
          issued_at_epoch: item.issued_at_epoch,
          src_hash: item.src_hash,
        };
      }
    },

    async storeReport(record, deviceId, receivedDay, quotaLimit, receivedAt, credentialIssuedAt, reveal): Promise<StoredReportResult> {
      const reportKey = reportKeys(record);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const counter = await client.send(new commands.GetCommand({
          TableName: tableName,
          Key: counterKey(record.spot_id),
          ConsistentRead: true,
        }));
        const nextCount = numberAt(counter.Item, 'n_reports', 0) + 1;
        const canonical = receipt(record.report_id, nextCount, reveal);
        try {
          await client.send(new commands.TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: quotaKey(deviceId, receivedDay),
                  UpdateExpression: 'ADD reports :one SET #ttl = :ttl',
                  ConditionExpression: 'attribute_not_exists(reports) OR reports < :limit',
                  ExpressionAttributeNames: { '#ttl': 'ttl' },
                  ExpressionAttributeValues: {
                    ':one': 1,
                    ':limit': quotaLimit,
                    ':ttl': Math.floor(Date.parse(receivedAt) / 1000) + (2 * 24 * 60 * 60),
                  },
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: counterKey(record.spot_id),
                  UpdateExpression: 'SET n_reports = :next',
                  ConditionExpression: 'attribute_not_exists(n_reports) OR n_reports = :current',
                  ExpressionAttributeValues: { ':current': nextCount - 1, ':next': nextCount },
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...reportKey,
                    report_id: record.report_id,
                    device_id: deviceId,
                    received_at: receivedAt,
                    credential_issued_at: credentialIssuedAt,
                    record,
                    receipt: canonical,
                  },
                    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
                },
              },
            ],
          }));
          return { kind: 'accepted', receipt: canonical };
        } catch (error) {
          const existing = await client.send(new commands.GetCommand({ TableName: tableName, Key: reportKey, ConsistentRead: true }));
          if (typeof existing.Item === 'object' && existing.Item !== null) {
            const original = duplicateReceipt(existing.Item as Record<string, unknown>, record.report_id);
            if (original !== null) return { kind: 'duplicate', receipt: original };
          }
          if (!isConditionalFailure(error)) throw error;
          if (isQuotaFailure(error)) return { kind: 'quota_exceeded' };
        }
      }
      throw new Error('report write store unavailable: concurrent report counter did not settle after three attempts');
    },
  };
}

function credentialKey(deviceId: string) {
  return { pk: `CRED#${deviceId}`, sk: 'MINT' };
}

function quotaKey(deviceId: string, day: string) {
  return { pk: `DEV#${deviceId}`, sk: `QUOTA#${day}` };
}

function reportKeys(record: ReportRecord) {
  return { pk: `REP#${record.report_id}`, sk: 'REPORT' };
}

function counterKey(spotId: string) {
  return { pk: `SPOT#${spotId}`, sk: 'COUNTER' };
}

function receipt(reportId: string, nReports: number, reveal: ReportReveal): Receipt {
  return { ...reveal, report_id: reportId, counter: { n_reports: nReports, threshold: 30 } };
}

function duplicateReceipt(item: Record<string, unknown>, reportId: string): Receipt | null {
  const stored = item.receipt;
  if (typeof stored === 'object' && stored !== null && 'predicted' in stored && 'counter' in stored) {
    const original = stored as Receipt;
    return { ...original, outcome: 'queued_duplicate', report_id: reportId };
  }
  return null;
}

function numberAt(value: unknown, key: string, fallback: number): number {
  if (typeof value !== 'object' || value === null || !(key in value)) return fallback;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === 'number' && Number.isFinite(found) ? found : fallback;
}

function isConditionalFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error
    && ((error as { name?: unknown }).name === 'ConditionalCheckFailedException'
      || (error as { name?: unknown }).name === 'TransactionCanceledException');
}

function isQuotaFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('CancellationReasons' in error)) return false;
  const reasons = (error as { CancellationReasons?: unknown }).CancellationReasons;
  if (!Array.isArray(reasons)) return false;
  const quotaReason = reasons[0];
  return typeof quotaReason === 'object' && quotaReason !== null
    && (quotaReason as { Code?: unknown }).Code === 'ConditionalCheckFailed';
}
