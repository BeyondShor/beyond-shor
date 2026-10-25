// Randomness for the RBE demo.
//   - secrets and errors: centred binomial distribution from the system CSPRNG
//   - the CRS: expanded from a public seed with SHAKE-256, so anyone can
//     recompute it and check that the key curator holds no hidden structure

import { shake256 } from '@noble/hashes/sha3.js';
import type { Ring } from './ring';

function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  // getRandomValues is limited to 65536 bytes per call
  for (let off = 0; off < len; off += 65536) {
    globalThis.crypto.getRandomValues(out.subarray(off, Math.min(len, off + 65536)));
  }
  return out;
}

export function randomSeed(): Uint8Array {
  return randomBytes(32);
}

// Centred binomial distribution CBD_η: Σ η bits − Σ η bits, so values lie in [−η, η]
export function sampleCbd(ring: Ring, eta: number): Uint32Array {
  const bytes = randomBytes(Math.ceil((ring.nR * 2 * eta) / 8));
  const out = new Uint32Array(ring.nR);
  let bit = 0;
  const next = () => { const b = (bytes[bit >> 3] >> (bit & 7)) & 1; bit++; return b; };
  for (let i = 0; i < ring.nR; i++) {
    let v = 0;
    for (let j = 0; j < eta; j++) v += next();
    for (let j = 0; j < eta; j++) v -= next();
    out[i] = ring.fromSigned(v);
  }
  return out;
}

// Uniform polynomial from a byte stream by rejection sampling on 26-bit chunks
function uniformFromStream(ring: Ring, stream: () => number): Uint32Array {
  const bits = Math.ceil(Math.log2(ring.q));
  const mask = 2 ** bits - 1;
  const out = new Uint32Array(ring.nR);
  for (let i = 0; i < ring.nR; ) {
    const v = stream() & mask;
    if (v < ring.q) out[i++] = v;
  }
  return out;
}

export function sampleUniform(ring: Ring): Uint32Array {
  // ~0.01 % rejections for q = 2^26 − 4095; 2× headroom is plenty
  const words = new Uint32Array(randomBytes(ring.nR * 8).buffer);
  let i = 0;
  return uniformFromStream(ring, () => {
    if (i >= words.length) { const more = new Uint32Array(randomBytes(4).buffer); return more[0]; }
    return words[i++];
  });
}

// Deterministically expand `count` uniform polynomials from a public seed
export function expandUniform(ring: Ring, seed: Uint8Array, count: number): Uint32Array[] {
  const words = ring.nR * count * 2;  // 2× headroom for rejections
  const bytes = shake256(seed, { dkLen: words * 4 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 0;
  const stream = () => {
    if (i >= words) throw new Error('XOF stream exhausted');
    return view.getUint32(4 * i++, true);
  };
  const out: Uint32Array[] = [];
  for (let c = 0; c < count; c++) out.push(uniformFromStream(ring, stream));
  return out;
}
