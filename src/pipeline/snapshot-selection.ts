// Pure selection rule for Build's prediction-at-time contract.  Object-list
// order is not meaningful in S3, therefore ties need an explicit canonical
// breaker instead of depending on the order a ListObjects response happened
// to return.

export type SnapshotRow = {
  readonly spot_id: string;
  readonly source: string;
  readonly valid_ts: string;
  readonly run_ts: string;
  /** Stable object/row identity used only when run timestamps are equal. */
  readonly tie_breaker: string;
};

/**
 * For every observable (spot, source, valid instant), retain the newest
 * snapshot that had already happened at build time. A future run can never
 * leak into a historical build, and a repeated list operation is stable.
 */
export function selectNewestEligibleSnapshots<T extends SnapshotRow>(
  rows: readonly T[],
  buildTime: Date,
): readonly T[] {
  const ceiling = buildTime.getTime();
  const selected = new Map<string, T>();
  for (const row of rows) {
    const timestamp = Date.parse(row.run_ts);
    if (Number.isNaN(timestamp) || timestamp > ceiling) continue;
    const key = `${row.spot_id}\u0000${row.source}\u0000${row.valid_ts}`;
    const current = selected.get(key);
    if (current === undefined || compareRows(row, current) > 0) selected.set(key, row);
  }
  return [...selected.values()].sort((left, right) => (
    left.spot_id.localeCompare(right.spot_id)
    || left.source.localeCompare(right.source)
    || left.valid_ts.localeCompare(right.valid_ts)
    || left.run_ts.localeCompare(right.run_ts)
    || left.tie_breaker.localeCompare(right.tie_breaker)
  ));
}

function compareRows(left: SnapshotRow, right: SnapshotRow): number {
  return Date.parse(left.run_ts) - Date.parse(right.run_ts) || -left.tie_breaker.localeCompare(right.tie_breaker);
}
