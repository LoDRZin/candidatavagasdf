import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { PrivacyDetails } from "./platform/PrivacyDetails";
import { useAuth } from "./platform/Auth";
import { RouteSkeleton } from "./platform/RouteState";
import { useAdminAccess } from "./platform/AdminAccess";
import { requiresAdminPage, requiresUserPage } from "../shared/access-policy";
import { go } from "./platform/api";
import { createPortal } from "react-dom";
import { Icon } from "./components/Icon";
import { Brand } from "./components/Brand";
import { ResumeDemo } from "./components/ResumeDemo";
import { Field } from "./components/Field";
import { isTemplateId } from "../shared/templateCatalog";
import { emptyResume } from "./data/defaultResume";
import { openAiChat } from "./lib/aiChatHandoff";
import Dashboard from "./platform/Dashboard";
import type { ResumeData, SavedDraft, TemplateId } from "./types";

const DRAFT_KEY = "conectavagasdf.resume.draft.v1";
type PageName = "home" | "dashboard" | "editor" | "interviews" | "learning" | "mentor" | "admin" | "letter" | "privacy";
const EditorPage = lazy(() => import('./editor/EditorPage').then(module => ({ default: module.EditorPage })));

const INTERVIEW_QUESTIONS = [
  "Pode me contar um pouco sobre você?",
  "Por que esta vaga chamou sua atenção?",
  "Conte sobre um desafio que você conseguiu resolver.",
  "Qual habilidade você gostaria de desenvolver?",
];

const GUIDES = [
  {
    id: "resume",
    category: "CURRÍCULO",
    title: "Um currículo claro conta melhor a sua história",
    summary: "Como organizar as informações para que a pessoa recrutadora encontre o essencial.",
    steps: [
      ["Comece pelo que importa", "Coloque nome, contato e área desejada em destaque. Use uma cidade e um e-mail profissional; endereço completo e documentos pessoais não são necessários."],
      ["Mostre o que você fez", "Em cada experiência, descreva responsabilidades e resultados com verbos concretos. Se não tiver números, explique o contexto, a ação e o que melhorou."],
      ["Inclua experiências diversas", "Projetos, trabalhos voluntários, atividades autônomas e trabalhos informais também podem demonstrar responsabilidade e habilidades relevantes."],
      ["Revise para cada vaga", "Compare os requisitos da vaga com sua trajetória e dê destaque às experiências verdadeiras mais relacionadas. Não invente qualificações."],
    ],
  },
  {
    id: "interview",
    category: "ENTREVISTAS",
    title: "Como responder “fale sobre você”",
    summary: "Uma forma simples de apresentar seu momento profissional sem decorar um discurso.",
    steps: [
      ["Diga onde está", "Comece pela sua área, formação ou experiência mais relevante para a oportunidade."],
      ["Escolha um exemplo", "Conte brevemente uma tarefa, projeto ou responsabilidade que mostre uma habilidade útil para a vaga."],
      ["Conecte com o próximo passo", "Explique por que essa oportunidade combina com o que você busca desenvolver. Mantenha o foco profissional e fale com naturalidade."],
      ["Pratique, sem decorar", "Anote três ideias-chave e ensaie em voz alta. Uma resposta curta e autêntica costuma funcionar melhor que um texto memorizado."],
    ],
  },
  {
    id: "first-job",
    category: "PRIMEIRO EMPREGO",
    title: "Como apresentar sua experiência mesmo no início da carreira",
    summary: "Você pode mostrar iniciativa e aprendizagem mesmo sem um histórico de empregos formais.",
    steps: [
      ["Mapeie atividades reais", "Considere escola, cursos, cuidado familiar, voluntariado, projetos pessoais e trabalhos informais."],
      ["Identifique o que você fez", "Explique sua contribuição e as habilidades que usou. Não transforme participação em liderança se esse não foi o seu papel."],
      ["Dê contexto", "Uma frase sobre o objetivo do projeto e outra sobre sua ação ajudam a pessoa recrutadora a entender por que aquilo importa."],
      ["Mostre disposição para aprender", "Conecte sua experiência ao que a vaga pede, sem afirmar que já domina algo que ainda está aprendendo."],
    ],
  },
  {
    id: "search",
    category: "BUSCA DE VAGAS",
    title: "Organize sua busca de trabalho em passos pequenos",
    summary: "Uma rotina leve ajuda a acompanhar oportunidades sem transformar a procura em um trabalho sem fim.",
    steps: [
      ["Defina um foco inicial", "Escolha alguns cargos ou áreas compatíveis com suas habilidades e com o que deseja aprender."],
      ["Use fontes variadas", "Consulte páginas de empresas, plataformas de emprego, redes profissionais e indicações de pessoas de confiança. Desconfie de pedidos de pagamento para participar de seleções."],
      ["Acompanhe candidaturas", "Anote empresa, vaga, data, etapa e próximo contato. Assim você retoma cada processo sem depender da memória."],
      ["Reserve um tempo possível", "Uma meta pequena e sustentável — como revisar algumas vagas em determinados dias — é melhor do que uma rotina impossível de manter."],
    ],
  },
  {
    id: "networking",
    category: "RELAÇÕES PROFISSIONAIS",
    title: "Como iniciar uma conversa profissional",
    summary: "Aproxime-se de pessoas e peça orientação com respeito ao tempo e aos limites de cada uma.",
    steps: [
      ["Seja específico", "Diga quem você é e o motivo do contato. Uma mensagem curta e contextualizada é mais fácil de responder."],
      ["Peça algo possível", "Em vez de pedir uma vaga diretamente, pergunte sobre a experiência da pessoa, a área ou um conselho para começar."],
      ["Respeite o tempo", "A pessoa pode não conseguir responder. Se fizer sentido, envie um único lembrete educado depois de alguns dias e siga em frente."],
      ["Agradeça e mantenha contato", "Agradeça a conversa sem criar obrigação. Relacionamentos profissionais crescem com troca genuína, não só quando você precisa de algo."],
    ],
  },
];

