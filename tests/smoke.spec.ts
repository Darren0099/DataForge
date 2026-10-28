import { test, expect } from '@playwright/test';

test('landing page shows a usable analytics workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /From raw data to/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore sample data/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Import a dataset/i })).toBeVisible();
});

test('API health check works', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: 'ok', service: 'DataForge API' });
});

test('sample dataset can be analyzed with SQL and visualized', async ({ page }) => {
  test.setTimeout(120_000);
  page.on('console', (msg) => console.log('BROWSER ' + msg.type() + ': ' + msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await page.getByRole('button', { name: /Explore sample data/i }).click();
  await page.waitForTimeout(5000);
  console.log('DIAGNOSTIC loading=' + await page.locator('.loading-overlay').count());
  console.log('DIAGNOSTIC body=' + (await page.locator('body').innerText()).slice(0, 1000));
  await Promise.race([
    page.locator('.dataset-banner').waitFor({ timeout: 45_000 }),
    page.locator('.toast-error').waitFor({ timeout: 45_000 })
  ]);
  if (await page.locator('.toast-error').count()) {
    throw new Error('DuckDB user-facing error: ' + (await page.locator('.toast-error').textContent()));
  }
  await expect(page.getByText('Retail Performance 2026.csv').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.stat-card').first()).toContainText('240');

  await page.getByRole('button', { name: 'SQL Playground' }).click();
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByText(/rows returned in/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Visualizations' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
});

test('CSV upload, profiling, and duplicate cleanup', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample-sales.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(['region,revenue', 'North,100', 'South,200', 'South,200', ''].join(String.fromCharCode(10)))
  });
  await expect(page.locator('.dataset-banner')).toContainText('sample-sales.csv', { timeout: 30_000 });
  await expect(page.locator('.stat-card').first()).toContainText('3');
  await page.getByRole('button', { name: 'Data Quality' }).click();
  await expect(page.getByRole('heading', { name: 'Column profiles' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Run cleanup/i }).first().click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.locator('.stat-card').first()).toContainText('2', { timeout: 30_000 });
});
