#!/usr/bin/env node
// The CLI adapter intentionally contains no orchestration logic. `runLocalCi`
// is the stable production composition entry for the command and for callers
// that need an in-process, captured result.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runLocalCi } from './ci-local-core.mjs';

export async function evaluateInfrastructureDeclarations(options) {
  const { evaluateInfrastructureDeclarations: evaluate } = await import(
    '../infra/guardrail-evaluator.mjs'
  );
  return evaluate(options);
}

export { runLocalCi } from './ci-local-core.mjs';

const invokedAsCli = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  process.exitCode = await runLocalCi({ argv: process.argv.slice(2) });
}
