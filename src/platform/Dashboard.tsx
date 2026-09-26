import { Icon, type IconName } from '../components/Icon';
import { go } from './api';
import './dashboard.css';

type DashboardProps = {
  userName?: string;
};

type Metric = {
  title: string;
  value: string;
  hint: string;
  icon: IconName;
};

const metrics: Metric[] = [
  { title: 'Currículos criados', value: '0', hint: 'Seus documentos salvos', icon: 'file' },
  { title: 'Entrevistas praticadas', value: '0', hint: 'Respostas treinadas', icon: 'briefcase' },
  { title: 'Orientações recebidas', value: '0', hint: 'Conversas concluídas', icon: 'compass' },
  { title: 'Dias de uso', value: '1', hint: 'Sua jornada começou hoje', icon: 'clock' },
];

function displayName(name?: string) {
  return name?.trim() || 'por aqui';
}

export default function Dashboard({ userName }: DashboardProps) {
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  return <div className="zeno-dashboard-page">
    <header className="zeno-dashboard-header">
      <div><p className="zeno-eyebrow">Seu trabalho, com mais clareza</p><h1>Olá, {displayName(userName)}.</h1><p>Vamos dar o próximo passo na sua carreira?</p></div>
      <time dateTime={new Date().toISOString().slice(0, 10)}><span />{date}</time>
    </header>

    <section className="zeno-dashboard-hero">
      <div className="zeno-dashboard-hero-inner">
        <div className="zeno-dashboard-hero-copy">
          <p className="zeno-eyebrow"><Icon name="sparkle" size={16} strokeWidth={2} /> Currículos que contam sua história</p>
          <h2>Você conhece sua trajetória.<br /><em>O Conecta ajuda a apresentar.</em></h2>
          <p>Organize suas experiências, escolha um modelo e construa um currículo claro em um só fluxo.</p>
          <div className="zeno-dashboard-actions"><button type="button" className="zeno-dashboard-primary" onClick={() => go('/editor')}><Icon name="plus" size={16} strokeWidth={2} /> Criar novo currículo</button><button type="button" className="zeno-dashboard-link" onClick={() => go('/aprender')}>Ver dicas para começar <Icon name="arrow" size={16} strokeWidth={2} /></button></div>
        </div>
        <div className="zeno-resume-mock" aria-hidden="true">
          <Icon name="fileEdit" size={24} strokeWidth={2} />
          <p>Um bom currículo<br />começa aqui.</p>
          <i /><i /><i className="short" />
          <span><Icon name="sparkle" size={12} strokeWidth={2} /> Feito no seu ritmo</span>
        </div>
      </div>
    </section>

    <section className="zeno-dashboard-activity" aria-labelledby="dashboard-activity-title">
      <div className="zeno-dashboard-section-heading"><h2 id="dashboard-activity-title">Sua atividade</h2><span>Primeiros passos no Conecta Vagas</span></div>
      <div className="zeno-dashboard-metrics">{metrics.map(metric => <article key={metric.title}>
        <div><p>{metric.title}</p><Icon name={metric.icon} size={16} strokeWidth={2} /></div><strong>{metric.value}</strong><small>{metric.hint}</small>
      </article>)}</div>
    </section>

    <div className="zeno-dashboard-grid">
      <section className="zeno-dashboard-recent" aria-labelledby="dashboard-recent-title">
        <header><div><h2 id="dashboard-recent-title">Continue de onde parou</h2><p>Seus currículos mais recentes aparecem aqui.</p></div><button type="button" onClick={() => go('/editor')}>Ver todos <Icon name="arrow" size={12} strokeWidth={2} /></button></header>
        <div className="zeno-dashboard-empty"><span className="zeno-dashboard-icon-box"><Icon name="fileEdit" size={24} strokeWidth={2} /></span><h3>Seu primeiro currículo, um novo começo.</h3><p>Os currículos que você criar ficam aqui, prontos para revisar e adaptar a cada oportunidade.</p><button type="button" onClick={() => go('/editor')}>Criar meu primeiro currículo <Icon name="arrow" size={16} strokeWidth={2} /></button></div>
      </section>
      <aside className="zeno-dashboard-aside">
        <section><p className="zeno-eyebrow">Para um bom começo</p><h2>Uma história clara<br />faz a diferença.</h2><ul><li><Icon name="check" size={16} strokeWidth={2} />Identifique experiências reais</li><li><Icon name="check" size={16} strokeWidth={2} />Organize tarefas e resultados</li><li><Icon name="check" size={16} strokeWidth={2} />Revise cada informação</li></ul></section>
        <button type="button" onClick={() => go('/orientacao')}><span className="zeno-dashboard-icon-box"><Icon name="message" size={20} strokeWidth={2} /></span><span><strong>Precisa organizar as ideias?</strong><small>Converse com a orientação.</small></span><Icon name="arrow" size={16} strokeWidth={2} /></button>
      </aside>
    </div>
  </div>;
}
