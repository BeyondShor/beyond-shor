/// <reference lib="webworker" />
// Web Worker — runs all hybrid encryption steps off the main thread.
// Imports are dynamically loaded so heavy WASM (McEliece, FrodoKEM) only loads when used.
// Posts a typed WorkerOutMessage after each step so the UI can render progressively.
// After step6 the worker stays alive to handle optional tamper messages.

import { x25519 } from '@noble/curves/ed25519.js';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import type {
  KemAlgorithm,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  Step5Data,
  Step6Data,
  TamperField,
  WorkerInMessage,
  WorkerOutMessage,
} from '@/lib/playground-types';

function post(msg: WorkerOutMessage) {
  (self as unknown as Worker).postMessage(msg);
}

/** Cast a Uint8Array to ArrayBuffer so crypto.subtle accepts it regardless of TS lib target. */
function asBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer as ArrayBuffer;
}

// ── Persisted tamper state (set after run completes) ────────────────────────

interface TamperState {
  kem:                KemAlgorithm;
  kemServerPriv:      Uint8Array;
  x25519SecretServer: Uint8Array;
  hkdfSalt:           Uint8Array;
  combinedKeyServer:  CryptoKey;  // pre-derived, valid key for fast AES tamper
  iv:                 Uint8Array;
  ciphertext:         Uint8Array; // original AES ciphertext
  kemCiphertext:      Uint8Array; // original KEM ciphertext
}

let tamperState: TamperState | null = null;

// ── HKDF helper ─────────────────────────────────────────────────────────────

async function deriveKey(x25519S: Uint8Array, kemS: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const ikm = new Uint8Array(x25519S.length + kemS.length);
  ikm.set(x25519S, 0);
  ikm.set(kemS, x25519S.length);
  const ikmKey = await crypto.subtle.importKey('raw', asBuf(ikm), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: asBuf(salt), info: new TextEncoder().encode('hybrid-pqc-playground-v1') },
    ikmKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ── Main run ────────────────────────────────────────────────────────────────

async function run(plaintext: string, kem: KemAlgorithm) {
  tamperState = null;

  // ── Step 1: Key generation ──────────────────────────────────────────────

  const clientX25519Priv = x25519.utils.randomSecretKey();
  const clientX25519Pub  = x25519.getPublicKey(clientX25519Priv);
  const serverX25519Priv = x25519.utils.randomSecretKey();
  const serverX25519Pub  = x25519.getPublicKey(serverX25519Priv);

  let kemServerPriv:   Uint8Array;
  let kemServerPub:    Uint8Array;
  let kemCiphertext:   Uint8Array;
  let kemSecret:       Uint8Array;
  let kemSecretServer: Uint8Array;
  let kemKeygenMs:     number;
  let encapMs:         number;
  let decapMs:         number;

  if (kem === 'mlkem') {
    const t0 = performance.now();
    const { publicKey, secretKey } = ml_kem1024.keygen();
    kemKeygenMs   = performance.now() - t0;
    kemServerPub  = publicKey;
    kemServerPriv = secretKey;

    const te = performance.now();
    const { cipherText, sharedSecret } = ml_kem1024.encapsulate(kemServerPub);
    encapMs = performance.now() - te;
    kemCiphertext = cipherText;
    kemSecret     = sharedSecret;

    const td = performance.now();
    kemSecretServer = ml_kem1024.decapsulate(cipherText, secretKey);
    decapMs = performance.now() - td;

  } else if (kem === 'mceliece') {
    const { mceliece } = await import('mceliece');
    await new Promise<void>(r => setTimeout(r, 20));
    const t0 = performance.now();
    const { publicKey, privateKey } = await mceliece.keyPair();
    kemKeygenMs   = performance.now() - t0;
    kemServerPub  = publicKey;
    kemServerPriv = privateKey;

    const te = performance.now();
    const { cyphertext, secret } = await mceliece.encrypt(kemServerPub);
    encapMs = performance.now() - te;
    kemCiphertext = cyphertext;
    kemSecret     = secret;

    const td = performance.now();
    kemSecretServer = await mceliece.decrypt(cyphertext, privateKey);
    decapMs = performance.now() - td;

  } else {
    // FrodoKEM-1344-AES
    const { createFrodoKEM1344AES } = await import('@oqs/liboqs-js');
    const t0 = performance.now();
    const aliceFrodo = await createFrodoKEM1344AES();
    const bobFrodo   = await createFrodoKEM1344AES();
    const { publicKey, secretKey } = aliceFrodo.generateKeyPair();
    kemKeygenMs   = performance.now() - t0;
    kemServerPub  = publicKey;
    kemServerPriv = secretKey;

    const te = performance.now();
    const { ciphertext: ct, sharedSecret } = bobFrodo.encapsulate(kemServerPub);
    encapMs = performance.now() - te;
    kemCiphertext = ct;
    kemSecret     = sharedSecret;

    const td = performance.now();
    kemSecretServer = aliceFrodo.decapsulate(ct, secretKey);
    decapMs = performance.now() - td;

    aliceFrodo.destroy();
    bobFrodo.destroy();
  }

  const step1: Step1Data = {
    clientX25519Priv, clientX25519Pub,
    serverX25519Priv, serverX25519Pub,
    kemServerPriv, kemServerPub,
    kemKeygenMs, kem,
  };
  post({ type: 'step1', data: step1 });

  // ── Step 2: X25519 DH (both sides) ─────────────────────────────────────

  const x25519Secret       = x25519.getSharedSecret(clientX25519Priv, serverX25519Pub);
  const x25519SecretServer = x25519.getSharedSecret(serverX25519Priv, clientX25519Pub);

  const step2: Step2Data = { x25519Secret, x25519SecretServer };
  post({ type: 'step2', data: step2 });

  // ── Step 3: KEM encapsulation / decapsulation ───────────────────────────

  const step3: Step3Data = { kemCiphertext, kemSecret, kemSecretServer, encapMs, decapMs };
  post({ type: 'step3', data: step3 });

  // ── Step 4: HKDF-SHA256 ─────────────────────────────────────────────────

  const hkdfSalt = crypto.getRandomValues(new Uint8Array(32));

  const [combinedKeyObj, combinedKeyServerObj] = await Promise.all([
    deriveKey(x25519Secret, kemSecret, hkdfSalt),
    deriveKey(x25519SecretServer, kemSecretServer, hkdfSalt),
  ]);

  const combinedKey       = new Uint8Array(await crypto.subtle.exportKey('raw', combinedKeyObj));
  const combinedKeyServer = new Uint8Array(await crypto.subtle.exportKey('raw', combinedKeyServerObj));

  const step4: Step4Data = { hkdfSalt, combinedKey, combinedKeyServer };
  post({ type: 'step4', data: step4 });

  // ── Step 5: AES-256-GCM encrypt (client) ────────────────────────────────

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBuf  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuf(iv) }, combinedKeyObj, asBuf(plaintextBytes));
  const ciphertext     = new Uint8Array(ciphertextBuf);

  const step5: Step5Data = { iv, ciphertext, plaintextUsed: plaintext };
  post({ type: 'step5', data: step5 });

  // ── Step 6: AES-256-GCM decrypt (server uses its own derived key) ───────

  const decryptedBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, combinedKeyServerObj, asBuf(ciphertext));
  const decrypted    = new TextDecoder().decode(decryptedBuf);

  const step6: Step6Data = { decrypted };
  post({ type: 'step6', data: step6 });

  // ── Persist state for tamper mode (worker stays alive) ──────────────────
  tamperState = {
    kem, kemServerPriv, x25519SecretServer,
    hkdfSalt, combinedKeyServer: combinedKeyServerObj,
    iv, ciphertext, kemCiphertext,
  };
}

