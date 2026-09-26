import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'courses.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  outputDir: '.test-artifacts/courses-playwright',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/course-test-server.mjs',
    url: 'http://127.0.0.1:4178/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
