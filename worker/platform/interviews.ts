import { z } from 'zod';
import { handleAiAssist } from '../ai';
import { requireUser } from './auth';
import { fail, json, limit, readJson, type PlatformEnv } from './http';
import { COLLECTION_LIMITS } from './collection-limits';
import { pageResult, readPage } from './pagination';

const interviewFormat = z.enum(['unspecified', 'onsite', 'video', 'phone']);
const feedbackSource = z.enum(['none', 'local', 'ai']);
const shortText = (maximum: number) => z.string().trim().max(maximum);
const nullableDate = z.preprocess(value => value === '' ? null : value,
  z.string().trim().max(40).refine(value => !Number.isNaN(Date.parse(value)), 'Data inválida.').nullable());
const nullableId = z.preprocess(value => value === '' ? null : value, z.string().uuid().nullable());
const checklistItem = z.object({ id: shortText(80).min(1), title: shortText(200).min(1), done: z.boolean() });
const difficulties = z.enum(['nervousness', 'examples', 'clarity', 'company', 'questions', 'technical']);

const sessionFields = z.object({
  application_id: z.string().uuid(),
  title: shortText(160).min(1),
  scheduled_at: nullableDate.optional().default(null),
  format: interviewFormat.default('unspecified'),
  location_or_link: shortText(2000).default(''),
  company_questions: z.array(shortText(500).min(1)).max(30).default([]),
  checklist: z.array(checklistItem).max(30).default([]),
  reflection_text: shortText(10_000).default(''),
  difficulties: z.array(difficulties).max(6).default([]),
});
const sessionUpdate = sessionFields.extend({ revision: z.number().int().positive() });
const questionFields = z.object({
  question_text: shortText(1000).min(1),
  answer_text: shortText(12_000).default(''),
  story_id: nullableId.optional().default(null),
  practiced: z.boolean().default(false),
  feedback_text: shortText(12_000).default(''),
  feedback_source: feedbackSource.default('none'),
});
const questionUpdate = questionFields.extend({ revision: z.number().int().positive() });

type ApplicationRow = { id: string; company: string; role: string; description_text: string };
type SessionRow = {
  id: string; user_id: string; application_id: string; title: string; scheduled_at: string | null;
  format: z.infer<typeof interviewFormat>; location_or_link: string; company_questions_json: string;
  checklist_json: string; reflection_text: string; difficulties_json: string; revision: number;
  created_at: string; updated_at: string;
};
type QuestionRow = {
  id: string; session_id: string; user_id: string; question_text: string; answer_text: string; story_id: string | null;
  practiced: number; feedback_text: string; feedback_source: 'none' | 'local' | 'ai'; revision: number;
  created_at: string; updated_at: string;
};

function parseJson<T>(value: string, schema: z.ZodType<T>): T {
  try { return schema.parse(JSON.parse(value)); } catch { return fail(503, 'INVALID_STORED_DATA', 'Os dados salvos precisam de revisão.'); }
}

