import { z } from 'zod';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { safeReturnTo, type User } from '../../shared/contracts';
import { assertMethod, boundedJson, fail, hash, hex, json, limit, local, origin, readJson, token, type PlatformEnv } from './http';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(128);
const now = () => new Date().toISOString();
const future = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
type Session = User & { session_id: string; reauthenticated_at: string | null; last_seen_at: string };
function cookieName(request: Request) { return new URL(request.url).protocol === 'https:' ? '__Host-cv_session' : 'cv_local_session'; }
const deviceCookieName = 'cv_device_id';
export function cookie(request: Request, name: string, value: string, age: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}
function getCookie(request: Request, name: string) { return request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''; }
function deviceId(request: Request) { return getCookie(request, deviceCookieName) || token(); }
function deviceCookie(request: Request, value: string, age = 365 * 86400) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${deviceCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}
function responseCookies(...values: string[]) {
  const headers = new Headers();
  for (const value of values) headers.append('Set-Cookie', value);
  return headers;
}
async function registrationIdentity(request: Request, device: string) {
  return { ipHash: await hash(request.headers.get('CF-Connecting-IP') ?? 'local'), deviceHash: await hash(device) };
}
async function assertRegistrationAvailable(env: PlatformEnv, ipHash: string, deviceHash: string) {
  const existing = await env.DB.prepare('SELECT id FROM account_registration_guards WHERE ip_hash=? AND device_hash=?').bind(ipHash, deviceHash).first();
  if (existing) fail(409, 'ACCOUNT_LIMIT_REACHED', 'Este dispositivo e endereço já foram usados para criar uma conta. Entre na conta existente.');
}
export async function passwordHash(password: string) {
  const salt = token();
  const derived = await scryptAsync(password, salt, { N: 16384, r: 8, p: 5, dkLen: 32 });
  return `scrypt$16384$8$5$${salt}$${hex(derived)}`;
}
export async function passwordMatches(password: string, stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '5') return false;
  const value = hex(await scryptAsync(password, parts[4]!, { N: 16384, r: 8, p: 5, dkLen: 32 }));
  const a = new TextEncoder().encode(value), b = new TextEncoder().encode(parts[5]!);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
