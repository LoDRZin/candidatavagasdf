import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

let routes;

before(async () => {
  await mkdir('.test-artifacts', { recursive: true });
  await build({
    entryPoints: ['src/platform/routes.ts'],
    outfile: '.test-artifacts/routes.mjs',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
  });
  routes = await import(`${pathToFileURL(resolve('.test-artifacts/routes.mjs')).href}?${Date.now()}`);
});

test('contrato de rotas aceita apenas caminhos conhecidos e normaliza barras finais', () => {
  assert.deepEqual(routes.matchRoute('/dashboard'), { kind: 'app' });
  assert.deepEqual(routes.matchRoute('/dashboard///'), { kind: 'app' });
  assert.deepEqual(routes.matchRoute('/chat-ia'), { kind: 'ai-chat' });
  assert.deepEqual(routes.matchRoute('/uso'), { kind: 'usage' });
  assert.deepEqual(routes.matchRoute('/admin'), { kind: 'admin-dashboard' });
  assert.deepEqual(routes.matchRoute('/candidaturas/abc/materiais'), { kind: 'application-materials', applicationId: 'abc' });
  assert.deepEqual(routes.matchRoute('/cursos/primeiro/aulas/aula-1'), { kind: 'lesson', slug: 'primeiro', id: 'aula-1' });
  assert.deepEqual(routes.matchRoute('/editor/fantasma'), { kind: 'not-found' });
  assert.deepEqual(routes.matchRoute('/rota-fantasma'), { kind: 'not-found' });
  assert.match(routes.routeTitle({ kind: 'not-found' }), /Página não encontrada/);
});

test('service worker não trata API nem áreas privadas como conteúdo offline público', async () => {
  const source = await readFile('public/sw.js', 'utf8');
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /MAX_STATIC_ENTRIES = 40/);
  const safeRoutes = source.match(/const SAFE_OFFLINE_ROUTES = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
  for (const privatePath of ['/dashboard', '/candidaturas', '/cursos', '/conta']) {
    assert.equal(safeRoutes.includes(`'${privatePath}'`), false, `${privatePath} não pode ser rota offline segura`);
  }
});
