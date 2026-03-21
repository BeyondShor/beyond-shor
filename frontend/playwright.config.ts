import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration.
 *
 * By default Playwright reuses a running dev server (reuseExistingServer: true).
 * If no server is running on port 3000, it starts `pnpm dev` automatically.
 *
 * Note: The Strapi backend (port 1337) should be running for tests that depend
 * on Strapi content. The playground itself (crypto operations) works without it.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,   // crypto tests are CPU-heavy; run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 120_000,        // global test timeout (covers McEliece ~30 s + page overhead)
  expect: { timeout: 90_000 }, // assertion timeout (waiting for async crypto to finish)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
