// Matrices over R_q and the gadget matrix G = I_n ⊗ (1, d, d², …, d^{L−1}).
//
// A matrix stores its entries row-major as polynomials. Whether those are in the
// coefficient or the NTT domain is up to the caller; functions that care say so.

import type { Ring } from './ring';

export interface Mat {
  rows: number;
  cols: number;
  e: Uint32Array[];   // rows·cols polynomials, row-major
}

export function mat(rows: number, cols: number, e: Uint32Array[]): Mat {
  if (e.length !== rows * cols) throw new Error(`expected ${rows * cols} entries, got ${e.length}`);
  return { rows, cols, e };
}

export function zeroMat(ring: Ring, rows: number, cols: number): Mat {
  return mat(rows, cols, Array.from({ length: rows * cols }, () => ring.zero()));
}

export const at = (A: Mat, r: number, c: number): Uint32Array => A.e[r * A.cols + c];

export function toHat(ring: Ring, A: Mat): Mat {
  return mat(A.rows, A.cols, A.e.map((p) => ring.ntt(p)));
}

export function fromHat(ring: Ring, A: Mat): Mat {
  return mat(A.rows, A.cols, A.e.map((p) => ring.intt(p)));
}

export function addMat(ring: Ring, A: Mat, B: Mat): Mat {
  return mat(A.rows, A.cols, A.e.map((p, i) => ring.add(p, B.e[i])));
}

export function subMat(ring: Ring, A: Mat, B: Mat): Mat {
  return mat(A.rows, A.cols, A.e.map((p, i) => ring.sub(p, B.e[i])));
}

export function scaleMat(ring: Ring, A: Mat, c: number): Mat {
  return mat(A.rows, A.cols, A.e.map((p) => ring.scale(p, c)));
}

// Product of two NTT-domain matrices
export function mulHat(ring: Ring, A: Mat, B: Mat): Mat {
  if (A.cols !== B.rows) throw new Error(`dimension mismatch ${A.rows}×${A.cols} · ${B.rows}×${B.cols}`);
  const out: Uint32Array[] = [];
  for (let i = 0; i < A.rows; i++) {
    for (let j = 0; j < B.cols; j++) {
      const acc = new Float64Array(ring.nR);
      for (let t = 0; t < A.cols; t++) ring.macHat(acc, at(A, i, t), at(B, t, j));
      out.push(ring.reduce(acc));
    }
  }
  return mat(A.rows, B.cols, out);
}

// Product of two coefficient-domain matrices
export function mulMat(ring: Ring, A: Mat, B: Mat): Mat {
  return fromHat(ring, mulHat(ring, toHat(ring, A), toHat(ring, B)));
}

// Horizontal concatenation [A | B]
export function hcat(...parts: Mat[]): Mat {
  const rows = parts[0].rows;
  const cols = parts.reduce((s, p) => s + p.cols, 0);
  const e: Uint32Array[] = [];
  for (let r = 0; r < rows; r++) {
    for (const P of parts) for (let c = 0; c < P.cols; c++) e.push(at(P, r, c));
  }
  return mat(rows, cols, e);
}

// Columns [from, to) of A
export function colSlice(A: Mat, from: number, to: number): Mat {
  const e: Uint32Array[] = [];
  for (let r = 0; r < A.rows; r++) for (let c = from; c < to; c++) e.push(at(A, r, c));
  return mat(A.rows, to - from, e);
}

// Rows [from, to) of A
export function rowSlice(A: Mat, from: number, to: number): Mat {
  return mat(to - from, A.cols, A.e.slice(from * A.cols, to * A.cols));
}

export function vcat(...parts: Mat[]): Mat {
  return mat(parts.reduce((s, p) => s + p.rows, 0), parts[0].cols, parts.flatMap((p) => p.e));
}

// ── Gadget ────────────────────────────────────────────────────────────────────

export interface Gadget {
  n: number;   // rows of G
  d: number;   // base
  L: number;   // digits per entry
}

// G = I_n ⊗ (1, d, …, d^{L−1}) ∈ R_q^{n × nL} (constant polynomials)
export function gadgetMatrix(ring: Ring, g: Gadget): Mat {
  const m = g.n * g.L;
  const e: Uint32Array[] = [];
  for (let r = 0; r < g.n; r++) {
    for (let c = 0; c < m; c++) {
      const p = ring.zero();
      if (Math.floor(c / g.L) === r) p[0] = ring.fromSigned(g.d ** (c % g.L));
      e.push(p);
    }
  }
  return mat(g.n, m, e);
}

// Balanced base-d digits of every coefficient: x = Σ_t digit_t · d^t over Z,
// digit_t ∈ (−d/2, d/2]. Returns L polynomials (as residues mod q).
export function decomposePoly(ring: Ring, a: Uint32Array, g: Gadget): Uint32Array[] {
  const digits = Array.from({ length: g.L }, () => ring.zero());
  const half = g.d / 2;
  for (let i = 0; i < ring.nR; i++) {
    let x = ring.centered(a[i]);
    for (let t = 0; t < g.L; t++) {
      let r = ((x % g.d) + g.d) % g.d;
      if (r > half) r -= g.d;
      digits[t][i] = ring.fromSigned(r);
      x = (x - r) / g.d;
    }
    if (x !== 0) throw new Error('gadget decomposition needs more digits');
  }
  return digits;
}

// G⁻¹(X) for X ∈ R_q^{n × t}: the (nL) × t matrix of digits with G · G⁻¹(X) = X
export function gInv(ring: Ring, X: Mat, g: Gadget): Mat {
  if (X.rows !== g.n) throw new Error('G⁻¹ expects n rows');
  const out: Uint32Array[] = new Array(g.n * g.L * X.cols);
  for (let r = 0; r < X.rows; r++) {
    for (let c = 0; c < X.cols; c++) {
      const digits = decomposePoly(ring, at(X, r, c), g);
      for (let t = 0; t < g.L; t++) out[(r * g.L + t) * X.cols + c] = digits[t];
    }
  }
  return mat(g.n * g.L, X.cols, out);
}

export function identityHat(ring: Ring, size: number): Mat {
  // The constant 1 is all-ones in the NTT domain
  const one = ring.ntt(Uint32Array.from({ length: ring.nR }, (_, i) => (i === 0 ? 1 : 0)));
  const e: Uint32Array[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) e.push(r === c ? one.slice() : ring.zero());
  return mat(size, size, e);
}

// Largest centred coefficient over all entries (coefficient domain)
export function matNorm(ring: Ring, A: Mat): number {
  return A.e.reduce((m, p) => Math.max(m, ring.infNorm(p)), 0);
}
