import { useEffect, useMemo, useState } from 'react';
import './materials.css';
import type { ResumeRecord } from '../../shared/contracts';
import { RequireUser, useAuth } from './Auth';
import type { CareerStory } from './CareerStories';
import { api, apiCollection, go, message } from './api';

type Application = {
  id: string; company: string; role: string; source: string; source_url: string; location: string;
  work_mode: '' | 'onsite' | 'hybrid' | 'remote'; status: 'saved' | 'applied' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';
  salary_text: string; description_text: string; applied_at: string | null; next_action_at: string | null;
  resume_id: string | null; cover_letter_id: string | null; notes: string; revision: number; created_at: string; updated_at: string;
};

type ResumeSummary = Omit<ResumeRecord, 'data'>;
type CoverLetter = {
  id: string; application_id: string; resume_id: string | null; title: string; company: string; role: string;
  reason_text: string; contribution_text: string; body_text: string; source: 'manual' | 'local_template' | 'ai_accepted';
  revision: number; created_at: string; updated_at: string;
};

const stopwords = new Set('para como uma umas uns esse essa isso esta estão pela pelo pelos pelas com sem que seu sua seus suas vaga vagas trabalho empresa cargo função sobre entre mais muito onde quando quem qual quais dos das por aos nas nos não sim ter ser foi são tem você experiência atividades requisitos conhecimento conhecimentos desejável obrigatório diferencial'.split(' '));

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function keyTerms(value: string) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const raw of value.match(/[\p{L}\p{N}+#.-]+/gu) ?? []) {
    const term = normalize(raw).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, '');
    if (term.length < 4 || stopwords.has(term) || /^\d+$/.test(term)) continue;
    const current = counts.get(term); counts.set(term, { label: raw, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, 18).map(([term, data]) => ({ term, label: data.label }));
}

function storyText(story: CareerStory) {
  return [story.title, story.context_text, story.action_text, story.result_text, story.learning_text, ...story.skills].join(' ');
}

export function ApplicationMaterialsPage({ applicationId }: { applicationId: string }) {
  return <main className="platform-page materials-page"><RequireUser><MaterialsWorkspace applicationId={applicationId} /></RequireUser></main>;
}

function MaterialsWorkspace({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  const [selectedResume, setSelectedResume] = useState('');
  const [stories, setStories] = useState<CareerStory[]>([]);
  const [linkedStories, setLinkedStories] = useState<CareerStory[]>([]);
  const [selectedStory, setSelectedStory] = useState('');
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [letterDraft, setLetterDraft] = useState({ title: 'Carta de apresentação', reason_text: '', contribution_text: '', body_text: '' });
  const [variantId, setVariantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const [applicationResult, resumeResult, storyResult, linkedResult, letterResult] = await Promise.all([
      api<{ application: Application }>(`/api/applications/${applicationId}`),
      api<{ resumes: ResumeSummary[] }>('/api/resumes'),
      api<{ stories: CareerStory[] }>('/api/career-stories'),
      api<{ stories: CareerStory[] }>(`/api/applications/${applicationId}/stories`),
      apiCollection<CoverLetter>(`/api/cover-letters?applicationId=${encodeURIComponent(applicationId)}`, 'letters'),
    ]);
    const nextApplication = applicationResult.application;
    setApplication(nextApplication); setResumes(resumeResult.resumes); setStories(storyResult.stories); setLinkedStories(linkedResult.stories);
    setSelectedResume(nextApplication.resume_id ?? '');
    const activeLetter = letterResult.find(item => item.id === nextApplication.cover_letter_id) ?? letterResult[0] ?? null;
    setLetter(activeLetter);
    setLetterDraft(activeLetter ? { title: activeLetter.title, reason_text: activeLetter.reason_text, contribution_text: activeLetter.contribution_text, body_text: activeLetter.body_text } : { title: `Carta para ${nextApplication.role}`, reason_text: '', contribution_text: '', body_text: '' });
    setResume(nextApplication.resume_id ? await api<ResumeRecord>(`/api/resumes/${nextApplication.resume_id}`) : null);
  }

  useEffect(() => {
    if (!user) return;
    let active = true; setLoading(true);
    load().catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, applicationId]);

  const analysis = useMemo(() => {
    if (!application) return [];
    const resumeText = normalize(resume ? JSON.stringify(resume.data) : '');
    const storiesText = normalize(linkedStories.map(storyText).join(' '));
    return keyTerms(application.description_text).map(item => ({ ...item, state: resumeText.includes(item.term) ? 'resume' : storiesText.includes(item.term) ? 'story' : 'missing' as const }));
  }, [application?.description_text, resume, linkedStories]);

  async function linkResume() {
    if (!application) return;
    setBusy('resume'); setError(''); setNotice('');
    try {
      const result = await api<{ application: Application }>(`/api/applications/${application.id}`, { ...application, resume_id: selectedResume || null, revision: application.revision }, 'PUT');
      setApplication(result.application);
      setResume(result.application.resume_id ? await api<ResumeRecord>(`/api/resumes/${result.application.resume_id}`) : null);
      setNotice(selectedResume ? 'Currículo vinculado à candidatura.' : 'Currículo desvinculado.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function createVariant() {
    if (!application?.resume_id) return;
    setBusy('variant'); setError(''); setNotice('');
    try {
      const result = await api<{ resume: ResumeRecord; application: { revision: number; resume_id: string } }>(`/api/resumes/${application.resume_id}/variants`, {
        application_id: application.id, application_revision: application.revision,
        title: `${resume?.title ?? 'Currículo'} — ${application.company}`.slice(0, 120),
      }, 'POST');
      setVariantId(result.resume.id); await load();
      setNotice('Cópia criada e vinculada. O currículo-base não foi alterado.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function linkStory() {
    if (!selectedStory) return;
    setBusy('story'); setError('');
    try { await api(`/api/applications/${applicationId}/stories`, { story_id: selectedStory }, 'POST'); setSelectedStory(''); await load(); }
    catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  async function unlinkStory(storyId: string) {
    setBusy('story'); setError('');
    try { await api(`/api/applications/${applicationId}/stories/${storyId}`, undefined, 'DELETE'); await load(); }
    catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  function buildLetter() {
    if (!application) return;
    const evidence = linkedStories[0];
    const contribution = letterDraft.contribution_text.trim() || (evidence ? `${evidence.title}: ${evidence.action_text || evidence.result_text}` : 'Posso contribuir com as experiências e habilidades apresentadas no currículo vinculado.');
    const reason = letterDraft.reason_text.trim() || `Tenho interesse na oportunidade de ${application.role}.`;
    setLetterDraft(current => ({ ...current, body_text: `Olá, equipe da ${application.company},\n\n${reason}\n\n${contribution}\n\nFico à disposição para conversar sobre como minha trajetória pode contribuir com a função.\n\nAtenciosamente.` }));
  }

  async function saveLetter() {
    if (!application || !letterDraft.body_text.trim()) return;
    setBusy('letter'); setError(''); setNotice('');
    try {
      if (letter) {
        const result = await api<{ letter: CoverLetter }>(`/api/cover-letters/${letter.id}`, { ...letterDraft, application_id: application.id, resume_id: application.resume_id, company: application.company, role: application.role, source: 'manual', revision: letter.revision }, 'PUT');
        setLetter(result.letter); setNotice('Carta atualizada na sua conta.');
      } else {
        const result = await api<{ letter: CoverLetter; application: Application }>('/api/cover-letters', { ...letterDraft, application_id: application.id, application_revision: application.revision, resume_id: application.resume_id, company: application.company, role: application.role, source: 'local_template' }, 'POST');
        setLetter(result.letter); setApplication(current => current ? { ...current, ...result.application } : current); setNotice('Carta salva e vinculada à candidatura.');
      }
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  if (loading) return <p className="materials-loading" role="status">Organizando os materiais desta vaga…</p>;
  if (!application) return <p className="error-note">Candidatura não encontrada.</p>;
  const availableStories = stories.filter(item => !linkedStories.some(linked => linked.id === item.id));
  return <>
    <header className="materials-heading"><div><button type="button" onClick={() => go(`/candidaturas/${application.id}`)}>← Voltar para a candidatura</button><span className="eyebrow">ESPAÇO DA VAGA</span><h1>{application.role}</h1><p>{application.company} · organize fatos e materiais sem alterar seus documentos originais.</p></div><button className="button" type="button" onClick={() => go('/historias')}>Abrir banco de histórias</button></header>
    {error && <p className="error-note" role="alert">{error}</p>}{notice && <p className="success-note" role="status">{notice}</p>}

    <section className="materials-grid">
      <article className="platform-card material-card material-resume"><span className="eyebrow">01 · CURRÍCULO DA VAGA</span><h2>Escolha uma base segura</h2><p>Vincule um currículo existente. Quando quiser adaptar, crie uma cópia: o original continuará intacto.</p>
        <label>Currículo vinculado<select value={selectedResume} onChange={event => setSelectedResume(event.target.value)}><option value="">Nenhum currículo</option>{resumes.map(item => <option key={item.id} value={item.id}>{item.title} · revisão {item.revision}</option>)}</select></label>
        <div className="material-actions"><button className="button" disabled={busy !== '' || selectedResume === (application.resume_id ?? '')} onClick={() => { void linkResume(); }}>Vincular seleção</button><button className="button button-primary" disabled={busy !== '' || !application.resume_id} onClick={() => { void createVariant(); }}>{busy === 'variant' ? 'Criando cópia…' : 'Criar versão para esta vaga'}</button></div>
        {variantId && <a className="material-editor-link" href={`/editor?resume=${variantId}`}>Abrir a nova versão no editor →</a>}
      </article>

      <article className="platform-card material-card material-stories"><span className="eyebrow">02 · EVIDÊNCIAS REAIS</span><h2>Histórias relacionadas</h2><p>Associe exemplos que comprovam habilidades úteis para esta vaga.</p>
        <div className="story-link-control"><select aria-label="História para vincular" value={selectedStory} onChange={event => setSelectedStory(event.target.value)}><option value="">Escolha uma história</option>{availableStories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button className="button" disabled={!selectedStory || busy !== ''} onClick={() => { void linkStory(); }}>Vincular</button></div>
        {linkedStories.length ? <ul className="linked-story-list">{linkedStories.map(item => <li key={item.id}><div><strong>{item.title}</strong><span>{item.skills.join(' · ') || 'Sem habilidades marcadas'}</span></div><button type="button" disabled={busy !== ''} onClick={() => { void unlinkStory(item.id); }}>Remover</button></li>)}</ul> : <div className="material-empty"><p>Nenhuma história vinculada ainda.</p><button type="button" onClick={() => go('/historias')}>Criar minha primeira história</button></div>}
      </article>
    </section>

    <section className="platform-card requirement-analysis"><div className="requirement-analysis-heading"><div><span className="eyebrow">03 · LEITURA RESPONSÁVEL</span><h2>O que aparece nos seus materiais?</h2></div><small>Comparação local, sem IA e sem nota de aprovação.</small></div>
      {!application.description_text.trim() ? <p>Cole a descrição da vaga na página da candidatura para comparar termos importantes.</p> : analysis.length ? <div className="requirement-columns">
        <div><h3>Identificado no currículo</h3>{analysis.filter(item => item.state === 'resume').map(item => <span key={item.term}>{item.label}</span>)}{!analysis.some(item => item.state === 'resume') && <p>Nenhum termo foi identificado.</p>}</div>
        <div><h3>Identificado nas histórias</h3>{analysis.filter(item => item.state === 'story').map(item => <span key={item.term}>{item.label}</span>)}{!analysis.some(item => item.state === 'story') && <p>Nenhum termo adicional foi identificado.</p>}</div>
        <div><h3>Precisa confirmar</h3>{analysis.filter(item => item.state === 'missing').map(item => <span key={item.term}>{item.label}</span>)}{!analysis.some(item => item.state === 'missing') && <p>Nada pendente nesta leitura simples.</p>}</div>
      </div> : <p>A descrição ainda não contém termos suficientes para esta leitura.</p>}
      <p className="analysis-note">“Não identificado” não significa que você não possui a habilidade. Confirme na sua trajetória antes de acrescentar qualquer afirmação.</p>
    </section>

    <section className="platform-card material-letter"><div className="material-letter-heading"><div><span className="eyebrow">04 · CARTA VINCULADA</span><h2>Carta de apresentação</h2></div>{letter && <span>Salva · revisão {letter.revision}</span>}</div>
      <div className="material-letter-context"><label>Por que a vaga chamou sua atenção?<textarea rows={3} maxLength={3000} value={letterDraft.reason_text} onChange={event => setLetterDraft(current => ({ ...current, reason_text: event.target.value }))} /></label><label>Como você pode contribuir?<textarea rows={3} maxLength={3000} value={letterDraft.contribution_text} onChange={event => setLetterDraft(current => ({ ...current, contribution_text: event.target.value }))} /></label></div>
      <div className="material-actions"><button className="button" type="button" onClick={buildLetter}>Montar rascunho local</button></div>
      <label>Título<input maxLength={160} value={letterDraft.title} onChange={event => setLetterDraft(current => ({ ...current, title: event.target.value }))} /></label>
      <label>Texto editável<textarea className="letter-body" rows={13} maxLength={10000} value={letterDraft.body_text} onChange={event => setLetterDraft(current => ({ ...current, body_text: event.target.value }))} placeholder="Escreva ou monte um rascunho acima." /></label>
      <div className="material-actions"><button className="button button-primary" disabled={busy !== '' || !letterDraft.title.trim() || !letterDraft.body_text.trim()} onClick={() => { void saveLetter(); }}>{busy === 'letter' ? 'Salvando…' : letter ? 'Atualizar carta' : 'Salvar e vincular carta'}</button></div>
      <p className="material-privacy">A montagem acontece neste navegador. Nenhum texto é enviado para IA ou para a empresa.</p>
    </section>
  </>;
}
