const encoder = new TextEncoder();

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function secureEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([digest(left), digest(right)]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

export async function bearerMatches(request: Request, expected?: string) {
  if (!expected) return false;
  const supplied = request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/)?.[1] ?? '';
  return secureEqual(supplied, expected);
}

export function withSecurityHeaders(response: Response, request: Request) {
  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 1) {
    headers.delete('Set-Cookie');
    for (const value of setCookies) headers.append('Set-Cookie', value);
  }
  const localConnect = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? ' ws://localhost:* ws://127.0.0.1:*' : '';
  headers.set('Content-Security-Policy', `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'${localConnect}; worker-src 'self'; manifest-src 'self'`);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  if (url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
