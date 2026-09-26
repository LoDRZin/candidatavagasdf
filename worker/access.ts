import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type AccessEnv = { ACCESS_REQUIRED?: string; ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };

let cachedDomain = '';
let cachedKeys: JWTVerifyGetKey | null = null;

function accessKeys(domain: string): JWTVerifyGetKey {
  if (cachedKeys && cachedDomain === domain) return cachedKeys;
  cachedDomain = domain;
  cachedKeys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', domain));
  return cachedKeys;
}

export function isAdminPath(path: string) {
  return /^\/(?:admin|api\/admin)(?:\/|$)/.test(path);
}

export async function adminAccessError(request: Request, env: AccessEnv, keys?: JWTVerifyGetKey): Promise<Response | null> {
  if (env.ACCESS_REQUIRED !== 'true') return null;
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  let issuer: string;
  try {
    const parsed = new URL(domain ?? '');
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Invalid Access domain');
    issuer = parsed.origin;
  } catch {
    return Response.json({ error: { code: 'ACCESS_NOT_CONFIGURED', message: 'Acesso administrativo indisponível.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const audiences = audience?.split(',').map(item => item.trim()).filter(Boolean) ?? [];
  if (!audiences.length) return Response.json({ error: { code: 'ACCESS_NOT_CONFIGURED', message: 'Acesso administrativo indisponível.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return Response.json({ error: { code: 'ACCESS_REQUIRED', message: 'Autenticação administrativa necessária.' } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  try {
    await jwtVerify(token, keys ?? accessKeys(issuer), { issuer, audience: audiences, algorithms: ['RS256'] });
    return null;
  } catch {
    return Response.json({ error: { code: 'ACCESS_DENIED', message: 'Autenticação administrativa inválida.' } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
}
