import { requireUser } from './auth';
import { fail, json, type PlatformEnv } from './http';

export const DEFAULT_AI_TOKEN_LIMIT = 4096;
export const DEFAULT_AI_REQUEST_LIMIT = 2;

type UsageRow = {
  user_id: string;
  token_limit: number;
  tokens_used: number;
  request_limit: number;
  requests_used: number;
  created_at: string;
  updated_at: string;
};

export type AiUsageReservation = {
  userId: string;
  feature: 'chat' | 'mentor' | 'resume' | 'interview';
  inputTokens: number;
  outputTokenLimit: number;
  reservedTokens: number;
};

const now = () => new Date().toISOString();

export function estimateTokens(...values: string[]) {
  const bytes = values.reduce((total, value) => total + new TextEncoder().encode(value).length, 0);
  return Math.max(1, Math.ceil(bytes / 4));
}

async function ensureUsage(env: PlatformEnv, userId: string) {
  const stamp = now();
  await env.DB.prepare(`INSERT INTO ai_usage_quotas(user_id, token_limit, tokens_used, request_limit, requests_used, created_at, updated_at)
    VALUES (?, ?, 0, ?, 0, ?, ?) ON CONFLICT(user_id) DO NOTHING`)
    .bind(userId, DEFAULT_AI_TOKEN_LIMIT, DEFAULT_AI_REQUEST_LIMIT, stamp, stamp).run();
}

export async function getAiUsage(env: PlatformEnv, userId: string): Promise<UsageRow> {
  await ensureUsage(env, userId);
  const row = await env.DB.prepare('SELECT * FROM ai_usage_quotas WHERE user_id=?').bind(userId).first<UsageRow>();
  if (!row) fail(503, 'USAGE_UNAVAILABLE', 'Não foi possível consultar sua cota agora.');
  return row;
}

export function usagePayload(row: UsageRow) {
  return {
    tokens: { limit: row.token_limit, used: row.tokens_used, remaining: Math.max(0, row.token_limit - row.tokens_used) },
    requests: { limit: row.request_limit, used: row.requests_used, remaining: Math.max(0, row.request_limit - row.requests_used) },
    updatedAt: row.updated_at,
  };
}

export async function reserveAiUsage(env: PlatformEnv, userId: string, inputTokens: number, requestedOutputTokens: number, feature: AiUsageReservation['feature']): Promise<AiUsageReservation | null> {
  await ensureUsage(env, userId);
  const normalizedInput = Math.max(1, Math.ceil(inputTokens));
  const normalizedOutput = Math.max(1, Math.ceil(requestedOutputTokens));
  const reservedTokens = normalizedInput + normalizedOutput;
  const stamp = now();
  const row = await env.DB.prepare(`UPDATE ai_usage_quotas
    SET tokens_used=tokens_used+?, requests_used=requests_used+1, updated_at=?
    WHERE user_id=? AND requests_used<request_limit AND tokens_used+?<=token_limit
    RETURNING user_id`)
    .bind(reservedTokens, stamp, userId, reservedTokens).first<{ user_id: string }>();
  return row ? { userId, feature, inputTokens: normalizedInput, outputTokenLimit: normalizedOutput, reservedTokens } : null;
}

export async function finalizeAiUsage(env: PlatformEnv, reservation: AiUsageReservation, output: string, provider: 'gemini' | 'openrouter', model: string) {
  const outputTokens = Math.min(reservation.outputTokenLimit, estimateTokens(output));
  const actualTokens = Math.min(reservation.reservedTokens, reservation.inputTokens + outputTokens);
  const refund = reservation.reservedTokens - actualTokens;
  const stamp = now();
  const statements = [env.DB.prepare(`INSERT INTO ai_usage_events(id,user_id,feature,provider,model,input_tokens,output_tokens,total_tokens,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), reservation.userId, reservation.feature, provider, model.slice(0, 200), reservation.inputTokens, outputTokens, actualTokens, stamp)];
  if (refund) statements.unshift(env.DB.prepare('UPDATE ai_usage_quotas SET tokens_used=MAX(0,tokens_used-?),updated_at=? WHERE user_id=?')
    .bind(refund, stamp, reservation.userId));
  await env.DB.batch(statements);
}

export async function releaseAiUsage(env: PlatformEnv, reservation: AiUsageReservation) {
  await env.DB.prepare('UPDATE ai_usage_quotas SET tokens_used=MAX(0,tokens_used-?),requests_used=MAX(0,requests_used-1),updated_at=? WHERE user_id=?')
    .bind(reservation.reservedTokens, now(), reservation.userId).run();
}

export async function handleUsage(request: Request, env: PlatformEnv) {
  if (request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  const user = await requireUser(request, env, false);
  return json(usagePayload(await getAiUsage(env, user.id)));
}
