import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { useAuth } from './Auth';
import { api, message } from './api';
import './Usage.css';

type PersonalUsage = {
  tokens: { limit: number; used: number; remaining: number };
  requests: { limit: number; used: number; remaining: number };
  updatedAt: string;
};

type TotalUsage = {
  scope: 'total';
  tokens: { used: number; allowance: number };
  requests: { used: number; allowance: number };
  users: { total: number; active: number; admins: number };
  providers: Array<{ provider: string; requests: number; tokens: number }>;
  modelLimits: Array<{
    provider: string;
    model: string;
    name: string;
    category: string;
    configured: boolean;
    rpm: { used: number; limit: number };
    tpm: { used: number; limit: number };
    rpd: { used: number; limit: number };
  }>;
};

function percentage(used: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

function LimitMeter({ label, value }: { label: string; value: { used: number; limit: number } }) {
  return <div className="usage-limit-meter">
    <span>{value.used.toLocaleString('pt-BR')} / {value.limit.toLocaleString('pt-BR')}</span>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={value.limit} aria-valuenow={Math.min(value.used, value.limit)}>
      <span style={{ width: `${percentage(value.used, value.limit)}%` }} />
    </div>
  </div>;
}

export default function UsagePage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<'personal' | 'total'>('personal');
  const [personal, setPersonal] = useState<PersonalUsage | null>(null);
  const [total, setTotal] = useState<TotalUsage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    if (scope === 'total' && user?.role === 'admin') {
      void api<TotalUsage>('/api/admin/usage').then(value => { if (active) setTotal(value); }).catch(cause => { if (active) setError(message(cause)); });
    } else {
      void api<PersonalUsage>('/api/me/usage').then(value => { if (active) setPersonal(value); }).catch(cause => { if (active) setError(message(cause)); });
    }
    return () => { active = false; };
  }, [scope, user?.role]);

  const loading = scope === 'total' ? !total : !personal;

  return <main className="zeno-workspace-page usage-page">
    <header className="zeno-workspace-header usage-header">
      <div><p className="zeno-eyebrow"><Icon name="clock" size={14} /> SUA COTA</p><h1>Uso</h1><p>{scope === 'total' ? 'Acompanhe o consumo acumulado de todas as contas e provedores de IA.' : 'Acompanhe o consumo do Chat IA e saiba quanto ainda está disponível para sua conta.'}</p></div>
      {user?.role === 'admin' && <div className="usage-scope" role="group" aria-label="Filtrar uso"><button type="button" className={scope === 'personal' ? 'is-active' : ''} aria-pressed={scope === 'personal'} onClick={() => setScope('personal')}>Minha conta</button><button type="button" className={scope === 'total' ? 'is-active' : ''} aria-pressed={scope === 'total'} onClick={() => setScope('total')}>Total</button></div>}
    </header>

    {error && <section className="usage-error" role="alert"><p>{error}</p><button type="button" onClick={() => location.reload()}>Tentar novamente</button></section>}
    {loading && !error && <p className="usage-loading" role="status">Carregando uso…</p>}
    {scope === 'personal' && personal && <>
      <section className="usage-summary" aria-label="Resumo da cota de IA">
        <article className="usage-card">
          <div className="usage-card-heading"><span>Tokens</span><strong>{personal.tokens.remaining.toLocaleString('pt-BR')}</strong><small>restantes de {personal.tokens.limit.toLocaleString('pt-BR')}</small></div>
          <div className="usage-progress" role="progressbar" aria-label="Tokens utilizados" aria-valuemin={0} aria-valuemax={personal.tokens.limit} aria-valuenow={personal.tokens.used}><span style={{ width: `${percentage(personal.tokens.used, personal.tokens.limit)}%` }} /></div>
          <p>{personal.tokens.used.toLocaleString('pt-BR')} tokens utilizados</p>
        </article>
        <article className="usage-card">
          <div className="usage-card-heading"><span>Requisições</span><strong>{personal.requests.remaining}</strong><small>restantes de {personal.requests.limit}</small></div>
          <div className="usage-progress" role="progressbar" aria-label="Requisições utilizadas" aria-valuemin={0} aria-valuemax={personal.requests.limit} aria-valuenow={personal.requests.used}><span style={{ width: `${percentage(personal.requests.used, personal.requests.limit)}%` }} /></div>
          <p>{personal.requests.used} {personal.requests.used === 1 ? 'requisição utilizada' : 'requisições utilizadas'}</p>
        </article>
      </section>
      <section className="usage-note"><span><Icon name="sparkle" size={18} /></span><div><h2>Como a cota funciona</h2><p>Sua conta inclui 4.096 tokens estimados e 2 requisições ao provedor de IA. Respostas locais não consomem a cota. Se uma chamada falhar antes de gerar resposta, a reserva é devolvida.</p></div></section>
    </>}
    {scope === 'total' && total && <>
      <section className="usage-summary usage-summary-total" aria-label="Uso total da plataforma">
        <article className="usage-card"><div className="usage-card-heading"><span>Tokens totais</span><strong>{total.tokens.used.toLocaleString('pt-BR')}</strong><small>utilizados de {total.tokens.allowance.toLocaleString('pt-BR')} distribuídos</small></div><div className="usage-progress" role="progressbar" aria-label="Tokens totais utilizados" aria-valuemin={0} aria-valuemax={total.tokens.allowance} aria-valuenow={total.tokens.used}><span style={{ width: `${percentage(total.tokens.used, total.tokens.allowance)}%` }} /></div><p>Somatório de todas as contas cadastradas</p></article>
        <article className="usage-card"><div className="usage-card-heading"><span>Requisições totais</span><strong>{total.requests.used.toLocaleString('pt-BR')}</strong><small>utilizadas de {total.requests.allowance.toLocaleString('pt-BR')} distribuídas</small></div><div className="usage-progress" role="progressbar" aria-label="Requisições totais utilizadas" aria-valuemin={0} aria-valuemax={total.requests.allowance} aria-valuenow={total.requests.used}><span style={{ width: `${percentage(total.requests.used, total.requests.allowance)}%` }} /></div><p>Falhas sem resposta são devolvidas e não entram no total</p></article>
        <article className="usage-card"><div className="usage-card-heading"><span>Usuários</span><strong>{total.users.active}</strong><small>ativos de {total.users.total} cadastrados</small></div><p>{total.users.admins} {total.users.admins === 1 ? 'administrador' : 'administradores'}</p></article>
      </section>
      <section className="usage-providers" aria-labelledby="usage-providers-title"><div><p className="zeno-eyebrow">PROVEDORES</p><h2 id="usage-providers-title">Consumo registrado por IA</h2><p>Somente respostas geradas após a ativação deste painel aparecem separadas por provedor. Nenhuma API key é exibida ou armazenada aqui.</p></div>{total.providers.length ? <div className="usage-provider-list">{total.providers.map(provider => <article key={provider.provider}><strong>{provider.provider === 'gemini' ? 'Gemini' : provider.provider === 'openrouter' ? 'OpenRouter' : provider.provider}</strong><span>{provider.tokens.toLocaleString('pt-BR')} tokens</span><small>{provider.requests.toLocaleString('pt-BR')} {provider.requests === 1 ? 'resposta' : 'respostas'}</small></article>)}</div> : <p className="usage-provider-empty">Ainda não há respostas registradas por provedor.</p>}</section>
      <section className="usage-model-limits" aria-labelledby="usage-model-limits-title">
        <div className="usage-model-limits-heading">
          <div><p className="zeno-eyebrow">LIMITES DO PROVEDOR</p><h2 id="usage-model-limits-title">Cotas globais por modelo</h2><p>Consumo atual comparado aos limites cadastrados. RPM significa requisições por minuto, TPM tokens por minuto e RPD requisições por dia.</p></div>
          <span>{total.modelLimits.length} modelos disponíveis</span>
        </div>
        <div className="usage-limits-table-wrap">
          <table className="usage-limits-table">
            <thead><tr><th scope="col">Modelo</th><th scope="col">Categoria</th><th scope="col">RPM</th><th scope="col">TPM</th><th scope="col">RPD</th></tr></thead>
            <tbody>{total.modelLimits.map(limit => <tr key={`${limit.provider}:${limit.model}`}>
              <th scope="row"><span>{limit.name}</span>{limit.configured && <small>Em uso</small>}</th>
              <td>{limit.category}</td>
              <td><LimitMeter label={`${limit.name}: requisições por minuto`} value={limit.rpm} /></td>
              <td><LimitMeter label={`${limit.name}: tokens por minuto`} value={limit.tpm} /></td>
              <td><LimitMeter label={`${limit.name}: requisições por dia`} value={limit.rpd} /></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}
  </main>;
}
