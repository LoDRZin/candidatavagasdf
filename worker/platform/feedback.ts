import { z } from 'zod';
import { requireUser } from './auth';
import { assertMethod, json, limit, readJson, type PlatformEnv } from './http';

const feedbackSchema = z.object({
  context_type: z.enum(['weekly_plan', 'application_materials', 'career_story']),
  context_id: z.string().uuid().nullable().optional(),
  rating: z.number().int().min(1).max(5),
});

export async function handleFeedback(request: Request, env: PlatformEnv) {
  assertMethod(request, 'POST');
  const user = await requireUser(request, env);
  await limit(env, `feedback:${user.id}`, 10, 86_400);
  const body = await readJson(request, feedbackSchema, 2_000);
  await env.DB.prepare(`INSERT INTO feedback(id,user_id,context_type,context_id,rating,comment_redacted,consent_to_review,created_at)
    VALUES(?,?,?,?,?,NULL,0,?)`)
    .bind(crypto.randomUUID(), user.id, body.context_type, body.context_id ?? null, body.rating, new Date().toISOString()).run();
  return json({ ok: true }, 201);
}
