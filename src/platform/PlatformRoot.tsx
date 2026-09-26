import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AccountNav, AuthPage, AuthProvider, SessionStatusNotice, useAuth } from './Auth';
import { ConnectivityNotice } from './ConnectivityNotice';
import { NotFoundPage, RouteErrorBoundary, RouteSkeleton, RouteSkeletonHeader } from './RouteState';
import { matchRoute, normalizePathname, routeTitle } from './routes';
import { requiresAdminPage, requiresUserPage } from '../../shared/access-policy';
import { AdminAccessProvider, AdminLogin, AdminSessionBar, useAdminAccess } from './AdminAccess';
import { DashboardLayout } from '../layouts/DashboardLayout';
import App from '../App';
import './platform.css';
import './tools.css';
import './workspace.css';

const CoursesPage = lazy(() => import('./Courses').then(module => ({ default: module.CoursesPage })));
const LessonPage = lazy(() => import('./Courses').then(module => ({ default: module.LessonPage })));
const LearningPage = lazy(() => import('./Courses').then(module => ({ default: module.LearningPage })));
const CourseAdmin = lazy(() => import('./Courses').then(module => ({ default: module.CourseAdmin })));
const ApplicationsPage = lazy(() => import('./Career').then(module => ({ default: module.ApplicationsPage })));
const CareerProfilePage = lazy(() => import('./Career').then(module => ({ default: module.CareerProfilePage })));
const ApplicationMaterialsPage = lazy(() => import('./ApplicationMaterials').then(module => ({ default: module.ApplicationMaterialsPage })));
const CareerStoriesPage = lazy(() => import('./CareerStories').then(module => ({ default: module.CareerStoriesPage })));
const ApplicationInterviewPage = lazy(() => import('./ApplicationInterview').then(module => ({ default: module.ApplicationInterviewPage })));
const ContactTemplatesPage = lazy(() => import('./CareerTools').then(module => ({ default: module.ContactTemplatesPage })));
const JobSafetyPage = lazy(() => import('./CareerTools').then(module => ({ default: module.JobSafetyPage })));
const AiChatPage = lazy(() => import('./AiChat'));
const UsagePage = lazy(() => import('./Usage'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));

