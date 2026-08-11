import { defineConfig, devices } from '@playwright/test';

const configuredPreviewUrl = process.env.PREVIEW_URL;
const previewPort =
  process.env.PREVIEW_PORT ??
  (configuredPreviewUrl ? new URL(configuredPreviewUrl).port || '4322' : '4322');
const previewUrl = configuredPreviewUrl ?? `http://127.0.0.1:${previewPort}`;

// The single walking-skeleton end-to-end per feature, plus the surface Vera
// walks when she examines a slice against its charter.
//
// Mobile viewport is the default on purpose, not an afterthought: nearly
// every real visit is a phone, outdoors, one-handed, on bad signal
// (DISCUSS decision 25). Testing desktop-first would test a case that
// barely exists.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/e2e/**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: true, // a stray .only would silently green the suite
  retries: 0, // a flaky acceptance test is a defect, not a retry candidate
  reporter: [['list']],
  use: {
    baseURL: previewUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
    url: previewUrl,
    reuseExistingServer: false,
  },
});