export async function session(request: Request, env: PlatformEnv): Promise<Session | null> {
  const raw = getCookie(request, cookieName(request)); if (!raw) return null;
  const row = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.email_verified_at,u.role,s.id session_id,s.reauthenticated_at,s.last_seen_at FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>? AND u.status='active'`)
    .bind(await hash(raw), now(), new Date(Date.now() - 7 * 86400_000).toISOString()).first<Session>();
  if (row && Date.now() - Date.parse(row.last_seen_at) > 5 * 60_000) await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE id=?').bind(now(), row.session_id).run();
  return row;
}
export async function requireUser(request: Request, env: PlatformEnv, verified = true) {
  if (env.AUTH_ENABLED === 'false') fail(503, 'AUTH_DISABLED', 'Contas temporariamente indisponíveis.');
  const user = await session(request, env); if (!user) return fail(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  const expected = request.headers.get('X-Account-Id');
  if (expected && expected !== user.id) fail(409, 'ACCOUNT_CHANGED', 'A conta mudou. Reabra esta página antes de sincronizar.');
  if (verified && !user.email_verified_at) fail(403, 'EMAIL_UNVERIFIED', 'Confirme seu e-mail para continuar.');
  return user;
}
async function issueSession(request: Request, env: PlatformEnv, userId: string) {
  const raw = token();
  const old = getCookie(request, cookieName(request));
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').bind(now(), await hash(old)),
    env.DB.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,last_seen_at,created_at,reauthenticated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), userId, await hash(raw), future(30 * 86400), now(), now(), now()),
  ]);
  return cookie(request, cookieName(request), raw, 30 * 86400);
}
function publicUser(user: User | null) { return user ? { id: user.id, name: user.name, email: user.email, email_verified_at: user.email_verified_at, role: user.role } : null; }
async function sendToken(request: Request, env: PlatformEnv, user: User, purpose: 'verify_email' | 'reset_password') {
  if (!local(request, env) && (!env.EMAIL_API_KEY || !env.EMAIL_FROM)) fail(503, 'EMAIL_NOT_CONFIGURED', 'O envio de e-mail ainda não está configurado.');
  const raw = token();
  await env.DB.prepare('INSERT INTO auth_tokens(id,user_id,purpose,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), user.id, purpose, await hash(raw), future(purpose === 'reset_password' ? 1800 : 86400), now()).run();
  const url = `${origin(request, env)}/${purpose === 'reset_password' ? 'redefinir-senha' : 'verificar-email'}#token=${raw}`;
  if (local(request, env)) {
    await env.DB.prepare('INSERT INTO local_mail(id,email,url,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), user.email, url, now()).run(); return;
  }
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [user.email], subject: purpose === 'reset_password' ? 'Redefinir sua senha' : 'Confirme seu e-mail', text: `Conectavagasdf\n\nAbra este link para continuar: ${url}\n\nSe não solicitou esta ação, ignore esta mensagem.` }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) fail(503, 'EMAIL_UNAVAILABLE', 'Não foi possível enviar o e-mail. Tente reenviar em alguns minutos.');
}
async function reauthenticate(_request: Request, env: PlatformEnv, user: Session, password?: string) {
  if (password) {
    const cred = await env.DB.prepare('SELECT password_hash FROM password_credentials WHERE user_id=?').bind(user.id).first<{ password_hash: string }>();
    if (cred && await passwordMatches(password, cred.password_hash)) return;
    fail(403, 'REAUTH_REQUIRED', 'Senha incorreta.');
  }
  if (!user.reauthenticated_at || Date.now() - Date.parse(user.reauthenticated_at) > 5 * 60_000) fail(403, 'REAUTH_REQUIRED', 'Entre novamente na conta para confirmar esta ação.');
}
export async function handleAuth(request: Request, env: PlatformEnv): Promise<Response> {
  if (env.AUTH_ENABLED === 'false') fail(503, 'AUTH_DISABLED', 'Contas temporariamente indisponíveis.');
  const url = new URL(request.url), path = url.pathname;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (path === '/api/auth/session') {
    assertMethod(request, 'GET'); const user = await session(request, env);
    return json({ user: publicUser(user), googleAvailable: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), localMail: local(request, env) });
  }
  if (path === '/api/auth/local-mail') {
    assertMethod(request, 'POST'); if (!local(request, env)) fail(404, 'NOT_FOUND', 'Não encontrado.');
    const body = await readJson(request, z.object({ email: emailSchema }));
    const result = await env.DB.prepare('SELECT url,created_at FROM local_mail WHERE email=? ORDER BY created_at DESC LIMIT 5').bind(body.email).all();
    return json({ messages: result.results });
  }
  await limit(env, `auth-ip:${ip}`, 40, 60);
  if (path.startsWith('/api/auth/google/')) {
    if (!['/api/auth/google/start', '/api/auth/google/link', '/api/auth/google/callback'].includes(path)) fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
    return google(request, env);
  }
  if (path === '/api/auth/register') {
    assertMethod(request, 'POST');
    const body = await readJson(request, z.object({ name: z.string().trim().min(2).max(120), email: emailSchema, password: passwordSchema, terms: z.literal(true) }));
    await limit(env, `register:${body.email}`, 3, 3600);
    if (!local(request, env) && (!env.EMAIL_API_KEY || !env.EMAIL_FROM)) fail(503, 'EMAIL_NOT_CONFIGURED', 'O cadastro aguarda configuração do envio de e-mail.');
    const encoded = await passwordHash(body.password);
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(body.email).first();
    if (existing) return json({ message: 'Se este e-mail puder ser cadastrado, você receberá as instruções. Se já possui conta, entre ou recupere sua senha.' }, 202);
    const device = deviceId(request), identity = await registrationIdentity(request, device);
    await assertRegistrationAvailable(env, identity.ipHash, identity.deviceHash);
    const id = crypto.randomUUID();
    try { await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,name,email,created_at,updated_at,terms_accepted_at) VALUES(?,?,?,?,?,?)').bind(id, body.name, body.email, now(), now(), now()),
      env.DB.prepare('INSERT INTO password_credentials(user_id,password_hash,password_algorithm,password_updated_at) VALUES(?,?,?,?)').bind(id, encoded, 'scrypt', now()),
      env.DB.prepare('INSERT INTO account_registration_guards(id,user_id,ip_hash,device_hash,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), id, identity.ipHash, identity.deviceHash, now()),
      env.DB.prepare('INSERT INTO ai_usage_quotas(user_id,created_at,updated_at) VALUES(?,?,?)').bind(id, now(), now()),
    ]); } catch (error) { if (String(error).includes('UNIQUE')) return json({ message: 'Confira seu e-mail ou entre na conta existente.' }, 202); throw error; }
    const user: User = { id, name: body.name, email: body.email, email_verified_at: null, role: 'member' };
    await sendToken(request, env, user, 'verify_email');
    return json({ user, message: 'Confira seu e-mail para ativar a conta.' }, 201, responseCookies(await issueSession(request, env, id), deviceCookie(request, device)));
  }
  if (path === '/api/auth/login') {
    assertMethod(request, 'POST'); const body = await readJson(request, z.object({ email: emailSchema, password: z.string().min(1).max(128) }));
    await limit(env, `login:${body.email}`, 10, 900);
    const user = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.email_verified_at,u.role,c.password_hash FROM users u JOIN password_credentials c ON c.user_id=u.id WHERE u.email=? AND u.status='active'`).bind(body.email).first<User & { password_hash: string }>();
    const valid = await passwordMatches(body.password, user?.password_hash ?? `scrypt$16384$8$5$${'0'.repeat(64)}$${'0'.repeat(64)}`);
    if (!user || !valid) fail(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    return json({ user: publicUser(user) }, 200, { 'Set-Cookie': await issueSession(request, env, user.id) });
  }
  if (path === '/api/auth/password/forgot') {
    assertMethod(request, 'POST'); const body = await readJson(request, z.object({ email: emailSchema }));
    await limit(env, `forgot:${body.email}`, 3, 3600);
    const user = await env.DB.prepare("SELECT id,name,email,email_verified_at,role FROM users WHERE email=? AND status='active'").bind(body.email).first<User>();
    if (user) await sendToken(request, env, user, 'reset_password');
    return json({ message: 'Se houver uma conta, enviaremos as instruções de recuperação.' });
  }
  if (path === '/api/auth/email/verify' || path === '/api/auth/password/reset') {
    assertMethod(request, 'POST'); const reset = path.endsWith('/reset');
    const body = await readJson(request, z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema.optional() }));
    if (reset && !body.password) fail(400, 'INVALID_REQUEST', 'Informe uma senha de pelo menos 8 caracteres.');
    const digest = await hash(body.token), stamp = now(), purpose = reset ? 'reset_password' : 'verify_email';
    const predicate = 'SELECT user_id FROM auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?';
    const statements: D1PreparedStatement[] = [];
    if (reset) {
      const encoded = await passwordHash(body.password!);
      statements.push(env.DB.prepare(`INSERT INTO password_credentials(user_id,password_hash,password_algorithm,password_updated_at) SELECT user_id,?,'scrypt',? FROM auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>? ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,password_algorithm='scrypt',password_updated_at=excluded.password_updated_at`).bind(encoded, stamp, digest, purpose, stamp));
      statements.push(env.DB.prepare(`UPDATE sessions SET revoked_at=? WHERE user_id IN (${predicate})`).bind(stamp, digest, purpose, stamp));
    } else statements.push(env.DB.prepare(`UPDATE users SET email_verified_at=?,updated_at=? WHERE id IN (${predicate})`).bind(stamp, stamp, digest, purpose, stamp));
    const consumptionIndex = statements.length;
    statements.push(env.DB.prepare('UPDATE auth_tokens SET used_at=? WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>? RETURNING user_id').bind(stamp, digest, purpose, stamp));
    statements.push(env.DB.prepare('UPDATE auth_tokens SET used_at=? WHERE purpose=? AND used_at IS NULL AND user_id IN (SELECT user_id FROM auth_tokens WHERE token_hash=? AND used_at=?)').bind(stamp, purpose, digest, stamp));
    const results = await env.DB.batch(statements);
    if (!results[consumptionIndex]?.results.length) fail(400, 'INVALID_TOKEN', 'Link inválido, expirado ou já utilizado.');
    return json({ message: reset ? 'Senha atualizada. Entre novamente.' : 'E-mail confirmado. Você já pode continuar.' });
  }
  const user = await requireUser(request, env, false);
  if (path === '/api/auth/email/resend') {
    assertMethod(request, 'POST'); await limit(env, `resend:${user.id}`, 3, 3600);
    if (!user.email_verified_at) await sendToken(request, env, user, 'verify_email');
    return json({ message: 'Confira seu e-mail.' });
  }
  if (['/api/auth/logout', '/api/auth/logout-all', '/api/auth/logout-others'].includes(path)) {
    assertMethod(request, 'POST');
    const others = path.endsWith('logout-others');
    await env.DB.prepare(`UPDATE sessions SET revoked_at=? WHERE user_id=? ${path.endsWith('/logout') ? 'AND id=?' : others ? 'AND id<>?' : ''}`)
      .bind(now(), user.id, ...(path.endsWith('/logout') || others ? [user.session_id] : [])).run();
    return json({ ok: true }, 200, others ? {} : { 'Set-Cookie': cookie(request, cookieName(request), '', 0) });
  }
  if (path === '/api/account/export') {
    assertMethod(request, 'GET');
    const tables = ['resumes', 'course_enrollments', 'lesson_progress', 'quiz_attempts', 'career_profiles', 'job_applications', 'career_stories', 'application_story_links', 'cover_letters', 'interview_sessions', 'interview_questions', 'reminder_preferences', 'reminder_deliveries', 'feedback', 'ai_usage_quotas', 'ai_chat_conversations', 'ai_chat_messages'] as const;
    const data: Record<string, unknown> = { user: publicUser(user) };
    for (const table of tables) data[table] = (await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id=?`).bind(user.id).all()).results;
    data.answers = (await env.DB.prepare('SELECT a.* FROM quiz_answers a JOIN quiz_attempts t ON t.id=a.attempt_id WHERE t.user_id=?').bind(user.id).all()).results;
    data.versions = (await env.DB.prepare('SELECT v.* FROM resume_versions v JOIN resumes r ON r.id=v.resume_id WHERE r.user_id=?').bind(user.id).all()).results;
    data.application_events = (await env.DB.prepare('SELECT * FROM application_events WHERE user_id=?').bind(user.id).all()).results;
    return json(data);
  }
  if (path === '/api/account' && request.method === 'GET') {
    return json({ user: publicUser(user), providers: (await env.DB.prepare('SELECT provider FROM oauth_accounts WHERE user_id=?').bind(user.id).all()).results });
  }
  if (path === '/api/account' && request.method === 'PATCH') {
    const body = await readJson(request, z.object({ name: z.string().trim().min(2).max(120) }));
    await env.DB.prepare('UPDATE users SET name=?,updated_at=? WHERE id=?').bind(body.name, now(), user.id).run(); return json({ ok: true });
  }
  if (path === '/api/account' && request.method === 'DELETE') {
    const body = await readJson(request, z.object({ password: z.string().max(128).optional(), confirmation: z.literal('EXCLUIR') }));
    await reauthenticate(request, env, user, body.password);
    await env.DB.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, cookieName(request), '', 0) });
  }
  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}

