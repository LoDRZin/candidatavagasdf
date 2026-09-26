import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { build } from 'esbuild';
import { SignJWT } from 'jose';

let worker;
const secret = 'test-only-admin-credential-at-least-32-characters';
const origin = 'https://example.test';
const paths = ['/dashboard', '/dashboard///', '/editor', '/entrevistas', '/aprender', '/orientacao', '/chat-ia', '/uso', '/carta', '/seguranca-da-vaga', '/modelos-de-contato', '/cursos', '/cursos/exemplo', '/cursos/exemplo/aulas/1', '/meu-aprendizado', '/perfil-profissional', '/historias', '/candidaturas', '/candidaturas/1', '/candidaturas/1/materiais', '/candidaturas/1/entrevista', '/conta', '/admin', '/admin/cursos'];
function environment() {
  return { ADMIN_TOKEN: secret, ACCESS_REQUIRED: 'false', ASSETS: { fetch: async () => new Response('application shell') }, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ count: 1 }) }) }) } };
}
async function request(path, { method = 'GET', body, headers = {}, env = environment() } = {}) {
  return worker.fetch(new Request(origin + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: origin }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
}
async function login() {
  const response = await request('/api/admin-session', { method: 'POST', body: { token: secret } });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie');
}
before(async () => {
  if (!crypto.subtle.timingSafeEqual) Object.defineProperty(crypto.subtle, 'timingSafeEqual', { value: timingSafeEqual });
  await mkdir('.test-artifacts', { recursive: true });
  await build({ entryPoints: ['worker/index.ts'], outfile: '.test-artifacts/admin-worker.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  worker = (await import(pathToFileURL(resolve('.test-artifacts/admin-worker.mjs')).href)).default;
});
test('todas as páginas de ferramentas negam visitante, cookie comum e sessão forjada', async () => {
  for (const path of paths) for (const Cookie of ['', 'cv_session=ordinary-account', 'cv_admin_session=forged']) {
    const response = await request(path, { headers: { Cookie } });
    assert.equal(response.status, 302, path);
    const destination = path.startsWith('/admin') ? '/acesso-admin?returnTo=' : '/login?returnTo=';
    assert.ok(response.headers.get('location').startsWith(destination), path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), '');
  }
});
test('conteúdo público é acessível e APIs privadas exigem a sessão adequada', async () => {
  const publicEnv = { ...environment(), DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } };
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await request('/api/content', { method, env: publicEnv });
    assert.equal(response.status, method === 'GET' ? 200 : 405, `${method} /api/content`);
    if (method === 'GET') assert.deepEqual(await response.json(), { content: [] });
  }
  for (const path of ['/api/courses', '/api/courses/1', '/api/lessons/1', '/api/resumes', '/api/account', '/api/account/export', '/api/applications', '/api/career-stories', '/api/cover-letters', '/api/interviews', '/api/me/learning', '/api/reminders', '/api/feedback', '/api/ai/assist', '/api/ai/chat', '/api/ai/resume/structure']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await request(path, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal((await response.json()).error.code, 'AUTH_REQUIRED', `${method} ${path}`);
    }
  }
  for (const path of ['/api/admin/content', '/api/admin/courses', '/api/admin/users', '/api/admin/usage']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await request(path, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  }
});
test('sessão administrativa permite apenas páginas administrativas, usa cookie seguro e sai sem expor o segredo', async () => {
  const setCookie = await login();
  assert.match(setCookie, /HttpOnly; SameSite=Strict/);
  assert.match(setCookie, /; Secure/);
  assert.match(setCookie, /Path=\//);
  assert.ok(!setCookie.includes(secret));
  const Cookie = setCookie.split(';')[0];
  for (const path of paths) {
    const response = await request(path, { headers: { Cookie } });
    assert.equal(response.status, path.startsWith('/admin') ? 200 : 302, path);
    if (!path.startsWith('/admin')) assert.ok(response.headers.get('location').startsWith('/login?returnTo='), path);
  }
  assert.deepEqual(await (await request('/api/admin-session', { headers: { Cookie } })).json(), { authenticated: true });
  const logout = await request('/api/admin-session', { method: 'DELETE', headers: { Cookie } });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/dashboard')).status, 302);
  assert.equal((await request('/dashboard', { headers: { Cookie }, env: { ...environment(), ADMIN_TOKEN: secret + '-rotated' } })).status, 302);
});
test('credencial incorreta, origem externa, configuração ausente e sessão expirada falham fechado', async () => {
  assert.equal((await request('/api/admin-session', { method: 'POST', body: { token: 'incorrect' } })).status, 401);
  assert.equal((await request('/api/admin-session', { method: 'POST', body: { token: secret }, headers: { Origin: 'https://attacker.test' } })).status, 403);
  assert.equal((await request('/api/admin-session', { method: 'POST', body: { token: secret }, env: { ...environment(), ADMIN_TOKEN: '' } })).status, 503);
  const key = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`conectavagasdf:admin-session:v1:${secret}`)));
  const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer('conectavagasdf').setAudience('administration').setSubject('administrator').setIssuedAt(Math.floor(Date.now()/1000)-7200).setExpirationTime(Math.floor(Date.now()/1000)-3600).sign(key);
  assert.equal((await request('/dashboard', { headers: { Cookie: `cv_admin_session=${expired}` } })).status, 302);
});
test('páginas públicas continuam acessíveis e login é limitado por tentativas', async () => {
  for (const path of ['/', '/login', '/cadastro', '/privacidade', '/termos', '/recuperar-senha', '/redefinir-senha', '/verificar-email', '/acesso-admin']) assert.equal((await request(path)).status, 200, path);
  assert.equal((await request('/api/health')).status, 200);
  const env = { ...environment(), DB: { prepare: () => ({ bind: () => ({ first: async () => ({ count: 6 }) }) }) } };
  assert.equal((await request('/api/admin-session', { method: 'POST', body: { token: secret }, env })).status, 429);
});
