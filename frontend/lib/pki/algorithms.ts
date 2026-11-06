// cbom: ecdsa-p256:pki-playground
// cbom: ml-dsa-44:pki-playground
// cbom: ml-dsa-65:pki-playground
// cbom: slh-dsa-sha2-192s:pki-playground
// cbom: composite-mldsa65-ecdsa-p256-sha512:pki-playground
//
// Signature algorithms of the PKI playground: key generation, signing and
// verification plus the X.509 encodings (AlgorithmIdentifier, public key).
import { p256 } from '@noble/curves/nist.js';
import { ml_dsa44, ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { slh_dsa_sha2_192s } from '@noble/post-quantum/slh-dsa.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { concat, oid, seq, utf8Bytes, type Bytes } from './der';
import { OID } from './oids';
import { ALGS, type AlgId } from './meta';

export { ALGS, algByOid, type AlgId, type AlgInfo } from './meta';

export interface KeyPair {
  alg:       AlgId;
  publicKey: Bytes;   // exactly what goes into subjectPublicKey
  secretKey: Bytes;   // implementation format, never leaves the worker except in the Q-Day lab
}

// Composite constants (draft-ietf-lamps-pq-composite-sigs-19 §2.2, §6)
const COMPOSITE_PREFIX = utf8Bytes('CompositeAlgorithmSignatures2025');
const COMPOSITE_LABEL = utf8Bytes('COMPSIG-MLDSA65-ECDSA-P256-SHA512');
const MLDSA65_PK = 1952;
const MLDSA65_SIG = 3309;

// ── X.509 encodings ───────────────────────────────────────────────────────────

/** AlgorithmIdentifier for signatureAlgorithm / TBSCertificate.signature. */
export function sigAlgId(alg: AlgId): Bytes {
  // All algorithms here have absent parameters (RFC 5758 §3.2, RFC 9881 §2, RFC 9909 §3, composite §5.3)
  return seq(oid(ALGS[alg].oid));
}

/** AlgorithmIdentifier inside SubjectPublicKeyInfo. */
export function spkiAlgId(alg: AlgId): Bytes {
  if (alg === 'ecdsa-p256') return seq(oid(OID.ecPublicKey), oid(OID.prime256v1));
  return seq(oid(ALGS[alg].oid));
}

// ── Operations ────────────────────────────────────────────────────────────────

interface CompositeSecret { seed: Bytes; mldsaSk: Bytes; ecSk: Bytes }

// Composite secret keys are kept as seed ‖ expanded ML-DSA key ‖ ECDSA scalar.
// The draft's interchange format is seed ‖ ECPrivateKey; nothing here exports keys,
// which §3.1.1 explicitly allows.
function packComposite(s: CompositeSecret): Bytes { return concat(s.seed, s.mldsaSk, s.ecSk); }
function unpackComposite(sk: Bytes): CompositeSecret {
  const mlLen = sk.length - 32 - 32;
  return { seed: sk.subarray(0, 32), mldsaSk: sk.subarray(32, 32 + mlLen), ecSk: sk.subarray(32 + mlLen) };
}

function compositeMessage(msg: Bytes, ctx: Bytes = new Uint8Array()): Bytes {
  // M' := Prefix || Label || len(ctx) || ctx || PH(M), PH = SHA-512 (draft §2.2, §6)
  return concat(COMPOSITE_PREFIX, COMPOSITE_LABEL, Uint8Array.of(ctx.length), ctx, sha512(msg));
}

export function keygen(alg: AlgId): KeyPair {
  switch (alg) {
    case 'ecdsa-p256': {
      const sk = p256.utils.randomSecretKey();
      return { alg, secretKey: sk, publicKey: p256.getPublicKey(sk, false) };
    }
    case 'mldsa44': { const k = ml_dsa44.keygen(); return { alg, ...k }; }
    case 'mldsa65': { const k = ml_dsa65.keygen(); return { alg, ...k }; }
    case 'slhdsa192s': { const k = slh_dsa_sha2_192s.keygen(); return { alg, ...k }; }
    case 'composite-mldsa65-p256': {
      // Both components freshly generated (draft §3.1)
      const seed = randomBytes(32);
      const ml = ml_dsa65.keygen(seed);
      const ecSk = p256.utils.randomSecretKey();
      return {
        alg,
        publicKey: concat(ml.publicKey, p256.getPublicKey(ecSk, false)),
        secretKey: packComposite({ seed, mldsaSk: ml.secretKey, ecSk }),
      };
    }
  }
}

export function sign(key: KeyPair, msg: Bytes): Bytes {
  switch (key.alg) {
    // ecdsa-with-SHA256: noble hashes msg with SHA-256 (prehash default); DER Ecdsa-Sig-Value
    case 'ecdsa-p256': return p256.sign(msg, key.secretKey, { format: 'der' });
    // Pure ML-DSA / SLH-DSA with empty context (RFC 9881 §3, RFC 9909 §3)
    case 'mldsa44': return ml_dsa44.sign(msg, key.secretKey);
    case 'mldsa65': return ml_dsa65.sign(msg, key.secretKey);
    case 'slhdsa192s': return slh_dsa_sha2_192s.sign(msg, key.secretKey);
    case 'composite-mldsa65-p256': {
      const { mldsaSk, ecSk } = unpackComposite(key.secretKey);
      const m = compositeMessage(msg);
      const mlSig = ml_dsa65.sign(m, mldsaSk, { context: COMPOSITE_LABEL });
      const ecSig = p256.sign(m, ecSk, { format: 'der' });
      return concat(mlSig, ecSig);
    }
  }
}

export function verify(alg: AlgId, publicKey: Bytes, msg: Bytes, sig: Bytes): boolean {
  try {
    switch (alg) {
      // X.509 verifiers must accept high-S ECDSA signatures; noble rejects them by default
      case 'ecdsa-p256': return p256.verify(sig, msg, publicKey, { format: 'der', lowS: false });
      case 'mldsa44': return ml_dsa44.verify(sig, msg, publicKey);
      case 'mldsa65': return ml_dsa65.verify(sig, msg, publicKey);
      case 'slhdsa192s': return slh_dsa_sha2_192s.verify(sig, msg, publicKey);
      case 'composite-mldsa65-p256': {
        // Valid only if every component signature is valid (draft §3.3)
        if (publicKey.length <= MLDSA65_PK || sig.length <= MLDSA65_SIG) return false;
        const m = compositeMessage(msg);
        const mlOk = ml_dsa65.verify(sig.subarray(0, MLDSA65_SIG), m, publicKey.subarray(0, MLDSA65_PK), { context: COMPOSITE_LABEL });
        if (!mlOk) return false;
        return p256.verify(sig.subarray(MLDSA65_SIG), m, publicKey.subarray(MLDSA65_PK), { format: 'der', lowS: false });
      }
    }
  } catch {
    return false;
  }
}

// ── Composite internals for the Q-Day lab and the tests ───────────────────────

export const composite = {
  message: compositeMessage,
  label: COMPOSITE_LABEL,
  splitPublicKey: (pk: Bytes) => ({ mldsa: pk.subarray(0, MLDSA65_PK), ecdsa: pk.subarray(MLDSA65_PK) }),
  splitSignature: (sig: Bytes) => ({ mldsa: sig.subarray(0, MLDSA65_SIG), ecdsa: sig.subarray(MLDSA65_SIG) }),
  /** The classical half of a composite secret key — what Shor's algorithm would recover. */
  ecdsaSecret: (sk: Bytes) => unpackComposite(sk).ecSk,
};
