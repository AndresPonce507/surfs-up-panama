// WHY-NEW-FILE: src/styles/chrome-colors.ts
//   CLOSEST-EXISTING: src/styles/tokens.css
//   EXTENSION-COST: CSS cannot export a build-time value to document metadata or an Astro endpoint.
//   PARALLEL-RATIONALE: This server-only reader bridges the token authority to two build outputs without shipping JavaScript.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function backgroundIn(source: string): string {
  const match = source.match(/--bg\s*:\s*(#[0-9a-f]{6})\b/i);
  if (match?.[1] === undefined) throw new Error('chrome colors: --bg token is required');
  return match[1];
}

const darkThemeScope = ':root[data-theme="dark"]';
const darkOffset = tokens.indexOf(darkThemeScope);
if (darkOffset < 0) throw new Error('chrome colors: dark token scope is required');

export const lightChromeColor = backgroundIn(tokens.slice(0, darkOffset));
export const darkChromeColor = backgroundIn(tokens.slice(darkOffset));
