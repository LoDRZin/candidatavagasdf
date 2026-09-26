import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { id: 'dashboard-user', name: 'Pessoa Teste', email: 'pessoa@example.test', email_verified_at: '2026-09-23T00:00:00Z' },
    googleAvailable: true,
    localMail: false,
  } }));
  await page.route('**/api/chat-conversations**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.pathname === '/api/chat-conversations') {
      await route.fulfill({ json: { conversations: [], retentionDays: 7 } });
      return;
    }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { conversation: { id: url.pathname.split('/').at(-1), ...body, title: body.messages[0]?.content ?? 'Conversa', messageCount: body.messages.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() } } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
});

test('dashboard Zeno mantém navegação, responsividade e acessibilidade', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Acessar criador de currículo', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Olá, Pessoa Teste.' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Navegação principal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo currículo', exact: true })).toBeVisible();
  await expect(page.getByText('Currículos criados', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Minimizar barra lateral' }).click();
  await expect(page.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible();
  expect(await page.locator('.dashboard-sidebar').evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(72);
  await expect(page.locator('.dashboard-layout-content')).toHaveCSS('padding-left', '72px');
  await page.getByRole('button', { name: 'Expandir barra lateral' }).click();

  const desktopAudit = await new AxeBuilder({ page }).include('.dashboard-layout').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(desktopAudit.violations).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('complementary', { name: 'Navegação principal' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar navegação' }).click();
});

test('orientação encaminha a mensagem e o contexto para o Chat IA', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/orientacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('button', { name: 'Chat IA', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Sua dúvida' }).fill('Como posso mostrar minha experiência com atendimento?');
  await page.getByRole('button', { name: /Abrir orientação local/ }).click();

  await expect(page).toHaveURL(/\/chat-ia$/);
  await expect(page.getByRole('heading', { name: 'Chat IA', exact: true })).toBeVisible();
  await expect(page.getByText('Orientação', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Como posso mostrar minha experiência com atendimento?', { exact: true })).toBeVisible();
  await expect(page.getByText('Assistente · local', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Histórico de conversas' })).toBeVisible();
  await expect(page.getByText('A exclusão é automática após 7 dias.')).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.ai-chat-page').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('Chat IA salva, retoma e exclui conversas do histórico de 7 dias', async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.unroute('**/api/chat-conversations**');
  await page.route('**/api/chat-conversations**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split('/').at(-1)!;
    if (request.method() === 'GET' && url.pathname === '/api/chat-conversations') {
      await route.fulfill({ json: { conversations: saved ? [saved] : [], retentionDays: 7 } });
      return;
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as { source: string; sourceLabel: string; context: string; messages: Array<{ content: string }> };
      const stamp = new Date().toISOString();
      saved = { id, ...body, title: body.messages[0]!.content, messageCount: body.messages.length, createdAt: stamp, updatedAt: stamp, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() };
      await route.fulfill({ json: { conversation: saved } });
      return;
    }
    if (request.method() === 'GET') {
      await route.fulfill({ status: saved ? 200 : 404, json: saved ? { conversation: saved } : { error: { message: 'Conversa não encontrada.' } } });
      return;
    }
    saved = null;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/chat-ia'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('textbox', { name: 'Mensagem para o assistente' }).fill('Como melhorar meu resumo profissional?');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByRole('navigation', { name: 'Histórico de conversas' }).getByText('Como melhorar meu resumo profissional?', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await page.locator('.ai-chat-history-open').filter({ hasText: 'Como melhorar meu resumo profissional?' }).click();
  await expect(page.getByText('Como melhorar meu resumo profissional?', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Excluir conversa: Como melhorar meu resumo profissional?' }).click();
  await expect(page.getByRole('navigation', { name: 'Histórico de conversas' }).getByText('Como melhorar meu resumo profissional?', { exact: true })).toHaveCount(0);
});

test('entrevistas usa uma única ação e envia direto para o Chat IA', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/entrevistas'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('button', { name: /Ver um roteiro simples/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Voltar às ferramentas/ })).toHaveCount(0);
  await page.locator('.practice-answer textarea').fill('Organizei as solicitações dos clientes e acompanhei cada retorno.');
  const sendButton = page.getByRole('button', { name: 'Enviar resposta para o Chat IA' });
  await expect(sendButton).toBeVisible();
  await sendButton.click();
  await expect(page).toHaveURL(/\/chat-ia$/);
  await expect(page.getByText('Organizei as solicitações dos clientes e acompanhei cada retorno.', { exact: true })).toBeVisible();
});

test('aba Uso apresenta tokens e requisições restantes', async ({ page }) => {
  await page.route('**/api/me/usage', route => route.fulfill({ json: {
    tokens: { limit: 4096, used: 768, remaining: 3328 },
    requests: { limit: 2, used: 1, remaining: 1 },
    updatedAt: '2026-09-23T00:00:00.000Z',
  } }));
  await page.goto('/');
  await page.evaluate(() => {
    history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: 'Uso', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Uso', exact: true }).click();
  await expect(page).toHaveURL(/\/uso$/);
  await expect(page.getByRole('heading', { name: 'Uso', exact: true })).toBeVisible();
  await expect(page.getByText('3.328', { exact: true })).toBeVisible();
  await expect(page.getByText('restantes de 4.096', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Tokens utilizados' })).toHaveAttribute('aria-valuenow', '768');
  await expect(page.getByRole('progressbar', { name: 'Requisições utilizadas' })).toHaveAttribute('aria-valuenow', '1');
  const audit = await new AxeBuilder({ page }).include('.usage-page').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('administrador gerencia usuários e consulta o uso Total', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { id: 'admin-user', name: 'Administrador', email: 'admin@example.test', email_verified_at: '2026-09-23T00:00:00Z', role: 'admin' },
    googleAvailable: true,
    localMail: false,
  } }));
  await page.route('**/api/admin-session', route => route.fulfill({ json: { authenticated: false } }));
  await page.route('**/api/admin/users**', route => route.fulfill({ json: {
    users: [{ id: 'admin-user', name: 'Administrador', email: 'admin@example.test', role: 'admin', status: 'active', email_verified_at: '2026-09-23T00:00:00Z', created_at: '2026-09-23T00:00:00Z', providers: 'google', tokens_used: 300, token_limit: 4096, requests_used: 1, request_limit: 2, isSelf: true }],
    page: 1, pageSize: 50, total: 1, totalPages: 1,
  } }));
  await page.route('**/api/admin/usage', route => route.fulfill({ json: {
    scope: 'total', tokens: { used: 300, allowance: 4096 }, requests: { used: 1, allowance: 2 }, users: { total: 1, active: 1, admins: 1 }, providers: [{ provider: 'gemini', requests: 1, tokens: 300 }],
    modelLimits: [
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', category: 'Modelos de saída de texto', configured: true, rpm: { used: 1, limit: 15 }, tpm: { used: 286, limit: 250000 }, rpd: { used: 3, limit: 500 } },
      { provider: 'gemini', model: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B A4B IT', category: 'Modelos de saída de texto', configured: true, rpm: { used: 0, limit: 30 }, tpm: { used: 0, limit: 16000 }, rpd: { used: 0, limit: 14400 } },
    ],
  } }));
  await page.route('**/api/me/usage', route => route.fulfill({ json: { tokens: { limit: 4096, used: 300, remaining: 3796 }, requests: { limit: 2, used: 1, remaining: 1 }, updatedAt: '2026-09-23T00:00:00Z' } }));

  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/admin'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Painel administrativo' })).toBeVisible();
  await expect(page.getByText('admin@example.test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Uso', exact: true }).click();
  await page.getByRole('button', { name: 'Total', exact: true }).click();
  await expect(page.getByText('Consumo registrado por IA')).toBeVisible();
  await expect(page.getByText('Gemini', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cotas globais por modelo' })).toBeVisible();
  await expect(page.getByText('Gemini 3.5 Flash Lite', { exact: true })).toBeVisible();
  await expect(page.getByText('Gemma 4 26B A4B IT', { exact: true })).toBeVisible();
  await expect(page.getByText('286 / 250.000', { exact: true })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.usage-page').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('editor mantém ações alinhadas e cresce ao recolher a navegação', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/editor'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Conte sua história.' })).toBeVisible();
  await expect(page.locator('.editor-sidebar')).toHaveCSS('position', 'static');

  const actionBoxes = await page.locator('.resume-tools>.platform-actions>.button').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height), width: Math.round(box.width) };
  }));
  expect(new Set(actionBoxes.map(box => box.top)).size).toBe(1);
  expect(new Set(actionBoxes.map(box => box.height)).size).toBe(1);
  expect(Math.max(...actionBoxes.map(box => box.width))).toBeLessThan(280);
  const expandedWidth = await page.locator('.resume-stage').evaluate(element => element.getBoundingClientRect().width);
  expect(expandedWidth).toBeGreaterThan(500);

  await page.getByRole('button', { name: 'Minimizar barra lateral' }).click();
  await expect(page.locator('.dashboard-layout-content')).toHaveCSS('padding-left', '72px');
  const collapsedWidth = await page.locator('.resume-stage').evaluate(element => element.getBoundingClientRect().width);
  expect(collapsedWidth).toBeGreaterThan(expandedWidth);
  expect(await page.getByText('Sua prévia começa aqui', { exact: true }).isVisible()).toBe(true);

  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(page.locator('.editor-form-panel')).toHaveCSS('background-color', 'rgb(28, 34, 30)');
  await expect(page.locator('.resume-tools')).toHaveCSS('background-color', 'rgb(28, 34, 30)');
  await expect(page.locator('.resume-paper')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const darkAudit = await new AxeBuilder({ page }).include('.dashboard-layout').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(darkAudit.violations).toEqual([]);
});

test('prévia do currículo mantém conteúdo hostil como texto e não executa XSS', async ({ page }) => {
  const payload = '<img src=x onerror="window.__resumeXss=true"><script>window.__resumeXss=true</script>';
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/editor'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByLabel('Nome completo').fill(payload);
  await expect(page.locator('.resume-document').first()).toContainText(payload);
  await expect(page.locator('.resume-document img, .resume-document script, .resume-document iframe')).toHaveCount(0);
  expect(await page.evaluate(() => (window).__resumeXss)).toBeUndefined();
});
