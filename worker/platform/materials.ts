import { z } from 'zod';
import { requireUser } from './auth';
import { fail, json, limit, readJson, type PlatformEnv } from './http';
import { COLLECTION_LIMITS } from './collection-limits';
import { pageResult, readPage } from './pagination';

const sourceTypeSchema = z.enum(['formal_work', 'informal_work', 'education', 'volunteering', 'project', 'personal']);
const letterSourceSchema = z.enum(['manual', 'local_template', 'ai_accepted']);
const shortText = (maximum: number) => z.string().trim().max(maximum);
const nullableId = z.preprocess(value => value === '' ? null : value, z.string().uuid().nullable());

const storyFields = z.object({
  title: shortText(160).min(1),
  context_text: shortText(4000).default(''),
  action_text: shortText(4000).default(''),
  result_text: shortText(4000).default(''),
  learning_text: shortText(4000).default(''),
  skills: z.array(shortText(120).min(1)).max(30).default([]),
  source_type: sourceTypeSchema.default('personal'),
});
const storyUpdate = storyFields.extend({ revision: z.number().int().positive() });
const letterFields = z.object({
  application_id: z.string().uuid(),
  application_revision: z.number().int().positive(),
  resume_id: nullableId.optional().default(null),
  title: shortText(160).min(1),
  company: shortText(200).default(''),
  role: shortText(200).default(''),
  reason_text: shortText(3000).default(''),
  contribution_text: shortText(3000).default(''),
  body_text: shortText(10_000).default(''),
  source: letterSourceSchema.default('manual'),
});
const letterUpdate = letterFields.omit({ application_revision: true }).extend({ revision: z.number().int().positive() });

type StoryRow = {
  id: string; user_id: string; title: string; context_text: string; action_text: string; result_text: string;
  learning_text: string; skills_json: string; source_type: z.infer<typeof sourceTypeSchema>; revision: number;
  created_at: string; updated_at: string;
};
type LetterRow = {
  id: string; user_id: string; application_id: string; resume_id: string | null; title: string; company: string;
  role: string; reason_text: string; contribution_text: string; body_text: string;
  source: z.infer<typeof letterSourceSchema>; revision: number; created_at: string; updated_at: string;
};
type ApplicationRow = { id: string; user_id: string; revision: number; cover_letter_id: string | null };

