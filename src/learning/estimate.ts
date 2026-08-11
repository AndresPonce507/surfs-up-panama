// The weighted mean and its standard error, 06-learning-layer.md sections
// 5.2 and 6.1: general statistical primitives over any list of weighted
// residual samples, used identically for the height key and the score key.
// Pure functions only; nothing here reads a store, a clock, or a gate.
//
// se_sample is "the weighted sample standard deviation of the key's residual
// samples divided by sqrt(n)" (06 section 7, G3), computed here as the
// population-weighted variance (dividing by the total weight, not by n-1):
// with a single sample there is no spread to measure and the formula must
// say so as 0, never throw or invent one.

import {
  PHYSICAL_NOISE_FLOOR_MULTIPLIER,
  REPORTER_OFFSET_BACKFIT_ITERATIONS,
  TAU_REPORTER_OFFSET,
} from './constants';

export type WeightedSample = { readonly value: number; readonly weight: number };

/** One already-weighted height residual, keyed to the spot/model/lead estimate it informs. */
export type ReporterOffsetSample = WeightedSample & {
  readonly key: string;
  readonly reporter: string;
  readonly spotId: string;
};

/** Sigma(w_i * v_i) / Sigma(w_i). A sample with no total weight has nothing to average and reads as 0. */
export function weightedMean(samples: readonly WeightedSample[]): number {
  const totalWeight = totalWeightOf(samples);
  if (totalWeight === 0) return 0;
  return samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / totalWeight;
}

/** se_sample: sqrt(weighted variance) / sqrt(n). Fewer than one usable sample, or zero total weight, reads as 0. */
export function weightedSampleStandardError(samples: readonly WeightedSample[]): number {
  const n = samples.length;
  if (n === 0) return 0;
  const totalWeight = totalWeightOf(samples);
  if (totalWeight === 0) return 0;
  const mean = weightedMean(samples);
  const weightedVariance =
    samples.reduce((sum, sample) => sum + sample.weight * (sample.value - mean) ** 2, 0) / totalWeight;
  return Math.sqrt(weightedVariance) / Math.sqrt(n);
}

/**
 * G3's irreducible uncertainty for one claim-bearing variable. `sampleCount`
 * is the count the gate actually considers, so once trust eligibility removes
 * a sample this denominator follows the stored, eligible `n` too.
 */
export function physicalNoiseFloor(sigmaEff: number, sampleCount: number): number {
  if (sampleCount <= 0) return 0;
  return PHYSICAL_NOISE_FLOOR_MULTIPLIER * sigmaEff / Math.sqrt(sampleCount);
}

/**
 * se_gate = max(se_sample, physical floor). Agreement can reduce a sample's
 * measured spread only until this physical limit, never past it.
 */
export function gateStandardError(sampleStandardError: number, sigmaEff: number, sampleCount: number): number {
  return Math.max(sampleStandardError, physicalNoiseFloor(sigmaEff, sampleCount));
}

/** The ADR's n / (n + tau_u) shrinkage, deliberately toward zero rather than a population mean. */
export function shrinkReporterOffset(rawOffset: number, reportCount: number): number {
  if (reportCount <= 0) return 0;
  return (reportCount / (reportCount + TAU_REPORTER_OFFSET)) * rawOffset;
}

/** An unknown reporter has no history and therefore enters the fit at exactly zero. */
export function reporterOffsetOf(offsets: ReadonlyMap<string, number>, reporter: string): number {
  return offsets.get(reporter) ?? 0;
}

/**
 * Three fixed backfitting passes for the two-way additive height model. Each
 * key mean is recomputed from the current reporter terms, then every reporter
 * term is recomputed from its keys and shrunk toward zero. The returned map is
 * transient fit state only and must never cross the correction-file boundary.
 */
export function fitReporterOffsets(samples: readonly ReporterOffsetSample[]): Map<string, number> {
  let offsets = new Map<string, number>();
  const reportersAcrossSpots = reportersSpanningAtLeastTwoSpots(samples);
  for (let iteration = 0; iteration < REPORTER_OFFSET_BACKFIT_ITERATIONS; iteration += 1) {
    const meansByKey = weightedMeansByKey(samples, offsets);
    offsets = shrunkenOffsetsByReporter(samples, meansByKey, offsets, reportersAcrossSpots);
  }
  return offsets;
}

