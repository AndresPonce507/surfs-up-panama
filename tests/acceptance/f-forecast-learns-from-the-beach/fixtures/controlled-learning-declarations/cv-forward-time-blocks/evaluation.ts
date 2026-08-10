// CONTROLLED FIXTURE UNIVERSE. Never imported, never copied into src.
//
// This universe declares the one legal cross-validation shape: rolling-origin
// blocked time splits, training on the first eight weeks and testing on the
// held-out ninth and tenth, so the evaluation can never peek at the future or
// at a shuffled sibling of a training swell (06 section 7 G7;
// adr-correction-gates-and-clamps decision 3). The examination must ACCEPT
// this universe over the rule that held-out mornings stay forward of training.

export const CV_SCHEME = {
  kind: 'rolling_origin_blocked',
  train_weeks: [1, 8],
  test_weeks: [9, 10],
} as const;
