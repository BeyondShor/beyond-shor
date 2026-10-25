// Parameters for the RBE demo — the base construction of
// Zhang, Ding, Malavolta, Döttling: "Fast and Compact Lattice-Based
// Registration-Based Encryption", ePrint 2026/628, Section 3.
//
// Notation follows the paper:
//   R_q = Z_q[X]/(X^nR + 1)   ring
//   n                          rows of the CRS blocks A_k ∈ R_q^{n×m}
//   m = n·L                    width of the gadget matrix G = I_n ⊗ (1, d, …, d^{L−1})
//   k                          length of sk = (−s, 1) ∈ R^k
//   l                          identity length in bits (identities are 0 … 2^l − 1)
//
// The modulus is a 26-bit NTT-friendly prime so that every product of two
// residues stays below 2^53 and plain JavaScript numbers remain exact.
// That is far smaller than the 59-bit modulus in the paper (Section 5.2), which
// is why these parameters carry no security claim — see SECURITY_NOTE in the UI.

export interface RbeParams {
  q:    number;   // prime modulus, q ≡ 1 (mod 2·nR)
  nR:   number;   // ring degree (power of two)
  n:    number;   // module rank of the CRS blocks
  k:    number;   // secret-key length
  logD: number;   // gadget base d = 2^logD (balanced digits, d ≥ 4)
  ell:  number;   // identity bits l
  eta:  number;   // centred binomial parameter for secrets and errors
  nMax: number;   // users per demo session
}

// Chosen by measurement (see __tests__/rbe.test.ts). The noise is dominated by
// e0·(hsk·sk), and ‖hsk·sk‖ varies by about 3× between sessions, so the margin
// below q/4 has to hold for the unlucky sessions, not the median one. With
// q < 2^26, d = 8 and CBD_1: nR = 256 keeps every measured session at ≥ 11σ
// (median ≈ 30σ); nR = 512 ranges from ≈ 3σ to 15σ and occasionally decrypts
// wrongly. nR = 1024 or a module rank n = 2 would need a larger modulus.
export const PARAMS: RbeParams = {
  q:    67104769,  // 2^26 − 4095, q − 1 = 2^12 · 16383
  nR:   256,
  n:    1,
  k:    2,
  logD: 3,
  ell:  6,
  eta:  1,
  nMax: 3,
};

export interface Derived {
  d:     number;  // gadget base
  L:     number;  // digits per coefficient
  m:     number;  // n · L
  width: number;  // (l + 1) · m — columns of the CRS A = [A_0 | … | A_l]
  half:  number;  // ⌊q/2⌋, used to encode a message bit
}

export function derive(p: RbeParams): Derived {
  const d = 2 ** p.logD;
  // Balanced digits lie in (−d/2, d/2]; each step shrinks |x| to at most (|x| + d/2)/d.
  // Count the steps the worst case |x| = ⌊q/2⌋ needs to reach zero.
  let L = 0;
  for (let b = Math.floor(p.q / 2); b > 0; b = Math.floor((b + d / 2) / d)) L++;
  const m = p.n * L;
  return { d, L, m, width: (p.ell + 1) * m, half: Math.floor(p.q / 2) };
}
