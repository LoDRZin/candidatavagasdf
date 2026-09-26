import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import worker from '../worker/index';
import { runMaintenance } from '../worker/maintenance';
import type { PlatformEnv } from '../worker/platform/http';
import { withSecurityHeaders } from '../worker/security';
import { adminGate } from './admin-gate';
import { createAssetFetcher } from './assets';
import { loadConfig } from './config';
import { createSqliteBinding, createSqliteLimiter, migrationStatus, openSqlite } from './sqlite';

const config = loadConfig();
// Workers oferece crypto.subtle.timingSafeEqual; Node não. Mantemos a mesma
// comparação nativa em ambos os runtimes, inclusive para tokens de admin.
if (typeof crypto.subtle.timingSafeEqual !== 'function') {
  Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
    value: (left: BufferSource, right: BufferSource) => {
      const a = Buffer.from(left instanceof ArrayBuffer ? left : left.buffer, left instanceof ArrayBuffer ? 0 : left.byteOffset, left instanceof ArrayBuffer ? left.byteLength : left.byteLength);
      const b = Buffer.from(right instanceof ArrayBuffer ? right : right.buffer, right instanceof ArrayBuffer ? 0 : right.byteOffset, right instanceof ArrayBuffer ? right.byteLength : right.byteLength);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  });
}
if (!existsSync(`${config.assetsDir}/index.html`)) throw new Error('Frontend self-host não compilado. Execute npm run build:selfhost.');
if (!existsSync(config.dbPath)) throw new Error('Banco inexistente. Execute a migração self-host antes de iniciar.');
const sqlite = openSqlite(config.dbPath);
const pending = migrationStatus(sqlite, config.migrationsDir).filter(item => !item.applied);
if (pending.length) throw new Error(`Migrações pendentes: ${pending.map(item => item.name).join(', ')}`);
sqlite.exec('CREATE TABLE IF NOT EXISTS selfhost_maintenance (day TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT)');
const assetFetch = createAssetFetcher(config.assetsDir);
const env: PlatformEnv = {
  DB: createSqliteBinding(sqlite),
  AI_LIMITER: createSqliteLimiter(sqlite),
  ASSETS: { fetch: assetFetch, connect: () => { throw new Error('Socket de asset não disponível.'); } },
  AUTH_ENABLED: config.flags.AUTH_ENABLED || 'true',
  COURSES_ENABLED: config.flags.COURSES_ENABLED || 'true',
  AI_RESUME_STRUCTURE_ENABLED: config.flags.AI_RESUME_STRUCTURE_ENABLED || 'false',
  LOCAL_MAIL_PREVIEW: config.flags.LOCAL_MAIL_PREVIEW || 'false',
  REMINDER_EMAILS_ENABLED: config.flags.REMINDER_EMAILS_ENABLED || 'false',
  ACCESS_REQUIRED: 'false',
  APP_ORIGIN: config.appOrigin,
  ADMIN_TOKEN: config.adminToken,
  GEMINI_API_KEY: config.flags.GEMINI_API_KEY || '',
  GEMINI_MODEL: config.flags.GEMINI_MODEL,
  GEMINI_MODELS: config.flags.GEMINI_MODELS || '',
  GEMINI_BASE_URL: config.flags.GEMINI_BASE_URL,
  GEMINI_RESUME_MODEL: config.flags.GEMINI_RESUME_MODEL,
  OPENROUTER_API_KEY: config.flags.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: config.flags.OPENROUTER_MODEL,
  OPENROUTER_MODELS: config.flags.OPENROUTER_MODELS || '',
  OPENROUTER_BASE_URL: config.flags.OPENROUTER_BASE_URL,
  OPENROUTER_SITE_URL: config.flags.OPENROUTER_SITE_URL,
  OPENROUTER_APP_NAME: config.flags.OPENROUTER_APP_NAME,
  GOOGLE_CLIENT_ID: config.flags.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: config.flags.GOOGLE_CLIENT_SECRET,
  EMAIL_API_KEY: config.flags.EMAIL_API_KEY,
  EMAIL_FROM: config.flags.EMAIL_FROM,
};

async function readBody(message: IncomingMessage): Promise<Buffer | null> {
  const bodyless = message.method === 'GET' || message.method === 'HEAD';
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of message) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 128_000) throw new Error('PAYLOAD_TOO_LARGE');
    if (bodyless && length) throw new Error('INVALID_BODY');
    chunks.push(bytes);
  }
  return bodyless ? null : Buffer.concat(chunks);
}