function sessionRecord(row: SessionRow) {
  return {
    id: row.id, application_id: row.application_id, title: row.title, scheduled_at: row.scheduled_at,
    format: row.format, location_or_link: row.location_or_link,
    company_questions: parseJson(row.company_questions_json, z.array(shortText(500))),
    checklist: parseJson(row.checklist_json, z.array(checklistItem)), reflection_text: row.reflection_text,
    difficulties: parseJson(row.difficulties_json, z.array(difficulties)), revision: row.revision,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function questionRecord(row: QuestionRow) {
  return {
    id: row.id, session_id: row.session_id, question_text: row.question_text, answer_text: row.answer_text,
    story_id: row.story_id, practiced: Boolean(row.practiced), feedback_text: row.feedback_text,
    feedback_source: row.feedback_source, revision: row.revision, created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function ownedApplication(env: PlatformEnv, userId: string, id: string) {
  const row = await env.DB.prepare('SELECT id,company,role,description_text FROM job_applications WHERE id=? AND user_id=?')
    .bind(id, userId).first<ApplicationRow>();
  if (!row) fail(404, 'NOT_FOUND', 'Candidatura não encontrada.');
  return row;
}

async function ownedSession(env: PlatformEnv, userId: string, id: string) {
  const row = await env.DB.prepare('SELECT * FROM interview_sessions WHERE id=? AND user_id=?').bind(id, userId).first<SessionRow>();
  if (!row) fail(404, 'NOT_FOUND', 'Preparação de entrevista não encontrada.');
  return row;
}

async function ownedQuestion(env: PlatformEnv, userId: string, id: string) {
  const row = await env.DB.prepare('SELECT * FROM interview_questions WHERE id=? AND user_id=?').bind(id, userId).first<QuestionRow>();
  if (!row) fail(404, 'NOT_FOUND', 'Pergunta não encontrada.');
  return row;
}

async function assertLinkedStory(env: PlatformEnv, userId: string, applicationId: string, storyId: string | null) {
  if (!storyId) return;
  const row = await env.DB.prepare(`SELECT s.id FROM career_stories s JOIN application_story_links l
    ON l.story_id=s.id AND l.user_id=s.user_id WHERE s.id=? AND s.user_id=? AND l.application_id=?`)
    .bind(storyId, userId, applicationId).first();
  if (!row) fail(400, 'STORY_NOT_LINKED', 'Vincule essa história à candidatura antes de usá-la na entrevista.');
}

async function handleCollection(request: Request, env: PlatformEnv, userId: string) {
  if (request.method === 'GET') {
    const applicationId = new URL(request.url).searchParams.get('applicationId');
    if (applicationId) {
      const parsed = z.string().uuid().safeParse(applicationId);
      if (!parsed.success) fail(400, 'INVALID_APPLICATION', 'Candidatura inválida.');
      await ownedApplication(env, userId, parsed.data);
    }
    const scope = applicationId ?? '';
    const { size, cursor } = readPage(request, applicationId ? 20 : 100, 100, scope);
    const query = env.DB.prepare(`SELECT s.* FROM interview_sessions s WHERE s.user_id=?
      ${applicationId ? 'AND s.application_id=?' : ''}
      ${cursor ? 'AND (s.updated_at<? OR (s.updated_at=? AND s.id<?))' : ''}
      ORDER BY s.updated_at DESC,s.id DESC LIMIT ?`)
      .bind(userId, ...(applicationId ? [applicationId] : []), ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), size + 1);
    const page = pageResult((await query.all<SessionRow>()).results, size, row => row.updated_at, row => row.id, scope);
    return json({ sessions: page.visible.map(sessionRecord), nextCursor: page.nextCursor });
  }
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET ou POST.');
  const body = await readJson(request, sessionFields, 40_000);
  await ownedApplication(env, userId, body.application_id);
  const count = await env.DB.prepare('SELECT count(*) count FROM interview_sessions WHERE user_id=? AND application_id=?')
    .bind(userId, body.application_id).first<{ count: number }>();
  if ((count?.count ?? 0) >= COLLECTION_LIMITS.interviewsPerApplication) fail(409, 'INTERVIEW_LIMIT', 'Limite de 20 preparações para esta candidatura atingido.');
  const id = crypto.randomUUID(), stamp = new Date().toISOString();
  const created = await env.DB.prepare(`INSERT INTO interview_sessions(
    id,user_id,application_id,title,scheduled_at,format,location_or_link,company_questions_json,checklist_json,reflection_text,difficulties_json,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .bind(id, userId, body.application_id, body.title, body.scheduled_at, body.format, body.location_or_link,
      JSON.stringify(body.company_questions), JSON.stringify(body.checklist), body.reflection_text, JSON.stringify(body.difficulties), stamp, stamp)
    .first<SessionRow>();
  if (!created) fail(503, 'INTERVIEW_NOT_SAVED', 'Não foi possível criar a preparação.');
  return json({ session: sessionRecord(created) }, 201);
}

async function handleSessionItem(request: Request, env: PlatformEnv, userId: string, id: string) {
  const current = await ownedSession(env, userId, id);
  if (request.method === 'GET') {
    const application = await ownedApplication(env, userId, current.application_id);
    const questions = (await env.DB.prepare('SELECT * FROM interview_questions WHERE session_id=? AND user_id=? ORDER BY created_at')
      .bind(id, userId).all<QuestionRow>()).results;
    return json({ session: sessionRecord(current), application, questions: questions.map(questionRecord) });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM interview_sessions WHERE id=? AND user_id=?').bind(id, userId).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET, PUT ou DELETE.');
  const body = await readJson(request, sessionUpdate, 40_000);
  if (body.application_id !== current.application_id) fail(400, 'APPLICATION_IMMUTABLE', 'A preparação não pode ser movida para outra candidatura.');
  const updated = await env.DB.prepare(`UPDATE interview_sessions SET title=?,scheduled_at=?,format=?,location_or_link=?,
    company_questions_json=?,checklist_json=?,reflection_text=?,difficulties_json=?,revision=revision+1,updated_at=?
    WHERE id=? AND user_id=? AND revision=? RETURNING *`)
    .bind(body.title, body.scheduled_at, body.format, body.location_or_link, JSON.stringify(body.company_questions),
      JSON.stringify(body.checklist), body.reflection_text, JSON.stringify(body.difficulties), new Date().toISOString(), id, userId, body.revision)
    .first<SessionRow>();
  if (!updated) fail(409, 'REVISION_CONFLICT', 'A preparação mudou. Carregue a versão atual.');
  return json({ session: sessionRecord(updated) });
}

async function handleQuestionCollection(request: Request, env: PlatformEnv, userId: string, sessionId: string) {
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const session = await ownedSession(env, userId, sessionId);
  const body = await readJson(request, questionFields, 30_000);
  if (body.feedback_source === 'ai') fail(400, 'AI_FEEDBACK_IMMUTABLE', 'O feedback de IA só pode ser criado pelo fluxo autenticado.');
  await assertLinkedStory(env, userId, session.application_id, body.story_id);
  const count = await env.DB.prepare('SELECT count(*) count FROM interview_questions WHERE session_id=? AND user_id=?')
    .bind(sessionId, userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= COLLECTION_LIMITS.questionsPerInterview) fail(409, 'QUESTION_LIMIT', 'Limite de 50 perguntas atingido.');
  const id = crypto.randomUUID(), stamp = new Date().toISOString();
  const created = await env.DB.prepare(`INSERT INTO interview_questions(
    id,session_id,user_id,question_text,answer_text,story_id,practiced,feedback_text,feedback_source,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *`)
    .bind(id, sessionId, userId, body.question_text, body.answer_text, body.story_id, body.practiced ? 1 : 0,
      body.feedback_text, body.feedback_source, stamp, stamp).first<QuestionRow>();
  if (!created) fail(503, 'QUESTION_NOT_SAVED', 'Não foi possível salvar a pergunta.');
  return json({ question: questionRecord(created) }, 201);
}

async function handleQuestionItem(request: Request, env: PlatformEnv, userId: string, id: string) {
  const current = await ownedQuestion(env, userId, id);
  const session = await ownedSession(env, userId, current.session_id);
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM interview_questions WHERE id=? AND user_id=?').bind(id, userId).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') fail(405, 'METHOD_NOT_ALLOWED', 'Use PUT ou DELETE.');
  const body = await readJson(request, questionUpdate, 30_000);
  if (body.feedback_source === 'ai' && (current.feedback_source !== 'ai' || body.feedback_text !== current.feedback_text)) {
    fail(400, 'AI_FEEDBACK_IMMUTABLE', 'O feedback de IA só pode ser criado pelo fluxo autenticado.');
  }
  await assertLinkedStory(env, userId, session.application_id, body.story_id);
  const updated = await env.DB.prepare(`UPDATE interview_questions SET question_text=?,answer_text=?,story_id=?,practiced=?,
    feedback_text=?,feedback_source=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=? RETURNING *`)
    .bind(body.question_text, body.answer_text, body.story_id, body.practiced ? 1 : 0, body.feedback_text,
      body.feedback_source, new Date().toISOString(), id, userId, body.revision).first<QuestionRow>();
  if (!updated) fail(409, 'REVISION_CONFLICT', 'A resposta mudou. Carregue a versão atual.');
  return json({ question: questionRecord(updated) });
}

async function handleAiFeedback(request: Request, env: PlatformEnv, userId: string, id: string) {
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const body = await readJson(request, z.object({ consent: z.literal(true), revision: z.number().int().positive() }), 2_000);
  const current = await ownedQuestion(env, userId, id);
  if (current.revision !== body.revision) fail(409, 'REVISION_CONFLICT', 'A resposta mudou. Salve novamente antes de pedir feedback.');
  if (!current.answer_text.trim()) fail(400, 'ANSWER_REQUIRED', 'Escreva e salve uma resposta antes de pedir feedback.');
  const session = await ownedSession(env, userId, current.session_id);
  const application = await ownedApplication(env, userId, session.application_id);
  const internalRequest = new Request(new URL('/api/ai/assist', request.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(request.url).origin },
    body: JSON.stringify({ kind: 'interview', question: current.question_text, answer: current.answer_text, role: application.role }),
  });
  const response = await handleAiAssist(internalRequest, env, userId);
  const payload = await response.json().catch(() => null);
  if (!response.ok) return json(payload ?? { error: { code: 'AI_UNAVAILABLE', message: 'A IA não respondeu desta vez.' } }, response.status);
  const parsed = z.object({ reply: z.string().trim().min(1).max(8000) }).safeParse(payload);
  if (!parsed.success) fail(502, 'AI_INVALID_RESPONSE', 'A IA respondeu em um formato inesperado.');
  const updated = await env.DB.prepare(`UPDATE interview_questions SET feedback_text=?,feedback_source='ai',revision=revision+1,updated_at=?
    WHERE id=? AND user_id=? AND revision=? RETURNING *`)
    .bind(parsed.data.reply, new Date().toISOString(), id, userId, body.revision).first<QuestionRow>();
  if (!updated) fail(409, 'REVISION_CONFLICT', 'A resposta mudou enquanto o feedback era preparado.');
  return json({ question: questionRecord(updated) });
}

export async function handleInterviews(request: Request, env: PlatformEnv) {
  const user = await requireUser(request, env);
  if (request.method !== 'GET') await limit(env, `interviews-mutation:${user.id}`, 120, 60);
  const path = new URL(request.url).pathname;
  if (path === '/api/interviews') return handleCollection(request, env, user.id);
  const questions = path.match(/^\/api\/interviews\/([^/]+)\/questions$/);
  if (questions) return handleQuestionCollection(request, env, user.id, questions[1]!);
  const feedback = path.match(/^\/api\/interview-questions\/([^/]+)\/feedback$/);
  if (feedback) return handleAiFeedback(request, env, user.id, feedback[1]!);
  const question = path.match(/^\/api\/interview-questions\/([^/]+)$/);
  if (question) return handleQuestionItem(request, env, user.id, question[1]!);
  const session = path.match(/^\/api\/interviews\/([^/]+)$/);
  if (session) return handleSessionItem(request, env, user.id, session[1]!);
  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}
