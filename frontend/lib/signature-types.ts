// Shared types between SignaturePlayground component and the signature Web Worker.
// No React or Next.js imports allowed here.

export type DsaAlgorithm = 'ecdsa' | 'mldsa65' | 'slhdsa128s' | 'slhdsa128f';

export interface SigStep1Data {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  keygenMs:  number;
  dsa:       DsaAlgorithm;
}

export interface SigStep2Data {
  message:      Uint8Array; // UTF-8 encoded
  messageHash?: Uint8Array; // SHA-256 digest — only set for ECDSA (explicitly pre-hashed)
  signature:    Uint8Array;
  signMs:       number;
}

export interface SigStep3Data {
  valid:    boolean;
  verifyMs: number;
}

// ── Tamper ───────────────────────────────────────────────────────────────────

export type SigTamperField = 'message' | 'signature';

// ── Worker Messages ──────────────────────────────────────────────────────────

export type SigWorkerInMessage =
  | { type: 'start-sig'; message: string; dsa: DsaAlgorithm }
  | { type: 'tamper-sig'; field: SigTamperField; bytes: Uint8Array };

export type SigWorkerOutMessage =
  | { type: 'sig-step1'; data: SigStep1Data }
  | { type: 'sig-step2'; data: SigStep2Data }
  | { type: 'sig-step3'; data: SigStep3Data }
  | { type: 'tamper-sig-step3'; valid: boolean; verifyMs: number }
  | { type: 'sig-error'; message: string };

// ── Stats ────────────────────────────────────────────────────────────────────

export interface DsaStats {
  pubKeyBytes: number;
  secKeyBytes: number;
  sigBytes:    number;
  keygenMs:    number;
  signMs:      number;
  verifyMs:    number;
}

// ── Race ─────────────────────────────────────────────────────────────────────

export type SigRacePhase = 'waiting' | 'running' | 'done' | 'error';

export interface SigRaceEntry {
  phase:        SigRacePhase;
  keygenMs?:    number;
  signMs?:      number;
  verifyMs?:    number;
  totalMs?:     number;
  pubKeyBytes?: number;
  sigBytes?:    number;
}

// ── Benchmark ────────────────────────────────────────────────────────────────

export interface SigBenchmarkRun {
  keygenMs:    number;
  signMs:      number;
  verifyMs:    number;
  pubKeyBytes: number;
  secKeyBytes: number;
  sigBytes:    number;
}

export interface SigBenchmarkDsaState {
  status: 'waiting' | 'running' | 'done' | 'error';
  runs:   SigBenchmarkRun[];
  total:  number;
}
