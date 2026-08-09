#!/usr/bin/env node
// covers: R36
// The CLI adapter intentionally contains no measurement logic.
// `evaluatePageWeight` is the stable production entry for the command and for
// callers that need an in-process, captured result.
//
//   npm run budget                 measure ./dist
//   npm run budget -- --dist PATH  measure any built output, tampered copies included

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { evaluatePageWeight } from './page-weight-core.mjs';

export { evaluatePageWeight, pageWeightBudgetIntegration } from './page-weight-core.mjs';

export const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function distRootFrom(argv, repoRoot = defaultRepoRoot) {
  const flag = argv.indexOf('--dist');
  const value = flag === -1 ? undefined : argv[flag + 1];
  return resolve(repoRoot, value ?? 'dist');
}

const invokedAsCli = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  const result = await evaluatePageWeight({
    distRoot: distRootFrom(process.argv.slice(2)),
    output: {
      write(line) {
        process.stdout.write(`${line}\n`);
      },
      error(line) {
        process.stderr.write(`${line}\n`);
      },
    },
  });
  process.exitCode = result.exitCode;
}
