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

import { PHYSICAL_NOISE_FLOOR_MULTIPLIER } from "./constants";

export type WeightedSample = {
  readonly value: number;
  readonly weight: number;
};

/** Sigma(w_i * v_i) / Sigma(w_i). A sample with no total weight has nothing to average and reads as 0. */
export function weightedMean(samples: readonly WeightedSample[]): number {
  const totalWeight = totalWeightOf(samples);
  if (totalWeight === 0) return 0;
  return (
    samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) /
    totalWeight
  );
}

/** se_sample: sqrt(weighted variance) / sqrt(n). Fewer than one usable sample, or zero total weight, reads as 0. */
export function weightedSampleStandardError(
  samples: readonly WeightedSample[],
): number {
  const n = samples.length;
  if (n === 0) return 0;
  const totalWeight = totalWeightOf(samples);
  if (totalWeight === 0) return 0;
  const mean = weightedMean(samples);
  const weightedVariance =
    samples.reduce(
      (sum, sample) => sum + sample.weight * (sample.value - mean) ** 2,
      0,
    ) / totalWeight;
  return Math.sqrt(weightedVariance) / Math.sqrt(n);
}

/** G3's irreducible error for one claim-bearing variable at the stored sample count. */
export function physicalNoiseFloor(
  sigmaEff: number,
  sampleCount: number,
): number {
  if (sampleCount <= 0) return 0;
  return (PHYSICAL_NOISE_FLOOR_MULTIPLIER * sigmaEff) / Math.sqrt(sampleCount);
}

/** Agreement may lower sample error only to the physical uncertainty floor, never below it. */
export function gateStandardError(
  sampleStandardError: number,
  sigmaEff: number,
  sampleCount: number,
): number {
  return Math.max(
    sampleStandardError,
    physicalNoiseFloor(sigmaEff, sampleCount),
  );
}

/**
 * 06 section 5.2's `u_hat[r] = (n_r / (n_r + tau_u)) * u_raw[r]`: a measured
 * habit, shrunk toward ZERO rather than toward any population average
 * (research 09 section 13.2). Toward zero is the load-bearing word. Shrinking
 * a reporter toward what other reporters do would import everybody else's
 * habits into theirs; zero is the only prior that says "we have not measured a
 * habit here", which is exactly the state a reporter starts in.
 *
 * At n_r = 0 it is exactly 0 and their report enters at face value. No finite
 * number of reports ever reaches the measured value: a habit fully trusted is
 * a habit fitted to noise.
 */
export function shrinkTowardZero(
  measured: number,
  reportCount: number,
  tau: number,
): number {
  if (reportCount <= 0) return 0;
  return (reportCount / (reportCount + tau)) * measured;
}

function totalWeightOf(samples: readonly WeightedSample[]): number {
  return samples.reduce((sum, sample) => sum + sample.weight, 0);
}
