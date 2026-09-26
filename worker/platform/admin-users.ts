import { z } from 'zod';
import { hasAdminSession } from '../admin-session';
import { session } from './auth';
import { fail, json, readJson, type PlatformEnv } from './http';

type AdminActor = { id: string | null };
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'admin';
  status: string;
  email_verified_at: string | null;
  created_at: string;
  providers: string | null;
  tokens_used: number;
  token_limit: number;
  requests_used: number;
  request_limit: number;
};

const now = () => new Date().toISOString();

async function requireAdminActor(request: Request, env: PlatformEnv): Promise<AdminActor> {
  const user = await session(request, env);
  if (user?.role === 'admin') return { id: user.id };
  if (await hasAdminSession(request, env)) return { id: null };
  fail(401, 'ADMIN_REQUIRED', 'Acesso administrativo necessário.');
}

async function totalUsage(env: PlatformEnv) {
  const [usageResult, usersResult, providersResult, limitsResult] = await env.DB.batch([
    env.DB.prepare(`SELECT COALESCE(SUM(tokens_used),0) tokens_used, COALESCE(SUM(token_limit),0) token_limit,
      COALESCE(SUM(requests_used),0) requests_used, COALESCE(SUM(request_limit),0) request_limit
      FROM ai_usage_quotas`),
    env.DB.prepare(`SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) active,
      COALESCE(SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END),0) admins FROM users`),
    env.DB.prepare(`SELECT provider, COUNT(*) requests, COALESCE(SUM(total_tokens),0) tokens
      FROM ai_usage_events GROUP BY provider ORDER BY tokens DESC`),
    env.DB.prepare(`SELECT limits.provider,limits.model,limits.display_name,limits.category,
      limits.rpm_limit,limits.tpm_limit,limits.rpd_limit,
      COALESCE(SUM(CASE WHEN datetime(events.created_at) >= datetime('now','-1 minute') THEN 1 ELSE 0 END),0) rpm_used,
      COALESCE(SUM(CASE WHEN datetime(events.created_at) >= datetime('now','-1 minute') THEN events.total_tokens ELSE 0 END),0) tpm_used,
      COALESCE(SUM(CASE WHEN date(events.created_at)=date('now') THEN 1 ELSE 0 END),0) rpd_used
      FROM ai_provider_rate_limits limits
      LEFT JOIN ai_usage_events events ON events.provider=limits.provider AND events.model=limits.model
      GROUP BY limits.provider,limits.model,limits.display_name,limits.category,
        limits.rpm_limit,limits.tpm_limit,limits.rpd_limit
      ORDER BY limits.display_name`),
  ]);
  const usage = usageResult.results[0] as Record<string, number> | undefined;
  const users = usersResult.results[0] as Record<string, number> | undefined;
  const configuredModels = new Set(
    (env.GEMINI_MODELS || env.GEMINI_MODEL || 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemma-4-31b-it,gemma-4-26b-a4b-it')
      .split(',').map(model => model.trim()).filter(Boolean),
  );
  type LimitRow = {
    provider: string; model: string; display_name: string; category: string;
    rpm_limit: number; tpm_limit: number; rpd_limit: number;
    rpm_used: number; tpm_used: number; rpd_used: number;
  };
  return json({
    scope: 'total',
    tokens: { used: Number(usage?.tokens_used ?? 0), allowance: Number(usage?.token_limit ?? 0) },
    requests: { used: Number(usage?.requests_used ?? 0), allowance: Number(usage?.request_limit ?? 0) },
    users: { total: Number(users?.total ?? 0), active: Number(users?.active ?? 0), admins: Number(users?.admins ?? 0) },
    providers: (providersResult.results as Array<{ provider: string; requests: number; tokens: number }>).map(row => ({ provider: String(row.provider), requests: Number(row.requests), tokens: Number(row.tokens) })),
    modelLimits: (limitsResult.results as unknown as LimitRow[]).map(row => ({
      provider: String(row.provider),
      model: String(row.model),
      name: String(row.display_name),
      category: String(row.category),
      configured: row.provider === 'gemini' && configuredModels.has(String(row.model)),
      rpm: { used: Number(row.rpm_used), limit: Number(row.rpm_limit) },
      tpm: { used: Number(row.tpm_used), limit: Number(row.tpm_limit) },
      rpd: { used: Number(row.rpd_used), limit: Number(row.rpd_limit) },
    })).sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name, 'pt-BR')),
  });
}

