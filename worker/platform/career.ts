import { z } from 'zod';
import { requireUser } from './auth';
import { fail, json, limit, readJson, type PlatformEnv } from './http';
import { pageResult, readPage } from './pagination';
import { COLLECTION_LIMITS } from './collection-limits';

const journeyTypeSchema = z.enum(['first_job', 'returning', 'transition', 'growth']);
const workModeSchema = z.enum(['onsite', 'hybrid', 'remote']);
const applicationStatusSchema = z.enum(['saved', 'applied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']);
const eventTypeSchema = z.enum(['note', 'contact', 'interview', 'follow_up', 'status_changed']);
const shortText = (maximum: number) => z.string().trim().max(maximum);
const nullableDateSchema = z.preprocess(
  value => value === '' ? null : value,
  z.string().trim().max(40).refine(value => !Number.isNaN(Date.parse(value)), 'Data inválida.').nullable(),
);
const nullableIdSchema = z.preprocess(value => value === '' ? null : value, z.string().uuid().nullable());

const profilePatchSchema = z.object({
  journey_type: journeyTypeSchema.optional(),
  target_roles: z.array(shortText(120).min(1)).max(20).optional(),
  work_modes: z.array(workModeSchema).max(3).optional(),
  location_text: shortText(200).optional(),
  weekly_availability: z.number().int().min(0).max(168).nullable().optional(),
  main_challenge: shortText(2000).optional(),
  revision: z.number().int().positive().optional(),
}).refine(body => Object.keys(body).some(key => key !== 'revision'), 'Informe ao menos um campo.');

const applicationFieldsSchema = z.object({
  company: shortText(200).min(1),
  role: shortText(200).min(1),
  source: shortText(200).default(''),
  source_url: z.union([z.literal(''), z.string().trim().url().max(2000)]).default(''),
  location: shortText(200).default(''),
  work_mode: z.union([z.literal(''), workModeSchema]).default(''),
  status: applicationStatusSchema.default('saved'),
  salary_text: shortText(200).default(''),
  description_text: shortText(30_000).default(''),
  applied_at: nullableDateSchema.optional().default(null),
  next_action_at: nullableDateSchema.optional().default(null),
  resume_id: nullableIdSchema.optional().default(null),
  cover_letter_id: nullableIdSchema.optional().default(null),
  notes: shortText(10_000).default(''),
});
const applicationUpdateSchema = applicationFieldsSchema.extend({ revision: z.number().int().positive() });
const eventCreateSchema = z.object({
  event_type: eventTypeSchema,
  note: shortText(4000).default(''),
  occurred_at: nullableDateSchema.optional().default(null),
  to_status: applicationStatusSchema.optional(),
  revision: z.number().int().positive().optional(),
}).superRefine((body, context) => {
  if (body.event_type === 'status_changed' && !body.to_status) {
    context.addIssue({ code: 'custom', path: ['to_status'], message: 'Informe a nova etapa.' });
  }
  if (body.event_type === 'status_changed' && !body.revision) {
    context.addIssue({ code: 'custom', path: ['revision'], message: 'Informe a revisão.' });
  }
  if (body.event_type !== 'status_changed' && body.to_status) {
    context.addIssue({ code: 'custom', path: ['to_status'], message: 'A nova etapa só é válida em mudança de status.' });
  }
});