function toRequest(message: IncomingMessage, body: Buffer | null): Request {
  const raw = message.url ?? '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) throw new Error('INVALID_PATH');
  const relative = new URL(raw, 'http://local.invalid');
  const target = new URL(relative.pathname + relative.search, config.appOrigin);
  const headers = new Headers();
  for (let index = 0; index < message.rawHeaders.length; index += 2) {
    const name = message.rawHeaders[index];
    const value = message.rawHeaders[index + 1];
    if (name && value && !['host', 'cf-connecting-ip', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())) headers.append(name, value);
  }
  const socketIp = message.socket.remoteAddress ?? 'local';
  const fromProxy = config.trustedClientIpHeader && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socketIp)
    ? message.headers[config.trustedClientIpHeader]
    : undefined;
  const clientIp = typeof fromProxy === 'string' && isIP(fromProxy) ? fromProxy : socketIp;
  headers.set('CF-Connecting-IP', clientIp);
  if (body) headers.set('Content-Length', String(body.length));
  return new Request(target, { method: message.method, headers, body });
}

async function send(message: ServerResponse, response: Response): Promise<void> {
  message.statusCode = response.status;
  for (const [key, value] of response.headers) if (key.toLowerCase() !== 'set-cookie') message.setHeader(key, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) message.setHeader('Set-Cookie', cookies);
  if (!response.body || message.req.method === 'HEAD') { message.end(); return; }
  const reader = response.body.getReader();
  const onClose = () => { void reader.cancel('client disconnected').catch(() => undefined); };
  message.once('close', onClose);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!message.write(Buffer.from(value))) await new Promise<void>(resolve => {
        const resume = () => { message.off('drain', resume); message.off('close', resume); resolve(); };
        message.once('drain', resume);
        message.once('close', resume);
      });
      if (message.destroyed) break;
    }
  } finally { message.off('close', onClose); reader.releaseLock(); }
  message.end();
}

const server = createServer(async (incoming, outgoing) => {
  const started = performance.now();
  let route = 'invalid';
  let status = 500;
  try {
    if (Number(incoming.headers['content-length'] ?? 0) > 128_000) throw new Error('PAYLOAD_TOO_LARGE');
    const request = toRequest(incoming, await readBody(incoming));
    const pathname = new URL(request.url).pathname;
    route = pathname.split('/').slice(0, 3).join('/') || '/';
    let response: Response;
    if (pathname === '/healthz') {
      sqlite.prepare('SELECT 1').get();
      response = withSecurityHeaders(Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }), request);
    } else {
      const gate = adminGate(request, config);
      response = gate.denied ? withSecurityHeaders(gate.denied, request) : await worker.fetch(request, env);
      if (gate.cookie) {
        const headers = new Headers(response.headers);
        headers.append('Set-Cookie', gate.cookie);
        response = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
    }
    status = response.status;
    await send(outgoing, response);
  } catch (error) {
    const known = error instanceof Error && ['PAYLOAD_TOO_LARGE', 'INVALID_PATH', 'INVALID_BODY'].includes(error.message);
    status = known ? error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400 : 500;
    if (!known) console.error(JSON.stringify({ event: 'selfhost_request_failed', route }));
    if (!outgoing.headersSent) {
      outgoing.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      outgoing.end(JSON.stringify({ error: { code: known ? error.message : 'SERVICE_UNAVAILABLE', message: known ? 'Solicitação inválida ou longa demais.' : 'Tente novamente em instantes.' } }));
    } else outgoing.destroy();
  } finally {
    if (status >= 500 || Math.random() < 0.1) console.log(JSON.stringify({ event: 'selfhost_http', route, status, duration_ms: Math.round(performance.now() - started) }));
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

async function maintenance(): Promise<void> {
  const now = new Date();
  if (now.getUTCHours() < 4) return;
  const day = now.toISOString().slice(0, 10);
  const claim = sqlite.prepare('INSERT OR IGNORE INTO selfhost_maintenance(day,started_at) VALUES(?,?)').run(day, now.toISOString());
  const reclaimed = claim.changes ? 0 : sqlite.prepare('UPDATE selfhost_maintenance SET started_at=? WHERE day=? AND finished_at IS NULL AND started_at<?')
    .run(now.toISOString(), day, new Date(now.getTime() - 15 * 60_000).toISOString()).changes;
  if (!claim.changes && !reclaimed) return;
  try {
    await runMaintenance(env);
    sqlite.prepare('UPDATE selfhost_maintenance SET finished_at=? WHERE day=?').run(new Date().toISOString(), day);
  } catch {
    sqlite.prepare('DELETE FROM selfhost_maintenance WHERE day=? AND finished_at IS NULL').run(day);
    console.error(JSON.stringify({ event: 'selfhost_maintenance_failed', day }));
  }
}

const timer = setInterval(() => { void maintenance(); }, 5 * 60_000);
server.listen(config.port, config.bindHost, () => {
  console.log(JSON.stringify({ event: 'selfhost_ready', host: config.bindHost, port: config.port }));
  void maintenance();
});

function shutdown(): void {
  clearInterval(timer);
  server.close(() => { sqlite.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
