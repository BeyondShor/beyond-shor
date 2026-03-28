// Shared state format for playground URL sharing.
// No React or browser APIs — can be imported from any context.

import type { KemAlgorithm, BenchmarkKemState } from './playground-types';
import type { DsaAlgorithm, SigBenchmarkDsaState } from './signature-types';

// ── KEM run ───────────────────────────────────────────────────────────────────

export interface KemRunShareState {
  v:    1;
  mode: 'encryption';
  type: 'run';
  kem:  KemAlgorithm;
  s1: {
    cxPub: string; cxPriv: string;
    sxPub: string; sxPriv: string;
    kemPub: string; kemPriv: string;
    keygenMs: number;
  };
  s2: { secret: string };
  s3: { ct: string; kemSecret: string; encapMs: number; decapMs: number };
  s4: { salt: string; key: string };
  s5: { iv: string; ct: string; plaintext: string };
  s6: { decrypted: string };
}

// ── KEM benchmark ─────────────────────────────────────────────────────────────

export interface KemBenchmarkShareState {
  v:    1;
  mode: 'encryption';
  type: 'benchmark';
  benchmark: Partial<Record<KemAlgorithm, BenchmarkKemState>>;
}

// ── DSA run ───────────────────────────────────────────────────────────────────

export interface SigRunShareState {
  v:    1;
  mode: 'signatures';
  type: 'run';
  dsa:  DsaAlgorithm;
  s1: { pk: string; sk: string; keygenMs: number };
  s2: { msg: string; msgHash?: string; sig: string; signMs: number };
  s3: { valid: boolean; verifyMs: number };
}

// ── DSA benchmark ─────────────────────────────────────────────────────────────

export interface SigBenchmarkShareState {
  v:    1;
  mode: 'signatures';
  type: 'benchmark';
  benchmark: Partial<Record<DsaAlgorithm, SigBenchmarkDsaState>>;
}

export type ShareState =
  | KemRunShareState
  | KemBenchmarkShareState
  | SigRunShareState
  | SigBenchmarkShareState;

// ── Encode / Decode ───────────────────────────────────────────────────────────

export function encodeShareState(state: ShareState): string {
  return btoa(JSON.stringify(state))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeShareState(encoded: string): ShareState | null {
  try {
    const pad = (4 - encoded.length % 4) % 4;
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
    const obj = JSON.parse(atob(b64));
    if (obj?.v !== 1) return null;
    return obj as ShareState;
  } catch {
    return null;
  }
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`fromHex: odd-length hex string (${hex.length} chars)`);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
