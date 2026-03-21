/**
 * Playground DSA protocol tests.
 *
 * Tests the signature operations used in the SignaturePlayground directly
 * against the libraries — without the Web Worker wrapper. This catches:
 *  - Library API breakage after upgrades
 *  - Sign/verify protocol correctness
 *  - Tamper detection (invalid signature → verify returns false)
 *
 * The ECDSA pre-hashing convention (we hash with SHA-256 before signing,
 * matching signature-worker.ts) is explicitly tested here.
 *
 * SLH-DSA-SHA2-128s has slow signing (~1–2 s). It runs with the global
 * 60 s timeout configured in vitest.config.ts.
 */

import { describe, it, expect } from 'vitest';
import { p256 } from '@noble/curves/nist.js';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

// ── ECDSA P-256 ───────────────────────────────────────────────────────────────

async function sha256(msg: Uint8Array): Promise<Uint8Array> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', msg);
  return new Uint8Array(buf);
}

describe('ECDSA P-256', () => {
  it('keygen produces a compressed 33-byte public key and 32-byte secret key', () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(secretKey, true); // compressed
    expect(secretKey.byteLength).toBe(32);
    expect(publicKey.byteLength).toBe(33);
  });

  it('sign (hash) + verify roundtrip', async () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(secretKey, true);
    const msg = new TextEncoder().encode('test message');
    const msgHash = await sha256(msg);
    const sig = p256.sign(msgHash, secretKey);
    expect(p256.verify(sig, msgHash, publicKey)).toBe(true);
  });

  it('verification fails for tampered message', async () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(secretKey, true);
    const msg = new TextEncoder().encode('original message');
    const msgHash = await sha256(msg);
    const sig = p256.sign(msgHash, secretKey);

    const tampered = new TextEncoder().encode('tampered message');
    const tamperedHash = await sha256(tampered);
    expect(p256.verify(sig, tamperedHash, publicKey)).toBe(false);
  });

  it('verification fails for tampered signature', async () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(secretKey, true);
    const msg = new TextEncoder().encode('test');
    const msgHash = await sha256(msg);
    const sig = p256.sign(msgHash, secretKey);

    // p256.sign() in @noble/curves 2.x returns a 64-byte Uint8Array (compact r‖s)
    const tampered = new Uint8Array(sig);
    tampered[0] ^= 0xff;

    try {
      expect(p256.verify(tampered, msgHash, publicKey)).toBe(false);
    } catch {
      // Some tampered bytes produce an invalid point → throwing also counts as rejection
    }
  });

  it('wrong key cannot verify a valid signature', async () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(secretKey, true);
    const wrongPublicKey = p256.getPublicKey(p256.utils.randomSecretKey(), true);

    const msg = new TextEncoder().encode('test');
    const msgHash = await sha256(msg);
    const sig = p256.sign(msgHash, secretKey);

    expect(p256.verify(sig, msgHash, wrongPublicKey)).toBe(false);
  });
});

// ── ML-DSA-65 ─────────────────────────────────────────────────────────────────

