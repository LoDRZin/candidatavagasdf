import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Brand } from '../components/Brand';
import { Icon, type IconName } from '../components/Icon';
import { useAuth } from '../platform/Auth';
import { api, go } from '../platform/api';
import './DashboardLayout.css';

type NavigationItem = {
  label: string;
  description: string;
  href: string;
  icon: IconName;
  matches: (path: string) => boolean;
};

const navigation: NavigationItem[] = [
  { label: 'Visão geral', description: 'Resumo do seu espaço', href: '/dashboard', icon: 'dashboard', matches: path => path === '/dashboard' },
  { label: 'Meus currículos', description: 'Crie e revise seu currículo', href: '/editor', icon: 'file', matches: path => path === '/editor' || path.startsWith('/curriculo') },
  { label: 'Entrevistas', description: 'Pratique respostas', href: '/entrevistas', icon: 'briefcase', matches: path => path.startsWith('/entrevistas') || path.includes('/entrevista') },
  { label: 'Orientação', description: 'Organize os próximos passos', href: '/orientacao', icon: 'compass', matches: path => path.startsWith('/orientacao') },
  { label: 'Chat IA', description: 'Continue suas conversas', href: '/chat-ia', icon: 'message', matches: path => path.startsWith('/chat-ia') },
  { label: 'Uso', description: 'Acompanhe sua cota de IA', href: '/uso', icon: 'clock', matches: path => path.startsWith('/uso') },
  { label: 'Cursos', description: 'Aprenda no seu ritmo', href: '/cursos', icon: 'book', matches: path => path.startsWith('/cursos') || path === '/meu-aprendizado' },
];

const adminNavigation: NavigationItem = { label: 'Admin', description: 'Gerencie usuários e uso', href: '/admin', icon: 'lock', matches: path => path === '/admin' || path.startsWith('/admin/') };

const routeLabels: Array<[RegExp, string]> = [
  [/^\/dashboard$/, 'Visão geral'],
  [/^\/(?:editor|curriculo)/, 'Meus currículos'],
  [/entrevista/, 'Entrevistas'],
  [/^\/orientacao/, 'Orientação'],
  [/^\/chat-ia/, 'Chat IA'],
  [/^\/uso/, 'Uso'],
  [/^\/admin/, 'Administração'],
  [/^\/(?:cursos|meu-aprendizado)/, 'Cursos'],
  [/^\/aprender/, 'Aprender'],
  [/^\/candidaturas/, 'Candidaturas'],
  [/^\/historias/, 'Histórias'],
  [/^\/perfil-profissional/, 'Objetivo profissional'],
  [/^\/conta/, 'Minha conta'],
  [/^\/carta/, 'Carta de apresentação'],
];