function Content() {
  const [path, setPath] = useState(() => normalizePathname(location.pathname)), [search, setSearch] = useState(location.search);
  const previousPath = useRef(path);
  const contentTarget = useRef<HTMLDivElement>(null);
  const { user, loading } = useAuth();
  const admin = useAdminAccess();
  const adminRestricted = requiresAdminPage(path), userRestricted = requiresUserPage(path);
  const accountAdmin = user?.role === 'admin';
  const adminAuthorized = admin.authenticated || accountAdmin;
  const waitingForAccess = (adminRestricted && (admin.loading || loading || !adminAuthorized) && !admin.error) || (userRestricted && (loading || !user));
  useEffect(() => {
    if (adminRestricted && !admin.loading && !loading && !adminAuthorized && !admin.error) location.replace(`/acesso-admin?returnTo=${encodeURIComponent(path + search)}`);
    if (userRestricted && !loading && !user) location.replace(`/login?returnTo=${encodeURIComponent(path + search)}`);
  }, [adminRestricted, userRestricted, admin.loading, adminAuthorized, admin.error, loading, user, path, search]);
  useEffect(() => { const update = () => { const normalized = normalizePathname(location.pathname); if (normalized !== location.pathname) history.replaceState({}, '', normalized + location.search + location.hash); setPath(normalized); setSearch(location.search); }; update(); window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);
  const route = useMemo(() => matchRoute(path), [path]);
  useEffect(() => { document.title = routeTitle(route, path); }, [route, path]);
  useEffect(() => {
    if (previousPath.current === path) return;
    previousPath.current = path;
    contentTarget.current?.focus({ preventScroll: true });
  }, [path]);
  let content;
  if (adminRestricted && admin.error && !accountAdmin) content = <main className="platform-page route-state" role="alert"><h1>Não foi possível confirmar o acesso</h1><p>Verifique a conexão e tente novamente. Esta página permanece protegida até a confirmação.</p><button className="button button-primary" onClick={() => { void admin.refresh(); }}>Tentar novamente</button></main>;
  else if (waitingForAccess) content = <RouteSkeleton />;
  else if (path === '/acesso-admin') content = <AdminLogin />;
  else if (route.kind === 'auth') content = <AuthPage key={route.path + search} path={route.path} />;
  else if (route.kind === 'course-admin') content = <CourseAdmin />;
  else if (route.kind === 'admin-dashboard') content = <AdminDashboard />;
  else if (route.kind === 'lesson') content = <LessonPage key={`${user?.id ?? 'guest'}:${path}`} id={route.id} slug={route.slug} />;
  else if (route.kind === 'courses') content = <CoursesPage key={path + search} slug={route.slug} />;
  else if (route.kind === 'learning') content = <LearningPage key={user?.id ?? 'guest'} />;
  else if (route.kind === 'ai-chat') content = <AiChatPage key={user?.id ?? 'guest'} />;
  else if (route.kind === 'usage') content = <UsagePage key={user?.id ?? 'guest'} />;
  else if (route.kind === 'career-profile') content = <CareerProfilePage key={user?.id ?? 'guest'} />;
  else if (route.kind === 'stories') content = <CareerStoriesPage key={user?.id ?? 'guest'} />;
  else if (route.kind === 'job-safety') content = <JobSafetyPage />;
  else if (route.kind === 'contact-templates') content = <ContactTemplatesPage />;
  else if (route.kind === 'application-interview') content = <ApplicationInterviewPage key={`${user?.id ?? 'guest'}:${path}`} applicationId={route.applicationId} />;
  else if (route.kind === 'application-materials') content = <ApplicationMaterialsPage key={`${user?.id ?? 'guest'}:${path}`} applicationId={route.applicationId} />;
  else if (route.kind === 'applications') content = <ApplicationsPage key={`${user?.id ?? 'guest'}:${path}`} applicationId={route.applicationId} />;
  else if (route.kind === 'terms') content = <main className="platform-page"><article className="platform-card"><h1>Termos de uso</h1><p>A conectavagasdf oferece ferramentas educativas de carreira. Você é responsável pela veracidade das informações do seu currículo e por revisar sugestões de IA. Não há promessa de contratação, aprovação em seleção ou certificação acadêmica.</p><p>Proteja sua senha e utilize apenas contas e informações próprias. Não use o serviço para fraude, abuso ou tentativa de acessar dados de terceiros. Você pode exportar seus dados e excluir sua conta na página da conta.</p><p>O envio de informações para a IA do Conecta Vagas é opcional, exige confirmação a cada solicitação e pode envolver um provedor externo de IA. As sugestões podem conter erros. Consulte também a <a href="/privacidade">política de privacidade</a>.</p><p>Versão: 23/09/2026.</p></article></main>;
  else if (route.kind === 'app') content = <App key={`${user?.id ?? 'guest'}:${admin.authenticated}`} />;
  else content = <NotFoundPage />;
  const dashboardShell = (userRestricted || (adminRestricted && accountAdmin)) && Boolean(user) && !waitingForAccess;
  return <><a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>{route.kind !== 'app' && !dashboardShell ? <AccountNav path={path} /> : (waitingForAccess || (adminRestricted && admin.error)) && <RouteSkeletonHeader />}<AdminSessionBar /><ConnectivityNotice /><SessionStatusNotice /><div id="conteudo-principal" tabIndex={-1} ref={contentTarget}><RouteErrorBoundary routeKey={path}><Suspense fallback={<RouteSkeleton />}>{dashboardShell ? <DashboardLayout>{content}</DashboardLayout> : content}</Suspense></RouteErrorBoundary></div></>;
}
export default function PlatformRoot() { return <AdminAccessProvider><AuthProvider><Content /></AuthProvider></AdminAccessProvider>; }
