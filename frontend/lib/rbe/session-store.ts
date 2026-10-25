// Server-only: in-memory key curator sessions.
// Works on a SINGLE Node.js process (PM2 fork mode); not for cluster deployments.
//
// Everything stored here is public: the CRS seed, registered public keys, the
// master public key and the precomputed blocks for helper keys. The key curator
// holds no secret — any party can recompute all of it.
import 'server-only';

import type { UserName } from '@/lib/rbe-types';
import { type Crs, type Registration, type RbeContext, createContext, setup, masterPublicKey } from './scheme';
import type { Mat } from './matrix';

export interface KcSession {
  sessionId: string;
  seed:      Uint8Array;
  crs:       Crs;
  users:     Map<UserName, Registration>;
  mpk:       Mat;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS       = 30 * 60 * 1000;  // 30 minutes
const MAX_SESSIONS = 50;              // ~1 MB each (CRS + precomputed blocks)

const store = new Map<string, KcSession>();

export const kcContext: RbeContext = createContext();

function reap(): void {
  const now = Date.now();
  for (const [id, s] of store) if (s.expiresAt < now) store.delete(id);
}

let reaperStarted = false;
function startReaper(): void {
  if (reaperStarted) return;
  reaperStarted = true;
  setInterval(reap, 5 * 60 * 1000).unref?.();
}

// ── Rate limiter (per IP, max 10 sessions per hour) ───────────────────────────

interface RateEntry { count: number; resetAt: number }
const rateLimiter = new Map<string, RateEntry>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimiter.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createSession(sessionId: string, seed: Uint8Array): KcSession {
  startReaper();
  reap();
  if (store.size >= MAX_SESSIONS) {
    const oldest = [...store.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) store.delete(oldest.sessionId);
  }
  const now = Date.now();
  const session: KcSession = {
    sessionId,
    seed,
    crs: setup(kcContext, seed),
    users: new Map(),
    mpk: masterPublicKey(kcContext, []),
    createdAt: now,
    expiresAt: now + TTL_MS,
  };
  store.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): KcSession | null {
  const s = store.get(sessionId);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { store.delete(sessionId); return null; }
  return s;
}
