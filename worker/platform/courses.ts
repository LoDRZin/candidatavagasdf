import { z } from 'zod';
import pilots from '../../content/course-pilots.json';
import { courseInput, type CourseInput } from '../../shared/contracts';
import { requireUser, session } from './auth';
import { fail, json, limit, readJson, type PlatformEnv } from './http';
import { bearerMatches } from '../security';
type Lesson = { id: string; title: string; content_json: string; course_version_id: string; pass_score: number | null; slug: string; course_id: string; course_title: string };
type ProgressLesson = { id: string; module_id: string; title: string; estimated_minutes: number; position: number; status: 'not_started' | 'started' | 'completed'; last_block: number; revision: number; percent: number; question_preview: string | null };
type Attempt = { id: string; user_id: string; lesson_id: string; revision: number; submitted_at: string | null; score: number | null; passed: number };
type Question = { id: string; type: string; prompt: string; explanation: string };
type Option = { id: string; question_id: string; label: string; is_correct: number };
type EditorialLesson = { id: string; title: string; content_json: string };
async function enrolledLesson(env: PlatformEnv, userId: string, id: string): Promise<Lesson> {
  const row = await env.DB.prepare(`SELECT l.*,m.course_version_id,v.pass_score,c.slug,c.id course_id,c.title course_title FROM lessons l JOIN course_modules m ON m.id=l.module_id JOIN course_versions v ON v.id=m.course_version_id JOIN courses c ON c.id=v.course_id JOIN course_enrollments e ON e.course_version_id=v.id AND e.user_id=? WHERE l.id=?`).bind(userId, id).first<Lesson>();
  if (!row) return fail(404, 'NOT_FOUND', 'Matricule-se para acessar esta aula.'); return row;
}
async function questions(env: PlatformEnv, lessonId: string, reveal = false) {
  const rows = (await env.DB.prepare('SELECT id,type,prompt,explanation FROM quiz_questions WHERE lesson_id=? ORDER BY position').bind(lessonId).all<Question>()).results;
  const options = (await env.DB.prepare('SELECT o.* FROM quiz_options o JOIN quiz_questions q ON q.id=o.question_id WHERE q.lesson_id=? ORDER BY o.position').bind(lessonId).all<Option>()).results;
  return rows.map(q => ({ id: q.id, type: q.type, prompt: q.prompt, ...(reveal ? { explanation: q.explanation } : {}), options: options.filter(o => o.question_id === q.id).map(o => ({ id: o.id, label: o.label, ...(reveal ? { correct: Boolean(o.is_correct) } : {}) })) }));
}
async function learnerQuestions(env: PlatformEnv, lessonId: string, submitted = false, attemptId?: string) {
  const editorial = await questions(env, lessonId, false) as { id: string; type: string; prompt: string; options: { id: string; label: string }[] }[];
  if (!submitted || !attemptId) return editorial;
  const [answerRows, explanations, keys] = await Promise.all([
    env.DB.prepare('SELECT question_id,answer_json FROM quiz_answers WHERE attempt_id=?').bind(attemptId).all<{ question_id: string; answer_json: string }>(),
    env.DB.prepare('SELECT id,explanation FROM quiz_questions WHERE lesson_id=?').bind(lessonId).all<{ id: string; explanation: string }>(),
    env.DB.prepare('SELECT question_id,id FROM quiz_options WHERE question_id IN (SELECT id FROM quiz_questions WHERE lesson_id=?) AND is_correct=1').bind(lessonId).all<{ question_id: string; id: string }>(),
  ]);
  const answers = new Map(answerRows.results.map(row => [row.question_id, JSON.parse(row.answer_json) as unknown]));
  return editorial.map(question => {
    const explanation = explanations.results.find(row => row.id === question.id)?.explanation ?? '';
    if (question.type === 'reflection') return { ...question, feedback: { verdict: 'recorded' as const, explanation } };
    const value = answers.get(question.id);
    const correctIds = keys.results.filter(row => row.question_id === question.id).map(row => row.id);
    const correct = Array.isArray(value) && value.length === correctIds.length && correctIds.every(id => value.includes(id));
    return { ...question, feedback: { verdict: correct ? 'correct' as const : 'incorrect' as const, explanation } };
  });
}
async function attemptStatistics(env: PlatformEnv, attempt: Attempt, lessonId: string) {
  if (!attempt.submitted_at) return undefined;
  const [questions, answers] = await Promise.all([
    env.DB.prepare('SELECT id,type FROM quiz_questions WHERE lesson_id=?').bind(lessonId).all<{ id: string; type: string }>(),
    env.DB.prepare('SELECT question_id,answer_json FROM quiz_answers WHERE attempt_id=?').bind(attempt.id).all<{ question_id: string; answer_json: string }>(),
  ]);
  let correctQuestions = 0;
  for (const question of questions.results.filter(q => q.type !== 'reflection')) {
    const answer = answers.results.find(row => row.question_id === question.id);
    if (!answer) continue;
    const selected = JSON.parse(answer.answer_json) as string[];
    const correct = (await env.DB.prepare('SELECT id FROM quiz_options WHERE question_id=? AND is_correct=1').bind(question.id).all<{ id: string }>()).results.map(row => row.id);
    if (selected.length === correct.length && correct.every(id => selected.includes(id))) correctQuestions++;
  }
  return { correctQuestions, objectiveQuestions: questions.results.filter(q => q.type !== 'reflection').length, reflectionsWritten: answers.results.filter(answer => questions.results.some(q => q.id === answer.question_id && q.type === 'reflection') && String(JSON.parse(answer.answer_json) ?? '').trim()).length };
}
async function engagement(env: PlatformEnv, userId: string | null) {
  if (!userId) return { streakDays: 0, achievements: [
    { id: 'first-reflection', title: 'Primeira reflexão', description: 'Envie sua primeira reflexão.', unlocked: false },
    { id: 'five-lessons', title: 'Cinco aulas concluídas', description: 'Conclua cinco aulas.', unlocked: false },
    { id: 'first-course', title: 'Primeiro curso concluído', description: 'Conclua um curso.', unlocked: false },
  ] };
  const [dates, reflections, lessons, courses] = await Promise.all([
    env.DB.prepare(`SELECT day FROM (SELECT DISTINCT date(updated_at) day FROM lesson_progress WHERE user_id=? UNION SELECT DISTINCT date(submitted_at) day FROM quiz_attempts WHERE user_id=? AND submitted_at IS NOT NULL) WHERE day IS NOT NULL ORDER BY day DESC`).bind(userId, userId).all<{ day: string }>(),
    env.DB.prepare(`SELECT COUNT(*) count FROM quiz_answers a JOIN quiz_questions q ON q.id=a.question_id JOIN quiz_attempts t ON t.id=a.attempt_id WHERE t.user_id=? AND t.submitted_at IS NOT NULL AND q.type='reflection' AND trim(json_extract(a.answer_json,'$'))<>''`).bind(userId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) count FROM lesson_progress WHERE user_id=? AND status='completed'").bind(userId).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) count FROM course_enrollments WHERE user_id=? AND completed_at IS NOT NULL").bind(userId).first<{ count: number }>(),
  ]);
  const today = new Date().toISOString().slice(0, 10), yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const active = new Set(dates.results.map(row => row.day));
  let cursor = active.has(today) ? today : active.has(yesterdayDate) ? yesterdayDate : '';
  let streakDays = 0;
  while (cursor && active.has(cursor)) {
    streakDays++;
    const date = new Date(`${cursor}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() - 1); cursor = date.toISOString().slice(0, 10);
  }
  return { streakDays, achievements: [
    { id: 'first-reflection' as const, title: 'Primeira reflexão', description: 'Envie sua primeira reflexão.', unlocked: (reflections?.count ?? 0) > 0 },
    { id: 'five-lessons' as const, title: 'Cinco aulas concluídas', description: 'Conclua cinco aulas.', unlocked: (lessons?.count ?? 0) >= 5 },
    { id: 'first-course' as const, title: 'Primeiro curso concluído', description: 'Conclua um curso.', unlocked: (courses?.count ?? 0) > 0 },
  ] };
}
async function progress(env: PlatformEnv, userId: string | null, version: string) {
  const rows = (await env.DB.prepare(`SELECT l.id,l.module_id,l.title,l.estimated_minutes,l.position,COALESCE(p.status,'not_started') status,COALESCE(p.last_block,0) last_block,COALESCE(p.revision,1) revision,COALESCE(p.percent,0) percent,(SELECT q.prompt FROM quiz_questions q WHERE q.lesson_id=l.id ORDER BY q.position LIMIT 1) question_preview FROM lessons l JOIN course_modules m ON m.id=l.module_id LEFT JOIN lesson_progress p ON p.lesson_id=l.id AND p.user_id=? WHERE m.course_version_id=? ORDER BY m.position,l.position`).bind(userId, version).all<ProgressLesson>()).results;
  const enrollment = userId ? await env.DB.prepare('SELECT last_lesson_id FROM course_enrollments WHERE user_id=? AND course_version_id=?').bind(userId, version).first<{ last_lesson_id: string | null }>() : null;
  const completed = rows.filter(x => x.status === 'completed').length;
  return {
    enrolled: Boolean(enrollment), lessons: rows, percent: rows.length ? Math.floor(completed / rows.length * 100) : 0,
    completedLessons: completed, totalLessons: rows.length, estimatedMinutes: rows.reduce((sum, lesson) => sum + lesson.estimated_minutes, 0),
    completed: rows.length > 0 && rows.length === completed, lastLessonId: enrollment?.last_lesson_id ?? null,
  };
}
async function completeIfReady(env: PlatformEnv, userId: string, lesson: Lesson) {
  const blocks = JSON.parse(lesson.content_json) as unknown[];
  await env.DB.prepare(`UPDATE lesson_progress SET status='completed',percent=100,completed_at=COALESCE(completed_at,?),revision=revision+1 WHERE user_id=? AND lesson_id=? AND status<>'completed' AND last_block>=? AND EXISTS(SELECT 1 FROM quiz_attempts WHERE user_id=? AND lesson_id=? AND submitted_at IS NOT NULL AND passed=1)`)
    .bind(new Date().toISOString(), userId, lesson.id, blocks.length, userId, lesson.id).run();
  const value = await progress(env, userId, lesson.course_version_id);
  if (value.completed) await env.DB.prepare('UPDATE course_enrollments SET completed_at=COALESCE(completed_at,?) WHERE user_id=? AND course_version_id=?').bind(new Date().toISOString(), userId, lesson.course_version_id).run();
}
export async function handleCourses(request: Request, env: PlatformEnv) {
  if (env.COURSES_ENABLED === 'false') fail(503, 'COURSES_DISABLED', 'Cursos temporariamente indisponíveis.');
  const url = new URL(request.url), path = url.pathname;
  if (path === '/api/courses' && request.method === 'GET') {
    const viewer = env.AUTH_ENABLED === 'false' ? null : await session(request, env);
    if (viewer && request.headers.get('X-Account-Id') && request.headers.get('X-Account-Id') !== viewer.id) fail(409, 'ACCOUNT_CHANGED', 'A conta mudou. Reabra esta página antes de sincronizar.');
    const courses = (await env.DB.prepare(`SELECT c.*,v.id version_id,v.version FROM courses c JOIN course_versions v ON v.course_id=c.id WHERE c.status='published' AND v.status='published' AND v.version=(SELECT MAX(v2.version) FROM course_versions v2 WHERE v2.course_id=c.id AND v2.status='published') ORDER BY c.title`).all<{ version_id: string }>()).results;
    return json({ courses: await Promise.all(courses.map(async course => ({ ...course, progress: await progress(env, viewer?.id ?? null, course.version_id) }))) });
  }
  const courseMatch = path.match(/^\/api\/courses\/([^/]+)(?:\/(enroll|progress))?$/);
  if (courseMatch && !courseMatch[2] && request.method === 'GET') {
    const requested = url.searchParams.get('version');
    const viewer = requested ? await requireUser(request, env) : env.AUTH_ENABLED === 'false' ? null : await session(request, env);
    if (viewer && request.headers.get('X-Account-Id') && request.headers.get('X-Account-Id') !== viewer.id) fail(409, 'ACCOUNT_CHANGED', 'A conta mudou. Reabra esta página antes de sincronizar.');
    const course = await env.DB.prepare(requested ? 'SELECT * FROM courses WHERE slug=?' : "SELECT * FROM courses WHERE slug=? AND status='published'").bind(courseMatch[1]).first<{ id: string }>();
    if (!course) return fail(404, 'NOT_FOUND', 'Curso não encontrado.');
    let version;
    if (requested) version = await env.DB.prepare('SELECT v.* FROM course_versions v JOIN course_enrollments e ON e.course_version_id=v.id WHERE v.id=? AND v.course_id=? AND e.user_id=?').bind(requested, course.id, viewer!.id).first<{ id: string }>();
    else version = await env.DB.prepare("SELECT * FROM course_versions WHERE course_id=? AND status='published' ORDER BY version DESC LIMIT 1").bind(course.id).first<{ id: string }>();
    if (!version) return fail(404, 'NOT_FOUND', 'Versão não encontrada.');
    const modules = (await env.DB.prepare('SELECT * FROM course_modules WHERE course_version_id=? ORDER BY position').bind(version.id).all<{ id: string }>()).results;
    const value = await progress(env, viewer?.id ?? null, version.id);
    return json({ course, version, progress: value, engagement: await engagement(env, viewer?.id ?? null), modules: modules.map(m => ({ ...m, lessons: value.lessons.filter(l => l.module_id === m.id) })) });
  }
  const user = await requireUser(request, env);
  if (path === '/api/me/learning' && request.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT e.*,c.title,c.slug,c.id course_id,v.version FROM course_enrollments e JOIN course_versions v ON v.id=e.course_version_id JOIN courses c ON c.id=v.course_id WHERE e.user_id=? ORDER BY e.updated_at DESC').bind(user.id).all<{ course_version_id: string }>()).results;
    return json({ courses: await Promise.all(rows.map(async row => ({ ...row, ...await progress(env, user.id, row.course_version_id) }))) });
  }
  if (courseMatch?.[2] === 'enroll' && request.method === 'POST') {
    const body = await readJson(request, z.object({ courseVersionId: z.string().min(1) }));
    const enrolled = await env.DB.prepare('SELECT e.course_version_id FROM course_enrollments e JOIN course_versions v ON v.id=e.course_version_id WHERE e.user_id=? AND v.course_id=? AND v.id=?').bind(user.id, courseMatch[1], body.courseVersionId).first();
    if (enrolled) return json(await progress(env, user.id, body.courseVersionId));
    const version = await env.DB.prepare("SELECT v.id FROM course_versions v JOIN courses c ON c.id=v.course_id WHERE v.id=? AND c.id=? AND v.status='published' AND c.status='published'").bind(body.courseVersionId, courseMatch[1]).first();
    if (!version) return fail(404, 'NOT_FOUND', 'Curso não publicado.');
    const stamp = new Date().toISOString();
    await env.DB.prepare('INSERT INTO course_enrollments(user_id,course_version_id,started_at,updated_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(user.id, body.courseVersionId, stamp, stamp).run();
    return json(await progress(env, user.id, body.courseVersionId));
  }
  if (courseMatch?.[2] === 'progress' && request.method === 'GET') {
    const version = url.searchParams.get('version');
    const own = await env.DB.prepare('SELECT e.course_version_id FROM course_enrollments e JOIN course_versions v ON v.id=e.course_version_id WHERE e.user_id=? AND v.course_id=? AND v.id=?').bind(user.id, courseMatch[1], version).first();
    if (!own) return fail(404, 'NOT_FOUND', 'Matrícula não encontrada.'); return json(await progress(env, user.id, version!));
  }
  const lessonMatch = path.match(/^\/api\/lessons\/([^/]+)(?:\/(progress|attempts))?$/);
  if (lessonMatch) {
    const lesson = await enrolledLesson(env, user.id, lessonMatch[1]!);
    const stamp = new Date().toISOString();
    if (!lessonMatch[2] && request.method === 'GET') {
      await env.DB.prepare('INSERT INTO lesson_progress(user_id,lesson_id,started_at,updated_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(user.id, lesson.id, stamp, stamp).run();
      await env.DB.prepare('UPDATE course_enrollments SET last_lesson_id=?,updated_at=? WHERE user_id=? AND course_version_id=?').bind(lesson.id, stamp, user.id, lesson.course_version_id).run();
      const value = await progress(env, user.id, lesson.course_version_id);
      const index = value.lessons.findIndex(item => item.id === lesson.id);
      const attempt = await env.DB.prepare('SELECT * FROM quiz_attempts WHERE user_id=? AND lesson_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').bind(user.id, lesson.id).first<Attempt>();
      return json({ id: lesson.id, title: lesson.title, blocks: JSON.parse(lesson.content_json), versionId: lesson.course_version_id, passScore: lesson.pass_score, questions: await learnerQuestions(env, lesson.id, Boolean(attempt?.submitted_at), attempt?.id),
        course: { id: lesson.course_id, title: lesson.course_title, slug: lesson.slug, versionId: lesson.course_version_id, progress: value },
        previousLessonId: value.lessons[index - 1]?.id ?? null, nextLessonId: value.lessons[index + 1]?.id ?? null,
        progress: await env.DB.prepare('SELECT * FROM lesson_progress WHERE user_id=? AND lesson_id=?').bind(user.id, lesson.id).first(),
        attempt: attempt ? { ...attempt, answers: (await env.DB.prepare('SELECT question_id,answer_json FROM quiz_answers WHERE attempt_id=?').bind(attempt.id).all()).results, statistics: await attemptStatistics(env, attempt, lesson.id) } : null });
    }
    if (lessonMatch[2] === 'progress' && request.method === 'PUT') {
      const body = await readJson(request, z.object({ lastBlock: z.number().int().nonnegative(), revision: z.number().int().positive() }));
      const blocks = JSON.parse(lesson.content_json) as unknown[];
      if (body.lastBlock > blocks.length) fail(400, 'INVALID_PROGRESS', 'Bloco inválido.');
      const result = await env.DB.prepare(`UPDATE lesson_progress SET last_block=MAX(last_block,?),percent=CASE WHEN status='completed' THEN 100 ELSE MAX(percent,?) END,revision=revision+1,updated_at=? WHERE user_id=? AND lesson_id=? AND revision=? RETURNING revision`)
        .bind(body.lastBlock, Math.floor(body.lastBlock / blocks.length * 90), stamp, user.id, lesson.id, body.revision).first();
      if (!result) fail(409, 'REVISION_CONFLICT', 'Progresso alterado em outra aba. Atualize a aula.');
      await env.DB.prepare('UPDATE course_enrollments SET last_lesson_id=?,updated_at=? WHERE user_id=? AND course_version_id=?').bind(lesson.id, stamp, user.id, lesson.course_version_id).run();
      await completeIfReady(env, user.id, lesson);
      return json(await env.DB.prepare('SELECT * FROM lesson_progress WHERE user_id=? AND lesson_id=?').bind(user.id, lesson.id).first());
    }
    if (lessonMatch[2] === 'attempts' && request.method === 'POST') {
      const body = await readJson(request, z.object({ clientRequestId: z.string().uuid() }));
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO quiz_attempts(id,user_id,lesson_id,client_request_id,started_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,client_request_id) DO NOTHING').bind(id, user.id, lesson.id, body.clientRequestId, stamp).run();
      const attempt = await env.DB.prepare('SELECT * FROM quiz_attempts WHERE user_id=? AND client_request_id=?').bind(user.id, body.clientRequestId).first<Attempt>();
      if (attempt?.lesson_id !== lesson.id) fail(409, 'REQUEST_CONFLICT', 'Identificador já utilizado em outra aula.'); return json(attempt);
    }
  }
  const attemptMatch = path.match(/^\/api\/attempts\/([^/]+)(?:\/(submit|answers\/([^/]+)))?$/);
  if (attemptMatch) {
    const attempt = await env.DB.prepare('SELECT * FROM quiz_attempts WHERE id=? AND user_id=?').bind(attemptMatch[1], user.id).first<Attempt>();
    if (!attempt) return fail(404, 'NOT_FOUND', 'Tentativa não encontrada.');
    const lesson = await enrolledLesson(env, user.id, attempt.lesson_id);
    if (!attemptMatch[2] && request.method === 'GET') return json({ ...attempt, answers: (await env.DB.prepare('SELECT question_id,answer_json FROM quiz_answers WHERE attempt_id=?').bind(attempt.id).all()).results, questions: await learnerQuestions(env, lesson.id, Boolean(attempt.submitted_at), attempt.id), statistics: await attemptStatistics(env, attempt, lesson.id) });
    if (attemptMatch[3] && request.method === 'PUT') {
      const body = await readJson(request, z.object({ revision: z.number().int().positive(), answer: z.union([z.string().trim().max(2000), z.array(z.string()).max(10)]) }));
      if (attempt.submitted_at) fail(409, 'ATTEMPT_CLOSED', 'Esta tentativa já foi enviada.');
      const q = await env.DB.prepare('SELECT * FROM quiz_questions WHERE id=? AND lesson_id=?').bind(attemptMatch[3], lesson.id).first<Question>();
      if (!q) return fail(400, 'INVALID_QUESTION', 'Pergunta inválida.');
      const allowed = (await env.DB.prepare('SELECT id FROM quiz_options WHERE question_id=?').bind(q.id).all<{ id: string }>()).results.map(x => x.id);
      if (q.type === 'reflection' ? typeof body.answer !== 'string' : !Array.isArray(body.answer) || body.answer.some(x => !allowed.includes(x)) || new Set(body.answer).size !== body.answer.length || (q.type === 'single_choice' && body.answer.length > 1)) fail(400, 'INVALID_ANSWER', 'Resposta inválida.');
      const operation = crypto.randomUUID();
      const results = await env.DB.batch([
        env.DB.prepare('UPDATE quiz_attempts SET revision=revision+1,mutation_key=? WHERE id=? AND user_id=? AND revision=? AND submitted_at IS NULL').bind(operation, attempt.id, user.id, body.revision),
        env.DB.prepare('INSERT INTO quiz_answers(attempt_id,question_id,answer_json) SELECT id,?,? FROM quiz_attempts WHERE id=? AND mutation_key=? ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer_json=excluded.answer_json').bind(q.id, JSON.stringify(body.answer), attempt.id, operation),
      ]);
      if (!results[0]!.meta.changes) fail(409, 'REVISION_CONFLICT', 'Resposta alterada em outra aba. Atualize a aula.');
      return json({ revision: body.revision + 1 });
    }
    if (attemptMatch[2] === 'submit' && request.method === 'POST') {
      if (attempt.submitted_at) { await completeIfReady(env, user.id, lesson); return json({ ...attempt, questions: await learnerQuestions(env, lesson.id, true, attempt.id), statistics: await attemptStatistics(env, attempt, lesson.id) }); }
      const body = await readJson(request, z.object({ revision: z.number().int().positive() }));
      if (body.revision !== attempt.revision) fail(409, 'REVISION_CONFLICT', 'A tentativa mudou. Atualize antes de enviar.');
      const qs = (await env.DB.prepare('SELECT * FROM quiz_questions WHERE lesson_id=?').bind(lesson.id).all<Question>()).results;
      const answers = (await env.DB.prepare('SELECT * FROM quiz_answers WHERE attempt_id=?').bind(attempt.id).all<{ question_id: string; answer_json: string }>()).results;
      let correct = 0, objective = 0;
      for (const q of qs) {
        const answer = answers.find(a => a.question_id === q.id); const value: unknown = answer ? JSON.parse(answer.answer_json) : null;
        if (q.type === 'reflection') { if (typeof value !== 'string' || !value.trim()) fail(400, 'INCOMPLETE_QUIZ', 'Responda todas as perguntas.'); continue; }
        if (!Array.isArray(value) || !value.length) fail(400, 'INCOMPLETE_QUIZ', 'Responda todas as perguntas.');
        const options = (await env.DB.prepare('SELECT id FROM quiz_options WHERE question_id=? AND is_correct=1').bind(q.id).all<{ id: string }>()).results.map(x => x.id);
        objective++; if (options.length === value.length && options.every(x => value.includes(x))) correct++;
      }
      const score = objective ? Math.round(correct / objective * 100) : null;
      const passed = lesson.pass_score === null || score === null || score >= lesson.pass_score;
      const result = await env.DB.prepare('UPDATE quiz_attempts SET score=?,passed=?,submitted_at=?,revision=revision+1 WHERE id=? AND user_id=? AND revision=? AND submitted_at IS NULL RETURNING *')
        .bind(score, passed ? 1 : 0, new Date().toISOString(), attempt.id, user.id, body.revision).first<Attempt>();
      if (!result) fail(409, 'REVISION_CONFLICT', 'A tentativa mudou. Atualize antes de enviar.');
      await completeIfReady(env, user.id, lesson);
      return json({ ...result, questions: await learnerQuestions(env, lesson.id, true, result.id), statistics: await attemptStatistics(env, result, lesson.id) });
    }
  }
  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}

export async function saveCourse(env: PlatformEnv, input: CourseInput) {
  for (const module of input.modules) for (const lesson of module.lessons) for (const q of lesson.questions) {
    const correct = q.options.filter(x => x.correct).length;
    if (q.type === 'reflection' ? q.options.length !== 0 : q.options.length < 2 || correct < 1 || (q.type === 'single_choice' && correct !== 1)) fail(400, 'INVALID_QUIZ', 'Revise opções e gabarito.');
  }
  const existing = await env.DB.prepare('SELECT id FROM courses WHERE slug=?').bind(input.slug).first<{ id: string }>();
  const courseId = existing?.id ?? crypto.randomUUID(), versionId = crypto.randomUUID(), stamp = new Date().toISOString();
  const count = await env.DB.prepare('SELECT COALESCE(MAX(version),0)+1 version FROM course_versions WHERE course_id=?').bind(courseId).first<{ version: number }>();
  const statements: D1PreparedStatement[] = [];
  if (!existing) statements.push(env.DB.prepare('INSERT INTO courses(id,slug,title,description,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(courseId, input.slug, input.title, input.description, stamp, stamp));
  statements.push(env.DB.prepare('INSERT INTO course_versions(id,course_id,version,pass_score,created_at) VALUES(?,?,?,?,?)').bind(versionId, courseId, count?.version ?? 1, input.passScore, stamp));
  input.modules.forEach((module, mi) => {
    const moduleId = crypto.randomUUID(); statements.push(env.DB.prepare('INSERT INTO course_modules(id,course_version_id,title,position) VALUES(?,?,?,?)').bind(moduleId, versionId, module.title, mi));
    module.lessons.forEach((lesson, li) => {
      const lessonId = crypto.randomUUID(); statements.push(env.DB.prepare('INSERT INTO lessons(id,module_id,title,content_json,position) VALUES(?,?,?,?,?)').bind(lessonId, moduleId, lesson.title, JSON.stringify(lesson.blocks), li));
      lesson.questions.forEach((q, qi) => { const questionId = crypto.randomUUID(); statements.push(env.DB.prepare('INSERT INTO quiz_questions(id,lesson_id,type,prompt,explanation,position) VALUES(?,?,?,?,?,?)').bind(questionId, lessonId, q.type, q.prompt, q.explanation, qi));
        q.options.forEach((o, oi) => statements.push(env.DB.prepare('INSERT INTO quiz_options(id,question_id,label,is_correct,position) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), questionId, o.label, o.correct ? 1 : 0, oi))); });
    });
  });
  if (statements.length > 90) fail(400, 'COURSE_TOO_LARGE', 'Divida o curso: esta versão excede 90 registros.');
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      fail(409, 'VERSION_CONFLICT', 'Outra versão foi criada ao mesmo tempo. Atualize a lista e tente novamente.');
    }
    throw error;
  }
  return { courseId, versionId };
}

async function assertPublishableCourse(env: PlatformEnv, versionId: string) {
  const lessons = (await env.DB.prepare(`SELECT l.id,l.title,l.content_json FROM lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.course_version_id=? ORDER BY m.position,l.position`).bind(versionId).all<EditorialLesson>()).results;
  if (!lessons.length) fail(400, 'INCOMPLETE_COURSE', 'Inclua pelo menos uma aula antes de publicar.');
  for (const lesson of lessons) {
    let blocks: unknown;
    try { blocks = JSON.parse(lesson.content_json); } catch { blocks = null; }
    if (!Array.isArray(blocks) || blocks.length < 3) fail(400, 'INCOMPLETE_COURSE', `A aula “${lesson.title}” precisa de pelo menos três blocos de conteúdo.`);
    const qs = await questions(env, lesson.id, true);
    if (!qs.some(q => q.type !== 'reflection')) fail(400, 'INCOMPLETE_COURSE', `A aula “${lesson.title}” precisa de uma atividade objetiva.`);
    if (!qs.some(q => q.type === 'reflection')) fail(400, 'INCOMPLETE_COURSE', `A aula “${lesson.title}” precisa de uma reflexão privada.`);
    if (qs.some(q => !q.explanation?.trim())) fail(400, 'INCOMPLETE_COURSE', `Revise as explicações das atividades da aula “${lesson.title}”.`);
  }
}

export async function handleAdminCourses(request: Request, env: PlatformEnv) {
  if (!await bearerMatches(request, env.ADMIN_TOKEN)) fail(401, 'ADMIN_AUTH_REQUIRED', 'Acesso administrativo necessário.');
  if (request.method !== 'GET') await limit(env, `admin-courses:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, 30, 60);
  const path = new URL(request.url).pathname;
  if (path === '/api/admin/courses/pilots' && request.method === 'GET') return json(pilots);
  if (path === '/api/admin/courses' && request.method === 'GET') return json({ courses: (await env.DB.prepare('SELECT c.title,c.slug,v.* FROM course_versions v JOIN courses c ON c.id=v.course_id ORDER BY v.created_at DESC').all()).results });
  if (path === '/api/admin/courses' && request.method === 'POST') return json(await saveCourse(env, await readJson(request, courseInput)), 201);
  const match = path.match(/^\/api\/admin\/courses\/([^/]+)(?:\/(publish|archive))?$/);
  if (match && request.method === 'GET') {
    const modules = (await env.DB.prepare('SELECT * FROM course_modules WHERE course_version_id=? ORDER BY position').bind(match[1]).all<{ id: string }>()).results;
    return json({ modules: await Promise.all(modules.map(async m => ({ ...m, lessons: await Promise.all((await env.DB.prepare('SELECT * FROM lessons WHERE module_id=? ORDER BY position').bind(m.id).all<{ id: string; content_json: string }>()).results.map(async l => ({ ...l, blocks: JSON.parse(l.content_json), questions: await questions(env, l.id, true) }))) }))) });
  }
  if (match?.[2] && request.method === 'POST') {
    const version = await env.DB.prepare('SELECT course_id,status FROM course_versions WHERE id=?').bind(match[1]).first<{ course_id: string; status: string }>();
    if (!version) return fail(404, 'NOT_FOUND', 'Versão não encontrada.');
    const publish = match[2] === 'publish', stamp = new Date().toISOString();
    if (publish) await assertPublishableCourse(env, match[1]!);
    const changed = await env.DB.prepare('UPDATE course_versions SET status=?,published_at=CASE WHEN ? THEN COALESCE(published_at,?) ELSE published_at END WHERE id=? AND status=? RETURNING course_id')
      .bind(publish ? 'published' : 'archived', publish ? 1 : 0, stamp, match[1], publish ? 'draft' : 'published').first<{ course_id: string }>();
    if (!changed) fail(409, 'VERSION_CONFLICT', 'O estado desta versão mudou. Atualize a lista antes de continuar.');
    await env.DB.prepare(`UPDATE courses SET status=CASE WHEN EXISTS(
      SELECT 1 FROM course_versions WHERE course_id=? AND status='published'
    ) THEN 'published' ELSE 'archived' END, published_at=COALESCE(published_at,?),updated_at=? WHERE id=?`)
      .bind(version.course_id, stamp, stamp, version.course_id).run();
    return json({ ok: true });
  }
  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}
