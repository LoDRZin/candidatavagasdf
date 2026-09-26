import { z } from 'zod';
import type { AiEnv } from '../ai';
import type { AccessEnv } from '../access';
export type PlatformEnv = Env & AiEnv & AccessEnv & {
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  EMAIL_API_KEY?: string; EMAIL_FROM?: string; APP_ORIGIN?: string;
  AUTH_ENABLED?: string; COURSES_ENABLED?: string; AI_RESUME_STRUCTURE_ENABLED?: string;
  GEMINI_RESUME_MODEL?: string; LOCAL_MAIL_PREVIEW?: string; REMINDER_EMAILS_ENABLED?: string;
};
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function fail(status: number, code: string, message: string): never { throw new HttpError(status, code, message); }
export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  return Response.json(data, { status, headers: responseHeaders });
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>, max = 100_000): Promise<T> {
  if (!request.headers.get('Content-Type')?.includes('application/json')) fail(415, 'CONTENT_TYPE', 'Envie JSON.');
  const value = await boundedJson(request, max);
  const parsed = schema.safeParse(value);
  if (!parsed.success) fail(400, 'INVALID_REQUEST', 'Revise os campos e os limites de tamanho.');
  return parsed.data;
}
export async function boundedJson(response: Request | Response, max: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) fail(400, 'INVALID_JSON', 'Conteúdo ausente.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      if (size > max) { await reader.cancel(); fail(413, 'PAYLOAD_TOO_LARGE', 'Conteúdo longo demais.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return fail(400, 'INVALID_JSON', 'JSON inválido.'); }
}
export function local(request: Request, env: PlatformEnv) {
  return env.LOCAL_MAIL_PREVIEW === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
export function origin(request: Request, env: PlatformEnv) {
  const actual = new URL(request.url).origin;
  if (new URL(request.url).protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) fail(403, 'HTTPS_REQUIRED', 'Use uma conexão HTTPS.');
  if (env.APP_ORIGIN && !local(request, env) && actual !== env.APP_ORIGIN) fail(403, 'ORIGIN_DENIED', 'Origem não autorizada.');
  return actual;
}
export function mutation(request: Request, env: PlatformEnv) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('Origin') !== origin(request, env)) fail(403, 'ORIGIN_DENIED', 'Origem não autorizada.');
}
export async function hash(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
export function hex(value: Uint8Array) { return Array.from(value, b => b.toString(16).padStart(2, '0')).join(''); }
export function token() { return hex(crypto.getRandomValues(new Uint8Array(32))); }
export async function limit(env: PlatformEnv, key: string, maximum = 20, seconds = 60) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const id = await hash(`${key}:${bucket}`);
  const row = await env.DB.prepare('INSERT INTO request_limits (id, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count')
    .bind(id, Date.now() + seconds * 2000).first<{ count: number }>();
  if (!row || row.count > maximum) fail(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos.');
}
export function assertMethod(request: Request, method: string) { if (request.method !== method) fail(405, 'METHOD_NOT_ALLOWED', `Use ${method}.`); }
