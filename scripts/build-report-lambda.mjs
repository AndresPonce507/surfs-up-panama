import { build } from 'esbuild';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

await build({
  entryPoints: [resolve(root, 'src/report/aws-lambda-adapter.ts')],
  outfile: resolve(root, 'infra/lambda-src/report-mint.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  // Node.js 22 Lambda carries AWS SDK v3. Keep it external so the asset is
  // small and uses the runtime's managed security updates.
  external: ['@aws-sdk/*'],
});