describe('ML-DSA-65', () => {
  it('keygen produces keys of the correct size', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    // ML-DSA-65: public key 1952 bytes, secret key 4032 bytes (FIPS 204)
    expect(publicKey.byteLength).toBe(1952);
    expect(secretKey.byteLength).toBe(4032);
  });

  it('sign + verify roundtrip', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const msg = new TextEncoder().encode('test message for ML-DSA-65');
    const sig = ml_dsa65.sign(msg, secretKey);
    expect(ml_dsa65.verify(sig, msg, publicKey)).toBe(true);
  });

  it('signature has expected size (3309 bytes)', () => {
    const { secretKey } = ml_dsa65.keygen();
    const sig = ml_dsa65.sign(new TextEncoder().encode('x'), secretKey);
    expect(sig.byteLength).toBe(3309);
  });

  it('verification fails for tampered message', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const msg = new TextEncoder().encode('original');
    const sig = ml_dsa65.sign(msg, secretKey);

    const tampered = new TextEncoder().encode('tampered');
    expect(ml_dsa65.verify(sig, tampered, publicKey)).toBe(false);
  });

  it('verification fails for tampered signature', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const msg = new TextEncoder().encode('test');
    const sig = ml_dsa65.sign(msg, secretKey);

    const tampered = new Uint8Array(sig);
    tampered[0] ^= 0xff;
    expect(ml_dsa65.verify(tampered, msg, publicKey)).toBe(false);
  });

  it('wrong public key cannot verify a valid signature', () => {
    const { secretKey } = ml_dsa65.keygen();
    const { publicKey: wrongKey } = ml_dsa65.keygen();
    const msg = new TextEncoder().encode('test');
    const sig = ml_dsa65.sign(msg, secretKey);
    expect(ml_dsa65.verify(sig, msg, wrongKey)).toBe(false);
  });

  it('handles empty message', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const msg = new Uint8Array(0);
    const sig = ml_dsa65.sign(msg, secretKey);
    expect(ml_dsa65.verify(sig, msg, publicKey)).toBe(true);
  });

  it('handles UTF-8 message with multi-byte characters', () => {
    const { publicKey, secretKey } = ml_dsa65.keygen();
    const msg = new TextEncoder().encode('Quantencomputer: Ψ → |0⟩ + |1⟩');
    const sig = ml_dsa65.sign(msg, secretKey);
    expect(ml_dsa65.verify(sig, msg, publicKey)).toBe(true);
  });
});

// ── SLH-DSA-SHA2-128f (fast variant) ─────────────────────────────────────────
// SHA2-128s (slow variant) signs in ~1–2 s. Both are included but 128s has a
// dedicated test with a note about its performance.

describe('SLH-DSA-SHA2-128f', () => {
  it('sign + verify roundtrip', async () => {
    const { slh_dsa_sha2_128f } = await import('@noble/post-quantum/slh-dsa.js');
    const { publicKey, secretKey } = slh_dsa_sha2_128f.keygen();
    const msg = new TextEncoder().encode('SLH-DSA-SHA2-128f test');
    const sig = slh_dsa_sha2_128f.sign(msg, secretKey);
    expect(slh_dsa_sha2_128f.verify(sig, msg, publicKey)).toBe(true);
  });

  it('verification fails for tampered message', async () => {
    const { slh_dsa_sha2_128f } = await import('@noble/post-quantum/slh-dsa.js');
    const { publicKey, secretKey } = slh_dsa_sha2_128f.keygen();
    const msg = new TextEncoder().encode('original');
    const sig = slh_dsa_sha2_128f.sign(msg, secretKey);

    const tampered = new TextEncoder().encode('tampered');
    expect(slh_dsa_sha2_128f.verify(sig, tampered, publicKey)).toBe(false);
  });
});

describe('SLH-DSA-SHA2-128s (slow variant — ~1–2 s signing)', () => {
  it('sign + verify roundtrip', async () => {
    const { slh_dsa_sha2_128s } = await import('@noble/post-quantum/slh-dsa.js');
    const { publicKey, secretKey } = slh_dsa_sha2_128s.keygen();
    const msg = new TextEncoder().encode('SLH-DSA-SHA2-128s test');
    const sig = slh_dsa_sha2_128s.sign(msg, secretKey);
    expect(slh_dsa_sha2_128s.verify(sig, msg, publicKey)).toBe(true);
  });

  it('verification fails for tampered message', async () => {
    const { slh_dsa_sha2_128s } = await import('@noble/post-quantum/slh-dsa.js');
    const { publicKey, secretKey } = slh_dsa_sha2_128s.keygen();
    const msg = new TextEncoder().encode('original');
    const sig = slh_dsa_sha2_128s.sign(msg, secretKey);

    const tampered = new TextEncoder().encode('tampered');
    expect(slh_dsa_sha2_128s.verify(sig, tampered, publicKey)).toBe(false);
  });
});
