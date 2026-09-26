import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { api, message } from './api';
import './AdminDashboard.css';

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'admin';
  status: string;
  email_verified_at: string | null;
  created_at: string;
  providers: string | null;
  tokens_used: number;
  token_limit: number;
  requests_used: number;
  request_limit: number;
  isSelf: boolean;
};

type UsersResponse = { users: ManagedUser[]; page: number; pageSize: number; total: number; totalPages: number };

export default function AdminDashboard() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (appliedQuery) params.set('query', appliedQuery);
      setData(await api<UsersResponse>(`/api/admin/users?${params}`));
    } catch (cause) { setError(message(cause)); }
  }, [appliedQuery, page]);

  useEffect(() => { void load(); }, [load]);

  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  async function changeRole(user: ManagedUser) {
    const nextRole = user.role === 'admin' ? 'member' : 'admin';
    const action = nextRole === 'admin' ? 'tornar administrador' : 'remover o acesso administrativo de';
    if (!confirm(`Deseja ${action} ${user.name}?`)) return;
    setBusyId(user.id); setError(''); setNotice('');
    try {
      await api(`/api/admin/users/${user.id}`, { role: nextRole }, 'PATCH');
      setNotice(nextRole === 'admin' ? `${user.name} agora é administrador.` : `${user.name} voltou a ser usuário comum.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusyId(''); }
  }

  async function remove(user: ManagedUser) {
    if (!confirm(`Excluir permanentemente a conta de ${user.name} (${user.email}) e todos os dados associados?`)) return;
    setBusyId(user.id); setError(''); setNotice('');
    try {
      await api(`/api/admin/users/${user.id}`, undefined, 'DELETE');
      setNotice(`A conta de ${user.name} foi excluída.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusyId(''); }
  }

  const admins = data?.users.filter(user => user.role === 'admin').length ?? 0;
  const verified = data?.users.filter(user => user.email_verified_at).length ?? 0;

  return <main className="zeno-workspace-page admin-dashboard">
    <header className="zeno-workspace-header admin-dashboard-header">
      <div><p className="zeno-eyebrow"><Icon name="lock" size={14} /> ADMINISTRAÇÃO</p><h1>Painel administrativo</h1><p>Consulte contas, gerencie administradores e acompanhe o uso da plataforma.</p></div>
    </header>

    <section className="admin-dashboard-summary" aria-label="Resumo de usuários">
      <article><span>Usuários encontrados</span><strong>{data?.total ?? '—'}</strong></article>
      <article><span>Administradores nesta página</span><strong>{data ? admins : '—'}</strong></article>
      <article><span>Contas verificadas nesta página</span><strong>{data ? verified : '—'}</strong></article>
    </section>

    <section className="admin-users-card" aria-labelledby="admin-users-title">
      <div className="admin-users-toolbar"><div><h2 id="admin-users-title">Usuários</h2><p>Excluir uma conta remove permanentemente todos os dados vinculados.</p></div><form role="search" onSubmit={search}><label className="sr-only" htmlFor="admin-user-search">Buscar por nome ou e-mail</label><input id="admin-user-search" type="search" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nome ou e-mail" /><button className="button" type="submit"><Icon name="search" size={15} /> Buscar</button></form></div>
      {notice && <p className="success-note" role="status">{notice}</p>}
      {error && <p className="error-note" role="alert">{error}</p>}
      {!data && !error && <p role="status">Carregando usuários…</p>}
      {data && <div className="admin-users-table-wrap"><table className="admin-users-table">
        <thead><tr><th>Usuário</th><th>Acesso</th><th>Uso de IA</th><th>Cadastro</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{data.users.map(user => <tr key={user.id}>
          <td><strong>{user.name}{user.isSelf && <small>Você</small>}</strong><span>{user.email}</span><small>{user.providers ? `Login: ${user.providers}` : 'Login: e-mail e senha'} · {user.email_verified_at ? 'verificado' : 'não verificado'}</small></td>
          <td><span className={`admin-role-badge is-${user.role}`}>{user.role === 'admin' ? 'Administrador' : 'Usuário'}</span></td>
          <td><strong>{user.tokens_used.toLocaleString('pt-BR')} tokens</strong><small>{user.requests_used}/{user.request_limit} requisições</small></td>
          <td><span>{new Date(user.created_at).toLocaleDateString('pt-BR')}</span></td>
          <td><div className="admin-user-actions"><button type="button" className="button" disabled={busyId === user.id || user.isSelf} onClick={() => { void changeRole(user); }}>{user.role === 'admin' ? 'Remover admin' : 'Adicionar como admin'}</button><button type="button" className="button danger" disabled={busyId === user.id || user.isSelf} onClick={() => { void remove(user); }}>Excluir</button></div></td>
        </tr>)}</tbody>
      </table>{data.users.length === 0 && <p className="admin-users-empty">Nenhum usuário encontrado.</p>}</div>}
      {data && data.totalPages > 1 && <nav className="admin-pagination" aria-label="Paginação de usuários"><button className="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {data.totalPages}</span><button className="button" disabled={page >= data.totalPages} onClick={() => setPage(value => value + 1)}>Próxima</button></nav>}
    </section>
  </main>;
}