function storyRecord(row: StoryRow) {
  return {
    id: row.id, title: row.title, context_text: row.context_text, action_text: row.action_text,
    result_text: row.result_text, learning_text: row.learning_text,
    skills: z.array(shortText(120)).parse(JSON.parse(row.skills_json)), source_type: row.source_type,
    revision: row.revision, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function letterRecord(row: LetterRow) {
  const { user_id: _userId, ...record } = row;
  void _userId;
  return record;
}

async function ownedApplication(env: PlatformEnv, userId: string, id: string) {
  const row = await env.DB.prepare('SELECT id,user_id,revision,cover_letter_id FROM job_applications WHERE id=? AND user_id=?')
    .bind(id, userId).first<ApplicationRow>();
  if (!row) fail(404, 'NOT_FOUND', 'Candidatura não encontrada.');
  return row;
}

async function assertOwnedResume(env: PlatformEnv, userId: string, resumeId: string | null) {
  if (!resumeId) return;
  const row = await env.DB.prepare('SELECT id FROM resumes WHERE id=? AND user_id=?').bind(resumeId, userId).first();
  if (!row) fail(400, 'INVALID_RESUME', 'O currículo selecionado não pertence à sua conta.');
}

async function handleStoryCollection(request: Request, env: PlatformEnv, userId: string) {
  if (request.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM career_stories WHERE user_id=? ORDER BY updated_at DESC LIMIT 300')
      .bind(userId).all<StoryRow>()).results;
    return json({ stories: rows.map(storyRecord) });
  }
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET ou POST.');
  const body = await readJson(request, storyFields, 25_000);
  const count = await env.DB.prepare('SELECT count(*) count FROM career_stories WHERE user_id=?').bind(userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= COLLECTION_LIMITS.stories) fail(409, 'STORY_LIMIT', 'Limite de 300 histórias atingido.');
  const id = crypto.randomUUID(), stamp = new Date().toISOString();
  const created = await env.DB.prepare(`INSERT INTO career_stories(
    id,user_id,title,context_text,action_text,result_text,learning_text,skills_json,source_type,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .bind(id, userId, body.title, body.context_text, body.action_text, body.result_text, body.learning_text, JSON.stringify(body.skills), body.source_type, stamp, stamp)
    .first<StoryRow>();
  if (!created) fail(503, 'STORY_NOT_SAVED', 'Não foi possível salvar a história.');
  return json({ story: storyRecord(created) }, 201);
}

async function handleStoryItem(request: Request, env: PlatformEnv, userId: string, id: string) {
  const current = await env.DB.prepare('SELECT * FROM career_stories WHERE id=? AND user_id=?').bind(id, userId).first<StoryRow>();
  if (!current) fail(404, 'NOT_FOUND', 'História não encontrada.');
  if (request.method === 'GET') return json({ story: storyRecord(current) });
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM career_stories WHERE id=? AND user_id=?').bind(id, userId).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET, PUT ou DELETE.');
  const body = await readJson(request, storyUpdate, 25_000);
  const updated = await env.DB.prepare(`UPDATE career_stories SET
    title=?,context_text=?,action_text=?,result_text=?,learning_text=?,skills_json=?,source_type=?,revision=revision+1,updated_at=?
    WHERE id=? AND user_id=? AND revision=? RETURNING *`)
    .bind(body.title, body.context_text, body.action_text, body.result_text, body.learning_text, JSON.stringify(body.skills), body.source_type, new Date().toISOString(), id, userId, body.revision)
    .first<StoryRow>();
  if (!updated) fail(409, 'REVISION_CONFLICT', 'A história mudou. Carregue a versão atual.');
  return json({ story: storyRecord(updated) });
}

async function handleApplicationStories(request: Request, env: PlatformEnv, userId: string, applicationId: string, storyId?: string) {
  await ownedApplication(env, userId, applicationId);
  if (request.method === 'GET' && !storyId) {
    const rows = (await env.DB.prepare(`SELECT s.* FROM career_stories s
      JOIN application_story_links l ON l.story_id=s.id AND l.user_id=s.user_id
      WHERE l.application_id=? AND l.user_id=? ORDER BY l.created_at DESC`)
      .bind(applicationId, userId).all<StoryRow>()).results;
    return json({ stories: rows.map(storyRecord) });
  }
  if (request.method === 'POST' && !storyId) {
    const body = await readJson(request, z.object({ story_id: z.string().uuid() }));
    const story = await env.DB.prepare('SELECT id FROM career_stories WHERE id=? AND user_id=?').bind(body.story_id, userId).first();
    if (!story) fail(404, 'NOT_FOUND', 'História não encontrada.');
    await env.DB.prepare(`INSERT INTO application_story_links(application_id,story_id,user_id,created_at)
      VALUES(?,?,?,?) ON CONFLICT(application_id,story_id) DO NOTHING`)
      .bind(applicationId, body.story_id, userId, new Date().toISOString()).run();
    return json({ ok: true }, 201);
  }
  if (request.method === 'DELETE' && storyId) {
    await env.DB.prepare('DELETE FROM application_story_links WHERE application_id=? AND story_id=? AND user_id=?')
      .bind(applicationId, storyId, userId).run();
    return json({ ok: true });
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Método inválido.');
}

async function handleLetterCollection(request: Request, env: PlatformEnv, userId: string) {
  if (request.method === 'GET') {
    const applicationId = new URL(request.url).searchParams.get('applicationId');
    if (applicationId) await ownedApplication(env, userId, applicationId);
    const scope = applicationId ?? '';
    const { size, cursor } = readPage(request, 100, 100, scope);
    const query = env.DB.prepare(`SELECT * FROM cover_letters WHERE user_id=?
      ${applicationId ? 'AND application_id=?' : ''}
      ${cursor ? 'AND (updated_at<? OR (updated_at=? AND id<?))' : ''}
      ORDER BY updated_at DESC,id DESC LIMIT ?`)
      .bind(userId, ...(applicationId ? [applicationId] : []), ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), size + 1);
    const page = pageResult((await query.all<LetterRow>()).results, size, row => row.updated_at, row => row.id, scope);
    return json({ letters: page.visible.map(letterRecord), nextCursor: page.nextCursor });
  }
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET ou POST.');
  const body = await readJson(request, letterFields, 30_000);
  const application = await ownedApplication(env, userId, body.application_id);
  await assertOwnedResume(env, userId, body.resume_id);
  const count = await env.DB.prepare('SELECT count(*) count FROM cover_letters WHERE user_id=?').bind(userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= COLLECTION_LIMITS.letters) fail(409, 'LETTER_LIMIT', 'Limite de 200 cartas atingido.');
  const id = crypto.randomUUID(), stamp = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO cover_letters(
      id,user_id,application_id,resume_id,title,company,role,reason_text,contribution_text,body_text,source,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, userId, body.application_id, body.resume_id, body.title, body.company, body.role, body.reason_text, body.contribution_text, body.body_text, body.source, stamp, stamp),
    env.DB.prepare('UPDATE job_applications SET cover_letter_id=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?')
      .bind(id, stamp, body.application_id, userId, body.application_revision),
  ]);
  if (results[1]?.meta.changes !== 1) fail(409, 'REVISION_CONFLICT', 'A candidatura mudou. Carregue a versão atual.');
  const created = await env.DB.prepare('SELECT * FROM cover_letters WHERE id=? AND user_id=?').bind(id, userId).first<LetterRow>();
  const updatedApplication = await ownedApplication(env, userId, application.id);
  if (!created) fail(503, 'LETTER_NOT_SAVED', 'Não foi possível salvar a carta.');
  return json({ letter: letterRecord(created), application: updatedApplication }, 201);
}

async function handleLetterItem(request: Request, env: PlatformEnv, userId: string, id: string) {
  const current = await env.DB.prepare('SELECT * FROM cover_letters WHERE id=? AND user_id=?').bind(id, userId).first<LetterRow>();
  if (!current) fail(404, 'NOT_FOUND', 'Carta não encontrada.');
  if (request.method === 'GET') return json({ letter: letterRecord(current) });
  if (request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('UPDATE job_applications SET cover_letter_id=NULL,revision=revision+1,updated_at=? WHERE user_id=? AND cover_letter_id=?')
        .bind(new Date().toISOString(), userId, id),
      env.DB.prepare('DELETE FROM cover_letters WHERE id=? AND user_id=?').bind(id, userId),
    ]);
    return json({ ok: true });
  }
  if (request.method !== 'PUT') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET, PUT ou DELETE.');
  const body = await readJson(request, letterUpdate, 30_000);
  if (body.application_id !== current.application_id) fail(400, 'APPLICATION_IMMUTABLE', 'A carta não pode ser movida para outra candidatura.');
  await ownedApplication(env, userId, body.application_id);
  await assertOwnedResume(env, userId, body.resume_id);
  const updated = await env.DB.prepare(`UPDATE cover_letters SET
    resume_id=?,title=?,company=?,role=?,reason_text=?,contribution_text=?,body_text=?,source=?,revision=revision+1,updated_at=?
    WHERE id=? AND user_id=? AND revision=? RETURNING *`)
    .bind(body.resume_id, body.title, body.company, body.role, body.reason_text, body.contribution_text, body.body_text, body.source, new Date().toISOString(), id, userId, body.revision)
    .first<LetterRow>();
  if (!updated) fail(409, 'REVISION_CONFLICT', 'A carta mudou. Carregue a versão atual.');
  return json({ letter: letterRecord(updated) });
}

export async function handleMaterials(request: Request, env: PlatformEnv) {
  const user = await requireUser(request, env);
  if (request.method !== 'GET') await limit(env, `materials-mutation:${user.id}`, 120, 60);
  const path = new URL(request.url).pathname;
  if (path === '/api/career-stories') return handleStoryCollection(request, env, user.id);
  const storyMatch = path.match(/^\/api\/career-stories\/([^/]+)$/);
  if (storyMatch) return handleStoryItem(request, env, user.id, storyMatch[1]!);
  const linkMatch = path.match(/^\/api\/applications\/([^/]+)\/stories(?:\/([^/]+))?$/);
  if (linkMatch) return handleApplicationStories(request, env, user.id, linkMatch[1]!, linkMatch[2]);
  if (path === '/api/cover-letters') return handleLetterCollection(request, env, user.id);
  const letterMatch = path.match(/^\/api\/cover-letters\/([^/]+)$/);
  if (letterMatch) return handleLetterItem(request, env, user.id, letterMatch[1]!);
  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}
