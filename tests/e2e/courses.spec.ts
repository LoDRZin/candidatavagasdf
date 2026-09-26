import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import pilots from '../../content/course-pilots.json' with { type: 'json' };
import catalog from '../../content/course-catalog.json' with { type: 'json' };
import waveOne from '../../content/course-catalog-wave-1.json' with { type: 'json' };

const firstCourse = pilots[0]!;
const allCourses = [...pilots, ...catalog, ...waveOne];
const lessons = firstCourse.modules.flatMap(module => module.lessons);
const screenshotDirectory = '.test-artifacts/courses-ui';
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(browserErrors.get(page), 'O curso não deve provocar erros JavaScript no navegador.').toEqual([]);
});

async function createAccountAndLogin(page: Page) {
  const email = `courses-${randomUUID()}@example.test`;
  const password = 'Uma frase de teste local 2026!';
  const origin = 'http://127.0.0.1:4178';
  const headers = { Origin: origin };
  const registration = await page.request.post('/api/auth/register', { headers, data: { name: 'Pessoa dos Cursos', email, password, terms: true } });
  expect(registration.status(), await registration.text()).toBe(201);
  const mail = await page.request.post('/api/auth/local-mail', { headers, data: { email } });
  expect(mail.ok(), await mail.text()).toBe(true);
  const mailbox = await mail.json() as { messages: { url: string }[] };
  const token = new URLSearchParams(new URL(mailbox.messages[0]!.url).hash.slice(1)).get('token');
  expect(token).toBeTruthy();
  const verification = await page.request.post('/api/auth/email/verify', { headers, data: { token } });
  expect(verification.ok(), await verification.text()).toBe(true);
  await page.context().clearCookies();

  await page.goto('/login?returnTo=%2Fcursos');
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/cursos$/);
  await expect(page.getByRole('heading', { name: 'Cursos para o seu próximo passo' })).toBeVisible();
}

async function enterFirstCourse(page: Page, captureDetail = false) {
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: firstCourse.title, exact: true }) });
  await card.getByRole('link', { name: 'Começar curso', exact: true }).click();
  await expect(page.getByRole('heading', { name: firstCourse.title, exact: true })).toBeVisible();
  // Before enrollment, lessons are presented as locked syllabus entries rather than links.
  const syllabus = page.getByRole('region', { name: 'Um passo de cada vez' });
  await expect(syllabus.getByRole('link')).toHaveCount(0);
  await expect(syllabus.getByText('Comece o curso para liberar esta aula.', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('progressbar', { name: `Progresso de ${firstCourse.title}`, exact: true })).toHaveAttribute('aria-valuetext', '0% concluído');
  if (captureDetail) await auditAndCapture(page, 'curso-detalhe-desktop');
  await page.getByRole('button', { name: 'Começar curso', exact: true }).click();
  await expect(page).toHaveURL(/\/cursos\/seu-primeiro-curriculo\/aulas\/[^/]+$/);
  await expect(page.getByRole('heading', { name: lessons[0]!.title, exact: true })).toBeVisible();
}

async function readLesson(page: Page, lesson: typeof lessons[number], submitted = false) {
  for (let index = 0; index < lesson.blocks.length; index++) {
    const heading = page.getByRole('heading', { name: lesson.blocks[index]!.title, exact: true });
    await expect(heading).toBeVisible();
    const block = page.locator('[data-reading-block]').filter({ has: heading });
    await block.getByRole('button', { name: index === lesson.blocks.length - 1 ? 'Concluir leitura' : 'Concluir este passo', exact: true }).click();
  }
  if (!submitted) await expect(page.getByRole('button', { name: 'Conferir respostas', exact: true })).toBeVisible();
}

async function answerLesson(page: Page, lesson: typeof lessons[number], correct: boolean) {
  for (const question of lesson.questions) {
    const group = page.getByRole('group').filter({ has: page.locator('legend').filter({ hasText: question.prompt }) });
    if (question.type === 'reflection') {
      await group.getByRole('textbox', { name: /Sua reflexão/ }).fill('Organizei os materiais de um projeto escolar e conferi o que faltava com a equipe. Vou revisar as datas e os contatos antes de enviar.');
      await group.getByRole('button', { name: 'Salvar reflexão', exact: true }).click();
      await expect(group.getByRole('button', { name: 'Salvo ✓', exact: true })).toBeDisabled();
    } else {
      const selected = correct ? question.options.filter(option => option.correct) : [question.options.find(option => !option.correct)!];
      for (const option of selected) {
        await group.getByRole(question.type === 'single_choice' ? 'radio' : 'checkbox', { name: option.label, exact: true }).check();
      }
    }
  }
  await page.getByRole('button', { name: 'Conferir respostas', exact: true }).click();
}

