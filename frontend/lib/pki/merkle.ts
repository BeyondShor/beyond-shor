// Merkle trees as in RFC 9162 §2.1 (Certificate Transparency v2), also the basis
// of Merkle Tree Certificates (draft-ietf-plants-merkle-tree-certs-08 §4).
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, equalBytes, type Bytes } from './der';

export const HASH_SIZE = 32;

export const leafHash = (entry: Bytes) => sha256(concat(Uint8Array.of(0x00), entry));
const nodeHash = (l: Bytes, r: Bytes) => sha256(concat(Uint8Array.of(0x01), l, r));

/** Largest power of two strictly smaller than n (n ≥ 2). */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

export class MerkleTree {
  private readonly leaves: Bytes[];
  private readonly memo = new Map<string, Bytes>();

  constructor(leafHashes: Bytes[]) { this.leaves = leafHashes; }

  get size() { return this.leaves.length; }

  /** MTH(D[start:end]) */
  hash(start = 0, end = this.leaves.length): Bytes {
    const n = end - start;
    if (n === 0) return sha256(new Uint8Array());
    if (n === 1) return this.leaves[start];
    const key = `${start}:${end}`;
    const cached = this.memo.get(key);
    if (cached) return cached;
    const k = splitPoint(n);
    const h = nodeHash(this.hash(start, start + k), this.hash(start + k, end));
    this.memo.set(key, h);
    return h;
  }

  /** PATH(m, D[start:end]) from RFC 9162 §2.1.3.1, ordered from the leaf upward. */
  inclusionProof(index: number, start = 0, end = this.leaves.length): Bytes[] {
    const n = end - start;
    const m = index - start;
    if (m < 0 || m >= n) throw new Error('index outside subtree');
    if (n === 1) return [];
    const k = splitPoint(n);
    return m < k
      ? [...this.inclusionProof(index, start, start + k), this.hash(start + k, end)]
      : [...this.inclusionProof(index, start + k, end), this.hash(start, start + k)];
  }
}

/** BIT_CEIL(x): smallest power of two ≥ x. */
function bitCeil(x: number): number {
  let p = 1;
  while (p < x) p *= 2;
  return p;
}

/** draft-ietf-plants-merkle-tree-certs-08 §4.1 */
export function isValidSubtree(start: number, end: number): boolean {
  if (start > end) return false;
  return start % bitCeil(end - start) === 0;
}

/**
 * Evaluate a subtree inclusion proof (draft-08 §4.3.2, same as RFC 9162 §2.1.3.2):
 * returns the expected subtree hash, or null if the proof is malformed.
 */
export function evaluateInclusionProof(proof: Bytes[], index: number, entryHash: Bytes, start: number, end: number): Bytes | null {
  if (!isValidSubtree(start, end) || index < start || index >= end) return null;
  let fn = index - start;
  let sn = end - start - 1;
  let r = entryHash;
  for (const p of proof) {
    if (sn === 0) return null;
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      while ((fn & 1) === 0) { fn >>= 1; sn >>= 1; }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 ? r : null;
}

export function verifyInclusion(proof: Bytes[], index: number, entryHash: Bytes, start: number, end: number, subtreeHash: Bytes): boolean {
  const r = evaluateInclusionProof(proof, index, entryHash, start, end);
  return r !== null && equalBytes(r, subtreeHash);
}

/** Upper bound for a proof over a subtree of n entries: ⌈log₂ n⌉ hashes. */
export function maxProofHashes(n: number): number {
  return n <= 1 ? 0 : Math.ceil(Math.log2(n));
}
