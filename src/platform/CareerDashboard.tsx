import { useEffect, useState } from 'react';
import './career.css';
import { useAuth } from './Auth';
import { api, apiCollection, message } from './api';
import { ReminderCenter } from './ReminderCenter';
import { type CareerProfile, type JobApplication, type ProfileResult, currentWeekKey, asProfile, localDate, profileProgress, LinkButton } from './career-model';

export function CareerDashboardSummary() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [resumeCount, setResumeCount] = useState(0);
  const [storyCount, setStoryCount] = useState(0);
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [planFeedback, setPlanFeedback] = useState<number | null>(null);
  const [planFeedbackError, setPlanFeedbackError] = useState('');
  const [loading, setLoading] = useState(() => Boolean(user?.email_verified_at));
  const [error, setError] = useState('');
  const planStorageKey = user ? `conectavagasdf.weekly-plan.${user.id}.${currentWeekKey()}` : '';

  useEffect(() => {
    if (!user?.email_verified_at) return;
    let active = true;
    setLoading(true);
    Promise.all([
      api<ProfileResult>('/api/me/career-profile'),
      apiCollection<JobApplication>('/api/applications', 'applications'),
      api<{ resumes: unknown[] }>('/api/resumes'),
      api<{ stories: unknown[] }>('/api/career-stories'),
    ]).then(([profileResult, applicationsResult, resumeResult, storyResult]) => {
      if (!active) return;
      setProfile(asProfile(profileResult)); setApplications(applicationsResult);
      setResumeCount(resumeResult.resumes.length); setStoryCount(storyResult.stories.length);
    }).catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, user?.email_verified_at]);

  useEffect(() => {
    if (!planStorageKey) { setCompletedActions([]); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(planStorageKey) ?? '[]');
      setCompletedActions(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []);
    } catch { setCompletedActions([]); }
  }, [planStorageKey]);

  useEffect(() => {
    if (!planStorageKey) { setPlanFeedback(null); return; }
    const saved = Number(localStorage.getItem(`${planStorageKey}.feedback`));
    setPlanFeedback(saved >= 1 && saved <= 5 ? saved : null);
    setPlanFeedbackError('');
  }, [planStorageKey]);

  function toggleWeeklyAction(actionId: string) {
    setCompletedActions(current => {
      const next = current.includes(actionId) ? current.filter(item => item !== actionId) : [...current, actionId];
      if (planStorageKey) localStorage.setItem(planStorageKey, JSON.stringify(next));
      return next;
    });
  }

  async function sendPlanFeedback(rating: number) {
    setPlanFeedbackError('');
    try {
      await api('/api/feedback', { context_type: 'weekly_plan', rating }, 'POST');
      setPlanFeedback(rating);
      if (planStorageKey) localStorage.setItem(`${planStorageKey}.feedback`, String(rating));
    } catch (reason) { setPlanFeedbackError(message(reason)); }
  }

  if (authLoading) return <section className="career-dashboard dashboard-data-skeleton" role="status" aria-label="Carregando sua jornada"><div className="route-skeleton-line" /><div className="route-skeleton-line" /><div className="route-skeleton-line" /></section>;
  if (!user) return <section className="career-dashboard career-dashboard-visitor"><div><span className="eyebrow">SUA JORNADA</span><h2>Guarde seus próximos passos</h2><p>Crie uma conta para salvar seu objetivo e acompanhar candidaturas em qualquer dispositivo.</p></div><LinkButton href="/cadastro?returnTo=%2Fdashboard" className="button button-primary">Criar conta gratuita</LinkButton></section>;
  if (!user.email_verified_at) return <section className="career-dashboard"><div><span className="eyebrow">FALTA UM PASSO</span><h2>Confirme seu e-mail</h2><p>Depois da confirmação, você poderá salvar objetivos e candidaturas.</p></div><LinkButton href="/verificar-email" className="button">Confirmar e-mail</LinkButton></section>;
  if (loading) return <section className="career-dashboard dashboard-data-skeleton" role="status" aria-label="Carregando dados do painel"><div className="route-skeleton-line" /><div className="route-skeleton-line" /><div className="route-skeleton-line" /></section>;
  if (error) return <section className="career-dashboard"><p className="error-note" role="alert">{error}</p><LinkButton href="/candidaturas">Abrir candidaturas</LinkButton></section>;

  const active = applications.filter(item => !['hired', 'rejected', 'withdrawn'].includes(item.status));
  const upcoming = [...active].filter(item => item.next_action_at).sort((a, b) => new Date(a.next_action_at).getTime() - new Date(b.next_action_at).getTime())[0];
  const progress = profile ? profileProgress(profile) : 0;
  const next = progress < 67 ? { title: 'Defina o que você procura', text: 'Um objetivo simples ajuda a escolher vagas e materiais relevantes.', href: '/perfil-profissional', action: 'Completar objetivo' }
    : applications.length === 0 ? { title: 'Registre sua primeira oportunidade', text: 'Pode ser uma vaga que você ainda está avaliando.', href: '/candidaturas/nova', action: 'Adicionar candidatura' }
    : upcoming ? { title: `Retome: ${upcoming.role}`, text: `${upcoming.company} · ${localDate(upcoming.next_action_at, true)}`, href: `/candidaturas/${upcoming.id}`, action: 'Abrir próximo passo' }
    : { title: 'Revise suas candidaturas', text: 'Escolha uma oportunidade e defina quando olhar para ela novamente.', href: '/candidaturas', action: 'Ver candidaturas' };
  const weeklyCandidates = [
    progress < 67 ? { id: 'profile', title: 'Deixar seu objetivo mais claro', detail: 'Complete função desejada, formato de trabalho e principal desafio.', href: '/perfil-profissional', action: 'Editar objetivo' } : null,
    resumeCount === 0 ? { id: 'resume', title: 'Criar um currículo-base', detail: 'Comece manualmente; você poderá adaptar uma cópia para cada vaga.', href: '/editor', action: 'Criar currículo' } : null,
    storyCount === 0 ? { id: 'story', title: 'Guardar uma história real', detail: 'Vale trabalho informal, projeto, estudo, cuidado ou voluntariado.', href: '/historias', action: 'Adicionar história' } : null,
    applications.length === 0 ? { id: 'application', title: 'Registrar uma oportunidade', detail: 'Guarde uma vaga de interesse mesmo antes de se candidatar.', href: '/candidaturas/nova', action: 'Adicionar vaga' } : null,
    upcoming ? { id: `follow-up-${upcoming.id}`, title: `Retomar ${upcoming.company}`, detail: upcoming.next_action_at ? `Próxima ação prevista para ${localDate(upcoming.next_action_at, true)}.` : 'Revise o próximo contato dessa candidatura.', href: `/candidaturas/${upcoming.id}`, action: 'Abrir candidatura' } : null,
    applications.some(item => item.status === 'interview') ? { id: 'interview', title: 'Praticar para a entrevista', detail: 'Prepare exemplos reais e perguntas antes da conversa.', href: '/entrevistas', action: 'Praticar' } : null,
    { id: 'learn', title: 'Aprender uma ação prática', detail: 'Escolha um guia curto para melhorar sua busca nesta semana.', href: '/aprender', action: 'Ver guias' },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const weeklyActions = weeklyCandidates.slice(0, 3);
  return <section className="career-dashboard" aria-labelledby="career-next-title">
    <div className="career-dashboard-main"><span className="eyebrow">SEU PRÓXIMO PASSO</span><h2 id="career-next-title">{next.title}</h2><p>{next.text}</p><LinkButton href={next.href} className="button button-primary">{next.action}</LinkButton></div>
    <div className="career-dashboard-stats" aria-label="Resumo da busca"><div><strong>{progress}%</strong><span>Objetivo preenchido</span></div><div><strong>{active.length}</strong><span>Processos ativos</span></div><div><strong>{applications.filter(item => item.status === 'interview').length}</strong><span>Entrevistas</span></div></div>
    <ReminderCenter />
    <div className="career-weekly-plan">
      <div className="career-weekly-heading"><div><span className="eyebrow">PLANO DESTA SEMANA</span><h3>Três ações possíveis, no seu ritmo</h3></div><span>O andamento fica salvo neste dispositivo.</span></div>
      <ol>{weeklyActions.map(item => {
        const done = completedActions.includes(item.id);
        return <li className={done ? 'is-done' : ''} key={item.id}><button className="career-weekly-check" type="button" aria-label={done ? `Reabrir: ${item.title}` : `Marcar como feita: ${item.title}`} aria-pressed={done} onClick={() => toggleWeeklyAction(item.id)}>{done ? '✓' : ''}</button><div><strong>{item.title}</strong><span>{item.detail}</span></div><LinkButton href={item.href} className="career-weekly-link">{item.action} →</LinkButton></li>;
      })}</ol>
      <div className="career-plan-feedback">
        {planFeedback ? <span role="status">Obrigado. Sua avaliação foi registrada sem o conteúdo do currículo.</span> : <><span>Este plano deixou o próximo passo mais claro?</span><button type="button" onClick={() => { void sendPlanFeedback(5); }}>Sim</button><button type="button" onClick={() => { void sendPlanFeedback(2); }}>Ainda não</button></>}
        {planFeedbackError && <span className="error-note" role="alert">{planFeedbackError}</span>}
      </div>
    </div>
  </section>;
}
