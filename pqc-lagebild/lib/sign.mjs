// ML-DSA-65 (FIPS 204) signatures over the exact bytes of each published file.
// The signature file holds the hex-encoded signature and a trailing newline,
// the same format as frontend/public/cbom.sig.

import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { writeAtomic } from './util.mjs';

export function generateKeyPair() {
  const { secretKey, publicKey } = ml_dsa65.keygen(randomBytes(32));
  return { secretKeyHex: Buffer.from(secretKey).toString('hex'), publicKeyHex: Buffer.from(publicKey).toString('hex') };
}

export function loadSecretKey(path) {
  if (!existsSync(path)) throw new Error(`signing key missing: ${path}`);
  const hex = readFileSync(path, 'utf8').trim();
  const key = Buffer.from(hex, 'hex');
  if (key.length !== ml_dsa65.lengths.secretKey) throw new Error(`signing key has wrong length: ${key.length}`);
  return key;
}

export function publicKeyHexFromSecret(secretKey) {
  return Buffer.from(ml_dsa65.getPublicKey(secretKey)).toString('hex');
}

export function signBytes(bytes, secretKey) {
  return Buffer.from(ml_dsa65.sign(bytes, secretKey)).toString('hex');
}

export function verifyBytes(sigHex, bytes, publicKeyHex) {
  try {
    return ml_dsa65.verify(Buffer.from(sigHex.trim(), 'hex'), bytes, Buffer.from(publicKeyHex.trim(), 'hex'));
  } catch {
    return false;
  }
}

/** Write `content` to `path` and its signature to `path + '.sig'`, then verify the pair. */
export function writeSigned(path, content, secretKey, publicKeyHex) {
  const bytes = Buffer.from(content, 'utf8');
  const sig = signBytes(bytes, secretKey);
  if (publicKeyHex && !verifyBytes(sig, bytes, publicKeyHex)) {
    throw new Error(`fresh signature for ${path} does not verify — refusing to publish`);
  }
  writeAtomic(path, bytes);
  writeAtomic(`${path}.sig`, sig + '\n');
  return sig;
}
