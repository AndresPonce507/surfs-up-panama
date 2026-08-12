/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// In-process tests: the scoring engine's declared laws as property tests,
// and unit tests for pure functions. The test pyramid here is deliberate
// (nWave default, ratified 2026-07-18): exactly ONE subprocess end-to-end
// per feature, everything else driven in memory. Multiplying end-to-end
// scenarios to "prove wiring" is the speed regression that default exists
// to prevent.
//
// `getViteConfig` rather than vitest's own `defineConfig` (step 01-03): it is
// the only supported way to hand vitest Astro's compiler, without which a
// `.astro` component cannot be imported at all ("content contains invalid JS
// syntax") and the container-API render test for a component is impossible.
// Every option below is unchanged from the plain-vitest config it replaces.
export default getViteConfig({
  test: {
    include: ['tests/**/*.{test,spec}.ts', 'infra/test/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', '.astro', 'tests/**/e2e/**'],
    environment: 'node',
    passWithNoTests: true,
    // One production build for the whole run, before any worker starts. The
    // files whose oracle is emitted HTML used to spawn a build each, and four
    // concurrent `astro build` runs collide on the single shared
    // `node_modules/.vite/deps` cache every isolated copy reaches through its
    // `node_modules` symlink. Same collision ci-local-core.mjs already makes
    // `budget` and `leak` serial for; the `test` job was missed because its
    // builds are inside vitest rather than in the job list. Full reproduction
    // and the observed errors: tests/common/built-site.ts.
    globalSetup: ['tests/common/built-site.ts'],
    // Property tests explore a space, so a failure needs the seed to be
    // reproducible. fast-check prints it; this keeps the run deterministic
    // enough to act on.
    sequence: { shuffle: false },
  },
});
