import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'courses.spec.ts',
  use: { baseURL: 'http://localhost:5173', browserName: 'chromium' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173/api/health', reuseExistingServer: true, timeout: 60_000 },
});
