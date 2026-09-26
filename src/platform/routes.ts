export type RouteMatch =
  | { kind: 'app' }
  | { kind: 'auth'; path: string }
  | { kind: 'course-admin' }
  | { kind: 'admin-dashboard' }
  | { kind: 'lesson'; id: string; slug: string }
  | { kind: 'courses'; slug?: string }
  | { kind: 'learning' }
  | { kind: 'ai-chat' }
  | { kind: 'usage' }
  | { kind: 'career-profile' }
  | { kind: 'stories' }
  | { kind: 'job-safety' }
  | { kind: 'contact-templates' }
  | { kind: 'application-interview'; applicationId: string }
  | { kind: 'application-materials'; applicationId: string }
  | { kind: 'applications'; applicationId?: string }
  | { kind: 'terms' }
  | { kind: 'not-found' };

const appPaths = new Set(['/', '/dashboard', '/editor', '/curriculo', '/entrevistas', '/aprender', '/orientacao', '/carta', '/privacidade']);
const authPaths = new Set(['/login', '/cadastro', '/verificar-email', '/recuperar-senha', '/redefinir-senha', '/conta']);

export function normalizePathname(value: string) {
  const path = value.startsWith('/') ? value : `/${value}`;
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

export function matchRoute(value: string): RouteMatch {
  const path = normalizePathname(value);
  if (appPaths.has(path)) return { kind: 'app' };
  if (authPaths.has(path)) return { kind: 'auth', path };
  if (path === '/admin') return { kind: 'admin-dashboard' };
  if (path === '/admin/cursos') return { kind: 'course-admin' };

  let match = path.match(/^\/cursos\/([^/]+)\/aulas\/([^/]+)$/);
  if (match) return { kind: 'lesson', slug: match[1]!, id: match[2]! };
  match = path.match(/^\/cursos\/([^/]+)$/);
  if (path === '/cursos' || match) return { kind: 'courses', ...(match ? { slug: match[1]! } : {}) };
  if (path === '/meu-aprendizado') return { kind: 'learning' };
  if (path === '/chat-ia') return { kind: 'ai-chat' };
  if (path === '/uso') return { kind: 'usage' };
  if (path === '/perfil-profissional') return { kind: 'career-profile' };
  if (path === '/historias') return { kind: 'stories' };
  if (path === '/seguranca-da-vaga') return { kind: 'job-safety' };
  if (path === '/modelos-de-contato') return { kind: 'contact-templates' };

  match = path.match(/^\/candidaturas\/([^/]+)\/entrevista$/);
  if (match) return { kind: 'application-interview', applicationId: match[1]! };
  match = path.match(/^\/candidaturas\/([^/]+)\/materiais$/);
  if (match) return { kind: 'application-materials', applicationId: match[1]! };
  match = path.match(/^\/candidaturas\/([^/]+)$/);
  if (path === '/candidaturas' || match) return { kind: 'applications', ...(match ? { applicationId: match[1]! } : {}) };
  if (path === '/termos') return { kind: 'terms' };
  return { kind: 'not-found' };
}

export function routeTitle(route: RouteMatch, path = '') {
  if (path === '/acesso-admin') return 'Acesso administrativo · conectavagasdf';
  if (route.kind === 'app') {
    const appTitles: Record<string, string> = {
      '/': 'Início', '/dashboard': 'Meu painel', '/editor': 'Criar currículo', '/curriculo': 'Criar currículo',
      '/entrevistas': 'Preparação para entrevistas', '/aprender': 'Guias de carreira',
      '/orientacao': 'Orientação de carreira', '/admin': 'Administração de conteúdo',
      '/carta': 'Carta de apresentação', '/privacidade': 'Privacidade',
    };
    return `${appTitles[path] ?? 'Início'} · conectavagasdf`;
  }
  const titles: Record<RouteMatch['kind'], string> = {
    app: 'conectavagasdf — apoio para quem busca emprego',
    auth: 'Conta · conectavagasdf',
    'course-admin': 'Administração de cursos · conectavagasdf',
    'admin-dashboard': 'Painel administrativo · conectavagasdf',
    lesson: 'Aula · conectavagasdf',
    courses: 'Cursos · conectavagasdf',
    learning: 'Meu aprendizado · conectavagasdf',
    'ai-chat': 'Chat IA · conectavagasdf',
    usage: 'Uso · conectavagasdf',
    'career-profile': 'Objetivo profissional · conectavagasdf',
    stories: 'Histórias e conquistas · conectavagasdf',
    'job-safety': 'Segurança da vaga · conectavagasdf',
    'contact-templates': 'Mensagens profissionais · conectavagasdf',
    'application-interview': 'Preparação de entrevista · conectavagasdf',
    'application-materials': 'Materiais da candidatura · conectavagasdf',
    applications: 'Candidaturas · conectavagasdf',
    terms: 'Termos de uso · conectavagasdf',
    'not-found': 'Página não encontrada · conectavagasdf',
  };
  return titles[route.kind];
}
