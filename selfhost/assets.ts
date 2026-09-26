import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const types: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function createAssetFetcher(directory: string) {
  const root = resolve(directory);
  return async (input: RequestInfo | URL): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método não permitido.', { status: 405 });
    const url = new URL(request.url);
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return new Response('Caminho inválido.', { status: 400 }); }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) return new Response('Não encontrado.', { status: 404 });
    const candidate = resolve(root, `.${pathname}`);
    const outside = relative(root, candidate);
    if (outside.startsWith(`..${sep}`) || outside === '..') return new Response('Não encontrado.', { status: 404 });
    let file = candidate;
    let fileStat = await stat(file).catch(() => null);
    if (!fileStat?.isFile()) {
      if (extname(pathname)) return new Response('Não encontrado.', { status: 404 });
      file = resolve(root, 'index.html');
      fileStat = await stat(file).catch(() => null);
    }
    if (!fileStat?.isFile()) return new Response('Aplicação não compilada.', { status: 503 });
    const extension = extname(file);
    const headers = new Headers({
      'Content-Type': types[extension] || 'application/octet-stream',
      'Content-Length': String(fileStat.size),
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, { headers });
  };
}
