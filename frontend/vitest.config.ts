import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 60_000, // generous for crypto operations
    // e2e/ holds Playwright specs — run them with `pnpm test:e2e`. Vitest would
    // otherwise collect them and fail on Playwright's own `test.describe()`.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
