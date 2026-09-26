import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { RequireUser, useAuth } from './Auth';
import { api, ApiError, go, message } from './api';
import { CourseProgress } from './CourseProgress';
import { QuestionFeedback } from './QuestionFeedback';
import { CompletionCelebration } from './CompletionCelebration';
import { ActiveSessionTimer, LessonProgressRing, ReflectionField } from './lesson-interactions';
import type { Attempt, CourseProgressData, Lesson, LessonProgress, Question } from './course-types';
import './Courses.css';
import './courses-interactive.css';

type Answer = string | string[];
type Pending = { answers: Record<string, Answer>; block?: number; attemptId?: string };

function readQueue(key: string, lesson: Lesson, attempt: Attempt): Pending {
  const empty: Pending = { answers: {}, attemptId: attempt.id };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Pending | null;
    if (!value || (value.attemptId && value.attemptId !== attempt.id)) return empty;
    if (Number.isInteger(value.block) && value.block! >= 0 && value.block! <= lesson.blocks.length) empty.block = value.block;
    if (attempt.submitted_at || !value.answers || typeof value.answers !== 'object') return empty;
    for (const q of lesson.questions) {
      const answer = value.answers[q.id];
      if (q.type === 'reflection' && typeof answer === 'string') empty.answers[q.id] = answer.slice(0, 2000);
      else if (q.type !== 'reflection' && Array.isArray(answer) && answer.every(id => q.options.some(option => option.id === id))) empty.answers[q.id] = [...new Set(answer)].slice(0, q.type === 'single_choice' ? 1 : 10);
    }
    return empty;
  } catch { return empty; }
}

export function LessonPage({ id, slug }: { id: string; slug: string }) {
  return <div className="platform-page zeno-workspace-page learning-page learning-player"><RequireUser><LessonPlayerGate id={id} slug={slug} /></RequireUser></div>;
}

function LessonPlayerGate({ id, slug }: { id: string; slug: string }) {
  const { user } = useAuth();
  return <LessonPlayer key={`${user!.id}:${id}`} id={id} slug={slug} />;
}

