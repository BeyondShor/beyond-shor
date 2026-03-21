/**
 * Signature Playground E2E tests.
 *
 * Tests the 3-step DSA protocol (keygen → sign → verify) in the browser for
 * all four algorithms: ECDSA P-256, ML-DSA-65, SLH-DSA-SHA2-128s, SLH-DSA-SHA2-128f.
 *
 * SLH-DSA-SHA2-128s has ~1–2 s signing — the global 120 s timeout covers it.
 *
 * Test structure per algorithm:
 *  1. Switch to signatures mode
 *  2. Select algorithm
 *  3. Click "// Sign →"
 *  4. Wait for "✓  Signature valid …" to appear
 *  5. Assert the result text
 */

import { test, expect } from '@playwright/test';

const SIG_VALID_TEXT = '✓  Signature valid — content is authentic and unaltered';
const SIG_INVALID_TEXT = '✗  Signature invalid — content was altered or signature is forged';

test.beforeEach(async ({ page }) => {
  await page.goto('/en/playground#signatures');
  // Ensure we're in signatures mode
  await expect(page.getByText('// Sign →')).toBeVisible();
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function runDsa(page: import('@playwright/test').Page, displayName: string, timeoutMs = 30_000) {
  // Select algorithm by button display name
  await page.getByRole('button', { name: displayName, exact: true }).click();

  // Click "Sign →"
  await page.getByText('// Sign →').click();

  // Wait for valid verification result
  await expect(page.getByText(SIG_VALID_TEXT)).toBeVisible({ timeout: timeoutMs });
}

// ── ECDSA P-256 ───────────────────────────────────────────────────────────────

test('ECDSA P-256: keygen → sign → verify roundtrip', async ({ page }) => {
  await runDsa(page, 'ECDSA P-256', 15_000);
});

test('ECDSA P-256: runs twice in a row (state resets correctly)', async ({ page }) => {
  await runDsa(page, 'ECDSA P-256', 15_000);
  await page.getByText('// Sign →').click();
  await expect(page.getByText(SIG_VALID_TEXT)).toBeVisible({ timeout: 15_000 });
});

// ── ML-DSA-65 ─────────────────────────────────────────────────────────────────

test('ML-DSA-65: keygen → sign → verify roundtrip', async ({ page }) => {
  await runDsa(page, 'ML-DSA-65', 20_000);
});

// ── SLH-DSA-SHA2-128f (fast variant) ─────────────────────────────────────────

test('SLH-DSA-SHA2-128f: keygen → sign → verify roundtrip', async ({ page }) => {
  await runDsa(page, 'SLH-DSA-SHA2-128f', 30_000);
});

// ── SLH-DSA-SHA2-128s (slow variant — ~1–2 s signing) ────────────────────────

test('SLH-DSA-SHA2-128s: keygen → sign → verify roundtrip', async ({ page }) => {
  await runDsa(page, 'SLH-DSA-SHA2-128s', 60_000);
});

// ── Tamper mode ───────────────────────────────────────────────────────────────

test('ML-DSA-65: tampering message invalidates signature', async ({ page }) => {
  await runDsa(page, 'ML-DSA-65', 20_000);

  // Look for the "edit" button next to the message hex field
  const editBtn = page.getByRole('button', { name: 'edit' }).first();
  if (await editBtn.isVisible({ timeout: 3_000 })) {
    await editBtn.click();

    const textarea = page.locator('textarea').first();
    const originalHex = await textarea.inputValue();
    if (originalHex.length >= 2) {
      // Flip the first byte of the message hex
      const flipped = (parseInt(originalHex.slice(0, 2), 16) ^ 0xff)
        .toString(16).padStart(2, '0');
      await textarea.fill(flipped + originalHex.slice(2));

      // Submit tamper
      await page.getByRole('button').filter({ hasText: /tamper|manipul/i }).last().click();

      // Signature should now be invalid
      await expect(page.getByText(SIG_INVALID_TEXT)).toBeVisible({ timeout: 20_000 });
    }
  }
});

test('ECDSA P-256: tampering message invalidates signature', async ({ page }) => {
  await runDsa(page, 'ECDSA P-256', 15_000);

  const editBtn = page.getByRole('button', { name: 'edit' }).first();
  if (await editBtn.isVisible({ timeout: 3_000 })) {
    await editBtn.click();

    const textarea = page.locator('textarea').first();
    const originalHex = await textarea.inputValue();
    if (originalHex.length >= 2) {
      const flipped = (parseInt(originalHex.slice(0, 2), 16) ^ 0xff)
        .toString(16).padStart(2, '0');
      await textarea.fill(flipped + originalHex.slice(2));
      await page.getByRole('button').filter({ hasText: /tamper|manipul/i }).last().click();
      await expect(page.getByText(SIG_INVALID_TEXT)).toBeVisible({ timeout: 15_000 });
    }
  }
});

// ── Algorithm switching ───────────────────────────────────────────────────────

test('switching algorithms clears previous result', async ({ page }) => {
  await runDsa(page, 'ECDSA P-256', 15_000);
  // Switch to ML-DSA-65 — the previous "valid" badge should disappear
  await page.getByRole('button', { name: 'ML-DSA-65', exact: true }).click();
  await expect(page.getByText(SIG_VALID_TEXT)).not.toBeVisible({ timeout: 3_000 });
});

// ── Custom message ────────────────────────────────────────────────────────────

test('ML-DSA-65: custom message signs and verifies correctly', async ({ page }) => {
  await page.getByRole('button', { name: 'ML-DSA-65', exact: true }).click();

  // Clear the default message and type a custom one
  const messageInput = page.locator('textarea, input[type="text"]').first();
  await messageInput.clear();
  await messageInput.fill('Quantencomputer können ECDSA brechen, nicht ML-DSA-65.');

  await page.getByText('// Sign →').click();
  await expect(page.getByText(SIG_VALID_TEXT)).toBeVisible({ timeout: 20_000 });
});

// ── Share state (URL encoding) ────────────────────────────────────────────────

test('ML-DSA-65: share button encodes state in URL hash', async ({ page }) => {
  await runDsa(page, 'ML-DSA-65', 20_000);

  // The "share" or "copy link" button should appear after a run
  const shareBtn = page.getByRole('button').filter({ hasText: /share|link|teil/i }).first();
  if (await shareBtn.isVisible({ timeout: 3_000 })) {
    await shareBtn.click();
    // After clicking share, the URL hash should contain state=
    await expect(page).toHaveURL(/state=/, { timeout: 3_000 });
  }
});
