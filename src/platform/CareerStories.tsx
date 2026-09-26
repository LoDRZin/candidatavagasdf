import { useEffect, useState, type FormEvent } from 'react';
import './materials.css';
import { RequireUser, useAuth } from './Auth';
import { api, go, message } from './api';

export type CareerStory = {
  id: string;
  title: string;
  context_text: string;
  action_text: string;
  result_text: string;
  learning_text: string;
  skills: string[];
  source_type: 'formal_work' | 'informal_work' | 'education' | 'volunteering' | 'project' | 'personal';
  revision: number;
  created_at?: string;
  updated_at?: string;
};

const emptyStory: Omit<CareerStory, 'id' | 'revision'> = {
  title: '', context_text: '', action_text: '', result_text: '', learning_text: '', skills: [], source_type: 'personal',
};

const sourceOptions: { value: CareerStory['source_type']; label: string }[] = [
  { value: 'formal_work', label: 'Trabalho formal' },
  { value: 'informal_work', label: 'Trabalho informal' },
  { value: 'education', label: 'Escola ou curso' },
  { value: 'volunteering', label: 'Voluntariado ou comunidade' },
  { value: 'project', label: 'Projeto pessoal' },
  { value: 'personal', label: 'Outra experiência' },
];

function sourceLabel(value: CareerStory['source_type']) {
  return sourceOptions.find(option => option.value === value)?.label ?? value;
}

export function CareerStoriesPage() {
  return <main className="platform-page stories-page">
    <header className="stories-heading">
      <div><span className="eyebrow">SUAS EXPERIÊNCIAS REAIS</span><h1>Histórias e conquistas</h1><p>Guarde exemplos de trabalho, estudo, projetos e vida cotidiana. Depois, reutilize fatos verdadeiros no currículo, na carta e na entrevista.</p></div>
      <button className="button" type="button" onClick={() => go('/dashboard')}>Voltar ao painel</button>
    </header>
    <RequireUser><StoriesWorkspace /></RequireUser>
  </main>;
}

function StoriesWorkspace() {
  const { user } = useAuth();
  const [stories, setStories] = useState<CareerStory[]>([]);
  const [editing, setEditing] = useState<CareerStory | null>(null);
  const [draft, setDraft] = useState<Omit<CareerStory, 'id' | 'revision'>>({ ...emptyStory });
  const [skillsText, setSkillsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const result = await api<{ stories: CareerStory[] }>('/api/career-stories');
    setStories(result.stories);
  }
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    load().catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  function reset() { setEditing(null); setDraft({ ...emptyStory }); setSkillsText(''); setError(''); }
  function edit(story: CareerStory) {
    setEditing(story);
    const { id: _id, revision: _revision, created_at: _createdAt, updated_at: _updatedAt, ...fields } = story;
    void _id; void _revision; void _createdAt; void _updatedAt;
    setDraft(fields); setSkillsText(story.skills.join(', ')); setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const skills = [...new Set(skillsText.split(',').map(item => item.trim()).filter(Boolean))];
    try {
      if (editing) await api(`/api/career-stories/${editing.id}`, { ...draft, skills, revision: editing.revision }, 'PUT');
      else await api('/api/career-stories', { ...draft, skills }, 'POST');
      await load(); reset(); setNotice(editing ? 'História atualizada.' : 'História guardada. Agora você pode vinculá-la a uma candidatura.');
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  async function remove(story: CareerStory) {
    if (!confirm(`Excluir “${story.title}”? Ela também será removida das candidaturas vinculadas.`)) return;
    setBusy(true); setError('');
    try { await api(`/api/career-stories/${story.id}`, undefined, 'DELETE'); if (editing?.id === story.id) reset(); await load(); }
    catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }

  return <div className="stories-layout">
    <form className="platform-card story-form" onSubmit={event => { void save(event); }}>
      <div className="story-form-title"><div><span className="eyebrow">{editing ? 'EDITANDO' : 'NOVA HISTÓRIA'}</span><h2>{editing ? editing.title : 'Reconheça o que você já fez'}</h2></div>{editing && <button type="button" className="story-cancel" onClick={reset}>Cancelar edição</button>}</div>
      <label>Título do exemplo<input required maxLength={160} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: Organizei os pedidos da loja da família" /></label>
      <label>De onde veio esta experiência?<select value={draft.source_type} onChange={event => setDraft(current => ({ ...current, source_type: event.target.value as CareerStory['source_type'] }))}>{sourceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Qual era o contexto?<textarea rows={3} maxLength={4000} value={draft.context_text} onChange={event => setDraft(current => ({ ...current, context_text: event.target.value }))} placeholder="O que estava acontecendo? Quem precisava de ajuda?" /></label>
      <label>O que você fez?<textarea rows={3} maxLength={4000} value={draft.action_text} onChange={event => setDraft(current => ({ ...current, action_text: event.target.value }))} placeholder="Descreva suas ações, sem aumentar nem inventar." /></label>
      <label>Qual foi o resultado?<textarea rows={3} maxLength={4000} value={draft.result_text} onChange={event => setDraft(current => ({ ...current, result_text: event.target.value }))} placeholder="O que melhorou, foi concluído ou ficou mais organizado?" /></label>
      <label>O que você aprendeu?<textarea rows={3} maxLength={4000} value={draft.learning_text} onChange={event => setDraft(current => ({ ...current, learning_text: event.target.value }))} placeholder="Ex.: aprendi a priorizar pedidos e conversar com clientes" /></label>
      <label>Habilidades demonstradas<input maxLength={500} value={skillsText} onChange={event => setSkillsText(event.target.value)} placeholder="Organização, atendimento, comunicação" /><small>Separe com vírgulas.</small></label>
      {error && <p className="error-note" role="alert">{error}</p>}{notice && <p className="success-note" role="status">{notice}</p>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Guardar história'}</button>
      <p className="story-privacy">Use somente fatos reais. Essas informações ficam privadas na sua conta e não são enviadas para IA automaticamente.</p>
    </form>

    <section className="stories-library" aria-labelledby="stories-library-title">
      <div className="stories-library-heading"><div><span className="eyebrow">SUA BIBLIOTECA</span><h2 id="stories-library-title">Exemplos para reutilizar</h2></div><span>{stories.length}</span></div>
      {loading ? <p role="status">Carregando suas histórias…</p> : stories.length ? <ul>{stories.map(story => <li key={story.id}>
        <article className="story-card"><div className="story-card-top"><span>{sourceLabel(story.source_type)}</span><small>revisão {story.revision}</small></div><h3>{story.title}</h3>{story.action_text && <p>{story.action_text}</p>}{story.skills.length > 0 && <div className="story-skills">{story.skills.map(skill => <span key={skill}>{skill}</span>)}</div>}<div className="story-actions"><button type="button" onClick={() => edit(story)}>Editar</button><button type="button" className="danger" disabled={busy} onClick={() => { void remove(story); }}>Excluir</button></div></article>
      </li>)}</ul> : <div className="story-empty"><span aria-hidden="true">✦</span><h3>Você tem histórias, mesmo sem emprego formal</h3><p>Um projeto escolar, cuidado com familiares, venda informal ou ajuda na comunidade pode mostrar habilidades reais.</p></div>}
    </section>
  </div>;
}