type CareerProfileRow = {
  user_id: string;
  journey_type: z.infer<typeof journeyTypeSchema>;
  target_roles_json: string;
  work_modes_json: string;
  location_text: string;
  weekly_availability: number | null;
  main_challenge: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
type ApplicationRow = {
  id: string;
  user_id: string;
  company: string;
  role: string;
  source: string;
  source_url: string;
  location: string;
  work_mode: '' | z.infer<typeof workModeSchema>;
  status: z.infer<typeof applicationStatusSchema>;
  salary_text: string;
  description_text: string;
  applied_at: string | null;
  next_action_at: string | null;
  resume_id: string | null;
  cover_letter_id: string | null;
  notes: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
type ApplicationEventRow = {
  id: string;
  application_id: string;
  user_id: string;
  event_type: 'created' | z.infer<typeof eventTypeSchema>;
  from_status: z.infer<typeof applicationStatusSchema> | null;
  to_status: z.infer<typeof applicationStatusSchema> | null;
  note: string;
  occurred_at: string;
  created_at: string;
};

function profileRecord(row: CareerProfileRow) {
  return {
    journey_type: row.journey_type,
    target_roles: z.array(shortText(120)).parse(JSON.parse(row.target_roles_json)),
    work_modes: z.array(workModeSchema).parse(JSON.parse(row.work_modes_json)),
    location_text: row.location_text,
    weekly_availability: row.weekly_availability,
    main_challenge: row.main_challenge,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function applicationRecord(row: ApplicationRow) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    source: row.source,
    source_url: row.source_url,
    location: row.location,
    work_mode: row.work_mode,
    status: row.status,
    salary_text: row.salary_text,
    description_text: row.description_text,
    applied_at: row.applied_at,
    next_action_at: row.next_action_at,
    resume_id: row.resume_id,
    cover_letter_id: row.cover_letter_id,
    notes: row.notes,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function eventRecord(row: ApplicationEventRow) {
  return {
    id: row.id,
    application_id: row.application_id,
    event_type: row.event_type,
    from_status: row.from_status,
    to_status: row.to_status,
    note: row.note,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
  };
}

async function ownedApplication(env: PlatformEnv, userId: string, id: string) {
  const row = await env.DB.prepare('SELECT * FROM job_applications WHERE id=? AND user_id=?').bind(id, userId).first<ApplicationRow>();
  if (!row) return fail(404, 'NOT_FOUND', 'Candidatura não encontrada.');
  return row;
}

async function assertOwnedResume(env: PlatformEnv, userId: string, resumeId: string | null) {
  if (!resumeId) return;
  const row = await env.DB.prepare('SELECT id FROM resumes WHERE id=? AND user_id=?').bind(resumeId, userId).first();
  if (!row) fail(400, 'INVALID_RESUME', 'O currículo selecionado não pertence à sua conta.');
}

async function handleCareerProfile(request: Request, env: PlatformEnv, userId: string) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM career_profiles WHERE user_id=?').bind(userId).first<CareerProfileRow>();
    return json({ profile: row ? profileRecord(row) : null });
  }
  if (request.method !== 'PATCH') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET ou PATCH.');
  const body = await readJson(request, profilePatchSchema);
  const current = await env.DB.prepare('SELECT * FROM career_profiles WHERE user_id=?').bind(userId).first<CareerProfileRow>();
  const stamp = new Date().toISOString();
  if (!current) {
    if (!body.journey_type) fail(400, 'JOURNEY_TYPE_REQUIRED', 'Escolha o tipo de objetivo profissional.');
    const created = await env.DB.prepare(`INSERT INTO career_profiles(
      user_id,journey_type,target_roles_json,work_modes_json,location_text,weekly_availability,main_challenge,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING RETURNING *`)
      .bind(userId, body.journey_type, JSON.stringify(body.target_roles ?? []), JSON.stringify(body.work_modes ?? []), body.location_text ?? '', body.weekly_availability ?? null, body.main_challenge ?? '', stamp, stamp)
      .first<CareerProfileRow>();
    if (!created) fail(409, 'REVISION_CONFLICT', 'O objetivo profissional mudou. Carregue a versão atual.');
    return json({ profile: profileRecord(created) });
  }
  if (!body.revision) fail(400, 'REVISION_REQUIRED', 'Informe a revisão.');
  const updated = await env.DB.prepare(`UPDATE career_profiles SET
    journey_type=?,target_roles_json=?,work_modes_json=?,location_text=?,weekly_availability=?,main_challenge=?,revision=revision+1,updated_at=?
    WHERE user_id=? AND revision=? RETURNING *`)
    .bind(
      body.journey_type ?? current.journey_type,
      JSON.stringify(body.target_roles ?? JSON.parse(current.target_roles_json)),
      JSON.stringify(body.work_modes ?? JSON.parse(current.work_modes_json)),
      body.location_text ?? current.location_text,
      body.weekly_availability === undefined ? current.weekly_availability : body.weekly_availability,
      body.main_challenge ?? current.main_challenge,
      stamp,
      userId,
      body.revision,
    ).first<CareerProfileRow>();
  if (!updated) fail(409, 'REVISION_CONFLICT', 'O objetivo profissional mudou. Carregue a versão atual.');
  return json({ profile: profileRecord(updated) });
}

async function handleApplicationCollection(request: Request, env: PlatformEnv, userId: string) {
  if (request.method === 'GET') {
    const statusValue = new URL(request.url).searchParams.get('status');
    const parsedStatus = statusValue ? applicationStatusSchema.safeParse(statusValue) : null;
    if (parsedStatus && !parsedStatus.success) fail(400, 'INVALID_STATUS', 'Etapa de candidatura inválida.');
    const scope = parsedStatus?.success ? parsedStatus.data : '';
    const { size, cursor } = readPage(request, 200, 200, scope);
    const query = env.DB.prepare(`SELECT * FROM job_applications WHERE user_id=?
      ${scope ? 'AND status=?' : ''}
      ${cursor ? 'AND (updated_at<? OR (updated_at=? AND id<?))' : ''}
      ORDER BY updated_at DESC,id DESC LIMIT ?`)
      .bind(userId, ...(scope ? [scope] : []), ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), size + 1);
    const rows = (await query.all<ApplicationRow>()).results;
    const page = pageResult(rows, size, row => row.updated_at, row => row.id, scope);
    return json({ applications: page.visible.map(applicationRecord), nextCursor: page.nextCursor });
  }
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET ou POST.');
  const body = await readJson(request, applicationFieldsSchema, 75_000);
  await assertOwnedResume(env, userId, body.resume_id);
  const count = await env.DB.prepare('SELECT count(*) count FROM job_applications WHERE user_id=?').bind(userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= COLLECTION_LIMITS.applications) fail(409, 'APPLICATION_LIMIT', 'Limite de 500 candidaturas atingido. Exclua registros antigos para continuar.');
  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const stamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO job_applications(
      id,user_id,company,role,source,source_url,location,work_mode,status,salary_text,description_text,applied_at,next_action_at,resume_id,cover_letter_id,notes,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, userId, body.company, body.role, body.source, body.source_url, body.location, body.work_mode, body.status, body.salary_text, body.description_text, body.applied_at, body.next_action_at, body.resume_id, body.cover_letter_id, body.notes, stamp, stamp),
    env.DB.prepare(`INSERT INTO application_events(id,application_id,user_id,event_type,from_status,to_status,note,occurred_at,created_at)
      VALUES(?,?,?,'created',NULL,?,'',?,?)`).bind(eventId, id, userId, body.status, stamp, stamp),
  ]);
  const created = await ownedApplication(env, userId, id);
  return json({ application: applicationRecord(created) }, 201);
}

