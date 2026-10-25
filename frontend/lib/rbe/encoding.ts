// Homomorphic encodings for the Kronecker delta δ_i (paper, Section 3.1).
//
// CRS: A = [A_0 | … | A_{l−1} | A_l], each block A_k ∈ R_q^{n×m}. An identity j is
// encoded as  A − j̃ ⊗ G  with j̃ = (j_0, …, j_{l−1}, 1). For every i, j we need
//
//     (A − j̃ ⊗ G) · H_{δi,j} = A_{δi} − δ_i(j) · G             (Theorem 4)
//
// with a short matrix H_{δi,j}. δ_i(j) = Π_k h_k with h_k = i_k ⊕ j_k ⊕ 1, so we
//   1. encode every h_k:   i_k = 1 → h_k = j_k:      A'_k = A_k,        N_k = e_k ⊗ I
//                          i_k = 0 → h_k = 1 − j_k:  A'_k = A_l − A_k,  N_k = (e_l − e_k) ⊗ I
//      which gives (A − j̃⊗G)·N_k = A'_k − h_k·G,
//   2. multiply the l encodings with the AND chain of Algorithms 1 and 2:
//         C_{l−1} = A'_{l−1},  C_k = A'_k · G⁻¹(C_{k+1}),  A_{δi} = C_0,
//         H2[k] = (h_0 ⋯ h_{k−1}) · Temp_k,  Temp_k = G⁻¹(C_{k+1}),  Temp_{l−1} = I.
//
// Step 1 differs from Algorithms 3–5 of the paper, which build the NOT gate
// multiplicatively as A_k + A_l − 2·A_k·G⁻¹(A_l). Both satisfy Theorem 4; the linear
// gate above has norm 1 instead of growing with m·nR, which keeps the helper keys
// short enough for a 26-bit modulus. (As printed, Algorithm 4 line 9 and
// Algorithm 5 line 11 also apply that gate when i_k = 1 instead of i_k = 0.)
//
// Since C_k and Temp_k depend only on i, the key curator can compute them once
// when identity i registers (the preprocessing of Section 5.1). A helper key is
// then just a sum of precomputed blocks — see helperKeyFromChains().

import type { Ring } from './ring';
import {
  type Mat, type Gadget, mat, at, mulHat, toHat, fromHat, gInv, identityHat, colSlice, scaleMat,
} from './matrix';

export function bit(x: number, k: number): number {
  return (x >> k) & 1;
}

// Block k of the CRS (NTT domain), k = 0 … l
export function crsBlock(Ahat: Mat, k: number, m: number): Mat {
  return colSlice(Ahat, k * m, (k + 1) * m);
}

// A'_k for function index i (NTT domain)
function encodedBit(ring: Ring, Ahat: Mat, i: number, k: number, ell: number, m: number): Mat {
  const Ak = crsBlock(Ahat, k, m);
  if (bit(i, k) === 1) return Ak;
  const Al = crsBlock(Ahat, ell, m);
  return mat(Ak.rows, Ak.cols, Ak.e.map((p, idx) => ring.sub(Al.e[idx], p)));
}

export interface DeltaChain {
  i: number;
  Adelta: Mat;    // A_{δi} ∈ R_q^{n×m}, NTT domain
  temps: Mat[];   // Temp_k ∈ R_q^{m×m}, NTT domain, k = 0 … l−1
}

// EvalPK for δ_i plus the input-independent part of EvalFX
export function deltaChain(ring: Ring, Ahat: Mat, i: number, ell: number, g: Gadget): DeltaChain {
  const m = g.n * g.L;
  const temps: Mat[] = new Array(ell);
  temps[ell - 1] = identityHat(ring, m);
  let C = encodedBit(ring, Ahat, i, ell - 1, ell, m);          // C_{l−1}
  for (let k = ell - 2; k >= 0; k--) {
    temps[k] = toHat(ring, gInv(ring, fromHat(ring, C), g));    // Temp_k = G⁻¹(C_{k+1})
    C = mulHat(ring, encodedBit(ring, Ahat, i, k, ell, m), temps[k]);
  }
  return { i, Adelta: C, temps };
}

// h_k = i_k ⊕ j_k ⊕ 1 and the prefix products p_k = h_0 ⋯ h_{k−1}
function prefixProducts(i: number, j: number, ell: number): number[] {
  const p = new Array<number>(ell);
  let acc = 1;
  for (let k = 0; k < ell; k++) {
    p[k] = acc;
    acc *= bit(i, k) ^ bit(j, k) ^ 1;
  }
  return p;
}

// Full H_{δi,j} ∈ R_q^{(l+1)m × m} (NTT domain). Only needed to verify Theorem 4;
// the scheme itself never materialises it.
export function deltaH(ring: Ring, chain: DeltaChain, j: number, ell: number, m: number): Mat {
  const p = prefixProducts(chain.i, j, ell);
  const blocks: Mat[] = [];
  const last = mat(m, m, Array.from({ length: m * m }, () => ring.zero()));
  for (let k = 0; k < ell; k++) {
    const H2k = p[k] ? chain.temps[k] : scaleMat(ring, chain.temps[k], 0);
    const sign = bit(chain.i, k) === 1 ? 1 : -1;
    blocks.push(scaleMat(ring, H2k, sign));
    if (bit(chain.i, k) === 0) last.e.forEach((acc, idx) => ring.addInto(acc, H2k.e[idx]));
  }
  blocks.push(last);
  return mat((ell + 1) * m, m, blocks.flatMap((b) => b.e));
}

export interface RegisteredChain {
  i: number;
  Y: Mat[];   // Y_k = Temp_k · G⁻¹(pk) ∈ R_q^{m×k}, NTT domain, k = 0 … l−1
}

// Precompute Temp_k · G⁻¹(pk_i) for a registering identity
export function registeredChain(ring: Ring, chain: DeltaChain, pk: Mat, g: Gadget): RegisteredChain {
  const pkDigits = toHat(ring, gInv(ring, pk, g));
  return { i: chain.i, Y: chain.temps.map((T) => mulHat(ring, T, pkDigits)) };
}

// hsk_t = Σ_j H_{δj,t} · G⁻¹(pk_j) over all registered j (coefficient domain).
// With H = N·H2 (N from step 1, signs from the registered identity j):
//   block k = ±p_k·Y_k (minus where j_k = 0),  block l = Σ_{k: j_k = 0} p_k·Y_k.
export function helperKeyFromChains(
  ring: Ring, chains: RegisteredChain[], target: number, ell: number, m: number, kLen: number,
): Mat {
  const rows = (ell + 1) * m;
  const acc = Array.from({ length: rows * kLen }, () => ring.zero());
  for (const c of chains) {
    const p = prefixProducts(c.i, target, ell);
    for (let k = 0; k < ell; k++) {
      if (!p[k]) continue;
      const positive = bit(c.i, k) === 1;
      for (let r = 0; r < m; r++) {
        for (let col = 0; col < kLen; col++) {
          const y = at(c.Y[k], r, col);
          const dst = acc[(k * m + r) * kLen + col];
          ring.addInto(dst, positive ? y : ring.neg(y));
          if (!positive) ring.addInto(acc[(ell * m + r) * kLen + col], y);
        }
      }
    }
  }
  return fromHat(ring, mat(rows, kLen, acc));
}
