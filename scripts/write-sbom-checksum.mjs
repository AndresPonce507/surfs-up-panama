#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [path] = process.argv.slice(2);
if (path === undefined) throw new Error('usage: write-sbom-checksum.mjs <sbom-path>');
const checksum = createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(`${path}.sha256`, `${checksum}  ${path}\n`);
process.stdout.write(`SBOM SHA-256 written to ${path}.sha256\n`);
