/**
 * Smoke tests — verify that all major pages load without errors.
 * These run fast and catch routing / rendering regressions.
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke — German locale (default)', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/de');
    // Title is "Beyond Shor — …" (space-separated, not hyphenated)
    await expect(page).toHaveTitle(/beyond shor/i);
  });

  test('playground page loads and shows mode toggles', async ({ page }) => {
    await page.goto('/de/playground');
    await expect(page.getByText('// Verschlüsselung')).toBeVisible();
    await expect(page.getByText('// Signaturen')).toBeVisible();
    await expect(page.getByText('// Generieren →')).toBeVisible();
  });

  test('CBOM page loads and shows cryptographic infrastructure heading', async ({ page }) => {
    await page.goto('/de/cbom');
    // h1 content comes from t('pageTitle') — "Cryptographic Infrastructure" (EN) / "Kryptographische Infrastruktur" (DE)
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/de/about');
    await expect(page).toHaveTitle(/.+/);
  });

  test('impressum page loads', async ({ page }) => {
    await page.goto('/de/impressum');
    await expect(page).toHaveTitle(/.+/);
  });
});

test.describe('Smoke — English locale', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/en');
    await expect(page).toHaveTitle(/beyond shor/i);
  });

  test('playground page loads in English', async ({ page }) => {
    await page.goto('/en/playground');
    await expect(page.getByText('// Encryption')).toBeVisible();
    await expect(page.getByText('// Signatures')).toBeVisible();
    await expect(page.getByText('// Generate →')).toBeVisible();
  });

  test('CBOM page loads in English', async ({ page }) => {
    await page.goto('/en/cbom');
    await expect(page.locator('h1').first()).toBeVisible();
    // The CBOM heading is "Cryptographic Infrastructure"
    await expect(page.getByText('Cryptographic Infrastructure')).toBeVisible();
  });
});

test.describe('i18n — language switch', () => {
  test('German playground URL serves German UI', async ({ page }) => {
    await page.goto('/de/playground');
    await expect(page.getByText('// Verschlüsselung')).toBeVisible();
  });

  test('English playground URL serves English UI', async ({ page }) => {
    await page.goto('/en/playground');
    await expect(page.getByText('// Encryption')).toBeVisible();
  });
});
