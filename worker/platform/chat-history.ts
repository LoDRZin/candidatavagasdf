import { z } from 'zod';
import { requireUser } from './auth';
import { assertMethod, fail, json, limit, readJson, type PlatformEnv } from './http';

const conversationId = z.string().regex(/^[A-Za-z0-9-]{8,80}$/);
const source = z.enum(['general', 'orientation', 'interview']);
const messageSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{8,80}$/),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(6000),
  local: z.boolean().optional().default(false),
});
const conversationSchema = z.object({
  source,
  sourceLabel: z.string().trim().min(1).max(80),
  context: z.string().trim().max(600),
  messages: z.array(messageSchema).min(1).max(30),
});

type ConversationRow = {
  id: string;
  source: 'general' | 'orientation' | 'interview';
  source_label: string;
  context: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type MessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  is_local: number;
};

const now = () => new Date().toISOString();
const inSevenDays = () => new Date(Date.now() + 7 * 86400_000).toISOString();

function summary(row: ConversationRow) {
  return {
    id: row.id,
    source: row.source,
    sourceLabel: row.source_label,
    context: row.context,
    title: row.title,
    messageCount: Number(row.message_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function titleFor(messages: z.infer<typeof messageSchema>[], conversationSource: z.infer<typeof source>) {
  const firstUserMessage = messages.find(message => message.role === 'user')?.content.replace(/\s+/g, ' ').trim();
  if (firstUserMessage) return firstUserMessage.slice(0, 80);
  if (conversationSource === 'interview') return 'Prática de entrevista';
  if (conversationSource === 'orientation') return 'Orientação de carreira';
  return 'Conversa geral';
}

async function purgeExpired(env: PlatformEnv, userId: string, stamp: string) {
  await env.DB.prepare('DELETE FROM ai_chat_conversations WHERE user_id=? AND expires_at<=?').bind(userId, stamp).run();
}

async function listConversations(env: PlatformEnv, userId: string) {
  const stamp = now();
  await purgeExpired(env, userId, stamp);
  const result = await env.DB.prepare(`SELECT id,source,source_label,context,title,message_count,created_at,updated_at,expires_at
    FROM ai_chat_conversations WHERE user_id=? AND expires_at>?
    ORDER BY updated_at DESC LIMIT 50`).bind(userId, stamp).all<ConversationRow>();
  return json({ conversations: result.results.map(summary), retentionDays: 7 });
}

async function getConversation(env: PlatformEnv, userId: string, id: string) {
  const stamp = now();
  const [conversationResult, messagesResult] = await env.DB.batch([
    env.DB.prepare(`SELECT id,source,source_label,context,title,message_count,created_at,updated_at,expires_at
      FROM ai_chat_conversations WHERE id=? AND user_id=? AND expires_at>?`).bind(id, userId, stamp),
    env.DB.prepare(`SELECT id,role,content,is_local FROM ai_chat_messages
      WHERE conversation_id=? AND user_id=? ORDER BY sequence`).bind(id, userId),
  ]);
  const conversation = conversationResult.results[0] as ConversationRow | undefined;
  if (!conversation) fail(404, 'CONVERSATION_NOT_FOUND', 'Conversa não encontrada ou já expirada.');
  const messages = (messagesResult.results as unknown as MessageRow[]).map(message => ({
    id: message.id,
    role: message.role,
    content: message.content,
    local: Boolean(message.is_local),
  }));
  return json({ conversation: { ...summary(conversation), messages } });
}

async function saveConversation(request: Request, env: PlatformEnv, userId: string, id: string) {
  await limit(env, `chat-history:${userId}`, 120, 60);
  const body = await readJson(request, conversationSchema, 220_000);
  const existing = await env.DB.prepare('SELECT user_id FROM ai_chat_conversations WHERE id=?').bind(id).first<{ user_id: string }>();
  if (existing && existing.user_id !== userId) fail(404, 'CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');

  const stamp = now();
  const expiry = inSevenDays();
  const messages = body.messages.slice(-30);
  const statements = [
    env.DB.prepare(`INSERT INTO ai_chat_conversations
      (id,user_id,source,source_label,context,title,message_count,created_at,updated_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET source=excluded.source,source_label=excluded.source_label,
        context=excluded.context,title=excluded.title,message_count=excluded.message_count,
        updated_at=excluded.updated_at,expires_at=excluded.expires_at
      WHERE ai_chat_conversations.user_id=excluded.user_id`)
      .bind(id, userId, body.source, body.sourceLabel, body.context, titleFor(messages, body.source), messages.length, stamp, stamp, expiry),
    env.DB.prepare('DELETE FROM ai_chat_messages WHERE conversation_id=? AND user_id=?').bind(id, userId),
    ...messages.map((message, sequence) => env.DB.prepare(`INSERT INTO ai_chat_messages
      (conversation_id,user_id,id,sequence,role,content,is_local,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(id, userId, message.id, sequence, message.role, message.content, message.local ? 1 : 0, stamp)),
  ];
  await env.DB.batch(statements);
  return getConversation(env, userId, id);
}

async function deleteConversation(env: PlatformEnv, userId: string, id: string) {
  await env.DB.prepare('DELETE FROM ai_chat_conversations WHERE id=? AND user_id=?').bind(id, userId).run();
  return json({ ok: true });
}

export async function handleChatHistory(request: Request, env: PlatformEnv) {
  const user = await requireUser(request, env, false);
  const path = new URL(request.url).pathname;
  if (path === '/api/chat-conversations') {
    assertMethod(request, 'GET');
    return listConversations(env, user.id);
  }
  const match = path.match(/^\/api\/chat-conversations\/([A-Za-z0-9-]{8,80})$/);
  if (!match) fail(404, 'NOT_FOUND', 'Conversa não encontrada.');
  const id = conversationId.parse(match[1]);
  if (request.method === 'GET') return getConversation(env, user.id, id);
  if (request.method === 'PUT') return saveConversation(request, env, user.id, id);
  if (request.method === 'DELETE') return deleteConversation(env, user.id, id);
  fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
}
