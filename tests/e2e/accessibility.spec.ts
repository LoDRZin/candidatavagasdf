import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('navegação por teclado, título e layout móvel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Está procurando emprego/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeAttached();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conteudo-principal')).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole('link', { name: 'Acessar criador de currículo' }).first().click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fdashboard$/);
  await expect(page).toHaveTitle(/Conta · conectavagasdf/);
  await expect(page.getByRole('heading', { name: 'Bom ter você de volta', exact: true })).toBeVisible();
  await expect(page.locator('#conteudo-principal')).toBeFocused();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(horizontalOverflow).toBe(false);
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Bom ter você de volta', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('páginas públicas essenciais sem violações automáticas WCAG A/AA', async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of ['/rota-fantasma', '/', '/dashboard', '/editor', '/orientacao', '/login']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: path === '/' ? /Está procurando emprego/ : path === '/rota-fantasma' ? 'Esta página não existe' : 'Bom ter você de volta', exact: path !== '/' })).toBeVisible();
    if (path === '/rota-fantasma') await page.waitForTimeout(100);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(audit.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(',')).join(';')}`)).toEqual([]);
  }
});
