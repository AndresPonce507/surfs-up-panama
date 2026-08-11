import type { RawArchiveRecord } from './ports';

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A raw response is immutable forensic evidence. The spot and the complete
 * capture instant prevent the old provider/hour key from overwriting every
 * preceding spot in the same scheduled run.
 */
export function rawArchiveKey(provider: string, spotId: string, runAt: Date): string {
  assertSegment('provider', provider);
  assertSegment('spot_id', spotId);
  if (Number.isNaN(runAt.getTime())) throw new Error('raw archive key refused: run timestamp is invalid');
  const iso = runAt.toISOString();
  return `raw/${provider}/dt=${iso.slice(0, 10)}/${iso.slice(11, 13)}/spot=${spotId}/run=${iso.replace(/:/g, '-')}.json.gz`;
}

export function rawArchiveRecord(provider: string, spotId: string, runAt: Date, verbatim: string): RawArchiveRecord {
  return { key: rawArchiveKey(provider, spotId, runAt), verbatim };
}

function assertSegment(label: string, value: string): void {
  if (!SEGMENT.test(value)) throw new Error(`raw archive key refused: ${label} must match ${SEGMENT.source}`);
}
