// Scaffold skip-markers for slices that have not entered DELIVER yet.
//
// Slices 02 through 07 were authored ahead of their JIT turn on the owner's
// explicit 2026-08-10 instruction (recorded in distill/red-classification.md).
// Per ADR-025, DISTILL ships every scenario as a scaffold carrying a skip
// marker and DELIVER unskips one slice at a time; this hook IS that marker
// for a cucumber suite, because cucumber has no per-scenario skip annotation
// the runner would honour ahead of step matching.
//
// Unskip mechanics, two ways:
//   - permanently, when a slice enters DELIVER: delete its entry from
//     PENDING_SLICES below (one-line edit, the DELIVER RED gate's first move);
//   - for a RED run without editing anything: LEARNING_UNSKIP=slice-02 (comma
//     list) in the environment, which is how the pre-authoring RED runs in
//     distill/red-classification.md were produced.
//
// The hook is tag-scoped to this feature, so no other feature's scenarios can
// ever be skipped by it, and `strict: true` in cucumber.mjs still fails the
// run on any undefined step: every scaffolded scenario below has fully
// defined steps and a real oracle, proven RED per slice before being parked.

import { Before } from '@cucumber/cucumber';

const PENDING_SLICES = [
  'slice-06',
  'slice-07',
] as const;

function unskippedNow(): Set<string> {
  return new Set(
    (process.env['LEARNING_UNSKIP'] ?? '')
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token !== ''),
  );
}

for (const slice of PENDING_SLICES) {
  Before(
    { tags: `@feature-f-forecast-learns-from-the-beach and @${slice}` },
    function () {
      if (unskippedNow().has(slice)) return undefined;
      return 'skipped';
    },
  );
}