function LessonPlayer({ id, slug }: { id: string; slug: string }) {
  const { user } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [block, setBlock] = useState(0);
  const [status, setStatus] = useState('Carregando…');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [submittedThisMount, setSubmittedThisMount] = useState(false);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [revealedBlocks, setRevealedBlocks] = useState<ReadonlySet<number>>(() => new Set());
  const current = useRef<{ lesson: Lesson; attempt: Attempt } | null>(null);
  const pending = useRef<Pending>({ answers: {} });
  const inflight = useRef<Promise<void> | null>(null);
  const stopped = useRef(false);
  const conflictRef = useRef(false);
  const needsReload = useRef(false);
  const needsProgressReload = useRef(false);
  const loadSequence = useRef(0);
  const previousComplete = useRef<boolean | null>(null);
  const celebrationShown = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = `conectavagasdf.course.queue.${user!.id}.${id}`;
  const accountHeaders = { 'X-Account-Id': user!.id };

  function hasPending() { return Object.keys(pending.current.answers).length > 0 || pending.current.block !== undefined; }
  function store() {
    try { localStorage.setItem(key, JSON.stringify(pending.current)); }
    catch { setError('O navegador não conseguiu guardar as pendências. Mantenha a aula aberta até aparecer “Salvo na sua conta”.'); }
  }

  async function load(discard = false) {
    const sequence = ++loadSequence.current;
    setError('');
    setConflict(false);
    conflictRef.current = false;
    try {
      const value = await api<Lesson>(`/api/lessons/${id}`, undefined, 'GET', accountHeaders);
      if (stopped.current || sequence !== loadSequence.current) return;
      let a = value.attempt;
      if (!a) {
        let requestId: string;
        try {
          requestId = sessionStorage.getItem(`${key}.request`) || crypto.randomUUID();
          sessionStorage.setItem(`${key}.request`, requestId);
        } catch { requestId = crypto.randomUUID(); }
        a = await api<Attempt>(`/api/lessons/${id}/attempts`, { clientRequestId: requestId }, 'POST', accountHeaders);
      }
      if (stopped.current || sequence !== loadSequence.current) return;
      const saved = Object.fromEntries((a.answers ?? []).map(answer => [answer.question_id, JSON.parse(answer.answer_json) as Answer]));
      const queue = discard ? { answers: {}, attemptId: a.id } : readQueue(key, value, a);
      current.current = { lesson: value, attempt: a };
      needsReload.current = false;
      needsProgressReload.current = false;
      pending.current = queue;
      setLesson(value);
      setAttempt(a);
      setAnswers({ ...saved, ...queue.answers });
      setBlock(Math.min(value.blocks.length - 1, Math.max(value.progress.last_block, queue.block ?? 0)));
      setStatus(hasPending() ? 'Alterações pendentes' : 'Salvo na sua conta');
      store();
      if (previousComplete.current === null) previousComplete.current = value.progress.status === 'completed';
      else {
        const complete = value.progress.status === 'completed';
        if (!previousComplete.current && complete && !celebrationShown.current) {
          celebrationShown.current = true;
          setCelebrationOpen(true);
        }
        previousComplete.current = complete;
      }
    } catch (cause) { if (!stopped.current && sequence === loadSequence.current) { needsReload.current = true; setError(message(cause)); setStatus(current.current ? 'Atualização pendente' : 'Não foi possível abrir a aula'); } }
  }

  async function flush(): Promise<void> {
    clearTimeout(saveTimer.current);
    if (inflight.current) return inflight.current;
    if (stopped.current || conflictRef.current || (!hasPending() && !needsReload.current && !needsProgressReload.current)) return;
    inflight.current = (async () => {
      try {
        setStatus('Salvando…');
        if (needsReload.current) {
          await load();
          if (needsReload.current || stopped.current) return;
        }
        while (!stopped.current && current.current && hasPending()) {
          const c = current.current;
          const entry = Object.entries(pending.current.answers)[0];
          if (entry) {
            const [questionId, answer] = entry;
            const serialized = JSON.stringify(answer);
            const result = await api<{ revision: number }>(`/api/attempts/${c.attempt.id}/answers/${questionId}`, { revision: c.attempt.revision, answer }, 'PUT', accountHeaders);
            c.attempt.revision = result.revision;
            if (JSON.stringify(pending.current.answers[questionId]) === serialized) delete pending.current.answers[questionId];
          } else {
            const lastBlock = pending.current.block!;
            const wasComplete = c.lesson.progress.status === 'completed';
            c.lesson.progress = await api<LessonProgress>(`/api/lessons/${id}/progress`, { revision: c.lesson.progress.revision, lastBlock }, 'PUT', accountHeaders);
            if (pending.current.block === lastBlock) delete pending.current.block;
            if (!wasComplete && c.lesson.progress.status === 'completed') needsProgressReload.current = true;
            if (!wasComplete && c.lesson.progress.status === 'completed' && !celebrationShown.current) {
              celebrationShown.current = true;
              setCelebrationOpen(true);
            }
            if (!stopped.current) setLesson({ ...c.lesson });
          }
          store();
        }
        if (!stopped.current && needsProgressReload.current && current.current) {
          const c = current.current;
          c.lesson.course.progress = await api<CourseProgressData>(`/api/courses/${c.lesson.course.id}/progress?version=${c.lesson.versionId}`, undefined, 'GET', accountHeaders);
          needsProgressReload.current = false;
          setLesson({ ...c.lesson });
        }
        if (!stopped.current) { setStatus('Salvo na sua conta'); setError(''); }
      } catch (cause) {
        if (!stopped.current) {
          setStatus('Alterações pendentes');
          if (cause instanceof ApiError && cause.status === 409) { conflictRef.current = true; setConflict(true); }
          setError(message(cause));
        }
      } finally { inflight.current = null; }
    })();
    return inflight.current;
  }

  useEffect(() => {
    stopped.current = false;
    void load();
    const sync = () => { void flush(); };
    const warn = (event: BeforeUnloadEvent) => { if (hasPending()) { event.preventDefault(); event.returnValue = ''; } };
    const timer = window.setInterval(sync, 8000);
    window.addEventListener('online', sync);
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stopped.current = true;
      loadSequence.current++;
      clearTimeout(saveTimer.current);
      window.clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', sync);
    };
    // LessonPlayer remounts for each account and lesson; mutable queues stay in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user!.id]);

  useEffect(() => {
    const container = document.querySelector('.learning-theory-column');
    if (!container) return;
    const reveal = (indexes: number[]) => {
      setRevealedBlocks(previous => {
        const next = new Set(previous);
        for (const index of indexes) next.add(index);
        return next.size === previous.size ? previous : next;
      });
    };
    const items = [...container.querySelectorAll<HTMLElement>('[data-reading-block]')];
    if (!('IntersectionObserver' in window)) {
      reveal(items.map(item => Number(item.dataset.readingBlock)).filter(Number.isInteger));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      const intersecting = entries.filter(entry => entry.isIntersecting);
      reveal(intersecting.map(entry => Number((entry.target as HTMLElement).dataset.readingBlock)).filter(Number.isInteger));
      const visible = intersecting.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const index = Number((visible?.target as HTMLElement | undefined)?.dataset.readingBlock);
      if (Number.isInteger(index)) setBlock(index);
    }, { threshold: [0.15, 0.4, 0.7] });
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [lesson?.blocks.length]);

  function answer(questionId: string, value: Answer) {
    setAnswers(previous => ({ ...previous, [questionId]: value }));
    pending.current.answers[questionId] = value;
    store();
    setError('');
    setStatus('Salvando…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 450);
  }

  function completeBlock(index: number) {
    if (!lesson) return;
    pending.current.block = Math.min(lesson.blocks.length, Math.max(pending.current.block ?? lesson.progress.last_block, index + 1));
    const nextIndex = Math.min(index + 1, lesson.blocks.length - 1);
    setBlock(nextIndex);
    store();
    void flush();
    requestAnimationFrame(() => {
      const target = index < lesson.blocks.length - 1
        ? document.querySelector<HTMLElement>(`[data-reading-block="${index + 1}"] h2`)
        : document.querySelector<HTMLElement>('#learning-quiz-title');
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  }

  async function navigate(path: string) {
    setBusy(true);
    try {
      await flush();
      if (hasPending() || conflictRef.current) throw new Error('Há alterações pendentes. Sincronize antes de sair desta aula.');
      go(path);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await flush();
      if (hasPending() || conflictRef.current) throw new Error('Sincronize suas alterações antes de conferir as respostas.');
      const c = current.current!;
      c.attempt = await api<Attempt>(`/api/attempts/${c.attempt.id}/submit`, { revision: c.attempt.revision }, 'POST', accountHeaders);
      setSubmittedThisMount(true);
      setAttempt(c.attempt);
      needsReload.current = true;
      await load(true);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function retry() {
    setBusy(true);
    setError('');
    try {
      await flush();
      if (hasPending() || conflictRef.current) throw new Error('Sincronize antes de começar outra tentativa.');
      const requestId = crypto.randomUUID();
      try { sessionStorage.setItem(`${key}.request`, requestId); } catch { /* The server still validates the unique request ID. */ }
      await api<Attempt>(`/api/lessons/${id}/attempts`, { clientRequestId: requestId }, 'POST', accountHeaders);
      pending.current = { answers: {} };
      setSubmittedThisMount(false);
      store();
      await load(true);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  if (!lesson) return <section className="learning-panel"><p role="status">{status}</p>{error && <><p role="alert">{error}</p><button className="button" onClick={() => { void load(); }}>Tentar novamente</button></>}</section>;
  const readBlocks = Math.max(lesson.progress.last_block, pending.current.block ?? 0);
  const readComplete = readBlocks >= lesson.blocks.length;
  const qs = attempt?.questions ?? lesson.questions;
  const answeredCount = qs.filter(q => { const value = answers[q.id]; return typeof value === 'string' ? value.trim().length : Array.isArray(value) && value.length; }).length;
  const courseProgress = lesson.course.progress;
  const lessonComplete = lesson.progress.status === 'completed';
  const readingPercent = Math.round((Math.min(readBlocks, lesson.blocks.length) / Math.max(lesson.blocks.length, 1)) * 100);
  const objectiveQuestions = qs.filter(q => q.type !== 'reflection').length;
  const correctQuestions = attempt?.statistics?.correctQuestions ?? 0;
  const reflectionsWritten = attempt?.statistics?.reflectionsWritten ?? qs.filter(q => q.type === 'reflection' && typeof answers[q.id] === 'string' && (answers[q.id] as string).trim()).length;
  const coursePath = `/cursos/${slug}?version=${lesson.versionId}`;

  return <>
    <div className="learning-player-top"><button className="learning-back" disabled={busy} onClick={() => { void navigate(coursePath); }}><Icon name="back" size={14} /> {lesson.course.title}</button><span className="learning-save-status" role="status"><Icon name={status === 'Salvo na sua conta' ? 'check' : 'clock'} size={14} />{status}</span></div>
    <header className="zeno-workspace-header learning-immersive-header ci-player-heading"><div><p className="zeno-eyebrow">AULA {courseProgress.lessons.findIndex(item => item.id === id) + 1} DE {courseProgress.totalLessons}</p><h1>{lesson.title}</h1><p>Leia no seu ritmo e pratique com situações do dia a dia.</p></div><div className="learning-session-meta"><LessonProgressRing value={readingPercent} label="Leitura concluída" /><ActiveSessionTimer onChange={setActiveSeconds} /></div></header>
    <div className="learning-panel learning-course-progress"><CourseProgress progress={courseProgress} /></div>
    {courseProgress.completed && <section className="learning-celebration" aria-labelledby="learning-done-title"><span><Icon name="cap" size={30} /></span><div><h2 id="learning-done-title">Curso concluído!</h2><p>Você concluiu todas as aulas e atividades. Escolha uma ideia para colocar em prática na sua carreira.</p></div><button className="button button-primary" disabled={busy} onClick={() => { void navigate('/cursos'); }}>Explorar outros cursos<Icon name="arrow" size={16} /></button></section>}
    {error && <div className="learning-error" role="alert"><p>{error}</p>{!conflict && <button className="button" onClick={() => { setError(''); void flush(); }}>Sincronizar agora</button>}</div>}
    {conflict && <section className="learning-panel"><h2>O progresso mudou em outra aba</h2><p>Suas alterações continuam neste dispositivo. Recarregar usa as respostas salvas na sua conta.</p><button className="button" onClick={() => { if (confirm('Descartar as pendências desta aula e carregar as respostas da conta?')) void load(true); }}>Recarregar respostas salvas</button></section>}
    <div className="learning-player-layout learning-immersive-layout ci-player-columns">
      <section className="learning-theory-column ci-theory" aria-label="Leitura da aula">
        {lesson.blocks.map((item, index) => <article className="learning-panel learning-reading learning-theory-block ci-block" key={`${index}-${item.title}`} data-reading-block={index} data-active={index === block ? 'true' : undefined} data-visible={revealedBlocks.has(index) ? 'true' : undefined}>
          <span className="course-badge">PASSO {index + 1} DE {lesson.blocks.length}</span>
          <h2 tabIndex={-1}>{item.title}</h2>
          {item.text.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          <div className="learning-reading-actions ci-block-actions"><button className="button button-primary" disabled={index !== readBlocks || conflict || busy} onClick={() => completeBlock(index)}>{index < readBlocks ? <><Icon name="check" size={16} /> Passo concluído</> : index === lesson.blocks.length - 1 ? 'Concluir leitura' : 'Concluir este passo'}{index >= readBlocks && <Icon name="arrow" size={16} />}</button></div>
        </article>)}
      </section>
      <section className="learning-panel learning-quiz learning-practice-column ci-practice" aria-labelledby="learning-quiz-title">
        <span className="zeno-eyebrow">AGORA É COM VOCÊ</span><h2 id="learning-quiz-title" tabIndex={-1}>Pratique o que aprendeu</h2>
        <p>{lesson.passScore === null ? 'Responda às atividades para concluir.' : `Acerte pelo menos ${lesson.passScore}% das questões objetivas. Sua reflexão não recebe nota.`}</p>
        <span className="learning-answered">{answeredCount} de {qs.length} atividades respondidas</span>
        {qs.map((q, index) => <QuestionField key={q.id} question={q} index={index} value={answers[q.id]} submitted={Boolean(attempt?.submitted_at)} animateFeedback={submittedThisMount} disabled={Boolean(attempt?.submitted_at) || conflict || busy} status={status} pending={Object.prototype.hasOwnProperty.call(pending.current.answers, q.id)} online={navigator.onLine} onSaveReflection={async value => { answer(q.id, value); await flush(); }} onAnswer={value => answer(q.id, value)} />)}
        {attempt?.submitted_at ? <div className={`learning-quiz-result${attempt.passed ? ' is-passed' : ''}`} role="status"><h3>{attempt.passed ? lessonComplete ? 'Aula concluída!' : 'Atividades concluídas!' : 'Você pode tentar de novo'}</h3><p>{attempt.score === null ? 'Sua reflexão foi registrada.' : `Sua nota: ${attempt.score}%.`}{!attempt.passed && ' Confira as explicações e pratique mais uma vez.'}{Boolean(attempt.passed) && !lessonComplete && ' Termine a leitura dos passos para concluir esta aula.'}</p>
          {!attempt.passed && <button className="button button-primary" disabled={busy || conflict} onClick={() => { void retry(); }}>Tentar novamente</button>}
          {Boolean(attempt.passed) && !readComplete && <button className="button button-primary" onClick={() => { document.querySelector(`[data-reading-block="${Math.min(lesson.progress.last_block, lesson.blocks.length - 1)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Continuar leitura</button>}
        </div> : <div className="learning-submit"><p>{!readComplete ? 'Você ainda tem passos para ler. Pode responder agora e terminar a leitura depois.' : 'Ao conferir, você recebe explicações e pode refazer a atividade se precisar.'}</p><button className="button button-primary" disabled={busy || conflict || answeredCount < qs.length} onClick={() => { void submit(); }}>{busy ? 'Conferindo…' : 'Conferir respostas'}<Icon name="check" size={16} /></button></div>}
      </section>
    </div>
    <CompletionCelebration open={celebrationOpen} lessonTitle={lesson.title} statistics={{ activeSeconds, correctQuestions, objectiveQuestions, reflectionsWritten }} nextLabel={lesson.nextLessonId ? 'Próxima aula' : undefined} busy={busy} error={error || undefined} onNext={lesson.nextLessonId ? () => { void navigate(`/cursos/${slug}/aulas/${lesson.nextLessonId}`); } : undefined} onBack={() => { void navigate(coursePath); }} onClose={() => setCelebrationOpen(false)} />
    {lessonComplete && !celebrationOpen && <footer className="learning-next"><div><strong><Icon name="check" size={17} /> Aula concluída</strong><p>{lesson.nextLessonId ? courseProgress.lessons.find(item => item.id === lesson.nextLessonId)?.title : 'Todas as leituras e atividades desta aula estão salvas.'}</p></div>{lesson.nextLessonId ? <button className="button button-primary" disabled={busy} onClick={() => { void navigate(`/cursos/${slug}/aulas/${lesson.nextLessonId}`); }}>Próxima aula<Icon name="arrow" size={16} /></button> : !courseProgress.completed && <button className="button button-primary" disabled={busy} onClick={() => { void navigate(coursePath); }}>Ver aulas pendentes</button>}</footer>}
  </>;
}

function QuestionField({ question: q, index, value, submitted, animateFeedback, disabled, status, pending, online, onSaveReflection, onAnswer }: { question: Question; index: number; value?: Answer; submitted: boolean; animateFeedback: boolean; disabled: boolean; status: string; pending: boolean; online: boolean; onSaveReflection: (value: string) => Promise<void>; onAnswer: (value: Answer) => void }) {
  const chosen = Array.isArray(value) ? value : [];
  const verdictClass = submitted && q.feedback ? q.feedback.verdict === 'incorrect' ? ' is-incorrect' : ' is-correct' : '';
  return <fieldset className={`learning-question ci-question${verdictClass}`} disabled={disabled}><legend><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{q.prompt}</legend>
    {q.type === 'reflection' ? <ReflectionField id={q.id} value={typeof value === 'string' ? value : ''} pending={pending} online={online} status={status} disabled={disabled} onSave={onSaveReflection} /> : <><small className="learning-choice-help">{q.type === 'multiple_choice' ? 'Selecione todas as alternativas adequadas.' : 'Escolha uma alternativa.'}</small>{q.options.map(option => <label className={`learning-option${chosen.includes(option.id) ? ' is-selected' : ''}`} key={option.id}><input type={q.type === 'single_choice' ? 'radio' : 'checkbox'} name={q.id} checked={chosen.includes(option.id)} onChange={event => onAnswer(q.type === 'single_choice' ? [option.id] : event.target.checked ? [...chosen, option.id] : chosen.filter(id => id !== option.id))} /><span>{option.label}</span></label>)}</>}
    {submitted && q.feedback && <QuestionFeedback feedback={q.feedback} animate={animateFeedback} />}
  </fieldset>;
}
