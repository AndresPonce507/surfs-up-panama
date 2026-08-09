// @ts-check
import { defineConfig } from 'astro/config';

import { pageWeightBudgetIntegration } from './scripts/page-weight-core.mjs';

// Static output only. The deployed artifact is files on S3 + CloudFront; the
// hourly publish job regenerates HTML routes. No SSR, no adapter, no server
// runtime (docs/product/architecture/adr-publish-time-html-rendering.md).
//
// The page-weight gate runs at the end of every build, against the directory
// that build actually emitted. Wiring it here rather than after `astro build`
// in the npm script means it measures whatever `--outDir` produced, and that a
// build breaking the two-second beach-3G promise cannot finish successfully
// (R36, application-architecture.md sections 4 and 5).
export default defineConfig({
  // The one owner of the absolute host. Every consumer (the WhatsApp share
  // `{url}` line, `og:url`, the canonical) reads the configured `site` and
  // never a hardcoded string, so registering a real domain later is this one
  // edit plus a republish, not rework.
  //
  // No domain is registered yet; Andres decided 2026-08-09 to build against
  // the CloudFront hostname rather than block the share feature on it. Known
  // cost, accepted with the decision: this hostname appears in every pasted
  // message until the domain lands (HANDOFF.md section 10).
  site: 'https://d1j9u9fxnap4es.cloudfront.net',
  output: 'static',
  build: {
    format: 'file',
  },
  // The measurement is written straight to the streams rather than through
  // Astro's logger: the route-by-route list is the artefact a reader (and the
  // acceptance suite) parses, and a log prefix would corrupt it.
  integrations: [pageWeightBudgetIntegration()],
});
