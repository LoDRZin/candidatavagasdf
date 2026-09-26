import { z } from 'zod';
import { fail } from './http';

const cursorSchema = z.object({ at: z.string().min(1).max(40), id: z.string().uuid(), scope: z.string().max(80) });
export type PageCursor = z.infer<typeof cursorSchema>;

export function readPage(request: Request, defaultSize: number, maxSize: number, scope = '') {
  const params = new URL(request.url).searchParams;
  const rawLimit = params.get('limit');
  let size = defaultSize;
  if (rawLimit !== null) {
    if (!/^\d{1,3}$/.test(rawLimit)) fail(400, 'INVALID_PAGE', 'Limite de página inválido.');
    size = Number(rawLimit);
    if (size < 1 || size > maxSize) fail(400, 'INVALID_PAGE', `Use entre 1 e ${maxSize} itens por página.`);
  }
  const rawCursor = params.get('cursor');
  if (!rawCursor) return { size, cursor: null };
  if (rawCursor.length > 300 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) fail(400, 'INVALID_CURSOR', 'Cursor de página inválido.');
  try {
    const decoded = atob(rawCursor.replace(/-/g, '+').replace(/_/g, '/'));
    const cursor = cursorSchema.parse(JSON.parse(decoded));
    if (cursor.scope !== scope) fail(400, 'INVALID_CURSOR', 'Este cursor pertence a outro filtro.');
    return { size, cursor };
  } catch {
    return fail(400, 'INVALID_CURSOR', 'Cursor de página inválido.');
  }
}

export function pageResult<T>(rows: T[], size: number, at: (row: T) => string, id: (row: T) => string, scope = '') {
  const visible = rows.slice(0, size);
  const last = visible.at(-1);
  const nextCursor = rows.length > size && last
    ? btoa(JSON.stringify({ at: at(last), id: id(last), scope })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : null;
  return { visible, nextCursor };
}