async function auditAndCapture(page: Page, name: string) {
  // Inspect the settled UI, not a transient frame of the route/theme transition.
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
  const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await mkdir(screenshotDirectory, { recursive: true });
  await page.evaluate(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${screenshotDirectory}/${name}.png`, fullPage: true, animations: 'disabled' });
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  if (page.viewportSize()!.width >= 768) {
    const layout = await page.evaluate(() => {
      const content = document.querySelector('.dashboard-layout-content')!;
      const sidebar = document.querySelector('.dashboard-sidebar')!;
      return {
        sidebarWidthVariable: getComputedStyle(document.documentElement).getPropertyValue('--zeno-sidebar-width'),
        contentPaddingLeft: getComputedStyle(content).paddingLeft,
        contentLeft: content.getBoundingClientRect().left,
        sidebarRight: sidebar.getBoundingClientRect().right,
        learningLeft: document.querySelector('.learning-page')!.getBoundingClientRect().left,
        topbarLeft: document.querySelector('.dashboard-topbar')!.getBoundingClientRect().left,
        scrollX: window.scrollX,
      };
    });
    await test.info().attach(`${name}-layout`, { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
    expect.soft(layout.learningLeft, `Conteúdo encoberto pela barra lateral: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(layout.sidebarRight - 1);
    expect.soft(layout.topbarLeft, `Cabeçalho encoberto pela barra lateral: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(layout.sidebarRight - 1);
  }
}

async function expectLessonBlocksToAnimateOnce(page: Page) {
  const counts = await page.evaluate(async () => {
    const blocks = [...document.querySelectorAll<HTMLElement>('[data-reading-block]')];
    const starts = new Map(blocks.map(block => [block.dataset.readingBlock!, 0]));
    for (const block of blocks) block.addEventListener('animationstart', event => {
      if (event.animationName === 'ci-block-in') starts.set(block.dataset.readingBlock!, (starts.get(block.dataset.readingBlock!) ?? 0) + 1);
    });
    const settle = () => new Promise(resolve => window.setTimeout(resolve, 90));
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const block of blocks) { block.scrollIntoView({ behavior: 'instant', block: 'center' }); await settle(); }
      for (const block of [...blocks].reverse()) { block.scrollIntoView({ behavior: 'instant', block: 'center' }); await settle(); }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    await settle();
    return [...starts.values()];
  });
  expect(counts.some(count => count === 1), 'Ao menos um bloco novo deve executar a animação de entrada.').toBe(true);
  expect(Math.max(...counts), `Cada bloco deve animar no máximo uma vez; contagens: ${counts.join(', ')}`).toBeLessThanOrEqual(1);
}

test('usuário entra, aprende, refaz atividade e conclui curso com progresso persistente', async ({ page, browser }) => {
  await createAccountAndLogin(page);
  await expect(page.locator('.learning-card')).toHaveCount(8);
  for (const course of allCourses) await expect(page.getByRole('heading', { name: course.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar oportunidade', exact: true }).click();
  await expect(page.locator('.learning-card')).toHaveCount(2);
  await expect(page.locator('.learning-card h3')).toHaveText(['Busca de emprego organizada', 'Segurança na busca de emprego']);
  await expect(page.getByRole('status')).toContainText('2 cursos encontrados');
  await page.getByRole('button', { name: 'Todos os temas', exact: true }).click();
  await expect(page.locator('.learning-card')).toHaveCount(8);
  await auditAndCapture(page, 'catalogo-desktop');
  await page.getByRole('button', { name: 'Usar tema escuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await auditAndCapture(page, 'catalogo-escuro-desktop');
  await page.getByRole('button', { name: 'Usar tema claro', exact: true }).click();
  await enterFirstCourse(page, true);
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await auditAndCapture(page, 'aula-desktop');
  await readLesson(page, lessons[0]!);
  await answerLesson(page, lessons[0]!, false);
  const feedback = page.getByRole('status').filter({ has: page.getByRole('heading', { name: 'Você pode tentar de novo', exact: true }) });
  await expect(feedback).toBeVisible();
  // The live result announces the outcome without reading out answer-key option text.
  for (const question of lessons[0]!.questions) {
    if (question.type === 'reflection') continue;
    for (const option of question.options.filter(item => item.correct)) {
      await expect(feedback).not.toContainText(option.label);
    }
  }
  // `role="status"` provides the polite live-region semantics to assistive tech.
  await expect(feedback).toHaveAttribute('role', 'status');
  await expect(page.getByRole('button', { name: /^Tentar novamente/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próxima aula', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Tentar novamente/ }).click();
  await answerLesson(page, lessons[0]!, true);
  const celebration = page.getByRole('dialog', { name: 'Aula concluída!', exact: true });
  await expect(celebration).toBeVisible();
  await expect(celebration.getByText('Questões acertadas', { exact: true })).toBeVisible();
  await expect(celebration.getByText('Reflexões escritas', { exact: true })).toBeVisible();
  await expect(celebration.getByRole('button', { name: 'Próxima aula', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '50');

  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '50');
  const firstQuestion = lessons[0]!.questions.find(question => question.type === 'single_choice')!;
  await expect(page.getByRole('radio', { name: firstQuestion.options.find(option => option.correct)!.label, exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Próxima aula', exact: true }).click();
  await expect(page.getByRole('heading', { name: lessons[1]!.title, exact: true })).toBeVisible();
  await readLesson(page, lessons[1]!);
  await answerLesson(page, lessons[1]!, true);
  await expect(page.getByRole('heading', { name: 'Curso concluído!', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '100');
  await auditAndCapture(page, 'curso-concluido-desktop');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Curso concluído!', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '100');
  const learning = await page.request.get('/api/me/learning');
  expect(learning.ok()).toBe(true);
  const saved = await learning.json() as { courses: { slug: string; percent: number; completed: boolean }[] };
  expect(saved.courses.find(course => course.slug === firstCourse.slug)).toMatchObject({ percent: 100, completed: true });

  const completedLessonId = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.goto('/cursos');
  await page.getByRole('button', { name: 'Concluídos', exact: true }).click();
  await expect(page.locator('.learning-card')).toHaveCount(1);
  await expect(page.getByRole('progressbar', { name: `Progresso de ${firstCourse.title}`, exact: true })).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('link', { name: 'Meu aprendizado', exact: true }).click();
  await expect(page.getByRole('heading', { name: firstCourse.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Revisar curso', exact: true })).toBeVisible();

  const otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4178' });
  try {
    const otherPage = await otherContext.newPage();
    await createAccountAndLogin(otherPage);
    const otherLearning = await otherPage.request.get('http://127.0.0.1:4178/api/me/learning');
    expect(await otherLearning.json()).toMatchObject({ courses: [] });
    expect((await otherPage.request.get(`http://127.0.0.1:4178/api/lessons/${completedLessonId}`)).status()).toBe(404);
    await enterFirstCourse(otherPage);
    await expect(otherPage.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '0');
  } finally {
    await otherContext.close();
  }
});

