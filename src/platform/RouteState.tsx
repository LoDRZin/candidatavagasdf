import { Component, type ErrorInfo, type ReactNode } from 'react';
import { go } from './api';
import { Brand } from '../components/Brand';

export function RouteSkeleton() {
  return <main className="platform-page route-skeleton" role="status" aria-label="Carregando conteúdo">
    <div className="route-skeleton-line route-skeleton-eyebrow" aria-hidden="true" />
    <div className="route-skeleton-line route-skeleton-title" aria-hidden="true" />
    <div className="route-skeleton-line route-skeleton-description" aria-hidden="true" />
    <div className="route-skeleton-grid" aria-hidden="true"><div /><div /><div /></div>
  </main>;
}

export function RouteSkeletonHeader() {
  return <header className="site-header app-site-header route-skeleton-header">
    <a className="brand-link" href="/"><Brand /></a>
    <div className="route-skeleton-nav" aria-hidden="true"><span /><span /><span /></div>
  </header>;
}

export function NotFoundPage() {
  return <main className="platform-page route-state"><span className="eyebrow">ERRO 404</span><h1>Esta página não existe</h1><p>O endereço pode ter sido digitado incorretamente ou a página pode ter mudado.</p><div className="platform-actions"><button className="button button-primary" onClick={() => go('/dashboard')}>Ir para meu painel</button><button className="button" onClick={() => go('/')}>Voltar ao início</button></div></main>;
}

export class RouteErrorBoundary extends Component<{ children: ReactNode; routeKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Do not log rendered content: route pages may contain private career data.
    console.error(JSON.stringify({ event: 'route_render_failed', route: this.props.routeKey }));
  }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; routeKey: string }>) {
    if (previous.routeKey !== this.props.routeKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="platform-page route-state" role="alert"><span className="eyebrow">NÃO FOI POSSÍVEL ABRIR</span><h1>Esta página encontrou um problema</h1><p>Seu rascunho local não foi apagado. Recarregue ou volte ao painel para continuar.</p><div className="platform-actions"><button className="button button-primary" onClick={() => location.reload()}>Recarregar página</button><button className="button" onClick={() => go('/dashboard')}>Voltar ao painel</button></div></main>;
  }
}
