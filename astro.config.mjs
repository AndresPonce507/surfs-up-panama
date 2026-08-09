// @ts-check
import { defineConfig } from 'astro/config';

// Static output only. The deployed artifact is files on S3 + CloudFront; the
// hourly publish job regenerates HTML routes. No SSR, no adapter, no server
// runtime (docs/product/architecture/adr-publish-time-html-rendering.md).
export default defineConfig({
  output: 'static',
  build: {
    format: 'file',
  },
});
