// Server-only: in-memory KC session store.
// Works correctly on a SINGLE Node.js process (PM2 fork mode).
// Do NOT use with cluster mode or multi-instance deployments.
import 'server-only';

import { N_MAX } from './params';

export interface RbeUser {
  pk: number[];
}

export interface KcSession {
  sessionId:  string;
  a0:         number[];   // public CRS polynomial
  a1:         number[];   // complement: a0·r + a1 = 1
  r:          number[];   // KC trapdoor (private)
  users:      Map<string, RbeUser>;
  mpkAgg:     number[];   // Σ pk_i
  createdAt:  number;     // Date.now()
  expiresAt:  number;     // Date.now() + TTL_MS
}

// ── Store & TTL ───────────────────────────────────────────────────────────────

const TTL_MS    = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 200;

const store = new Map<string, KcSession>();

function reap(): void {
  const now = Date.now();
  for (const [id, s] of store) {
    if (s.expiresAt < now) store.delete(id);
  }
}

// Reap expired sessions every 5 minutes
let _reaperStarted = false;
function startReaper(): void {
  if (_reaperStarted) return;
  _reaperStarted = true;
  setInterval(reap, 5 * 60 * 1000);
}

// ── Rate limiter (per-IP, max 10 sessions / hour) ─────────────────────────────

interface RateEntry { count: number; resetAt: number }
const rateLimiter = new Map<string, RateEntry>();

export function checkRateLimit(ip: string): boolean {
  const now  = Date.now();
  const hour = 60 * 60 * 1000;
  const entry = rateLimiter.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimiter.set(ip, { count: 1, resetAt: now + hour });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createSession(session: Omit<KcSession, 'createdAt' | 'expiresAt'>): KcSession {
  startReaper();
  reap();
  if (store.size >= MAX_SESSIONS) {
    const oldest = [...store.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) store.delete(oldest.sessionId);
  }
  const now = Date.now();
  const full: KcSession = { ...session, createdAt: now, expiresAt: now + TTL_MS };
  store.set(session.sessionId, full);
  return full;
}

export function getSession(sessionId: string): KcSession | null {
  const s = store.get(sessionId);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { store.delete(sessionId); return null; }
  return s;
}

export function sessionCount(): number {
  return store.size;
}
