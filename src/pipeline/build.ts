// The hourly build run. RED SCAFFOLD, created by DISTILL 2026-08-08.
//
// Contract: 04-ingest-pipeline.md section 3 steps 9-11 plus section 6.
// Reads the newest usable snapshot per (spot, source) with run_ts <= build
// time (domain-model section 6), seeds, current/ corrections. Scores through
// the pure core (src/scoring). Writes, in this order:
//   log/calls/v1/dt=<date>/build=<HH>Z/<region>...  (the PublishedCall log)
//   pub/v1/regions/<region>/bundle.json             (builder render input)
//   pub/v1/manifest.json LAST                       (the commit marker)
// Partial-failure rule (04 section 6): a spot publishes with >= 1 usable wave
// member; zero usable members across every spot means REFUSE to publish: the
// previous artifacts keep serving and the manifest stamp does not advance.
// The build never fetches; the log is the only contract with the fetch run.

export const __SCAFFOLD__ = true;

import type { BuildDeps, BuildOutcome } from './ports';

export async function runBuildOnce(_deps: BuildDeps): Promise<BuildOutcome> {
  throw new Error(
    '__SCAFFOLD__ assertion: the build run is not implemented yet. ' +
      'This seam is authored by DISTILL; DELIVER slice-01 makes it real.',
  );
}
