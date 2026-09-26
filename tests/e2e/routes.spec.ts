import { expect, test } from '@playwright/test';

test('autenticação cabe inteira em um desktop sem rolagem vazia', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 958 });

  for (const path of ['/cadastro', '/login']) {
    await page.goto(path);
    await expect(page.locator('.auth-card')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientHeight,
      content: document.documentElement.scrollHeight,
    }));
    expect(dimensions.content, `${path} ultrapassou a altura visível`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test('páginas públicas curtas não criam rolagem vazia', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 958 });

  for (const path of ['/verificar-email', '/recuperar-senha', '/redefinir-senha', '/termos', '/acesso-admin', '/rota-inexistente']) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientHeight,
      content: document.documentElement.scrollHeight,
    }));
    expect(dimensions.content, `${path} criou rolagem sem conteúdo suficiente`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test('recuperação de acesso cabe inteira em viewport de notebook', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });

  for (const path of ['/recuperar-senha', '/redefinir-senha']) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientHeight,
      content: document.documentElement.scrollHeight,
    }));
    expect(dimensions.content, `${path} criou rolagem por espaçamento excessivo`).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test('cadastro mostra segurança da senha e permite visualizar o valor', async ({ page }) => {
  await page.goto('/cadastro');
  const password = page.getByLabel('Senha', { exact: true });
  const status = page.locator('#password-strength-status');
  const meter = page.getByRole('progressbar', { name: 'Segurança da senha' });

  await expect(password).toHaveAttribute('type', 'password');
  await expect(status).toHaveText('Digite uma senha');
  await password.fill('curta');
  await expect(status).toHaveText('Senha não segura');
  await expect(meter).toHaveAttribute('aria-valuenow', '28');
  await expect(meter.locator('span')).toHaveCSS('background-color', 'rgb(180, 35, 24)');

  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');

  await password.fill('Senha#88');
  await expect(status).toHaveText('Senha segura');
  await expect(meter).toHaveAttribute('aria-valuenow', '100');
});

test('acesso direto exibe shell e fundo antes do React iniciar', async ({ page }) => {
  await page.route('**/src/main.tsx*', route => route.abort());
  await page.goto('/login');
  await expect(page.locator('.initial-shell-header')).toBeVisible();
  await expect(page.locator('.initial-shell-card').first()).toBeVisible();
  await expect(page.locator('.initial-home')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(247, 246, 242)');
});

test('sessão pendente mantém navegação e skeleton local visíveis', async ({ page }) => {
  await page.route('**/api/auth/session', () => {});
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/dashboard'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('.route-skeleton-header')).toBeVisible();
  await expect(page.locator('.route-skeleton')).toBeVisible();
  await expect(page.getByText('Preparando esta página…')).toHaveCount(0);
});

test('rotas internas exigem a sessão correta', async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of ['/dashboard', '/dashboard///', '/editor', '/orientacao', '/chat-ia', '/entrevistas', '/aprender', '/carta', '/seguranca-da-vaga', '/modelos-de-contato', '/cursos', '/cursos/exemplo', '/cursos/exemplo/aulas/1', '/meu-aprendizado', '/perfil-profissional', '/historias', '/candidaturas', '/candidaturas/1', '/candidaturas/1/materiais', '/candidaturas/1/entrevista', '/conta', '/admin', '/admin/cursos']) {
    await page.goto(path);
    const adminPath = path.startsWith('/admin');
    await expect(page).toHaveURL(adminPath ? /\/acesso-admin\?returnTo=/ : /\/login\?returnTo=/);
    await expect(page.getByRole('heading', { name: adminPath ? 'Acesso administrativo' : 'Bom ter você de volta', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Nome completo/ })).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Acesso administrativo', exact: true })).toBeVisible();
});

test('chamada de currículo abre o login e 404 continua explícito', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Acessar criador de currículo', exact: true }).first().click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard$/);
  await expect(page.getByRole('heading', { name: 'Bom ter você de volta', exact: true })).toBeVisible();
  await page.goto('/rota-fantasma');
  await expect(page.getByRole('heading', { name: 'Esta página não existe' })).toBeVisible();
});

test('chamadas do currículo respeitam a sessão já carregada', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: {
    user: { id: 'user-test', name: 'Pessoa Teste', email: 'teste@example.test', email_verified_at: '2026-09-23T00:00:00Z' },
    googleAvailable: true,
    localMail: false,
  } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Pessoa Teste' })).toBeVisible();
  await page.getByRole('link', { name: 'Acessar criador de currículo', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Olá, Pessoa Teste/ })).toBeVisible();

  await page.locator('.brand-link').click();
  await page.getByRole('link', { name: /Monte seu currículo/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('todas as chamadas públicas para ferramentas levam ao login', async ({ page }) => {
  test.setTimeout(90_000);
  const actions = [
    { role: 'link', name: /Monte seu currículo/ },
    { role: 'link', name: /Treine para entrevistas/ },
    { role: 'link', name: /Aprenda no seu tempo/ },
    { role: 'link', name: 'Acessar criador de currículo', occurrence: 2 },
    { role: 'link', name: /Quero aprender primeiro/ },
  ] as const;
  for (const action of actions) {
    await page.goto('/');
    const target = page.getByRole(action.role, { name: action.name });
    await (('occurrence' in action) ? target.nth(action.occurrence) : target).click();
    await expect(page.getByRole('heading', { name: 'Bom ter você de volta', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  }
});

test('as chamadas principais para currículo abrem o login', async ({ page }) => {
  for (const occurrence of [0, 1]) {
    await page.goto('/');
    await page.getByRole('link', { name: 'Acessar criador de currículo', exact: true }).nth(occurrence).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard$/);
    await expect(page.getByRole('heading', { name: 'Bom ter você de volta', exact: true })).toBeVisible();
  }
});

test('termos e privacidade apresentam a IA do Conecta Vagas sem nomear fornecedores', async ({ page }) => {
  for (const path of ['/termos', '/privacidade']) {
    await page.goto(path);
    await expect(page.getByText('IA do Conecta Vagas', { exact: false }).first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/Gemini|OpenRouter|OpenAI|Claude/i);
  }
});

test('páginas públicas abrem mesmo com as consultas de sessão pendentes', async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('Está procurando emprego?');

  await page.route('**/api/admin-session', () => {});
  await page.route('**/api/auth/session', () => {});
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Está procurando emprego/ })).toBeVisible();
  await expect(page.getByText('Confirmando acesso…')).toHaveCount(0);
  const templateFiles = await page.evaluate(() => performance.getEntriesByType('resource').filter(item => item.name.includes('/templates/')).map(item => item.name));
  expect(templateFiles).toEqual([]);

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: /Está procurando emprego/ })).toBeVisible();

  await page.getByRole('link', { name: 'Acessar criador de currículo', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Bom ter você de volta', exact: true })).toBeVisible();
});

test('falha na verificação administrativa mostra tentativa novamente sem liberar o painel', async ({ page }) => {
  let available = false;
  await page.route('**/api/admin-session', route => route.fulfill(available
    ? { json: { authenticated: false } }
    : { status: 503, json: { error: { code: 'ADMIN_UNAVAILABLE', message: 'Serviço indisponível.' } } }));
  await page.goto('/');
  await page.evaluate(() => { history.pushState({}, '', '/admin'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { name: 'Não foi possível confirmar o acesso' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Olá/ })).toHaveCount(0);

  available = true;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page).toHaveURL(/\/acesso-admin\?returnTo=%2Fadmin$/);
});
