import { useEffect, useMemo, useState, type FormEvent } from 'react';
import './career.css';
import { RequireUser, useAuth } from './Auth';
import { ApiError, api, apiCollection, go, message } from './api';
import { type CareerProfile, type JobApplication, type ApplicationEvent, type ProfileResult, type ApplicationResult, type ApplicationStatus, type WorkMode, emptyProfile, emptyApplication, journeyOptions, workModeOptions, statusOptions, statusLabel, eventLabel, asProfile, asStringArray, asApplication, localDate, inputDate, inputDateTime, toIsoOrEmpty, profileProgress, LinkButton } from './career-model';


export function CareerProfilePage() {
  return <main className="platform-page career-page">
    <header className="platform-heading career-heading">
      <span className="eyebrow">SEU OBJETIVO</span>
      <h1>Qual trabalho faz sentido para você agora?</h1>
      <p>Conte o que procura para a plataforma organizar seus próximos passos. Você pode mudar estas respostas quando quiser.</p>
    </header>
    <RequireUser><CareerProfileForm /></RequireUser>
  </main>;
}

function CareerProfileForm() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CareerProfile>(emptyProfile);
  const [rolesText, setRolesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    api<ProfileResult>('/api/me/career-profile').then(result => {
      if (!active) return;
      const next = asProfile(result);
      setProfile(next);
      setRolesText(next.target_roles.join(', '));
    }).catch(reason => {
      if (active && (!(reason instanceof ApiError) || reason.status !== 404)) setError(message(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  const progress = profileProgress({ ...profile, target_roles: asStringArray(rolesText) });
  function toggleWorkMode(mode: WorkMode) {
    setProfile(current => ({ ...current, work_modes: current.work_modes.includes(mode) ? current.work_modes.filter(item => item !== mode) : [...current.work_modes, mode] }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...profile, target_roles: asStringArray(rolesText) };
      const result = await api<ProfileResult>('/api/me/career-profile', payload, 'PATCH');
      const saved = result ? asProfile(result) : payload;
      setProfile(saved); setRolesText(saved.target_roles.join(', '));
      setNotice('Objetivo profissional salvo. Agora você pode organizar suas candidaturas.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }

  if (loading) return <section className="platform-card career-loading" role="status">Carregando seu objetivo profissional…</section>;
  return <form className="platform-card career-form" onSubmit={event => { void save(event); }}>
    <div className="career-progress">
      <div><strong>Seu direcionamento</strong><span>{progress}% preenchido</span></div>
      <progress value={progress} max={100} aria-label={`${progress}% do perfil profissional preenchido`} />
    </div>

    <fieldset className="career-choice-group">
      <legend>Em que momento profissional você está?</legend>
      <div className="career-choice-grid">
        {journeyOptions.map(option => <label className="career-choice" key={option.value}>
          <input type="radio" name="journey" required value={option.value} checked={profile.journey_type === option.value} onChange={() => setProfile(current => ({ ...current, journey_type: option.value }))} />
          <span><strong>{option.title}</strong><small>{option.detail}</small></span>
        </label>)}
      </div>
    </fieldset>

    <div className="career-field-grid">
      <label>Quais cargos ou áreas você procura?
        <input required maxLength={300} value={rolesText} onChange={event => setRolesText(event.target.value)} placeholder="Ex.: auxiliar administrativo, atendimento, logística" />
        <small>Separe mais de uma opção com vírgulas.</small>
      </label>
      <label>Cidade ou região
        <input maxLength={120} value={profile.location_text} onChange={event => setProfile(current => ({ ...current, location_text: event.target.value }))} placeholder="Ex.: Recife, PE ou região metropolitana" />
      </label>
    </div>

    <fieldset className="career-choice-group">
      <legend>Como você pode ou prefere trabalhar?</legend>
      <div className="career-work-modes">
        {workModeOptions.map(option => <label key={option.value}>
          <input type="checkbox" checked={profile.work_modes.includes(option.value)} onChange={() => toggleWorkMode(option.value)} /> {option.label}
        </label>)}
      </div>
    </fieldset>

    <div className="career-field-grid">
      <label>Quanto tempo você tem por semana para a busca?
        <select value={profile.weekly_availability ?? ''} onChange={event => setProfile(current => ({ ...current, weekly_availability: event.target.value ? Number(event.target.value) : null }))}>
          <option value="">Prefiro não definir agora</option><option value="2">Até 2 horas</option><option value="4">De 3 a 5 horas</option><option value="8">De 6 a 10 horas</option><option value="12">Mais de 10 horas</option>
        </select>
      </label>
      <label>Qual é sua maior dificuldade neste momento?
        <textarea maxLength={600} rows={4} value={profile.main_challenge} onChange={event => setProfile(current => ({ ...current, main_challenge: event.target.value }))} placeholder="Ex.: não sei como mostrar experiências informais no currículo" />
      </label>
    </div>

    {error && <p className="error-note" role="alert">{error}</p>}
    {notice && <p className="success-note" role="status">{notice}</p>}
    <div className="career-form-actions">
      <button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar meu objetivo'}</button>
      <LinkButton href="/candidaturas">Ver minhas candidaturas</LinkButton>
    </div>
    <p className="career-privacy-note">Estas informações ficam na sua conta e não são enviadas automaticamente a empresas ou provedores de IA.</p>
  </form>;
}

export function ApplicationsPage({ applicationId }: { applicationId?: string }) {
  return <main className="platform-page application-page">
    <RequireUser><ApplicationsWorkspace applicationId={applicationId} /></RequireUser>
  </main>;
}

function ApplicationsWorkspace({ applicationId }: { applicationId?: string }) {
  const isNew = applicationId === 'nova';
  if (applicationId) return <ApplicationDetail applicationId={isNew ? undefined : applicationId} />;
  return <ApplicationList />;
}

function ApplicationList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<JobApplication[]>([]);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    apiCollection<JobApplication>('/api/applications', 'applications').then(result => { if (active) setRows(result); }).catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  const visible = useMemo(() => rows.filter(row => filter === 'all' || row.status === filter), [rows, filter]);
  const activeCount = rows.filter(row => !['hired', 'rejected', 'withdrawn'].includes(row.status)).length;
  return <>
    <header className="application-heading">
      <div><span className="eyebrow">SUA BUSCA</span><h1>Minhas candidaturas</h1><p>Guarde as oportunidades em um só lugar e saiba o que merece atenção agora.</p></div>
      <LinkButton href="/candidaturas/nova" className="button button-primary">Registrar candidatura</LinkButton>
    </header>

    <section className="application-overview" aria-label="Resumo das candidaturas">
      <div><strong>{rows.length}</strong><span>No total</span></div><div><strong>{activeCount}</strong><span>Em andamento</span></div><div><strong>{rows.filter(row => row.status === 'interview').length}</strong><span>Em entrevista</span></div>
    </section>

    <div className="application-filters" aria-label="Filtrar candidaturas">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas <span>{rows.length}</span></button>
      {statusOptions.map(option => {
        const count = rows.filter(row => row.status === option.value).length;
        return count > 0 && <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label} <span>{count}</span></button>;
      })}
    </div>

    {error && <p className="error-note" role="alert">{error}</p>}
    {loading ? <p className="application-loading" role="status">Carregando suas candidaturas…</p> : visible.length ? <ul className="application-list" aria-label="Candidaturas">
      {visible.map(row => <li key={row.id}>
        <article className="application-card">
          <div className="application-card-top"><span className={`application-status application-status-${row.status}`}>{statusLabel(row.status)}</span>{row.next_action_at && <span className="application-next-date">Próxima ação: {localDate(row.next_action_at, true)}</span>}</div>
          <h2>{row.role}</h2><p className="application-company">{row.company}</p>
          <dl><div><dt>Local</dt><dd>{row.location || 'Não informado'}</dd></div><div><dt>Atualizada</dt><dd>{localDate(row.updated_at ?? row.created_at)}</dd></div></dl>
          <LinkButton href={`/candidaturas/${row.id}`} className="application-open-link">Abrir candidatura <span aria-hidden="true">→</span></LinkButton>
        </article>
      </li>)}
    </ul> : <section className="application-empty">
      <span aria-hidden="true">◎</span><h2>{filter === 'all' ? 'Sua busca começa com uma oportunidade' : `Nenhuma candidatura em “${statusLabel(filter)}”`}</h2>
      <p>{filter === 'all' ? 'Registre uma vaga que encontrou. Você não precisa ter se candidatado ainda.' : 'Escolha outro filtro ou atualize a etapa de uma candidatura.'}</p>
      {filter === 'all' && <LinkButton href="/candidaturas/nova" className="button button-primary">Adicionar primeira candidatura</LinkButton>}
    </section>}
  </>;
}

function ApplicationDetail({ applicationId }: { applicationId?: string }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<Omit<JobApplication, 'id'>>({ ...emptyApplication });
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [eventType, setEventType] = useState('note');
  const [eventNote, setEventNote] = useState('');
  const [eventDate, setEventDate] = useState(() => inputDateTime(new Date().toISOString()));
  const [loading, setLoading] = useState(Boolean(applicationId));
  const [busy, setBusy] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!applicationId) return;
    const [applicationResult, eventsResult] = await Promise.all([
      api<ApplicationResult>(`/api/applications/${applicationId}`), apiCollection<ApplicationEvent>(`/api/applications/${applicationId}/events`, 'events'),
    ]);
    const application = asApplication(applicationResult);
    const { id: _id, ...editable } = application;
    void _id;
    setDraft({ ...emptyApplication, ...editable, applied_at: inputDate(application.applied_at), next_action_at: inputDateTime(application.next_action_at) });
    setEvents(eventsResult);
  }

  useEffect(() => {
    if (!user || !applicationId) return;
    let active = true;
    setLoading(true);
    load().catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, applicationId]);

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) { setDraft(current => ({ ...current, [key]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...draft, applied_at: draft.applied_at || null, next_action_at: draft.next_action_at ? toIsoOrEmpty(draft.next_action_at) : null };
      if (applicationId) {
        await api(`/api/applications/${applicationId}`, payload, 'PUT');
        setNotice('Candidatura atualizada.'); await load();
      } else {
        const result = asApplication(await api<ApplicationResult>('/api/applications', payload, 'POST'));
        go(`/candidaturas/${result.id}`);
      }
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!applicationId || !confirm(`Excluir a candidatura para ${draft.role || 'esta vaga'}? O histórico também será removido.`)) return;
    setBusy(true); setError('');
    try { await api(`/api/applications/${applicationId}`, undefined, 'DELETE'); go('/candidaturas'); } catch (reason) { setError(message(reason)); setBusy(false); }
  }
  async function addEvent(event: FormEvent) {
    event.preventDefault();
    if (!applicationId || !eventNote.trim()) return;
    setEventBusy(true); setError('');
    try {
      await api(`/api/applications/${applicationId}/events`, { event_type: eventType, note: eventNote.trim(), occurred_at: toIsoOrEmpty(eventDate) }, 'POST');
      setEventNote(''); setEventDate(inputDateTime(new Date().toISOString())); await load();
    } catch (reason) { setError(message(reason)); } finally { setEventBusy(false); }
  }

  if (loading) return <p className="application-loading" role="status">Abrindo candidatura…</p>;
  return <>
    <header className="application-heading application-detail-heading">
      <div><button className="application-back" type="button" onClick={() => go('/candidaturas')}>← Todas as candidaturas</button><h1>{applicationId ? `${draft.role || 'Candidatura'} · ${draft.company || 'empresa'}` : 'Registrar candidatura'}</h1><p>{applicationId ? 'Atualize a etapa, anote contatos e mantenha o próximo passo visível.' : 'Você pode começar só com a empresa e a vaga. Complete o restante quando souber.'}</p></div>
      {applicationId && <div className="application-heading-actions"><LinkButton href={`/candidaturas/${applicationId}/materiais`}>Materiais da vaga</LinkButton><LinkButton href={`/candidaturas/${applicationId}/entrevista`} className="button button-primary">Preparar entrevista</LinkButton></div>}
    </header>
    <div className={`application-detail-layout${applicationId ? '' : ' application-detail-layout-single'}`}>
      <form className="platform-card application-form" onSubmit={event => { void save(event); }}>
        <div className="application-form-section"><span>Oportunidade</span><div className="application-field-grid">
          <label>Empresa<input required maxLength={160} value={draft.company} onChange={event => update('company', event.target.value)} placeholder="Nome da empresa" /></label>
          <label>Cargo ou função<input required maxLength={160} value={draft.role} onChange={event => update('role', event.target.value)} placeholder="Ex.: Auxiliar administrativo" /></label>
          <label>Etapa atual<select value={draft.status} onChange={event => update('status', event.target.value as ApplicationStatus)}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{statusOptions.find(option => option.value === draft.status)?.help}</small></label>
          <label>Modelo de trabalho<select value={draft.work_mode} onChange={event => update('work_mode', event.target.value as WorkMode | '')}><option value="">Não informado</option>{workModeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Local<input maxLength={160} value={draft.location} onChange={event => update('location', event.target.value)} placeholder="Cidade, estado ou região" /></label>
          <label>Faixa salarial informada<input maxLength={120} value={draft.salary_text} onChange={event => update('salary_text', event.target.value)} placeholder="Ex.: R$ 2.000 a R$ 2.500" /></label>
        </div></div>

        <div className="application-form-section"><span>Origem e datas</span><div className="application-field-grid">
          <label>Onde encontrou a vaga?<input maxLength={120} value={draft.source} onChange={event => update('source', event.target.value)} placeholder="Ex.: indicação, LinkedIn, site da empresa" /></label>
          <label>Link da vaga<input type="url" maxLength={2000} value={draft.source_url} onChange={event => update('source_url', event.target.value)} placeholder="https://…" /></label>
          <label>Data da candidatura<input type="date" value={draft.applied_at} onChange={event => update('applied_at', event.target.value)} /></label>
          <label>Quando quer olhar isso novamente?<input type="datetime-local" value={draft.next_action_at} onChange={event => update('next_action_at', event.target.value)} /></label>
        </div></div>

        <div className="application-form-section"><span>Contexto</span>
          <label>Descrição ou requisitos<textarea rows={7} maxLength={12000} value={draft.description_text} onChange={event => update('description_text', event.target.value)} placeholder="Cole somente o que será útil para preparar sua candidatura." /></label>
          <label>Minhas observações<textarea rows={5} maxLength={4000} value={draft.notes} onChange={event => update('notes', event.target.value)} placeholder="O que chamou sua atenção? Quem indicou? O que falta preparar?" /></label>
        </div>
        {error && <p className="error-note" role="alert">{error}</p>}{notice && <p className="success-note" role="status">{notice}</p>}
        <div className="application-form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : applicationId ? 'Salvar alterações' : 'Criar candidatura'}</button>{applicationId && <button className="button application-delete" type="button" disabled={busy} onClick={() => { void remove(); }}>Excluir candidatura</button>}</div>
        <p className="application-privacy-note">Nada é enviado para a empresa. Este espaço é privado e serve apenas para organizar sua busca.</p>
      </form>

      {applicationId && <aside className="application-history" aria-labelledby="application-history-title">
        <div className="application-history-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2 id="application-history-title">Histórico</h2></div><span>{events.length} {events.length === 1 ? 'registro' : 'registros'}</span></div>
        <form className="application-event-form" onSubmit={event => { void addEvent(event); }}>
          <label>Tipo<select value={eventType} onChange={event => setEventType(event.target.value)}><option value="note">Anotação</option><option value="contact">Contato com a empresa</option><option value="follow_up">Acompanhamento</option><option value="interview">Entrevista</option></select></label>
          <label>Data e hora<input type="datetime-local" required value={eventDate} onChange={event => setEventDate(event.target.value)} /></label>
          <label className="application-event-note">O que aconteceu?<textarea required rows={3} maxLength={2000} value={eventNote} onChange={event => setEventNote(event.target.value)} placeholder="Ex.: Enviei uma mensagem perguntando sobre as próximas etapas." /></label>
          <button className="button" disabled={eventBusy || !eventNote.trim()}>{eventBusy ? 'Registrando…' : 'Adicionar ao histórico'}</button>
        </form>
        {events.length ? <ol className="application-timeline">{[...events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).map(item => <li key={item.id}>
          <div className="application-timeline-dot" aria-hidden="true" /><div><span>{eventLabel(item.event_type)} · {localDate(item.occurred_at, true)}</span>{item.from_status && item.to_status && <p className="application-status-change">{statusLabel(item.from_status)} → {statusLabel(item.to_status)}</p>}{item.note && <p>{item.note}</p>}</div>
        </li>)}</ol> : <p className="application-history-empty">Ainda não há atualizações. Use o formulário acima para registrar um contato, entrevista ou lembrete.</p>}
      </aside>}
    </div>
  </>;
}
