import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { readSse } from '../../shared/sse';
import { Icon } from '../components/Icon';
import { makeLocalInterviewFeedback, makeLocalMentorGuidance, requestCareerAssist } from '../lib/ai';
import { consumeAiChatHandoff, type AiChatHandoff, type AiChatSource } from '../lib/aiChatHandoff';
import { useAuth } from './Auth';
import { api, go, message as apiMessage } from './api';
import './AiChat.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  local?: boolean;
  pending?: boolean;
};

type SavedConversation = {
  id: string;
  source: AiChatSource;
  sourceLabel: string;
  context: string;
  consent: boolean;
  messages: ChatMessage[];
};

type ConversationSummary = {
  id: string;
  source: AiChatSource;
  sourceLabel: string;
  context: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type ConversationDetail = ConversationSummary & { messages: ChatMessage[] };

const ACTIVE_CHAT_KEY = 'conectavagasdf.ai-chat.active.v1';

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readSavedConversation(): SavedConversation | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ACTIVE_CHAT_KEY) ?? 'null') as SavedConversation | null;
    if (!parsed || !Array.isArray(parsed.messages) || !['general', 'orientation', 'interview'].includes(parsed.source)) return null;
    return {
      id: /^[A-Za-z0-9-]{8,80}$/.test(String(parsed.id ?? '')) ? String(parsed.id) : makeId(),
      source: parsed.source,
      sourceLabel: String(parsed.sourceLabel || 'Chat IA').slice(0, 80),
      context: String(parsed.context || 'Orientação geral').slice(0, 600),
      consent: Boolean(parsed.consent),
      messages: parsed.messages.slice(-30).filter(message => message?.content && (message.role === 'user' || message.role === 'assistant')).map(message => ({ ...message, pending: false })),
    };
  } catch { return null; }
}

function initialState(): { handoff: AiChatHandoff | null; conversation: SavedConversation } {
  const handoff = consumeAiChatHandoff();
  if (handoff) return {
    handoff,
    conversation: { id: makeId(), source: handoff.source, sourceLabel: handoff.sourceLabel, context: handoff.context, consent: handoff.useAi, messages: [] },
  };
  return {
    handoff: null,
    conversation: readSavedConversation() ?? { id: makeId(), source: 'general', sourceLabel: 'Chat IA', context: 'Orientação geral', consent: false, messages: [] },
  };
}

function historyDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function AiChatPage() {
  const { user } = useAuth();
  const canUseAi = Boolean(user?.email_verified_at);
  const [initial] = useState(initialState);
  const [conversationId, setConversationId] = useState(initial.conversation.id);
  const [source, setSource] = useState(initial.conversation.source);
  const [sourceLabel, setSourceLabel] = useState(initial.conversation.sourceLabel);
  const [context, setContext] = useState(initial.conversation.context);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.conversation.messages);
  const [input, setInput] = useState('');
  const [consent, setConsent] = useState(initial.conversation.consent && canUseAi);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const messagesRef = useRef(messages);
  const viewportRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialStarted = useRef(false);

  async function refreshHistory() {
    try {
      const result = await api<{ conversations: ConversationSummary[] }>('/api/chat-conversations');
      setHistory(result.conversations);
      setHistoryError('');
    } catch (cause) {
      setHistoryError(apiMessage(cause));
    } finally {
      setHistoryLoading(false);
    }
  }

  function replaceMessages(next: ChatMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  function updateAssistant(id: string, update: (message: ChatMessage) => ChatMessage) {
    replaceMessages(messagesRef.current.map(message => message.id === id ? update(message) : message));
  }

  async function sendMessage(rawValue: string, useAi = consent) {
    const value = rawValue.trim();
    if (!value || value.length > 1800 || busy) return;

    const prior = messagesRef.current.filter(message => !message.pending);
    const userMessage: ChatMessage = { id: makeId(), role: 'user', content: value, local: !useAi };
    const assistantId = makeId();
    const assistant: ChatMessage = { id: assistantId, role: 'assistant', content: '', local: !useAi, pending: true };
    replaceMessages([...prior, userMessage, assistant]);
    setInput('');
    setBusy(true);
    setError('');

    if (!useAi || !canUseAi) {
      const localReply = source === 'interview' ? makeLocalInterviewFeedback(value) : makeLocalMentorGuidance(value);
      await new Promise(resolve => window.setTimeout(resolve, 260));
      updateAssistant(assistantId, message => ({ ...message, content: localReply, local: true, pending: false }));
      setBusy(false);
      return;
    }

    if (source !== 'interview') {
      try {
        const history = prior.slice(-10).map(message => ({ role: message.role, content: message.content }));
        const reply = await requestCareerAssist({ kind: 'mentor', message: value, history });
        updateAssistant(assistantId, message => ({ ...message, content: reply, pending: false }));
      } catch (cause) {
        updateAssistant(assistantId, message => ({ ...message, content: makeLocalMentorGuidance(value), local: true, pending: false }));
        setError(`${cause instanceof Error ? cause.message : 'A IA não respondeu.'} Para não interromper sua conversa, mostramos uma orientação local.`);
      } finally {
        setBusy(false);
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const history = [...prior.filter(message => !message.local), userMessage].slice(-12).map(message => ({ role: message.role, content: message.content }));
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value, question: context, messages: history, consent: true }),
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? 'Não foi possível iniciar o feedback.');
      }
      if (!response.body) throw new Error('O navegador não recebeu o fluxo da IA.');

      let completed = false;
      for await (const event of readSse(response.body)) {
        if (event.event === 'delta') {
          const payload = JSON.parse(event.data) as { text?: string; token?: string };
          const token = payload.token ?? payload.text;
          if (token) updateAssistant(assistantId, message => ({ ...message, content: message.content + token }));
        } else if (event.event === 'error') {
          const payload = JSON.parse(event.data) as { message?: string };
          throw new Error(payload.message ?? 'A conexão com a IA foi interrompida.');
        } else if (event.event === 'done') {
          completed = true;
          break;
        }
      }
      if (!completed) throw new Error('O feedback terminou antes de ser concluído.');
      updateAssistant(assistantId, message => ({ ...message, pending: false }));
    } catch (cause) {
      if (!controller.signal.aborted) {
        updateAssistant(assistantId, message => ({ ...message, content: makeLocalInterviewFeedback(value), local: true, pending: false }));
        setError(cause instanceof Error ? `${cause.message} Mostramos uma revisão local.` : 'A IA não respondeu. Mostramos uma revisão local.');
      } else {
        replaceMessages(messagesRef.current.filter(message => message.id !== assistantId || Boolean(message.content)));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!initial.handoff || initialStarted.current) return;
      initialStarted.current = true;
      void sendMessage(initial.handoff.message, initial.handoff.useAi && canUseAi);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []); // O encaminhamento é consumido uma única vez ao montar a conversa.

  useEffect(() => { void refreshHistory(); }, []);

  useEffect(() => {
    try { sessionStorage.setItem(ACTIVE_CHAT_KEY, JSON.stringify({ id: conversationId, source, sourceLabel, context, consent, messages: messages.filter(message => !message.pending) } satisfies SavedConversation)); }
    catch { /* A conversa continua disponível enquanto a tela permanecer aberta. */ }
  }, [conversationId, source, sourceLabel, context, consent, messages]);

  useEffect(() => {
    const savedMessages = messages.filter(message => !message.pending && message.content.trim()).slice(-30);
    if (!savedMessages.length) return;
    const timer = window.setTimeout(() => {
      void api<{ conversation: ConversationDetail }>(`/api/chat-conversations/${conversationId}`, {
        source,
        sourceLabel,
        context,
        messages: savedMessages.map(({ id, role, content, local }) => ({ id, role, content, local: Boolean(local) })),
      }, 'PUT').then(() => refreshHistory()).catch(cause => setHistoryError(apiMessage(cause)));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [conversationId, source, sourceLabel, context, messages]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (input.trim() && !busy) void sendMessage(input);
    }
  }

  function startNewConversation() {
    abortRef.current?.abort();
    setSource('general');
    setConversationId(makeId());
    setSourceLabel('Chat IA');
    setContext('Orientação geral');
    setConsent(false);
    replaceMessages([]);
    setInput('');
    setBusy(false);
    setError('');
    try { sessionStorage.removeItem(ACTIVE_CHAT_KEY); } catch { /* Sem ação necessária. */ }
  }

  async function openConversation(id: string) {
    if (busy || id === conversationId) return;
    setHistoryError('');
    try {
      const result = await api<{ conversation: ConversationDetail }>(`/api/chat-conversations/${id}`);
      abortRef.current?.abort();
      setConversationId(result.conversation.id);
      setSource(result.conversation.source);
      setSourceLabel(result.conversation.sourceLabel);
      setContext(result.conversation.context);
      setConsent(false);
      replaceMessages(result.conversation.messages.map(item => ({ ...item, pending: false })));
      setInput('');
      setError('');
    } catch (cause) {
      setHistoryError(apiMessage(cause));
      await refreshHistory();
    }
  }

  async function deleteConversation(id: string) {
    if (busy) return;
    try {
      await api<{ ok: true }>(`/api/chat-conversations/${id}`, {}, 'DELETE');
      if (id === conversationId) startNewConversation();
      await refreshHistory();
    } catch (cause) {
      setHistoryError(apiMessage(cause));
    }
  }

  return <main className="zeno-workspace-page ai-chat-page">
    <header className="zeno-workspace-header ai-chat-header">
      <div><p className="zeno-eyebrow"><Icon name="sparkle" size={14} /> CONVERSA CENTRALIZADA</p><h1>Chat IA</h1><p>Continue aqui as conversas iniciadas nas ferramentas do Conecta Vagas, com o contexto da página de origem.</p></div>
      <button type="button" className="ai-chat-new" onClick={startNewConversation}><Icon name="plus" size={15} /> Nova conversa</button>
    </header>

    <div className="ai-chat-grid">
      <aside className="ai-chat-context" aria-label="Contexto da conversa">
        <div className="ai-chat-context-copy"><p className="ai-chat-overline">CONTEXTO ATUAL</p><span className="ai-chat-origin"><Icon name={source === 'interview' ? 'briefcase' : source === 'orientation' ? 'compass' : 'message'} size={16} /> {sourceLabel}</span><h2>{source === 'interview' ? 'Prática de entrevista' : source === 'orientation' ? 'Orientação de carreira' : 'Conversa geral'}</h2><p>{context}</p></div>
        <div className="ai-chat-context-links">
          <button type="button" onClick={() => go('/orientacao')}><Icon name="compass" size={15} /> Ir para Orientação</button>
          <button type="button" onClick={() => go('/entrevistas')}><Icon name="briefcase" size={15} /> Ir para Entrevistas</button>
        </div>
        <small><Icon name="clock" size={13} /> O histórico fica salvo por 7 dias após a última atividade.</small>
      </aside>

      <nav className="ai-chat-history" aria-label="Histórico de conversas">
        <div className="ai-chat-history-heading"><div><p className="ai-chat-overline">HISTÓRICO</p><h2>Conversas recentes</h2></div><span>7 dias</span></div>
        {historyLoading && <p className="ai-chat-history-status" role="status">Carregando conversas…</p>}
        {historyError && <p className="ai-chat-history-error" role="alert">{historyError}</p>}
        {!historyLoading && history.length === 0 && <div className="ai-chat-history-empty"><Icon name="message" size={20} /><p>Suas conversas aparecerão aqui.</p></div>}
        <div className="ai-chat-history-list">{history.map(item => <div key={item.id} className={`ai-chat-history-item${item.id === conversationId ? ' is-active' : ''}`}>
          <button type="button" className="ai-chat-history-open" aria-current={item.id === conversationId ? 'page' : undefined} onClick={() => { void openConversation(item.id); }}>
            <strong>{item.title}</strong><span>{item.sourceLabel}</span><small>{historyDate(item.updatedAt)} · {item.messageCount} {item.messageCount === 1 ? 'mensagem' : 'mensagens'}</small>
          </button>
          <button type="button" className="ai-chat-history-delete" aria-label={`Excluir conversa: ${item.title}`} title="Excluir conversa" onClick={() => { void deleteConversation(item.id); }}><Icon name="trash" size={14} /></button>
        </div>)}</div>
        <p className="ai-chat-history-note"><Icon name="lock" size={12} /> Somente você pode acessar. A exclusão é automática após 7 dias.</p>
      </nav>

      <section className="ai-chat-panel" aria-labelledby="ai-chat-conversation-title">
        <header><div><span className="ai-chat-avatar"><Icon name="sparkle" size={18} /></span><div><h2 id="ai-chat-conversation-title">Assistente Conecta Vagas</h2><p>{busy ? 'Preparando uma resposta…' : 'Pronto para ajudar no seu próximo passo'}</p></div></div>{busy && source === 'interview' && <button type="button" className="ai-chat-stop" onClick={() => abortRef.current?.abort()}>Parar resposta</button>}</header>

        <div className="ai-chat-messages" ref={viewportRef} role="log" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && <div className="ai-chat-empty"><span><Icon name="message" size={25} /></span><h3>Comece uma conversa</h3><p>Escreva uma dúvida ou inicie pela página de Orientação ou Entrevistas. O assunto da página acompanha você até aqui.</p></div>}
          {messages.map(message => <article key={message.id} className={`ai-chat-message ai-chat-message-${message.role}`}>
            <span>{message.role === 'user' ? 'Você' : message.local ? 'Assistente · local' : 'Assistente · IA'}</span>
            <div>{message.content ? message.content.split('\n').map((line, index) => <p key={index}>{line || '\u00a0'}</p>) : <span className="ai-chat-typing" role="status" aria-label="Assistente está digitando"><i /><i /><i /></span>}{message.pending && message.content && <b className="ai-chat-cursor" aria-hidden="true">|</b>}</div>
          </article>)}
        </div>

        {error && <p className="ai-chat-error" role="alert">{error}</p>}
        <div className="ai-chat-composer-area">
          {canUseAi ? <label className="ai-chat-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) abortRef.current?.abort(); }} /><span>Autorizo enviar as mensagens e o contexto desta conversa ao provedor de IA. <a href="/privacidade">Aviso de privacidade</a>.</span></label> : <p className="ai-chat-access">Você pode usar respostas locais. Para conversar com IA, <a href="/verificar-email">confirme seu e-mail</a>.</p>}
          <form className="ai-chat-composer" onSubmit={submit}>
            <textarea id="ai-chat-input" aria-label="Mensagem para o assistente" rows={2} maxLength={1800} value={input} disabled={busy} onChange={event => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Escreva sua mensagem para o assistente…" />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Enviar mensagem"><Icon name="arrow" size={18} /></button>
          </form>
          <div className="ai-chat-composer-meta"><span>{input.length}/1800 · Enter envia, Shift+Enter quebra a linha</span><span>{consent && canUseAi ? 'Envio com IA autorizado' : 'Resposta local, sem envio ao provedor'}</span></div>
        </div>
      </section>
    </div>
  </main>;
}
