// The raw archive is forensic evidence, not a second prediction log. Keep its
// identity derivation pure so callers can prove replay/provenance without S3
// or compression in the test process.

import type { RawArchiveRecord } from './ports';

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Canonical raw-capture key grammar (the domain contract reserves the prefix):
 *
 * raw/<provider>/dt=YYYY-MM-DD/<HH>/spot=<spot_id>/run=YYYY-MM-DDTHH-mm-ss.sssZ.json.gz
 *
 * A run is the UTC instant at which this received response was accepted by
 * ingest. Provider + spot + run make independently fetched spot payloads
 * distinct, while the date/hour partition retained from domain-model §5.2
 * keeps the bounded 30-day forensic archive easy to inspect and expire.
 */
export function rawArchiveKey(provider: string, spotId: string, runAt: Date): string {
  assertSegment('provider', provider);
  assertSegment('spot_id', spotId);
  if (Number.isNaN(runAt.getTime())) throw new Error('raw archive key refused: run timestamp is invalid');

  const iso = runAt.toISOString();
  const date = iso.slice(0, 10);
  const hour = iso.slice(11, 13);
  const run = iso.replace(/:/g, '-');
  return `raw/${provider}/dt=${date}/${hour}/spot=${spotId}/run=${run}.json.gz`;
}

/** Constructs the uncompressed, verbatim archive record. Compression is an
 * adapter responsibility so the functional ingest core never lies about bytes. */
export function rawArchiveRecord(provider: string, spotId: string, runAt: Date, verbatim: string): RawArchiveRecord {
  return { key: rawArchiveKey(provider, spotId, runAt), verbatim };
}

function assertSegment(label: string, value: string): void {
  if (!SEGMENT.test(value)) throw new Error(`raw archive key refused: ${label} must match ${SEGMENT.source}`);
}