function currentRouteLabel(path: string) {
  return routeLabels.find(([pattern]) => pattern.test(path))?.[1] ?? 'Meu espaço';
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toLocaleUpperCase('pt-BR') ?? '').join('') || 'CV';
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const path = window.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('conectavagasdf.sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [query, setQuery] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('conectavagasdf.theme') === 'dark'; }
    catch { return false; }
  });
  const paletteInput = useRef<HTMLInputElement>(null);

  const visibleNavigation = useMemo(() => user?.role === 'admin' ? [...navigation, adminNavigation] : navigation, [user?.role]);
  const filteredNavigation = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return term ? visibleNavigation.filter(item => `${item.label} ${item.description}`.toLocaleLowerCase('pt-BR').includes(term)) : visibleNavigation;
  }, [query, visibleNavigation]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('conectavagasdf.theme', dark ? 'dark' : 'light'); } catch { /* O tema continua funcionando nesta sessão. */ }
  }, [dark]);

  useEffect(() => {
    try { localStorage.setItem('conectavagasdf.sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* A preferência continua funcionando nesta sessão. */ }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('pt-BR') === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMobileOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const frame = window.requestAnimationFrame(() => paletteInput.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [paletteOpen]);

  function navigate(href: string) {
    setMobileOpen(false);
    setPaletteOpen(false);
    setAccountOpen(false);
    go(href);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', {});
      await refresh();
      go('/');
    } finally {
      setLoggingOut(false);
    }
  }

  return <div className={`dashboard-layout${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
    {mobileOpen && <button className="dashboard-layout-overlay" type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar navegação" />}

    <aside id="dashboard-navigation" className={`dashboard-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Navegação principal">
      <div className="dashboard-sidebar-brand">
        <button className="dashboard-brand-link brand-link" type="button" onClick={() => navigate('/')} aria-label="Conecta Vagas — início"><Brand /></button>
        <button className="dashboard-sidebar-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><Icon name="back" size={16} strokeWidth={2} /></button>
      </div>
      <div className="dashboard-sidebar-cta">
        <button type="button" className="dashboard-primary-button" onClick={() => navigate('/editor')} aria-label="Novo currículo" title={sidebarCollapsed ? 'Novo currículo' : undefined}><Icon name="plus" size={16} strokeWidth={2} /> <span>Novo currículo</span></button>
      </div>
      <nav className="dashboard-sidebar-nav">
        <p className="dashboard-section-label">Meu espaço</p>
        {visibleNavigation.map(item => <button key={item.href} type="button" className={`dashboard-sidebar-link${item.matches(path) ? ' is-active' : ''}`} onClick={() => navigate(item.href)} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} aria-current={item.matches(path) ? 'page' : undefined}>
          <Icon name={item.icon} size={16} strokeWidth={2} /><span>{item.label}</span>
        </button>)}
      </nav>
      <div className="dashboard-sidebar-footer">
        <p className="dashboard-section-label">Configurações</p>
        <button type="button" className={`dashboard-sidebar-link${path === '/conta' ? ' is-active' : ''}`} onClick={() => navigate('/conta')} aria-label="Minha conta" title={sidebarCollapsed ? 'Minha conta' : undefined}><Icon name="user" size={16} strokeWidth={2} /><span>Minha conta</span></button>
        <button type="button" className="dashboard-sidebar-link" onClick={() => navigate('/privacidade')} aria-label="Privacidade" title={sidebarCollapsed ? 'Privacidade' : undefined}><Icon name="lock" size={16} strokeWidth={2} /><span>Privacidade</span></button>
        <button type="button" className="dashboard-sidebar-collapse" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral'} title={sidebarCollapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral'}><Icon name="back" size={16} strokeWidth={2} /><span>{sidebarCollapsed ? 'Expandir' : 'Minimizar barra'}</span></button>
      </div>
    </aside>

    <div className="dashboard-layout-content">
      <header className="dashboard-topbar">
        <button type="button" className="dashboard-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" aria-controls="dashboard-navigation" aria-expanded={mobileOpen}><Icon name="menu" size={20} strokeWidth={2} /></button>
        <div className="dashboard-breadcrumb"><button type="button" onClick={() => navigate('/dashboard')}>Meu espaço</button><Icon name="chevron" size={12} strokeWidth={2} /><span>{currentRouteLabel(path)}</span></div>
        <button type="button" className="dashboard-global-search" onClick={() => setPaletteOpen(true)} aria-label="Abrir busca global"><Icon name="search" size={16} strokeWidth={2} /><span>Buscar no seu espaço</span><kbd><span>Ctrl</span><span>K</span></kbd></button>
        <button type="button" className="dashboard-icon-button dashboard-mobile-search" onClick={() => setPaletteOpen(true)} aria-label="Abrir busca global"><Icon name="search" size={20} strokeWidth={2} /></button>
        <button type="button" className="dashboard-icon-button" onClick={() => setDark(value => !value)} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}><Icon name={dark ? 'sun' : 'moon'} size={16} strokeWidth={2} /></button>
        <div className="dashboard-account">
          <button type="button" className="dashboard-account-trigger" onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen} aria-haspopup="menu"><span className="dashboard-avatar">{initials(user?.name ?? '')}</span><span className="dashboard-account-name">{user?.name ?? 'Minha conta'}</span><Icon name="chevronDown" size={14} strokeWidth={2} /></button>
          {accountOpen && <div className="dashboard-account-menu" role="menu"><button type="button" role="menuitem" onClick={() => navigate('/conta')}>Minha conta</button><button type="button" role="menuitem" disabled={loggingOut} onClick={() => { void logout(); }}>{loggingOut ? 'Saindo…' : 'Sair da conta'}</button></div>}
        </div>
      </header>

      <main className="dashboard-main" id="dashboard-main"><div className="dashboard-page-container">{children}</div></main>
    </div>

    {paletteOpen && <div className="dashboard-palette-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setPaletteOpen(false); }}>
      <section className="dashboard-palette" role="dialog" aria-modal="true" aria-labelledby="dashboard-palette-title">
        <div className="dashboard-palette-search"><Icon name="search" size={16} strokeWidth={2} /><label id="dashboard-palette-title" className="sr-only" htmlFor="dashboard-palette-input">Navegação rápida</label><input id="dashboard-palette-input" ref={paletteInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="O que você quer fazer?" /></div>
        <div className="dashboard-palette-results"><p className="dashboard-section-label">Ações rápidas</p>{filteredNavigation.map(item => <button key={item.href} type="button" onClick={() => navigate(item.href)}><span className="dashboard-palette-icon"><Icon name={item.icon} size={16} strokeWidth={2} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="arrowUp" size={16} strokeWidth={2} /></button>)}{filteredNavigation.length === 0 && <p className="dashboard-palette-empty">Nada encontrado. Tente outra palavra.</p>}</div>
        <footer><span>Use o teclado para continuar trabalhando.</span><button type="button" onClick={() => setPaletteOpen(false)}>Esc</button></footer>
      </section>
    </div>}
  </div>;
}