function readLocalValue(key: string) {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function readDraft(userId?: string): SavedDraft | null {
  try {
    const value = localStorage.getItem(userId ? `${DRAFT_KEY}.${userId}` : DRAFT_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as SavedDraft;
    if (!parsed.data?.profile || !isTemplateId(parsed.templateId)) return null;
    parsed.data.projects ??= [];
    parsed.data.certifications ??= [];
    return parsed;
  } catch {
    return null;
  }
}
function App() {
  const { user } = useAuth();
  const { authenticated: adminAuthenticated } = useAdminAccess();
  const [page, setPage] = useState<PageName>(() => {
    if (window.location.pathname.startsWith("/dashboard")) return "dashboard";
    if (window.location.pathname.startsWith("/entrevistas")) return "interviews";
    if (window.location.pathname.startsWith("/aprender")) return "learning";
    if (window.location.pathname.startsWith("/orientacao")) return "mentor";
    if (window.location.pathname.startsWith("/admin")) return "admin";
    if (window.location.pathname.startsWith("/carta")) return "letter";
    if (window.location.pathname.startsWith("/privacidade")) return "privacy";
    return window.location.pathname.startsWith("/editor") || window.location.pathname.startsWith("/curriculo") ? "editor" : "home";
  });
  const [toast, setToast] = useState("");
  const [draft] = useState(() => user ? readDraft(user.id) : null);
  const [data, setData] = useState<ResumeData>(() => draft?.data ?? structuredClone(emptyResume));
  const [templateId, setTemplateId] = useState<TemplateId>(() => draft?.templateId ?? "ats-classico");

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setPage(path.startsWith("/dashboard") ? "dashboard" : path.startsWith("/entrevistas") ? "interviews" : path.startsWith("/aprender") ? "learning" : path.startsWith("/orientacao") ? "mentor" : path.startsWith("/admin") ? "admin" : path.startsWith("/carta") ? "letter" : path.startsWith("/privacidade") ? "privacy" : path.startsWith("/editor") || path.startsWith("/curriculo") ? "editor" : "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (page !== "editor") return;
    try {
      localStorage.setItem(user ? `${DRAFT_KEY}.${user.id}` : DRAFT_KEY, JSON.stringify({ data, templateId, updatedAt: new Date().toISOString() } satisfies SavedDraft));
    } catch {
      setToast("O navegador não conseguiu salvar este rascunho localmente.");
    }
  }, [data, templateId, page]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function navigate(next: PageName, scroll = true) {
    const path = next === "dashboard" ? "/dashboard" : next === "editor" ? "/editor" : next === "interviews" ? "/entrevistas" : next === "learning" ? "/aprender" : next === "mentor" ? "/orientacao" : next === "admin" ? "/admin" : next === "letter" ? "/carta" : next === "privacy" ? "/privacidade" : "/";
    if (requiresAdminPage(path) && !adminAuthenticated) { go(`/acesso-admin?returnTo=${encodeURIComponent(path)}`); return; }
    if (requiresUserPage(path) && !user) { go(`/login?returnTo=${encodeURIComponent(path)}`); return; }
    if (next === "admin") { window.location.assign(path); return; }
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setPage(next);
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearLocalData() {
    if (!user) { go('/login?returnTo=%2Fdashboard'); return; }
    if (!window.confirm("Apagar todos os dados da conectavagasdf salvos neste navegador? Essa ação não pode ser desfeita.")) return;
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith("conectavagasdf.") || key.startsWith("passo.")) localStorage.removeItem(key);
    } catch {
      setToast("O navegador não permitiu apagar os dados locais. Você pode limpá-los nas configurações do navegador.");
      return;
    }
    setData(structuredClone(emptyResume));
    setTemplateId("ats-classico");
    setToast("Dados da conectavagasdf removidos deste navegador.");
    navigate("home");
  }

  return (
    <div className="app-root">
      {!requiresUserPage(window.location.pathname) && <AppHeader page={page} user={user} onNavigate={navigate} />}
      {page === "home" && <HomePage onNavigate={navigate} />}
      {page === "dashboard" && <Dashboard userName={user?.name} />}
      {page === "editor" && <Suspense fallback={<RouteSkeleton />}><EditorPage data={data} setData={setData} templateId={templateId} setTemplateId={setTemplateId} onBack={() => navigate("dashboard")} onGuide={() => navigate("learning")} onLetter={() => navigate("letter")} onToast={setToast} /></Suspense>}
      {page === "interviews" && <InterviewPage />}
      {page === "learning" && <LearningPage onInterview={() => navigate("interviews")} />}
      {page === "mentor" && <MentorPage onLearning={() => navigate("learning")} onInterview={() => navigate("interviews")} />}
      {page === "admin" && <AdminPage />}
      {page === "letter" && <CoverLetterPage data={data} />}
      {page === "privacy" && <PrivacyPage onClear={clearLocalData} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function AppHeader({ page, user, onNavigate }: { page: PageName; user: ReturnType<typeof useAuth>['user']; onNavigate: (page: PageName, scroll?: boolean) => void }) {
  const curriculumActive = page === 'dashboard' || page === 'editor';
  const link = (href: string, label: string, active = false, target?: PageName) => <a href={href} aria-current={active ? 'page' : undefined} onClick={event => { event.preventDefault(); if (target) onNavigate(target); else go(href); }}>{label}</a>;
  return <header className="site-header app-site-header">
    <a className="brand-link" href="/" onClick={event => { event.preventDefault(); onNavigate('home'); }}><Brand /></a>
    {user && <nav className="desktop-nav app-nav" aria-label="Navegação principal">
      {link('/dashboard', 'Currículo', curriculumActive, 'dashboard')}
      {link('/aprender', 'Aprender', page === 'learning', 'learning')}
      {link('/entrevistas', 'Entrevistas', page === 'interviews', 'interviews')}
      {link('/orientacao', 'Orientação', page === 'mentor', 'mentor')}
      {link('/cursos', 'Cursos')}
    </nav>}
    <div className="app-nav-actions">
      {user ? link('/conta', user.name) : <>{link('/login', 'Entrar')}<a className="account-signup-link" href="/cadastro" onClick={event => { event.preventDefault(); go('/cadastro'); }}>Criar conta</a></>}
      <a className="button button-small button-primary app-nav-cta" href="/dashboard" onClick={event => { event.preventDefault(); if (user) onNavigate('dashboard'); else go('/login?returnTo=%2Fdashboard'); }}>{user || curriculumActive ? 'Meu currículo' : 'Acessar criador de currículo'} <Icon name="arrow" size={14} /></a>
    </div>
  </header>;
}

function HomePage({ onNavigate }: { onNavigate: (page: PageName, scroll?: boolean) => void }) {
  const { user } = useAuth();
  const openCurriculum = (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); if (user) onNavigate('dashboard'); else go('/login?returnTo=%2Fdashboard'); };
  const curriculumCta = (className: string) => <a className={`button ${className}`} href="/dashboard" onClick={openCurriculum}>Acessar criador de currículo <Icon name="arrow" /></a>;
  return (
    <>
      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> UM PASSO DE CADA VEZ</div>
            <h1>Está procurando emprego? <em>Vamos dar o próximo passo.</em></h1>
            <p className="hero-description">Conheça ferramentas para montar um currículo profissional, preparar entrevistas e organizar sua busca por vagas — mesmo sem experiência.</p>
            <div className="hero-actions">
              {curriculumCta('button-primary')}
              <a className="text-link" href="/aprender" onClick={(event) => { event.preventDefault(); onNavigate("learning"); }}>Quero aprender primeiro <span>→</span></a>
            </div>
            <div className="hero-note"><span className="privacy-dot"><Icon name="lock" size={15} /></span><span>{user ? 'Seu espaço fica salvo na sua conta.' : 'Entre para salvar seu currículo e seu progresso.'} <a href="/privacidade" onClick={(event) => { event.preventDefault(); onNavigate("privacy"); }}>Saiba como seus dados são usados.</a></span></div>
          </div>
          <ResumeDemo />
          <div className="hero-scroll" aria-hidden="true">ROLE PARA DESCOBRIR <span>↓</span></div>
        </section>

        <section className="tools-section content-width" id="ferramentas">
          <div className="section-heading"><div><div className="eyebrow eyebrow-muted">FERRAMENTAS PARA AVANÇAR</div><h2>O que você precisa,<br /><em>no seu momento.</em></h2></div><p>Sem complicar. Escolha por onde começar e siga do seu jeito.</p></div>
          <div className="tool-grid">
            <a className="tool-card tool-card-featured" href="/dashboard" onClick={openCurriculum}>
              <span className="tool-number">CURRÍCULO</span><span className="tool-icon"><Icon name="file" size={21} /></span>
              <span className="tool-card-title">Monte seu currículo</span><span className="tool-card-copy">Organize sua trajetória em um modelo profissional e salve em PDF.</span>
              <span className="tool-card-link">Acessar criador de currículo <Icon name="arrow" size={15} /></span>
            </a>
            <a className="tool-card" href="/entrevistas" onClick={event => { event.preventDefault(); onNavigate("interviews"); }}>
              <span className="tool-number">ENTREVISTAS</span><span className="tool-icon"><Icon name="briefcase" size={21} /></span>
              <span className="tool-card-title">Treine para entrevistas</span><span className="tool-card-copy">Entenda perguntas comuns, prepare exemplos e pratique com calma.</span>
              <span className="tool-card-link">Ver guia <Icon name="arrow" size={15} /></span>
            </a>
            <a className="tool-card tool-card-linklike" href="/aprender" onClick={event => { event.preventDefault(); onNavigate("learning"); }}>
              <span className="tool-number">CONTEÚDOS</span><span className="tool-icon"><Icon name="cap" size={21} /></span>
              <span className="tool-card-title">Aprenda no seu tempo</span><span className="tool-card-copy">Guias diretos para encontrar vagas, conversar com recrutadores e crescer.</span>
              <span className="tool-card-link">Explorar conteúdos <Icon name="arrow" size={15} /></span>
            </a>
          </div>
        </section>

        <section className="steps-section" id="conteudos">
          <div className="steps-inner content-width">
            <div className="steps-copy"><div className="eyebrow eyebrow-on-dark">DO SEU JEITO, NO SEU TEMPO</div><h2>Pequenos passos.<br /><em>Novas possibilidades.</em></h2><p>Você não precisa resolver tudo hoje. Comece com o que está ao seu alcance.</p>{curriculumCta('button-paper')}</div>
            <div className="steps-list">
              <div className="step-row"><span className="step-count">01</span><span className="step-icon"><Icon name="file" /></span><div><b>Conte sua história</b><p>Adicione experiências, estudos e habilidades, do seu jeito.</p></div></div>
              <div className="step-row"><span className="step-count">02</span><span className="step-icon"><Icon name="sparkle" /></span><div><b>Prepare-se com confiança</b><p>Leia dicas práticas e ensaie antes da próxima entrevista.</p></div></div>
              <div className="step-row"><span className="step-count">03</span><span className="step-icon"><Icon name="arrow" /></span><div><b>Escolha seu próximo passo</b><p>Revise, ajuste e leve sua história para novas oportunidades.</p></div></div>
            </div>
          </div>
        </section>

        <section className="closing-section content-width"><div className="closing-mark">p.</div><div><div className="eyebrow eyebrow-muted">A PRÓXIMA ETAPA PODE COMEÇAR AGORA</div><h2>Seu caminho profissional<br />é <em>seu.</em></h2></div>{curriculumCta('button-primary')}</section>
      </main>
      <footer className="site-footer"><Brand /><span>Um apoio para o seu próximo passo.</span><span>Seus dados ficam com você.</span><small>© 2026 conectavagasdf</small></footer>
    </>
  );
}

function InterviewPage() {
  const { user } = useAuth();
  const canUseAi = Boolean(user?.email_verified_at);
  const [question, setQuestion] = useState(() => readLocalValue("conectavagasdf.interview.question.v1") || readLocalValue("passo.interview.question.v1") || INTERVIEW_QUESTIONS[0]!);
  const [answer, setAnswer] = useState(() => readLocalValue("conectavagasdf.interview.answer.v1") || readLocalValue("passo.interview.answer.v1"));
  const [shareForAi, setShareForAi] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("conectavagasdf.interview.question.v1", question);
      localStorage.setItem("conectavagasdf.interview.answer.v1", answer);
    } catch { /* O exercício continua utilizável mesmo se o navegador bloquear o armazenamento. */ }
  }, [question, answer]);

  return (
    <main className="resource-page zeno-workspace-page zeno-interview-page">
      <header className="resource-hero zeno-workspace-header"><div><div className="zeno-eyebrow">PREPARAÇÃO PARA ENTREVISTAS</div><h1>Chegue preparado,<br /><em>sem decorar respostas.</em></h1><p>Uma entrevista é uma conversa. Use este guia para organizar suas ideias e praticar no seu tempo — não existe uma resposta perfeita.</p></div><a className="button button-primary" href="#pratica">Praticar uma resposta <Icon name="arrow" /></a></header>

      <section className="resource-content interview-content">
        <div className="resource-column">
          <div className="resource-section-heading"><span className="resource-index">01</span><div><div className="eyebrow eyebrow-muted">ANTES DA CONVERSA</div><h2>Um pouco de preparo já ajuda.</h2></div></div>
          <div className="prep-list">
            <article><span>01</span><div><h3>Releia a vaga</h3><p>Marque duas ou três responsabilidades que você já fez ou gostaria de aprender.</p></div></article>
            <article><span>02</span><div><h3>Separe exemplos reais</h3><p>Pense em situações de trabalho, estudo, voluntariado ou projetos pessoais que mostrem suas habilidades.</p></div></article>
            <article><span>03</span><div><h3>Planeje a parte prática</h3><p>Confirme horário, endereço ou link, teste o áudio se for online e deixe suas perguntas anotadas.</p></div></article>
            <article><span>04</span><div><h3>Lembre-se: você também avalia</h3><p>Prepare uma pergunta sobre a equipe, a rotina ou as próximas etapas do processo.</p></div></article>
          </div>
          <div className="resource-section-heading questions-heading"><span className="resource-index">02</span><div><div className="eyebrow eyebrow-muted">PERGUNTAS COMUNS</div><h2>O que podem querer entender.</h2></div></div>
          <div className="question-list">
            <details><summary>“Pode me contar um pouco sobre você?”</summary><p>Escolha um resumo profissional curto: o que você faz ou estudou, uma experiência relevante e o que busca agora.</p></details>
            <details><summary>“Por que se interessou por esta vaga?”</summary><p>Conecte algo concreto da função ou da empresa a uma habilidade sua e ao próximo passo que procura.</p></details>
            <details><summary>“Conte sobre um desafio que enfrentou.”</summary><p>Explique a situação, o que precisava ser resolvido, o que você fez e o que aprendeu. Um exemplo simples e verdadeiro é suficiente.</p></details>
            <details><summary>“O que gostaria de desenvolver?”</summary><p>Fale de uma habilidade real que está trabalhando e do que já faz para avançar. Evite transformar a resposta em uma fraqueza inventada.</p></details>
          </div>
        </div>

        <aside className="interview-practice" id="pratica">
          <div className="practice-label"><span className="practice-live-dot" /> EXERCÍCIO PARTICULAR</div>
          <h2>Pratique com as suas palavras.</h2>
          <p>Escreva um rascunho sem se preocupar em acertar de primeira. Ele fica salvo apenas neste navegador.</p>
          <label className="field practice-select"><span>Escolha uma pergunta</span><select value={question} onChange={(event) => setQuestion(event.target.value)}>{INTERVIEW_QUESTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field practice-answer"><span>Sua resposta <i>rascunho</i></span><textarea value={answer} maxLength={1800} onChange={(event) => setAnswer(event.target.value)} placeholder="Comece contando o contexto e o que você fez…" rows={7} /></label>
          {canUseAi ? <label className="practice-ai-consent"><input type="checkbox" checked={shareForAi} onChange={(event) => setShareForAi(event.target.checked)} /><span>Autorizo enviar esta resposta e a pergunta selecionada ao provedor de IA. <a href="/privacidade">Aviso de privacidade</a>.</span></label> : <div className="practice-privacy"><Icon name="lock" size={14} /> O Chat IA responderá localmente. Confirme seu e-mail para autorizar o provedor de IA.</div>}
          <div className="practice-actions practice-actions-single"><button type="button" className="button button-small button-primary" disabled={!answer.trim()} onClick={() => openAiChat({ source: 'interview', sourceLabel: 'Entrevistas', context: question, message: answer, useAi: shareForAi && canUseAi })}>Enviar resposta para o Chat IA <Icon name="arrow" size={14} /></button><span>{answer.length} caracteres · salvo automaticamente</span></div>
          {canUseAi && !shareForAi && <div className="practice-privacy"><Icon name="lock" size={14} /> Sem autorização, a resposta será processada localmente no Chat IA.</div>}
        </aside>
      </section>
      <footer className="site-footer"><Brand /><span>Um apoio para o seu próximo passo.</span><span>Exercícios privados neste dispositivo.</span><small>© 2026 conectavagasdf</small></footer>
    </main>
  );
}

function MentorPage({ onLearning, onInterview }: { onLearning: () => void; onInterview: () => void }) {
  const { user } = useAuth();
  const canUseAi = Boolean(user?.email_verified_at);
  const [message, setMessage] = useState("");
  const [shareForAi, setShareForAi] = useState(false);

  function askMentor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = message.trim();
    if (!question) return;
    if (shareForAi && !canUseAi) { setShareForAi(false); return; }
    openAiChat({ source: 'orientation', sourceLabel: 'Orientação', context: 'Orientação de carreira', message: question, useAi: shareForAi && canUseAi });
  }

  const examples = ["Como começo um currículo sem experiência?", "Como me preparo para uma entrevista?", "Como faço contato com alguém da minha área?"];

  return (
    <main className="resource-page zeno-workspace-page zeno-mentor-page">
      <header className="resource-hero mentor-hero zeno-workspace-header"><div><div className="zeno-eyebrow">ORIENTAÇÃO DE CARREIRA</div><h1>Uma dúvida de cada vez.<br /><em>Um próximo passo possível.</em></h1><p>Peça ajuda para organizar sua busca, seu currículo ou sua preparação. A orientação não substitui seu julgamento nem garante resultado em processos seletivos.</p></div></header>
      <section className="mentor-layout content-width">
        <div className="mentor-aside"><div className="eyebrow eyebrow-muted">POSSO AJUDAR COM</div><button onClick={onLearning}><Icon name="file" size={17} /> Currículo e apresentação</button><button onClick={onInterview}><Icon name="briefcase" size={17} /> Preparação para entrevistas</button><button onClick={onLearning}><Icon name="arrow" size={17} /> Busca de vagas e networking</button><div className="mentor-note"><Icon name="lock" size={15} /><p>Não informe CPF, endereço, telefone, dados de acesso ou informações confidenciais de empresas.</p></div></div>
        <div className="mentor-card"><div className="mentor-card-top"><span className="mentor-avatar"><Icon name="sparkle" size={19} /></span><div><b>Orientador conectavagasdf</b><small>Profissional, acolhedor e sem promessas mágicas</small></div></div>
          <div className="mentor-welcome"><b>Por onde você gostaria de começar?</b><p>Conte um pouco sobre o desafio. Ao enviar, sua conversa continuará na aba Chat IA com o contexto desta página.</p><div className="mentor-prompts">{examples.map((example) => <button key={example} onClick={() => setMessage(example)}>{example}</button>)}</div></div>
          <form className="mentor-form" onSubmit={askMentor}><label className="field"><span>Sua dúvida</span><textarea rows={4} maxLength={1200} value={message} onChange={(event) => { setMessage(event.target.value); setShareForAi(false); }} placeholder="Ex.: Tenho experiência com atendimento e quero tentar uma vaga administrativa. Como posso apresentar essa experiência?" /></label>{canUseAi ? <label className="ai-consent"><input type="checkbox" checked={shareForAi} onChange={(event) => setShareForAi(event.target.checked)} /><span>Autorizo enviar esta dúvida ao provedor de IA para receber orientação. <a href="/privacidade">Aviso de privacidade</a>.</span></label> : <p className="ai-access-note">A orientação com IA exige uma conta com e-mail confirmado. <a href={user ? '/verificar-email' : `/login?returnTo=${encodeURIComponent('/orientacao')}`}>{user ? 'Confirmar e-mail' : 'Entrar ou criar conta'}</a>. Esta conversa seguirá localmente no Chat IA.</p>}<div className="mentor-form-footer"><small>{message.length}/1200 · {canUseAi ? 'sem autorização, respondemos localmente' : 'resposta local neste dispositivo'}</small><button className="button button-primary" disabled={!message.trim()}>{shareForAi && canUseAi ? "Abrir conversa com IA" : canUseAi ? "Abrir orientação local" : "Abrir conversa"} <Icon name="arrow" size={15} /></button></div></form>
          <div className="mentor-disclaimer">{canUseAi ? 'A IA pode errar. Revise sugestões e não use a resposta como orientação jurídica ou garantia de contratação.' : 'A orientação local é informativa e não garante contratação.'}</div>
        </div>
      </section>
      <footer className="site-footer"><Brand /><span>Um apoio para o seu próximo passo.</span><span>Sua pergunta não fica salva no histórico.</span><small>© 2026 conectavagasdf</small></footer>
    </main>
  );
}

