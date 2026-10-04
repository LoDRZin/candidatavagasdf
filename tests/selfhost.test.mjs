import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';

let server;
let temporary;
let port;
let origin;
let dbPath;
let binaryDir;
let cookie;
let adminSessionCookie;
const adminPassword = 'senha-ficticia-so-para-teste-local-123456';
const adminToken = 'token-ficticio-so-para-teste-local-123456789';

async function freePort() {
  const socket = createServer();
  await new Promise((done, reject) => socket.once('error', reject).listen(0, '127.0.0.1', done));
  const selected = socket.address().port;
  await new Promise(done => socket.close(done));
  return selected;
}

function env() {
  return {
    ...process.env,
    DB_PATH: dbPath,
    APP_ORIGIN: origin,
    PORT: String(port),
    BIND_HOST: '127.0.0.1',
    ASSETS_DIR: join(temporary, 'assets'),
    MIGRATIONS_DIR: resolve('migrations'),
    SELFHOST_ALLOW_HTTP_LOCAL: 'true',
    LOCAL_MAIL_PREVIEW: 'true',
    ADMIN_GATE_USER: 'editor',
    ADMIN_GATE_PASSWORD: adminPassword,
    ADMIN_TOKEN: adminToken,
  };
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(method === 'GET' ? {} : { Origin: origin }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, data: await response.json().catch(() => null) };
}

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'conectavagasdf-selfhost-'));
  await mkdir(join(temporary, 'assets'));
  await writeFile(join(temporary, 'assets', 'index.html'), '<!doctype html><title>conectavagasdf selfhost smoke</title>');
  // O pacote nativo precisa resolver a dependência a partir do repositório.
  binaryDir = resolve('.test-artifacts', `selfhost-${Date.now()}`);
  await mkdir(binaryDir, { recursive: true });
  await build({ entryPoints: { server: 'selfhost/server.ts', cli: 'selfhost/cli.ts', preflight: 'selfhost/preflight.ts' }, outdir: binaryDir, bundle: true, format: 'esm', platform: 'node', target: 'node22', external: ['better-sqlite3'], logLevel: 'silent' });
  port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  dbPath = join(temporary, 'app.sqlite');
  execFileSync(process.execPath, [join(binaryDir, 'cli.js'), 'migrate'], { env: env(), cwd: process.cwd(), stdio: 'pipe' });
  server = spawn(process.execPath, [join(binaryDir, 'server.js')], { env: env(), cwd: process.cwd(), stdio: 'pipe' });
  let output = '';
  server.stderr.on('data', data => { output += data.toString(); });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error(`Servidor self-host terminou antes de iniciar: ${output}`);
    try { if ((await fetch(`${origin}/healthz`)).ok) return; } catch { /* espera pela porta local */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error(`Servidor self-host não iniciou: ${output}`);
}, { timeout: 30_000 });

after(() => { server?.kill(); });

test('self-host entrega SPA, saúde, cabeçalhos e protege o painel', async () => {
  const health = await request('/healthz');
  assert.equal(health.response.status, 200);
  assert.match(health.response.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/lodrzin\.github\.io/);
  assert.equal((await request('/api/health')).response.status, 200);
  const page = await fetch(`${origin}/dashboard`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login?returnTo=%2Fdashboard');
  const adminLogin = await request('/api/admin-session', { method: 'POST', body: { token: adminToken } });
  assert.equal(adminLogin.response.status, 200);
  adminSessionCookie = adminLogin.response.headers.get('set-cookie').split(';')[0];
  const adminDashboard = await fetch(`${origin}/dashboard`, { headers: { Cookie: adminSessionCookie }, redirect: 'manual' });
  assert.equal(adminDashboard.status, 302);
  assert.equal(adminDashboard.headers.get('location'), '/login?returnTo=%2Fdashboard');
  assert.equal((await fetch(`${origin}/.env.selfhost`)).status, 404);
  assert.equal((await fetch(`${origin}/admin`)).status, 401);
  const basic = Buffer.from(`editor:${adminPassword}`).toString('base64');
  const admin = await fetch(`${origin}/admin`, { headers: { Authorization: `Basic ${basic}`, Cookie: adminSessionCookie } });
  assert.equal(admin.status, 200);
  cookie = admin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('cv_admin_gate='));
  assert.equal((await request('/api/admin/content')).response.status, 403);
  assert.equal((await request('/api/admin/content', { headers: { Cookie: cookie } })).response.status, 401);
  const allowed = await request('/api/admin/content', { headers: { Cookie: `${cookie}; ${adminSessionCookie}`, Authorization: `Bearer ${adminToken}` } });
  assert.equal(allowed.response.status, 200);
  assert.deepEqual(allowed.data.content, []);
  const privateApi = await request('/api/resumes');
  assert.equal(privateApi.response.status, 401);
  assert.equal(privateApi.data.error.code, 'AUTH_REQUIRED');
  const missingApi = await request('/api/rota-fantasma');
  assert.equal(missingApi.response.status, 404);
  assert.equal(missingApi.data.error.code, 'NOT_FOUND');
});

