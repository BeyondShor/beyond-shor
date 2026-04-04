// Shared types between the Web Worker, the React component, and the API routes.
// No React, no Next.js, no browser/Node-specific imports allowed here.

// ── Worker messages (component → worker) ──────────────────────────────────────

export type WorkerInMessage =
  | { id: string; type: 'keygen';    a0: number[] }
  | { id: string; type: 'encrypt';   a0: number[]; a1: number[]; mpkAgg: number[]; msg: string; targetId: string }
  | { id: string; type: 'dec_step1'; c0_0: number[]; c0_1: number[]; hsk0: number[]; hsk1: number[]; c1: number[] }
  | { id: string; type: 'dec_step2'; c0_0: number[]; temp: number[]; sk: number[] };

// ── Worker messages (worker → component) ──────────────────────────────────────

export interface KeyGenResult {
  id:   string;
  type: 'keygen_done';
  pk:   number[];
  sk:   number[];
  ms:   number;
}
export interface EncryptResult {
  id:   string;
  type: 'encrypt_done';
  c0_0: number[];
  c0_1: number[];
  c1:   number[];
  ms:   number;
}
export interface DecStep1Result {
  id:   string;
  type: 'dec_step1_done';
  temp: number[];
  ms:   number;
}
export interface DecStep2Result {
  id:   string;
  type: 'dec_step2_done';
  result: number[];
  msg:    string;
  ms:     number;
}
export interface WorkerError {
  id:   string;
  type: 'error';
  msg:  string;
}

export type WorkerOutMessage =
  | KeyGenResult
  | EncryptResult
  | DecStep1Result
  | DecStep2Result
  | WorkerError;

// ── API types ─────────────────────────────────────────────────────────────────

export interface ApiSetupResponse {
  sessionId:  string;
  a0:         number[];   // public CRS for KeyGen / Step-2 decryption
  a1:         number[];   // complement for identity-specific encryption
  N_max:      number;
  params: {
    N: number;
    Q: number;
    B: number;
  };
}

export interface ApiRegisterRequest {
  sessionId: string;
  userId:    string;
  pk:        number[];
}
export interface ApiRegisterResponse {
  mpkAgg:     number[];
  registered: string[];
}

export interface ApiHskResponse {
  hsk0: number[];
  hsk1: number[];
}

export interface ApiErrorResponse {
  error: string;
}
