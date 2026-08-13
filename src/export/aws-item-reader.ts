// The read half of the write store, over the real table.
//
// WHY-NEW-FILE: src/export/aws-item-reader.ts
//   CLOSEST-EXISTING: src/report/aws-write-store.ts
//   EXTENSION-COST: that module IS the write store's mutation surface -- it
//     exists to expose "only the two mutations approved for these handlers",
//     and it is read-only authority for this lane. Adding a scan to it would
//     put the export's read and the report handler's writes behind one factory,
//     so the export could not be handed a capability that cannot write.
//   PARALLEL-RATIONALE: opposite capability and a different deployment unit --
//     this object is built inside the export Lambda, whose IAM role holds Scan
//     and DescribeTable and no write action at all. Its whole value is what it
//     CANNOT do, which is a property a shared factory would destroy.
//
// The table has no GSIs (the deployed reality; adr-write-store-single-table's
// GSI2 was never built), so the nightly export scans, exactly as 07 section 2's
// topology edge says. The document client type is imported rather than
// redeclared so there is one description of the SDK seam in this repository.

import type { DynamoDocumentClient } from '../report/aws-write-store';
import type { StoredItemReader } from './ports';

type Command = unknown;
type CommandConstructor = new (input: Record<string, unknown>) => Command;

/** The one command this reader is allowed to build. There is deliberately no Put, Update or Delete. */
export interface DynamoScanCommandSet {
  readonly ScanCommand: CommandConstructor;
}

/**
 * A read-only view of the write store: one scan, every shape the table holds,
 * and no way to change any of it.
 *
 * `pageSize` caps how much one request may return. DynamoDB pages a scan at
 * 1 MB whatever the caller asks for, so the continuation loop below is not
 * optional either way; the cap is there because the table is provisioned at
 * 25 RCU and a caller may want a night's read spread over more, smaller
 * requests rather than one burst against the same capacity the report handler
 * is using.
 */
export function createAwsStoredItemReader(
  client: DynamoDocumentClient,
  commands: DynamoScanCommandSet,
  tableName: string,
  pageSize?: number,
): StoredItemReader {
  return {
    async scanItems(): Promise<readonly unknown[]> {
      const items: unknown[] = [];
      let startKey: Record<string, unknown> | undefined;
      do {
        const page = await client.send(new commands.ScanCommand({
          TableName: tableName,
          ConsistentRead: true,
          ...(pageSize === undefined ? {} : { Limit: pageSize }),
          ...(startKey === undefined ? {} : { ExclusiveStartKey: startKey }),
        }));
        for (const item of asItems(page['Items'])) items.push(item);
        startKey = asStartKey(page['LastEvaluatedKey']);
      } while (startKey !== undefined);
      return items;
    },
  };
}

function asItems(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The cursor DynamoDB hands back while a scan has more to give. Anything that
 * is not a real key ends the loop: a night must never spin on a page shape it
 * cannot follow.
 */
function asStartKey(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
