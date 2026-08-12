// WHY-NEW-FILE: tests/common/built-site.ts
//   CLOSEST-EXISTING: tests/common/state_delta.ts
//   EXTENSION-COST: that module is a pure assertion helper with no lifecycle of
//     its own; a test imports it and calls it. This one owns a vitest
//     globalSetup entry point, which runs once in the main process before any
//     worker starts and is named by path in vitest.config.ts. Folding a
//     config-referenced lifecycle hook into an assertion library would make
//     every state-delta assertion drag a production build behind it.
//   PARALLEL-RATIONALE: different lifecycle and different process. The default
//     export runs in vitest's main process before workers exist; the named
//     exports run inside a worker and read what that process provided. They
//     cannot be one function, and state_delta.ts has no side of either.
//
// ONE production build per vitest run, shared by every test whose oracle is
// emitted HTML.
//
// The defect this removes, reproduced 2026-08-12 rather than assumed. Four
// unit files each spawned their own `npm run build`: staleness-flip,
// staleness-stamp, staleness-stamp-format and report-island. Each isolated
// project copy symlinks `node_modules` back to the worktree, so all four
// builds shared ONE vite dependency-optimiser cache at
// `node_modules/.vite/deps`. Vite swaps that directory with an
// rmdir-then-rename against a `deps_temp_<hash>` sibling, which is not safe
// across processes. Observed losers, both from real runs:
//
//   ENOTEMPTY: directory not empty, rmdir '<project>/node_modules/.vite/deps'
//   ENOENT: no such file or directory, rename '<...>/deps' -> '<...>/deps_temp_b51194ac'
//
// The build exits non-zero, the owning test reports "the build must succeed
// before its emitted HTML can be an oracle", and nothing about the product is
// wrong. It only fires when vite actually rewrites that cache -- a cold
// `npm ci`, a branch switch, a changed dependency graph -- which is why it
// reads as flake and why `--maxWorkers=4` looked like a fix. Fewer builds in
// flight only lowers the collision odds; it does not remove the shared
// directory.
//
// scripts/ci-local-core.mjs already settled this policy one level up: "Two
// concurrent `astro build` runs collide on the shared .astro/.prerender/.vite
// scratch directory, whatever --outDir each was given", which is why `budget`
// and `leak` are serial jobs in their own wave. The `test` job was never
// looked at, because the builds it spawns live inside vitest instead of in the
// job list. This applies the same settled rule there.
//
// A failed build is NOT thrown from setup. A globalSetup that throws aborts
// the whole run, which would turn one red seam into 380 uncollected tests. The
// exit status, stdout and stderr are handed to the tests, and each one asserts
// on them in its own words exactly as it did when it owned the build.

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { inject } from 'vitest';
import type { TestProject } from 'vitest/node';

/** What `npm run build` left behind, and what it said if it refused. */
export interface BuiltSite {
  /** The `dist` the build emitted. Never the worktree's shared `dist/`. */
  readonly outDir: string;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

declare module 'vitest' {
  interface ProvidedContext {
    readonly builtSite: BuiltSite;
  }
}

/** A clean checkout is the build input: only what the site is built from, so a
 * missing entry here fails the build rather than being silently supplied by
 * leftover scratch in the worktree. */
const BUILD_INPUT_FILES = ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json'] as const;
const BUILD_INPUT_DIRECTORIES = ['data', 'docs', 'public', 'scripts', 'src'] as const;

export default function buildSiteOnce(project: TestProject): () => void {
  const projectRoot = project.config.root;
  const testRoot = mkdtempSync(join(tmpdir(), 'surfs-up-built-site-'));
  const isolatedProject = join(testRoot, 'project');

  mkdirSync(isolatedProject);
  for (const name of BUILD_INPUT_FILES) {
    copyFileSync(join(projectRoot, name), join(isolatedProject, name));
  }
  for (const name of BUILD_INPUT_DIRECTORIES) {
    cpSync(join(projectRoot, name), join(isolatedProject, name), { recursive: true });
  }
  symlinkSync(join(projectRoot, 'node_modules'), join(isolatedProject, 'node_modules'), 'dir');

  const build = spawnSync('npm', ['run', 'build'], { cwd: isolatedProject, encoding: 'utf8' });
  project.provide('builtSite', {
    outDir: join(isolatedProject, 'dist'),
    status: build.status,
    stdout: build.stdout ?? '',
    stderr: build.stderr ?? '',
  });

  return () => rmSync(testRoot, { recursive: true, force: true });
}

/** The shared build's outcome. Assert `status` before reading a document: a
 * refused build emits nothing, and the reason belongs in the failure. */
export function builtSite(): BuiltSite {
  return inject('builtSite');
}

/** An emitted reading document, by its path inside the build output.
 *
 * A refused build emits nothing, so reading one would surface as ENOENT on a
 * path -- the wrong reason, and the real one thrown away. Callers assert
 * `status` first in their own words; this makes that a contract rather than a
 * convention, so a document read is never the thing that reports a build. */
export function builtDocument(relativePath: string): string {
  const built = builtSite();
  if (built.status !== 0) {
    throw new Error(`no ${relativePath}: the shared production build refused.\n${built.stdout}\n${built.stderr}`);
  }
  return readFileSync(resolve(built.outDir, relativePath), 'utf8');
}
