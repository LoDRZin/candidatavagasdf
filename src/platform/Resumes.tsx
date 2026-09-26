import { useEffect, useRef, useState } from 'react';
import { resumeFingerprint, mergeSuggestion } from '../../shared/resumeMerge';
import { resumeSchema, sanitizeNarrative, suggestionSchema, type ResumeRecord, type Suggestion } from '../../shared/contracts';
import type { ResumeData, TemplateId } from '../types';
import { useAuth } from './Auth';
import { api, ApiError, message } from './api';
export function CloudLibrary() {
  const { user } = useAuth(); const [rows, setRows] = useState<Omit<ResumeRecord, 'data'>[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(() => Boolean(user?.email_verified_at));
  async function load() { setLoading(true); try { setRows((await api<{ resumes: typeof rows }>('/api/resumes')).resumes); } catch (e) { setError(message(e)); } finally { setLoading(false); } }
  useEffect(() => { if (user?.email_verified_at) void load(); }, [user?.id, user?.email_verified_at]);
  if (!user) return null;
  return <section className="platform-page cloud-library"><div className="platform-heading"><span className="eyebrow">SEUS DOCUMENTOS</span><h2>Currículos na sua conta</h2></div>{!user.email_verified_at ? <p><a href="/verificar-email">Confirme seu e-mail</a> para sincronizar currículos.</p> : <>{loading ? <div className="route-skeleton-grid" role="status" aria-label="Carregando currículos"><div /><div /></div> : <><div className="course-grid">{rows.map(r => <article className="platform-card" key={r.id}><h3>{r.title}</h3><p>Revisão {r.revision} · {new Date(r.updated_at).toLocaleString('pt-BR')}</p><div className="platform-actions"><a className="button button-primary" href={`/editor?resume=${r.id}`}>Abrir</a><button className="button" onClick={() => { if (confirm(`Excluir “${r.title}” e seu histórico?`)) void api(`/api/resumes/${r.id}`, undefined, 'DELETE').then(load).catch(e => setError(message(e))); }}>Excluir</button></div></article>)}</div>{!rows.length && <p>Abra o editor e escolha “Salvar na minha conta” para sincronizar seu primeiro currículo.</p>}</>}<a className="button" href="/editor">Abrir editor</a></>}{error && <p role="alert">{error}</p>}</section>;
}
type Props = { data: ResumeData; templateId: TemplateId; setData: (data: ResumeData) => void; setTemplateId: (id: TemplateId) => void };
export function ResumeAccountTools({ data, templateId, setData, setTemplateId }: Props) {
  const { user } = useAuth();
  const [record, setRecord] = useState<ResumeRecord | null>(null), [title, setTitle] = useState('Meu currículo'), [status, setStatus] = useState('Rascunho local'), [error, setError] = useState(''), [conflict, setConflict] = useState(false), [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<{ revision: number; source: string; created_at: string }[]>([]);
  const remote = useRef<ResumeRecord | null>(null), saved = useRef(''), inFlight = useRef<Promise<ResumeRecord | null> | null>(null), blocked = useRef(false), source = useRef<'manual' | 'ai_accepted' | 'import_local'>('manual');
  const latest = useRef({ data, templateId, title }); latest.current = { data, templateId, title };
  const pendingKey = user ? `conectavagasdf.resume.pending.${user.id}.${record?.id ?? new URLSearchParams(location.search).get('resume') ?? 'new'}` : '';
  function signature(value: { data: ResumeData; templateId: TemplateId; title: string }) { return resumeFingerprint(value); }
  function acceptRemote(r: ResumeRecord) { remote.current = r; saved.current = signature({ data: r.data, templateId: r.template_id, title: r.title }); setRecord(r); setData(r.data); setTemplateId(r.template_id); setTitle(r.title); setStatus('Salvo na sua conta'); }
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('resume'); let cancelled = false;
    if (user?.email_verified_at && id) {
      setStatus('Carregando currículo…'); setBusy(true);
      void api<ResumeRecord>(`/api/resumes/${encodeURIComponent(id)}`).then(r => {
        if (!cancelled) {
          acceptRemote(r);
          try { if (localStorage.getItem(pendingKey)) setError('Há alterações locais não sincronizadas. Use Recuperar alterações pendentes antes de editar.'); } catch { /* unavailable local storage */ }
        }
      }).catch(e => { if (!cancelled) setError(message(e)); }).finally(() => { if (!cancelled) setBusy(false); });
    }
    return () => { cancelled = true; };
  }, [user?.id]);
  async function save(forceCreate = false): Promise<ResumeRecord | null> {
    if (inFlight.current) return inFlight.current;
    if (!user?.email_verified_at || blocked.current) return null;
    const snapshot = structuredClone(latest.current), signatureValue = signature(snapshot), current = forceCreate ? null : remote.current;
    if (current && signatureValue === saved.current) return current;
    if (!current && !forceCreate) return null;
    inFlight.current = (async () => {
      setStatus('Salvando…'); setError('');
      try {
        const active = await api<{ user: { id: string } | null }>('/api/auth/session'); if (active.user?.id !== user.id) throw new Error('A conta mudou. Entre novamente antes de salvar.');
        let createId = sessionStorage.getItem(`${pendingKey}.create`); if (!createId || !forceCreate) createId = crypto.randomUUID();
        if (forceCreate) sessionStorage.setItem(`${pendingKey}.create`, createId);
        const result = await api<ResumeRecord>(current ? `/api/resumes/${current.id}` : '/api/resumes', { ...snapshot, revision: current?.revision, source: source.current, ...(!current ? { id: createId } : {}) }, current ? 'PUT' : 'POST', { 'X-Account-Id': user.id });
        remote.current = result; setRecord(result); saved.current = signature({ data: result.data, title: result.title, templateId: result.template_id }); source.current = 'manual'; setStatus(signatureValue === saved.current ? 'Salvo na sua conta' : 'Alterações pendentes…');
        if (forceCreate) { sessionStorage.removeItem(`${pendingKey}.create`); history.replaceState({}, '', `/editor?resume=${result.id}`); }
        try { localStorage.removeItem(pendingKey); } catch { /* local persistence optional after server confirmation */ }
        return result;
      } catch (e) {
        setError(message(e)); setStatus('Não foi possível sincronizar');
        if (e instanceof ApiError && e.status === 409) { blocked.current = true; setConflict(true); }
        return null;
      } finally { inFlight.current = null; }
    })(); return inFlight.current;
  }
  useEffect(() => {
    if (!record || busy || conflict || signature(latest.current) === saved.current) return;
    try { localStorage.setItem(pendingKey, JSON.stringify({ resumeId: record.id, ...latest.current })); } catch { /* editor also reports local storage errors */ }
    setStatus('Alterações pendentes…'); const timer = window.setTimeout(() => { void save(); }, 1800); return () => window.clearTimeout(timer);
  }, [data, templateId, title, record, busy, conflict, pendingKey]);
  useEffect(() => { const sync = () => { void save(); }; const warn = (e: BeforeUnloadEvent) => { if (remote.current && signature(latest.current) !== saved.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('online', sync); window.addEventListener('beforeunload', warn); return () => { window.removeEventListener('online', sync); window.removeEventListener('beforeunload', warn); }; }, [user?.id, pendingKey]);
  async function reload() { if (!remote.current) return; try { acceptRemote(await api<ResumeRecord>(`/api/resumes/${remote.current.id}`)); blocked.current = false; setConflict(false); setError(''); } catch (e) { setError(message(e)); } }
  async function accepted(next: ResumeData) {
    if (remote.current) { const before = await save(); if (!before) throw new Error('Salve ou resolva o conflito antes de aplicar a sugestão.'); }
    else { const before = await save(true); if (!before) throw new Error('Não foi possível guardar a versão anterior na conta.'); }
    source.current = 'ai_accepted'; latest.current = { ...latest.current, data: next }; setData(next);
    if (!await save()) throw new Error('A sugestão foi aplicada localmente, mas ainda precisa ser sincronizada. Use Salvar agora; não aplique novamente.');
  }
  if (!user) return <section className="resume-tools no-print"><p><a href="/login?returnTo=/editor">Entre na sua conta</a> para sincronizar currículos e usar a IA do Conecta Vagas. O editor manual continua disponível.</p></section>;
  if (!user.email_verified_at) return <section className="resume-tools no-print"><p><a href="/verificar-email">Confirme seu e-mail</a> para salvar na conta e usar a IA do Conecta Vagas.</p></section>;
  return <section className="resume-tools no-print"><div className="resume-tools-heading"><div><span className="eyebrow">SEU CURRÍCULO, EM QUALQUER DISPOSITIVO</span><h2>Salvar e criar com assistência</h2></div><span role="status" aria-live="polite">{status}</span></div><div className="platform-actions"><label>Título do currículo<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /></label><button className="button" disabled={busy || conflict} onClick={() => { void save(!record); }}>{record ? 'Salvar agora' : 'Salvar na minha conta'}</button><button className="button" disabled={busy} onClick={() => {
      if (!confirm('Importar o rascunho anônimo deste navegador para o editor desta conta? Revise antes de salvar.')) return;
      try { const draft = JSON.parse(localStorage.getItem('conectavagasdf.resume.draft.v1') ?? 'null'); const parsed = resumeSchema.safeParse(draft?.data); if (!parsed.success) throw new Error('Não há rascunho local válido para importar.'); setData(parsed.data); source.current = 'import_local'; setStatus('Rascunho importado para revisão'); } catch (e) { setError(message(e)); }
    }}>Importar rascunho do navegador</button><button className="button" onClick={() => {
      try { const pending = JSON.parse(localStorage.getItem(pendingKey) ?? 'null'); if (!pending || pending.resumeId !== remote.current?.id) throw new Error('Não há pendência para este currículo.'); setData(resumeSchema.parse(pending.data)); setTitle(pending.title); setTemplateId(pending.templateId); setStatus('Pendência recuperada para revisão.'); } catch (e) { setError(message(e)); }
    }}>Recuperar alterações pendentes</button></div>
    {conflict && <div className="error-note"><p>Este currículo mudou em outro dispositivo. Seu rascunho local foi preservado.</p><button className="button" onClick={() => { if (confirm('Descartar alterações locais e carregar o currículo remoto?')) void reload(); }}>Carregar versão remota</button><button className="button" onClick={() => { void (async () => { try { const fresh = await api<ResumeRecord>(`/api/resumes/${remote.current!.id}`); remote.current = fresh; blocked.current = false; setConflict(false); await save(); } catch (e) { setError(message(e)); } })(); }}>Manter minhas alterações</button><button className="button" onClick={() => { blocked.current = false; setConflict(false); void save(true); }}>Duplicar meu rascunho</button></div>}
    {record && <details><summary onClick={() => { void api<{ versions: typeof versions }>(`/api/resumes/${record.id}/versions`).then(r => setVersions(r.versions)).catch(e => setError(message(e))); }}>Histórico na conta · revisão {record.revision}</summary>{versions.map(v => <p key={v.revision}>Revisão {v.revision} · {v.source} · {new Date(v.created_at).toLocaleString()} <button className="button" onClick={() => { if (confirm('Restaurar esta versão? Alterações locais ainda não salvas serão substituídas.')) void api<ResumeRecord>(`/api/resumes/${record.id}/versions/${v.revision}/restore`, { revision: remote.current!.revision }).then(acceptRemote).catch(e => setError(message(e))); }}>Restaurar</button></p>)}</details>}
    {error && <p className="error-note" role="alert">{error}</p>}<AiResume data={data} onAccept={accepted} disabled={busy || conflict} />
  </section>;
}
const sectionLabels = { profile: 'Objetivo profissional', summary: 'Resumo', experiences: 'Experiências', education: 'Formação', projects: 'Projetos', certifications: 'Cursos e certificações', skills: 'Habilidades', languages: 'Idiomas' };
type Section = keyof typeof sectionLabels;
function describe(value: unknown): string { if (typeof value === 'string') return value; if (Array.isArray(value)) return value.map(describe).filter(Boolean).join('\n\n'); if (value && typeof value === 'object') return Object.entries(value).filter(([k, v]) => k !== 'id' && v !== '' && v !== false).map(([, v]) => describe(v)).filter(Boolean).join(' · '); return value === true ? 'Atual' : ''; }
function AiResume({ data, onAccept, disabled }: { data: ResumeData; onAccept: (data: ResumeData) => Promise<void>; disabled: boolean }) {
  const { user } = useAuth(); const key = `conectavagasdf.ai.narrative.${user!.id}`;
  const [narrative, setNarrative] = useState(() => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }), [consent, setConsent] = useState(false), [suggestion, setSuggestion] = useState<Suggestion | null>(null), [selected, setSelected] = useState<Section[]>([]), [mode, setMode] = useState<'append' | 'replace'>('append'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const sanitized = sanitizeNarrative(narrative);
  useEffect(() => { try { localStorage.setItem(key, narrative); } catch { /* no persistence claim */ } }, [narrative, key]);
  async function generate() { setBusy(true); setError(''); setConsent(false); try { const value = await api<Suggestion>('/api/ai/resume/structure', { narrative: sanitized, consent: true, schemaVersion: 1 }); setSuggestion(suggestionSchema.parse(value)); setSelected([]); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  async function apply() {
    if (!suggestion) return;
    setBusy(true); setError(''); try { await onAccept(mergeSuggestion(data, suggestion, selected, mode)); setSuggestion(null); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <details className="ai-assistant"><summary>Criar com ajuda da IA do Conecta Vagas</summary><p>Conte sua trajetória de forma simples. A IA organiza as informações nos modelos existentes; você revisa antes de aplicar. Não inclua documentos ou dados sensíveis.</p><label>O que você gostaria de contar?<textarea rows={6} minLength={20} maxLength={12000} value={narrative} onChange={e => { setNarrative(e.target.value); setConsent(false); }} placeholder="Quero trabalhar com atendimento. Ajudei na loja da minha família, atendendo clientes e organizando produtos. Concluí o ensino médio…" /></label><small>{narrative.length}/12000 caracteres</small><details><summary>Conferir texto que será enviado para a IA do Conecta Vagas</summary><p className="narrative-preview">{sanitized || 'Digite seu relato acima.'}</p></details><label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Autorizo o envio deste relato para a IA do Conecta Vagas, que pode usar um provedor externo para organizar meu currículo. Os campos de contato do editor não serão enviados.</span></label><button className="button button-primary" disabled={!consent || sanitized.length < 20 || busy || disabled} onClick={() => { void generate(); }}>{busy ? 'Processando…' : 'Organizar meu currículo com a IA do Conecta Vagas'}</button>{error && <p role="alert" className="error-note">{error}</p>}
    {suggestion && <div className="ai-review"><h3>Revise sua sugestão</h3><p>Selecione as seções que deseja aplicar. Confirme os fatos; a IA pode cometer erros. Campos vazios preservam o conteúdo atual.</p><label>Itens de listas<select value={mode} onChange={e => setMode(e.target.value as 'append' | 'replace')}><option value="append">Adicionar aos itens existentes</option><option value="replace">Substituir a seção selecionada</option></select></label>{(Object.keys(sectionLabels) as Section[]).map(section => <section className="ai-section" key={section}><label className="check-label"><input type="checkbox" checked={selected.includes(section)} onChange={e => setSelected(old => e.target.checked ? [...old, section] : old.filter(s => s !== section))} /><strong>{sectionLabels[section]}</strong></label><div className="ai-comparison"><div><small>ATUAL</small><p>{describe(data[section]) || 'Não preenchido'}</p></div><div><small>SUGESTÃO</small><p>{describe(suggestion.resume[section]) || 'Sem informação declarada'}</p></div></div></section>)}{suggestion.missingQuestions.length > 0 && <><h3>O que falta confirmar</h3><ul>{suggestion.missingQuestions.map((q, i) => <li key={i}>{q.question}</li>)}</ul><p>Acrescente as respostas ao relato e gere uma nova sugestão, ou complete depois no editor.</p></>}{suggestion.warnings.map((w, i) => <p key={i}>{w}</p>)}<details><summary>Ver evidências do relato</summary>{suggestion.evidence.map((e, i) => <p key={i}><strong>{e.field}</strong>: “{e.sourceText}”</p>)}</details><div className="platform-actions"><button disabled={!selected.length || busy || disabled} className="button button-primary" onClick={() => { void apply(); }}>Aplicar seções selecionadas</button><button className="button" disabled={busy} onClick={() => setSuggestion(null)}>Descartar sugestão</button></div></div>}
  </details>;
}