async function listUsers(request: Request, env: PlatformEnv, actor: AdminActor) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim().toLocaleLowerCase('pt-BR').slice(0, 120);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
  const pageSize = 50;
  const where = query ? 'WHERE instr(lower(u.name),?)>0 OR instr(lower(u.email),?)>0' : '';
  const bindings: string[] = query ? [query, query] : [];
  const [countResult, rowsResult] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) total FROM users u ${where}`).bind(...bindings),
    env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.email_verified_at,u.created_at,
      GROUP_CONCAT(DISTINCT o.provider) providers,
      COALESCE(q.tokens_used,0) tokens_used,COALESCE(q.token_limit,4096) token_limit,
      COALESCE(q.requests_used,0) requests_used,COALESCE(q.request_limit,2) request_limit
      FROM users u
      LEFT JOIN oauth_accounts o ON o.user_id=u.id
      LEFT JOIN ai_usage_quotas q ON q.user_id=u.id
      ${where}
      GROUP BY u.id
      ORDER BY CASE WHEN u.role='admin' THEN 0 ELSE 1 END,u.created_at DESC
      LIMIT ? OFFSET ?`).bind(...bindings, pageSize, (page - 1) * pageSize),
  ]);
  const total = Number((countResult.results[0] as { total?: number } | undefined)?.total ?? 0);
  return json({
    users: (rowsResult.results as unknown as ManagedUser[]).map(user => ({ ...user, isSelf: actor.id === user.id })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

async function updateRole(request: Request, env: PlatformEnv, actor: AdminActor, userId: string) {
  const body = await readJson(request, z.object({ role: z.enum(['member', 'admin']) }));
  const target = await env.DB.prepare('SELECT id,email,role,status,email_verified_at FROM users WHERE id=?').bind(userId).first<{ id: string; email: string; role: 'member' | 'admin'; status: string; email_verified_at: string | null }>();
  if (!target) fail(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  if (actor.id === target.id && body.role !== 'admin') fail(409, 'SELF_ADMIN_CHANGE', 'Você não pode remover seu próprio acesso administrativo.');
  if (body.role === 'admin' && (target.status !== 'active' || !target.email_verified_at)) fail(409, 'ADMIN_ACCOUNT_UNVERIFIED', 'Somente uma conta ativa e verificada pode ser administradora.');
  if (target.role === body.role) return json({ user: target });
  if (target.role === 'admin' && body.role === 'member') {
    const count = await env.DB.prepare("SELECT COUNT(*) total FROM users WHERE role='admin' AND status='active'").first<{ total: number }>();
    if (Number(count?.total ?? 0) <= 1) fail(409, 'LAST_ADMIN', 'Mantenha pelo menos um administrador ativo.');
  }
  const stamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET role=?,updated_at=? WHERE id=?').bind(body.role, stamp, target.id),
    env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,action,target_user_id,target_email,created_at) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), actor.id, body.role === 'admin' ? 'user_promoted' : 'user_demoted', target.id, target.email, stamp),
  ]);
  return json({ user: { ...target, role: body.role } });
}

async function deleteUser(env: PlatformEnv, actor: AdminActor, userId: string) {
  const target = await env.DB.prepare('SELECT id,email,role,status FROM users WHERE id=?').bind(userId).first<{ id: string; email: string; role: 'member' | 'admin'; status: string }>();
  if (!target) fail(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
  if (actor.id === target.id) fail(409, 'SELF_DELETE', 'Exclua sua própria conta pela página Minha conta, não pelo painel administrativo.');
  if (target.role === 'admin') {
    const count = await env.DB.prepare("SELECT COUNT(*) total FROM users WHERE role='admin' AND status='active'").first<{ total: number }>();
    if (Number(count?.total ?? 0) <= 1) fail(409, 'LAST_ADMIN', 'Mantenha pelo menos um administrador ativo.');
  }
  const stamp = now();
  await env.DB.prepare('DELETE FROM users WHERE id=?').bind(target.id).run();
  await env.DB.prepare('INSERT INTO admin_audit_log(id,actor_user_id,action,target_user_id,target_email,created_at) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), actor.id, 'user_deleted', target.id, target.email, stamp).run();
  return json({ ok: true });
}

export async function handleAdminUsers(request: Request, env: PlatformEnv) {
  const actor = await requireAdminActor(request, env);
  const path = new URL(request.url).pathname;
  if (path === '/api/admin/usage') {
    if (request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return totalUsage(env);
  }
  if (path === '/api/admin/users') {
    if (request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return listUsers(request, env, actor);
  }
  const match = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/i);
  if (!match) fail(404, 'NOT_FOUND', 'Endpoint administrativo não encontrado.');
  if (request.method === 'PATCH') return updateRole(request, env, actor, match[1]!);
  if (request.method === 'DELETE') return deleteUser(env, actor, match[1]!);
  fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
}
