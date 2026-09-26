import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { adminReturnTo } from '../../shared/access-policy';
import { api, message } from './api';

type AdminState = { authenticated: boolean; loading: boolean; error: string; refresh: () => Promise<void> };
const AdminContext = createContext<AdminState>({ authenticated: false, loading: true, error: '', refresh: async () => {} });
export function useAdminAccess() { return useContext(AdminContext); }
export function AdminAccessProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try { setAuthenticated((await api<{ authenticated: boolean }>('/api/admin-session', undefined, 'GET', {}, 8_000)).authenticated === true); }
    catch (failure) { setAuthenticated(false); setError(message(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const checkRestoredPage = (event: PageTransitionEvent) => { if (event.persisted) { setAuthenticated(false); void refresh(); } };
    const deny = () => { setAuthenticated(false); };
    window.addEventListener('pageshow', checkRestoredPage); window.addEventListener('admin-access-denied', deny);
    const timer = window.setInterval(() => { void refresh(false); }, 60_000);
    return () => { window.removeEventListener('pageshow', checkRestoredPage); window.removeEventListener('admin-access-denied', deny); clearInterval(timer); };
  }, [refresh]);
  return <AdminContext.Provider value={{ authenticated, loading, error, refresh }}>{children}</AdminContext.Provider>;
}
export function AdminLogin() {
  const { authenticated } = useAdminAccess();
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const destination = adminReturnTo(new URLSearchParams(location.search).get('returnTo'));
  useEffect(() => { if (authenticated) location.replace(destination); }, [authenticated, destination]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/admin-session', { token }); setToken(''); location.replace(destination); }
    catch (failure) { setToken(''); setError(message(failure)); setBusy(false); }
  }
  return <main className="platform-page auth-page"><section className="platform-card auth-card"><h1>Acesso administrativo</h1><p>Esta área é exclusiva para administrar conteúdos e configurações. O painel de carreira está disponível para qualquer pessoa com uma conta.</p><form onSubmit={event => { void submit(event); }}><label>Credencial administrativa<input type="password" autoComplete="off" required maxLength={512} value={token} onChange={event => setToken(event.target.value)} /></label><button className="button button-primary" disabled={busy}>{busy ? 'Confirmando…' : 'Entrar como administrador'}</button></form>{error && <p role="alert">{error}</p>}<p><a href="/">Voltar ao início</a></p></section></main>;
}
export function AdminSessionBar() {
  const { authenticated } = useAdminAccess();
  const [error, setError] = useState('');
  if (!authenticated) return null;
  return <aside className="session-status-notice no-print"><span>Sessão administrativa ativa</span><button onClick={() => { void api('/api/admin-session', undefined, 'DELETE').then(() => { location.replace('/'); }).catch(failure => setError(message(failure))); }}>Sair do acesso administrativo</button>{error && <span role="alert">{error}</span>}</aside>;
}
