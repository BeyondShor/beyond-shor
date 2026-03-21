// cbom: ecdsa-p256:playground
// cbom: ml-dsa-65:playground
// cbom: slh-dsa-sha2-128s:playground
// cbom: slh-dsa-sha2-128f:playground
import { p256 } from '@noble/curves/nist.js';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import type {
  DsaAlgorithm,
  SigWorkerInMessage,
  SigWorkerOutMessage,
  SigStep1Data,
  SigStep2Data,
  SigStep3Data,
} from '@/lib/signature-types';

function post(msg: SigWorkerOutMessage) { self.postMessage(msg); }
function now(): number { return performance.now(); }

// State preserved between run and tamper replays
let savedState: {
  publicKey: Uint8Array;
  message:   Uint8Array;
  signature: Uint8Array;
  dsa:       DsaAlgorithm;
} | null = null;

async function getSlhDsa(variant: 'slhdsa128s' | 'slhdsa128f') {
  const mod = await import('@noble/post-quantum/slh-dsa.js');
  return variant === 'slhdsa128s' ? mod.slh_dsa_sha2_128s : mod.slh_dsa_sha2_128f;
}

async function sha256(msg: Uint8Array): Promise<Uint8Array> {
  // msg.slice() ensures a plain ArrayBuffer (not SharedArrayBuffer) for SubtleCrypto
  const buf = await crypto.subtle.digest('SHA-256', msg.slice());
  return new Uint8Array(buf);
}

async function doVerify(
  dsa: DsaAlgorithm,
  sig: Uint8Array,
  msg: Uint8Array,
  pub: Uint8Array,
): Promise<boolean> {
  try {
    if (dsa === 'ecdsa') {
      // ECDSA signs the hash, not the message directly.
      // The verifier must independently compute SHA-256(msg) before verifying.
      const msgHash = await sha256(msg);
      return p256.verify(sig, msgHash, pub);
    }
    if (dsa === 'mldsa65') return ml_dsa65.verify(sig, msg, pub);
    const algo = await getSlhDsa(dsa as 'slhdsa128s' | 'slhdsa128f');
    return algo.verify(sig, msg, pub);
  } catch { return false; }
}

async function run(message: string, dsa: DsaAlgorithm) {
  // ── Step 1: Key generation ────────────────────────────────────────────────
  let secretKey: Uint8Array;
  let publicKey: Uint8Array;

  const t0 = now();
  if (dsa === 'ecdsa') {
    secretKey = p256.utils.randomSecretKey();
    publicKey = p256.getPublicKey(secretKey, true); // compressed 33 B
  } else if (dsa === 'mldsa65') {
    const kp = ml_dsa65.keygen();
    secretKey = kp.secretKey;
    publicKey = kp.publicKey;
  } else {
    const algo = await getSlhDsa(dsa as 'slhdsa128s' | 'slhdsa128f');
    const kp = algo.keygen();
    secretKey = kp.secretKey;
    publicKey = kp.publicKey;
  }
  const keygenMs = now() - t0;

  const step1: SigStep1Data = { publicKey, secretKey, keygenMs, dsa };
  post({ type: 'sig-step1', data: step1 });

  // ── Step 2: Sign ──────────────────────────────────────────────────────────
  const msgBytes = new TextEncoder().encode(message);
  let signature: Uint8Array;

  // For ECDSA: explicitly hash the message, then sign the hash.
  // This makes the SHA-256 pre-hashing step visible and pedagogically correct.
  // ML-DSA and SLH-DSA accept the full message and handle hashing internally per their spec.
  let messageHash: Uint8Array | undefined;

  const t1 = now();
  if (dsa === 'ecdsa') {
    messageHash = await sha256(msgBytes);
    signature = p256.sign(messageHash, secretKey); // signs H(msg), not msg
  } else if (dsa === 'mldsa65') {
    signature = ml_dsa65.sign(msgBytes, secretKey);
  } else {
    const algo = await getSlhDsa(dsa as 'slhdsa128s' | 'slhdsa128f');
    signature = algo.sign(msgBytes, secretKey);
  }
  const signMs = now() - t1;

  const step2: SigStep2Data = { message: msgBytes, messageHash, signature, signMs };
  post({ type: 'sig-step2', data: step2 });

  // Preserve state for tamper replays
  savedState = { publicKey, message: msgBytes, signature, dsa };

  // ── Step 3: Verify ────────────────────────────────────────────────────────
  const t2 = now();
  const valid = await doVerify(dsa, signature, msgBytes, publicKey);
  const verifyMs = now() - t2;

  const step3: SigStep3Data = { valid, verifyMs };
  post({ type: 'sig-step3', data: step3 });
}

async function tamper(field: 'message' | 'signature', bytes: Uint8Array) {
  if (!savedState) {
    post({ type: 'sig-error', message: 'No saved state — generate first' });
    return;
  }
  const msg = field === 'message'   ? bytes : savedState.message;
  const sig = field === 'signature' ? bytes : savedState.signature;

  const t = now();
  const valid = await doVerify(savedState.dsa, sig, msg, savedState.publicKey);
  const verifyMs = now() - t;

  post({ type: 'tamper-sig-step3', valid, verifyMs });
}

self.onmessage = async (e: MessageEvent<SigWorkerInMessage>) => {
  try {
    const msg = e.data;
    if (msg.type === 'start-sig') {
      savedState = null;
      await run(msg.message, msg.dsa);
    } else if (msg.type === 'tamper-sig') {
      await tamper(msg.field, msg.bytes);
    }
  } catch (err) {
    post({ type: 'sig-error', message: err instanceof Error ? err.message : String(err) });
  }
};
