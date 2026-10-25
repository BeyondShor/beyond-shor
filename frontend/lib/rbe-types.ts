// Shared types between the RBE Web Worker, the React component and the KC API routes.
// No React, no Next.js, no browser/Node-specific imports allowed here.

import type { WireMat } from './rbe/wire';

export type { WireMat };

export type UserName = 'alice' | 'bob' | 'charlie';
export const USER_NAMES: readonly UserName[] = ['alice', 'bob', 'charlie'];

export interface WireCiphertext {
  ct0: WireMat;   // 1 × (l+1)m
  ct1: WireMat;   // 1 × k
}

// ── Worker messages (component → worker) ──────────────────────────────────────

export type WorkerInMessage =
  | { id: string; type: 'init'; seed: string }
  | { id: string; type: 'keygen' }
  | { id: string; type: 'encrypt'; mpk: WireMat; target: number; message: string }
  | { id: string; type: 'dec_step1'; ct: WireCiphertext; hsk: WireMat }
  | { id: string; type: 'dec_step2'; ctReg: WireMat; sk: WireMat }
  | { id: string; type: 'verify_mpk'; users: { id: number; pk: WireMat }[]; mpk: WireMat };

// ── Worker messages (worker → component) ──────────────────────────────────────

export type WorkerOutMessage = { id: string; ms: number } & (
  | { type: 'init_done'; preview: number[] }
  | { type: 'keygen_done'; pk: WireMat; sk: WireMat }
  | { type: 'encrypt_done'; ct: WireCiphertext }
  | { type: 'dec_step1_done'; ctReg: WireMat }
  | { type: 'dec_step2_done'; message: string; noise: number; value: number[] }
  | { type: 'verify_mpk_done'; match: boolean }
  | { type: 'error'; msg: string }
);

// ── KC API ────────────────────────────────────────────────────────────────────

export interface ApiSessionResponse {
  sessionId: string;
  seed:      string;   // hex — the CRS is A = SHAKE-256(seed), anyone can expand it
}

export interface ApiRegisterRequest {
  sessionId: string;
  name:      UserName;
  pk:        WireMat;
}

export interface ApiRegisterResponse {
  identity:   number;
  mpk:        WireMat;
  registered: { name: UserName; identity: number }[];
}

export interface ApiHskResponse {
  identity: number;
  hsk:      WireMat;   // 'i16' — short by construction
  norm:     number;    // largest |coefficient| of hsk
}

export interface ApiErrorResponse {
  error: string;
}
