// Robustness weights are applied in a declared order (06-learning-layer.md
// section 6.2).  This first operation is deliberately independent of every
// later weight: a person repeating a report during one session gets one
// device-day voice before precision, winsorization, concordance, or selection
// can inspect it.

export type DeviceDaySample = {
  readonly spot_id?: string;
  readonly session_day?: string;
  readonly device_id: string;
  readonly value: number;
  readonly weight: number;
};

/**
 * Keep one lower-median representative for every (spot, UTC day, device).
 * A lower median is an observed report rather than an invented fractional
 * band; for an odd count it is the ordinary median.  Samples lacking a full
 * session identity are deliberately left alone, because collapsing an
 * unknown day or spot would invent a relationship the log did not provide.
 */
export function collapseDeviceDayMedian(samples: readonly DeviceDaySample[]): DeviceDaySample[] {
  const grouped = new Map<string, DeviceDaySample[]>();
  const ungrouped: DeviceDaySample[] = [];
  for (const sample of samples) {
    if (sample.spot_id === undefined || sample.session_day === undefined) {
      ungrouped.push(sample);
      continue;
    }
    const key = `${sample.spot_id}\u0000${sample.session_day}\u0000${sample.device_id}`;
    const group = grouped.get(key) ?? [];
    group.push(sample);
    grouped.set(key, group);
  }

  const collapsed = [...ungrouped];
  for (const group of grouped.values()) {
    const ordered = [...group].sort((left, right) => left.value - right.value);
    const median = ordered[Math.floor((ordered.length - 1) / 2)];
    if (median !== undefined) collapsed.push(median);
  }
  return collapsed;
}
