// Public exceptions are deliberately small; product pages require a signed-in account.
export const publicPages = new Set(['/', '/login', '/cadastro', '/verificar-email', '/recuperar-senha', '/redefinir-senha', '/privacidade', '/termos', '/acesso-admin']);
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/dashboard';
  return value.startsWith('/api/') ? '/dashboard' : value;
}
export function requiresAdminPage(path: string) {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return /^\/admin(?:\/|$)/.test(normalized);
}
export function requiresAdminApi(path: string) {
  return path.startsWith('/api/admin/');
}
export function requiresUserPage(path: string) {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return !publicPages.has(normalized) && !requiresAdminPage(normalized) && /^\/(dashboard|editor|curriculo|entrevistas|aprender|orientacao|chat-ia|uso|carta|conta|cursos|meu-aprendizado|perfil-profissional|historias|seguranca-da-vaga|modelos-de-contato|candidaturas)(?:\/|$)/.test(normalized);
}
export function requiresUserApi(path: string) {
  if (!path.startsWith('/api/') || path === '/api/health' || path === '/api/admin-session' || path.startsWith('/api/auth/') || path.startsWith('/api/admin/')) return false;
  return path === '/api/ai/assist' || path === '/api/ai/chat' || /^\/api\/(account|courses|lessons\/|attempts\/|me\/|reminders(?:\/|$)|applications(?:\/|$)|career-stories(?:\/|$)|cover-letters(?:\/|$)|interviews(?:\/|$)|interview-questions(?:\/|$)|chat-conversations(?:\/|$)|feedback$|resumes(?:\/|$)|ai\/resume\/structure)/.test(path);
}
export function adminReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/dashboard';
  try {
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' && requiresAdminPage(url.pathname) ? url.pathname + url.search : '/dashboard';
  } catch { return '/dashboard'; }
}
