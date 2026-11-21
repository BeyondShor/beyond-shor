import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { USER_AGENT } from './config.mjs';

export function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** Write a file atomically (tmp + rename), creating parent directories. */
export function writeAtomic(path, data, mode = 0o640) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data, { mode });
  renameSync(tmp, path);
}

/** JSON exactly as it is signed and served: 2-space indent plus trailing newline. */
export function canonicalJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/**
 * Run `fn` over `items` with at most `limit` in flight. Results keep input order.
 * Errors from `fn` are not swallowed — callers catch per item if they need to.
 */
export async function mapPool(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      if (onProgress && done % 1000 === 0) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** fetch with our User-Agent, a timeout and a few retries for transient errors. */
export async function fetchRetry(url, { retries = 3, timeoutMs = 120_000, headers = {}, ...opts } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} for ${url}`);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.permanent = true;
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (err.permanent || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export function monthOf(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}
