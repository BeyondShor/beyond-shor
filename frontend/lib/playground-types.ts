// Shared types between HybridPlayground component and the Web Worker.
// No React or Next.js imports allowed here.

export type KemAlgorithm = 'mlkem' | 'mceliece' | 'frodokem';

export interface Step1Data {
  clientX25519Priv: Uint8Array;
  clientX25519Pub:  Uint8Array;
  serverX25519Priv: Uint8Array;
  serverX25519Pub:  Uint8Array;
  kemServerPriv:    Uint8Array;
  kemServerPub:     Uint8Array;
  kemKeygenMs:      number;
  kem:              KemAlgorithm;
}

export interface Step2Data {
  x25519Secret:       Uint8Array; // client: DH(clientPriv, serverPub)
  x25519SecretServer: Uint8Array; // server: DH(serverPriv, clientPub) — must equal x25519Secret
}

export interface Step3Data {
  kemCiphertext:    Uint8Array; // sent from client → server
  kemSecret:        Uint8Array; // client (from encapsulate)
  kemSecretServer:  Uint8Array; // server (from decapsulate) — must equal kemSecret
  encapMs:          number;     // encapsulate timing (client)
  decapMs:          number;     // decapsulate timing (server)
}

export interface Step4Data {
  hkdfSalt:           Uint8Array; // shared over the wire with the ciphertext
  combinedKey:        Uint8Array; // client side
  combinedKeyServer:  Uint8Array; // server side — must equal combinedKey
}

export interface Step5Data {
  iv:            Uint8Array;
  ciphertext:    Uint8Array;
  plaintextUsed: string;
}

export interface Step6Data {
  decrypted: string; // server AES-GCM decrypt result — must equal plaintextUsed
}

// ── Tamper ──────────────────────────────────────────────────────────────────

export type TamperField = 'aesCiphertext' | 'iv' | 'kemCiphertext';

// ── Race ────────────────────────────────────────────────────────────────────

export type RacePhase = 'waiting' | 'running' | 'done' | 'error';

export interface RaceEntry {
  phase:      RacePhase;
  keygenMs?:  number;
  encapMs?:   number;
  decapMs?:   number;
  totalMs?:   number;
  pubKeyBytes?: number;
  ciphertextBytes?: number;
}

// ── Worker Messages ─────────────────────────────────────────────────────────

export type WorkerInMessage =
  | { type: 'start'; plaintext: string; kem: KemAlgorithm }
  | { type: 'tamper'; field: TamperField; bytes: Uint8Array };

export type WorkerOutMessage =
  | { type: 'step1'; data: Step1Data }
  | { type: 'step2'; data: Step2Data }
  | { type: 'step3'; data: Step3Data }
  | { type: 'step4'; data: Step4Data }
  | { type: 'step5'; data: Step5Data }
  | { type: 'step6'; data: Step6Data }
  // Tamper replay — emitted step-by-step so the UI shows the cascade
  | { type: 'tamper-step3'; kemSecretServer: Uint8Array }
  | { type: 'tamper-step4'; combinedKeyServer: Uint8Array }
  | { type: 'tamper-step6'; errorKey: string }
  | { type: 'error'; message: string };

export interface KemStats {
  pubKeyBytes:     number;
  ciphertextBytes: number;
  ssBytes:         number;
  keygenMs:        number;
  encapMs:         number;
  decapMs:         number;
}

// ── Benchmark ────────────────────────────────────────────────────────────────

export interface BenchmarkRun {
  keygenMs:        number;
  encapMs:         number;
  decapMs:         number;
  pubKeyBytes:     number;
  ciphertextBytes: number;
  ssBytes:         number;
}

export interface BenchmarkKemState {
  status: 'waiting' | 'running' | 'done' | 'error';
  runs:   BenchmarkRun[];
  total:  number;
}
