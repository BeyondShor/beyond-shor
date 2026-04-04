// RBE core algorithms — Option B: identity-specific encryption.
//
// Construction summary:
//
//   Setup (KC):
//     a0 ← uniform;  r ← small;  a1 = 1 − a0·r          [trapdoor]
//     Relation:  a0·r + a1 = 1 in R_q
//
//   KeyGen (client):
//     sk ← small;  e ← small;  pk = a0·sk + e            [Ring-LWE]
//
//   Register (KC):
//     mpkAgg += pk
//
//   HelpKey (KC → user id_t):
//     target = mpkAgg − pk_t
//     g_t = 1 + H(id_t);  hsk1 = g_t⁻¹ · target;  hsk0 = r · hsk1
//     → a0·hsk0 + (a1 + H(id_t))·hsk1 = target  ✓
//
//   Encrypt (client, to id_target):
//     r_e ← small
//     c0_0 = r_e · a0
//     c0_1 = r_e · (a1 + H(id_target))   ← identity binding
//     c1   = r_e · mpkAgg + encode(msg)
//
//   Decrypt (two factors):
//     Step 1 (hsk):  temp = c1 − (c0_0·hsk0 + c0_1·hsk1) = r_e·pk_t + encode(msg)
//     Step 2 (sk):   result = temp − c0_0·sk  = r_e·e_t + encode(msg) ≈ encode(msg)
//
//   Why Charlie cannot decrypt Bob's message:
//     c0_1 is bound to H("bob").  Applying hsk_charlie (bound to H("charlie")) in Step 1
//     produces  r_e · g_charlie⁻¹·(mpkAgg−pk_charlie)·g_bob  instead of
//     r_e·(mpkAgg−pk_charlie).  Since g_bob ≠ g_charlie this is large/wrong polynomial,
//     and the subsequent sk step leaves irrecoverable noise.

import { Q, N, N_MAX, ENCODE } from './params';
import { polyMul, polyAdd, polySub } from './poly';
import { sampleSmall, polyZero } from './sample';
import { trapGen, samplePre, hashToRing, polyOne } from './trapgen';

// ── Setup ─────────────────────────────────────────────────────────────────────

export interface KcSetupResult {
  a0: number[];   // public CRS — used for KeyGen and Step-2 decryption
  a1: number[];   // complement — used for identity-specific encryption
  r:  number[];   // KC trapdoor (private, stays on server)
}

export function rbeSetup(): KcSetupResult {
  return trapGen();
}

// ── KeyGen (runs client-side in browser) ─────────────────────────────────────

export interface KeyPair {
  pk: number[];  // public key — sent to KC
  sk: number[];  // secret key — NEVER leaves the browser
}

export function rbeKeyGen(a0: number[]): KeyPair {
  const sk = sampleSmall();
  const e  = sampleSmall();
  const pk = polyAdd(polyMul(a0, sk), e);  // pk = a0·sk + e
  return { pk, sk };
}

// ── Register (runs server-side in KC) ────────────────────────────────────────

export function rbeRegister(mpkAgg: number[], pk: number[]): number[] {
  return polyAdd(mpkAgg, pk);
}

// ── Helper key (runs server-side in KC, uses trapdoor r) ─────────────────────
//
// Returns (hsk0, hsk1) bound to id_target.
// Satisfies: a0·hsk0 + (a1 + H(id_target))·hsk1 = mpkAgg − pk_target

export interface HskPair {
  hsk0: number[];
  hsk1: number[];
}

export function rbeHelperKey(
  r:        number[],
  mpkAgg:   number[],
  pkTarget: number[],
  targetId: string,
): HskPair {
  const target = polySub(mpkAgg, pkTarget);
  const [hsk0, hsk1] = samplePre(r, targetId, target);
  return { hsk0, hsk1 };
}

// ── Message encoding ──────────────────────────────────────────────────────────

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
      if (Math.round((2 * v) / Q) % 2 === 1) byte |= 1 << bi;
    }
    if (byte === 0) break;
    result += String.fromCharCode(byte);
  }
  return result;
}

// ── Encrypt (runs client-side in browser) ────────────────────────────────────

export interface Ciphertext {
  c0_0: number[];  // r_e · a0
  c0_1: number[];  // r_e · (a1 + H(id_target)) — identity binding
  c1:   number[];  // r_e · mpkAgg + encode(msg)
}

export function rbeEncrypt(
  a0:       number[],
  a1:       number[],
  mpkAgg:   number[],
  msg:      string,
  targetId: string,
): Ciphertext {
  const r_e  = sampleSmall();
  const hId  = hashToRing(targetId);
  const a1h  = polyAdd(a1, hId);           // a1 + H(id_target)
  const c0_0 = polyMul(r_e, a0);
  const c0_1 = polyMul(r_e, a1h);
  const c1   = polyMul(r_e, mpkAgg);
  encodeMsgInto(msg, c1);
  return { c0_0, c0_1, c1 };
}

// ── Decrypt (runs client-side in browser, TWO steps) ─────────────────────────

// Step 1: apply hsk pair — reduces to Ring-LWE encryption under pk_target
// If hsk is for the CORRECT identity: result = r_e·pk_target + encode(msg)
// If hsk is for the WRONG identity:  result = large garbled polynomial
export function rbeDecryptStep1(
  c0_0: number[],
  c0_1: number[],
  hsk0: number[],
  hsk1: number[],
  c1:   number[],
): number[] {
  const inner = polyAdd(polyMul(c0_0, hsk0), polyMul(c0_1, hsk1));
  return polySub(c1, inner);
}

// Step 2: apply sk — noise collapses to r_e·e, decode follows
export function rbeDecryptStep2(
  c0_0: number[],
  temp: number[],
  sk:   number[],
): { result: number[]; msg: string } {
  const result = polySub(temp, polyMul(c0_0, sk));
  return { result, msg: decodeMsg(result) };
}

// ── Noise estimate helper (for UI display) ────────────────────────────────────

export function polyMaxNoise(poly: number[]): number {
  const half = Q >> 1;
  let max = 0;
  for (const v of poly) {
    const centered = v > half ? v - Q : v;
    if (Math.abs(centered) > max) max = Math.abs(centered);
  }
  return max;
}
