import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../platform/Auth';
import { ResumeAccountTools } from '../platform/Resumes';
import { Brand } from '../components/Brand';
import { Field } from '../components/Field';
import { Icon, type IconName } from '../components/Icon';
import { ResumePreview } from '../components/ResumePreview';
import { TemplateCatalog } from '../components/TemplateCatalog';
import { canonicalTemplateId, defaultColorForTemplate, isTemplateId } from '../../shared/templateCatalog';
import { emptyResume, exampleResume } from '../data/defaultResume';
import { templates } from '../data/templates';
import { resumeCompleteness } from '../lib/renderResume';
import { getResumeChecks, jobKeywordMatch } from './review';
import type { Certification, Education, Experience, Project, ResumeData, SavedResumeVersion, TemplateId } from '../types';

const DRAFT_KEY = 'conectavagasdf.resume.draft.v1';
const VERSION_KEY = 'conectavagasdf.resume.versions.v1';
type EditorSection = 'profile' | 'summary' | 'experience' | 'education' | 'projects' | 'certifications' | 'skills' | 'review' | 'template';

function readSavedVersions(userId?: string): SavedResumeVersion[] {
  try {
    const value = JSON.parse(localStorage.getItem(userId ? `${VERSION_KEY}.${userId}` : VERSION_KEY) ?? "[]") as SavedResumeVersion[];
    return Array.isArray(value) ? value.filter((item) => item?.data?.profile && isTemplateId(item.templateId)).slice(0, 10).map((item) => ({ ...item, data: { ...item.data, projects: item.data.projects ?? [], certifications: item.data.certifications ?? [] } })) : [];
  } catch { return []; }
}

function makeId() { return crypto.randomUUID(); }

