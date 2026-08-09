export interface LocalCiOutputPort {
  write(line: string): void;
  error?(line: string): void;
}

export interface LocalCiCommandResult {
  status: number | null;
  out: string;
}

/**
 * The explicit environment passed to local-CI children. Supply `HOME` here
 * when a child needs an isolated home directory; local CI never mutates the
 * caller's global process environment.
 */
export type LocalCiEnvironment = Readonly<NodeJS.ProcessEnv>;

/**
 * A generic declaration source evaluated without treating it as a package,
 * CDK application, synth target, or fixture-specific executor.
 */
export interface LocalCiDeclarationInput {
  root: string;
  mode: 'declaration-only';
}

export type LocalCiCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
  env: LocalCiEnvironment,
) => Promise<LocalCiCommandResult>;

export function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: LocalCiEnvironment,
): Promise<LocalCiCommandResult>;

export interface LocalCiOptions {
  argv?: readonly string[];
  repoRoot?: string;
  output?: LocalCiOutputPort;
  commandRunner?: LocalCiCommandRunner;
  /** Preferred explicit child environment. Takes precedence over legacy `env`. */
  environment?: LocalCiEnvironment;
  /** Accepted RED seam for the future shared infrastructure declaration evaluator. */
  declarationInput?: LocalCiDeclarationInput | undefined;
  /** @deprecated Use `environment`. */
  env?: LocalCiEnvironment;
}

export interface InfrastructureDeclarationResult {
  exitCode: number;
  lines: string[];
}

export function evaluateInfrastructureDeclarations(options: {
  root: string;
  environment?: LocalCiEnvironment;
  output: LocalCiOutputPort;
}): Promise<InfrastructureDeclarationResult>;

/** Runs the production local-CI composition and returns its numerical exit result. */
export function runLocalCi(options?: LocalCiOptions): Promise<number>;
