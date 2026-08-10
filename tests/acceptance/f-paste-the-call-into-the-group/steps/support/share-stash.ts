// Per-scenario state shared by every steps file of this feature.
//
// The stash was born module-private inside the slice-01 steps file. Slices 02
// to 05 reuse slice-01's Given/When vocabulary (the chained-narrative rule:
// the same step method, never a copy-pasted fixture), which means their Then
// oracles need to read the state those steps produced. Moving the stash here
// keeps a single World-free WeakMap for the whole feature, so no steps file
// ever registers a second cucumber World beside the pipeline one.

import assert from 'node:assert/strict';

import type { ExpectedShare, OpenHome } from './built-share-surface';

export type PasteWorld = object;

/** What one tap on the copy action was observed to do. */
export type CopyTapOutcome = {
  /** Copy controls found on the surface when the tap was attempted. */
  readonly controlCount: number;
  /** Whether a control existed to tap at all. */
  readonly tapped: boolean;
  /** Visible share-area text before the tap, for the notice diff. */
  readonly textBefore: string;
};

/** One publish run of the real `npm run build`, output captured. */
export type PublishRun = {
  readonly status: number | null;
  readonly output: string;
};

export type Stash = {
  root?: string;
  home?: OpenHome;
  expected?: ExpectedShare;
  originalSiteHost?: string;
  // Slice-02: the copy action.
  copyTap?: CopyTapOutcome;
  requestsAfterTap?: string[];
  // Slice-04: publish runs and the cards each one emitted.
  intactPublish?: PublishRun;
  degradedPublish?: PublishRun;
  intactCards?: { readonly path: string; readonly bytes: Buffer }[];
  degradedCards?: { readonly path: string; readonly bytes: Buffer }[];
  strippedSpotIds?: string[];
  previousCard?: { readonly address: string; readonly bytes: Buffer };
  previousStamp?: string;
  // Slice-05: the spot whose page is being shared from. Spot routes need the
  // daemonising astro preview (keystone slice-06 precedent: raw vite preview
  // SPA-falls-back to the home for directory-style hrefs), so the daemon pid
  // is kept for the slice-05 After hook to kill.
  spotExpected?: ExpectedShare;
  spotPagePath?: string;
  previewDaemonPid?: number;
  // Slice-03: the pure announcement and the two disposable Base-layout probes.
  announcementInput?: { readonly spotName: string; readonly score: number; readonly site: string };
  announcement?: { readonly title: string; readonly description: string; readonly url: string; readonly locale: string };
  announcementProbeHtml?: string;
  bareProbeHtml?: string;
};

const stashes = new WeakMap<PasteWorld, Stash>();

export function stash(world: PasteWorld): Stash {
  let state = stashes.get(world);
  if (state === undefined) {
    state = {};
    stashes.set(world, state);
  }
  return state;
}

export function dropStash(world: PasteWorld): void {
  stashes.delete(world);
}

export function peekStash(world: PasteWorld): Stash | undefined {
  return stashes.get(world);
}

export function requiredRoot(state: Stash): string {
  assert.ok(state.root !== undefined, 'test fixture error: the isolated surface copy is required');
  return state.root;
}

export function requiredHome(state: Stash): OpenHome {
  assert.ok(state.home !== undefined, 'test fixture error: the built home must be open');
  return state.home;
}

export function requiredExpected(state: Stash): ExpectedShare {
  assert.ok(state.expected !== undefined, 'test fixture error: the expected share values are required');
  return state.expected;
}
