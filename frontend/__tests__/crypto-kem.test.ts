/**
 * Playground KEM protocol tests.
 *
 * Tests the cryptographic operations used in the HybridPlayground directly
 * against the libraries — without the Web Worker wrapper. This catches:
 *  - Library API breakage after upgrades
 *  - Incorrect shared-secret semantics (encap ≠ decap)
 *  - HKDF + AES-GCM round-trip correctness
 *
 * McEliece and FrodoKEM are intentionally skipped here because they require
 * WASM initialisation and McEliece keygen takes 10–30 s. Both are covered
 * by Playwright E2E tests that run the full playground in a real browser.
 */

import { describe, it, expect } from 'vitest';
import { x25519 } from '@noble/curves/ed25519.js';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';

// ── ML-KEM-1024 ───────────────────────────────────────────────────────────────

describe('ML-KEM-1024', () => {
  it('keygen produces public and secret key', () => {
    const { publicKey, secretKey } = ml_kem1024.keygen();
    // ML-KEM-1024 public key: 1568 bytes; secret key: 3168 bytes
    expect(publicKey.byteLength).toBe(1568);
    expect(secretKey.byteLength).toBe(3168);
  });

  it('encapsulate + decapsulate produce identical shared secrets', () => {
    const { publicKey, secretKey } = ml_kem1024.keygen();
    const { cipherText, sharedSecret: clientSecret } = ml_kem1024.encapsulate(publicKey);
    const serverSecret = ml_kem1024.decapsulate(cipherText, secretKey);
    expect(clientSecret).toEqual(serverSecret);
  });

  it('shared secret is 32 bytes', () => {
    const { publicKey, secretKey } = ml_kem1024.keygen();
    const { sharedSecret } = ml_kem1024.encapsulate(publicKey);
    expect(sharedSecret.byteLength).toBe(32);
  });

  it('ciphertext is 1568 bytes', () => {
    const { publicKey } = ml_kem1024.keygen();
    const { cipherText } = ml_kem1024.encapsulate(publicKey);
    expect(cipherText.byteLength).toBe(1568);
  });

  it('different keypairs produce different shared secrets', () => {
    const kp1 = ml_kem1024.keygen();
    const kp2 = ml_kem1024.keygen();
    const { sharedSecret: s1 } = ml_kem1024.encapsulate(kp1.publicKey);
    const { sharedSecret: s2 } = ml_kem1024.encapsulate(kp2.publicKey);
    // Shared secrets from different keypairs should differ (with overwhelming probability)
    expect(Buffer.from(s1).toString('hex')).not.toBe(Buffer.from(s2).toString('hex'));
  });

  it('tampered ciphertext produces a different (wrong) secret on decapsulation', () => {
    const { publicKey, secretKey } = ml_kem1024.keygen();
    const { cipherText, sharedSecret: originalSecret } = ml_kem1024.encapsulate(publicKey);

    // Flip a byte in the ciphertext
    const tampered = new Uint8Array(cipherText);
    tampered[0] ^= 0xff;

    // ML-KEM is IND-CCA2: decapsulating tampered ciphertext returns a pseudorandom
    // value that differs from the original shared secret
    const wrongSecret = ml_kem1024.decapsulate(tampered, secretKey);
    expect(Buffer.from(wrongSecret).toString('hex'))
      .not.toBe(Buffer.from(originalSecret).toString('hex'));
  });
});

// ── X25519 key exchange ───────────────────────────────────────────────────────

describe('X25519', () => {
  it('both sides compute the same shared secret (DH)', () => {
    const clientPriv = x25519.utils.randomSecretKey();
    const clientPub  = x25519.getPublicKey(clientPriv);
    const serverPriv = x25519.utils.randomSecretKey();
    const serverPub  = x25519.getPublicKey(serverPriv);

    const clientSecret = x25519.getSharedSecret(clientPriv, serverPub);
    const serverSecret = x25519.getSharedSecret(serverPriv, clientPub);

    expect(clientSecret).toEqual(serverSecret);
  });

  it('keys are 32 bytes', () => {
    const priv = x25519.utils.randomSecretKey();
    const pub  = x25519.getPublicKey(priv);
    expect(priv.byteLength).toBe(32);
    expect(pub.byteLength).toBe(32);
  });

  it('different keypairs produce different DH secrets', () => {
    const a = x25519.utils.randomSecretKey();
    const b = x25519.utils.randomSecretKey();
    const c = x25519.utils.randomSecretKey();

    const s1 = x25519.getSharedSecret(a, x25519.getPublicKey(b));
    const s2 = x25519.getSharedSecret(a, x25519.getPublicKey(c));

    expect(Buffer.from(s1).toString('hex')).not.toBe(Buffer.from(s2).toString('hex'));
  });
});