export function EditorPage({ data, setData, templateId, setTemplateId, onBack, onGuide, onLetter, onToast }: { data: ResumeData; setData: (data: ResumeData) => void; templateId: TemplateId; setTemplateId: (id: TemplateId) => void; onBack: () => void; onGuide: () => void; onLetter: () => void; onToast: (message: string) => void }) {
  const [section, setSection] = useState<EditorSection>("profile");
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const { user } = useAuth();
  const [versions, setVersions] = useState(() => readSavedVersions(user?.id));
  const [jobDescription, setJobDescription] = useState("");
  const selectedTemplate = templates.find((template) => template.id === canonicalTemplateId(templateId)) ?? templates[0]!;
  const appearanceColor = data.accentColor ?? defaultColorForTemplate(templateId);
  const completeness = resumeCompleteness(data);
  const reviewChecks = getResumeChecks(data, templateId);
  const keywordMatch = jobKeywordMatch(jobDescription, data);
  const checklist = [
    [Boolean(data.profile.name.trim()), "Adicione seu nome"],
    [Boolean(data.profile.headline.trim()), "Escolha o cargo desejado"],
    [Boolean(data.profile.email.trim() || data.profile.phone.trim()), "Inclua um contato"],
    [Boolean(data.summary.trim()), "Escreva um resumo profissional"],
    [data.experiences.length > 0 || data.projects.length > 0, "Inclua uma experiência ou atividade"],
    [data.education.length > 0, "Adicione sua formação"],
    [data.skills.length > 0, "Liste algumas competências"],
  ] as const;
  const hasPreviewContent = Boolean(
    Object.values(data.profile).some(value => value.trim()) || data.summary.trim() || data.experiences.length ||
    data.education.length || data.projects.length || data.certifications.length || data.skills.length || data.languages.length,
  );
  const sectionOrder: EditorSection[] = ["profile", "summary", "experience", "education", "projects", "certifications", "skills", "review", "template"];

  useEffect(() => {
    const node = document.createElement("div");
    node.id = "pdf-print-root";
    document.body.append(node);
    setPrintRoot(node);
    return () => node.remove();
  }, []);

  function updateProfile(key: keyof ResumeData["profile"], value: string) {
    setData({ ...data, profile: { ...data.profile, [key]: value } });
  }

  function updateExperience(id: string, update: Partial<Experience>) {
    setData({ ...data, experiences: data.experiences.map((item) => item.id === id ? { ...item, ...update } : item) });
  }

  function updateEducation(id: string, update: Partial<Education>) {
    setData({ ...data, education: data.education.map((item) => item.id === id ? { ...item, ...update } : item) });
  }

  function updateProject(id: string, update: Partial<Project>) {
    setData({ ...data, projects: data.projects.map((item) => item.id === id ? { ...item, ...update } : item) });
  }

  function updateCertification(id: string, update: Partial<Certification>) {
    setData({ ...data, certifications: data.certifications.map((item) => item.id === id ? { ...item, ...update } : item) });
  }

  function addExperience() {
    setData({ ...data, experiences: [...data.experiences, { id: makeId(), role: "", company: "", location: "", startDate: "", endDate: "", current: false, bullets: [""] }] });
  }

  function addEducation() {
    setData({ ...data, education: [...data.education, { id: makeId(), course: "", institution: "", location: "", startDate: "", endDate: "", status: "" }] });
  }

  function addProject() {
    setData({ ...data, projects: [...data.projects, { id: makeId(), title: "", description: "", link: "" }] });
  }

  function addCertification() {
    setData({ ...data, certifications: [...data.certifications, { id: makeId(), name: "", issuer: "", date: "" }] });
  }

  function saveVersion() {
    const createdAt = new Date();
    const version: SavedResumeVersion = {
      id: makeId(),
      label: `${data.profile.headline || "Currículo"} · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(createdAt)}`,
      data: structuredClone(data),
      templateId,
      updatedAt: createdAt.toISOString(),
    };
    const next = [version, ...versions].slice(0, 10);
    try {
      localStorage.setItem(user ? `${VERSION_KEY}.${user.id}` : VERSION_KEY, JSON.stringify(next));
      setVersions(next);
      onToast("Versão guardada neste dispositivo.");
    } catch { onToast("Não foi possível guardar outra versão neste navegador."); }
  }

  function restoreVersion(version: SavedResumeVersion) {
    setData(structuredClone(version.data));
    setTemplateId(version.templateId);
    onToast("Versão restaurada. O rascunho atual foi atualizado.");
  }

  function fillExample() {
    setData(structuredClone(exampleResume));
    onToast("Exemplo carregado. Edite os dados para criar seu próprio currículo.");
  }

  function clearDraft() {
    if (!window.confirm("Apagar o rascunho salvo neste dispositivo?")) return;
    setData(structuredClone(emptyResume));
    setTemplateId("ats-classico");
    localStorage.removeItem(user ? `${DRAFT_KEY}.${user.id}` : DRAFT_KEY);
    onToast("Rascunho apagado deste dispositivo.");
  }

  const tabs: { id: EditorSection; label: string; icon: IconName }[] = [
    { id: "profile", label: "Seus dados", icon: "file" },
    { id: "summary", label: "Resumo", icon: "sparkle" },
    { id: "experience", label: "Experiência", icon: "briefcase" },
    { id: "education", label: "Formação", icon: "cap" },
    { id: "projects", label: "Projetos", icon: "arrow" },
    { id: "certifications", label: "Cursos", icon: "cap" },
    { id: "skills", label: "Competências", icon: "check" },
    { id: "review", label: "Revisão ATS", icon: "sparkle" },
  ];

  const completedBySection: Record<EditorSection, boolean> = {
    profile: Boolean(data.profile.name && (data.profile.email || data.profile.phone)),
    summary: Boolean(data.summary.trim()),
    experience: data.experiences.length > 0,
    education: data.education.length > 0,
    projects: data.projects.length > 0,
    certifications: data.certifications.length > 0,
    skills: data.skills.length > 0,
    review: reviewChecks.every((check) => check.ok),
    template: true,
  };

  const printContent = printRoot ? createPortal(<ResumePreview template={selectedTemplate} data={data} color={appearanceColor} />, printRoot) : null;

  return (
    <main className="editor-page">
      {printContent}
      <header className="editor-topbar no-print">
        <button className="brand-link brand-button" onClick={onBack}><Brand /></button>
        <div className="editor-breadcrumb"><button onClick={onBack}>Início</button><span>/</span><strong>Criar currículo</strong></div>
        <div className="topbar-actions"><span className="saved-label"><span className="saved-dot" /> Salvo neste dispositivo</span><button className="button button-small button-primary" onClick={() => window.print()}><Icon name="download" size={16} /> Salvar em PDF</button></div>
      </header>

      <div className="builder-title no-print"><div><div className="eyebrow eyebrow-muted">CRIADOR DE CURRÍCULO</div><h1>Conte sua <em>história.</em></h1><p>Preencha no seu ritmo. Você pode revisar tudo antes de salvar.</p></div><div className="builder-title-actions"><button className="button button-quiet" onClick={() => setSection('template')}>Escolher modelo</button><button className="button button-quiet" onClick={fillExample}>Ver um exemplo</button><button className="button button-quiet" onClick={saveVersion}>Guardar versão</button><details className="version-history"><summary>Versões {versions.length ? `(${versions.length})` : ""}</summary><div>{versions.length ? versions.map((version) => <button key={version.id} onClick={() => restoreVersion(version)}><span>{version.label}</span><small>Restaurar</small></button>) : <p>Nenhuma versão guardada ainda.</p>}</div></details><button className="button button-quiet button-danger-quiet" onClick={clearDraft}>Apagar rascunho</button></div></div>

      <ResumeAccountTools data={data} templateId={templateId} setData={setData} setTemplateId={setTemplateId} />
      <div className="editor-main">
        <aside className="editor-sidebar no-print">
          <div className="progress-card"><div className="progress-copy"><span>Seu currículo</span><strong>{completeness}%</strong></div><div className="progress-track"><span style={{ width: `${completeness}%` }} /></div><small>Complete os itens para deixar seu perfil mais claro.</small></div>
          <nav className="editor-steps" aria-label="Etapas do currículo">
            {tabs.map((tab, index) => <button key={tab.id} className={`editor-step${section === tab.id ? " is-active" : ""}`} onClick={() => setSection(tab.id)}><span className="step-icon-small"><Icon name={tab.icon} size={15} /></span><span><small>{String(index + 1).padStart(2, "0")}</small><b>{tab.label}</b></span>{completedBySection[tab.id] && <span className="step-done">✓</span>}</button>)}
            <button className={`editor-step${section === "template" ? " is-active" : ""}`} onClick={() => setSection("template")}><span className="step-icon-small"><span className="palette-dot" /></span><span><small>{String(tabs.length + 1).padStart(2, "0")}</small><b>Modelo visual</b></span></button>
          </nav>
          <div className="privacy-card"><span><Icon name="lock" size={15} /></span><div><b>Seu currículo é privado</b><p>O rascunho fica neste dispositivo. Use os controles acima para salvar também na sua conta.</p></div></div>
          <button className="sidebar-guide" onClick={onGuide}><span>Precisa de uma dica?</span><b>Ver guias de carreira <Icon name="arrow" size={14} /></b></button>
        </aside>

        <section className="editor-form-panel no-print" aria-live="polite">
          <div className="mobile-progress"><span>SEU CURRÍCULO · {completeness}%</span><div className="progress-track"><span style={{ width: `${completeness}%` }} /></div></div>
          {section === "profile" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">PRIMEIRO, O ESSENCIAL</div><h2>Como podemos te <em>chamar?</em></h2><p>Use as informações que você gostaria de compartilhar com uma empresa.</p></div>
            <div className="form-grid">
              <Field label="Nome completo" value={data.profile.name} onChange={(value) => updateProfile("name", value)} placeholder="Ex.: Ana Silva" required />
              <Field label="Cargo ou área desejada" value={data.profile.headline} onChange={(value) => updateProfile("headline", value)} placeholder="Ex.: Assistente administrativa" required />
              <Field label="E-mail" type="email" value={data.profile.email} onChange={(value) => updateProfile("email", value)} placeholder="voce@email.com" />
              <Field label="Telefone" value={data.profile.phone} onChange={(value) => updateProfile("phone", value)} placeholder="(11) 99999-9999" />
              <Field label="Cidade e estado" value={data.profile.location} onChange={(value) => updateProfile("location", value)} placeholder="Ex.: São Paulo, SP" />
              <Field label="LinkedIn ou portfólio" value={data.profile.website} onChange={(value) => updateProfile("website", value)} placeholder="linkedin.com/in/seunome" />
            </div>
            <div className="form-tip"><span>i</span><p>Endereço completo, CPF, estado civil e foto não são necessários para começar.</p></div>
          </>}
          {section === "summary" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">UM RETRATO PROFISSIONAL</div><h2>Apresente-se em poucas <em>linhas.</em></h2><p>Conte no que você tem experiência, o que sabe fazer e que tipo de oportunidade procura.</p></div>
            <label className="field"><span>Resumo profissional <i>Recomendado</i></span><textarea rows={7} maxLength={700} value={data.summary} onChange={(event) => setData({ ...data, summary: event.target.value })} placeholder="Ex.: Profissional organizada, com experiência em atendimento e rotinas administrativas. Gosto de colaborar com equipes e aprender processos novos." /><small className="field-foot"><span>Uma apresentação honesta e simples já é um bom começo.</span><span>{data.summary.length}/700</span></small></label>
            <div className="resume-ai-placeholder" role="note"><span><Icon name="sparkle" size={15} /></span><p>{user?.email_verified_at ? <><b>Organização opcional com IA</b><small>Você pode usar “Criar com ajuda da IA do Conecta Vagas” na área da sua conta e revisar cada seção antes de aplicar.</small></> : <><b>Ajuda com IA disponível para contas confirmadas</b><small><a href={user ? '/verificar-email' : `/login?returnTo=${encodeURIComponent('/editor')}`}>{user ? 'Confirme seu e-mail' : 'Entre ou crie sua conta'}</a> para desbloquear. O editor manual permanece disponível.</small></>}</p></div>
            <div className="example-box"><div className="example-box-title"><span><Icon name="sparkle" size={16} /></span><b>Uma dica para começar</b></div><p>Você pode incluir sua área, experiências ou estudos relevantes e o tipo de vaga que procura. Escreva com suas palavras; depois, revise a clareza.</p></div>
          </>}
          {section === "experience" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">SUA TRAJETÓRIA</div><h2>O que você já <em>fez?</em></h2><p>Trabalho formal, informal, voluntariado e projetos também contam.</p></div>
            {data.experiences.map((item, index) => <div className="repeat-card" key={item.id}><div className="repeat-heading"><b>Experiência {String(index + 1).padStart(2, "0")}</b><button className="icon-button delete-button" aria-label="Remover experiência" onClick={() => setData({ ...data, experiences: data.experiences.filter((experience) => experience.id !== item.id) })}><Icon name="trash" size={16} /></button></div><div className="form-grid"><Field label="Cargo ou atividade" value={item.role} onChange={(value) => updateExperience(item.id, { role: value })} placeholder="Ex.: Atendente" /><Field label="Empresa ou projeto" value={item.company} onChange={(value) => updateExperience(item.id, { company: value })} placeholder="Nome da empresa" /><Field label="Cidade" value={item.location} onChange={(value) => updateExperience(item.id, { location: value })} placeholder="Cidade, UF" /><div className="date-fields"><Field label="Início" type="month" value={item.startDate} onChange={(value) => updateExperience(item.id, { startDate: value })} /><Field label="Fim" type="month" value={item.endDate} onChange={(value) => updateExperience(item.id, { endDate: value })} disabled={item.current} /></div></div><label className="check-field"><input type="checkbox" checked={item.current} onChange={(event) => updateExperience(item.id, { current: event.target.checked, endDate: event.target.checked ? "" : item.endDate })} /> Trabalho aqui atualmente</label><Field label="O que você fazia?" as="textarea" value={item.bullets.join("\n")} onChange={(value) => updateExperience(item.id, { bullets: value.split("\n").slice(0, 6) })} placeholder="Uma atividade por linha. Ex.: Atendia clientes por telefone e e-mail." helper="Prefira frases curtas e verdadeiras; não precisa colocar números que você não conhece." /></div>)}
            <button className="add-row-button" onClick={addExperience}><span><Icon name="plus" size={17} /></span> Adicionar experiência</button>
            {data.experiences.length === 0 && <div className="empty-hint"><b>Ainda não teve um emprego formal?</b><p>Você pode incluir trabalho informal, voluntariado, projetos pessoais ou atividades escolares. Ou seguir sem preencher esta etapa.</p></div>}
          </>}
          {section === "education" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">ESTUDOS E APRENDIZADO</div><h2>Sua <em>formação.</em></h2><p>Inclua escolas, cursos técnicos, faculdade e formações que façam sentido para a vaga.</p></div>
            {data.education.map((item, index) => <div className="repeat-card" key={item.id}><div className="repeat-heading"><b>Formação {String(index + 1).padStart(2, "0")}</b><button className="icon-button delete-button" aria-label="Remover formação" onClick={() => setData({ ...data, education: data.education.filter((education) => education.id !== item.id) })}><Icon name="trash" size={16} /></button></div><div className="form-grid"><Field label="Curso ou formação" value={item.course} onChange={(value) => updateEducation(item.id, { course: value })} placeholder="Ex.: Técnico em Administração" /><Field label="Instituição" value={item.institution} onChange={(value) => updateEducation(item.id, { institution: value })} placeholder="Escola, faculdade ou plataforma" /><Field label="Cidade" value={item.location} onChange={(value) => updateEducation(item.id, { location: value })} placeholder="Cidade, UF" /><Field label="Status" value={item.status} onChange={(value) => updateEducation(item.id, { status: value })} placeholder="Concluído, cursando..." /><div className="date-fields"><Field label="Início" type="month" value={item.startDate} onChange={(value) => updateEducation(item.id, { startDate: value })} /><Field label="Conclusão" type="month" value={item.endDate} onChange={(value) => updateEducation(item.id, { endDate: value })} /></div></div></div>)}
            <button className="add-row-button" onClick={addEducation}><span><Icon name="plus" size={17} /></span> Adicionar formação</button>
          </>}
          {section === "projects" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">PROJETOS E ATIVIDADES</div><h2>Mostre o que você <em>construiu.</em></h2><p>Projetos pessoais, acadêmicos, voluntariado e iniciativas comunitárias podem mostrar suas habilidades.</p></div>
            {data.projects.map((item, index) => <div className="repeat-card" key={item.id}><div className="repeat-heading"><b>Projeto {String(index + 1).padStart(2, "0")}</b><button className="icon-button delete-button" aria-label="Remover projeto" onClick={() => setData({ ...data, projects: data.projects.filter((project) => project.id !== item.id) })}><Icon name="trash" size={16} /></button></div><Field label="Nome do projeto" value={item.title} onChange={(value) => updateProject(item.id, { title: value })} placeholder="Ex.: Feira de ciências da escola" /><div className="field-spacer" /><Field label="O que você fez ou aprendeu?" as="textarea" value={item.description} onChange={(value) => updateProject(item.id, { description: value })} placeholder="Descreva sua contribuição e o resultado observado, sem inventar números." /><div className="field-spacer" /><Field label="Link (opcional)" value={item.link} onChange={(value) => updateProject(item.id, { link: value })} placeholder="https://..." /></div>)}
            <button className="add-row-button" onClick={addProject}><span><Icon name="plus" size={17} /></span> Adicionar projeto ou atividade</button>
            {data.projects.length === 0 && <div className="empty-hint"><b>Não precisa ter um projeto formal.</b><p>Uma atividade escolar, ajudar em um negócio da família ou organizar uma iniciativa também pode ser relevante.</p></div>}
          </>}
          {section === "certifications" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">CURSOS COMPLEMENTARES</div><h2>O que mais você <em>aprendeu?</em></h2><p>Inclua cursos livres, certificações e formações curtas relevantes para a oportunidade.</p></div>
            {data.certifications.map((item, index) => <div className="repeat-card" key={item.id}><div className="repeat-heading"><b>Curso {String(index + 1).padStart(2, "0")}</b><button className="icon-button delete-button" aria-label="Remover curso" onClick={() => setData({ ...data, certifications: data.certifications.filter((course) => course.id !== item.id) })}><Icon name="trash" size={16} /></button></div><Field label="Curso ou certificação" value={item.name} onChange={(value) => updateCertification(item.id, { name: value })} placeholder="Ex.: Excel para rotinas administrativas" /><div className="field-spacer" /><div className="form-grid"><Field label="Instituição" value={item.issuer} onChange={(value) => updateCertification(item.id, { issuer: value })} placeholder="Nome da instituição" /><Field label="Mês e ano (opcional)" type="month" value={item.date} onChange={(value) => updateCertification(item.id, { date: value })} /></div></div>)}
            <button className="add-row-button" onClick={addCertification}><span><Icon name="plus" size={17} /></span> Adicionar curso ou certificação</button>
          </>}
          {section === "skills" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">O QUE VOCÊ SABE FAZER</div><h2>Suas <em>competências.</em></h2><p>Pense em conhecimentos técnicos e habilidades que você usa no dia a dia.</p></div>
            <TagEditor label="Competências" values={data.skills} onChange={(skills) => setData({ ...data, skills })} placeholder="Ex.: organização" helper="Digite uma competência e pressione Enter ou vírgula para adicionar." />
            <div className="field-spacer" />
            <TagEditor label="Idiomas" values={data.languages} onChange={(languages) => setData({ ...data, languages })} placeholder="Ex.: Inglês — intermediário" helper="Se quiser, indique seu nível de conversação." />
            <div className="example-box"><div className="example-box-title"><span><Icon name="check" size={16} /></span><b>O que conta como competência?</b></div><p>Ferramentas que conhece, idiomas, organização, comunicação, atendimento, trabalho em equipe e conhecimentos específicos da sua área.</p></div>
          </>}
          {section === "review" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">REVISÃO ANTES DE ENVIAR</div><h2>Confira a <em>clareza.</em></h2><p>Esta lista aponta itens para revisar; não prevê aprovação em ATS nem substitui a leitura da vaga.</p></div>
            <div className="ats-review-list">{reviewChecks.map((check) => <article className={check.ok ? "ats-check is-ok" : "ats-check is-review"} key={check.title}><span>{check.ok ? "✓" : "!"}</span><div><b>{check.title}</b><p>{check.detail}</p></div></article>)}</div>
            <label className="field job-description-field"><span>Descrição da vaga <i>Opcional</i></span><textarea rows={6} maxLength={4000} value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Cole a descrição da oportunidade para comparar termos importantes. Ela será analisada somente no seu navegador." /><small className="field-help">Comparação local de palavras-chave; não é uma nota de compatibilidade nem uma garantia de resultado.</small></label>
            {jobDescription.trim() && <div className="keyword-match-panel"><b>Termos para conferir na sua trajetória</b><p>Inclua apenas os que correspondem à sua experiência real.</p><div className="keyword-match-row"><strong>Encontrados no currículo</strong>{keywordMatch.matched.length ? <div>{keywordMatch.matched.map((word) => <span className="keyword-chip keyword-present" key={word}>{word}</span>)}</div> : <small>Nenhum termo identificado ainda.</small>}</div><div className="keyword-match-row"><strong>Não identificados</strong>{keywordMatch.missing.length ? <div>{keywordMatch.missing.map((word) => <span className="keyword-chip" key={word}>{word}</span>)}</div> : <small>Todos os termos analisados aparecem no currículo.</small>}</div></div>}
            <div className="form-tip"><span>i</span><p>A ferramenta compara texto no próprio navegador. Não insere palavras-chave automaticamente; só inclua o que for verdadeiro para você.</p></div>
            <button className="button button-quiet cover-letter-launch" onClick={onLetter}>Criar carta de apresentação <Icon name="arrow" size={15} /></button>
          </>}
          {section === "template" && <>
            <div className="form-heading"><div className="eyebrow eyebrow-muted">ESCOLHA A APRESENTAÇÃO</div><h2>Um modelo com a sua <em>cara.</em></h2><p>Os dados que preencheu continuam os mesmos quando você troca de modelo.</p></div>
            <TemplateCatalog selectedId={templateId} accentColor={data.accentColor} onSelect={id => { if (!data.accentColor && templateId.startsWith('editorial-')) setData({ ...data, accentColor: appearanceColor }); setTemplateId(id); }} onColorChange={color => setData({ ...data, accentColor: color })} />
            <div className="form-tip"><span>i</span><p>Os modelos são criados em HTML e CSS e o PDF é salvo pelo navegador. Prefira os modelos ATS para candidatura em plataformas digitais.</p></div>
          </>}

          <div className="form-footer"><button className="button button-quiet" onClick={() => { const index = sectionOrder.indexOf(section); setSection(sectionOrder[Math.max(0, index - 1)]!); }}>{section === "profile" ? "Voltar ao início" : "Etapa anterior"}</button><button className="button button-primary" onClick={() => { const index = sectionOrder.indexOf(section); setSection(sectionOrder[Math.min(sectionOrder.length - 1, index + 1)]!); }}>{section === "template" ? "Revisar currículo" : "Continuar"} <Icon name="arrow" size={16} /></button></div>
        </section>

        <section className="resume-stage" aria-label="Prévia do currículo">
          <div className="preview-toolbar no-print"><div><span className="preview-live-dot" /> PRÉVIA AO VIVO</div><button className="preview-expand" onClick={() => window.print()} title="Abrir impressão e salvar em PDF"><Icon name="print" size={15} /> PDF</button></div>
          <div className="resume-paper-wrap"><div className={`resume-paper${hasPreviewContent ? '' : ' is-empty'}`}><ResumePreview template={selectedTemplate} data={data} color={appearanceColor} />{!hasPreviewContent && <div className="resume-preview-empty no-print"><span><Icon name="fileEdit" size={24} /></span><h3>Sua prévia começa aqui</h3><p>Preencha seu nome e a área desejada para ver o currículo ganhar forma em tempo real.</p></div>}</div></div>
          <div className="preview-foot no-print"><div className="checklist-title"><span>ANTES DE ENVIAR</span><span>{checklist.filter(([complete]) => complete).length}/{checklist.length}</span></div><ul>{checklist.map(([complete, label]) => <li key={label} className={complete ? "is-complete" : ""}><span>{complete ? "✓" : "·"}</span>{label}</li>)}</ul><p>Uma checklist de clareza, não uma promessa de aprovação.</p></div>
        </section>
      </div>
      <footer className="editor-footer no-print"><Brand /><span>Seu rascunho fica neste dispositivo.</span><span className="editor-footer-date">{data.profile.name ? `${data.profile.name}${data.profile.headline ? ` · ${data.profile.headline}` : ""}` : "Novo currículo"}</span></footer>
    </main>
  );
}

function TagEditor({ label, values, onChange, placeholder, helper }: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder: string; helper: string }) {
  const [input, setInput] = useState("");
  function add(value: string) {
    const next = value.trim().replace(/,$/, "");
    if (next && !values.some((item) => item.toLocaleLowerCase() === next.toLocaleLowerCase())) onChange([...values, next]);
    setInput("");
  }
  return <div className="tag-editor"><label className="field"><span>{label}</span><div className="tag-input-shell"><div className="tag-list">{values.map((value) => <span className="skill-tag" key={value}>{value}<button type="button" aria-label={`Remover ${value}`} onClick={() => onChange(values.filter((item) => item !== value))}>×</button></span>)}<input value={input} placeholder={values.length ? "Adicionar outro..." : placeholder} onChange={(event) => { const value = event.target.value; if (value.includes(",")) add(value); else setInput(value); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(input); } if (event.key === "Backspace" && !input && values.length) onChange(values.slice(0, -1)); }} onBlur={() => { if (input.trim()) add(input); }} /></div></div><small className="field-help">{helper}</small></label></div>;
}
