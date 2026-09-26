import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('rotas administrativas passam pelo Worker e assets públicos recebem cabeçalhos', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const routes = config.assets.run_worker_first;
  assert.equal(routes, true, 'Todo acesso direto deve passar pela autorização antes dos assets');

  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /^\/\*/m);
  assert.match(headers, /Content-Security-Policy:.*frame-ancestors 'none'/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/);
});

test('scripts de self-host não publicam na Cloudflare nem na Vercel', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.build, /build:selfhost/);
  assert.match(packageJson.scripts['start:selfhost'], /dist\/selfhost\/server\.js/);
  assert.match(packageJson.scripts['migrate:selfhost'], /dist\/selfhost\/cli\.js migrate/);
  assert.equal(packageJson.scripts.deploy, undefined);
  assert.equal(packageJson.scripts['deploy:staging'], undefined);
});
