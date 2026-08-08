// Acceptance test runner config.
//
// The Gherkin files are the specification. DISTILL authors every scenario
// before any production code exists, as a test that RUNS and fails on the
// behaviour being missing, not on an import error. DELIVER makes them pass
// and is not allowed to edit them.
//
// Two tags are mechanically load-bearing and the carpaccio gate reads both:
//   - file-level  @feature-<feature-id>  on the line above `Feature:`,
//     which is how the gate discovers the file at all
//   - per-scenario @slice-NN on EVERY scenario. Feature-level tags do not
//     inherit down to scenarios, so a @slice-NN sitting only above `Feature:`
//     binds to zero scenarios and the gate reports none for that slice.
//
// Steps are TypeScript, loaded through tsx so there is no build step between
// writing a test and running it.
//
// tsx is registered via NODE_OPTIONS="--import tsx" in the npm script, NOT
// via cucumber's `loader` key. Node deprecated --loader in 20.6 and tsx now
// refuses it outright, which fails with "tsx must be loaded with --import".
// Verified against tsx 4.23 on Node 26, 2026-08-08. If you move this back
// into the config, run `npm run test:at` before you believe it works.

export default {
  paths: ['tests/**/*.feature'],
  import: ['tests/**/steps/**/*.ts'],
  format: ['progress-bar', 'summary'],
  strict: true, // an undefined or pending step fails the run
  publish: false, // never phone home from a public repo
};
