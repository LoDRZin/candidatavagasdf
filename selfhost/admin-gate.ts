import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isAdminPath } from '../worker/access';
import type { SelfhostConfig } from './config';

const hours = 8 * 60 * 60 * 1000;

function equal(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

function signature(config: SelfhostConfig, expires: string): string {
  return createHmac('sha256', `${config.adminPassword}:${config.adminToken}`).update(`admin:${expires}`).digest('base64url');
}

function currentCookie(request: Request, config: SelfhostConfig): boolean {
  const token = request.headers.get('Cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('cv_admin_gate='))?.slice('cv_admin_gate='.length);
  const match = token?.match(/^(\d{13})\.([A-Za-z0-9_-]{43})$/);
  if (!match || Number(match[1]) <= Date.now() || Number(match[1]) > Date.now() + hours) return false;
  return equal(match[2], signature(config, match[1]));
}

function basicCredentials(request: Request, config: SelfhostConfig): boolean {
  const encoded = request.headers.get('Authorization')?.match(/^Basic ([A-Za-z0-9+/=]+)$/i)?.[1];
  if (!encoded || encoded.length > 1024) return false;
  let decoded: string;
  try { decoded = Buffer.from(encoded, 'base64').toString('utf8'); }
  catch { return false; }
  const index = decoded.indexOf(':');
  if (index < 0) return false;
  return equal(decoded.slice(0, index), config.adminUser) && equal(decoded.slice(index + 1), config.adminPassword);
}

export function adminGate(request: Request, config: SelfhostConfig): { denied?: Response; cookie?: string } {
  const path = new URL(request.url).pathname;
  if (!isAdminPath(path)) return {};
  if (path.startsWith('/api/admin')) {
    if (currentCookie(request, config)) return {};
    return { denied: Response.json({ error: { code: 'ADMIN_GATE_REQUIRED', message: 'Abra a administração novamente e confirme seu acesso.' } }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) };
  }
  if (!basicCredentials(request, config)) {
    return { denied: new Response('Acesso administrativo necessário.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="conectavagasdf admin", charset="UTF-8"', 'Cache-Control': 'no-store' } }) };
  }
  const expires = String(Date.now() + hours);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return { cookie: `cv_admin_gate=${expires}.${signature(config, expires)}; Path=/api/admin; HttpOnly${secure}; SameSite=Strict; Max-Age=${hours / 1000}` };
}
