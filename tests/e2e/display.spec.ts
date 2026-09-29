import { expect, test } from '@playwright/test';
import { mockBackend } from './mock-backend';

test('public display renders sanitized calls and fits a TV viewport', async ({ page }) => {
  await mockBackend(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/display');
  await expect(page.getByRole('heading', { name: 'Acompanhe sua chamada' })).toBeVisible();
  await expect(page.getByText(/aguardando a próxima chamada/i)).toBeVisible();
  const documentWidth = await page.locator('body').evaluate((body) => body.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(1366);
});