async function handleApplicationItem(request: Request, env: PlatformEnv, userId: string, id: string) {
  const current = await ownedApplication(env, userId, id);
  if (request.method === 'GET') return json({ application: applicationRecord(current) });
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM job_applications WHERE id=? AND user_id=?').bind(id, userId).run();
    return json({ ok: true });
  }
  if (request.method !== 'PUT') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET, PUT ou DELETE.');
  const body = await readJson(request, applicationUpdateSchema, 75_000);
  await assertOwnedResume(env, userId, body.resume_id);
  const stamp = new Date().toISOString();
  const statements = [env.DB.prepare(`UPDATE job_applications SET
    company=?,role=?,source=?,source_url=?,location=?,work_mode=?,status=?,salary_text=?,description_text=?,applied_at=?,next_action_at=?,resume_id=?,cover_letter_id=?,notes=?,revision=revision+1,updated_at=?
    WHERE id=? AND user_id=? AND revision=?`)
    .bind(body.company, body.role, body.source, body.source_url, body.location, body.work_mode, body.status, body.salary_text, body.description_text, body.applied_at, body.next_action_at, body.resume_id, body.cover_letter_id, body.notes, stamp, id, userId, body.revision)];
  if (body.status !== current.status) {
    statements.push(env.DB.prepare(`INSERT INTO application_events(id,application_id,user_id,event_type,from_status,to_status,note,occurred_at,created_at)
      SELECT ?,id,user_id,'status_changed',?,?,'',?,? FROM job_applications
      WHERE id=? AND user_id=? AND revision=? AND updated_at=?`)
      .bind(crypto.randomUUID(), current.status, body.status, stamp, stamp, id, userId, body.revision + 1, stamp));
  }
  const results = await env.DB.batch(statements);
  if (results[0]?.meta.changes !== 1) fail(409, 'REVISION_CONFLICT', 'A candidatura mudou. Carregue a versão atual.');
  const updated = await ownedApplication(env, userId, id);
  return json({ application: applicationRecord(updated) });
}

