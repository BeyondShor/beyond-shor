/**
 * PQC-Lagebild E2E: page renders in both languages,
 * the page is indexable and linked in the main navigation, and the live connection widget settles on a result.
 * Works with or without data in PQC_LAGEBILD_DIR (shows the "first measurement" state).
 */
import { test, expect } from '@playwright/test';

test('German page renders, is indexable and linked in the navigation', async ({ page }) => {
  const res = await page.goto('/de/pqc-lagebild');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'PQC-Lagebild' })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'PQC-Lagebild' })).toBeVisible();
  await expect(page.getByRole('link', { name: /So wird gemessen/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Software ab Werk' })).toBeVisible();
});

test('English page and methodology use the localized paths', async ({ page }) => {
  await page.goto('/en/pqc-monitor');
  await expect(page.getByRole('heading', { level: 1, name: 'PQC Monitor' })).toBeVisible();
  await page.getByRole('link', { name: /How we measure/ }).click();
  await expect(page).toHaveURL(/\/en\/pqc-monitor\/methodology$/);
  await expect(page.getByRole('heading', { level: 2, name: 'What we don\'t publish' })).toBeVisible();
});

test('live connection widget settles (no TLS header locally)', async ({ page }) => {
  await page.goto('/en/pqc-monitor');
  await expect(page.getByText(/Quantum-safe connection|Classical connection|Could not be determined/)).toBeVisible();
});

test('file endpoint serves only published names', async ({ request }) => {
  expect((await request.get('/api/pqc-lagebild/public-key.txt')).status()).toBe(200);
  expect((await request.get('/api/pqc-lagebild/visitors.json')).status()).toBe(404);
  expect((await request.get('/api/pqc-lagebild/..%2F..%2Fetc%2Fpasswd')).status()).toBe(404);
});