async function google(request: Request, env: PlatformEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) fail(503, 'GOOGLE_NOT_CONFIGURED', 'Login Google ainda não configurado.');
  const url = new URL(request.url), callback = `${origin(request, env)}/api/auth/google/callback`;
  const browserCookie = new URL(request.url).protocol === 'https:' ? '__Host-cv_oauth' : 'cv_local_oauth';
  if (url.pathname.endsWith('/start') || url.pathname.endsWith('/link')) {
    const link = url.pathname.endsWith('/link'); assertMethod(request, link ? 'POST' : 'GET');
    let userId: string | null = null;
    if (link) { const user = await requireUser(request, env); const body = await readJson(request, z.object({ password: z.string().max(128).optional() })); await reauthenticate(request, env, user, body.password); userId = user.id; }
    const state = token(), browser = token(), nonce = token(), verifier = token(), device = deviceId(request);
    await env.DB.prepare('INSERT INTO oauth_flows(state_hash,browser_hash,nonce,verifier,return_to,user_id,expires_at) VALUES(?,?,?,?,?,?,?)')
      .bind(await hash(state), await hash(browser), nonce, verifier, link ? '/conta' : safeReturnTo(url.searchParams.get('returnTo')), userId, future(600)).run();
    const challenge = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const encoded = btoa(String.fromCharCode(...challenge)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: encoded, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    const headers = responseCookies(cookie(request, browserCookie, browser, 600), deviceCookie(request, device));
    if (link) return json({ url: target.href }, 200, headers);
    headers.set('Location', target.href); headers.set('Cache-Control', 'no-store');
    return new Response(null, { status: 302, headers });
  }
  assertMethod(request, 'GET');
  const state = url.searchParams.get('state') ?? '', browser = getCookie(request, browserCookie);
  const flow = await env.DB.prepare('DELETE FROM oauth_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *')
    .bind(await hash(state), await hash(browser), now()).first<{ nonce: string; verifier: string; return_to: string; user_id: string | null }>();
  if (!flow || !url.searchParams.get('code')) fail(400, 'OAUTH_INVALID', 'Login Google cancelado ou expirado. Tente novamente.');
  if (flow.user_id && (await session(request, env))?.id !== flow.user_id) fail(403, 'OAUTH_INVALID', 'A conta da sessão foi alterada.');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: callback, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(10_000) });
  const parsed = z.object({ id_token: z.string() }).safeParse(await boundedJson(response, 32_000));
  if (!response.ok || !parsed.success) fail(400, 'OAUTH_INVALID', 'Não foi possível confirmar a identidade Google.');
  const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 10_000 });
  const { payload } = await jwtVerify(parsed.data.id_token, jwks, { audience: env.GOOGLE_CLIENT_ID, issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce'] });
  if (payload.nonce !== flow.nonce || payload.email_verified !== true || !payload.sub || (payload.azp && payload.azp !== env.GOOGLE_CLIENT_ID)) fail(400, 'OAUTH_INVALID', 'Identidade Google inválida.');
  const email = emailSchema.parse(payload.email);
  const existing = await env.DB.prepare("SELECT user_id FROM oauth_accounts WHERE provider='google' AND provider_subject=?").bind(payload.sub).first<{ user_id: string }>();
  let id = existing?.user_id;
  if (flow.user_id && id && flow.user_id !== id) fail(409, 'PROVIDER_LINKED', 'Esta conta Google já está vinculada a outro usuário.');
  if (!id) {
    id = flow.user_id ?? crypto.randomUUID();
    if (!flow.user_id && await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()) fail(409, 'LINK_REQUIRED', 'Entre com sua senha e vincule o Google na página da conta.');
    const device = deviceId(request), identity = await registrationIdentity(request, device);
    await assertRegistrationAvailable(env, identity.ipHash, identity.deviceHash);
    const statements: D1PreparedStatement[] = [];
    if (!flow.user_id) {
      statements.push(env.DB.prepare('INSERT INTO users(id,name,email,email_verified_at,created_at,updated_at,terms_accepted_at) VALUES(?,?,?,?,?,?,?)').bind(id, typeof payload.name === 'string' ? payload.name.slice(0, 120) : 'Usuário', email, now(), now(), now(), now()));
      statements.push(env.DB.prepare('INSERT INTO ai_usage_quotas(user_id,created_at,updated_at) VALUES(?,?,?)').bind(id, now(), now()));
    }
    statements.push(env.DB.prepare("INSERT INTO oauth_accounts(id,user_id,provider,provider_subject,provider_email,created_at) VALUES(?,?,'google',?,?,?)").bind(crypto.randomUUID(), id, payload.sub, email, now()));
    statements.push(env.DB.prepare('INSERT INTO account_registration_guards(id,user_id,ip_hash,device_hash,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), id, identity.ipHash, identity.deviceHash, now()));
    await env.DB.batch(statements);
  }
  const active = await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active'").bind(id).first();
  if (!active) fail(403, 'ACCOUNT_BLOCKED', 'Conta indisponível.');
  const headers = new Headers({ Location: safeReturnTo(flow.return_to), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', await issueSession(request, env, id)); headers.append('Set-Cookie', cookie(request, browserCookie, '', 0));
  return new Response(null, { status: 302, headers });
}
