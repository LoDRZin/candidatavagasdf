import { handleAiAssist, type AiEnv } from "./ai";
import { handleAiChat } from './ai-chat';
import { handleAdminContent, handlePublicContent } from "./content";
import { handlePlatform } from './platform';
import type { PlatformEnv } from './platform/http';
import { runMaintenance } from './maintenance';
import { withSecurityHeaders } from './security';
import { adminAccessError, isAdminPath } from './access';
import { handleAdminSession, hasAdminSession } from './admin-session';
import { session } from './platform/auth';
import { requiresAdminApi, requiresAdminPage, requiresUserApi, requiresUserPage } from '../shared/access-policy';

async function routeRequest(request: Request, env: PlatformEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/admin-session') return handleAdminSession(request, env);
  if (isAdminPath(url.pathname)) {
    const denied = await adminAccessError(request, env);
    if (denied) return denied;
  }
  const currentUser = (requiresAdminApi(url.pathname) || requiresAdminPage(url.pathname) || requiresUserApi(url.pathname) || requiresUserPage(url.pathname)) ? await session(request, env) : null;
  const adminAuthorized = await hasAdminSession(request, env) || currentUser?.role === 'admin';
  if ((requiresAdminApi(url.pathname) || requiresAdminPage(url.pathname)) && !adminAuthorized) {
    if (url.pathname.startsWith('/api/')) return Response.json({ error: { code: 'ADMIN_REQUIRED', message: 'Autenticação administrativa necessária.' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    return new Response(null, { status: 302, headers: { Location: `/acesso-admin?returnTo=${encodeURIComponent(url.pathname + url.search)}`, 'Cache-Control': 'no-store' } });
  }
  if (requiresUserApi(url.pathname) && !currentUser) {
    return Response.json({ error: { code: 'AUTH_REQUIRED', message: 'Entre na sua conta para continuar.' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (requiresUserPage(url.pathname) && !currentUser) {
    return new Response(null, { status: 302, headers: { Location: `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`, 'Cache-Control': 'no-store' } });
  }
  const platform = await handlePlatform(request, env);
  if (platform) return platform;

  if (url.pathname === "/api/health") {
    return Response.json({
      status: "ok",
      app: "conectavagasdf",
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname === "/api/ai/assist") return handleAiAssist(request, env satisfies AiEnv);
  if (url.pathname === '/api/ai/chat') return handleAiChat(request, env);
  if (url.pathname === "/api/admin/ai/assist") return handleAiAssist(request, env satisfies AiEnv);
  if (url.pathname === "/api/content") return handlePublicContent(request, env);
  if (/^\/api\/admin\/content(?:\/|$)/.test(url.pathname)) return handleAdminContent(request, env);
  if (url.pathname.startsWith("/api/")) return Response.json(
    { error: { code: "NOT_FOUND", message: "Endpoint não encontrado." } },
    { status: 404 },
  );
  const asset = await env.ASSETS.fetch(request);
  if (requiresAdminPage(url.pathname)) {
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  }
  return asset;
}

export default {
  async fetch(request: Request, env: PlatformEnv): Promise<Response> {
    return withSecurityHeaders(await routeRequest(request, env), request);
  },
  async scheduled(_event: ScheduledController, env: PlatformEnv) {
    await runMaintenance(env);
  },
} satisfies ExportedHandler<Env>;
