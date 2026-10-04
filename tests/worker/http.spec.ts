import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { expect, test } from 'vitest';
import worker from '../../worker/index';

test('Worker responde com proteção HTTP e rota inexistente padrão', async () => {
  const ctx = createExecutionContext();
  const health = await worker.fetch(new Request('https://example.test/api/health'), env, ctx);
  expect(health.status).toBe(200);
  expect(health.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self' https://lodrzin.github.io");
  expect(health.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');

  const ghost = await worker.fetch(new Request('https://example.test/api/sem-rota'), env, ctx);
  expect(ghost.status).toBe(404);
  const guardedEnv = { ...env, ACCESS_REQUIRED: 'true', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUD: 'admin-app' } as typeof env;
  const admin = await worker.fetch(new Request('https://example.test/api/admin/courses'), guardedEnv, ctx);
  expect(admin.status).toBe(403);
  const adminPage = await worker.fetch(new Request('https://example.test/admin'), guardedEnv, ctx);
  expect(adminPage.status).toBe(403);
  const adminCoursesPage = await worker.fetch(new Request('https://example.test/admin/cursos'), guardedEnv, ctx);
  expect(adminCoursesPage.status).toBe(403);
  await waitOnExecutionContext(ctx);
});
