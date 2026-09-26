import { z } from 'zod';
import { resumeSchema, templateSchema } from '../../shared/contracts';
import { requireUser } from './auth';
import { fail, json, limit, readJson, type PlatformEnv } from './http';
import { COLLECTION_LIMITS } from './collection-limits';
const writeSchema = z.object({ title: z.string().trim().min(1).max(120), templateId: templateSchema, data: resumeSchema,
  revision: z.number().int().positive().optional(), source: z.enum(['manual', 'ai_accepted', 'import_local']).default('manual'), id: z.string().uuid().optional() });
const variantSchema = z.object({
  application_id: z.string().uuid(), application_revision: z.number().int().positive(),
  title: z.string().trim().min(1).max(120).optional(),
});
type Row = { id: string; title: string; template_id: string; data_json: string; revision: number; updated_at: string };
function unpack(row: Row) { const { data_json, ...rest } = row; return { ...rest, data: JSON.parse(data_json) }; }
export async function handleResumes(request: Request, env: PlatformEnv) {
  const user = await requireUser(request, env), path = new URL(request.url).pathname;
  if (request.method !== 'GET') await limit(env, `resume-mutation:${user.id}`, 120, 60);
  const variantMatch = path.match(/^\/api\/resumes\/([^/]+)\/variants$/);
  if (variantMatch) {
    if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
    const body = await readJson(request, variantSchema);
    const source = await env.DB.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').bind(variantMatch[1], user.id).first<Row>();
    if (!source) fail(404, 'NOT_FOUND', 'Currículo-base não encontrado.');
    const application = await env.DB.prepare('SELECT id,company,role,revision FROM job_applications WHERE id=? AND user_id=?')
      .bind(body.application_id, user.id).first<{ id: string; company: string; role: string; revision: number }>();
    if (!application) fail(404, 'NOT_FOUND', 'Candidatura não encontrada.');
    const count = await env.DB.prepare('SELECT count(*) n FROM resumes WHERE user_id=?').bind(user.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= COLLECTION_LIMITS.resumes) fail(409, 'RESUME_LIMIT', 'Limite de 100 currículos atingido.');
    const id = crypto.randomUUID(), stamp = new Date().toISOString();
    const title = body.title ?? `${source.title} — ${application.role || application.company}`.slice(0, 120);
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO resumes(id,user_id,title,template_id,data_json,created_at,updated_at,source)
        VALUES(?,?,?,?,?,?,?,'manual')`).bind(id, user.id, title, source.template_id, source.data_json, stamp, stamp),
      env.DB.prepare('UPDATE job_applications SET resume_id=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?')
        .bind(id, stamp, application.id, user.id, body.application_revision),
    ]);
    if (results[1]?.meta.changes !== 1) fail(409, 'REVISION_CONFLICT', 'A candidatura mudou. Carregue a versão atual.');
    const created = await env.DB.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').bind(id, user.id).first<Row>();
    if (!created) fail(503, 'VARIANT_NOT_SAVED', 'Não foi possível criar a variação.');
    return json({ resume: unpack(created), application: { id: application.id, resume_id: id, revision: body.application_revision + 1 } }, 201);
  }
  const match = path.match(/^\/api\/resumes\/([^/]+)(?:\/versions(?:\/(\d+)\/restore)?)?$/);
  if (path === '/api/resumes' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id,title,template_id,revision,updated_at FROM resumes WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all();
    return json({ resumes: results });
  }
  if (path === '/api/resumes' && request.method === 'POST') {
    const body = await readJson(request, writeSchema); const id = body.id ?? crypto.randomUUID(), stamp = new Date().toISOString();
    const existing = await env.DB.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').bind(id, user.id).first<Row>();
    if (existing) return json(unpack(existing));
    const count = await env.DB.prepare('SELECT count(*) n FROM resumes WHERE user_id=?').bind(user.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= COLLECTION_LIMITS.resumes) fail(409, 'RESUME_LIMIT', 'Limite de 100 currículos atingido.');
    await env.DB.prepare('INSERT INTO resumes(id,user_id,title,template_id,data_json,created_at,updated_at,source) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, user.id, body.title, body.templateId, JSON.stringify(body.data), stamp, stamp, body.source).run();
    return json(unpack((await env.DB.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').bind(id, user.id).first<Row>())!), 201);
  }
  if (!match) return fail(404, 'NOT_FOUND', 'Currículo não encontrado.');
  const row = await env.DB.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').bind(match[1], user.id).first<Row>();
  if (!row) return fail(404, 'NOT_FOUND', 'Currículo não encontrado.');
  if (path.endsWith('/versions') && request.method === 'GET') {
    return json({ versions: (await env.DB.prepare('SELECT revision,source,created_at,template_id FROM resume_versions WHERE resume_id=? ORDER BY revision DESC LIMIT 100').bind(row.id).all()).results });
  }
  if (match[2] && request.method === 'POST') {
    const body = await readJson(request, z.object({ revision: z.number().int().positive() }));
    const version = await env.DB.prepare('SELECT * FROM resume_versions WHERE resume_id=? AND revision=?').bind(row.id, Number(match[2])).first<Row>();
    if (!version) return fail(404, 'NOT_FOUND', 'Versão não encontrada.');
    const result = await env.DB.prepare("UPDATE resumes SET data_json=?,template_id=?,revision=revision+1,updated_at=?,source='manual' WHERE id=? AND user_id=? AND revision=? RETURNING *")
      .bind(version.data_json, version.template_id, new Date().toISOString(), row.id, user.id, body.revision).first<Row>();
    if (!result) fail(409, 'REVISION_CONFLICT', 'O currículo mudou. Carregue a versão atual.');
    return json(unpack(result));
  }
  if (path.endsWith('/versions') || match[2]) fail(405, 'METHOD_NOT_ALLOWED', 'Método inválido.');
  if (request.method === 'GET') return json(unpack(row));
  if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').bind(row.id, user.id).run(); return json({ ok: true }); }
  if (request.method === 'PUT') {
    const body = await readJson(request, writeSchema);
    if (!body.revision) fail(400, 'REVISION_REQUIRED', 'Informe a revisão.');
    const result = await env.DB.prepare('UPDATE resumes SET title=?,template_id=?,data_json=?,revision=revision+1,updated_at=?,source=? WHERE id=? AND user_id=? AND revision=? RETURNING *')
      .bind(body.title, body.templateId, JSON.stringify(body.data), new Date().toISOString(), body.source, row.id, user.id, body.revision).first<Row>();
    if (!result) fail(409, 'REVISION_CONFLICT', 'Há alterações em outra aba ou dispositivo. Escolha qual versão manter.');
    return json(unpack(result));
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Método inválido.');
}
