// Isolated, disposable browser fixture. No real credentials or external requests.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const root = path.resolve('dist/client');
const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 4174, modules: true, scriptPath: 'dist/conectavagasdf/index.js', compatibilityDate: '2026-09-12', d1Databases: ['DB'],
  bindings: { AUTH_ENABLED: 'true', COURSES_ENABLED: 'true', LOCAL_MAIL_PREVIEW: 'true', AI_RESUME_STRUCTURE_ENABLED: 'true', GEMINI_API_KEY: 'fixture-not-real', GEMINI_RESUME_MODEL: 'fixture', ADMIN_TOKEN: 'fixture-admin-only' },
  outboundService: async request => {
    if (new URL(request.url).hostname !== 'generativelanguage.googleapis.com') return new Response('External services disabled in fixture', { status: 503 });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ resume: { profile: { headline: '' }, summary: '', experiences: [], education: [], projects: [], certifications: [], skills: ['Organização de planilhas'], languages: [] }, missingQuestions: [{ field: 'experiences', question: 'Onde você realizou essa atividade?' }], warnings: ['Sugestão simulada apenas para teste local.'], evidence: [{ field: 'resume.skills[0]', sourceText: 'organizava as planilhas' }] }) }] } }] });
  },
  serviceBindings: { ASSETS: async request => {
    const pathname = decodeURIComponent(new URL(request.url).pathname); const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) return new Response('Not found', { status: 404 });
    try { const content = await readFile(file); const type = ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(file)] ?? 'text/html'; return new Response(content, { headers: { 'Content-Type': type } }); }
    catch { return new Response(await readFile(path.join(root, 'index.html')), { headers: { 'Content-Type': 'text/html' } }); }
  } },
}));
const db = await mf.getD1Database('DB');
for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
  let statement = '', trigger = false;
  for (const line of (await readFile(`migrations/${file}`, 'utf8')).split('\n')) {
    if (/^\s*--/.test(line)) continue; statement += line + '\n'; if (/CREATE TRIGGER/i.test(line)) trigger = true;
    if (trigger ? /^END;\s*$/.test(line) : /;\s*$/.test(line)) { await db.prepare(statement).run(); statement = ''; trigger = false; }
  }
}
const base = 'http://127.0.0.1:4174';
await mf.dispatchFetch(base + '/api/auth/register', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pessoa de teste local', email: 'teste@example.test', password: 'senha de teste local 2026', terms: true }) });
await db.prepare('UPDATE users SET email_verified_at=?').bind(new Date().toISOString()).run();
await db.prepare("UPDATE courses SET status='published'").run(); await db.prepare("UPDATE course_versions SET status='published'").run();
console.log('Fixture local isolada: http://127.0.0.1:4174/login');
console.log('Conta fictícia: teste@example.test / senha de teste local 2026');
console.log('Google/e-mail externos desativados; resposta Gemini simulada. Ctrl+C encerra e descarta o banco.');
process.on('SIGINT', async () => { await mf.dispose(); process.exit(0); });
