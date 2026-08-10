// Robustness weights are applied in a declared order (06-learning-layer.md
// section 6.2).  This first operation is deliberately independent of every
// later weight: a person repeating a report during one session gets one
// device-day voice before precision, winsorization, concordance, or selection
// can inspect it.

import { SIGMA_EFF } from './constants';

const CONCORDANCE_TAU = 4;
const CONCORDANCE_FLOOR = 0.2;

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

  return applyConcordanceWeights(samples.map((sample, index) => replacements.get(index) ?? sample));
}

/**
 * Chronic disagreement reduces a reporter's influence, never removes it.
 * A missing disagreement means the reporter has never shared a spot-day
 * median with anyone, which is the explicit newcomer-at-full-voice case.
 */
export function concordanceWeight(disagreementSigmaSquared: number | undefined): number {
  if (disagreementSigmaSquared === undefined) return 1;
  return Math.min(1, Math.max(CONCORDANCE_FLOOR, CONCORDANCE_TAU / (CONCORDANCE_TAU + disagreementSigmaSquared)));
}

/**
 * Apply the concordance term after same-day fencing.  Only days with another
 * device supply a disagreement datum; an isolated first morning stays at its
 * precision weight.  Sparse histories shrink toward the observed population
 * mean so one unusual shared morning cannot manufacture a shadow ban.
 */
function applyConcordanceWeights(samples: readonly DeviceDaySample[]): DeviceDaySample[] {
  const disagreementsByDevice = new Map<string, number[]>();
  const positionsByDay = positionsGroupedBySpotDay(samples);
  for (const positions of positionsByDay.values()) {
    // This seam is the robust same-day operation.  Its established contract
    // leaves sub-three-voice days untouched, including their weights.
    if (positions.length < 3) continue;
    const day = positions.map((position) => samples[position]).filter((sample): sample is DeviceDaySample => sample !== undefined);
    const median = lowerMedian(day);
    if (median === undefined) continue;
    for (const sample of day) {
      const disagreement = ((sample.value - median.value) / SIGMA_EFF.height.value) ** 2;
      const values = disagreementsByDevice.get(sample.device_id) ?? [];
      values.push(disagreement);
      disagreementsByDevice.set(sample.device_id, values);
    }
  }

  const population = [...disagreementsByDevice.values()].flat();
  if (population.length === 0) return [...samples];
  const populationMean = population.reduce((sum, value) => sum + value, 0) / population.length;
  const disagreementByDevice = new Map(
    [...disagreementsByDevice].map(([deviceId, values]) => {
      // One shared morning is a data point, not a chronic pattern.  It keeps
      // the reporter at full voice and lets the repeated-history calculation
      // below start only when there is a pattern to shrink.
      if (values.length < 2) return [deviceId, undefined] as const;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const shrunk = (values.length * mean + CONCORDANCE_TAU * populationMean) / (values.length + CONCORDANCE_TAU);
      return [deviceId, shrunk] as const;
    }),
  );
  return samples.map((sample) => ({
    ...sample,
    weight: sample.weight * concordanceWeight(disagreementByDevice.get(sample.device_id)),
  }));
}

function positionsGroupedBySpotDay(samples: readonly DeviceDaySample[]): Map<string, number[]> {
  const positionsByDay = new Map<string, number[]>();
  for (const [index, sample] of samples.entries()) {
    if (sample.spot_id === undefined || sample.session_day === undefined) continue;
    const key = `${sample.spot_id}\u0000${sample.session_day}`;
    const positions = positionsByDay.get(key) ?? [];
    positions.push(index);
    positionsByDay.set(key, positions);
  }
  return positionsByDay;
}

function lowerMedian(samples: readonly DeviceDaySample[]): DeviceDaySample | undefined {
  const ordered = [...samples].sort((left, right) => left.value - right.value);
  return ordered[Math.floor((ordered.length - 1) / 2)];
}
