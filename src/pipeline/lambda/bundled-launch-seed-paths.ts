import { fileURLToPath } from 'node:url';

/** The CDK bundler copies these immutable launch inputs beside the handler. */
export const bundledLaunchSeedPaths = {
  sourceSeedPath: fileURLToPath(new URL('./data/spots/pa-pacific.yaml', import.meta.url)),
  policyPath: fileURLToPath(new URL('./data/spots/pa-pacific-launch-v1.json', import.meta.url)),
} as const;
