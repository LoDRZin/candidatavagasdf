import { useEffect, useMemo, useState } from 'react';
import './interviews.css';
import { makeLocalInterviewFeedback } from '../lib/ai';
import { RequireUser, useAuth } from './Auth';
import type { CareerStory } from './CareerStories';
import { api, go, message } from './api';

type Application = { id: string; company: string; role: string; description_text: string; status: string };
type ChecklistItem = { id: string; title: string; done: boolean };
type Difficulty = 'nervousness' | 'examples' | 'clarity' | 'company' | 'questions' | 'technical';
type InterviewSession = {
  id: string; application_id: string; title: string; scheduled_at: string | null;
  format: 'unspecified' | 'onsite' | 'video' | 'phone'; location_or_link: string;
  company_questions: string[]; checklist: ChecklistItem[]; reflection_text: string;
  difficulties: Difficulty[]; revision: number; created_at: string; updated_at: string;
};
type InterviewQuestion = {
  id: string; session_id: string; question_text: string; answer_text: string; story_id: string | null;
  practiced: boolean; feedback_text: string; feedback_source: 'none' | 'local' | 'ai'; revision: number;
  created_at: string; updated_at: string;
};

const defaultChecklist: ChecklistItem[] = [
  { id: 'time', title: 'Confirmar dia e horário', done: false },
  { id: 'place', title: 'Confirmar local ou link da conversa', done: false },
  { id: 'route', title: 'Testar trajeto, câmera, áudio ou conexão', done: false },
  { id: 'materials', title: 'Separar currículo e documentos solicitados', done: false },
  { id: 'company', title: 'Revisar a vaga e os canais oficiais da empresa', done: false },
  { id: 'questions', title: 'Preparar perguntas para fazer à empresa', done: false },
];

const difficultyOptions: Array<{ value: Difficulty; label: string }> = [
  { value: 'nervousness', label: 'Nervosismo ou ritmo da fala' },
  { value: 'examples', label: 'Encontrar exemplos reais' },
  { value: 'clarity', label: 'Organizar respostas com clareza' },
  { value: 'company', label: 'Entender a empresa ou a vaga' },
  { value: 'questions', label: 'Saber o que perguntar' },
  { value: 'technical', label: 'Conhecimento técnico da função' },
];

function inputDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function suggestedQuestions(application: Application) {
  const questions = [
    `Conte um pouco sobre sua trajetória e seu interesse pela função de ${application.role}.`,
    'Fale sobre uma situação em que precisou aprender algo novo.',
    'Conte um exemplo de como você organizou tarefas ou prioridades.',
    'Como você reage quando encontra uma dificuldade que ainda não sabe resolver?',
  ];
  const description = application.description_text.toLocaleLowerCase('pt-BR');
  if (/atend|cliente|público/.test(description)) questions.push('Conte um exemplo de contato com uma pessoa que precisava de ajuda.');
  if (/equipe|colabora|time/.test(description)) questions.push('Fale sobre uma experiência de colaboração com outras pessoas.');
  if (/prazo|meta|resultado/.test(description)) questions.push('Conte como você acompanhou uma tarefa até a conclusão.');
  return questions;
}

export function ApplicationInterviewPage({ applicationId }: { applicationId: string }) {
  return <main className="platform-page interview-page"><RequireUser><InterviewWorkspace applicationId={applicationId} /></RequireUser></main>;
}

