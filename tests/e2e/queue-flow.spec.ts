import { expect, test } from '@playwright/test';
import { mockBackend } from './mock-backend';

test('staff can issue a walk-in ticket, call it and complete service', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/painel\/login$/);
  await page.getByLabel('E-mail').fill('staff@artvideo.test');
  await page.getByLabel('Senha').fill('secure-test-password');
  await page.getByRole('button', { name: /entrar no painel/i }).click();
  await expect(page.getByRole('heading', { name: 'Fila de atendimento' })).toBeVisible();
  await page.getByRole('button', { name: /gerar senha/i }).click();
  await page.getByLabel(/WhatsApp do cliente/i).fill('11912345678');
  await page.getByRole('button', { name: /confirmar e gerar/i }).click();
  await expect(page.getByRole('link', { name: /enviar pelo WhatsApp/i })).toHaveAttribute('href', /wa.me\/5511912345678/);
  await page.getByRole('button', { name: /fechar/i }).click();
  await expect(page.getByText('C001')).toBeVisible();
  await page.getByRole('button', { name: /chamar próxima/i }).click();
  await page.getByRole('button', { name: 'Iniciar C001' }).click();
  await page.getByRole('button', { name: 'Concluir C001' }).click();
  await expect(page.getByText('Atendidos hoje (1)')).toBeVisible();
});

test('kiosk issues and prints a ticket without staff controls', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/totem');
  await page.getByRole('button', { name: /conserto/i }).click();
  await page.getByLabel(/WhatsApp do cliente/i).fill('11912345678');
  await page.getByRole('button', { name: /gerar senha/i }).click();
  await expect(page.getByText('C001')).toBeVisible();
  await expect(page.getByRole('link', { name: /enviar pelo WhatsApp/i })).toHaveAttribute('href', /wa.me\/5511912345678/);
  await page.evaluate(() => { (window as unknown as { __printed?: boolean }).__printed = false; window.print = () => { (window as unknown as { __printed: boolean }).__printed = true; }; });
  await page.getByRole('button', { name: /imprimir senha/i }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(true);
  await expect(page.getByTestId('kiosk-controls')).toHaveClass(/no-print/);
});

test('staff route requires authentication', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/painel\/login$/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
});
