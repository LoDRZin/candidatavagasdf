import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { secureEqual } from './security';
import { HttpError, json, limit, mutation, readJson, type PlatformEnv } from './platform/http';

const cookieName = 'cv_admin_session';
const duration = 60 * 60;
async function signingKey(secret: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`conectavagasdf:admin-session:v1:${secret}`)));
}
function cookie(request: Request, value: string, age: number) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function hasAdminSession(request: Request, env: Pick<PlatformEnv, 'ADMIN_TOKEN'>) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return false;
  const value = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!value || value.length > 2048) return false;
  try {
    const { payload } = await jwtVerify(value, await signingKey(env.ADMIN_TOKEN), { algorithms: ['HS256'], issuer: 'conectavagasdf', audience: 'administration', maxTokenAge: '1h', requiredClaims: ['exp', 'iat', 'sub'] });
    return payload.sub === 'administrator';
  } catch { return false; }
}
export async function handleAdminSession(request: Request, env: PlatformEnv) {
  try {
    if (request.method === 'GET') return json({ authenticated: await hasAdminSession(request, env) });
    mutation(request, env);
    if (request.method === 'DELETE') return json({ authenticated: false }, 200, { 'Set-Cookie': cookie(request, '', 0) });
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' } }, 405);
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return json({ error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Acesso administrativo indisponível. Configure a credencial administrativa no servidor.' } }, 503);
    await limit(env, `admin-login:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, 5, 60);
    const input = await readJson(request, z.object({ token: z.string().min(1).max(512) }), 2048);
    if (!await secureEqual(input.token, env.ADMIN_TOKEN)) return json({ error: { code: 'ADMIN_REQUIRED', message: 'Credencial administrativa inválida.' } }, 401);
    const session = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer('conectavagasdf').setAudience('administration').setSubject('administrator').setIssuedAt().setExpirationTime(`${duration}s`).setJti(crypto.randomUUID()).sign(await signingKey(env.ADMIN_TOKEN));
    return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(request, session, duration) });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status);
    return json({ error: { code: 'ADMIN_UNAVAILABLE', message: 'Não foi possível confirmar o acesso administrativo.' } }, 503);
  }
}
