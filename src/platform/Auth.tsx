import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import type { User } from '../../shared/contracts';
import { safeReturnTo } from '../../shared/access-policy';
import { api, go, message } from './api';
import { Brand } from '../components/Brand';
import { Icon } from '../components/Icon';
type AuthState = { user: User | null; loading: boolean; googleAvailable: boolean; localMail: boolean; sessionError: string; refresh: () => Promise<void> };
const AuthContext = createContext<AuthState>({ user: null, loading: true, googleAvailable: false, localMail: false, sessionError: '', refresh: async () => {} });
type PasswordStrength = { level: 'empty' | 'unsafe' | 'medium' | 'safe'; label: string; value: number };
function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { level: 'empty', label: 'Digite uma senha', value: 0 };
  if (password.length < 8) return { level: 'unsafe', label: 'Senha não segura', value: 28 };
  const variety = [/[a-zá-ú]/, /[A-ZÁ-Ú]/, /\d/, /[^\p{L}\p{N}\s]/u].filter(pattern => pattern.test(password)).length;
  if (password.length >= 12 || variety >= 3) return { level: 'safe', label: 'Senha segura', value: 100 };
  return { level: 'medium', label: 'Senha pode ficar mais segura', value: 62 };
}
export function useAuth() { return useContext(AuthContext); }
export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState({ user: null as User | null, googleAvailable: false, localMail: false });
  const [loading, setLoading] = useState(true), [sessionError, setSessionError] = useState('');
  async function refresh() { try { setValue(await api<typeof value>('/api/auth/session', undefined, 'GET', {}, 8_000)); setSessionError(''); } catch (error) { setValue({ user: null, googleAvailable: false, localMail: false }); setSessionError(message(error)); } finally { setLoading(false); } }
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onRestoredPage = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onRestoredPage);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onRestoredPage); };
  }, []);
  return <AuthContext.Provider value={{ ...value, loading, sessionError, refresh }}>{children}</AuthContext.Provider>;
}
export function SessionStatusNotice() {
  const { sessionError, refresh } = useAuth();
  if (!sessionError) return null;
  return <aside className="session-status-notice no-print" role="alert"><span>Não conseguimos confirmar sua sessão agora. Seus dados locais continuam neste dispositivo.</span><button type="button" onClick={() => { void refresh(); }}>Tentar novamente</button></aside>;
}
export function AccountNav({ path }: { path: string }) {
  const { user } = useAuth();
  const isAuth = path === '/login' || path === '/cadastro';
  const curriculumActive = path === '/dashboard' || path.startsWith('/editor');
  const link = (href: string, label: string, active = false) => <a href={href} aria-current={active || path === href ? 'page' : undefined} onClick={e => { e.preventDefault(); go(href); }}>{label}</a>;
  if (!user) return (
    <header className={`site-header app-site-header no-print${isAuth ? ' auth-route-nav' : ''}`} aria-label="Navegação principal">
      <a className="brand-link" href="/" onClick={e => { e.preventDefault(); go('/'); }}><Brand /></a>
      <div className="app-nav-actions">
        {link('/privacidade', 'Privacidade')}
        {link('/termos', 'Termos de uso')}
        <a href="/login" className="button button-small button-primary" onClick={e => { e.preventDefault(); go('/login'); }}>Entrar</a>
      </div>
    </header>
  );
  return (
    <header className={`site-header app-site-header no-print${isAuth ? ' auth-route-nav' : ''}`} aria-label="Navegação principal">
      <a className="brand-link" href="/" aria-current={path === '/' ? 'page' : undefined} onClick={e => { e.preventDefault(); go('/'); }}><Brand /></a>
      <nav className="desktop-nav app-nav">
        {link('/dashboard', 'Currículo', curriculumActive)}
        {link('/aprender', 'Aprender')}
        {link('/entrevistas', 'Entrevistas')}
        {link('/orientacao', 'Orientação')}
        {link('/cursos', 'Cursos')}
      </nav>
      <div className="app-nav-actions">
        {link('/conta', user.name)}
        <a className="button button-small button-primary app-nav-cta" href="/dashboard" onClick={e => { e.preventDefault(); go('/dashboard'); }}>Meu currículo <Icon name="arrow" size={14} /></a>
      </div>
    </header>
  );
}
export function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Carregando conta…</p>;
  if (!user) return <div className="platform-card"><h2>Continue com sua conta</h2><p>Entre para salvar seu progresso e continuar em qualquer dispositivo.</p><a className="button button-primary" href={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Entrar</a></div>;
  if (!user.email_verified_at) return <div className="platform-card"><h2>Confirme seu e-mail</h2><p>Enviamos um link para {user.email}.</p><a href="/verificar-email">Confirmar ou reenviar</a></div>;
  return children;
}
export function AuthPage({ path }: { path: string }) {
  const { user, googleAvailable, localMail, refresh } = useAuth();
  const [email, setEmail] = useState(user?.email ?? ''), [password, setPassword] = useState(''), [name, setName] = useState(user?.name ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [links, setLinks] = useState<{ url: string; created_at: string }[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [linkToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  useEffect(() => { if (location.hash) history.replaceState({}, '', location.pathname + location.search); }, []);
  const register = path === '/cadastro', login = path === '/login', verify = path === '/verificar-email', reset = path === '/redefinir-senha', account = path === '/conta';
  const passwordStrength = getPasswordStrength(password), showPasswordStrength = register || reset;
  useEffect(() => { if (account && user) void api<{ providers: { provider: string }[] }>('/api/account').then(result => setProviders(result.providers.map(p => p.provider))).catch(e => setError(message(e))); }, [account, user?.id]);
  const title = register ? 'Seu próximo passo começa aqui' : login ? 'Bom ter você de volta' : verify ? 'Confirme seu e-mail' : reset ? 'Escolha uma nova senha' : account ? 'Sua conta' : 'Recupere seu acesso';
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  async function submit(event: FormEvent) {
    event.preventDefault(); await run(async () => {
      if (login || register) {
        const result = await api<{ user?: User; message?: string }>(`/api/auth/${register ? 'register' : 'login'}`, { email, password, ...(register ? { name, terms } : {}) });
        setPassword(''); await refresh();
        if (result.user) go(result.user.email_verified_at ? safeReturnTo(new URLSearchParams(location.search).get('returnTo')) : '/verificar-email'); else setNotice(result.message ?? 'Confira seu e-mail.');
      } else if (verify) { const result = await api<{ message: string }>('/api/auth/email/verify', { token: linkToken }); setNotice(result.message); await refresh(); }
      else if (reset) { const result = await api<{ message: string }>('/api/auth/password/reset', { token: linkToken, password }); setNotice(result.message); setPassword(''); await refresh(); }
      else if (account) { await api('/api/account', { name }, 'PATCH'); await refresh(); setNotice('Nome atualizado.'); }
      else { const result = await api<{ message: string }>('/api/auth/password/forgot', { email }); setNotice(result.message); }
    });
  }
  if (account && !user) return <RequireUser><span /></RequireUser>;
  if (account && user) {
    const accountInitial = (user.name.trim()[0] ?? user.email[0] ?? 'C').toLocaleUpperCase('pt-BR');
    return <main className="zeno-workspace-page zeno-account-page">
      <header className="zeno-workspace-header">
        <div><p className="zeno-eyebrow">SEU ESPAÇO PROFISSIONAL</p><h1>Sua conta</h1><p>Gerencie seus dados, acessos e preferências em um só lugar.</p></div>
      </header>

      <div className="zeno-account-grid">
        <aside className="zeno-account-summary" aria-label="Resumo da conta">
          <span className="zeno-account-avatar" aria-hidden="true">{accountInitial}</span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <div><span>Login conectado</span><strong>{providers.length ? providers.join(', ') : 'E-mail e senha'}</strong></div>
        </aside>

        <section className="platform-card zeno-account-settings" aria-labelledby="account-settings-title">
          <div className="zeno-account-section-heading"><div><p className="zeno-eyebrow">DADOS DA CONTA</p><h2 id="account-settings-title">Suas informações</h2></div><span>Você pode atualizar seu nome quando precisar.</span></div>
          <form className="zeno-account-name-form" onSubmit={e => { void submit(e); }}>
            <label>Seu nome<input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
            <button disabled={busy} className="button button-primary">{busy ? 'Salvando…' : 'Salvar nome'} <Icon name="arrow" size={16} /></button>
          </form>

          <div className="account-actions">
            <a className="account-export-link" href="/api/account/export" download="meus-dados.json"><span>Exportar meus dados</span><small>Baixe uma cópia das informações salvas</small><b>↓</b></a>
            <button className="button account-action-button" disabled={busy || !googleAvailable} onClick={() => { void run(async () => { const result = await api<{ url: string }>('/api/auth/google/link', {}); location.href = result.url; }); }}>Vincular Google <small>exige login recente</small></button>
            <button className="button account-action-button" disabled={busy} onClick={() => { void run(async () => { await api('/api/auth/logout-others', {}); setNotice('Outras sessões encerradas.'); }); }}>Encerrar outras sessões</button>
            <button className="button account-action-button account-logout" disabled={busy} onClick={() => { void run(async () => { await api('/api/auth/logout', {}); await refresh(); go('/'); }); }}>Sair da conta</button>
            <details className="account-delete"><summary>Excluir minha conta</summary><p>Exclui permanentemente currículos, respostas e progresso salvos na conta. Exige login nos últimos cinco minutos.</p><button className="button danger" disabled={busy} onClick={() => { if (confirm('Excluir permanentemente sua conta e todos os dados associados?')) void run(async () => { await api('/api/account', { confirmation: 'EXCLUIR' }, 'DELETE'); await refresh(); go('/'); }); }}>Excluir permanentemente</button></details>
          </div>

          {localMail && <details className="zeno-account-local-mail"><summary>Caixa de e-mail de desenvolvimento (local)</summary><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><button className="button" onClick={() => { void run(async () => { setLinks((await api<{ messages: typeof links }>('/api/auth/local-mail', { email })).messages); }); }}>Consultar links locais</button>{links.map(link => <p key={link.url}><a href={link.url}>Abrir confirmação / recuperação ({new Date(link.created_at).toLocaleTimeString()})</a></p>)}</details>}
          {notice && <p role="status" className="success-note">{notice}</p>}{error && <p role="alert" className="error-note">{error}</p>}
        </section>
      </div>
    </main>;
  }
  const fullAuth = register || login;
  const compactAuth = !fullAuth && !verify && !account;
  return <main className={`platform-page auth-page${fullAuth ? ' auth-page-full' : ''}${compactAuth ? ' auth-page-compact' : ''}`}>
    {fullAuth && <aside className="auth-story"><a href="/" className="auth-story-brand"><Brand light /></a><div className="auth-story-copy"><span className="eyebrow eyebrow-on-dark">SEU PRÓXIMO PASSO COMEÇA AQUI</span><h2>{register ? <>Seu espaço para<br /><em>começar com clareza.</em></> : <>Da sua trajetória<br /><em>à próxima oportunidade.</em></>}</h2><p>{register ? 'Crie seu acesso e organize currículo, preparação e aprendizado no seu ritmo.' : 'Entre para continuar seu currículo e retomar tudo de onde parou.'}</p><div className="auth-story-steps"><div><b>01</b><span>Conte sua história profissional</span></div><div><b>02</b><span>Monte um currículo com sua cara</span></div><div><b>03</b><span>Revise e escolha o próximo passo</span></div></div></div><p className="auth-story-foot"><Icon name="check" size={15} /> Você decide o que salvar e quando continuar.</p></aside>}
    <div className="auth-form-pane"><div className="platform-heading"><a href="/" className="auth-back">← Voltar ao início</a><span className="eyebrow">{register ? 'COMECE COM O CONECTA VAGAS' : 'SEU ESPAÇO PROFISSIONAL'}</span><h1>{title}</h1><p>{account ? user?.email : register ? 'Crie sua conta e dê o primeiro passo para sua próxima oportunidade.' : 'Acesse seu currículo e continue de onde parou.'}</p></div><section className="platform-card auth-card">
    {account && <p className="account-provider">Provedores conectados: <strong>{providers.length ? providers.join(', ') : 'nenhum provedor externo'}</strong></p>}
    <form onSubmit={e => { void submit(e); }}>
      {(register || account) && <label>Seu nome<input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>}
      {(register || login || (!verify && !reset && !account)) && <label>E-mail<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {(register || login || reset) && <div className="auth-password-field">
        <label htmlFor="auth-password">Senha</label>
        <div className="password-input-shell">
          <input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={login ? 'current-password' : 'new-password'} required minLength={login ? 1 : 8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} aria-describedby={showPasswordStrength ? 'password-strength-status password-requirements' : undefined} />
          <button type="button" className="password-visibility" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} /></button>
        </div>
        {showPasswordStrength && <div className={`password-strength password-strength--${passwordStrength.level}`}>
          <div className="password-strength-track" role="progressbar" aria-label="Segurança da senha" aria-valuemin={0} aria-valuemax={100} aria-valuenow={passwordStrength.value}><span style={{ width: `${passwordStrength.value}%` }} /></div>
          <span id="password-strength-status" className="password-strength-status" aria-live="polite">{passwordStrength.label}</span>
        </div>}
        {showPasswordStrength && <small id="password-requirements">Use pelo menos 8 caracteres. Combine letras, números ou símbolos.</small>}
      </div>}
      {register && <label className="check-label"><input type="checkbox" required checked={terms} onChange={e => setTerms(e.target.checked)} /><span>Li e aceito os <a href="/termos" target="_blank" rel="noreferrer">termos de uso</a> e a <a href="/privacidade" target="_blank" rel="noreferrer">política de privacidade</a>.</span></label>}
      {verify && <p>{linkToken ? 'Confirme abaixo para ativar a conta.' : `Abra o link enviado para ${user?.email ?? 'seu e-mail'}.`}</p>}
      {(!verify || linkToken) && <button disabled={busy} className="button button-primary">{busy ? 'Aguarde…' : register ? 'Criar minha conta' : login ? 'Entrar' : verify ? 'Confirmar e-mail' : reset ? 'Atualizar senha' : account ? 'Salvar nome' : 'Enviar instruções'} <Icon name="arrow" size={16} /></button>}
    </form>
    {(register || login) && <><div className="platform-divider">ou</div><button className="button google-button" disabled={!googleAvailable || busy || (register && !terms)} onClick={() => { location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo(new URLSearchParams(location.search).get('returnTo')))}`; }}>Continuar com Google</button>{!googleAvailable && <small>O login Google aguarda configuração.</small>}<p className="muted">Ao continuar com Google, você aceita os <a href="/termos">termos de uso</a>.</p><p><a href={login ? '/cadastro' : '/login'}>{login ? 'Ainda não tenho conta' : 'Já tenho uma conta'}</a> · <a href="/recuperar-senha">Esqueci minha senha</a></p></>}
    {verify && user && <button disabled={busy} className="button" onClick={() => { void run(async () => { await api('/api/auth/email/resend', {}); setNotice('E-mail reenviado.'); }); }}>Reenviar confirmação</button>}
    {((verify && user?.email_verified_at) || reset) && <p><a href={user?.email_verified_at ? '/dashboard' : '/login'}>Continuar</a></p>}
    {account && <div className="account-actions"><a className="account-export-link" href="/api/account/export" download="meus-dados.json"><span>Exportar meus dados</span><small>Baixe uma cópia das informações salvas</small><b>↓</b></a><button className="button account-action-button" disabled={busy || !googleAvailable} onClick={() => { void run(async () => { const result = await api<{ url: string }>('/api/auth/google/link', {}); location.href = result.url; }); }}>Vincular Google <small>exige login recente</small></button><button className="button account-action-button" disabled={busy} onClick={() => { void run(async () => { await api('/api/auth/logout-others', {}); setNotice('Outras sessões encerradas.'); }); }}>Encerrar outras sessões</button><button className="button account-action-button account-logout" disabled={busy} onClick={() => { void run(async () => { await api('/api/auth/logout', {}); await refresh(); go('/'); }); }}>Sair da conta</button><details className="account-delete"><summary>Excluir minha conta</summary><p>Exclui permanentemente currículos, respostas e progresso salvos na conta. Exige login nos últimos cinco minutos.</p><button className="button danger" disabled={busy} onClick={() => { if (confirm('Excluir permanentemente sua conta e todos os dados associados?')) void run(async () => { await api('/api/account', { confirmation: 'EXCLUIR' }, 'DELETE'); await refresh(); go('/'); }); }}>Excluir permanentemente</button></details></div>}
    {localMail && <details><summary>Caixa de e-mail de desenvolvimento (local)</summary><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><button className="button" onClick={() => { void run(async () => { setLinks((await api<{ messages: typeof links }>('/api/auth/local-mail', { email })).messages); }); }}>Consultar links locais</button>{links.map(l => <p key={l.url}><a href={l.url}>Abrir confirmação / recuperação ({new Date(l.created_at).toLocaleTimeString()})</a></p>)}</details>}
    {notice && <p role="status" className="success-note">{notice}</p>}{error && <p role="alert" className="error-note">{error}</p>}
    </section></div></main>;
}