// ── HKDF-SHA256 + AES-256-GCM ────────────────────────────────────────────────
// Mirrors the deriveKey + encrypt/decrypt flow in playground-worker.ts

async function deriveKey(x25519S: Uint8Array, kemS: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const ikm = new Uint8Array(x25519S.length + kemS.length);
  ikm.set(x25519S, 0);
  ikm.set(kemS, x25519S.length);
  const ikmKey = await globalThis.crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('hybrid-pqc-playground-v1') },
    ikmKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

describe('HKDF-SHA256 + AES-256-GCM (hybrid key derivation)', () => {
  it('client and server derive the same key from matching shared secrets', async () => {
    // Simulate matching secrets (as in the playground: both sides DH + KEM agree)
    const x25519Secret = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const kemSecret    = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const salt         = globalThis.crypto.getRandomValues(new Uint8Array(32));

    const clientKey = await deriveKey(x25519Secret, kemSecret, salt);
    const serverKey = await deriveKey(x25519Secret, kemSecret, salt); // same inputs

    const clientRaw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', clientKey));
    const serverRaw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', serverKey));

    expect(clientRaw).toEqual(serverRaw);
  });

  it('derived key is 32 bytes (AES-256)', async () => {
    const x25519Secret = new Uint8Array(32).fill(1);
    const kemSecret    = new Uint8Array(32).fill(2);
    const salt         = new Uint8Array(32).fill(3);
    const key = await deriveKey(x25519Secret, kemSecret, salt);
    const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key));
    expect(raw.byteLength).toBe(32);
  });

  it('different secrets produce different derived keys', async () => {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const key1 = await deriveKey(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2), salt);
    const key2 = await deriveKey(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4), salt);
    const raw1 = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key1));
    const raw2 = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key2));
    expect(Buffer.from(raw1).toString('hex')).not.toBe(Buffer.from(raw2).toString('hex'));
  });

  it('AES-256-GCM encrypt → decrypt roundtrip', async () => {
    const x25519Secret = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const kemSecret    = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const salt         = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const iv           = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext    = 'Hello, Post-Quantum World!';

    const clientKey = await deriveKey(x25519Secret, kemSecret, salt);
    const serverKey = await deriveKey(x25519Secret, kemSecret, salt);

    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertextBuf  = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clientKey, plaintextBytes);
    const decryptedBuf   = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, serverKey, ciphertextBuf);

    expect(new TextDecoder().decode(decryptedBuf)).toBe(plaintext);
  });

  it('AES-256-GCM rejects tampered ciphertext (authentication tag failure)', async () => {
    const x25519Secret = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const kemSecret    = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const salt         = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const iv           = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(x25519Secret, kemSecret, salt);
    const plaintextBytes = new TextEncoder().encode('secret message');
    const ciphertextBuf = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);

    // Tamper: flip a byte in the ciphertext
    const tampered = new Uint8Array(ciphertextBuf);
    tampered[0] ^= 0xff;

    await expect(
      globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, tampered)
    ).rejects.toThrow();
  });

  it('AES-256-GCM rejects wrong key (simulates tampered KEM ciphertext)', async () => {
    const x25519Secret = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const kemSecretClient = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const kemSecretServer = globalThis.crypto.getRandomValues(new Uint8Array(32)); // wrong secret
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const iv   = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const clientKey = await deriveKey(x25519Secret, kemSecretClient, salt);
    const serverKey = await deriveKey(x25519Secret, kemSecretServer, salt); // different!

    const plaintextBytes = new TextEncoder().encode('secret message');
    const ciphertextBuf  = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clientKey, plaintextBytes);

    await expect(
      globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, serverKey, ciphertextBuf)
    ).rejects.toThrow();
  });
});
