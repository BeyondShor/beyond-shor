// G-lattice trapdoor (MP12-inspired) and identity hash for the RBE demo.
//
// TrapGen constructs the key duo (a0, a1) such that a0·r + a1 = 1 in R_q.
// This is the "short preimage" trapdoor used by the KC.
//
// SamplePre (simplified, NOT Gaussian):
//   Given r, target identity id_t, and target = mpkAgg − pk_t, produces
//   (hsk0, hsk1) satisfying  a0·hsk0 + (a1 + H(id_t))·hsk1 = target.
//
//   Derivation:
//     Set hsk0 = r·hsk1.  Then:
//       a0·r·hsk1 + (a1 + H(id))·hsk1 = hsk1·(a0·r + a1 + H(id))
//                                      = hsk1·(1 + H(id))
//     So hsk1 = (1 + H(id))⁻¹ · target  and  hsk0 = r · hsk1.
//
//   Note: this gives an EXACT preimage (not a Gaussian-short one).
//   The real paper uses a proper lattice sampler; for the interactive demo
//   the exactness is fine since correctness is what we want to show.

import { Q, N } from './params';
import { polyAdd, polyMul, polyInv } from './poly';
import { sampleUniform, sampleSmall } from './sample';

// ── Unit polynomial 1 ∈ R_q ──────────────────────────────────────────────────

export function polyOne(): number[] {
  const p = new Array<number>(N).fill(0);
  p[0] = 1;
  return p;
}

// ── Deterministic identity hash H : string → R_q ─────────────────────────────
//
// Produces a reproducible uniform-looking polynomial for any ASCII identity.
// Uses a linear congruential generator seeded from an FNV-1a hash of the id.
// NOT a cryptographic hash — purely illustrative for the demo.

export function hashToRing(id: string): number[] {
  const bytes = new TextEncoder().encode(id);

  // FNV-1a 32-bit seed
  let state = 2166136261;
  for (const b of bytes) {
    state = (Math.imul(state ^ b, 16777619)) >>> 0;
  }

  // LCG expansion with rejection sampling to stay in [0, Q)
  const mask = 0x3fff; // 14-bit mask — Q < 2^14
  const poly = new Array<number>(N);
  let i = 0;
  while (i < N) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const v = state & mask;
    if (v < Q) poly[i++] = v;
  }
  return poly;
}

// ── TrapGen ───────────────────────────────────────────────────────────────────

export interface TrapGenResult {
  a0: number[];   // public CRS element for KeyGen / Step-2 decryption
  a1: number[];   // complement: a0·r + a1 = 1 in R_q
  r:  number[];   // KC private trapdoor (short polynomial)
}

export function trapGen(): TrapGenResult {
  const a0 = sampleUniform();
  const r  = sampleSmall();
  // a1 = 1 − a0·r  →  a0·r + a1 = 1  (the trapdoor identity)
  const a1 = polyAdd(polyOne(), polyMul(a0.map(v => v === 0 ? 0 : Q - v), r));
  return { a0, a1, r };
}

// ── SamplePre ─────────────────────────────────────────────────────────────────
//
// Returns (hsk0, hsk1) such that:
//   a0·hsk0 + (a1 + H(id_target))·hsk1 = target
// where target = mpkAgg − pk_target.

export function samplePre(
  r:      number[],   // KC trapdoor
  id:     string,     // target identity string
  target: number[],   // mpkAgg − pk_target
): [number[], number[]] {
  const hId  = hashToRing(id);
  const gId  = polyAdd(polyOne(), hId);   // 1 + H(id)
  const gInv = polyInv(gId);              // throws if not invertible (extremely rare)
  const hsk1 = polyMul(gInv, target);
  const hsk0 = polyMul(r, hsk1);
  return [hsk0, hsk1];
}
