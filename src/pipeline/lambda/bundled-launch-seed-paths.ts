// Both Lambda composition roots (fetch-handler.ts, build-handler.ts) need
// data/spots/{pa-pacific.yaml,pa-pacific-launch-v1.json} at runtime --
// loadLaunchSpotSeeds() and loadLaunchSpotCoordinates() both `readFileSync`
// them. Their built-in defaults resolve those paths against `process.cwd()`,
// which is not a Lambda-safe assumption to build the honest ingest run on.
// infra/lib/ingest-stack.ts's `afterBundling` hook copies both files
// alongside each function's own bundled entry file, so resolving them
// relative to *this module's own* `import.meta.url` is exact regardless of
// what directory the Lambda runtime happens to invoke the process from.

import { fileURLToPath } from 'node:url';

export const bundledLaunchSeedPaths = {
  sourceSeedPath: fileURLToPath(new URL('./data/spots/pa-pacific.yaml', import.meta.url)),
  policyPath: fileURLToPath(new URL('./data/spots/pa-pacific-launch-v1.json', import.meta.url)),
} as const;
