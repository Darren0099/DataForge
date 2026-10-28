import { test, expect } from '@playwright/test';

test('landing page has primary workflow actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /From raw data to/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore sample data/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Import a dataset/i })).toBeVisible();
});

test('health endpoint returns Hono API status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: 'ok', service: 'DataForge API' });
});
