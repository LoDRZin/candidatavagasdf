const base = new URL(process.argv[2] ?? 'http://localhost:5173');
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
  console.error('Use HTTPS para servidores remotos; HTTP só é aceito em localhost.');
  process.exit(2);
}

async function check(path, expectedStatus, expectedText, contentType) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'Cache-Control': 'no-cache' } });
  const body = await response.text();
  if (response.status !== expectedStatus || !body.includes(expectedText) || (contentType && !response.headers.get('Content-Type')?.includes(contentType))) {
    throw new Error(`${path}: status ${response.status}; resposta diferente do contrato esperado.`);
  }
  console.log(`${path}: ${response.status} OK`);
}

try {
  await check('/api/health', 200, '"status":"ok"', 'application/json');
  await check('/', 200, 'conectavagasdf', 'text/html');
  await check('/dashboard', 302, '');
  await check('/api/resumes', 401, 'ADMIN_REQUIRED', 'application/json');
  await check('/api/rota-fantasma', 401, 'ADMIN_REQUIRED', 'application/json');
  console.log('Smoke test público concluído; conta, IA, e-mail e OAuth exigem homologação separada.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha no smoke test.');
  process.exitCode = 1;
}
