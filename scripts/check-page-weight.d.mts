export interface PageWeightOutputPort {
  write(line: string): void;
  error?(line: string): void;
}

export interface PageWeightResult {
  exitCode: number;
  lines: string[];
}

/**
 * Measures every emitted route document, and every first-visit asset it
 * references, against the ceilings declared in
 * `docs/product/architecture/application-architecture.md` sections 4 and 5.
 * Returns a non-zero exit code for anything over a ceiling and for anything it
 * could not measure.
 */
export function evaluatePageWeight(options: {
  distRoot: string;
  output: PageWeightOutputPort;
}): Promise<PageWeightResult>;

/**
 * The build-time wiring. Its `astro:build:done` hook measures the directory the
 * build emitted and throws when the gate refuses, so a build that breaks a
 * ceiling cannot finish successfully. `output` is injectable for tests; a real
 * build leaves it unset and the measurement goes to the streams.
 */
export function pageWeightBudgetIntegration(): {
  name: string;
  hooks: {
    'astro:build:done': (options: { dir: URL; output?: PageWeightOutputPort }) => Promise<void>;
  };
};

export const defaultRepoRoot: string;

export function distRootFrom(argv: readonly string[], repoRoot?: string): string;