async function handleApplicationEvents(request: Request, env: PlatformEnv, userId: string, applicationId: string) {
  const application = await ownedApplication(env, userId, applicationId);
  if (request.method === 'GET') {
    const { size, cursor } = readPage(request, 500, 500, applicationId);
    const rows = (await env.DB.prepare(`SELECT * FROM application_events
      WHERE application_id=? AND user_id=?
      ${cursor ? 'AND (occurred_at<? OR (occurred_at=? AND id<?))' : ''}
      ORDER BY occurred_at DESC,id DESC LIMIT ?`)
      .bind(applicationId, userId, ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), size + 1).all<ApplicationEventRow>()).results;
    const page = pageResult(rows, size, row => row.occurred_at, row => row.id, applicationId);
    return json({ events: page.visible.map(eventRecord), nextCursor: page.nextCursor });
  }
  if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET ou POST.');
  const body = await readJson(request, eventCreateSchema, 20_000);
  const count = await env.DB.prepare('SELECT count(*) count FROM application_events WHERE application_id=? AND user_id=?').bind(applicationId, userId).first<{ count: number }>();
  if ((count?.count ?? 0) >= COLLECTION_LIMITS.eventsPerApplication) fail(409, 'EVENT_LIMIT', 'Limite de histórico desta candidatura atingido.');
  const id = crypto.randomUUID();
  const stamp = new Date().toISOString();
  const occurredAt = body.occurred_at ?? stamp;
  if (body.event_type === 'status_changed') {
    if (body.to_status === application.status) fail(400, 'STATUS_UNCHANGED', 'Escolha uma etapa diferente da atual.');
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE job_applications SET status=?,revision=revision+1,updated_at=?
        WHERE id=? AND user_id=? AND revision=?`)
        .bind(body.to_status, stamp, applicationId, userId, body.revision),
      env.DB.prepare(`INSERT INTO application_events(id,application_id,user_id,event_type,from_status,to_status,note,occurred_at,created_at)
        SELECT ?,id,user_id,'status_changed',?, ?,?,?,? FROM job_applications
        WHERE id=? AND user_id=? AND revision=? AND updated_at=?`)
        .bind(id, application.status, body.to_status, body.note, occurredAt, stamp, applicationId, userId, (body.revision ?? 0) + 1, stamp),
    ]);
    if (results[0]?.meta.changes !== 1) fail(409, 'REVISION_CONFLICT', 'A candidatura mudou. Carregue a versão atual.');
  } else {
    await env.DB.prepare(`INSERT INTO application_events(id,application_id,user_id,event_type,from_status,to_status,note,occurred_at,created_at)
      VALUES(?,?,?,?,NULL,NULL,?,?,?)`).bind(id, applicationId, userId, body.event_type, body.note, occurredAt, stamp).run();
  }
  const event = await env.DB.prepare('SELECT * FROM application_events WHERE id=? AND application_id=? AND user_id=?').bind(id, applicationId, userId).first<ApplicationEventRow>();
  if (!event) fail(503, 'EVENT_NOT_SAVED', 'Não foi possível registrar o evento.');
  const updated = body.event_type === 'status_changed' ? await ownedApplication(env, userId, applicationId) : application;
  return json({ event: eventRecord(event), application: applicationRecord(updated) }, 201);
}

export async function handleCareer(request: Request, env: PlatformEnv) {
  const user = await requireUser(request, env);
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET') await limit(env, `career-mutation:${user.id}`, 120, 60);
  if (path === '/api/me/career-profile') return handleCareerProfile(request, env, user.id);
  if (path === '/api/applications') return handleApplicationCollection(request, env, user.id);
  const eventMatch = path.match(/^\/api\/applications\/([^/]+)\/events$/);
  if (eventMatch) return handleApplicationEvents(request, env, user.id, eventMatch[1]!);
  const itemMatch = path.match(/^\/api\/applications\/([^/]+)$/);
  if (itemMatch) return handleApplicationItem(request, env, user.id, itemMatch[1]!);
  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}
