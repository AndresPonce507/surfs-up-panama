// Scenario gates for future slices of f-show-our-track-record.
//
// Slice-02 is buildable but has not entered DELIVER. Its scenarios therefore
// carry @pending individually: they stay in the feature contract but do not
// pollute the untagged regression suite. Its DELIVER entry removes @pending
// scenario by scenario before it records the required RED run. The temporary
// environment switch below exists only to prove that preserved contract in a
// contained RED run; it is not activation and must not appear in CI.
//
// The block is real, not procedural: ZERO surf reports have ever been filed,
// no write store is deployed, and none of that can be seeded or fabricated
// without shipping the one lie this product exists to never tell
// (feature-delta.md, Slice Plan rows slice-03/04/05; red-classification.md
// contract row 4). Every scenario in those slices carries
// @blocked-on-real-reports and is skipped whole by this hook.
//
// Unblock protocol, deliberate and single-path: when the write path is
// deployed and real reports exist (and, for slice-04, the claim copy is
// settled by Andres and the key-selection rule is pinned), the slice
// re-enters DISTILL, the tag is removed scenario by scenario, the RED run is
// recorded in distill/red-classification.md, and only then does DELIVER
// start. Removing the tag early lights nothing up: the Given steps behind
// this gate fail loudly naming the exact open pre-requisite.

import { Before } from '@cucumber/cucumber';

const PENDING_ACTIVATION_ENV = 'F_SHOW_OUR_TRACK_RECORD_ACTIVATE_PENDING';

Before({ tags: '@pending' }, function () {
  if (process.env[PENDING_ACTIVATION_ENV] === '1') return undefined;
  return 'skipped';
});

Before({ tags: '@blocked-on-real-reports' }, function () {
  return 'skipped';
});
