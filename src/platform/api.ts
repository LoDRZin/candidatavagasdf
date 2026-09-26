export class ApiError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }
export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', headers: Record<string, string> = {}, timeoutMs = 45_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new ApiError('A solicitação demorou demais. Tente novamente.', 0, 'REQUEST_TIMEOUT');
    throw new ApiError(navigator.onLine ? 'Não foi possível conectar ao serviço. Tente novamente.' : 'Você está sem conexão. Reconecte-se para continuar.', 0, 'NETWORK_ERROR');
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  const declaredLength = Number(response.headers.get('Content-Length') ?? 0);
  if (declaredLength > 2_000_000) throw new ApiError('A resposta recebida é grande demais.', 502, 'RESPONSE_TOO_LARGE');
  const result = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    if (result?.error?.code === 'ADMIN_REQUIRED') window.dispatchEvent(new Event('admin-access-denied'));
    throw new ApiError(result?.error?.message ?? 'Não foi possível concluir a solicitação.', response.status, result?.error?.code ?? 'NETWORK_ERROR');
  }
  if (!contentType.includes('application/json')) throw new ApiError('O serviço respondeu em um formato inesperado.', 502, 'INVALID_RESPONSE');
  return result as T;
}
export async function apiCollection<T>(path: string, field: string, maxPages = 20): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(path, window.location.origin);
    if (cursor) url.searchParams.set('cursor', cursor);
    const result = await api<Record<string, unknown> & { nextCursor?: string | null }>(url.pathname + url.search);
    const batch = result[field];
    if (!Array.isArray(batch)) throw new ApiError('A lista recebida está em um formato inesperado.', 502, 'INVALID_RESPONSE');
    items.push(...batch as T[]);
    cursor = result.nextCursor ?? null;
    if (!cursor) return items;
  }
  throw new ApiError('A lista tem páginas demais para carregar de uma vez.', 502, 'PAGE_LIMIT');
}
export function message(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.'; }
export function go(path: string) { if (path === '/admin' || path.startsWith('/admin/')) { window.location.assign(path); return; } window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo(0, 0); }