test('self-host registra, confirma e autentica conta com o SQLite local', async () => {
  const email = `selfhost-${Date.now()}@example.test`;
  const password = 'uma frase de teste muito segura';
  const register = await request('/api/auth/register', { method: 'POST', body: { name: 'Pessoa Teste', email, password, terms: true } });
  assert.equal(register.response.status, 201, JSON.stringify(register.data));
  const sessionCookie = register.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(sessionCookie);
  const session = await request('/api/auth/session', { headers: { Cookie: sessionCookie } });
  assert.equal(session.data.user.email, email);
  const mail = await request('/api/auth/local-mail', { method: 'POST', body: { email }, headers: { Cookie: sessionCookie } });
  assert.equal(mail.response.status, 200);
  const token = new URLSearchParams(new URL(mail.data.messages[0].url).hash.slice(1)).get('token');
  const verified = await request('/api/auth/email/verify', { method: 'POST', body: { token } });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.data));
  const login = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  const authenticated = { Cookie: `${login.response.headers.get('set-cookie')?.split(';')[0]}; ${adminSessionCookie}` };
  const resumeData = { profile: { name: 'Pessoa Teste', headline: '', email, phone: '', location: '', website: '' }, summary: '', experiences: [], education: [], projects: [], certifications: [], skills: [], languages: [] };
  const created = await request('/api/resumes', { method: 'POST', body: { title: 'Currículo de teste', templateId: 'editorial-100', data: resumeData }, headers: authenticated });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const edited = await request(`/api/resumes/${created.data.id}`, { method: 'PUT', body: { title: 'Currículo revisado', templateId: 'editorial-100', data: resumeData, revision: 1 }, headers: authenticated });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.data));
  const versions = await request(`/api/resumes/${created.data.id}/versions`, { headers: authenticated });
  assert.equal(versions.response.status, 200);
  assert.equal(versions.data.versions.length, 2);
  const saved = await request('/api/account/export', { headers: authenticated });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.user.email, email);
  assert.equal(saved.data.resumes.length, 1);
});

test('backup online e checagem de integridade funcionam sem parar o servidor', async () => {
  const output = join(temporary, 'backup.sqlite');
  execFileSync(process.execPath, [join(binaryDir, 'cli.js'), 'backup', output], { env: env(), cwd: process.cwd(), stdio: 'pipe' });
  assert.ok((await stat(output)).size > 0);
  assert.match(execFileSync(process.execPath, [join(binaryDir, 'cli.js'), 'check'], { env: env(), cwd: process.cwd(), encoding: 'utf8' }), /"integrity":"ok"/);
  const header = await readFile(output);
  assert.equal(header.subarray(0, 16).toString(), 'SQLite format 3\0');
});

test('pré-voo distingue teste local de publicação sem e-mail ou IP real', () => {
  const local = spawnSync(process.execPath, [join(binaryDir, 'preflight.js')], { env: env(), cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr);
  const production = spawnSync(process.execPath, [join(binaryDir, 'preflight.js')], { env: { ...env(), APP_ORIGIN: 'https://curriculos.empresa.test', LOCAL_MAIL_PREVIEW: 'false', SELFHOST_ALLOW_HTTP_LOCAL: 'false' }, cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(production.status, 1);
  assert.match(production.stderr, /TRUSTED_CLIENT_IP_HEADER/);
  const withoutEmail = spawnSync(process.execPath, [join(binaryDir, 'preflight.js')], { env: { ...env(), APP_ORIGIN: 'https://curriculos.empresa.test', LOCAL_MAIL_PREVIEW: 'false', SELFHOST_ALLOW_HTTP_LOCAL: 'false', TRUSTED_CLIENT_IP_HEADER: 'cf-connecting-ip' }, cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(withoutEmail.status, 1);
  assert.match(withoutEmail.stderr, /EMAIL_API_KEY/);
});

test('modo atrás de túnel HTTPS emite HSTS e cookie administrativo Secure', async () => {
  const proxyPort = await freePort();
  const publicEnv = { ...env(), PORT: String(proxyPort), APP_ORIGIN: 'https://curriculos.empresa.test', LOCAL_MAIL_PREVIEW: 'false', SELFHOST_ALLOW_HTTP_LOCAL: 'false', TRUSTED_CLIENT_IP_HEADER: 'cf-connecting-ip', EMAIL_API_KEY: 'chave-ficticia', EMAIL_FROM: 'noreply@empresa.test' };
  const processUnderTest = spawn(process.execPath, [join(binaryDir, 'server.js')], { env: publicEnv, cwd: process.cwd(), stdio: 'pipe' });
  const local = `http://127.0.0.1:${proxyPort}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(`${local}/healthz`)).ok) { ready = true; break; } } catch { /* espera local */ }
      await new Promise(done => setTimeout(done, 100));
    }
    assert.ok(ready, 'servidor HTTPS-proxy não iniciou');
    const basic = Buffer.from(`editor:${adminPassword}`).toString('base64');
    const response = await fetch(`${local}/admin`, { redirect: 'manual', headers: { Authorization: `Basic ${basic}` } });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('set-cookie'), /; Secure;/);
    assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
  } finally { processUnderTest.kill(); }
});
