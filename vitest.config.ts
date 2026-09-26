import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: { include: ['tests/worker/**/*.spec.ts'] },
});
