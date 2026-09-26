import { boundedJson, HttpError } from './platform/http';
import { bearerMatches } from './security';

interface ContentEnv {
  DB?: D1Database;
  ADMIN_TOKEN?: string;
}

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": status === 200 ? "public, max-age=60" : "no-store" } });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function isArticle(value: unknown): value is { title: string; slug: string; category: string; summary: string; body: string } {
  if (!value || typeof value !== "object") return false;
  const article = value as Record<string, unknown>;
  return typeof article.title === "string" && article.title.trim().length > 0 && article.title.length <= 140
    && typeof article.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) && article.slug.length <= 140
    && typeof article.category === "string" && article.category.length <= 60
    && typeof article.summary === "string" && article.summary.length <= 300
    && typeof article.body === "string" && article.body.trim().length > 0 && article.body.length <= 12_000;
}

export async function handlePublicContent(request: Request, env: ContentEnv): Promise<Response> {
  if (request.method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } }, 405);
  if (!env.DB) return reply({ error: { code: "CONTENT_DB_NOT_CONFIGURED", message: "O catálogo editorial usa os guias estáticos até o D1 ser conectado." } }, 503);
  try {
    const { results } = await env.DB.prepare("SELECT id, slug, title, category, summary, body, published_at FROM content WHERE status = 'published' ORDER BY published_at DESC LIMIT 100").all();
    return reply({ content: results ?? [] });
  } catch {
    return json({ error: { code: "CONTENT_UNAVAILABLE", message: "Não foi possível carregar conteúdos publicados." } }, 503);
  }
}

export async function handleAdminContent(request: Request, env: ContentEnv): Promise<Response> {
  if (!originAllowed(request)) return json({ error: { code: "ORIGIN_DENIED", message: "Origem não autorizada." } }, 403);
  if (!await bearerMatches(request, env.ADMIN_TOKEN)) return json({ error: { code: "ADMIN_AUTH_REQUIRED", message: "Acesso administrativo inválido." } }, 401);
  if (!env.DB) return json({ error: { code: "CONTENT_DB_NOT_CONFIGURED", message: "Conecte o D1 antes de administrar conteúdo." } }, 503);

  const url = new URL(request.url);
  const id = url.pathname.match(/^\/api\/admin\/content\/([0-9a-f-]{36})(?:\/(publish|unpublish))?$/i);
  try {
    if (url.pathname === "/api/admin/content" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, slug, title, category, summary, body, status, created_at, updated_at, published_at FROM content ORDER BY updated_at DESC LIMIT 100").all();
      return json({ content: results ?? [] });
    }

    if (url.pathname === "/api/admin/content" && request.method === "POST") {
      if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: { code: 'CONTENT_TYPE', message: 'Envie JSON.' } }, 415);
      let input: unknown;
      try { input = await boundedJson(request, 20_000); }
      catch (error) { return error instanceof HttpError ? json({ error: { code: error.code, message: error.message } }, error.status) : json({ error: { code: 'INVALID_ARTICLE', message: 'Não foi possível ler o rascunho.' } }, 400); }
      if (!isArticle(input)) return json({ error: { code: "INVALID_ARTICLE", message: "Revise os campos do rascunho." } }, 400);
      const now = new Date().toISOString();
      const articleId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO content (id, slug, title, category, summary, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)")
          .bind(articleId, input.slug, input.title.trim(), input.category.trim(), input.summary.trim(), input.body.trim(), now, now),
        env.DB.prepare("INSERT INTO content_versions (id, content_id, title, summary, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), articleId, input.title.trim(), input.summary.trim(), input.body.trim(), now),
      ]);
      return json({ id: articleId, status: "draft" }, 201);
    }

    if (id && request.method === "PATCH" && id[2] && (id[2] === "publish" || id[2] === "unpublish")) {
      const publish = id[2] === "publish";
      const now = new Date().toISOString();
      const result = await env.DB.prepare("UPDATE content SET status = ?, updated_at = ?, published_at = ? WHERE id = ?")
        .bind(publish ? "published" : "draft", now, publish ? now : null, id[1]).run();
      if (!result.meta.changes) return json({ error: { code: "NOT_FOUND", message: "Conteúdo não encontrado." } }, 404);
      return json({ id: id[1], status: publish ? "published" : "draft" });
    }

    if (id && !id[2] && request.method === "PATCH") {
      if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: { code: 'CONTENT_TYPE', message: 'Envie JSON.' } }, 415);
      let input: unknown;
      try { input = await boundedJson(request, 20_000); }
      catch (error) { return error instanceof HttpError ? json({ error: { code: error.code, message: error.message } }, error.status) : json({ error: { code: 'INVALID_ARTICLE', message: 'Não foi possível ler o rascunho.' } }, 400); }
      if (!isArticle(input)) return json({ error: { code: "INVALID_ARTICLE", message: "Revise os campos do rascunho." } }, 400);
      const now = new Date().toISOString();
      const existing = await env.DB.prepare("SELECT id FROM content WHERE id = ?").bind(id[1]).first();
      if (!existing) return json({ error: { code: "NOT_FOUND", message: "Conteúdo não encontrado." } }, 404);
      await env.DB.batch([
        env.DB.prepare("UPDATE content SET slug = ?, title = ?, category = ?, summary = ?, body = ?, status = 'draft', published_at = NULL, updated_at = ? WHERE id = ?")
          .bind(input.slug, input.title.trim(), input.category.trim(), input.summary.trim(), input.body.trim(), now, id[1]),
        env.DB.prepare("INSERT INTO content_versions (id, content_id, title, summary, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), id[1], input.title.trim(), input.summary.trim(), input.body.trim(), now),
      ]);
      return json({ id: id[1], status: "saved" });
    }

    return json({ error: { code: "NOT_FOUND", message: "Rota administrativa não encontrada." } }, 404);
  } catch {
    return json({ error: { code: "CONTENT_WRITE_FAILED", message: "Não foi possível salvar o conteúdo." } }, 500);
  }
}