// ── Tamper handler ──────────────────────────────────────────────────────────
// Streams step-by-step messages so the UI can show the cascade of failures.

async function handleTamper(field: TamperField, bytes: Uint8Array) {
  if (!tamperState) return;

  const { kem, kemServerPriv, x25519SecretServer, hkdfSalt,
          combinedKeyServer, iv, ciphertext } = tamperState;

  if (field === 'kemCiphertext') {
    // ── Step 3: re-decapsulate with modified ciphertext → wrong KEM secret ──
    let wrongKemSecret: Uint8Array;
    if (kem === 'mlkem') {
      wrongKemSecret = ml_kem1024.decapsulate(bytes, kemServerPriv);
    } else if (kem === 'mceliece') {
      const { mceliece } = await import('mceliece');
      wrongKemSecret = await mceliece.decrypt(bytes, kemServerPriv);
    } else {
      const { createFrodoKEM1344AES } = await import('@oqs/liboqs-js');
      const f = await createFrodoKEM1344AES();
      wrongKemSecret = f.decapsulate(bytes, kemServerPriv);
      f.destroy();
    }
    post({ type: 'tamper-step3', kemSecretServer: wrongKemSecret });

    // ── Step 4: HKDF with wrong KEM secret → wrong combined key ─────────────
    const wrongKeyObj = await deriveKey(x25519SecretServer, wrongKemSecret, hkdfSalt);
    const wrongKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', wrongKeyObj));
    post({ type: 'tamper-step4', combinedKeyServer: wrongKeyBytes });

    // ── Step 6: AES-GCM decrypt with wrong key → tag mismatch ───────────────
    // Both branches post the same error key: the try path handles the (theoretical)
    // case where decryption somehow succeeds despite the wrong key; the catch path
    // handles the expected AES-GCM authentication failure. Either way the UI
    // should show a failure — the distinction only matters for logging.
    try {
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, wrongKeyObj, asBuf(ciphertext));
      post({ type: 'tamper-step6', errorKey: 'tamperStep6KemFail' });
    } catch {
      post({ type: 'tamper-step6', errorKey: 'tamperStep6KemFail' });
    }

  } else {
    // ── AES ciphertext or IV tamper → directly attempt decrypt → tag mismatch
    // As above: both branches post the same error key. The catch path is the
    // expected outcome (GCM authentication tag mismatch); the try path covers
    // the edge case where no bytes were actually changed.
    try {
      if (field === 'aesCiphertext') {
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, combinedKeyServer, asBuf(bytes));
      } else {
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuf(bytes) }, combinedKeyServer, asBuf(ciphertext));
      }
      post({ type: 'tamper-step6', errorKey: 'tamperStep6AesFail' });
    } catch {
      post({ type: 'tamper-step6', errorKey: 'tamperStep6AesFail' });
    }
  }
}

// ── Message router ──────────────────────────────────────────────────────────

(self as unknown as Worker).onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === 'start') {
      await run(msg.plaintext, msg.kem);
    } else if (msg.type === 'tamper') {
      await handleTamper(msg.field, msg.bytes);
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
