import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Note: CAPTCHA_SECRET initializes at module load time. In non-production NODE_ENV,
// it falls back to 'dev-fallback-secret-change-in-prod' automatically.

// We import after setting up fake timers to ensure module-level Date.now() calls
// in generateMathChallenge / validateMathChallenge use the fake clock.

let checkRateLimit: (ip: string) => boolean;
let generateMathChallenge: () => { question: string; token: string };
let validateMathChallenge: (answer: string, token: string) => boolean;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  // Reset module so rateLimitStore is fresh for each test
  vi.resetModules();
  const mod = await import('../lib/spam');
  checkRateLimit = mod.checkRateLimit;
  generateMathChallenge = mod.generateMathChallenge;
  validateMathChallenge = mod.validateMathChallenge;
});

afterEach(() => {
  vi.useRealTimers();
});

// ── checkRateLimit ────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows the first request from a new IP', () => {
    expect(checkRateLimit('1.2.3.4')).toBe(true);
  });

  it('allows up to 3 requests within the window', () => {
    const ip = '10.0.0.1';
    expect(checkRateLimit(ip)).toBe(true);
    expect(checkRateLimit(ip)).toBe(true);
    expect(checkRateLimit(ip)).toBe(true);
  });

  it('blocks the 4th request within the window', () => {
    const ip = '10.0.0.2';
    checkRateLimit(ip);
    checkRateLimit(ip);
    checkRateLimit(ip);
    expect(checkRateLimit(ip)).toBe(false);
  });

  it('continues blocking after the limit is hit', () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 3; i++) checkRateLimit(ip);
    expect(checkRateLimit(ip)).toBe(false);
    expect(checkRateLimit(ip)).toBe(false);
  });

  it('resets after the 1-hour window expires', () => {
    const ip = '10.0.0.4';
    checkRateLimit(ip); checkRateLimit(ip); checkRateLimit(ip);
    expect(checkRateLimit(ip)).toBe(false);

    // Advance time by 1 hour + 1 ms
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(checkRateLimit(ip)).toBe(true);
  });

  it('tracks different IPs independently', () => {
    const ip1 = '192.168.1.1';
    const ip2 = '192.168.1.2';
    checkRateLimit(ip1); checkRateLimit(ip1); checkRateLimit(ip1);
    expect(checkRateLimit(ip1)).toBe(false);
    expect(checkRateLimit(ip2)).toBe(true); // ip2 is untouched
  });
});

// ── generateMathChallenge ─────────────────────────────────────────────────────

describe('generateMathChallenge', () => {
  it('returns a question and a token', () => {
    const { question, token } = generateMathChallenge();
    expect(question).toBeTruthy();
    expect(token).toBeTruthy();
  });

  it('question matches "a + b" pattern with single-digit or double-digit numbers', () => {
    const { question } = generateMathChallenge();
    expect(question).toMatch(/^\d+ \+ \d+$/);
  });

  it('token is a 64-character hex string', () => {
    const { token } = generateMathChallenge();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different tokens on subsequent calls (different random operands)', () => {
    // With random a,b in [1,10], repeated calls have a very low chance of collision
    const tokens = new Set(Array.from({ length: 5 }, () => generateMathChallenge().token));
    // At least 2 distinct tokens expected from 5 calls
    expect(tokens.size).toBeGreaterThan(1);
  });
});

// ── validateMathChallenge ─────────────────────────────────────────────────────

describe('validateMathChallenge', () => {
  it('accepts a correct answer with a fresh token', () => {
    const { question, token } = generateMathChallenge();
    const [a, b] = question.split(' + ').map(Number);
    const answer = String(a + b);
    expect(validateMathChallenge(answer, token)).toBe(true);
  });

  it('rejects a wrong answer', () => {
    const { question, token } = generateMathChallenge();
    const [a, b] = question.split(' + ').map(Number);
    const wrongAnswer = String(a + b + 1);
    expect(validateMathChallenge(wrongAnswer, token)).toBe(false);
  });

  it('rejects a non-numeric answer', () => {
    const { token } = generateMathChallenge();
    expect(validateMathChallenge('abc', token)).toBe(false);
  });

  it('rejects a token with wrong length', () => {
    const { question } = generateMathChallenge();
    const [a, b] = question.split(' + ').map(Number);
    expect(validateMathChallenge(String(a + b), 'tooshort')).toBe(false);
  });

  it('rejects a token with non-hex characters', () => {
    const { question } = generateMathChallenge();
    const [a, b] = question.split(' + ').map(Number);
    const badToken = 'x'.repeat(64);
    expect(validateMathChallenge(String(a + b), badToken)).toBe(false);
  });

  it('accepts an answer from the previous time window (boundary tolerance)', () => {
    const { question, token } = generateMathChallenge();
    const [a, b] = question.split(' + ').map(Number);
    const answer = String(a + b);

    // Advance time to the next window (just past 5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Token is from the previous window — should still be accepted
    expect(validateMathChallenge(answer, token)).toBe(true);
  });

  it('rejects an answer from two windows ago (expired)', () => {
    const { question, token } = generateMathChallenge();
    const [a, b] = question.split(' + ').map(Number);
    const answer = String(a + b);

    // Advance time by 2 full windows (10 minutes)
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(validateMathChallenge(answer, token)).toBe(false);
  });
});
