// RBE core algorithms.
//
// Construction summary (simplified, educational):
//
//   Setup:   a ← R_q uniform;  aInv = a^{-1} mod (X^N+1, q)  [KC trapdoor]
//   KeyGen:  sk ← small;  e ← small;  pk = a·sk + e          [Ring-LWE]
//   Register: mpkAgg += pk
//   HelpKey: hsk_t = aInv · (mpkAgg - pk_t)                  [trapdoor preimage]
//             → satisfies  a · hsk_t = mpkAgg - pk_t  (exactly)
//   Encrypt:  c0 = r·a ;  c1 = r·mpkAgg + encode(msg)
//   Decrypt:  temp   = c1 - c0·hsk_t  = r·pk_t + encode(msg)
//             result = temp - c0·sk_t  = r·e_t  + encode(msg) ≈ encode(msg)
//
// Two-factor property:
//   · hsk alone → Ring-LWE ciphertext of msg under pk_t (still encrypted).
//   · sk alone  → large "other-users" noise; cannot decode.
//   · both      → noise collapses to r·e_t  (small) → correct decoding.
//   Requires ≥ 2 registered users for the two-factor guarantee.

import { Q, N, N_MAX, ENCODE } from './params';
import { polyMul, polyAdd, polySub, polyInv } from './poly';
import { sampleUniform, sampleSmall, polyZero } from './sample';

// ── Setup ─────────────────────────────────────────────────────────────────────

export interface KcSetupResult {
  a:    number[];   // public CRS element
  aInv: number[];   // KC-private trapdoor (a^{-1} mod ring)
}

export function rbeSetup(): KcSetupResult {
  for (;;) {
    try {
      const a    = sampleUniform();
      const aInv = polyInv(a);
      return { a, aInv };
    } catch {
      // a was not invertible mod q — resample (probability ≈ 2%)
    }
  }
}

// ── KeyGen (runs client-side in browser) ─────────────────────────────────────

export interface KeyPair {
  pk: number[];  // public key — sent to KC
  sk: number[];  // secret key — NEVER leaves the browser
}

export function rbeKeyGen(a: number[]): KeyPair {
  const sk = sampleSmall();
  const e  = sampleSmall();
  const pk = polyAdd(polyMul(a, sk), e); // pk = a·sk + e
  return { pk, sk };
}

// ── Register (runs server-side in KC) ────────────────────────────────────────

export function rbeRegister(
  mpkAgg: number[],
  pk: number[],
): number[] {
  return polyAdd(mpkAgg, pk); // mpkAgg += pk
}

// ── Helper key (runs server-side in KC, uses trapdoor) ────────────────────────

// hsk_t = aInv · (mpkAgg − pk_t)
// This satisfies: a · hsk_t = mpkAgg − pk_t  (exact ring equality)
export function rbeHelperKey(
  aInv:    number[],
  mpkAgg:  number[],
  pkTarget: number[],
): number[] {
  return polyMul(aInv, polySub(mpkAgg, pkTarget));
}

// ── Message encoding  (N coefficients → up to N/8 = 32 ASCII characters) ────

// Bit j of character i → coefficient [8·i + j] += ENCODE  if that bit is 1
function encodeMsgInto(msg: string, poly: number[]): void {
  const maxChars = N >> 3; // 32
  for (let ci = 0; ci < Math.min(msg.length, maxChars); ci++) {
    const ch = msg.charCodeAt(ci);
    for (let bi = 0; bi < 8; bi++) {
      if ((ch >> bi) & 1) {
        const idx = ci * 8 + bi;
        poly[idx] = (poly[idx] + ENCODE) % Q;
      }
    }
  }
}

function decodeMsg(poly: number[]): string {
  const maxChars = N >> 3;
  let result = '';
  for (let ci = 0; ci < maxChars; ci++) {
    let byte = 0;
    for (let bi = 0; bi < 8; bi++) {
      const v = poly[ci * 8 + bi];
      // Round to nearest: 0 if close to 0 or Q, 1 if close to Q/2
      if (Math.round((2 * v) / Q) % 2 === 1) byte |= 1 << bi;
    }
    if (byte === 0) break; // null terminator
    result += String.fromCharCode(byte);
  }
  return result;
}

// ── Encrypt (runs client-side in browser) ────────────────────────────────────

export interface Ciphertext {
  c0: number[]; // r·a
  c1: number[]; // r·mpkAgg + encode(msg)
}

export function rbeEncrypt(
  a:       number[],
  mpkAgg:  number[],
  msg:     string,
): Ciphertext {
  const r  = sampleSmall();
  const c0 = polyMul(r, a);
  const c1 = polyMul(r, mpkAgg);
  encodeMsgInto(msg, c1);
  return { c0, c1 };
}

// ── Decrypt  (runs client-side in browser, TWO steps) ────────────────────────

// Step 1: apply hsk — result is still Ring-LWE ciphertext under pk_t
export function rbeDecryptStep1(
  c0:  number[],
  c1:  number[],
  hsk: number[],
): number[] {
  // temp = c1 - c0·hsk = r·pk_t + encode(msg)
  return polySub(c1, polyMul(c0, hsk));
}

// Step 2: apply sk — noise collapses to r·e_t, decode follows
export function rbeDecryptStep2(
  c0:   number[],
  temp: number[],
  sk:   number[],
): { result: number[]; msg: string } {
  // result = temp - c0·sk = r·e_t + encode(msg)  ≈ encode(msg)
  const result = polySub(temp, polyMul(c0, sk));
  return { result, msg: decodeMsg(result) };
}

// ── Noise estimate helper (for UI display) ────────────────────────────────────

// Returns the maximum absolute coefficient after centering to (-Q/2, Q/2]
export function polyMaxNoise(poly: number[]): number {
  const half = Q >> 1;
  let max = 0;
  for (const v of poly) {
    const centered = v > half ? v - Q : v;
    if (Math.abs(centered) > max) max = Math.abs(centered);
  }
  return max;
}
