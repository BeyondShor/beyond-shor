/**
 * KEM Playground E2E tests.
 *
 * Tests the full 6-step hybrid encryption protocol in the browser for all
 * three KEM algorithms, including tamper mode for ML-KEM.
 *
 * McEliece keygen takes 10–30 s in the browser.
 * FrodoKEM (WASM init + keygen) takes ~10–20 s.
 * Both are therefore covered here (not in Vitest unit tests).
 *
 * Test structure per algorithm:
 *  1. Select algorithm
 *  2. Click "Generate →"
 *  3. Wait for Step 6 "Server decrypts: <plaintext>" to appear
 *  4. Assert the decrypted text matches the default plaintext
 */

import { test, expect } from '@playwright/test';

// Default plaintext shown in the playground input
const DEFAULT_PLAINTEXT_EN = 'Hello, post-quantum world!';

// Texts that appear once Step 6 completes successfully
const STEP6_SUCCESS_PREFIX = 'Server decrypts:';
const IDENTICAL_BADGE = 'identical ✓';

test.beforeEach(async ({ page }) => {
  // Navigate to English playground for stable text selectors
  await page.goto('/en/playground');
  // Ensure we're in encryption mode
  await page.getByText('// Encryption').click();
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function runKem(page: import('@playwright/test').Page, displayName: string, timeoutMs: number) {
  // Select the algorithm (click the button showing the display name)
  await page.getByRole('button', { name: displayName, exact: true }).click();

  // Click "Generate →"
  await page.getByText('// Generate →').click();

  // Wait for Step 6 success — "Server decrypts:" label
  await expect(page.getByText(STEP6_SUCCESS_PREFIX)).toBeVisible({ timeout: timeoutMs });

  // The decrypted plaintext should match the default
  await expect(page.getByText(DEFAULT_PLAINTEXT_EN)).toBeVisible({ timeout: 5_000 });

  // The "identical ✓" badge(s) should appear (Steps 2 + 4 + final)
  const badges = page.getByText(IDENTICAL_BADGE);
  await expect(badges.first()).toBeVisible({ timeout: 5_000 });
}

// ── ML-KEM-1024 ───────────────────────────────────────────────────────────────

test('ML-KEM-1024: full 6-step protocol completes with correct decryption', async ({ page }) => {
  await runKem(page, 'ML-KEM-1024', 30_000);
});

test('ML-KEM-1024: runs twice in a row (state resets correctly)', async ({ page }) => {
  await runKem(page, 'ML-KEM-1024', 30_000);
  // Run again — the state should reset and a new run succeeds
  await page.getByText('// Generate →').click();
  await expect(page.getByText(STEP6_SUCCESS_PREFIX)).toBeVisible({ timeout: 30_000 });
});

test('ML-KEM-1024: tamper mode — tampering KEM ciphertext causes decryption failure', async ({ page }) => {
  await runKem(page, 'ML-KEM-1024', 30_000);

  // Activate tamper mode — button text is "🔧 Tamper Mode" (appears after run completes)
  await page.getByText('🔧 Tamper Mode').click();

  // An "edit" button appears next to each public hex field
  const editBtn = page.getByRole('button', { name: 'edit' }).first();
  await editBtn.click();

  // Flip the first byte of the hex in the textarea
  const textarea = page.locator('textarea').first();
  const originalHex = await textarea.inputValue();
  const flipped = (parseInt(originalHex.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0');
  await textarea.fill(flipped + originalHex.slice(2));

  // Submit tamper — button text is "// Re-decrypt →"
  await page.getByText('// Re-decrypt →').click();

  // The error message contains "AES-GCM Authentication Tag Mismatch"
  await expect(
    page.getByText(/AES-GCM Authentication Tag Mismatch/i).first()
  ).toBeVisible({ timeout: 30_000 });
});

// ── Classic McEliece 8192128 ──────────────────────────────────────────────────

test('Classic McEliece 8192128: full 6-step protocol completes with correct decryption', async ({ page }) => {
  // McEliece keygen takes up to ~30 s in the browser
  // The test timeout is set globally to 120 s in playwright.config.ts
  await runKem(page, 'Classic McEliece 8192128', 90_000);
});

// ── FrodoKEM-1344-AES ─────────────────────────────────────────────────────────

test('FrodoKEM-1344-AES: full 6-step protocol completes with correct decryption', async ({ page }) => {
  // FrodoKEM uses WASM (liboqs-js); first run includes WASM initialisation (~5–10 s)
  await runKem(page, 'FrodoKEM-1344-AES', 60_000);
});

// ── Algorithm switching ───────────────────────────────────────────────────────

test('switching between algorithms resets state', async ({ page }) => {
  // Run ML-KEM first
  await runKem(page, 'ML-KEM-1024', 30_000);

  // Switch to Classic McEliece — state should clear (Step 6 disappears)
  await page.getByRole('button', { name: 'Classic McEliece 8192128', exact: true }).click();
  // After switching, the generate button should be available and Step 6 gone
  await expect(page.getByText(STEP6_SUCCESS_PREFIX)).not.toBeVisible({ timeout: 3_000 });
  await expect(page.getByText('// Generate →')).toBeVisible();
});

// ── URL hash routing ──────────────────────────────────────────────────────────

test('navigating to #encryption shows encryption playground', async ({ page }) => {
  await page.goto('/en/playground#encryption');
  await expect(page.getByText('// Generate →')).toBeVisible();
});

test('mode toggle switches to signature playground and updates URL hash', async ({ page }) => {
  await page.goto('/en/playground');
  await page.getByText('// Signatures').click();
  await expect(page.getByText('// Sign →')).toBeVisible();
  // URL hash should be updated to #signatures
  await expect(page).toHaveURL(/#signatures/);
});
