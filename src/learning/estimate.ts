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

import { PHYSICAL_NOISE_FLOOR_MULTIPLIER } from './constants';

export type WeightedSample = { readonly value: number; readonly weight: number };

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

function totalWeightOf(samples: readonly WeightedSample[]): number {
  return samples.reduce((sum, sample) => sum + sample.weight, 0);
}
