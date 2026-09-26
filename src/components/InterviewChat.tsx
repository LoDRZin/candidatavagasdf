import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { makeLocalInterviewFeedback } from '../lib/ai';
import { readSse } from '../../shared/sse';
import './InterviewChat.css';

type Message = { role: 'user' | 'assistant'; content: string; local?: boolean };

type Props = {
  question: string;
  draft: string;
  canUseAi: boolean;
  accessHref: string;
  onDraftSent: () => void;
  onHandoff?: (message: string) => void;
};

function welcome(question: string): Message {
  return { role: 'assistant', content: `Olá! Vamos praticar: “${question}” Escreva sua resposta e eu darei um feedback construtivo.`, local: true };
}

export default function InterviewChat({ question, draft, canUseAi, accessHref, onDraftSent, onHandoff }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => [welcome(question)]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const messagesRef = useRef(messages);
  const streamingRef = useRef(false);
  const abortController = useRef<AbortController | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollTimer = useRef<number | null>(null);

  useEffect(() => () => { abortController.current?.abort(); }, []);
  useEffect(() => {
    if (scrollTimer.current !== null) return;
    scrollTimer.current = window.setTimeout(() => {
      if (viewportRef.current) viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      scrollTimer.current = null;
    }, 50);
  }, [messages, isStreaming]);
  useEffect(() => () => { if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current); }, []);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 128)}px`;
  }, [input]);

  function replaceMessages(next: Message[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  function appendAssistantToken(token: string) {
    const next = [...messagesRef.current];
    const last = next.at(-1);
    if (!last || last.role !== 'assistant') return;
    next[next.length - 1] = { ...last, content: last.content + token };
    replaceMessages(next);
  }

  function removeEmptyAssistant() {
    const last = messagesRef.current.at(-1);
    if (last?.role === 'assistant' && !last.content) replaceMessages(messagesRef.current.slice(0, -1));
  }

  function addLocalReview(value: string) {
    const text = value.trim();
    if (!text || streamingRef.current) return;
    replaceMessages([...messagesRef.current,
      { role: 'user', content: text, local: true },
      { role: 'assistant', content: makeLocalInterviewFeedback(text), local: true },
    ]);
    setError('');
  }

  async function startStream(value: string): Promise<boolean> {
    const text = value.trim();
    if (!text || text.length > 1800 || streamingRef.current) return false;

    const prior = messagesRef.current.filter(message => !message.local && message.content.trim());
    const history: Array<Pick<Message, 'role' | 'content'>> = [{ role: 'user', content: text }];
    let payloadLength = question.length + text.length;
    for (const message of prior.slice().reverse()) {
      if (history.length >= 12 || payloadLength + message.content.length > 8_500) break;
      history.unshift({ role: message.role, content: message.content });
      payloadLength += message.content.length;
    }

    replaceMessages([...messagesRef.current, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    streamingRef.current = true;
    setIsStreaming(true);
    setError('');
    const controller = new AbortController();
    abortController.current = controller;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, question, messages: history, consent: true }),
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
          if (token) appendAssistantToken(token);
        } else if (event.event === 'error') {
          const payload = JSON.parse(event.data) as { message?: string };
          throw new Error(payload.message ?? 'A conexão com a IA foi interrompida.');
        } else if (event.event === 'done') {
          completed = true;
          break;
        }
      }
      if (!completed) throw new Error('O feedback terminou antes de ser concluído.');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'A IA não respondeu. Tente novamente.');
      removeEmptyAssistant();
    } finally {
      streamingRef.current = false;
      if (abortController.current === controller) abortController.current = null;
      setIsStreaming(false);
    }
    return true;
  }

  function handleSend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canUseAi || !consent || !input.trim() || isStreaming) return;
    const value = input;
    setInput('');
    if (onHandoff) { onHandoff(value.trim()); return; }
    void startStream(value);
  }

  function sendDraft() {
    if (!canUseAi || !consent) return;
    if (onHandoff) { onDraftSent(); onHandoff(draft.trim()); return; }
    void startStream(draft).then(started => { if (started) onDraftSent(); });
  }

  function stop() { abortController.current?.abort(); }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  }

  return <section className="interview-chat" aria-label="Conversa de feedback sobre entrevista">
    <div className="interview-chat-heading"><span className="interview-chat-mark" aria-hidden="true"><Icon name="sparkle" size={17} /></span><div><strong>Feedback assistido por IA</strong><small>Uma conversa para aprimorar sua resposta</small></div></div>
    <div className="interview-chat-messages" ref={viewportRef} role="log" aria-live="polite" aria-relevant="additions text" aria-busy={isStreaming}>
      {messages.map((message, index) => <div key={index} className={`interview-chat-message interview-chat-message-${message.role}`}>
        {message.role === 'assistant' && <span className="interview-chat-avatar" aria-hidden="true"><Icon name="sparkle" size={15} /></span>}
        <div className="interview-chat-bubble">{message.content || (isStreaming ? <span className="interview-chat-typing" aria-label="A IA está digitando"><i /><i /><i /></span> : null)}{isStreaming && index === messages.length - 1 && message.content && <span className="interview-chat-cursor" aria-hidden="true">|</span>}</div>
      </div>)}
    </div>
    {error && <p className="interview-chat-error" role="alert">{error}</p>}
    {canUseAi ? <label className="interview-chat-consent"><input type="checkbox" checked={consent} disabled={isStreaming} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) stop(); }} /><span>Autorizo enviar as mensagens desta conversa e a pergunta selecionada ao provedor de IA. <a href="/privacidade">Aviso de privacidade</a>.</span></label> : <p className="ai-access-note">O chat com IA fica disponível após entrar e confirmar seu e-mail. <a href={accessHref}>{accessHref.startsWith('/verificar') ? 'Confirmar e-mail' : 'Entrar ou criar conta'}</a>.</p>}
    <div className="interview-chat-draft-actions">
      <button type="button" className="button button-small interview-chat-local" disabled={!draft.trim() || isStreaming} onClick={() => { addLocalReview(draft); }}>Revisar rascunho sem IA</button>
      <button type="button" className="button button-small button-primary" disabled={!draft.trim() || draft.trim().length > 1800 || !canUseAi || !consent || isStreaming} onClick={sendDraft}>Pedir feedback do rascunho</button>
    </div>
    <form className="interview-chat-composer" onSubmit={handleSend}>
      <textarea ref={inputRef} value={input} maxLength={1800} rows={1} disabled={!canUseAi || isStreaming} onChange={event => setInput(event.target.value)} onKeyDown={onInputKeyDown} aria-label="Mensagem para o mentor de entrevistas" placeholder={canUseAi ? 'Ou escreva uma mensagem aqui…' : 'Entre e confirme seu e-mail para conversar'} />
      {isStreaming ? <button type="button" className="interview-chat-stop" onClick={stop} aria-label="Parar geração" title="Parar geração">■</button> : <button type="submit" className="interview-chat-send" disabled={!input.trim() || !canUseAi || !consent} aria-label="Enviar mensagem" title="Enviar mensagem">→</button>}
    </form>
    <p className="interview-chat-hint">Enter envia · Shift+Enter quebra a linha · A IA pode errar; revise as sugestões.</p>
  </section>;
}
