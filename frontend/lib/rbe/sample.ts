// Random polynomial generation for the RBE demo.
// Uses globalThis.crypto (available in Node ≥ 20 and all modern browsers).

import { Q, N, B } from './params';

function randUint32(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

// Uniform polynomial: coefficients ∈ [0, Q)
// Rejection sampling to avoid modulo bias (Q is not a power of two).
export function sampleUniform(): number[] {
  const poly = new Array<number>(N);
  const mask = 0x3fff; // 14-bit mask — Q < 2^14
  for (let i = 0; i < N; ) {
    const v = randUint32() & mask;
    if (v < Q) poly[i++] = v;
  }
  return poly;
}

// Small polynomial: coefficients ∈ [-B, B] stored as [0, Q) residues.
export function sampleSmall(): number[] {
  const poly = new Array<number>(N);
  const range = 2 * B + 1; // 7 values: -3 … +3
  for (let i = 0; i < N; i++) {
    // rejection-sample to avoid bias
    let v: number;
    do { v = randUint32() % (256 - (256 % range)); } while (v >= 256 - (256 % range));
    const coeff = (v % range) - B; // in [-B, B]
    poly[i] = ((coeff % Q) + Q) % Q;
  }
  return poly;
}

export function polyZero(): number[] {
  return new Array<number>(N).fill(0);
}