function weightedMeansByKey(
  samples: readonly ReporterOffsetSample[],
  offsets: ReadonlyMap<string, number>,
): Map<string, number> {
  const grouped = new Map<string, WeightedSample[]>();
  for (const sample of samples) {
    const group = grouped.get(sample.key) ?? [];
    group.push({ value: sample.value + reporterOffsetOf(offsets, sample.reporter), weight: sample.weight });
    grouped.set(sample.key, group);
  }
  return new Map([...grouped].map(([key, group]) => [key, weightedMean(group)]));
}

function shrunkenOffsetsByReporter(
  samples: readonly ReporterOffsetSample[],
  meansByKey: ReadonlyMap<string, number>,
  offsets: ReadonlyMap<string, number>,
  reportersAcrossSpots: ReadonlySet<string>,
): Map<string, number> {
  const grouped = new Map<string, WeightedSample[]>();
  const totalsByKey = new Map<string, { weightedValue: number; weight: number }>();
  const ownTotalsByKeyReporter = new Map<string, { weightedValue: number; weight: number }>();
  for (const sample of samples) {
    const adjustedValue = sample.value + reporterOffsetOf(offsets, sample.reporter);
    const keyTotal = totalsByKey.get(sample.key) ?? { weightedValue: 0, weight: 0 };
    keyTotal.weightedValue += adjustedValue * sample.weight;
    keyTotal.weight += sample.weight;
    totalsByKey.set(sample.key, keyTotal);
    const ownKey = `${sample.key}\u0000${sample.reporter}`;
    const ownTotal = ownTotalsByKeyReporter.get(ownKey) ?? { weightedValue: 0, weight: 0 };
    ownTotal.weightedValue += adjustedValue * sample.weight;
    ownTotal.weight += sample.weight;
    ownTotalsByKeyReporter.set(ownKey, ownTotal);
  }
  for (const sample of samples) {
    if (!reportersAcrossSpots.has(sample.reporter)) continue;
    const keyMean = leaveReporterOutMean(sample, totalsByKey, ownTotalsByKeyReporter) ?? meansByKey.get(sample.key);
    if (keyMean === undefined) continue;
    const group = grouped.get(sample.reporter) ?? [];
    group.push({ value: keyMean - sample.value, weight: sample.weight });
    grouped.set(sample.reporter, group);
  }
  return new Map(
    [...grouped].map(([reporter, group]) => [reporter, shrinkReporterOffset(weightedMean(group), group.length)]),
  );
}

/** One spot cannot separate a reporter habit from the spot bias, so it remains at zero. */
function reportersSpanningAtLeastTwoSpots(samples: readonly ReporterOffsetSample[]): Set<string> {
  const spotsByReporter = new Map<string, Set<string>>();
  for (const sample of samples) {
    const spots = spotsByReporter.get(sample.reporter) ?? new Set<string>();
    spots.add(sample.spotId);
    spotsByReporter.set(sample.reporter, spots);
  }
  return new Set(
    [...spotsByReporter]
      .filter(([_reporter, spots]) => spots.size >= 2)
      .map(([reporter]) => reporter),
  );
}

/**
 * The reporter update uses the key estimate contributed by everybody else.
 * With no other voice, fall back to the key estimate so an unidentifiable
 * one-person spot remains governed by ordinary zero shrinkage rather than an
 * invented leave-one-out value.
 */
function leaveReporterOutMean(
  sample: ReporterOffsetSample,
  totalsByKey: ReadonlyMap<string, { weightedValue: number; weight: number }>,
  ownTotalsByKeyReporter: ReadonlyMap<string, { weightedValue: number; weight: number }>,
): number | undefined {
  const total = totalsByKey.get(sample.key);
  const own = ownTotalsByKeyReporter.get(`${sample.key}\u0000${sample.reporter}`);
  if (total === undefined || own === undefined) return undefined;
  const otherWeight = total.weight - own.weight;
  if (otherWeight <= 0) return undefined;
  return (total.weightedValue - own.weightedValue) / otherWeight;
}

function totalWeightOf(samples: readonly WeightedSample[]): number {
  return samples.reduce((sum, sample) => sum + sample.weight, 0);
}