type AdminArticle = { id: string; slug: string; title: string; category: string; summary: string; body: string; status: "draft" | "published" };
type AdminArticleForm = Omit<AdminArticle, "id" | "status">;
const emptyArticleForm: AdminArticleForm = { slug: "", title: "", category: "CARREIRA", summary: "", body: "" };

async function adminRequest<T>(path: string, token: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store" });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) {
    const errorBody = payload as { error?: { message?: string } } | null;
    throw new Error(errorBody?.error?.message ?? "Não foi possível concluir esta ação.");
  }
  return payload as T;
}

function AdminPage() {
  const [token, setToken] = useState("");
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [form, setForm] = useState<AdminArticleForm>(emptyArticleForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadArticles() {
    if (!token.trim()) { setMessage("Informe o token administrativo configurado no servidor."); return; }
    setBusy(true);
    try {
      const result = await adminRequest<{ content: AdminArticle[] }>("/api/admin/content", token);
      setArticles(result.content ?? []);
      setMessage(`${result.content?.length ?? 0} conteúdo(s) carregado(s).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao carregar conteúdos."); }
    finally { setBusy(false); }
  }

  function startEditing(article: AdminArticle) {
    setEditingId(article.id);
    setForm({ slug: article.slug, title: article.title, category: article.category, summary: article.summary, body: article.body });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() { setEditingId(""); setForm(emptyArticleForm); }

  async function saveArticle() {
    if (!token.trim()) { setMessage("Informe o token administrativo."); return ""; }
    setBusy(true);
    try {
      const result = editingId
        ? await adminRequest<{ id: string }>(`/api/admin/content/${editingId}`, token, "PATCH", form)
        : await adminRequest<{ id: string }>("/api/admin/content", token, "POST", form);
      setEditingId(result.id);
      await loadArticles();
      setMessage("Rascunho salvo. Revise antes de publicar.");
      return result.id;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar rascunho."); return ""; }
    finally { setBusy(false); }
  }

  async function publishArticle(publish: boolean) {
    const id = publish ? await saveArticle() : editingId || await saveArticle();
    if (!id) return;
    setBusy(true);
    try {
      await adminRequest(`/api/admin/content/${id}/${publish ? "publish" : "unpublish"}`, token, "PATCH");
      await loadArticles();
      setMessage(publish ? "Conteúdo publicado após sua confirmação." : "Conteúdo retirado da publicação.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar publicação."); }
    finally { setBusy(false); }
  }

  async function generateDraft() {
    if (!token.trim() || !form.title.trim()) { setMessage("Informe o token e um título ou tema antes de pedir um rascunho."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/ai/assist", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "content-draft", topic: `${form.title}. Categoria: ${form.category}. Resumo editorial: ${form.summary}` }), cache: "no-store" });
      const result = await response.json() as { reply?: string; error?: { message?: string } };
      if (!response.ok || !result.reply) throw new Error(result.error?.message ?? "A IA de rascunhos não está configurada.");
      setForm((current) => ({ ...current, body: result.reply ?? "" }));
      setMessage("Rascunho de IA inserido para revisão. Nada foi publicado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível gerar o rascunho."); }
    finally { setBusy(false); }
  }

  return (
    <main className="resource-page admin-page">
      <section className="resource-hero admin-hero"><div className="eyebrow eyebrow-muted">ADMINISTRAÇÃO DE CONTEÚDO</div><h1>Rascunhe, revise<br /><em>e só então publique.</em></h1><p>Conteúdo gerado por IA permanece como rascunho. Você confere os fatos, edita e decide se publica.</p></section>
      <section className="admin-layout content-width">
        <div className="admin-auth-card"><label className="field"><span>Token administrativo</span><input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Informe o segredo do servidor" /></label><button className="button button-dark" onClick={loadArticles} disabled={busy || !token.trim()}>{busy ? "Conectando…" : "Conectar e listar conteúdos"}</button><small>O token não é salvo. Esta área também exige a autenticação de administrador ao abrir a página.</small>{message && <p role="status">{message}</p>}</div>
        <div className="admin-editor-card"><div className="admin-editor-heading"><div><div className="eyebrow eyebrow-muted">{editingId ? "EDITAR CONTEÚDO" : "NOVO CONTEÚDO"}</div><h2>{editingId ? "Revise o artigo." : "Comece pelo tema."}</h2></div><button className="button button-quiet button-small" onClick={resetForm}>Novo rascunho</button></div>
          <div className="admin-form-grid"><label className="field"><span>Título</span><input value={form.title} onChange={(event) => { const title = event.target.value; setForm((current) => ({ ...current, title, slug: editingId ? current.slug : title.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })); }} maxLength={140} placeholder="Ex.: Como se preparar para uma entrevista" /></label><label className="field"><span>Slug</span><input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="preparar-entrevista" /></label><label className="field"><span>Categoria</span><input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} maxLength={60} /></label><label className="field"><span>Resumo</span><input value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} maxLength={300} /></label></div>
          <label className="field admin-body-field"><span>Conteúdo em texto</span><textarea rows={12} maxLength={12000} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Escreva o conteúdo ou gere um rascunho para revisar…" /></label>
          <div className="admin-actions"><button className="button button-quiet" onClick={generateDraft} disabled={busy || !form.title.trim()}><Icon name="sparkle" size={15} /> Gerar rascunho com IA</button><button className="button button-quiet" onClick={saveArticle} disabled={busy || !form.title.trim() || !form.body.trim()}>Salvar rascunho</button>{editingId && <button className="button button-quiet" onClick={() => publishArticle(false)} disabled={busy}>Despublicar</button>}<button className="button button-primary" onClick={() => publishArticle(true)} disabled={busy || !form.title.trim() || !form.body.trim()}>Publicar após revisão <Icon name="arrow" size={15} /></button></div>
        </div>
        <div className="admin-list-card"><div className="admin-editor-heading"><div><div className="eyebrow eyebrow-muted">BIBLIOTECA</div><h2>Conteúdos salvos</h2></div><button className="button button-quiet button-small" onClick={loadArticles} disabled={busy}>Atualizar</button></div>{articles.length ? articles.map((article) => <article className="admin-list-item" key={article.id}><div><b>{article.title}</b><small>{article.category} · {article.status === "published" ? "Publicado" : "Rascunho"}</small></div><button onClick={() => startEditing(article)}>Editar</button></article>) : <p className="admin-empty">Use o token para listar rascunhos e publicações. Os guias estáticos continuam disponíveis.</p>}</div>
      </section>
      <footer className="site-footer"><Brand /><span>Revise cada informação antes de publicar.</span><small>© 2026 conectavagasdf</small></footer>
    </main>
  );
}

function CoverLetterPage({ data }: { data: ResumeData }) {
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const [role, setRole] = useState(data.profile.headline);
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState("");
  const [contribution, setContribution] = useState("");
  const [letter, setLetter] = useState(() => readLocalValue("conectavagasdf.coverletter.draft.v1") || readLocalValue("passo.coverletter.draft.v1"));

  useEffect(() => {
    const node = document.createElement("div");
    node.id = "cover-letter-print-root";
    document.body.append(node);
    setPrintRoot(node);
    return () => node.remove();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("conectavagasdf.coverletter.draft.v1", letter); } catch { /* A carta continua editável sem persistência. */ }
  }, [letter]);

  function buildLetter() {
    const experience = data.experiences.find((item) => item.role.trim() || item.company.trim());
    const bullets = experience?.bullets.map((bullet) => bullet.trim()).filter(Boolean).slice(0, 2) ?? [];
    const targetRole = role.trim() || "oportunidade profissional";
    const targetCompany = company.trim() || "equipe de recrutamento";
    const paragraphs = [
      `Olá, ${targetCompany},`,
      `Gostaria de demonstrar meu interesse na oportunidade de ${targetRole}. ${reason.trim() || "A vaga está relacionada à área em que quero contribuir e continuar me desenvolvendo."}`,
      data.summary.trim(),
      experience?.role || experience?.company ? `Na minha experiência${experience.role ? ` como ${experience.role}` : ""}${experience.company ? ` na ${experience.company}` : ""}, participei de atividades que incluem ${bullets.length ? bullets.join(" ") : "responsabilidades descritas no meu currículo"}.` : "Minha trajetória inclui estudos, atividades e experiências que apresento com mais detalhes no currículo anexo." ,
      contribution.trim() ? `Acredito que posso contribuir com ${contribution.trim()}.` : "Fico à disposição para conversar sobre como minhas experiências e interesses podem se relacionar com as necessidades da equipe.",
      "Agradeço pela atenção.",
      `Atenciosamente,\n${data.profile.name.trim() || "Seu nome"}`,
    ].filter(Boolean);
    setLetter(paragraphs.join("\n\n"));
  }

  const printContent = printRoot ? createPortal(<article className="cover-letter-paper"><p className="cover-letter-recipient">Carta de apresentação</p><p className="cover-letter-role">Candidatura: {role.trim() || data.profile.headline || "Oportunidade profissional"}{company.trim() ? ` · ${company.trim()}` : ""}</p><div>{letter}</div></article>, printRoot) : null;

  return (
    <main className="resource-page cover-letter-page">
      {printContent}
      <section className="resource-hero no-print"><div className="eyebrow eyebrow-muted">CARTA DE APRESENTAÇÃO</div><h1>Apresente seu interesse<br /><em>com suas próprias palavras.</em></h1><p>Monte um rascunho a partir do currículo deste dispositivo, personalize e revise. Nada é enviado a um serviço de IA.</p></section>
      <section className="cover-letter-layout content-width no-print">
        <div className="cover-letter-form"><div className="form-heading"><div className="eyebrow eyebrow-muted">CONTEXTO DA VAGA</div><h2>Personalize antes de <em>escrever.</em></h2><p>Inclua só informações verdadeiras e adequadas à oportunidade.</p></div><div className="form-grid"><Field label="Cargo ou vaga" value={role} onChange={setRole} placeholder="Ex.: Assistente administrativa" /><Field label="Empresa" value={company} onChange={setCompany} placeholder="Nome da empresa" /></div><div className="field-spacer" /><Field label="Por que esta oportunidade chamou sua atenção?" as="textarea" value={reason} onChange={setReason} placeholder="O que despertou seu interesse?" /><div className="field-spacer" /><Field label="Como você pode contribuir?" as="textarea" value={contribution} onChange={setContribution} placeholder="Mencione experiências e competências reais." /><div className="cover-letter-actions"><button className="button button-primary" onClick={buildLetter}>Montar rascunho <Icon name="sparkle" size={15} /></button><button className="button button-quiet" onClick={() => { setLetter(""); try { localStorage.removeItem("conectavagasdf.coverletter.draft.v1"); localStorage.removeItem("passo.coverletter.draft.v1"); } catch { /* Ignora bloqueio do armazenamento. */ } }}>Limpar carta</button></div><div className="privacy-card cover-letter-privacy"><span><Icon name="lock" size={15} /></span><div><b>Privada neste dispositivo</b><p>A carta fica neste navegador; a montagem não usa IA nem transmite o currículo.</p></div></div></div>
        <div className="cover-letter-editor"><div className="cover-letter-editor-header"><div><div className="eyebrow eyebrow-muted">RASCUNHO EDITÁVEL</div><b>Revise e ajuste o texto</b></div><button className="button button-small button-primary" onClick={() => window.print()} disabled={!letter.trim()}><Icon name="download" size={15} /> Salvar em PDF</button></div><textarea aria-label="Carta de apresentação" maxLength={5000} rows={22} value={letter} onChange={(event) => setLetter(event.target.value)} placeholder="Monte um rascunho ou escreva sua carta aqui…" /><small>{letter.length}/5000 · rascunho salvo neste dispositivo</small></div>
      </section>
      <footer className="site-footer no-print"><Brand /><span>Revise os fatos, o nome da empresa e o cargo antes de enviar.</span><small>© 2026 conectavagasdf</small></footer>
    </main>
  );
}

function PrivacyPage({ onClear }: { onClear: () => void }) {
  return (
    <main className="resource-page privacy-page">
      <section className="resource-hero"><div className="eyebrow eyebrow-muted">DADOS E PRIVACIDADE</div><h1>Você escolhe<br /><em>o que compartilhar.</em></h1><p>Este aviso descreve o comportamento atual do protótipo conectavagasdf. Deve ser revisado e adequado antes da publicação, inclusive conforme o provedor de IA e a configuração de hospedagem escolhidos.</p></section>
      <section className="privacy-content content-width">
        <PrivacyDetails />
        <article><h2>O que fica neste dispositivo</h2><p>Sem conta, rascunhos de currículo, carta de apresentação, respostas de exercícios e progresso de leitura podem ser guardados no armazenamento local deste navegador. Não sincronizamos esses dados entre dispositivos. Quem tiver acesso ao navegador ou ao perfil do computador também poderá acessá-los.</p></article>
        <article><h2>Quando um dado pode sair daqui</h2><p>O currículo, os guias, a carta e os exercícios funcionam sem IA. Para abrir a orientação com IA a partir da dashboard ou da conversa completa, a interface pede uma autorização separada. Sem marcar a autorização, a resposta segue pelo caminho local e não é enviada ao provedor.</p><p>Se você autorizar, o texto necessário àquela tarefa passa pelo servidor e pode ser enviado ao provedor de IA configurado. O servidor tenta remover e-mail, telefone e CPF, mas essa filtragem não é garantia de anonimização. Não inclua documentos, endereço, dados de acesso, informações confidenciais ou dados de outras pessoas.</p></article>
        <article><h2>Provedores e retenção</h2><p>Currículos sincronizados, versões, candidaturas, cartas, entrevistas e progresso de cursos permanecem na conta até a exclusão solicitada por você. O histórico do Chat IA, incluindo mensagens e contexto, fica salvo na sua conta por 7 dias após a última atividade e pode ser apagado antes por você. Sessões e tokens expirados são limpos periodicamente; rascunhos locais dependem deste navegador.</p><p>As chamadas externas de IA só ficam ativas quando o responsável configura chaves e limites. As regras de retenção, uso para treinamento, localização e processamento dependem do provedor e do plano escolhidos. Consulte a política vigente do serviço antes de enviar dados reais. Logs técnicos e cópias de segurança têm retenção própria, a ser confirmada antes do lançamento público.</p></article>
        <article><h2>Conteúdo público e administração</h2><p>Artigos publicados no catálogo são públicos. O painel de administração guarda rascunhos e versões editoriais no banco. Ele deve ser protegido pela autenticação administrativa do servidor e por um token distinto; não compartilhe esses segredos com visitantes.</p></article>
        <article><h2>Apagar seus dados locais</h2><p>Use o botão abaixo para remover as chaves de armazenamento local iniciadas por “conectavagasdf.” neste navegador. Isso não apaga conteúdo editorial do servidor nem dados que um provedor externo possa reter segundo sua própria política.</p><button className="button button-quiet privacy-clear" onClick={onClear}>Apagar dados da conectavagasdf neste navegador</button></article>
        <p className="privacy-legal-note">Aviso informativo do protótipo; não constitui aconselhamento jurídico nem substitui política de privacidade revisada para o serviço efetivamente publicado.</p>
      </section>
      <footer className="site-footer"><Brand /><span>Seus dados e suas escolhas importam.</span><small>© 2026 conectavagasdf</small></footer>
    </main>
  );
}

function LearningPage({ onInterview }: { onInterview: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [quizAnswer, setQuizAnswer] = useState("");
  const [publishedArticles, setPublishedArticles] = useState<Array<{ id: string; slug: string; title: string; category: string; summary: string; body: string }>>([]);
  const [readGuides, setReadGuides] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem("conectavagasdf.guides.read.v1") ?? localStorage.getItem("passo.guides.read.v1") ?? "[]"); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
  });
  useEffect(() => {
    fetch("/api/content", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { content?: typeof publishedArticles };
      setPublishedArticles(result.content ?? []);
    }).catch(() => { /* O conteúdo estático continua como fallback. */ });
  }, []);
  const liveGuides = publishedArticles.map((article) => ({
    id: article.id,
    category: article.category,
    title: article.title,
    summary: article.summary,
    steps: article.body.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, index) => [`Parte ${index + 1}`, line]),
  }));
  const allGuides = [...GUIDES, ...liveGuides];
  const categories = ["Todas", ...new Set(allGuides.map((guide) => guide.category))];
  const visibleGuides = allGuides.filter((guide) => {
    const matchesCategory = category === "Todas" || guide.category === category;
    const searchable = [guide.title, guide.summary, guide.category, ...guide.steps.flat()].join(" ").toLocaleLowerCase("pt-BR");
    return matchesCategory && searchable.includes(query.toLocaleLowerCase("pt-BR").trim());
  });

  function toggleRead(id: string) {
    const next = readGuides.includes(id) ? readGuides.filter((item) => item !== id) : [...readGuides, id];
    setReadGuides(next);
    try { localStorage.setItem("conectavagasdf.guides.read.v1", JSON.stringify(next)); } catch { /* A leitura continua funcionando sem persistência. */ }
  }

  return (
    <main className="resource-page">
      <section className="resource-hero learning-hero"><div className="eyebrow eyebrow-muted">APRENDER NO SEU TEMPO</div><h1>Orientação prática,<br /><em>um passo de cada vez.</em></h1><p>Ideias simples para apresentar sua trajetória, se preparar para conversas profissionais e organizar sua busca.</p></section>
      <section className="guide-filter content-width" aria-label="Buscar guias"><label className="field"><span>Buscar por tema</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: primeiro emprego, entrevista, currículo" /></label><div className="guide-category-filters" aria-label="Filtrar por categoria">{categories.map((item) => <button key={item} className={category === item ? "is-selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><small>{readGuides.length} leitura(s) marcada(s) · {allGuides.length} guias disponíveis</small></section>
      <section className="guide-grid content-width" aria-label="Guias de carreira">
        {visibleGuides.map((guide) => <article className={`guide-card${readGuides.includes(guide.id) ? " guide-card-read" : ""}`} key={guide.id}><div className="guide-card-top"><span>{readGuides.includes(guide.id) ? "✓" : guide.category.slice(0, 2).toLocaleLowerCase("pt-BR")}</span><span>{guide.category}</span></div><h2>{guide.title}</h2><p>{guide.summary}</p><div className="guide-steps">{guide.steps.map(([title, body], step) => <div className="guide-step" key={title}><span>{String(step + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div><div className="guide-card-actions"><button className="guide-read-toggle" onClick={() => toggleRead(guide.id)}>{readGuides.includes(guide.id) ? "Marcar como não lido" : "Marcar como lido"}</button>{guide.id === "interview" && <button className="text-link guide-cta" onClick={onInterview}>Abrir exercício de entrevista <Icon name="arrow" size={15} /></button>}</div></article>)}
        {visibleGuides.length === 0 && <div className="empty-hint"><b>Nenhum guia encontrado.</b><p>Tente outro termo ou escolha “Todas” as categorias.</p></div>}
      </section>
      <section className="learning-extras content-width"><article className="knowledge-check"><div className="eyebrow eyebrow-muted">CHECAGEM RÁPIDA</div><h2>Uma vaga pede dinheiro para participar do processo seletivo. O que fazer?</h2><div className="quiz-options">{["Pagar logo para não perder a oportunidade.", "Pesquisar a empresa e desconfiar de cobranças para participar.", "Enviar documentos e dados bancários para confirmar a vaga."].map((option) => <button key={option} className={quizAnswer === option ? "is-selected" : ""} onClick={() => setQuizAnswer(option)}>{option}</button>)}</div>{quizAnswer && <p className={`quiz-feedback${quizAnswer.startsWith("Pesquisar") ? " is-correct" : ""}`}>{quizAnswer.startsWith("Pesquisar") ? "Isso. Pesquise a vaga nos canais oficiais e não pague para participar de seleção." : "Reconsidere: pedidos de pagamento ou dados bancários são um sinal para parar e verificar a oportunidade."}</p>}</article><article className="career-glossary"><div className="eyebrow eyebrow-muted">PEQUENO GLOSSÁRIO</div><h2>Termos de processos seletivos</h2><dl><div><dt>ATS</dt><dd>Sistema que ajuda empresas a organizar candidaturas e currículos.</dd></div><div><dt>Triagem</dt><dd>Etapa inicial para identificar candidaturas que atendem aos requisitos da vaga.</dd></div><div><dt>Onboarding</dt><dd>Processo de integração de uma pessoa que está começando em uma organização.</dd></div></dl></article></section>
      <section className="resource-next"><div><div className="eyebrow eyebrow-muted">COMECE POR ONDE FIZER SENTIDO</div><h2>Você não precisa fazer tudo <em>de uma vez.</em></h2></div><button className="button button-dark" onClick={onInterview}>Treinar para entrevista <Icon name="arrow" /></button></section>
      <footer className="site-footer"><Brand /><span>Um apoio para o seu próximo passo.</span><span>Conteúdo para apoiar, não substituir, seu julgamento.</span><small>© 2026 conectavagasdf</small></footer>
    </main>
  );
}


export default App;
