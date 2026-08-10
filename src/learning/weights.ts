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
  /** Finite width of this report's band when the residual is height-shaped. */
  readonly band_width_m?: number;
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

/**
 * After every device has one voice, fence a well-observed spot-day at two
 * widths of that day's median report.  Three voices are the minimum for a
 * same-day median to be meaningful.  An open-ended median has no honest
 * finite width, so it is left for the ordinary shrinkage and clamp backstop.
 */
export function winsorizeSpotDayResiduals(samples: readonly DeviceDaySample[]): DeviceDaySample[] {
  const positionsByDay = new Map<string, number[]>();
  for (const [index, sample] of samples.entries()) {
    if (sample.spot_id === undefined || sample.session_day === undefined) continue;
    const key = `${sample.spot_id}\u0000${sample.session_day}`;
    const positions = positionsByDay.get(key) ?? [];
    positions.push(index);
    positionsByDay.set(key, positions);
  }

  const replacements = new Map<number, DeviceDaySample>();
  for (const positions of positionsByDay.values()) {
    if (positions.length < 3) continue;
    const day = positions.map((position) => samples[position]).filter((sample): sample is DeviceDaySample => sample !== undefined);
    const ordered = [...day].sort((left, right) => left.value - right.value);
    const median = ordered[Math.floor((ordered.length - 1) / 2)];
    if (median === undefined) continue;
    const width = median?.band_width_m;
    if (width === undefined || !Number.isFinite(width)) continue;
    const lower = median.value - 2 * width;
    const upper = median.value + 2 * width;
    for (const position of positions) {
      const sample = samples[position];
      if (sample === undefined) continue;
      replacements.set(position, { ...sample, value: Math.min(upper, Math.max(lower, sample.value)) });
    }
  }

  return samples.map((sample, index) => replacements.get(index) ?? sample);
}