test('catálogo e aula interativa funcionam em celular com acessibilidade', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createAccountAndLogin(page);
  await expect(page.locator('.learning-card')).toHaveCount(8);
  await auditAndCapture(page, 'catalogo-celular');
  await enterFirstCourse(page);
  await auditAndCapture(page, 'aula-celular');
  await expectLessonBlocksToAnimateOnce(page);
  await readLesson(page, lessons[0]!);
  await auditAndCapture(page, 'atividade-celular');
});

test('recupera consulta da aula após envio aprovado sem reabrir respostas já enviadas', async ({ page }) => {
  await createAccountAndLogin(page);
  await enterFirstCourse(page);
  await readLesson(page, lessons[0]!);
  const lessonId = new URL(page.url()).pathname.split('/').at(-1)!;
  const lessonRoute = `**/api/lessons/${lessonId}`;
  await page.route(lessonRoute, route => route.request().method() === 'GET' ? route.abort('failed') : route.continue());
  const submission = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/attempts\/[^/]+\/submit$/.test(new URL(response.url()).pathname));
  await answerLesson(page, lessons[0]!, true);
  expect((await submission).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Sincronizar agora', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Sua reflexão', exact: true })).toBeDisabled();
  for (const option of lessons[0]!.questions[0]!.options) {
    await expect(page.getByRole('radio', { name: option.label, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: 'Conferir respostas', exact: true })).toHaveCount(0);
  await page.unroute(lessonRoute);
  await page.getByRole('button', { name: 'Sincronizar agora', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByRole('button', { name: 'Próxima aula', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Sua reflexão', exact: true })).toBeDisabled();
});

test('recupera progresso após terminar a leitura de uma aula com atividade já aprovada', async ({ page }) => {
  await createAccountAndLogin(page);
  await enterFirstCourse(page);
  await answerLesson(page, lessons[0]!, true);
  await expect(page.getByRole('heading', { name: 'Atividades concluídas!', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Próxima aula', exact: true })).toHaveCount(0);
  const progressRoute = '**/api/courses/*/progress?*';
  await page.route(progressRoute, route => route.abort('failed'));
  await page.getByRole('button', { name: 'Continuar leitura', exact: true }).click();
  await readLesson(page, lessons[0]!, true);
  const offlineCelebration = page.getByRole('dialog', { name: 'Aula concluída!', exact: true });
  await expect(offlineCelebration).toBeVisible();
  await offlineCelebration.getByRole('button', { name: 'Fechar celebração', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sincronizar agora', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await page.unroute(progressRoute);
  await page.getByRole('button', { name: 'Sincronizar agora', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByRole('button', { name: 'Próxima aula', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('progressbar', { name: 'Progresso do curso', exact: true })).toHaveAttribute('aria-valuenow', '50');
});
