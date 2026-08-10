// CONTROLLED FIXTURE UNIVERSE. Never imported, never copied into src.
//
// This universe declares a cross-validation whose folds shuffle time: random
// k-fold over mornings. Consecutive hours of one swell are near-duplicates,
// so shuffled splits leak the very thing they claim to hold out, and the
// monthly kill switch built on them would flatter every correction it judges
// (06 section 7 G7: random k-fold is banned outright and must be
// structurally absent, not merely unused). The examination must REFUSE this
// universe over the rule that held-out mornings stay forward of training.

export const CV_SCHEME = {
  kind: 'random_kfold',
  folds: 10,
  shuffle: true,
} as const;
