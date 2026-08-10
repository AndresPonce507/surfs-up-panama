// Shrinkage, 06-learning-layer.md section 5.3:
//
//   b_hat_level = (n / (n + tau)) * b_own + (tau / (n + tau)) * b_parent
//
// G4 (06 section 7): shrinkage is always on. This is the only function in
// this lane allowed to produce the value that reaches a stored `b`; every
// other module hands it a raw estimate and a parent, never the other way
// round. Pure, and total: n = 0 has no own evidence at all and collapses
// entirely onto the parent, which is exactly the n = 0 limit of partial
// pooling the design describes (06 section 5.3), not a special case bolted on.

/** How much of the shrunk estimate is the own evidence's share; the parent's share is `1 - ownWeight`. */
function ownWeight(n: number, tau: number): number {
  if (n <= 0) return 0;
  return n / (n + tau);
}

/**
 * b_hat = ownWeight * raw + (1 - ownWeight) * parent.
 *
 * This returns the full pooled estimate. It deliberately does not apply a
 * reader-facing clamp: the stored value must remain available for the
 * apply-time clamp in slice 02, while this function's only constraint is the
 * corridor from the raw estimate toward its parent.
 */
export function shrinkTowardParent(rawEstimate: number, n: number, tau: number, parentEstimate: number): number {
  // A one-spot hierarchy defines its parent from the same weighted mean. Keep
  // that mathematical identity exact instead of manufacturing rounding drift
  // while decomposing the same value into two weighted terms.
  if (rawEstimate === parentEstimate) return rawEstimate;
  const weight = ownWeight(n, tau);
  return weight * rawEstimate + (1 - weight) * parentEstimate;
}

/** The fraction of the shrunk estimate pulled from the parent, the `shrunk_from_global` field (domain-model.md section 11). */
export function shrinkageWeightFromParent(n: number, tau: number): number {
  return 1 - ownWeight(n, tau);
}
