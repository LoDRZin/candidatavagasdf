import { go } from '../platform/api';

export type AiChatSource = 'general' | 'orientation' | 'interview';

export type AiChatHandoff = {
  id: string;
  source: AiChatSource;
  sourceLabel: string;
  context: string;
  message: string;
  useAi: boolean;
  createdAt: number;
};

const HANDOFF_KEY = 'conectavagasdf.ai-chat.handoff.v1';
let memoryHandoff: AiChatHandoff | null = null;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function openAiChat(input: Omit<AiChatHandoff, 'id' | 'createdAt'>) {
  const handoff: AiChatHandoff = {
    ...input,
    id: createId(),
    message: input.message.trim().slice(0, 1800),
    context: input.context.trim().slice(0, 600),
    sourceLabel: input.sourceLabel.trim().slice(0, 80),
    createdAt: Date.now(),
  };

  memoryHandoff = handoff;
  try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff)); }
  catch { /* O redirecionamento ainda funciona na sessão atual. */ }
  go('/chat-ia');
}

export function consumeAiChatHandoff(): AiChatHandoff | null {
  let handoff = memoryHandoff;
  memoryHandoff = null;

  try {
    const value = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    if (value) handoff = JSON.parse(value) as AiChatHandoff;
  } catch { /* Ignora armazenamento indisponível ou inválido. */ }

  if (!handoff || !handoff.message?.trim()) return null;
  if (!['general', 'orientation', 'interview'].includes(handoff.source)) return null;
  if (Date.now() - Number(handoff.createdAt) > 5 * 60 * 1000) return null;
  return {
    ...handoff,
    message: handoff.message.trim().slice(0, 1800),
    context: String(handoff.context ?? '').trim().slice(0, 600),
    sourceLabel: String(handoff.sourceLabel ?? 'Chat IA').trim().slice(0, 80),
    useAi: Boolean(handoff.useAi),
  };
}
