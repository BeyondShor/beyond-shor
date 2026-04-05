// RBE Demo — system parameters
// q = 12289 is the standard NewHope/Kyber-derivable NTT-prime (14-bit):
//   q - 1 = 12288 = 2^12 * 3, so 2N = 512 divides q-1 for negacyclic NTT.
// These parameters are NOT cryptographically secure. Educational use only.

export const Q     = 12289;  // Ring modulus
export const N     = 1024;   // Polynomial degree; ring R_q = Z_q[X]/(X^N + 1)
export const B     = 3;      // Small-polynomial coefficient bound, coeff ∈ [-B, B]
export const N_MAX = 3;      // Maximum users per demo session (Alice, Bob, Charlie)
export const ENCODE = (Q + 1) >> 1; // ≈ q/2 = 6145; used to encode a '1' bit

// ── Primitive root and NTT twiddle factor ────────────────────────────────────

function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  base = ((base % mod) + mod) % mod;
  while (exp > 0) {
    if (exp & 1) result = result * base % mod;
    base = base * base % mod;
    exp >>>= 1;
  }
  return result;
}

// g = 11 is a well-known primitive root mod 12289 (used in NewHope).
// Verified: 11^((q-1)/2) ≡ -1 and 11^((q-1)/3) ≢ 1 mod q.
const G = 11;

// PSI is a primitive 2N-th (512th) root of unity mod q.
// PSI^(2N) ≡ 1 and PSI^N ≡ -1 (mod q) — required for negacyclic NTT.
export const PSI: number = modPow(G, (Q - 1) / (2 * N), Q); // = 11^6 mod 12289 for N=1024
