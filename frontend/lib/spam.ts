/**
 * Spam protection utilities for the contact form.
 *
 * Four independent layers:
 *   1. Honeypot  — hidden field; bots fill it, humans don't
 *   2. Timing    — minimum 3 s between page load and submit
 *   3. Math CAPTCHA — server-generated arithmetic question, HMAC-signed token,
 *                     no sessions needed, auto-expires after 5 minutes
 *   4. Rate limit   — 3 submissions per IP per hour (in-memory)
 */

import crypto from 'node:crypto';

// ─── Math CAPTCHA ─────────────────────────────────────────────────────────────

const CAPTCHA_SECRET = (() => {
  const s = process.env.CONTACT_CAPTCHA_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CONTACT_CAPTCHA_SECRET must be set in production');
    }
    return 'dev-fallback-secret-change-in-prod';
  }
  return s;
})();
const CAPTCHA_WINDOW_S = 300; // token valid for 5 minutes

function captchaHmac(answer: string, window: number): string {
  // cbom: contact-form
  return crypto
    .createHmac('sha256', CAPTCHA_SECRET)
    .update(`${answer}:${window}`)
    .digest('hex');
}

/** Call in a Server Component to generate a question and a signed token. */
export function generateMathChallenge(): { question: string; token: string } {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  const answer = String(a + b);
  const window = Math.floor(Date.now() / 1000 / CAPTCHA_WINDOW_S);
  return { question: `${a} + ${b}`, token: captchaHmac(answer, window) };
}

/**
 * Validate the CAPTCHA in a Server Action.
 * Accepts answers from the current and the previous time window
 * to avoid rejections at window boundaries.
 */
export function validateMathChallenge(answer: string, token: string): boolean {
  if (!/^\d{1,3}$/.test(answer)) return false;
  if (!/^[0-9a-f]{64}$/.test(token)) return false;

  const window = Math.floor(Date.now() / 1000 / CAPTCHA_WINDOW_S);
  for (const w of [window, window - 1]) {
    const expected = captchaHmac(answer, w);
    try {
      if (
        crypto.timingSafeEqual(
          Buffer.from(expected, 'hex'),
          Buffer.from(token, 'hex'),
        )
      ) {
        return true;
      }
    } catch {
      // Buffer length mismatch → invalid
    }
  }
  return false;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Returns true if the request is allowed, false if it should be blocked. */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Periodically prune expired entries to prevent unbounded memory growth
  if (rateLimitStore.size > 500) {
    for (const [key, val] of rateLimitStore) {
      if (val.resetAt < now) rateLimitStore.delete(key);
    }
  }

  const entry = rateLimitStore.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}
