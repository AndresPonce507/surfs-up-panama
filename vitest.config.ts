import { defineConfig } from 'vitest/config';

// In-process tests: the scoring engine's declared laws as property tests,
// and unit tests for pure functions. The test pyramid here is deliberate
// (nWave default, ratified 2026-07-18): exactly ONE subprocess end-to-end
// per feature, everything else driven in memory. Multiplying end-to-end
// scenarios to "prove wiring" is the speed regression that default exists
// to prevent.
export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.ts', 'infra/test/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.astro', 'tests/**/e2e/**'],
    environment: 'node',
    passWithNoTests: true,
    // Property tests explore a space, so a failure needs the seed to be
    // reproducible. fast-check prints it; this keeps the run deterministic
    // enough to act on.
    sequence: { shuffle: false },
  },
});