function InterviewWorkspace({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [stories, setStories] = useState<CareerStory[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState({ title: 'Preparação de entrevista', scheduled_at: '', format: 'unspecified' as InterviewSession['format'], location_or_link: '' });
  const [aiConsent, setAiConsent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadSession(id: string) {
    const result = await api<{ session: InterviewSession; application: Application; questions: InterviewQuestion[] }>(`/api/interviews/${id}`);
    setSession(result.session); setQuestions(result.questions); setApplication(result.application);
  }

  async function load() {
    const [applicationResult, sessionsResult, storiesResult] = await Promise.all([
      api<{ application: Application }>(`/api/applications/${applicationId}`),
      api<{ sessions: InterviewSession[] }>(`/api/interviews?applicationId=${encodeURIComponent(applicationId)}`),
      api<{ stories: CareerStory[] }>(`/api/applications/${applicationId}/stories`),
    ]);
    setApplication(applicationResult.application); setSessions(sessionsResult.sessions); setStories(storiesResult.stories);
    setCreateDraft(current => ({ ...current, title: `Entrevista — ${applicationResult.application.role}` }));
    if (sessionsResult.sessions[0]) await loadSession(sessionsResult.sessions[0].id);
    else { setSession(null); setQuestions([]); setCreating(true); }
  }

  useEffect(() => {
    if (!user) return;
    let active = true; setLoading(true);
    load().catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, applicationId]);

  async function createSession() {
    if (!application || !createDraft.title.trim()) return;
    setBusy('create'); setError(''); setNotice('');
    try {
      const result = await api<{ session: InterviewSession }>('/api/interviews', {
        application_id: application.id, title: createDraft.title,
        scheduled_at: createDraft.scheduled_at ? new Date(createDraft.scheduled_at).toISOString() : null,
        format: createDraft.format, location_or_link: createDraft.location_or_link,
        company_questions: [], checklist: defaultChecklist, reflection_text: '', difficulties: [],
      }, 'POST');
      setSessions(current => [result.session, ...current]); setCreating(false); await loadSession(result.session.id);
      setNotice('Preparação criada. Comece escolhendo ou escrevendo perguntas.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function saveSession(next = session) {
    if (!next) return;
    setBusy('session'); setError(''); setNotice('');
    try {
      const result = await api<{ session: InterviewSession }>(`/api/interviews/${next.id}`, {
        ...next, scheduled_at: next.scheduled_at || null,
      }, 'PUT');
      setSession(result.session); setSessions(current => current.map(item => item.id === result.session.id ? result.session : item));
      setNotice('Preparação salva.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  function updateSession<K extends keyof InterviewSession>(key: K, value: InterviewSession[K]) {
    setSession(current => current ? { ...current, [key]: value } : current);
  }

  async function addQuestion(text = newQuestion) {
    if (!session || !text.trim()) return;
    const result = await api<{ question: InterviewQuestion }>(`/api/interviews/${session.id}/questions`, {
      question_text: text.trim(), answer_text: '', story_id: null, practiced: false, feedback_text: '', feedback_source: 'none',
    }, 'POST');
    setQuestions(current => [...current, result.question]); setNewQuestion('');
  }

  async function addSuggestions() {
    if (!session || !application) return;
    setBusy('suggestions'); setError('');
    try {
      const existing = new Set(questions.map(item => item.question_text));
      const missing = suggestedQuestions(application).filter(item => !existing.has(item)).slice(0, Math.max(0, 10 - questions.length));
      for (const item of missing) await addQuestion(item);
      setNotice(missing.length ? 'Perguntas sugeridas adicionadas. Adapte-as à sua realidade.' : 'As sugestões já estão nesta preparação.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  function updateQuestion(id: string, patch: Partial<InterviewQuestion>) {
    setQuestions(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  async function persistQuestion(question: InterviewQuestion, patch: Partial<InterviewQuestion> = {}) {
    const draft = { ...question, ...patch };
    const result = await api<{ question: InterviewQuestion }>(`/api/interview-questions/${question.id}`, {
      question_text: draft.question_text, answer_text: draft.answer_text, story_id: draft.story_id,
      practiced: draft.practiced, feedback_text: draft.feedback_text,
      feedback_source: draft.feedback_source, revision: question.revision,
    }, 'PUT');
    updateQuestion(question.id, result.question); return result.question;
  }

  async function saveQuestion(question: InterviewQuestion) {
    setBusy(question.id); setError(''); setNotice('');
    try { await persistQuestion(question); setNotice('Resposta salva.'); }
    catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function localReview(question: InterviewQuestion) {
    if (!question.answer_text.trim()) return;
    setBusy(question.id); setError('');
    try {
      await persistQuestion(question, { feedback_text: makeLocalInterviewFeedback(question.answer_text), feedback_source: 'local' });
      setNotice('Revisão local criada sem usar IA.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function aiReview(question: InterviewQuestion) {
    if (!question.answer_text.trim() || !aiConsent.includes(question.id)) return;
    setBusy(question.id); setError(''); setNotice('');
    try {
      const saved = await persistQuestion(question);
      const result = await api<{ question: InterviewQuestion }>(`/api/interview-questions/${question.id}/feedback`, { consent: true, revision: saved.revision }, 'POST');
      updateQuestion(question.id, result.question); setAiConsent(current => current.filter(id => id !== question.id));
      setNotice('Feedback assistido por IA salvo. Revise antes de usar.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function removeQuestion(question: InterviewQuestion) {
    if (!confirm('Remover esta pergunta e a resposta salva?')) return;
    setBusy(question.id); setError('');
    try { await api(`/api/interview-questions/${question.id}`, undefined, 'DELETE'); setQuestions(current => current.filter(item => item.id !== question.id)); }
    catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  const recommendations = useMemo(() => {
    const values = new Set(session?.difficulties ?? []);
    const rows: Array<{ title: string; text: string; href: string }> = [];
    if (values.has('examples')) rows.push({ title: 'Revisar histórias reais', text: 'Escolha uma situação verdadeira para contexto, ação e resultado.', href: '/historias' });
    if (values.has('nervousness') || values.has('clarity')) rows.push({ title: 'Praticar respostas curtas', text: 'Use o exercício geral para treinar ritmo e clareza.', href: '/entrevistas' });
    if (values.has('company') || values.has('questions')) rows.push({ title: 'Guia de preparação', text: 'Revise a vaga e prepare perguntas respeitosas para a conversa.', href: '/aprender' });
    if (values.has('technical')) rows.push({ title: 'Planejar um estudo possível', text: 'Identifique um conteúdo específico sem fingir domínio.', href: '/cursos' });
    return rows;
  }, [session?.difficulties]);

  if (loading) return <p className="interview-loading" role="status">Preparando seu espaço de entrevista…</p>;
  if (!application) return <p className="error-note">Candidatura não encontrada.</p>;
  if (creating || !session) return <>
    <header className="interview-heading"><div><button type="button" onClick={() => go(`/candidaturas/${application.id}`)}>← Voltar para a candidatura</button><span className="eyebrow">ENTREVISTA LIGADA À VAGA</span><h1>{application.role}</h1><p>{application.company} · prepare-se com fatos reais e no seu ritmo.</p></div></header>
    <section className="platform-card interview-create"><span className="eyebrow">NOVA PREPARAÇÃO</span><h2>Organize esta conversa</h2><p>Você pode começar apenas com um nome. Data, formato e local podem ser completados depois.</p>
      <div className="interview-fields"><label>Nome da etapa<input maxLength={160} value={createDraft.title} onChange={event => setCreateDraft(current => ({ ...current, title: event.target.value }))} /></label><label>Data e hora<input type="datetime-local" value={createDraft.scheduled_at} onChange={event => setCreateDraft(current => ({ ...current, scheduled_at: event.target.value }))} /></label><label>Formato<select value={createDraft.format} onChange={event => setCreateDraft(current => ({ ...current, format: event.target.value as InterviewSession['format'] }))}><option value="unspecified">Ainda não sei</option><option value="onsite">Presencial</option><option value="video">Vídeo</option><option value="phone">Telefone</option></select></label><label>Local ou link<input maxLength={2000} value={createDraft.location_or_link} onChange={event => setCreateDraft(current => ({ ...current, location_or_link: event.target.value }))} /></label></div>
      {error && <p className="error-note" role="alert">{error}</p>}<div className="interview-actions"><button className="button button-primary" disabled={busy !== '' || !createDraft.title.trim()} onClick={() => { void createSession(); }}>{busy === 'create' ? 'Criando…' : 'Começar preparação'}</button>{sessions.length > 0 && <button className="button" onClick={() => setCreating(false)}>Cancelar</button>}</div>
    </section>
  </>;

  return <>
    <header className="interview-heading"><div><button type="button" onClick={() => go(`/candidaturas/${application.id}`)}>← Voltar para a candidatura</button><span className="eyebrow">ENTREVISTA LIGADA À VAGA</span><h1>{application.role}</h1><p>{application.company} · respostas privadas, baseadas na sua trajetória real.</p></div><div className="interview-heading-actions"><select aria-label="Preparação atual" value={session.id} onChange={event => { void loadSession(event.target.value); }}>{sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button className="button" onClick={() => setCreating(true)}>Nova preparação</button></div></header>
    {error && <p className="error-note" role="alert">{error}</p>}{notice && <p className="success-note" role="status">{notice}</p>}

    <section className="interview-layout">
      <article className="platform-card interview-details"><span className="eyebrow">01 · ORGANIZAÇÃO</span><h2>Dados da conversa</h2><div className="interview-fields"><label>Nome<input maxLength={160} value={session.title} onChange={event => updateSession('title', event.target.value)} /></label><label>Data e hora<input type="datetime-local" value={inputDateTime(session.scheduled_at)} onChange={event => updateSession('scheduled_at', event.target.value ? new Date(event.target.value).toISOString() : null)} /></label><label>Formato<select value={session.format} onChange={event => updateSession('format', event.target.value as InterviewSession['format'])}><option value="unspecified">Ainda não sei</option><option value="onsite">Presencial</option><option value="video">Vídeo</option><option value="phone">Telefone</option></select></label><label>Local ou link<input maxLength={2000} value={session.location_or_link} onChange={event => updateSession('location_or_link', event.target.value)} /></label></div><button className="button" disabled={busy !== ''} onClick={() => { void saveSession(); }}>{busy === 'session' ? 'Salvando…' : 'Salvar organização'}</button></article>

      <article className="platform-card interview-checklist"><span className="eyebrow">02 · CHECKLIST</span><h2>Antes da conversa</h2><ul>{session.checklist.map(item => <li key={item.id}><label><input type="checkbox" checked={item.done} onChange={event => updateSession('checklist', session.checklist.map(current => current.id === item.id ? { ...current, done: event.target.checked } : current))} /><span>{item.title}</span></label></li>)}</ul><button className="button" disabled={busy !== ''} onClick={() => { void saveSession(); }}>Salvar checklist</button></article>
    </section>

    <section className="platform-card interview-question-section"><div className="interview-section-heading"><div><span className="eyebrow">03 · PRÁTICA</span><h2>Perguntas e respostas</h2><p>Use histórias vinculadas à vaga para lembrar fatos; nada será inventado.</p></div><button className="button" disabled={busy !== ''} onClick={() => { void addSuggestions(); }}>{busy === 'suggestions' ? 'Adicionando…' : 'Adicionar perguntas sugeridas'}</button></div>
      <div className="interview-add-question"><input maxLength={1000} value={newQuestion} onChange={event => setNewQuestion(event.target.value)} placeholder="Escreva outra pergunta que deseja praticar" /><button className="button" disabled={busy !== '' || !newQuestion.trim()} onClick={() => { void addQuestion(); }}>Adicionar</button></div>
      {questions.length === 0 ? <div className="interview-empty"><h3>Comece com perguntas sugeridas</h3><p>Elas são gerais e podem ser editadas para refletir a vaga e sua realidade.</p></div> : <div className="interview-question-list">{questions.map((question, index) => <article className="interview-question" key={question.id}><div className="interview-question-top"><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`Pergunta ${index + 1}`} maxLength={1000} value={question.question_text} onChange={event => updateQuestion(question.id, { question_text: event.target.value })} /><button type="button" onClick={() => { void removeQuestion(question); }}>Remover</button></div><label>História real de apoio<select value={question.story_id ?? ''} onChange={event => updateQuestion(question.id, { story_id: event.target.value || null })}><option value="">Nenhuma história selecionada</option>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label>{stories.length === 0 && <small>Vincule histórias no espaço de materiais desta vaga para usá-las aqui.</small>}<label>Sua resposta<textarea rows={7} maxLength={12000} value={question.answer_text} onChange={event => updateQuestion(question.id, { answer_text: event.target.value })} placeholder="Contexto, o que você fez e o que aconteceu. Use somente fatos reais." /></label><label className="interview-practiced"><input type="checkbox" checked={question.practiced} onChange={event => updateQuestion(question.id, { practiced: event.target.checked })} /> Marcar como praticada</label><div className="interview-question-actions"><button className="button" disabled={busy !== ''} onClick={() => { void saveQuestion(question); }}>{busy === question.id ? 'Salvando…' : 'Salvar resposta'}</button><button className="button" disabled={busy !== '' || !question.answer_text.trim()} onClick={() => { void localReview(question); }}>Revisar sem IA</button></div><label className="interview-ai-consent"><input type="checkbox" checked={aiConsent.includes(question.id)} onChange={event => setAiConsent(current => event.target.checked ? [...current, question.id] : current.filter(id => id !== question.id))} /> Autorizo enviar somente esta pergunta, resposta e o cargo ao provedor de IA.</label><button className="button interview-ai-button" disabled={busy !== '' || !question.answer_text.trim() || !aiConsent.includes(question.id)} onClick={() => { void aiReview(question); }}>Pedir feedback com IA</button>{question.feedback_text && <div className="interview-saved-feedback"><strong>{question.feedback_source === 'ai' ? 'Feedback assistido por IA' : 'Roteiro de revisão local'}</strong><p>{question.feedback_text}</p><small>Revise a sugestão. A plataforma não garante resultado em processos seletivos.</small></div>}</article>)}</div>}
    </section>

    <section className="interview-layout interview-after"><article className="platform-card"><span className="eyebrow">04 · SUAS PERGUNTAS</span><h2>O que você quer perguntar à empresa?</h2><p>Uma por linha. Exemplos: rotina da função, próximos passos e forma de acompanhamento.</p><textarea rows={7} maxLength={8000} value={session.company_questions.join('\n')} onChange={event => updateSession('company_questions', event.target.value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 30))} /></article><article className="platform-card"><span className="eyebrow">05 · DEPOIS DA ENTREVISTA</span><h2>O que você aprendeu?</h2><textarea rows={6} maxLength={10000} value={session.reflection_text} onChange={event => updateSession('reflection_text', event.target.value)} placeholder="O que ficou claro? O que você faria diferente? Qual é o próximo passo?" /><fieldset><legend>O que foi mais difícil?</legend>{difficultyOptions.map(option => <label key={option.value}><input type="checkbox" checked={session.difficulties.includes(option.value)} onChange={event => updateSession('difficulties', event.target.checked ? [...session.difficulties, option.value] : session.difficulties.filter(item => item !== option.value))} /> {option.label}</label>)}</fieldset></article><div className="interview-after-save"><button className="button button-primary" disabled={busy !== ''} onClick={() => { void saveSession(); }}>Salvar perguntas e aprendizado</button></div></section>

    {recommendations.length > 0 && <section className="interview-recommendations"><span className="eyebrow">PRÓXIMOS PASSOS SUGERIDOS</span><h2>Continue a partir do que você percebeu</h2><div>{recommendations.map(item => <button key={item.title} onClick={() => go(item.href)}><strong>{item.title}</strong><span>{item.text}</span><i>Continuar →</i></button>)}</div></section>}
  </>;
}
